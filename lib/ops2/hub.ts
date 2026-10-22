// 챔버K v2 장비 SSE 연결(/api/ops2/uplink/stream) — 프로세스 하나에 globalThis 하나.
// 장비별로 실행(instance)마다 연결 하나. 같은 실행이 새로 붙으면 예전 연결은 닫는다.
// kick(equipment) — 그 장비에 붙은 실행마다 자기 앞의 pending 을 차지해 보낸다(lib/ops2/commands.ts claimPending).
// 브라우저 구독자(화면 stream)도 여기 — 아래 publishBrowser.
import { claimPending, type WireCommand } from "@/lib/ops2/commands";

export type DeviceConn = {
  equipment: string;
  instance: string;
  connectedAt: Date;
  /** 한 덩어리를 스트림에 넣는다. 실패(끊김)면 false */
  write: (chunk: string) => boolean;
  /** 스트림을 닫고 정리한다(여러 번 불러도 됨) */
  close: () => void;
  pumping?: boolean;
  again?: boolean;
};

const g = globalThis as unknown as { __ops2Hub?: Map<string, Map<string, DeviceConn>> };
const devices = (g.__ops2Hub ??= new Map());

export function register(conn: DeviceConn): void {
  let m = devices.get(conn.equipment);
  if (!m) devices.set(conn.equipment, (m = new Map()));
  const old = m.get(conn.instance);
  m.set(conn.instance, conn);
  if (old && old !== conn) old.close();
}

export function unregister(conn: DeviceConn): void {
  const m = devices.get(conn.equipment);
  if (m?.get(conn.instance) === conn) {
    m.delete(conn.instance);
    if (!m.size) devices.delete(conn.equipment);
  }
}

/** 그 장비의 이 실행 연결을 닫는다 */
export function closeInstance(equipment: string, instance: string): void {
  devices.get(equipment)?.get(instance)?.close();
}

/** lease 를 차지한 실행 말고 그 장비의 다른 실행 연결을 모두 닫는다(주인이 바뀌었을 때) */
export function closeOthers(equipment: string, instance: string): void {
  for (const [inst, c] of devices.get(equipment) ?? []) if (inst !== instance) c.close();
}

export function sseCommand(cmd: WireCommand): string {
  return `event: command\ndata: ${JSON.stringify(cmd)}\n\n`;
}

/** 이 연결 앞의 pending 을 차지해 보낸다. 동시에 불리면 한 번 더 돈다. 보내다 실패한 것은 sent 로 두고 POST 다시 보내기가 맡는다. */
export async function pump(conn: DeviceConn): Promise<void> {
  if (conn.pumping) {
    conn.again = true;
    return;
  }
  conn.pumping = true;
  try {
    do {
      conn.again = false;
      const cmds = await claimPending(conn.equipment, conn.instance, "sse", new Date());
      for (const c of cmds) {
        if (!conn.write(sseCommand(c))) return;
      }
    } while (conn.again);
  } catch (e) {
    console.error("[ops2/hub] 보내기 실패", conn.equipment, (e as Error)?.message?.slice(0, 200));
  } finally {
    conn.pumping = false;
  }
}

export function kick(equipment: string): void {
  for (const c of devices.get(equipment)?.values() ?? []) void pump(c);
}

// ───────────── 브라우저 구독자(/api/ops2/[equipment]/v1/stream) ─────────────
// ingest 가 커밋한 뒤 그 묶음의 envelope 을 장비별 구독자에게 보낸다. 덩어리는 한 번만 직렬화해 모두에게 같은 바이트.
// 구독자는 send 가 false 면(끊김·쌓인 것이 상한을 넘은 느린 구독자) 닫는다 — 다시 붙으면 처음 묶음부터.

/** 브라우저로 가는 envelope(장비 envelope 그대로 — ts 는 ISO) */
export type WireEnvelope = { id: string; instance: string; seq: number; ts: string; type: string; data: unknown };

export type BrowserSub = {
  equipment: string;
  /** 덩어리 하나. 끊겼거나 너무 밀렸으면 false */
  send: (bytes: Uint8Array) => boolean;
  close: () => void;
};

const gb = globalThis as unknown as { __ops2Browsers?: Map<string, Set<BrowserSub>> };
const browsers = (gb.__ops2Browsers ??= new Map());
const enc = new TextEncoder();

/** 브라우저에 보내는 type — snapshot_summary 는 보내지 않는다 */
const BROWSER_TYPES = new Set(["hello", "state", "event", "run_start", "run_end", "cmd_result", "config_ack"]);

export function subscribeBrowser(sub: BrowserSub): void {
  let s = browsers.get(sub.equipment);
  if (!s) browsers.set(sub.equipment, (s = new Set()));
  s.add(sub);
}

export function unsubscribeBrowser(sub: BrowserSub): void {
  const s = browsers.get(sub.equipment);
  if (s?.delete(sub) && !s.size) browsers.delete(sub.equipment);
}

/** "id: <envelope id>\nevent: <type>\ndata: <envelope JSON>\n\n" */
export function sseEnvelope(env: WireEnvelope): string {
  return `id: ${env.id}\nevent: ${env.type}\ndata: ${JSON.stringify(env)}\n\n`;
}

/** 묶음 하나를 그 장비의 브라우저 구독자 모두에게 — state 는 마지막 것만 */
export function publishBrowser(equipment: string, envs: WireEnvelope[]): void {
  const subs = browsers.get(equipment);
  if (!subs?.size) return;
  const lastState = envs.findLastIndex((e) => e.type === "state");
  const list = envs.filter((e, i) => BROWSER_TYPES.has(e.type) && (e.type !== "state" || i === lastState));
  if (!list.length) return;
  const bytes = enc.encode(list.map(sseEnvelope).join(""));
  for (const s of [...subs]) if (!s.send(bytes)) s.close();
}

/** 웹이 만든 사건 행(ops2_event) → event envelope. context 에 source·kind 를 넣는다(장비 사건과 같은 모양) */
export function eventEnvelope(r: {
  msgId: string; instance: string; seq: number; ts: Date; level: string; code: string; ruleId: string | null;
  message: string; source: string | null; kind: string | null; context: unknown;
}): WireEnvelope {
  const c = r.context && typeof r.context === "object" && !Array.isArray(r.context) ? (r.context as Record<string, unknown>) : {};
  return {
    id: r.msgId, instance: r.instance, seq: r.seq, ts: r.ts.toISOString(), type: "event",
    data: { level: r.level, code: r.code, ruleId: r.ruleId, message: r.message,
            context: { ...c, source: c.source ?? r.source, kind: c.kind ?? r.kind } },
  };
}

/** 관리 화면용 — 장비별 연결(instance·연결 시각) */
export function connections(): Record<string, { instance: string; connectedAt: string }[]> {
  const out: Record<string, { instance: string; connectedAt: string }[]> = {};
  for (const [eq, m] of devices) {
    out[eq] = [...m.values()].map((c) => ({ instance: c.instance, connectedAt: c.connectedAt.toISOString() }));
  }
  return out;
}
