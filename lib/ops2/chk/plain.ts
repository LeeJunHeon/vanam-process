// 챔버K 평소 보기 글(W-16) — 대문자 코드(UPLINK_AUTH_FAILED 등)와 영문 'local' 이 사람 눈에 보이지 않게 하는 도움 함수.
// 화면(components/ops2/chk)과 웹 챗(lib/ops2/chat.ts)이 같이 쓴다. 기록에 남는 값(by·code)은 그대로 두고 보일 때만 바꾼다.
import { SOURCE_NAME } from "./terms";
// 이름은 묶음(eventKinds·reasons·commands)에서 찾고, 없으면(묶음 19 이하·옛 기록) 장비 이름(source)으로 된 일반 이름을 쓴다.

/** 요청자·시작한 사람 — 노트북 경로(by "local")는 "노트북" */
export function byWord(by: unknown): string {
  const s = typeof by === "string" ? by.trim() : "";
  return s === "local" ? "노트북" : s;
}

/** 코드 모양(대문자·밑줄 — UPLINK_AUTH_FAILED, MANUAL_END …) */
export const CODE_RE = /\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/g;
export const isCode = (s: string) => /^[A-Z][A-Z0-9]*_[A-Z0-9_]+$/.test(s) || /^[A-Z]{3,}$/.test(s);

/** 코드 앞자리 → 출처(옛 기록에 context.source 가 없을 때) */
const PREFIX_SOURCE: [RegExp, string][] = [
  [/^UPLINK_/, "uplink"], [/^HEATER_/, "heater"], [/^PLC_/, "plc"], [/^MFC_/, "mfc"], [/^DC_/, "dc"], [/^RFP_/, "rfp"], [/^IG_/, "ig"],
];
const SOURCE_WORD = SOURCE_NAME;      // W-17 — 이름은 terms 한 곳

/** 이름이 없는 사건의 일반 이름 — "웹 연결 기록"·"PLC 기록"·"장비 기록" */
export function genericEventName(source: string | null | undefined, code: string | null | undefined, sourceLabel?: (s: string) => string): string {
  const src = source || PREFIX_SOURCE.find(([re]) => re.test(code ?? ""))?.[1] || "";
  const word = src ? (sourceLabel?.(src) && sourceLabel(src) !== src ? sourceLabel(src) : SOURCE_WORD[src] ?? "") : "";
  return word && !isCode(word) ? `${word} 기록` : "장비 기록";
}

/** 글 속 코드·영문 local 을 지운다(괄호만 남으면 괄호도) */
export function stripCodes(t: string): string {
  return t.replace(CODE_RE, "").replace(/\blocal\b/g, "노트북")
    .replace(/\(\s*[·,]?\s*\)/g, "").replace(/\s*·\s*(?=·|$)/g, "").replace(/\s{2,}/g, " ").trim();
}
