// 챔버K v2 설정 — 키 하나 웹 검사·사유 문구(순수, 화면과 서버가 같이 쓴다). DB 를 가져오지 않는다.
export type Obj = Record<string, unknown>;
export const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

export type ParamDefLite = {
  key: string; type?: string; min?: number | null; max?: number | null; enum?: unknown[] | null; pattern?: string | null;
  scope?: string; webLocked?: boolean; safety?: string; apply?: string; current?: unknown; default?: unknown;
};

const pyRepr = (v: unknown) => (typeof v === "string" ? `'${v}'` : v === null || v === undefined ? "None"
  : typeof v === "boolean" ? (v ? "True" : "False") : JSON.stringify(v));

/** 키 하나 웹 검사(paramdef.check_value 와 같은 규칙) — 통과하면 null. 키 사이 규칙(crossRules)은 장비가 판단 */
export function checkParamValue(p: ParamDefLite, v: unknown): string | null {
  const t = p.type;
  if (t === "bool") return typeof v === "boolean" ? null : `${p.key}: bool 이어야 함 (받은 값 ${pyRepr(v)})`;
  if (t === "int") {
    if (typeof v !== "number" || !Number.isInteger(v)) return `${p.key}: 정수여야 함 (받은 값 ${pyRepr(v)})`;
  } else if (t === "float") {
    if (typeof v !== "number" || Number.isNaN(v)) return `${p.key}: 숫자여야 함 (받은 값 ${pyRepr(v)})`;
  } else if (t === "str") {
    if (typeof v !== "string") return `${p.key}: 문자열이어야 함 (받은 값 ${pyRepr(v)})`;
    if (p.pattern != null) {
      let re: RegExp | null = null;
      try { re = new RegExp(`^(?:${p.pattern})$`, "u"); } catch { re = null; }
      if (re && !re.test(v)) return `${p.key}: 형식 불일치 ${pyRepr(v)} (형식 ${p.pattern})`;
    }
    return null;
  } else if (t === "enum") {
    return (p.enum ?? []).includes(v) ? null : `${p.key}: 허용값 ${JSON.stringify(p.enum ?? [])} 중 하나여야 함 (받은 값 ${pyRepr(v)})`;
  }
  const n = v as number;
  if (typeof p.min === "number" && n < p.min) return `${p.key}: ${n} < 최소 ${p.min}`;
  if (typeof p.max === "number" && n > p.max) return `${p.key}: ${n} > 최대 ${p.max}`;
  return null;
}

/** config_ack 사유 코드 → 사람 말(묶음 reasons 가 없을 때도) */
export const CONFIG_REASON: Record<string, string> = {
  CONFIG_INVALID: "설정 검사 실패 — 아래 오류(키 사이 규칙 포함)를 고치세요",
  CONFIG_HASH_MISMATCH: "설정 정의가 장비와 다름 — 장비 정의를 다시 읽은 뒤 다시",
  CONFIG_VERSION_STALE: "장비에 이미 더 새 버전이 있음 — 화면을 다시 읽고 다시",
  CONFIG_SECRET_FROM_WEB: "비밀값은 웹에서 보낼 수 없음",
  CONFIG_LOCKED_KEY: "실행 모드·장비 ID 는 웹에서 바꿀 수 없음(노트북 설정 파일로만)",
  CONFIG_H_IN_PROCESS: "공정·히터 운전 중에는 H 등급 설정을 바꿀 수 없음 — 공정이 끝난 뒤 다시",
  CONFIG_NO_PREVIOUS: "되돌릴 이전 버전이 장비에 없음",
};
