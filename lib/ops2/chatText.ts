// 챔버K v2 구글챗 — 이상·안내 글 만들기(순수: DB·환경 변수를 쓰지 않는다 — chat.ts 가 가져다 쓰고, node 로 바로 확인할 수 있다).
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" && v ? v : null);

/** 공정을 멈추지 않는 안내 사건 중 챗으로도 알리는 것(경고 1장, 공정당 한 번) — 묶음 15: tc2 모드 TC1 편차 안내(v1 은 챗 카드 1장) */
export const NOTICE_CODES: ReadonlySet<string> = new Set(["HEATER_TC2_TC1_DEVIATION"]);

/** 이상·안내 글 한 줄 — error ❌ / 그 밖 ⚠️. NOTICE_CODES 는 "이상" 대신 "안내"(공정은 계속) */
export function alertText(base: string, d: Obj, label: string, runName: string | null): string {
  const code = str(d.code) ?? "?";
  const rule = str(d.ruleId);
  const msg = String(d.message ?? "").replace(/\s+/g, " ").trim();
  const icon = d.level === "error" ? "❌" : "⚠️";
  const word = NOTICE_CODES.has(code) && d.level !== "error" ? "안내" : "이상";
  return `${icon} ${base} ${word} — ${label}${label !== code ? ` (${code})` : ""}${rule ? ` · ${rule}` : ""}`
    + `${msg && msg !== label ? ` | ${msg.slice(0, 300)}` : ""}${runName ? ` | 공정 ${runName}` : ""}`;
}

/** 이상 글이 되는 사건 — error 수준, safety 알람 발생(fired, warn 이상), 안내 사건(NOTICE_CODES). PLC 링크 사건은 따로(plc_link) */
export function isAlertEvent(d: Obj): boolean {
  const code = str(d.code);
  if (code === "PLC_DISCONNECTED" || code === "PLC_RECONNECTED") return true;
  if (code && NOTICE_CODES.has(code)) return true;
  const c = isObj(d.context) ? d.context : {};
  if (d.level === "error") return true;
  return c.source === "safety" && c.kind === "fired" && d.level === "warn";
}
