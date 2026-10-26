// 챔버K v2 설정(W-5) — 웹이 값의 원본, 장비별 버전(ops2_config_version, CHK2 와 CHK2-SIM 따로).
// 계약(챔버K common/config_store.py·chk/system.py ConfigApply·common/messages.py config_ack):
// - CONFIG_APPLY {version, values, schemaHash} — values 는 비밀값을 뺀 전체 값(빠진 키는 check_config 가 오류).
//   version 은 장비 저장 버전보다 커야 한다(CONFIG_VERSION_STALE). schemaHash = 묶음 paramSchemaHash.
//   webLocked 키(RUN_MODE·EQUIPMENT_ID)는 장비 지금 값과 같아야 한다(CONFIG_LOCKED_KEY) — 웹은 지금 버전 값을 그대로 싣는다.
// - 장비 configVersion(state·hello) = 장비가 저장한 마지막 버전. pending_idle·pending_restart 여도 그 버전이 된다 —
//   대기 중 키는 state.configPending {idle: {키: 값}, restart: {키: 값}} 에(아직 이전 값으로 돈다).
// - config_ack: kind apply / rollback(values = 새 버전 값 전체) / idle(대기 키를 나중에 적용 — 같은 version, changes·values 없음).
import { ops2Db } from "@/lib/ops2/db";
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

/** "지금 값" — 장비 버전의 웹 행 값. 행이 없으면 null(부르는 쪽이 묶음 current 로 + 안내) */
export async function currentConfig(equipment: string) {
  const version = await deviceConfigVersion(equipment);
  const row = version === null ? null
    : await ops2Db.ops2ConfigVersion.findUnique({ where: { equipment_version: { equipment, version } } });
  const values = row && isObj(row.paramValues) ? row.paramValues : null;
  return { version, values, row };
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

