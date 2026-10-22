// 챔버K v2 장비 SSE 연결(/api/ops2/uplink/stream) — 프로세스 하나에 globalThis 하나.
// 장비별로 실행(instance)마다 연결 하나. 같은 실행이 새로 붙으면 예전 연결은 닫는다.
// kick(equipment) — 그 장비에 붙은 실행마다 자기 앞의 pending 을 차지해 보낸다(lib/ops2/commands.ts claimPending).
// W-3 에서 브라우저 구독자도 여기에 더한다.
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

/** 관리 화면용 — 장비별 연결(instance·연결 시각) */
export function connections(): Record<string, { instance: string; connectedAt: string }[]> {
  const out: Record<string, { instance: string; connectedAt: string }[]> = {};
  for (const [eq, m] of devices) {
    out[eq] = [...m.values()].map((c) => ({ instance: c.instance, connectedAt: c.connectedAt.toISOString() }));
  }
  return out;
}
