// 챔버K v2 웹 → 장비 명령. 계약은 챔버K v2 common/messages.py 독스트링(Command).
// 상태: pending(만듦) → sent(보냄) → accepted·rejected(장비 cmd_result) · expired(웹이 보내지 못하고 만료)
// - 보내기는 차지(조건부 UPDATE pending → sent) 한 것만 — SSE·POST 응답이 같은 명령을 함께 차지하지 않는다.
// - sent 인데 결과가 없으면 POST 응답으로 다시 보낸다(장비는 같은 id 를 한 번만 실행하고 같은 cmd_result 를 다시 보낸다).
// - 만료는 따로 작업 없이 ingest·stream·명령 만들기·관리 화면 읽기 때 같이.
import { ops2Db } from "@/lib/ops2/db";

export const COMMAND_TTL_MS = 30_000;          // 명령 유효 시간(웹 시계)
const RESEND_AFTER_MS = 3_000;                 // sent 인데 결과가 없으면 이만큼 뒤 POST 응답으로 다시
const RESEND_UNTIL_MS = 5 * 60_000;            // expires_at_server 뒤 이만큼까지만 다시

/** 웹 설정 묶음 commands[] 한 항목(필요한 것만) */
export type CommandDef = { kind: string; role?: unknown; sources?: unknown; args?: unknown };

/** 묶음에서 웹이 낼 수 있는 명령 정의 — 없거나 sources 에 web 이 없으면 null */
export function webCommandDef(bundle: unknown, kind: string): CommandDef | null {
  const list = (bundle as { commands?: unknown } | null)?.commands;
  if (!Array.isArray(list)) return null;
  const def = list.find((c): c is CommandDef => !!c && typeof c === "object" && (c as CommandDef).kind === kind);
  return def && Array.isArray(def.sources) && def.sources.includes("web") ? def : null;
}

/** 정의의 required 인자 중 빠진 것(값의 형식·범위는 장비가 본다 — BAD_ARGS 등) */
export function missingArgs(def: CommandDef, args: Record<string, unknown>): string[] {
  return (Array.isArray(def.args) ? def.args : [])
    .filter((a): a is { name: string; required: true } => !!a && a.required === true && typeof a.name === "string")
    .filter((a) => args[a.name] === undefined || args[a.name] === null)
    .map((a) => a.name);
}

/** 장비로 가는 Command(계약 그대로) */
export type WireCommand = {
  id: string; kind: string; args: unknown; requestedBy: string; requestedAt: string; expiresAt: string;
};

type Row = { id: string; kind: string; args: unknown; requested_by: string; requested_at: Date; expires_at: Date | null };

function toWire(rows: Row[]): WireCommand[] {
  return rows
    .sort((a, b) => a.requested_at.getTime() - b.requested_at.getTime())
    .map((r) => ({
      id: r.id, kind: r.kind, args: r.args ?? {}, requestedBy: r.requested_by,
      requestedAt: r.requested_at.toISOString(), expiresAt: (r.expires_at ?? r.requested_at).toISOString(),
    }));
}

/** pending 인데 웹 유효 시간이 지난 것 → expired(WEB_EXPIRED). equipment 가 null 이면 모든 장비(관리 화면 읽을 때) */
export async function expireDue(equipment: string | null, now: Date): Promise<number> {
  return ops2Db.$executeRaw`
    UPDATE "process"."ops2_command" SET status = 'expired', reason_code = 'WEB_EXPIRED', result_at = ${now}
     WHERE (${equipment}::text IS NULL OR equipment = ${equipment}) AND status = 'pending' AND expires_at_server <= ${now}`;
}

/** 이 장비·이 실행 앞의 pending 을 오래된 것부터 차지(pending → sent). 차지한 것만 돌려준다 — 보내는 쪽이 하나뿐. */
export async function claimPending(equipment: string, instance: string, via: "sse" | "post", now: Date) {
  const rows = await ops2Db.$queryRaw<Row[]>`
    UPDATE "process"."ops2_command" c
       SET status = 'sent', sent_via = ${via}, sent_at = COALESCE(c.sent_at, ${now}), last_sent_at = ${now},
           send_count = c.send_count + 1
     WHERE c.id IN (SELECT id FROM "process"."ops2_command"
                     WHERE equipment = ${equipment} AND target_instance = ${instance} AND status = 'pending'
                       AND expires_at_server > ${now}
                     ORDER BY requested_at
                     FOR UPDATE SKIP LOCKED)
       AND c.status = 'pending'
    RETURNING c.id, c.kind, c.args, c.requested_by, c.requested_at, c.expires_at`;
  return toWire(rows);
}

/** sent 인데 결과가 없고 마지막으로 보낸 지 3 s 넘은 것(만료 + 5 분 전까지) — POST 응답으로 다시 */
export async function claimResend(equipment: string, instance: string, now: Date) {
  const before = new Date(now.getTime() - RESEND_AFTER_MS);
  const until = new Date(now.getTime() - RESEND_UNTIL_MS);
  const rows = await ops2Db.$queryRaw<Row[]>`
    UPDATE "process"."ops2_command" c
       SET last_sent_at = ${now}, send_count = c.send_count + 1
     WHERE c.id IN (SELECT id FROM "process"."ops2_command"
                     WHERE equipment = ${equipment} AND target_instance = ${instance} AND status = 'sent'
                       AND last_sent_at < ${before} AND expires_at_server > ${until}
                     FOR UPDATE SKIP LOCKED)
       AND c.status = 'sent' AND c.last_sent_at < ${before}
    RETURNING c.id, c.kind, c.args, c.requested_by, c.requested_at, c.expires_at`;
  return toWire(rows);
}

/** ingest 응답의 commands — 처음 보내는 것과 다시 보내는 것, 오래된 것부터 */
export async function commandsForPost(equipment: string, instance: string, now: Date): Promise<WireCommand[]> {
  await expireDue(equipment, now);
  const fresh = await claimPending(equipment, instance, "post", now);
  const again = await claimResend(equipment, instance, now);
  return [...again, ...fresh].sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
}
