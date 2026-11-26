// 설정 기준 어긋남(W-23 F) — 순수 함수만(DB 없음 — scripts/ops2-chk-config.mjs 가 시험한다).
// 노트북 프로그램이 새 판으로 바뀌면 묶음 paramSchemaHash 가 웹 기준 행(지금 값)과 달라지거나 기준 행에 없는 키가 생긴다.
//  - 장비가 연결돼 묶음을 보냈을 때 어긋났고 앞서 보낸 적용·되돌리기가 답을 기다리지 않으면: 웹이 그 묶음 stored 로 기준 행을
//    자동으로 만든다(kind resync, 만든 이 AUTO_RESYNC_BY, 사건 1줄 — ingest).
//  - 답을 기다리는 중이면 자동으로 만들지 않고 화면 띠 + [노트북 프로그램 설정 다시 받기].
//  - 어긋난 동안 '지금 값'은 묶음 값(currentConfig 가 values 를 null 로 — 화면·서랍이 묶음 current 를 쓴다).
// 챔버K 만(챔버12 는 부르지 않는다).
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

export const AUTO_RESYNC_BY = "자동 — 프로그램 판 바뀜";
export const AUTO_RESYNC_CODE = "CONFIG_BASE_AUTO";
export const DRIFT_TEXT = "프로그램이 새 판으로 바뀌어 설정 기준이 맞지 않습니다";

export type DriftRow = { version: number; paramSchemaHash: string | null; paramValues: unknown };
export type Drift = { schema: boolean; missing: string[] };

/** 기준 행이 이 묶음과 어긋났는가 — 정의 해시가 다르거나(행에 해시가 있을 때) 묶음의 키(비밀값 제외)가 행 값에 없다. 맞으면 null */
export function baseDrift(row: DriftRow | null | undefined, bundle: Obj | null | undefined): Drift | null {
  if (!row || !bundle) return null;
  const vals = isObj(row.paramValues) ? row.paramValues : {};
  const missing = (Array.isArray(bundle.params) ? bundle.params : [])
    .filter((p): p is Obj => isObj(p) && typeof p.key === "string" && p.scope !== "secret" && !((p.key as string) in vals))
    .map((p) => p.key as string);
  const h = typeof bundle.paramSchemaHash === "string" ? bundle.paramSchemaHash : null;
  const schema = !!row.paramSchemaHash && !!h && row.paramSchemaHash !== h;
  return schema || missing.length ? { schema, missing } : null;
}

/** 묶음을 받았을 때 할 일 — 어긋남 없음 none · 기준 행 자동 생성 create · 적용·되돌리기 대기 중이라 띠만 banner */
export function autoResyncAction(drift: Drift | null, inFlight: number | null): "none" | "create" | "banner" {
  if (!drift) return "none";
  return inFlight === null ? "create" : "banner";
}

/** 자동 기준 행 메모·사건 글 */
export function autoResyncNote(drift: Drift, deviceVersion: number | null): string {
  const why = [drift.schema ? "설정 정의가 바뀜" : null, drift.missing.length ? `새 설정 ${drift.missing.length}개` : null].filter(Boolean).join(" · ");
  return `프로그램이 새 판으로 바뀌어 노트북 프로그램 설정으로 기준을 다시 만들었습니다(${why}, 장비 v${deviceVersion ?? "?"})`;
}
