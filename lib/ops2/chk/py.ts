// 챔버K v2 웹 검사의 파이썬 모양 — 숫자 문구(repr·:g·.Nf·.NE, 반올림은 짝수 쪽)·repr·str·float()·int()·bool().
// 레시피 행 검사(recipe.ts)와 블록 검사(blocks.ts)가 같이 쓴다. 아무것도 가져오지 않는다(골든 시험이 node 로 바로 실행).

// ───────────── 파이썬 숫자 모양 ─────────────
/** 유한한 double 의 정확한 십진 값 = n × 10^e (n ≥ 0) */
function exact(x: number): { n: bigint; e: number } {
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, Math.abs(x));
  const bits = dv.getBigUint64(0);
  const be = Number((bits >> BigInt(52)) & BigInt(0x7ff));
  const frac = bits & ((BigInt(1) << BigInt(52)) - BigInt(1));
  const m = be === 0 ? frac : frac | (BigInt(1) << BigInt(52));
  const k = be === 0 ? -1074 : be - 1075;
  if (k >= 0) return { n: m << BigInt(k), e: 0 };
  return { n: m * BigInt(5) ** BigInt(-k), e: k };
}

/** |x| 를 10^q 단위 정수로 반올림(같은 거리면 짝수 — 파이썬 format·round 와 같게) */
function roundAt(x: number, q: number): bigint {
  const { n, e } = exact(x);
  if (e >= q) return n * BigInt(10) ** BigInt(e - q);
  const d = BigInt(10) ** BigInt(q - e);
  const r = n / d, rem = n % d;
  const twice = rem * BigInt(2);
  if (twice > d || (twice === d && r % BigInt(2) === BigInt(1))) return r + BigInt(1);
  return r;
}

const neg = (x: number) => x < 0 || Object.is(x, -0);

/** f"{x:.{n}f}" */
export function pyFixed(x: number, n: number): string {
  if (!Number.isFinite(x)) return Number.isNaN(x) ? "nan" : x > 0 ? "inf" : "-inf";
  const s = roundAt(x, -n).toString().padStart(n + 1, "0");
  const body = n > 0 ? `${s.slice(0, s.length - n)}.${s.slice(s.length - n)}` : s;
  return (neg(x) ? "-" : "") + body;
}

/** f"{x:g}"(정밀도 6) */
export function pyG(x: number, p = 6): string {
  if (!Number.isFinite(x)) return Number.isNaN(x) ? "nan" : x > 0 ? "inf" : "-inf";
  const sign = neg(x) ? "-" : "";
  if (x === 0) return `${sign}0`;
  const { n, e } = exact(x);
  let E = n.toString().length + e - 1;                 // 맨 앞 자리의 10 지수
  let r = roundAt(x, E - p + 1);
  if (r.toString().length > p) {                       // 올림으로 자리가 늘었다(9.999995 → 10.0000)
    E += 1;
    r = roundAt(x, E - p + 1);
  }
  const digits = r.toString().padStart(p, "0");
  if (E >= -4 && E < p) {
    const s = pyFixed(Math.abs(x), Math.max(p - 1 - E, 0));
    return sign + (s.includes(".") ? s.replace(/\.?0+$/, "") : s);
  }
  const mant = (digits[0] + (digits.length > 1 ? `.${digits.slice(1)}` : "")).replace(/\.?0+$/, "");
  return `${sign}${mant}e${E < 0 ? "-" : "+"}${String(Math.abs(E)).padStart(2, "0")}`;
}

/** repr(float) — 가장 짧은 자리(JS 와 같음), 모양만 파이썬(1e-05·900.0·1e+16) */
export function pyFloatRepr(x: number): string {
  if (!Number.isFinite(x)) return Number.isNaN(x) ? "nan" : x > 0 ? "inf" : "-inf";
  const sign = neg(x) ? "-" : "";
  if (x === 0) return `${sign}0.0`;
  const [m, ex] = Math.abs(x).toExponential().split("e");
  const D = m.replace(".", ""), E = Number(ex);
  if (E >= -4 && E < 16) {
    if (E < 0) return `${sign}0.${"0".repeat(-E - 1)}${D}`;
    const ip = D.length > E + 1 ? D.slice(0, E + 1) : D.padEnd(E + 1, "0");
    const fp = D.length > E + 1 ? D.slice(E + 1) : "0";
    return `${sign}${ip}.${fp}`;
  }
  return `${sign}${D[0]}${D.length > 1 ? `.${D.slice(1)}` : ""}e${E < 0 ? "-" : "+"}${String(Math.abs(E)).padStart(2, "0")}`;
}

/** f"{v}" — 숫자는 float 면 repr(float), 아니면 int */
export function pyNum(v: number, isFloat: boolean): string {
  if (isFloat || !Number.isInteger(v)) return pyFloatRepr(v);
  return BigInt(v).toString();
}

export function pyStrRepr(s: string): string {
  const q = s.includes("'") && !s.includes('"') ? '"' : "'";
  const body = s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t")
    .split(q).join(`\\${q}`);
  return `${q}${body}${q}`;
}

/** round(x) — 짝수 쪽 */
export function pyRound(x: number): number {
  const f = Math.floor(x), d = x - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

/** bool(v) */
export function pyTruthy(v: unknown): boolean {
  if (v === null || v === undefined || v === false || v === "" || v === 0) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v as object).length > 0;
  return true;
}

/** float(v) — 숫자·bool·숫자 글만. 파이썬이 ValueError 를 내는 값은 오류 */
export class PyValueError extends Error {}
export function pyFloat(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string" && /^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?\s*$/.test(v)) return Number(v);
  throw new PyValueError(`float(${typeof v === "string" ? pyStrRepr(v) : String(v)})`);
}
/** float(v or 0) */
export const pyFloatOr0 = (v: unknown) => (pyTruthy(v) ? pyFloat(v) : 0);
/** int(v) — float 는 0 쪽으로 자름 */
export function pyInt(v: unknown): number {
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "number") return Math.trunc(v);
  if (typeof v === "string" && /^\s*[+-]?\d+\s*$/.test(v)) return Number(v);
  throw new PyValueError(`int(${String(v)})`);
}
/** f"{x:.{n}E}" */
export function pyExp(x: number, n: number): string {
  if (!Number.isFinite(x)) return Number.isNaN(x) ? "NAN" : x > 0 ? "INF" : "-INF";
  const sign = neg(x) ? "-" : "";
  let E = 0;
  let r = BigInt(0);
  if (x !== 0) {
    const { n: m, e } = exact(x);
    E = m.toString().length + e - 1;
    r = roundAt(x, E - n);
    if (r.toString().length > n + 1) {                 // 올림으로 자리가 늘었다(9.96 → 1.0E+01)
      E += 1;
      r = roundAt(x, E - n);
    }
  }
  const d = r.toString().padStart(n + 1, "0");
  return `${sign}${d[0]}${n > 0 ? `.${d.slice(1)}` : ""}E${E < 0 ? "-" : "+"}${String(Math.abs(E)).padStart(2, "0")}`;
}

/** repr(v) — JSON 값(숫자는 정수 값이면 int 로 본다) */
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

/** str(v) — 숫자는 isFloat 면 repr(float) */
export const pyStr = (v: unknown, isFloat = false): string =>
  typeof v === "string" ? v : typeof v === "number" ? pyNum(v, isFloat) : pyRepr(v);

/** 빈 값 — None 또는 공백뿐인 문자열(숫자 0 은 빈 값 아님) */
export const empty = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");
export const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
