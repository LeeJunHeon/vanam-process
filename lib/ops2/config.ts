// 챔버K v2 설정(W-5) — 웹이 값의 원본, 장비별 버전(ops2_config_version, CHK2 와 CHK2-SIM 따로).
// 계약(챔버K common/config_store.py·chk/system.py ConfigApply·common/messages.py config_ack):
// - CONFIG_APPLY {version, values, schemaHash} — values 는 비밀값을 뺀 전체 값(빠진 키는 check_config 가 오류).
//   version 은 장비 저장 버전보다 커야 한다(CONFIG_VERSION_STALE). schemaHash = 묶음 paramSchemaHash.
//   webLocked 키(RUN_MODE·EQUIPMENT_ID)는 장비 지금 값과 같아야 한다(CONFIG_LOCKED_KEY) — 웹은 지금 버전 값을 그대로 싣는다.
// - 장비 configVersion(state·hello) = 장비가 저장한 마지막 버전. pending_idle·pending_restart 여도 그 버전이 된다 —
//   대기 중 키는 state.configPending {idle: {키: 값}, restart: {키: 값}} 에(아직 이전 값으로 돈다).
// - config_ack: kind apply / rollback(values = 새 버전 값 전체) / idle(대기 키를 나중에 적용 — 같은 version, changes·values 없음).
// 5-12(묶음 10):
// - 묶음 params[].stored = 저장 값(config_active), current = 실행 값(노트북 덮어쓰기 반영), overridden = 덮어쓰기가 정한 키.
//   웹 값의 원본은 저장 값 — 첫 기준(import)·resync 는 stored 로 만든다. hello·묶음 머리 overriddenKeys.
// - CONFIG_ROLLBACK {version} — 새 버전 번호를 웹이 정한다(적용과 같은 규칙: max(웹 최대, 장비 버전) + 1).
// resync(관리자 "장비 저장 값으로 기준 다시 읽기"): 장비에 명령을 보내지 않는다. 다음 POST 응답 needWebSchema 로
// 묶음을 다시 받아 그 stored 로 새 버전 행(kind resync, 장비 버전보다 큰 번호)을 만든다 — 다음 적용의 기준값이 된다
// (장비가 그보다 새 버전을 쓰기 시작하면 다시 장비 버전 행이 기준).
import type { Prisma } from "@/app/generated/prisma/client";
import { ops2Db } from "@/lib/ops2/db";
import { COMMAND_TTL_MS } from "@/lib/ops2/commands";
import { isObj, type Obj } from "@/lib/ops2/configCheck";

export { CONFIG_REASON, checkParamValue, isObj, type Obj, type ParamDefLite } from "@/lib/ops2/configCheck";


/** 장비가 지금 쓰는 설정 버전 — 마지막 state(없으면 hello) */
export async function deviceConfigVersion(equipment: string): Promise<number | null> {
  const [st, dev] = await Promise.all([
    ops2Db.ops2State.findUnique({ where: { equipment }, select: { data: true } }),
    ops2Db.ops2Device.findUnique({ where: { equipment }, select: { configVersion: true } }),
  ]);
  const v = isObj(st?.data) ? st.data.configVersion : undefined;
  return typeof v === "number" && Number.isInteger(v) ? v : dev?.configVersion ?? null;
}

/** "지금 값"(편집·적용의 기준) — 장비 버전보다 큰 resync 행이 있으면 그 값, 아니면 장비 버전의 웹 행 값.
 *  행이 없으면 values null(부르는 쪽이 묶음 current 로 + 안내). row = 장비 버전 행, base = 기준 행(버전·종류) */
export async function currentConfig(equipment: string) {
  const version = await deviceConfigVersion(equipment);
  const [row, resync] = version === null ? [null, null] : await Promise.all([
    ops2Db.ops2ConfigVersion.findUnique({ where: { equipment_version: { equipment, version } } }),
    ops2Db.ops2ConfigVersion.findFirst({ where: { equipment, kind: "resync", version: { gt: version } }, orderBy: { version: "desc" } }),
  ]);
  const baseRow = resync ?? row;
  const values = baseRow && isObj(baseRow.paramValues) ? baseRow.paramValues : null;
  return { version, values, row, base: baseRow ? { version: baseRow.version, kind: baseRow.kind } : null };
}

/** 묶음 params 의 웹 값(비밀값 제외) — stored(5-12), 없으면(묶음 10 이전) current */
export function storedValues(bundle: Obj): Obj {
  const values: Obj = {};
  for (const p of Array.isArray(bundle.params) ? bundle.params : []) {
    if (isObj(p) && typeof p.key === "string" && p.scope !== "secret") values[p.key] = ("stored" in p ? p.stored : p.current) ?? null;
  }
  return values;
}

/** 덮어쓴 키의 실행 값 — 묶음 params[].overridden·current(키 → 값) */
export function overriddenCurrent(bundle: Obj): Obj {
  const out: Obj = {};
  for (const p of Array.isArray(bundle.params) ? bundle.params : []) {
    if (isObj(p) && typeof p.key === "string" && p.overridden === true && p.scope !== "secret") out[p.key] = p.current ?? null;
  }
  return out;
}

// resync 요청 — 장비별 하나(웹 서버 메모리, 1 분). ingest 가 다음 POST 에 needWebSchema 를 주고, 묶음이 오면 행을 만든다.
export const RESYNC_TTL_MS = 60_000;
type Resync = { by: string; at: number; note: string | null };
const g = globalThis as unknown as { __ops2Resync?: Map<string, Resync> };
const resyncs = (g.__ops2Resync ??= new Map<string, Resync>());

export function requestResync(equipment: string, by: string, note: string | null, now = Date.now()) {
  resyncs.set(equipment, { by, at: now, note });
}
/** 살아 있는 resync 요청(없으면 null) */
export function pendingResync(equipment: string, now = Date.now()): Resync | null {
  const r = resyncs.get(equipment);
  if (r && now - r.at > RESYNC_TTL_MS) resyncs.delete(equipment);
  return r && now - r.at <= RESYNC_TTL_MS ? r : null;
}
export function clearResync(equipment: string) {
  resyncs.delete(equipment);
}

/** 묶음 params 의 current 를 "지금 값"으로 덮는다(비밀값 제외). 행이 없으면 묶음 그대로 */
export function overlayCurrent(bundle: Obj, values: Obj | null): Obj {
  if (!values) return bundle;
  const list = Array.isArray(bundle.params) ? bundle.params : [];
  return {
    ...bundle,
    params: list.map((p) => (isObj(p) && typeof p.key === "string" && p.scope !== "secret" && p.key in values
      ? { ...p, current: values[p.key] } : p)),
  };
}


/** 앞서 보낸 설정 버전이 아직 장비 답을 기다리는가(30 s 안) — 적용·되돌리기·resync 가 같이 쓴다.
 *  같은 지금 값 위에 두 버전을 만들면 뒤 것이 앞 것을 되돌리고, 되돌리기 번호와 적용 번호가 겹친다.
 *  - 웹 적용 행(kind web) 중 장비 버전보다 크고 ack 가 없는 것
 *  - 되돌리기 명령(CONFIG_ROLLBACK args.version) 중 거부·만료가 아니고 그 버전 행에 ack 가 아직 없는 것 */
export async function inFlightVersion(tx: Prisma.TransactionClient, equipment: string, cur: number | null, now: Date): Promise<number | null> {
  const since = new Date(now.getTime() - COMMAND_TTL_MS);
  const web = await tx.ops2ConfigVersion.findFirst({
    where: { equipment, kind: "web", version: { gt: cur ?? -1 }, ackStatus: null, createdAt: { gt: since } },
    select: { version: true },
  });
  if (web) return web.version;
  const rbs = await tx.ops2Command.findMany({
    where: { equipment, kind: "CONFIG_ROLLBACK", requestedAt: { gt: since }, status: { notIn: ["rejected", "expired"] } },
    select: { args: true },
  });
  for (const c of rbs) {
    const v = isObj(c.args) && typeof c.args.version === "number" ? c.args.version : null;
    if (v === null || v <= (cur ?? -1)) continue;
    const row = await tx.ops2ConfigVersion.findUnique({ where: { equipment_version: { equipment, version: v } }, select: { ackStatus: true } });
    if (!row?.ackStatus) return v;
  }
  return null;
}

/** 새 버전 번호 — max(웹 최대, 장비 버전) + 1(적용·되돌리기·resync 공통) */
export async function nextVersion(tx: Prisma.TransactionClient, equipment: string, cur: number | null): Promise<number> {
  const top = await tx.ops2ConfigVersion.findFirst({ where: { equipment }, orderBy: { version: "desc" }, select: { version: true } });
  return Math.max(top?.version ?? 0, cur ?? 0) + 1;
}
