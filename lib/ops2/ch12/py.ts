// 챔버12 웹 검사의 파이썬 모양 도우미 — 챔버K lib/ops2/chk/py.ts(숫자 문구 :g·.Nf·repr(float))를 가져다 쓰고,
// 챔버12 v1 행 검사가 더 필요로 하는 것만 여기 둔다(chk 파일은 고치지 않는다).
//  - 파이썬 str.strip()·\s 의 공백 집합(JS trim 과 다름: \x1c~\x1f·\x85 는 공백, ﻿ 는 공백 아님)
//  - float(글): 밑줄(1_000)·inf·nan·유니코드 숫자(２０·١٠٠) 까지 파이썬 문법 그대로, 안 되면 PyError("ValueError")
//  - int(float): inf → OverflowError, nan → ValueError. round(x)·round(x, n)(짝수 쪽, 정확한 이진값 기준)
//  - repr(str): 출력할 수 없는 글자(\p{C}·\p{Z} — 공백 제외)는 \xNN·\uNNNN·\UNNNNNNNN
//  - sorted(글 목록): 코드 포인트 순서. max·min: 파이썬처럼 nan 을 비교 순서대로
import { pyFixed, pyFloatRepr, pyG, pyNum, pyTruthy } from "../chk/py";

export { pyFixed, pyFloatRepr, pyG, pyNum, pyTruthy };

/** 파이썬 예외 자리 — name 은 파이썬 예외 이름(골든 exception 과 비교) */
export class PyError extends Error {
  pyName: string;
  constructor(pyName: string, msg = "") {
    super(`${pyName}: ${msg}`);
    this.pyName = pyName;
  }
}

// 파이썬 str.isspace() 글자(= re \s, str.strip() 기본)
const WS = "\\t\\n\\x0b\\x0c\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
export const PY_WS = `[${WS}]`;
const STRIP_RE = new RegExp(`^[${WS}]+|[${WS}]+$`, "g");

/** s.strip() */
export const pyStrip = (s: string): string => s.replace(STRIP_RE, "");

const ND_RE = /\p{Nd}/u;
/** 유니코드 10진 숫자 → ASCII(파이썬 float()·int()·re \d 가 받는 숫자). Nd 는 0~9 가 이어진 묶음이라 묶음 시작에서 센다 */
export function asciiDigits(s: string): string {
  let out = "";
  for (const ch of s) {
    const cp = ch.codePointAt(0) as number;
    if (cp < 128 || !ND_RE.test(ch)) {
      out += ch;
      continue;
    }
    let start = cp;
    while (start > 0 && ND_RE.test(String.fromCodePoint(start - 1))) start -= 1;
    out += String((cp - start) % 10);
  }
  return out;
}

const D = "\\d(?:_?\\d)*";
const FLOAT_RE = new RegExp(`^[+-]?(?:(?:${D}(?:\\.(?:${D})?)?|\\.${D})(?:[eE][+-]?${D})?|inf|infinity|nan)$`, "i");

/** float(s) — 글 하나. 파이썬이 ValueError 를 내는 글이면 PyError */
export function pyFloatStr(s: string): number {
  const t = asciiDigits(pyStrip(s));
  if (!FLOAT_RE.test(t)) throw new PyError("ValueError", `could not convert string to float: ${pyStrRepr(s)}`);
  const low = t.toLowerCase().replace(/^[+-]/, "");
  const neg = t.startsWith("-");
  if (low === "nan") return NaN;
  if (low === "inf" || low === "infinity") return neg ? -Infinity : Infinity;
  return Number(t.replace(/_/g, ""));
}

/** float(v) — 숫자·bool·글. 그 밖(None·목록 등)은 TypeError */
export function pyFloatAny(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string") return pyFloatStr(v);
  throw new PyError("TypeError", "float() argument");
}

/** int(x) — float 를 0 쪽으로 자름. inf·nan 은 예외 */
export function pyIntOfFloat(x: number): number {
  if (Number.isNaN(x)) throw new PyError("ValueError", "cannot convert float NaN to integer");
  if (!Number.isFinite(x)) throw new PyError("OverflowError", "cannot convert float infinity to integer");
  return Math.trunc(x);
}

/** int(v) — 숫자·bool·정수 글(밑줄·유니코드 숫자 포함). 그 밖은 예외 */
export function pyIntAny(v: unknown): number {
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "number") return pyIntOfFloat(v);
  if (typeof v === "string") {
    const t = asciiDigits(pyStrip(v));
    if (/^[+-]?\d(?:_?\d)*$/.test(t)) return Number(t.replace(/_/g, ""));
    throw new PyError("ValueError", `invalid literal for int(): ${pyStrRepr(v)}`);
  }
  throw new PyError("TypeError", "int() argument");
}

/** round(x) — 짝수 쪽, 정수. inf·nan 은 예외 */
export function pyRoundInt(x: number): number {
  pyIntOfFloat(x);
  const f = Math.floor(x), d = x - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

/** round(x, n) — 정확한 이진값 기준 짝수 쪽(파이썬 float.__round__) */
export function pyRoundN(x: number, n: number): number {
  if (!Number.isFinite(x)) return x;
  return Number(pyFixed(x, n));
}

/** max(a, b) — 파이썬 순서(b > a 일 때만 b) */
export const pyMax = (a: number, b: number): number => (b > a ? b : a);
/** min(a, b) */
export const pyMin = (a: number, b: number): number => (b < a ? b : a);

// 파이썬 str.isprintable() 이 거짓인 글자(공백 ' ' 은 출력 가능)
const NONPRINT_RE = /[\p{C}\p{Z}]/u;
/** repr(str) */
export function pyStrRepr(s: string): string {
  const q = s.includes("'") && !s.includes('"') ? '"' : "'";
  let body = "";
  for (const ch of s) {
    const cp = ch.codePointAt(0) as number;
    if (ch === "\\") body += "\\\\";
    else if (ch === q) body += `\\${q}`;
    else if (ch === "\n") body += "\\n";
    else if (ch === "\r") body += "\\r";
    else if (ch === "\t") body += "\\t";
    else if (ch !== " " && NONPRINT_RE.test(ch)) {
      const h = cp.toString(16);
      body += cp < 0x100 ? `\\x${h.padStart(2, "0")}` : cp < 0x10000 ? `\\u${h.padStart(4, "0")}` : `\\U${h.padStart(8, "0")}`;
    } else body += ch;
  }
  return `${q}${body}${q}`;
}

/** repr(v) — JSON 값(숫자는 정수 값이면 int 로 본다 — JSON 의 5.0 과 5 는 웹에서 같다) */
export function pyRepr(v: unknown): string {
  if (v === null || v === undefined) return "None";
  if (typeof v === "boolean") return v ? "True" : "False";
  if (typeof v === "number") return pyNum(v, false);
  if (typeof v === "string") return pyStrRepr(v);
  if (Array.isArray(v)) return `[${v.map(pyRepr).join(", ")}]`;
  if (typeof v === "object") {
    return `{${Object.entries(v as object).map(([k, x]) => `${pyStrRepr(k)}: ${pyRepr(x)}`).join(", ")}}`;
  }
  return String(v);
}

/** str(v) — 글은 그대로, 그 밖은 repr(숫자는 isFloat 면 repr(float)) */
export const pyStr = (v: unknown, isFloat = false): string =>
  typeof v === "string" ? v : typeof v === "number" ? pyNum(v, isFloat) : pyRepr(v);

/** 코드 포인트 순서 비교(파이썬 sorted 의 글 순서) */
export function cmpCodePoint(a: string, b: string): number {
  const A = Array.from(a), B = Array.from(b);
  for (let i = 0; i < Math.min(A.length, B.length); i++) {
    const x = A[i].codePointAt(0) as number, y = B[i].codePointAt(0) as number;
    if (x !== y) return x - y;
  }
  return A.length - B.length;
}
export const pySorted = (xs: Iterable<string>): string[] => [...xs].sort(cmpCodePoint);

/** 글 길이(코드 포인트 수 — 파이썬 len) */
export const pyLen = (s: string): number => Array.from(s).length;

/** 빈 값 — None 또는 공백뿐인 글(파이썬 str.strip 기준). 숫자 0 은 빈 값 아님 */
export const pyEmpty = (v: unknown): boolean => v === null || v === undefined || (typeof v === "string" && pyStrip(v) === "");
export const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
/** isinstance(v, (int, float)) and not bool and not nan */
export const isNum = (v: unknown): v is number => typeof v === "number" && !Number.isNaN(v);
/** dict.get(k, d) — 키가 있으면(값이 null 이어도) 그 값 */
export const pyGet = (o: Record<string, unknown>, k: string, d: unknown = null): unknown =>
  Object.prototype.hasOwnProperty.call(o, k) ? o[k] : d;

/** 파이썬 h/m/s 기간 패턴 — 숫자 \d 는 유니코드 숫자도 받는다(asciiDigits 뒤에 쓴다) */
export const HMS = "(?:(\\d+(?:\\.\\d+)?)h)?(?:(\\d+(?:\\.\\d+)?)m)?(?:(\\d+(?:\\.\\d+)?)s)?";

/** :g·:.Nf 를 숫자 문구에(가져다 쓰는 쪽이 짧게) */
export const g = (x: number): string => pyG(x);
export const fx = (x: number, n: number): string => pyFixed(x, n);
export const fr = (x: number): string => pyFloatRepr(x);
