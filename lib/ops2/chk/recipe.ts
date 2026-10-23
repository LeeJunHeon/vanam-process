// 챔버K v2 웹 레시피 검사 — 장비와 같은 계산(TS). 마지막 판단은 장비(RECIPE_INVALID 등).
// 옮긴 것(챔버K rewrite/v2 1859152, EXPORT_VERSION 7):
//   recipe.check_process_row(딜레이 행·zeroIsEmpty 포함)·check_heater_recipe, process_steps.row_to_params, blocks.template_blocks,
//   process_engine._check_rows(행 목록 — 빈 행 건너뛰기·"{i}행: 첫 오류").
// 열 정의는 묶음 recipe.processColumns·heaterStepColumns·heaterGasColumns, 설정값은 묶음 params current(없으면 default).
// igEnabled = IG_ENABLED, rfpulsePresent = RFPULSE_ENABLED(process_engine._start_row 와 같게 — 설정값으로).
// 골든(lib/ops2/chk/golden/web_template_cases.json)을 npm run ops2:golden 이 이 파일로 확인한다.
// 오류·경고 문구는 파이썬 f-string 그대로 — 숫자 모양(repr·:g·.Nf, 반올림은 짝수 쪽)도 파이썬과 같게 만든다.
// JSON 으로 오면 900.0 과 900 이 같은 숫자가 되므로, 정수 값을 파이썬 float 로 찍을 이름(설정의 float 파라미터,
// 골든 행의 "900.0")은 floats 로 따로 받는다. 웹이 보내는 행은 JSON.stringify 라 정수 값은 장비에서도 int 다.
// 이 파일은 아무것도 가져오지 않는다 — node 가 타입만 지우고 바로 실행한다(골든 시험).

/** 이 검사가 맞춘 묶음 버전(골든과 같음) — 묶음 version 이 다르면 화면이 "장비 판단만 믿을 것" 안내 */
export const GOLDEN_EXPORT_VERSION = 7;
/** 챔버K recipe.DELAY_RE.pattern(IGNORECASE) — 골든 시험이 묶음 delayPattern 과 같은지 본다 */
export const DELAY_PATTERN = String.raw`^\s*delay\s*(\d+(?:\.\d+)?)\s*([smhd]?)\s*$`;
const DELAY_RE = new RegExp(DELAY_PATTERN, "i");
const UNIT_SEC: Record<string, number> = { "": 1, s: 1, m: 60, h: 3600, d: 86400 };
/** 수동 시작(PROCESS_START row)은 히터 열을 쓰지 않는다 — 장비가 지우고 검사한다(process_engine.start_manual) */
export const MANUAL_DROP = ["use_heater", "heater_temp", "heater_ramp"] as const;

export type ColDef = {
  name: string; type: string; unit?: string; required: string;
  min?: number | null; max?: number | null; paramMin?: string | null; paramMax?: string | null;
  minExclusive?: boolean; zeroIsEmpty?: boolean; v1Name?: string; desc?: string;
};
export type RecipeDefs = {
  processColumns: ColDef[]; heaterStepColumns: ColDef[]; heaterGasColumns: ColDef[]; delayPattern?: string;
};
export type Row = Record<string, unknown>;
export type Cfg = Readonly<Record<string, unknown>>;
/** 검사 환경 — floats: 정수 값이라도 파이썬 float 로 찍을 이름(설정 키·행 열 이름) */
export type CheckEnv = { defs: RecipeDefs; cfg: Cfg; floats: ReadonlySet<string> };
export type Block = { type: string; params: Record<string, unknown>; label: string; stage: string };

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

function pyStrRepr(s: string): string {
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
class PyValueError extends Error {}
function pyFloat(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string" && /^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?\s*$/.test(v)) return Number(v);
  throw new PyValueError(`float(${typeof v === "string" ? pyStrRepr(v) : String(v)})`);
}
/** float(v or 0) */
const pyFloatOr0 = (v: unknown) => (pyTruthy(v) ? pyFloat(v) : 0);
/** int(v) — float 는 0 쪽으로 자름 */
function pyInt(v: unknown): number {
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "number") return Math.trunc(v);
  if (typeof v === "string" && /^\s*[+-]?\d+\s*$/.test(v)) return Number(v);
  throw new PyValueError(`int(${String(v)})`);
}

// ───────────── 행 검사(recipe.py) ─────────────
const empty = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");
const emptyCol = (c: ColDef, v: unknown) => empty(v) || (!!c.zeroIsEmpty && typeof v === "number" && v === 0);

export function delaySeconds(name: unknown): number | null {
  if (typeof name !== "string") return null;
  const m = DELAY_RE.exec(name);
  if (!m) return null;
  return Number(m[1]) * UNIT_SEC[m[2].toLowerCase()];
}

/** 열의 범위 — param 값이면 설정의 형식, 숫자면 열 정의(파이썬 Col 의 min·max 는 모두 float 로 적혀 있다) */
function bound(c: ColDef, env: CheckEnv, which: "min" | "max"): { v: number; f: boolean } | null {
  const key = which === "min" ? c.paramMin : c.paramMax;
  if (key) {
    const v = env.cfg[key];
    return typeof v === "number" ? { v, f: env.floats.has(key) } : null;
  }
  const v = which === "min" ? c.min : c.max;
  return typeof v === "number" ? { v, f: true } : null;
}

function checkCol(c: ColDef, v: unknown, env: CheckEnv): string | null {
  if (c.type === "bool") return typeof v === "boolean" ? null : `${c.name}: true/false 여야 함`;
  if (c.type === "str") return typeof v === "string" ? null : `${c.name}: 문자열이어야 함`;
  if (typeof v !== "number" || Number.isNaN(v)) return `${c.name}: 숫자여야 함`;
  if (c.type === "int" && !Number.isInteger(v)) return `${c.name}: 정수여야 함`;
  const lo = bound(c, env, "min"), hi = bound(c, env, "max");
  const vs = pyNum(v, env.floats.has(c.name));
  if (lo && (c.minExclusive ? v <= lo.v : v < lo.v)) return `${c.name}: ${vs} ${c.minExclusive ? "≤" : "<"} ${pyNum(lo.v, lo.f)}`;
  if (hi && v > hi.v) return `${c.name}: ${vs} > ${pyNum(hi.v, hi.f)}`;
  return null;
}

function checkCols(cols: ColDef[], row: Row, env: CheckEnv): string[] {
  const errs: string[] = [];
  const known = new Set(cols.map((c) => c.name));
  for (const k of Object.keys(row)) if (!known.has(k)) errs.push(`${k}: 모르는 열`);
  for (const c of cols) {
    const v = row[c.name];
    const need = c.required === "always" || (c.required.startsWith("if:") && row[c.required.slice(3)] === true);
    if (emptyCol(c, v)) {
      if (need) errs.push(`${c.name}: 값 필요`);
      continue;
    }
    const e = checkCol(c, v, env);
    if (e) errs.push(e);
  }
  return errs;
}

/** 레시피 rf_pulse_freq(kHz) → 장비 Hz = int(round(kHz × 1000)) */
export function pulseFreqHz(khz: unknown): number | null {
  return empty(khz) ? null : pyRound(pyFloat(khz) * 1000.0);
}

function pulseEdgeViolation(freqHz: number, duty: number, minEdge: number): string | null {
  if (minEdge <= 0 || freqHz <= 0) return null;
  const on = duty / 100.0 / freqHz * 1e6;
  const off = (100.0 - duty) / 100.0 / freqHz * 1e6;
  if (on >= minEdge - 1e-6 && off >= minEdge - 1e-6) return null;
  return `${pyG(freqHz)} Hz·${pyG(duty)}% → ON ${pyFixed(on, 1)} µs / OFF ${pyFixed(off, 1)} µs < ${pyG(minEdge)} µs`;
}

export type RowResult = { clean: Row | null; errors: string[]; warnings: string[] };

/** recipe.check_process_row — (정리된 행 또는 null, 오류, 경고). 딜레이 행은 {delay_s, process_name} */
export function checkProcessRow(row: Row, env: CheckEnv): RowResult {
  const warns: string[] = [];
  const name = row.process_name;
  const d = delaySeconds(name);
  if (d !== null) {
    const extra = Object.entries(row).filter(([k, v]) => k !== "process_name" && !empty(v) && v !== false).map(([k]) => k);
    if (extra.length) return { clean: null, errors: [`딜레이 행에 다른 값: [${extra.map(pyStrRepr).join(", ")}]`], warnings: warns };
    return { clean: { delay_s: d, process_name: name }, errors: [], warnings: warns };
  }
  const cols = env.defs.processColumns;
  const errs = checkCols(cols, row, env);
  if (errs.length) return { clean: null, errors: errs, warnings: warns };
  const cfg = env.cfg;
  const r: Row = { ...row };
  for (const c of cols) if (c.zeroIsEmpty && c.name in r && emptyCol(c, r[c.name])) delete r[c.name];
  try {
    if (!(r.ar === true || r.o2 === true)) errs.push("가스: Ar 또는 O2 중 하나 이상");
    const pt = pyFloatOr0(r.process_time), sd = pyFloatOr0(r.shutter_delay);
    if (pt <= 0 && sd <= 0) errs.push("시간: process_time 또는 shutter_delay 중 하나는 0 보다 커야 함");
    if (!["use_dc", "use_rf", "use_rf_pulse"].some((k) => r[k] === true)) errs.push("파워: DC·RF·RF Pulse 중 하나 이상");
    if (r.use_dc_delay === true && r.use_dc !== true) {
      warns.push("use_dc_delay 는 DC 를 쓸 때만 — 무시");
      r.use_dc_delay = false;
    }
    if (r.base_pressure !== undefined && r.base_pressure !== null && !pyTruthy(cfg.IG_ENABLED)) {
      errs.push("base_pressure: 이온 게이지가 꺼져 있음(IG_ENABLED=false)");
    }
    if (r.use_rf_pulse === true && !pyTruthy("RFPULSE_ENABLED" in cfg ? cfg.RFPULSE_ENABLED : true)) {
      errs.push("RF Pulse: RFPULSE_ENABLED=false");
    }
    if (r.use_rf_pulse === true) {
      const f = r.rf_pulse_freq, du = r.rf_pulse_duty;
      if (!empty(f)) {
        const hz = pyFloat(f) * 1000.0;
        const lo = pyFloat(cfg.RFPULSE_PULSE_FREQ_MIN_HZ), hi = pyFloat(cfg.RFPULSE_PULSE_FREQ_MAX_HZ);
        if (!(lo <= hz && hz <= hi)) {
          errs.push(`RF Pulse: 주파수 ${pyG(pyFloat(f))} kHz 가 범위 ${pyG(lo / 1000.0)}~${pyG(hi / 1000.0)} kHz 밖`);
        }
      }
      if (!empty(f) && !empty(du)) {
        const e = pulseEdgeViolation(pulseFreqHz(f) as number, pyFloat(du), pyFloat(cfg.RFPULSE_PULSE_MIN_EDGE_US));
        if (e) errs.push(`RF Pulse: ${e}`);
      }
    }
    if (r.use_heater === true) {
      if (!pyTruthy(cfg.HEATER_ENABLED)) errs.push("히터: HEATER_ENABLED=false");
      const ramp = r.heater_ramp;
      if (empty(ramp) || ramp === 0 || ramp === false) {
        r.heater_ramp = cfg.HEATER_RAMP_RATE_C_PER_MIN;
      } else if (typeof ramp === "number" && ramp < 6.0) {
        warns.push(`heater_ramp ${pyNum(ramp, env.floats.has("heater_ramp"))} < 6 → 6 (래더 분해능)`);
        r.heater_ramp = 6.0;
      }
    }
  } catch (e) {
    if (!(e instanceof PyValueError)) throw e;
    errs.push(`값 형식: ${e.message} — 장비가 처리하지 못하는 값`);
  }
  return { clean: errs.length ? null : r, errors: errs, warnings: warns };
}

/** recipe.check_heater_recipe — (오류, 경고). steps 는 스텝 목록, gas 는 첫 행 가스(없으면 null) */
export function checkHeaterRecipe(steps: Row[], gas: Row | null, env: CheckEnv): { errors: string[]; warnings: string[] } {
  const errs: string[] = [], warns: string[] = [];
  const max = env.cfg.HEATER_RECIPE_MAX_STEPS;
  if (!steps.length) errs.push("스텝 없음");
  if (typeof max === "number" && steps.length > max) {
    errs.push(`스텝 ${steps.length} > HEATER_RECIPE_MAX_STEPS ${pyNum(max, env.floats.has("HEATER_RECIPE_MAX_STEPS"))}`);
  }
  steps.forEach((s, j) => {
    const i = j + 1;
    for (const e of checkCols(env.defs.heaterStepColumns, s, env)) errs.push(`스텝 ${i}: ${e}`);
    if (!empty(s.ramp_c_per_min) && !empty(s.ramp_min)) errs.push(`스텝 ${i}: ramp_c_per_min 과 ramp_min 을 함께 쓸 수 없음`);
    const r = s.ramp_c_per_min;
    if (typeof r === "number" && r > 0 && r < 6) warns.push(`스텝 ${i}: 램프 ${pyNum(r, false)} < 6 — 파이썬 램프로 실행`);
  });
  if (gas && pyTruthy(gas)) {
    for (const e of checkCols(env.defs.heaterGasColumns, gas, env)) errs.push(`가스: ${e}`);
    if ((gas.use_ar === true || gas.use_o2 === true) && empty(gas.wp_mtorr)) errs.push("가스: 가스를 쓰면 wp_mtorr 필요");
  }
  return { errors: errs, warnings: warns };
}

// ───────────── params(process_steps.row_to_params) ─────────────
export function rowToParams(row: Row, cfg: Cfg): Record<string, unknown> {
  const ar = row.ar === true, o2 = row.o2 === true;
  const useDc = row.use_dc === true, useRf = row.use_rf === true, useRfp = row.use_rf_pulse === true;
  const useH = row.use_heater === true;
  const num = (k: string) => pyFloatOr0(row[k]);
  const or = (v: unknown, d: unknown) => (pyTruthy(v) ? v : d);
  const duty = row.rf_pulse_duty;
  return {
    process_name: or(row.process_name, ""),
    use_ar_gas: ar, use_o2_gas: o2,
    ar_flow: ar ? num("ar_flow") : 0.0, o2_flow: o2 ? num("o2_flow") : 0.0,
    selected_gas: ar || !o2 ? "Ar" : "O2",
    mfc_flow: ar ? num("ar_flow") : num("o2_flow"),
    base_pressure: num("base_pressure"),
    sp1_set: num("working_pressure"),
    dc_power: useDc ? num("dc_power") : 0.0,
    rf_power: useRf ? num("rf_power") : 0.0,
    shutter_delay: num("shutter_delay"), process_time: num("process_time"),
    rf_offset: pyFloat(cfg.RF_CAL_OFFSET), rf_param: pyFloat(cfg.RF_CAL_GAIN),
    use_rf_pulse: useRfp, rf_pulse_power: useRfp ? num("rf_pulse_power") : 0.0,
    rf_pulse_freq_hz: useRfp ? pulseFreqHz(row.rf_pulse_freq) : null,
    rf_pulse_duty: useRfp && duty !== null && duty !== undefined && duty !== "" ? pyInt(duty) : null,
    use_g1: row.gun1 === true, use_g2: row.gun2 === true,
    use_dc_delay: row.use_dc_delay === true && useDc,
    use_heater: useH, heater_temp: useH ? num("heater_temp") : 0.0,
    heater_ramp: useH ? num("heater_ramp") : 0.0,
    g1_target_name: or(row.g1_target, ""), g2_target_name: or(row.g2_target, ""),
  };
}

// ───────────── 기본 템플릿(blocks.template_blocks) ─────────────
function basePressureOf(p: Record<string, unknown>): number {
  const v = p.base_pressure;
  if (empty(v)) return 0.0;
  try {
    return pyFloat(v);
  } catch {
    return 0.0;
  }
}

export function templateBlocks(p: Record<string, unknown>, cfg: Cfg, igEnabled: boolean, rfpulsePresent: boolean): Block[] {
  const B = (type: string, label: string, stage: string, params: Record<string, unknown>): Block => ({ type, params, label, stage });
  const fl = (v: unknown) => pyFloatOr0(v);
  let chans: number[] = [];
  if (pyTruthy(p.use_ar_gas)) chans.push(1);
  if (pyTruthy(p.use_o2_gas)) chans.push(2);
  if (!chans.length) chans = [(p.selected_gas ?? "Ar") === "Ar" ? 1 : 2];
  const ar = chans.includes(1), o2 = chans.includes(2);
  const defaultFlow = fl(p.mfc_flow);
  const sp1 = fl(p.sp1_set);
  const out: Block[] = [
    B("pre_clean", "", "", { dc: true, rf: true, rfpulse: rfpulsePresent, settle_sec: null }),
    B("gas_prep", "", "", { ar, o2 }),
  ];
  if (pyTruthy(p.use_heater) && fl(p.heater_temp) > 0.0) {
    const temp = pyFloat(p.heater_temp);
    const ramp = fl(p.heater_ramp) || pyFloat(cfg.HEATER_RAMP_RATE_C_PER_MIN);
    out.push(B("heater_ramp", "", "", { target_c: temp, ramp_c_per_min: ramp }), B("heater_wait", "", "", {}));
  }
  const bp = basePressureOf(p);
  if (bp > 0 && igEnabled) out.push(B("base_wait", "", "", { target_torr: bp }));
  out.push(B("gas_intro", "", "", {
    ar, ar_flow: ar ? fl(p.ar_flow ?? defaultFlow) : null,
    o2, o2_flow: o2 ? fl(p.o2_flow ?? defaultFlow) : null, zero: true,
  }));
  const stab = pyRound(pyFloat(cfg.GAS_STABILIZE_SEC));
  const pressure = (sp: number, value: number | null, label: string, stage: string, wait: boolean) =>
    B("pressure", label, stage, {
      sp, value, set: true, select: true, wait, tol_ratio: null, stable_sec: null, timeout_sec: null, on_timeout: null,
    });
  out.push(pressure(4, null, "SP4", "GAS_STABILIZE", false));
  out.push(B("wait", `압력 안정화 대기(${stab}초)`, "GAS_STABILIZE", { sec: stab, watch: null }));
  const guns = [["g1", "use_g1"], ["g2", "use_g2"]].filter(([, k]) => pyTruthy(p[k])).map(([g]) => g);
  if (guns.length) out.push(B("shutter", "건 셔터 열기", "GUN_SHUTTER", { action: "open", targets: guns }));
  const dcW = fl(p.dc_power), rfW = fl(p.rf_power);
  const rfpW = pyTruthy(p.use_rf_pulse) ? fl(p.rf_pulse_power) : 0.0;
  const fhz = p.rf_pulse_freq_hz;
  out.push(B("power_on", "", "", {
    dc_power: dcW || null, rf_power: rfW || null, rfp_power: rfpW || null,
    rfp_freq_khz: rfpW && fhz !== null && fhz !== undefined ? (fhz as number) / 1000.0 : null,
    rfp_duty: rfpW ? p.rf_pulse_duty ?? null : null, wait: true, timeout_sec: null,
  }));
  const sp3 = pyFloat(cfg.SP3_MTORR), sp2 = pyFloat(cfg.SP2_MTORR);
  for (const [n, spv, lab] of [[3, sp3, "Stage1(SP3)"], [2, sp2, "Stage2(SP2)"]] as const) {
    if (sp1 < spv) out.push(pressure(n, spv, lab, `PRESSURE_SP${n}`, true));
  }
  out.push(pressure(1, sp1, `Stage3(SP1=${pyFixed(sp1, 2)})`, "PRESSURE_SP1", true));
  const dcd = pyInt(cfg.DC_POWER_DELAY_SEC);
  if (pyTruthy(p.use_dc_delay) && dcW > 0.0 && dcd > 0) {
    out.push(B("wait", `DC Power 안정화 대기 ${dcd}s`, "DC_DELAY", { sec: dcd, watch: null }));
  }
  const sd = Math.max(0, Math.ceil(fl(p.shutter_delay) * 60));
  if (sd > 0) out.push(B("wait", `Shutter Delay ${sd}s`, "SHUTTER_DELAY", { sec: sd, watch: { dc: true } }));
  const pt = Math.max(0, Math.ceil(fl(p.process_time) * 60));
  if (fl(p.process_time) > 0 && pt > 0) out.push(B("main", "", "", { sec: pt, close: false, watch: null }));
  out.push(B("end_stop", "", "", { skip: null }));
  return out;
}

// ───────────── 묶음 → 검사 환경 ─────────────
type BundleLike = {
  version?: number;
  params?: { key: string; type?: string; current?: unknown; default?: unknown }[];
  recipe?: Partial<RecipeDefs>;
} | null | undefined;

/** 묶음의 열 정의와 설정값(current, 없으면 default). 열 정의가 없으면 null(검사 안 함) */
export function checkEnvOf(b: unknown): CheckEnv | null {
  const bundle = b as BundleLike;
  const rc = bundle?.recipe;
  if (!rc || !Array.isArray(rc.processColumns) || !Array.isArray(rc.heaterStepColumns) || !Array.isArray(rc.heaterGasColumns)) {
    return null;
  }
  const cfg: Record<string, unknown> = {};
  const floats = new Set<string>();
  for (const p of bundle?.params ?? []) {
    if (!p || typeof p.key !== "string") continue;
    cfg[p.key] = p.current ?? p.default ?? null;
    if (p.type === "float") floats.add(p.key);
  }
  return { defs: rc as RecipeDefs, cfg, floats };
}

/** 묶음 version 이 이 검사가 맞춘 것과 다른가 — 화면 안내(검사는 그대로, 막지 않음) */
export function checkOutdated(b: unknown): boolean {
  const bundle = b as BundleLike;
  return typeof bundle?.version === "number" && bundle.version !== GOLDEN_EXPORT_VERSION;
}

// ───────────── 레시피 하나(행 목록) ─────────────
export type RowCheck = {
  kind: "empty" | "delay" | "row" | "blocks" | "bad";
  errors: string[]; warnings: string[];
  clean: Row | null;
  blocks: Block[] | null;               // 기본 템플릿(오류가 없는 v1 행만)
};
export type RecipeCheck = {
  rows: RowCheck[];
  listErrors: string[];                 // 행 목록 전체(비어 있음·내용 있는 행 없음)
  errors: number; warnings: number;
  first: string | null;                 // 장비가 적재를 거부할 때의 detail 과 같은 모양 — "2행: dc_power: 900 > 500.0"
};

/** 빈 행 — 장비 _check_rows 와 같게 값이 모두 None·""·False(0 도 == False)면 건너뜀 */
export function rowHasContent(r: Row): boolean {
  return Object.values(r).some((v) => !(v === null || v === undefined || v === "" || v === false || v === 0));
}

/** process_engine._check_rows + 행마다 기본 템플릿 — 장비는 첫 오류에서 멈추지만 화면은 모든 행을 본다 */
export function checkProcessRecipe(rows: unknown, env: CheckEnv): RecipeCheck {
  const out: RowCheck[] = [];
  const listErrors: string[] = [];
  let first: string | null = null;
  const ig = pyTruthy(env.cfg.IG_ENABLED), rfp = pyTruthy(env.cfg.RFPULSE_ENABLED);
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) listErrors.push("행 목록이 비어 있음");
  let content = 0;
  list.forEach((r, j) => {
    const i = j + 1;
    if (!r || typeof r !== "object" || Array.isArray(r)) {
      out.push({ kind: "bad", errors: ["객체가 아님"], warnings: [], clean: null, blocks: null });
      first ??= `${i}행: 객체가 아님`;
      return;
    }
    const row = r as Row;
    if (!rowHasContent(row)) {
      out.push({ kind: "empty", errors: [], warnings: [], clean: null, blocks: null });
      return;
    }
    content += 1;
    if ("blocks" in row) {
      out.push({ kind: "blocks", errors: [], warnings: ["블록 행 — 웹 검사 없음(장비가 검사)"], clean: null, blocks: null });
      return;
    }
    const c = checkProcessRow(row, env);
    let blocks: Block[] | null = null;
    if (c.clean && c.clean.delay_s === undefined) {
      try {
        blocks = templateBlocks(rowToParams(c.clean, env.cfg), env.cfg, ig, rfp);
      } catch (e) {
        if (!(e instanceof PyValueError)) throw e;
        c.errors.push(`값 형식: ${e.message} — 장비가 처리하지 못하는 값`);
      }
    }
    if (c.errors.length) first ??= `${i}행: ${c.errors[0]}`;
    out.push({ kind: c.clean?.delay_s !== undefined ? "delay" : "row", errors: c.errors, warnings: c.warnings,
               clean: c.errors.length ? null : c.clean, blocks });
  });
  if (list.length && !content) listErrors.push("내용 있는 행이 없음");
  if (!first && listErrors.length) first = listErrors[0];
  return {
    rows: out, listErrors, first,
    errors: listErrors.length + out.reduce((n, r) => n + r.errors.length, 0),
    warnings: out.reduce((n, r) => n + r.warnings.length, 0),
  };
}

/** 수동 시작 한 행 — 장비처럼 히터 열을 지운 행 */
export function manualRow(row: Row): Row {
  const r = { ...row };
  for (const k of MANUAL_DROP) delete r[k];
  return r;
}
