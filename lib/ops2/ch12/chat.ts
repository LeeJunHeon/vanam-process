// 챔버12(CH12) 구글챗 outbox 넣기 — ingest 가 커밋한 envelope 묶음 → 카드(lib/ops2/ch12/chatCards.ts) → ops2_chat_outbox.
// 보내기·다시 보내기(30 s·2 분·10 분)·장비 연결 끊김은 챔버K 와 같은 lib/ops2/chat.ts 가 한다(같은 표·같은 타이머).
// 챔버K 규칙 그대로: runMode prod 일 때만 보낸다(CH12-SIM·sim·bench 는 skipped "보내지 않음(모드 …)"), 주소가 없으면 skipped
// "주소 없음", 10 분 넘게 늦게 받은 원인은 skipped "늦게 받음"(종료 카드만 예외). 같은 원인 envelope id 는 한 번만(msg_id UNIQUE).
// 주소(서버 환경변수, 커밋하지 않음): OPS2_CHAT_WEBHOOK_CH12(v1 CHAT_WEBHOOK_URL — 노티파이어 HOST·CH1·CH2·PC·TSP),
//   OPS2_CHAT_PLC_WEBHOOK_CH12(CHAT_WEBHOOK_PLC_DISCONNECT_URL), OPS2_CHAT_MONITOR_WEBHOOK_CH12(CHAT_WEBHOOK_MONITOR_URL),
//   OPS2_CHAT_CLIENT_WEBHOOK_CH12(CHAT_WEBHOOK_CLIENT_PROCESS_URL), OPS2_CHAT_OES_WEBHOOK_CH12(OES oes_config.json webhook_url).
// 노티파이어 상태(이번 공정 집계 오류·시작 값)는 outbox 기록에서 다시 읽는다 — payload.notifier·errorLine·startParams.
// 중복 억제(v1 _err_dedup_decide·_client_err_dedup_decide — CHAT_ERR_DEDUP_S, 장비 묶음 설정값):
//   같은 열쇠 첫 행 payload.cycle = true, 창 안 재발은 skipped "반복" + payload.repeatOf(첫 행 msg_id) — 창이 지나 다시 오면
//   그동안 억제된 수를 부제 끝(장비 오류)·'반복' 칸(로봇 에러)에. 억제가 남은 채 만료된 다른 열쇠는 다음 장비 오류 때 요약 카드
//   한 장(msg_id <첫 행>:summary — 한 번만).
// 전송 폭주 보호(v1 _schedule_post — CHAT_PENDING_MAX 200·CHAT_PENDING_HARD_MAX 1000, 장비 묶음 설정값 — lib/ops2/ch12/chatLimits.ts):
//   노티파이어마다(payload.pendGroup) 보내지 못한 queued 행이 상한 이상이면 일반 카드는 skipped "대기 상한 초과 — 생략…"(urgent 는
//   하드 상한까지 통과), 다음에 통과하는 카드 본문 끝에 '(전송 실패로 생략된 알림 N건)' 한 번(payload.dropAck·droppedNote).
import type { Prisma } from "@/app/generated/prisma/client";
import { ops2Db } from "@/lib/ops2/db";
import { deviceBundle } from "@/lib/ops2/browser";
import { sendsChat, wakeChat, webhookOf, type Channel } from "@/lib/ops2/chat";
import {
  buildCh12Items, chatCfgOf, emptyState, errorSummaryCard, NOTIFIERS, type Ch12ChatCfg, type Ch12Envelope, type Ch12Item, type Ch12State,
} from "@/lib/ops2/ch12/chatCards";
import { admit, annotateDropped, DROP_REASON, pendGroupOf, URGENT_KINDS, type Gate } from "@/lib/ops2/ch12/chatLimits";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const DAY_MS = 86_400_000;
const pathEq = (k: string, v: unknown) => ({ payload: { path: [k], equals: v as Prisma.InputJsonValue } });

/** 묶음 params 의 current(없으면 default) → 키: 값 */
function valuesOf(bundle: Obj | null): Obj {
  const out: Obj = {};
  for (const p of Array.isArray(bundle?.params) ? bundle.params : []) {
    if (isObj(p) && typeof p.key === "string") out[p.key] = p.current ?? p.default ?? null;
  }
  return out;
}

/** 노티파이어 상태 — 마지막 시작·종료 행 뒤의 집계 오류, 마지막 시작 값 */
async function seedState(equipment: string, now: Date): Promise<Ch12State> {
  const st = emptyState();
  await Promise.all(NOTIFIERS.map(async (n) => {
    const last = await ops2Db.ops2ChatOutbox.findFirst({
      where: { equipment, kind: { in: ["run_start", "run_end"] }, ...pathEq("notifier", n) }, orderBy: { id: "desc" },
      select: { id: true, kind: true, payload: true },
    });
    const start = last?.kind === "run_start" ? last : await ops2Db.ops2ChatOutbox.findFirst({
      where: { equipment, kind: "run_start", ...pathEq("notifier", n) }, orderBy: { id: "desc" }, select: { id: true, kind: true, payload: true },
    });
    if (start && isObj(start.payload) && isObj(start.payload.startParams)) st[n].lastStart = start.payload.startParams;
    const errs = await ops2Db.ops2ChatOutbox.findMany({
      where: { equipment, kind: "aggregate", ...pathEq("notifier", n),
               ...(last ? { id: { gt: last.id } } : { createdAt: { gte: new Date(now.getTime() - DAY_MS) } }) },
      orderBy: { id: "asc" }, take: 200, select: { payload: true },
    });
    st[n].errors = errs.flatMap((r) => (isObj(r.payload) && typeof r.payload.errorLine === "string" ? [r.payload.errorLine] : []));
  }));
  return st;
}

type Row = Prisma.Ops2ChatOutboxCreateManyInput;

/** 묶음(v1 ChatNotifier)의 지금 상태 — 보내지 못한 행 수, 마지막 생략 표기 뒤 버린 행 수(하루 안) */
async function gateOf(equipment: string, group: string, now: Date): Promise<Gate> {
  const pending = await ops2Db.ops2ChatOutbox.count({ where: { equipment, status: "queued", ...pathEq("pendGroup", group) } });
  const ack = await ops2Db.ops2ChatOutbox.findFirst({
    where: { equipment, ...pathEq("pendGroup", group), AND: [pathEq("dropAck", true)] }, orderBy: { id: "desc" }, select: { id: true },
  });
  const dropped = await ops2Db.ops2ChatOutbox.count({
    where: { equipment, status: "skipped", lastError: DROP_REASON, ...pathEq("pendGroup", group),
             createdAt: { gte: new Date(now.getTime() - DAY_MS) }, ...(ack ? { id: { gt: ack.id } } : {}) },
  });
  return { pending, dropped };
}

/** 전송 폭주 보호(v1 _schedule_post — chatLimits): 보낼 행을 받은 순서대로 묶음마다 상한에 넣어 보고, 넘으면 생략(skipped),
 *  통과한 행에 그동안 생략한 건수를 한 번 붙인다(본문 끝 '(전송 실패로 생략된 알림 N건)'). */
async function applyPendingCaps(equipment: string, rows: Row[], meta: Map<Row, { group: string | null; urgent: boolean }>,
                                cfg: Ch12ChatCfg, now: Date): Promise<void> {
  const gates = new Map<string, Gate>();
  for (const row of rows) {
    const m = meta.get(row);
    if (!m?.group || row.status !== "queued") continue;
    let g = gates.get(m.group);
    if (!g) gates.set(m.group, (g = await gateOf(equipment, m.group, now)));
    const r = admit(g, m.urgent, cfg);
    const pl = (isObj(row.payload) ? row.payload : {}) as Obj;
    if (!r.ok) {
      Object.assign(row, { status: "skipped", lastError: DROP_REASON, nextAt: null });
      continue;
    }
    if (r.note > 0) row.payload = { ...pl, body: annotateDropped(isObj(pl.body) ? pl.body : {}, r.note), dropAck: true, droppedNote: r.note } as Prisma.InputJsonValue;
  }
}

/** ingest 가 커밋한 envelope 들(받은 순서) → outbox. 넣은 행 수 */
export async function enqueueChatCh12(equipment: string, envs: Ch12Envelope[], now: Date): Promise<number> {
  // 카드가 될 것이 있는지 먼저(빈 상태로) — 없으면 DB 를 더 읽지 않는다
  if (!buildCh12Items(envs, { now }, emptyState()).length) return 0;
  const dev = await ops2Db.ops2Device.findUnique({
    where: { equipment }, select: { runMode: true, clockSkewMs: true, webSchemaHash: true },
  });
  if (!dev) return 0;
  const bundle = await deviceBundle(dev.webSchemaHash);
  const reasons = Array.isArray(bundle?.reasons) ? (bundle.reasons as { code?: string; label?: string }[]) : [];
  const cfg = chatCfgOf(valuesOf(bundle));
  const state = await seedState(equipment, now);
  const items = buildCh12Items(envs, {
    now, skewMs: dev.clockSkewMs, reason: (c) => reasons.find((r) => r.code === c)?.label ?? c,
  }, state, cfg);
  if (!items.length) return 0;

  const mode = sendsChat(equipment, dev.runMode);
  const win = cfg.dedupS * 1000;
  const rows: Row[] = [];
  const meta = new Map<Row, { group: string | null; urgent: boolean }>();
  const add = (it: Ch12Item, title: string, body: Obj, skip: string | null, extra: Obj = {}, msgId = it.msgId) => {
    let ch: Channel = it.channel;
    if (it.fallback && !webhookOf(equipment, ch)) ch = it.fallback;
    const why = !mode ? `보내지 않음(모드 ${dev.runMode ?? "?"})` : !webhookOf(equipment, ch) ? "주소 없음" : skip;
    const group = pendGroupOf(it.kind, ch as Ch12Item["channel"], it.notifier);
    const row: Row = {
      equipment, kind: it.kind, msgId, status: why ? "skipped" : "queued", lastError: why, createdAt: now,
      nextAt: why ? null : new Date(now.getTime() + (it.delayMs ?? 0)),
      payload: {
        title, body, channel: ch, notifier: it.notifier, chamber: it.chamber ?? null, runId: it.runId ?? null, from: it.from,
        ...(it.startParams ? { startParams: it.startParams } : {}), ...(it.errorLine ? { errorLine: it.errorLine } : {}),
        ...(it.late ? { late: true } : {}), ...(group ? { pendGroup: group } : {}), ...extra,
      } as Prisma.InputJsonValue,
    };
    rows.push(row);
    meta.set(row, { group, urgent: URGENT_KINDS.has(it.kind) });
  };

  // ── 만료된 다른 열쇠의 요약 카드(장비 오류 — 다음 장비 오류가 올 때, v1 expired_cards) ──
  const errKeys = new Set(items.filter((i) => i.dedup?.scope === "error" && !i.skip).map((i) => i.dedup!.key));
  const summarized = async (cycleMsgId: string) =>
    !!(await ops2Db.ops2ChatOutbox.findUnique({ where: { msgId: `${cycleMsgId}:summary` }, select: { id: true } }));
  const repeats = (kind: string, cycleMsgId: string) =>
    ops2Db.ops2ChatOutbox.count({ where: { equipment, kind, ...pathEq("repeatOf", cycleMsgId) } });
  if (errKeys.size && win > 0) {
    const old = await ops2Db.ops2ChatOutbox.findMany({
      where: { equipment, kind: "error_event", createdAt: { gte: new Date(now.getTime() - DAY_MS), lt: new Date(now.getTime() - win) },
               ...pathEq("cycle", true) },
      orderBy: { id: "asc" }, take: 50, select: { msgId: true, createdAt: true, payload: true },
    });
    for (const c of old) {
      const p = isObj(c.payload) ? c.payload : {};
      if (typeof p.dedupKey !== "string" || errKeys.has(p.dedupKey) || typeof p.summarySub !== "string") continue;
      // 그 열쇠의 더 새 첫 행이 있으면(다시 온 오류에 접미사로 붙음) 건너뜀
      const newer = await ops2Db.ops2ChatOutbox.findFirst({
        where: { equipment, kind: "error_event", createdAt: { gt: c.createdAt }, ...pathEq("dedupKey", p.dedupKey), AND: [pathEq("cycle", true)] },
        select: { id: true },
      });
      if (newer || (await summarized(c.msgId))) continue;
      const n = await repeats("error_event", c.msgId);
      if (!n) continue;
      const s = errorSummaryCard(p.summarySub, { n, elapsedS: (now.getTime() - c.createdAt.getTime()) / 1000 });
      const it = items.find((i) => i.dedup?.scope === "error")!;
      add({ ...it, channel: (p.channel as Ch12Item["channel"]) ?? it.channel, fallback: undefined }, s.title, s.body, null,
          { summaryOf: c.msgId }, `${c.msgId}:summary`);
    }
  }

  // ── 카드(중복 억제 포함) ──
  const mem = new Map<string, { msgId: string; at: number; n: number }>();
  for (const it of items) {
    if (!it.dedup || it.skip || win <= 0) {
      add(it, it.title, it.body, it.skip ?? null, it.dedup ? { dedupKey: it.dedup.key } : {});
      continue;
    }
    const { key, scope, summarySub } = it.dedup;
    const memKey = `${it.kind}|${key}`;
    let prev = mem.get(memKey) ?? null;
    if (!prev) {
      const r = await ops2Db.ops2ChatOutbox.findFirst({
        where: { equipment, kind: it.kind, ...pathEq("dedupKey", key), AND: [pathEq("cycle", true)] }, orderBy: { id: "desc" },
        select: { msgId: true, createdAt: true },
      });
      if (r) prev = { msgId: r.msgId, at: r.createdAt.getTime(), n: 0 };
    }
    if (prev && now.getTime() - prev.at < win) {
      prev.n += 1;
      mem.set(memKey, prev);
      add(it, it.title, it.body, `반복(${cfg.dedupS} s 안)`, { dedupKey: key, repeatOf: prev.msgId });
      continue;
    }
    let rep = null;
    if (prev && !(await summarized(prev.msgId))) {
      const n = (await repeats(it.kind, prev.msgId)) + rows.filter((x) => isObj(x.payload) && (x.payload as Obj).repeatOf === prev!.msgId).length;
      if (n > 0) rep = { n, elapsedS: (now.getTime() - prev.at) / 1000 };
      // 이 반복은 이 카드에 붙인다 — 나중에 요약 카드로 다시 보내지 않게 막아 둔다
      if (scope === "error") {
        rows.push({ equipment, kind: it.kind, msgId: `${prev.msgId}:summary`, status: "skipped", lastError: "반복은 다음 카드 부제에 붙임",
                    createdAt: now, nextAt: null, payload: { summaryOf: prev.msgId, channel: it.channel } });
      }
    }
    const b = it.finish ? it.finish(rep) : { title: it.title, body: it.body };
    add(it, b.title, b.body, null, { dedupKey: key, cycle: true, ...(summarySub ? { summarySub } : {}) });
    mem.set(memKey, { msgId: it.msgId, at: now.getTime(), n: 0 });
  }

  // ── 전송 폭주 보호(v1 CHAT_PENDING_MAX·CHAT_PENDING_HARD_MAX — 장비 묶음 설정값) ──
  await applyPendingCaps(equipment, rows, meta, cfg, now);

  const r = await ops2Db.ops2ChatOutbox.createMany({ data: rows, skipDuplicates: true });
  if (rows.some((x) => x.status === "queued")) wakeChat();
  return r.count;
}
