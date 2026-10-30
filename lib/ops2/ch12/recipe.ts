// 챔버12 웹 v1 행 레시피 검사 — 장비와 같은 계산(TS). 마지막 판단은 장비.
// 옮긴 것(Chamber.Total_program rewrite/v2 — v2/ch12):
//   recipe_check.check_raw_rows·e230_message·e230_popup(E230 행 값 검사 — 파일을 읽은 직후 원본 행 전수, 최대 20건),
//   recipe_check.check_norm_params·check_rf_pulse(시작 전 값 검사 — 정규화한 공정 params),
//   recipe.plan_row·delay_of·mark_test_row·parse_duration_runtime·normalize_row·thickness_mode_of(행 종류·정규화),
//   blocks_expand.template_blocks·template_from_row, process_sequence.mid_change_plan·thickness_conflict·
//   row_test_duration_sec·power_kwargs, process_steps.common_info·heater_text·unsupported_logs·pulse_set_message·
//   parse_duration_pc(v1 행 → 기본 템플릿 블록·v1 로그).
// 표(열 이름·T/F 글자·범위·최대 건수·히터·DC Pulse 한도)는 정의(blocks.ts Ch12Defs.recipe)에서 읽는다.
// 숫자 문구: 정규화 값의 형식(float·int)은 열마다 정해져 있어(normalize_row) 그 형식으로 찍는다.
// 행 값은 CSV 처럼 글로 오는 것을 기준으로 한다(숫자 값은 str() 로 — JSON 의 5.0 은 웹에서 5 라 문구가 '5' 가 된다).
// 골든 lib/ops2/ch12/golden/web_ch12_template.json·web_ch12_recipe_check.json 을 npm run ops2:golden 이 확인한다.
import { capsFromCfg, checkDcPulse, heaterLimitC, rfpFreqMaxKhz, stepCfg, type Caps, type Cfg, type Ch12Defs } from "./blocks";
import {
  asciiDigits, fr, fx, g, HMS, isNum, isObj, PY_WS, PyError, pyFloatAny, pyFloatStr, pyGet, pyIntOfFloat, pyMax, pyNum,
  pyRepr, pyRoundInt, pyRoundN, pyStr, pyStrip, pyTruthy,
} from "./py";

export type Row = Record<string, unknown>;
export type Params = Record<string, unknown>;
export type Log = [string, string];
export type TBlock = { type: string; params: Record<string, unknown>; label: string; row?: number };
/** blocks_expand.RowTemplate */
export type RowTemplate = {
  row: number; kind: "delay" | "test" | "process" | "error"; blocks: TBlock[]; logs: Log[]; params: Params | null; error: string;
};

/** 장비 recipe.py 의 패턴(정의 recipe.delayNamePattern·durationPattern 과 같아야 한다 — 골든이 확인) */
export const DELAY_NAME_PATTERN = String.raw`^\s*delay\s*(\d+)\s*([smhd]?)\s*$`;
export const DURATION_PATTERN = String.raw`(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m)?(?:(\d+(?:\.\d+)?)s)?`;

/** process_steps.StepError(v1 AppError) */
export class StepError extends Error {
  code: string;
  detail: string;
  constructor(code: string, detail: string) {
    super(`${code}: ${detail}`);
    this.code = code;
    this.detail = detail;
  }
}

// ───────────── 기간 ─────────────
const HMS_FULL = new RegExp(`^${HMS}$`);
const HMS_PREFIX = new RegExp(`^${HMS}`);
const NUM_FULL = /^\d+(?:\.\d+)?$/;
const hmsSec = (m: RegExpMatchArray) =>
  pyFloatStr(m[1] || "0") * 3600.0 + pyFloatStr(m[2] || "0") * 60.0 + pyFloatStr(m[3] || "0");

/** process_steps.parse_duration_pc = recipe_check.parse_duration_for_validate — 숫자만 = 초, h/m/s 전체 일치, 그 밖 0 */
export function parseDurationPc(s: unknown): number {
  const t = asciiDigits(pyStrip(pyTruthy(s) ? String(s) : "").toLowerCase());
  if (!t) return 0.0;
  if (NUM_FULL.test(t)) return pyFloatStr(t);
  const m = t.match(HMS_FULL);
  return m ? hmsSec(m) : 0.0;
}

/** recipe.parse_duration_runtime — 앞에서부터 맞춤(단위 없는 숫자는 0 초 — v1 그대로) */
export function parseDurationRuntime(s: string): number {
  if (!s) return 0.0;
  const m = asciiDigits(s.split(" ").join("").toLowerCase()).match(HMS_PREFIX) as RegExpMatchArray;
  return hmsSec(m);
}

// ───────────── E230 행 값 검사 ─────────────
/** recipe_check.check_raw_rows — 오류 문구 목록(비면 통과). rowNumbers 가 없으면 행 번호 = 순번 + 2(헤더 = 1행) */
export function checkRawRows(rows: unknown, defs: Ch12Defs, rowNumbers?: number[] | null): string[] {
  const R = defs.recipe.raw;
  const errs: string[] = [];
  let overflow = 0;
  const add = (m: string) => {
    if (errs.length < R.maxShown) errs.push(m);
    else overflow += 1;
  };
  (Array.isArray(rows) ? rows : []).forEach((row, idx) => {
    if (!isObj(row)) return;
    const lineno = rowNumbers && idx < rowNumbers.length ? Math.trunc(rowNumbers[idx]) : idx + 2;
    const val = (k: string) => pyStrip(pyTruthy(row[k]) ? pyStr(row[k]) : "");
    const name = val("Process_name");
    const where = `${lineno}행` + (name ? `('${name}')` : "");
    for (const key of R.floatKeys) {
      const v = val(key);
      if (v === "") continue;
      let fv: number;
      try {
        fv = pyFloatStr(v);
      } catch {
        add(`${where} ${key}='${v}' → 숫자가 아닙니다`);
        continue;
      }
      const rng = R.rangeKeys[key];
      if (rng && !(rng[0] <= fv && fv <= rng[1])) {
        add(`${where} ${key}='${v}' → 범위 ${g(rng[0])}~${g(rng[1])}${rng[2] ? ` ${rng[2]}` : ""} 밖입니다`);
      }
    }
    for (const key of R.intKeys) {
      const v = val(key);
      if (v === "") continue;
      try {
        pyIntOfFloat(pyFloatStr(v));
      } catch {
        add(`${where} ${key}='${v}' → 숫자가 아닙니다`);
      }
    }
    for (const key of R.tfKeys) {
      const v = val(key);
      if (v === "") continue;
      const u = v.toUpperCase();
      if (!R.tfTrue.includes(u) && !R.tfFalse.includes(u)) add(`${where} ${key}='${v}' → T/F 값이 아닙니다`);
    }
    for (const [key, allowed] of Object.entries(R.enumKeys)) {
      const v = val(key);
      if (v && !allowed.includes(v.toLowerCase())) add(`${where} ${key}='${v}' → ${allowed.join("/")} 중 하나여야 합니다`);
    }
    for (const key of R.offTimeKeys) {
      const v = val(key);
      if (v === "" || v.toUpperCase() === "DC") continue;
      try {
        pyFloatStr(v);
      } catch {
        add(`${where} ${key}='${v}' → 숫자(µs) 또는 DC 여야 합니다`);
      }
    }
    for (const key of R.durationKeys) {
      const v = val(key);
      if (v && parseDurationPc(v) <= 0.0) add(`${where} ${key}='${v}' → 기간 형식이 아닙니다 (예: 30s, 5m, 1h30m)`);
    }
    const [ck, tk] = R.pair;
    const cpv = val(ck), pct = val(tk);
    if (!!cpv !== !!pct) {
      add(`${where} ${ck} 와 ${tk} 은 함께 입력해야 합니다 (현재: ${ck}='${cpv}', ${tk}='${pct}')`);
    }
  });
  if (overflow > 0) errs.push(`... 외 ${overflow}건`);
  return errs;
}

/** recipe_check.e230_message — 호스트 오류 문구·로그 줄 */
export const e230Message = (errs: string[], defs: Ch12Defs): string =>
  `${defs.recipe.raw.prefix} ${errs.length}건:\n - ` + errs.join("\n - ");
/** recipe_check.e230_popup — 경고 팝업 본문 */
export const e230Popup = (errs: string[], defs: Ch12Defs): string =>
  `${defs.recipe.raw.prefix} ${errs.length}건:\n` + errs.map((e) => `- ${e}`).join("\n");

// ───────────── 행 종류 ─────────────
const DELAY_NAME_RE = new RegExp(`^${PY_WS}*delay${PY_WS}*(\\d+)${PY_WS}*([smhd]?)${PY_WS}*$`, "iu");
const UNIT_SEC: Record<string, number> = { s: 1.0, m: 60.0, h: 3600.0, d: 86400.0 };
const UNIT_TXT: Record<string, string> = { s: "초", m: "분", h: "시간", d: "일" };

/** recipe.delay_of — [대기 초, label, 표시 이름]. 대기 초 0 이면 대기 행 아님 */
export function delayOf(row: Row): [number, string, string] {
  const name = pyStrip(pyStr(pyTruthy(row.Process_name) ? row.Process_name : pyGet(row, "process_note", "")));
  let sec = 0.0, label = "";
  const dcol = pyStrip(pyTruthy(row.delay) ? pyStr(row.delay) : "");
  if (dcol) {
    try {
      sec = pyFloatStr(dcol) * 60.0;
      label = `${dcol}분`;
    } catch {
      sec = parseDurationRuntime(dcol.toLowerCase());
      label = dcol;
    }
  } else {
    const m = name ? asciiDigits(name).match(DELAY_NAME_RE) : null;
    if (m) {
      const amount = Number(m[1]);
      const unit = (m[2] || "m").toLowerCase();
      if (!(unit in UNIT_SEC)) throw new PyError("KeyError", unit);
      sec = amount * UNIT_SEC[unit];
      label = `${amount}${UNIT_TXT[unit]}`;
    }
  }
  return [sec, label, name || `delay ${label}`];
}

/** recipe.mark_test_row — '#'=test 행이면 표시를 붙이고 true(row 를 바꾼다) */
export function markTestRow(row: Row): boolean {
  if (pyStrip(pyTruthy(row["#"]) ? pyStr(row["#"]) : "").toLowerCase() !== "test") return false;
  const time = pyStrip(pyTruthy(row.time) ? pyStr(row.time) : "");
  const sec = parseDurationRuntime(time.toLowerCase());
  row.test_mode = true;
  row.test_duration_sec = sec;
  if (sec > 0 && !Object.prototype.hasOwnProperty.call(row, "process_time")) row.process_time = pyRoundN(sec / 60.0, 3);
  if (!Object.prototype.hasOwnProperty.call(row, "process_note")) row.process_note = pyTruthy(row.Process_name) ? row.Process_name : "TEST";
  return true;
}

export type RowPlan = { kind: "delay" | "process"; raw: Row; delaySec: number; label: string; disp: string; test: boolean };
/** recipe.plan_row — (A) delay 판정 → (B) TEST 표시. raw 는 복사해서 바꾼다 */
export function planRow(raw: Row): RowPlan {
  const row = { ...raw };
  const [sec, label, disp] = delayOf(row);
  if (sec > 0) return { kind: "delay", raw: row, delaySec: sec, label, disp, test: false };
  return { kind: "process", raw: row, delaySec: 0, label: "", disp: "", test: markTestRow(row) };
}

/** recipe.thickness_mode_of — 두께 모니터 채널이고 thickness > 0 */
export function thicknessModeOf(thickness: unknown, supported: boolean): boolean {
  let t = 0.0;
  try {
    const s = thickness === null || thickness === undefined ? "" : pyStrip(pyStr(thickness, true));
    t = s ? pyFloatStr(s) : 0.0;
  } catch {
    t = 0.0;
  }
  return supported && t > 0.0;
}

// ───────────── 정규화 ─────────────
const or = (v: number | null, d: number | null) => (v === null || v === 0 ? d : v);   // 파이썬 'x or y'(nan 은 참)
const reprF = (v: unknown) => (typeof v === "number" ? fr(v) : pyRepr(v));          // float 값 문구(None 이면 None)
const reprI = (v: unknown) => (typeof v === "number" ? pyNum(v, false) : pyRepr(v));

/** recipe.normalize_row — v1 _normalize_params_for_process. log 에 (src, msg) */
export function normalizeRow(raw: Row, chamber: number, caps: Caps, log: Log[], uiTargets: Record<string, string> = {}): Params {
  const ch = chamber;
  const get = (k: string, d: unknown) => pyGet(raw, k, d);
  const sOf = (k: string) => pyStrip(pyStr(get(k, "")));
  const tf = (v: unknown) => ["T", "TRUE", "1", "Y", "YES"].includes(pyStrip(pyStr(v)).toUpperCase());
  const fget = (k: string, d = "0") => {
    try {
      return pyFloatStr(pyStrip(pyStr(get(k, d))));
    } catch {
      return pyFloatStr(d);
    }
  };
  const iget = (k: string, d = "0") => {
    try {
      return pyIntOfFloat(pyFloatStr(pyStrip(pyStr(get(k, d)))));
    } catch {
      return pyIntOfFloat(pyFloatStr(d));
    }
  };
  const tryNum = (s: string, f: (x: number) => number): number | null => {
    try {
      return f(pyFloatStr(s));
    } catch {
      return null;
    }
  };
  const optInt = (k: string) => (sOf(k) !== "" ? tryNum(sOf(k), pyIntOfFloat) : null);
  const optFloat = (k: string) => (sOf(k) !== "" ? tryNum(sOf(k), (x) => x) : null);
  const floatOr = (d: string, k: string) => (sOf(k) !== "" ? tryNum(sOf(k), (x) => x) : null) ?? pyFloatStr(d);
  const offTime = (k: string): number | string | null => {
    const sv = sOf(k);
    if (sv === "") return null;
    if (sv.toUpperCase() === "DC") return "DC";
    const v = tryNum(sv, (x) => pyRoundN(x, 1));
    if (v === null) log.push(["Params", `[경고] ${k}='${sv}' 해석 불가 → 유지`]);
    return v;
  };
  const gr = [1, 2, 3].map((i) => {
    const a = get(`G${i} Target`, "");
    return pyStrip(pyStr(pyTruthy(a) ? a : get(`G${i}_target_name`, ""))) || String(uiTargets[`G${i}`] || "");
  });
  const useG = [1, 2, 3].map((i) => pyTruthy(get(`use_g${i}`, false)) || tf(get(`gun${i}`, "F")));
  const [g1t, g2t, g3t] = ch === 1 ? [gr[0], "", ""] : gr.map((x, i) => (useG[i] ? x : ""));
  let pos = sOf("chuck_position").toLowerCase();
  if (!["up", "mid", "down"].includes(pos)) pos = "";

  const useDcPulse = tf(get("use_dc_pulse", "F"));
  const dcPulsePower = floatOr("0", "dc_pulse_power");
  const dcPulseFreq = optInt("dc_pulse_freq");
  let dcPulseOff = offTime("dc_pulse_off_time");
  const dutyLegacy = optInt("dc_pulse_duty_cycle");
  const useRfPulse = tf(get("use_rf_pulse", "F"));
  const rfPulsePower = floatOr("0", "rf_pulse_power");
  const rfPulseFreq = optFloat("rf_pulse_freq");
  const rfPulseDuty = optInt("rf_pulse_duty_cycle");
  if (dcPulseOff === null && dutyLegacy !== null) {
    if (dcPulseFreq) {
      dcPulseOff = pyRoundN(pyMax(0.0, (1000.0 / pyMax(1e-6, dcPulseFreq)) * (1.0 - dutyLegacy / 100.0)), 1);
      log.push(["Params", `[호환] dc_pulse_duty_cycle ${dutyLegacy}% @${dcPulseFreq}kHz → dc_pulse_off_time ${fx(dcPulseOff, 1)}us 로 환산`]);
    } else {
      log.push(["Params", `[경고] dc_pulse_duty_cycle=${dutyLegacy}% 가 있으나 dc_pulse_freq 가 비어 Off Time 으로 환산할 수 없습니다 → Off Time 유지(keep)`]);
    }
  }
  let dcPulseDuty: number | null;
  if (typeof dcPulseOff === "string") dcPulseDuty = 100.0;
  else if (dcPulseOff !== null && dcPulseFreq) {
    const p = 1000.0 / pyMax(1e-6, dcPulseFreq);
    dcPulseDuty = pyRoundN((p - dcPulseOff) / p * 100.0, 1);
  } else dcPulseDuty = null;
  let depRate: number | null = null;
  for (const key of ["dep_rate", "dep.rate"]) {
    const s = sOf(key);
    if (s) {
      const v = tryNum(s, (x) => x);
      if (v !== null) {
        depRate = v > 0 ? v : null;
        break;
      }
    }
  }
  const thickness = or(fget("thickness", "0"), null);
  let processTime = fget("process_time", "0");
  if (processTime <= 0.0 && depRate && thickness !== null) {
    processTime = thickness / depRate / 60.0;
    log.push(["Params", `process_time 자동 계산: ${fr(thickness)}nm ÷ ${fr(depRate)}nm/s = ${fx(processTime, 3)}분`]);
  }
  const res: Params = {
    base_pressure: fget("base_pressure", "1e-5"), working_pressure: fget("working_pressure", "0"),
    process_time: processTime, dep_rate: depRate, thickness,
    shutter_delay: fget("shutter_delay", "0"), integration_time: iget("integration_time", "60"),
    dc_power: fget("dc_power", "0"), dc_power2: fget("dc_power2", "0"), rf_power: fget("rf_power", "0"),
    use_dc_pulse: useDcPulse, dc_pulse_power: dcPulsePower, dc_pulse_freq: dcPulseFreq,
    dc_pulse_off_time: dcPulseOff, dc_pulse_duty: dcPulseDuty,
    use_rf_pulse: useRfPulse, rf_pulse_power: rfPulsePower, rf_pulse_freq: rfPulseFreq, rf_pulse_duty: rfPulseDuty,
    use_rf_power: tf(get("use_rf_power", "F")), use_dc_power: tf(get("use_dc_power", "F")),
    use_dc_power2: tf(get("use_dc_power2", "F")),
    use_ar: tf(get("Ar", "F")), use_o2: tf(get("O2", "F")), use_n2: tf(get("N2", "F")),
    ar_flow: fget("Ar_flow", "0"), o2_flow: fget("O2_flow", "0"), n2_flow: fget("N2_flow", "0"),
    use_g1: useG[0], use_g2: useG[1], use_g3: useG[2], use_ms: tf(get("main_shutter", "F")),
    process_note: get("Process_name", get("process_note", "")),
    G1_target_name: g1t, G2_target_name: g2t, G3_target_name: g3t, "G1 Target": g1t, "G2 Target": g2t, "G3 Target": g3t,
    use_power_select: tf(get("power_select", "F")), chuck_position: pos,
    use_heater: tf(get("use_heater", "F")), heater_temp: optFloat("heater_temp"),
    heater_ramp: optFloat("heater_ramp"), heater_soak: optFloat("heater_soak"),
    tooling: optFloat("tooling"), density: optFloat("density"), z_factor: optFloat("z_factor"),
  };
  if (!res.use_heater && (res.heater_temp !== null || res.heater_ramp !== null || res.heater_soak !== null)) {
    log.push(["Params", `use_heater=F 이므로 히터를 쓰지 않습니다 (heater_temp=${reprF(res.heater_temp)}, `
      + `heater_ramp=${reprF(res.heater_ramp)}, heater_soak=${reprF(res.heater_soak)} 은 무시)`]);
    res.heater_temp = res.heater_ramp = res.heater_soak = null;
  }
  const strOr = (k: string) => pyStrip(pyTruthy(get(k, "")) ? pyStr(get(k, "")) : "");
  res.power_change_time = strOr("power_change_time");
  res.change_power_value = strOr("change_power_value");

  const normPulse = (kind: "rf" | "dc", supported: boolean) => {
    const useKey = `use_${kind}_pulse`, pKey = `${kind}_pulse_power`, fKey = `${kind}_pulse_freq`, dKey = `${kind}_pulse_duty`;
    const label = kind === "rf" ? "RF-Pulse" : "DC-Pulse";
    const power = or(res[pKey] as number | null, 0.0) as number;
    const freq = res[fKey], duty = res[dKey];
    const clear = () => {
      res[useKey] = false;
      res[pKey] = 0.0;
      res[fKey] = null;
      res[dKey] = null;
      if (kind === "dc") res.dc_pulse_off_time = null;
    };
    if (res[useKey]) {
      if (supported) return;
      clear();
      log.push(["Params", `CH${ch}: ${label} 미지원 설정 → OFF 처리합니다.`]);
      return;
    }
    const had = power > 0.0 || freq !== null || duty !== null;
    clear();
    if (had) {
      const fT = kind === "rf" ? reprF(freq) : reprI(freq), dT = kind === "rf" ? reprI(duty) : reprF(duty);
      log.push(["Params", `${label}: ${useKey}=F 이므로 사용하지 않습니다 (레시피의 power=${fr(power)}, freq=${fT}, duty=${dT} 은 무시).`]);
    }
  };
  normPulse("rf", caps.rfp);
  normPulse("dc", caps.dcp);
  if (ch === 1) {
    if (res.use_n2 || (or(res.n2_flow as number, 0.0) as number) > 0.0) log.push(["Params", "CH1은 N2 미지원 → N2 설정을 무시합니다."]);
    res.use_n2 = false;
    res.n2_flow = 0.0;
  }
  if (pyTruthy(get("test_mode", false))) {
    res.test_mode = true;
    const t = get("test_duration_sec", null);
    try {
      res.test_duration_sec = pyTruthy(t) ? pyFloatAny(t) : 0.0;
    } catch {
      res.test_duration_sec = 0.0;
    }
    res.time = strOr("time");
  }
  return res;
}

// ───────────── 시작 전 값 검사 ─────────────
const numOr0 = (v: unknown) => (v === undefined ? 0 : (v as number));

function checkRfPulse(p: Params, fmax: number): string[] {
  const errs: string[] = [];
  const f = p.rf_pulse_freq, d = p.rf_pulse_duty;
  if (f !== null && f !== undefined) {
    const fv = pyFloatAny(f);
    if (!(0.001 <= fv && fv <= fmax)) {
      errs.push(`RF Pulse Freq ${g(fv)}kHz 는 허용 범위 0.001~${g(fmax)}kHz 밖입니다 (CESAR 사양 3-5: 1Hz~30kHz — 초과 시 W40으로 출력 차단)`);
    }
  }
  if (d !== null && d !== undefined && !(1 <= (d as number) && (d as number) <= 99)) errs.push("RF Pulse Duty(%)는 1..99");
  return errs;
}

/** recipe_check.check_norm_params — 정규화한 공정 params 검사(TEST 행은 검사 안 함). p 는 바꾸지 않는다(복사) */
export function checkNormParams(p0: Params, chamber: number, caps: Caps, cfg: Cfg, defs: Ch12Defs, heaterAvailable?: boolean): string[] {
  const p: Params = { ...p0 };
  const errs: string[] = [];
  const N = defs.recipe.norm;
  if (pyTruthy(p.test_mode)) return errs;
  if (!(pyTruthy(p.use_ar) || pyTruthy(p.use_o2) || pyTruthy(p.use_n2))) errs.push("가스를 하나 이상 선택해야 합니다.");
  for (const k of ["ar_flow", "o2_flow", "n2_flow"]) {
    const raw = pyGet(p, k, 0);
    let v: number;
    if (raw === null) v = 0.0;
    else {
      const s = pyStrip(pyStr(raw));
      if (s === "" || s.toUpperCase() === "NONE") v = 0.0;
      else {
        try {
          v = pyFloatStr(s);
        } catch {
          v = 0.0;
          errs.push(`${k} 값이 숫자가 아니라 0으로 처리(raw=${pyRepr(raw)}).`);
        }
      }
    }
    if (v < 0) errs.push(`${k}는 음수 불가`);
    p[k] = v;
  }
  if (pyTruthy(p.use_rf_pulse) && pyTruthy(p.use_dc_pulse)) errs.push("RF Pulse와 DC Pulse는 동시에 사용할 수 없습니다 (같은 시리얼 포트)");
  const fmax = rfpFreqMaxKhz(defs, cfg, chamber);
  const dcp = () => checkDcPulse(defs, p.dc_pulse_freq, p.dc_pulse_off_time);
  if (chamber === 1) {
    const useRf = pyTruthy(p.use_rf_pulse), useDc = pyTruthy(p.use_dc_pulse);
    if (!(useRf || useDc)) errs.push("CH1은 RF Pulse 또는 DC Pulse 중 하나를 반드시 선택해야 합니다.");
    if (useRf) {
      if (numOr0(p.rf_pulse_power) <= 0) errs.push("RF Pulse Target Power(W)는 0보다 커야 합니다.");
      errs.push(...checkRfPulse(p, fmax));
    }
    if (useDc) {
      if (numOr0(p.dc_pulse_power) <= 0) errs.push("DC Pulse Target Power(W)는 0보다 커야 합니다.");
      errs.push(...dcp());
    }
  } else {
    const checked = [p.use_g1, p.use_g2, p.use_g3].filter((x) => pyTruthy(x)).length;
    if (checked === 0 || checked === 3) errs.push("G1~G3 중 1개 또는 2개만 선택");
    const useRfp = pyTruthy(p.use_rf_pulse), useDcp = pyTruthy(p.use_dc_pulse);
    if (useRfp) {
      if (!caps.rfp) errs.push("이 챔버는 RF-Pulse를 지원하지 않습니다.");
      else {
        if (numOr0(p.rf_pulse_power) <= 0) errs.push("RF Pulse Target Power(W)는 0보다 커야 합니다.");
        errs.push(...checkRfPulse(p, fmax));
      }
    }
    if (useDcp) {
      if (!caps.dcp) errs.push("이 챔버는 DC-Pulse를 지원하지 않습니다.");
      else {
        if (numOr0(p.dc_pulse_power) <= 0) errs.push("DC Pulse Target Power(W)는 0보다 커야 합니다.");
        errs.push(...dcp());
      }
    }
    if (!(pyTruthy(p.use_dc_power) || pyTruthy(p.use_dc_power2) || pyTruthy(p.use_rf_power) || useDcp || useRfp)) {
      errs.push("CH2는 DC1/DC2/RF Power 또는 DC/RF Pulse 중 하나 이상 선택 필요");
    }
    if (pyTruthy(p.use_dc_power) && numOr0(p.dc_power) < 0) errs.push("DC Target Power(W)는 0 이상이어야 합니다.");
    if (pyTruthy(p.use_dc_power2) && numOr0(p.dc_power2) < 0) errs.push("DC2 Target Power(W)는 0 이상이어야 합니다.");
    if (pyTruthy(p.use_dc_power2) && !caps.dc2) errs.push("DC2 Power 는 사용할 수 없습니다(DC2 폐지)");
  }
  if (pyTruthy(p.use_heater)) {
    const avail = heaterAvailable ?? caps.heater;
    if (chamber !== 2) errs.push("CH1 에는 히터가 없습니다 (use_heater=T)");
    else if (!avail) {
      errs.push("히터 기능이 꺼져 있어 use_heater=T 공정을 실행할 수 없습니다 (settings.json ch2 SUPPORTS_HEATER=false 또는 히터 초기화 실패)");
    } else {
      const lim = heaterLimitC(defs, cfg);
      const t = pyGet(p, "heater_temp", null);
      if (t === null || !(0.0 < pyFloatAny(t) && pyFloatAny(t) <= lim)) {
        errs.push(`heater_temp 는 0 초과 ${g(lim)}°C 이하여야 합니다 (현재 ${reprF(t)})`);
      }
      const r = pyGet(p, "heater_ramp", null);
      if (r !== null && !(0.0 < pyFloatAny(r) && pyFloatAny(r) <= N.heaterRampMax)) {
        errs.push(`heater_ramp 는 0 초과 ${g(N.heaterRampMax)}°C/min 이하여야 합니다 (현재 ${reprF(r)})`);
      }
      const sk = pyGet(p, "heater_soak", null);
      if (sk !== null && !(0.0 <= pyFloatAny(sk) && pyFloatAny(sk) <= N.heaterSoakMax)) {
        errs.push(`heater_soak 는 0~${g(N.heaterSoakMax)}분이어야 합니다 (현재 ${reprF(sk)})`);
      }
    }
  }
  return errs;
}

// ───────────── 기본 템플릿 ─────────────
const B = (type: string, label = "", params: Record<string, unknown> = {}): TBlock => ({ type, params, label });
const f0 = (v: unknown, d = 0) => pyFloatAny(v === undefined ? d : v);

type Info = {
  use_ms: boolean; use_dc: boolean; use_dc2: boolean; use_rf: boolean; use_dc_pulse: boolean; use_rf_pulse: boolean;
  req_dc: boolean; req_dc2: boolean; req_rf: boolean; req_dcp: boolean; req_rfp: boolean;
};
/** process_steps.common_info */
function commonInfo(p: Params, caps: Caps): Info {
  const req = (u: string, k: string) => pyTruthy(p[u]) && f0(p[k]) > 0;
  const reqDc = req("use_dc_power", "dc_power"), reqDc2 = req("use_dc_power2", "dc_power2"), reqRf = req("use_rf_power", "rf_power");
  const reqDcp = req("use_dc_pulse", "dc_pulse_power"), reqRfp = req("use_rf_pulse", "rf_pulse_power");
  return {
    use_ms: pyTruthy(p.use_ms), use_dc: reqDc && caps.dc, use_dc2: reqDc2 && caps.dc2, use_rf: reqRf && caps.rf,
    use_dc_pulse: reqDcp && caps.dcp, use_rf_pulse: reqRfp && caps.rfp,
    req_dc: reqDc, req_dc2: reqDc2, req_rf: reqRf, req_dcp: reqDcp, req_rfp: reqRfp,
  };
}

const UNSUPPORTED: [keyof Info, keyof Info, string][] = [
  ["req_dc", "use_dc", "DC 연속 파워 미지원 → DC 단계 스킵"], ["req_dc2", "use_dc2", "DC2 연속 파워 미지원 → DC2 단계 스킵"],
  ["req_rf", "use_rf", "RF 연속 파워 미지원 → RF 단계 스킵"], ["req_dcp", "use_dc_pulse", "DC Pulse 미지원 → Pulse 단계 스킵"],
  ["req_rfp", "use_rf_pulse", "RF Pulse 미지원 → Pulse 단계 스킵"],
];

/** process_steps.pulse_set_message */
export function pulseSetMessage(kind: string, power: number, tSec: number | null = null, phase = ""): string {
  const lab = kind === "dc" ? "DC Pulse" : "RF Pulse";
  const tail = tSec !== null ? ` (t=${fx(tSec, 1)}s, ${phase})` : "";
  return `${lab} Power 변경 → ${fr(power)}W${tail}`;
}

const pcStr = (p: Params, k: string) => pyStrip(pyTruthy(pyGet(p, k, "")) ? pyStr(pyGet(p, k, "")) : "");

type Mid = { kind: "dc" | "rf"; t: number; power: number };
/** process_sequence.mid_change_plan — 중간 펄스 전력 변경 계획(set_dcp·set_rfp 는 늘 있음) */
function midChangePlan(p: Params, info: Info, log: Log[]): Mid | null {
  const sdSec = f0(p.shutter_delay) * 60.0, ptSec = f0(p.process_time) * 60.0;
  const rawT = pcStr(p, "power_change_time"), rawP = pcStr(p, "change_power_value");
  const t = rawT ? parseDurationPc(rawT) : 0.0;
  let pw = 0.0;
  try {
    pw = rawP ? pyFloatStr(rawP) : 0.0;
  } catch {
    pw = 0.0;
  }
  const window = sdSec + ptSec;
  const ok = rawT !== "" && rawP !== "" && pw > 0.0 && 0.0 < t && t < window;
  const doDc = info.use_dc_pulse && ok;
  let doRf = info.use_rf_pulse && ok;
  if (doDc && doRf) {
    log.push(["Process", "⚠ Pulse 중간 Power 변경: DC/RF Pulse가 동시에 활성 → DC 우선, RF는 무시"]);
    doRf = false;
  }
  for (const [use, dO, lab] of [[info.use_dc_pulse, doDc, "DC"], [info.use_rf_pulse, doRf, "RF"]] as [boolean, boolean, string][]) {
    if (use && (rawT !== "" || rawP !== "") && !dO) {
      log.push(["Process", `⚠ ${lab} Pulse 중간 Power 변경 무시: power_change_time='${rawT}', change_power_value='${rawP}', `
        + `window=${fx(window, 1)}s, callback=OK`]);
    }
  }
  if (!(doDc || doRf)) return null;
  return { kind: doDc ? "dc" : "rf", t, power: pw };
}

/** process_sequence.thickness_conflict — 사유 문구 또는 "" */
function thicknessConflict(p: Params, caps: Caps): string {
  const info = commonInfo(p, caps);
  if (!(info.use_dc_pulse || info.use_rf_pulse)) return "";
  const rawT = pcStr(p, "power_change_time"), rawP = pcStr(p, "change_power_value");
  if (!rawT || !rawP) return "";
  let pw: number;
  try {
    pw = pyFloatStr(rawP);
  } catch {
    return "";
  }
  const t = parseDurationPc(rawT);
  const sd = (pyTruthy(p.shutter_delay) ? f0(p.shutter_delay) : 0) * 60.0;
  if (pw <= 0.0 || t <= 0.0 || t < sd) return "";
  return `중간 펄스 전력 변경(power_change_time=${rawT}, ${g(pw)}W)이 메인 공정 구간에 있습니다 — `
    + "Thickness 모드는 메인 구간 길이가 정해지지 않아 함께 쓸 수 없습니다";
}

/** process_sequence.row_test_duration_sec — test_duration_sec → time(숫자만 = 초) → process_time×60, 최소 1초 */
function rowTestDurationSec(p: Params): number {
  let dur: number;
  try {
    dur = pyTruthy(p.test_duration_sec) ? pyFloatAny(p.test_duration_sec) : 0.0;
  } catch {
    dur = 0.0;
  }
  if (dur <= 0) {
    const ts = pyStrip(pyStr(pyGet(p, "time", "")));
    if (ts) dur = parseDurationPc(ts);
  }
  if (dur <= 0) dur = (pyTruthy(p.process_time) ? pyFloatAny(p.process_time) : 0.0) * 60.0;
  return pyMax(1.0, dur);
}

/** blocks_expand.template_blocks — v1 행 params → [블록, v1 로그]. E844 는 StepError, 값 넘침은 PyError */
export function templateBlocks(p: Params, chamber: number, cfg: Cfg, defs: Ch12Defs, caps?: Caps): [TBlock[], Log[]] {
  const cp = caps ?? capsFromCfg(cfg, chamber);
  const sc = stepCfg(defs, cfg, chamber);
  const log: Log[] = [];
  if (pyTruthy(p.test_mode)) {
    const dur = rowTestDurationSec(p);
    log.push(["Process", `[TEST MODE] 장비제어 스킵 / 시뮬레이션 ${fx(dur, 1)}s 진행`]);
    return [[B("test", "", { sec: dur })], log];
  }
  const info = commonInfo(p, cp);
  const bp = pyFloatAny(pyGet(p, "base_pressure", sc.basePressure));
  const wp = f0(p.working_pressure), ptMin = f0(p.process_time), sdMin = f0(p.shutter_delay);
  const sdSec = sdMin * 60.0, ptSec = ptMin * 60.0;
  const thk = pyTruthy(p.thickness_mode);
  if (thk) {
    const c = thicknessConflict(p, cp);
    if (c) throw new StepError("E844", c);
  }
  let ims: number;
  try {
    ims = pyIntOfFloat(pyFloatAny(pyGet(p, "integration_time", sc.integrationMs)));
  } catch {
    ims = sc.integrationMs;
  }
  const mid = midChangePlan(p, info, log);
  const out: TBlock[] = [];
  log.push(["Process", "공정 시작"]);
  const heater = pyTruthy(p.use_heater);
  if (heater) {
    const temp = pyTruthy(p.heater_temp) ? pyFloatAny(p.heater_temp) : 0.0;
    const hr = p.heater_ramp, hs = p.heater_soak;
    const ramp = hr === null || hr === undefined || hr === "" ? null : pyFloatAny(hr);
    const soak = hs === null || hs === undefined || hs === "" ? null : pyFloatAny(hs);
    const rT = ramp !== null && pyTruthy(ramp) ? `${g(ramp)}°C/min` : "기본 램프 속도";
    log.push(["Process", `히터 사용 — 목표 ${g(temp)}°C (${rT}${soak !== null ? `, SOAK ${g(soak)}분` : ""})`]);
    out.push(B("heater_set", "", { target_c: temp, ramp_c_per_min: ramp }), B("heater_wait", "", { target_c: null, soak_min: soak }));
  }
  out.push(B("base_wait", "", { target_torr: bp }), B("rga_scan"));
  const gs = { ar: pyTruthy(p.use_ar), o2: pyTruthy(p.use_o2), n2: pyTruthy(p.use_n2) };
  out.push(B("gas_prep", "", { ...gs }));
  const flow = (k: "ar" | "o2" | "n2") => (gs[k] ? f0(p[`${k}_flow`]) : null);
  out.push(B("gas_intro", "", { ar: gs.ar, ar_flow: flow("ar"), o2: gs.o2, o2_flow: flow("o2"), n2: gs.n2, n2_flow: flow("n2") }));
  out.push(B("pressure_ctrl", "", { target: wp, timeout_sec: sc.pressureWaitTimeoutS }));
  const guns = sc.gunShutters.map((x) => x.toLowerCase()).filter((x) => pyTruthy(pyGet(p, `use_${x}`, false)));
  if (guns.length) out.push(B("shutter", "Gun Shutter 열기", { action: "open", targets: guns }));
  if (pyTruthy(p.use_power_select) && sc.chamber === 2) {
    out.push(B("power_select"));
    const ms = sc.powerSelectSettleMs;
    if (ms > 0) out.push(B("wait", `Power Select 안정화 대기 (${fx(ms / 1000, 0)}초)`, { sec: ms / 1000.0 }));
  }
  for (const [req, use, txt] of UNSUPPORTED) if (info[req] && !info[use]) log.push(["Process", `주의: 이 챔버는 ${txt}`]);
  // process_sequence.power_kwargs — v1 은 쓰지 않는 펄스 값도 변환한다(int() 예외 포함)
  let f = pyGet(p, "dc_pulse_freq", null) as number | null;
  if (f !== null) f = pyIntOfFloat(f);
  let off = pyGet(p, "dc_pulse_off_time", null) as number | string | null;
  if (off !== null && typeof off !== "string") off = pyRoundN(pyFloatAny(off), 1);
  const rfKhz = pyGet(p, "rf_pulse_freq", null) as number | null;
  if (rfKhz !== null) pyRoundInt(pyFloatAny(rfKhz) * 1000.0);
  let duty = pyGet(p, "rf_pulse_duty", null) as number | null;
  if (duty !== null) duty = pyIntOfFloat(duty);
  const kw = {
    dc: info.use_dc ? f0(p.dc_power) : null, dc2: info.use_dc2 ? f0(p.dc_power2) : null,
    dcp: info.use_dc_pulse ? f0(p.dc_pulse_power) : null, rfp: info.use_rf_pulse ? f0(p.rf_pulse_power) : null,
    rf: info.use_rf ? f0(p.rf_power) : null,
  };
  if ([kw.dc, kw.dc2, kw.dcp, kw.rfp, kw.rf].some((x) => typeof x === "number" && x > 0)) {
    out.push(B("power_on", "", {
      dc_power: kw.dc, dc2_power: kw.dc2, dcp_power: kw.dcp,
      dcp_freq_khz: info.use_dc_pulse ? f : null, dcp_off_us: info.use_dc_pulse ? off : null, rfp_power: kw.rfp,
      rfp_freq_khz: info.use_rf_pulse && rfKhz !== null ? pyFloatAny(rfKhz) : null,
      rfp_duty: info.use_rf_pulse ? duty : null, rf_power: kw.rf,
    }));
  }
  if (info.use_rf_pulse) {
    const ms = sc.rfPulsePostOnDelayMs;
    out.push(B("wait", `Power Delay ${fx(ms / 1000.0, 0)}초`, { sec: ms / 1000.0 }));
  }
  if (wp < sc.boostTarget) out.push(B("pressure_boost", "", { value: sc.boostTarget, timeout_sec: sc.pressureWaitTimeoutS }));
  out.push(B("pressure_set", "", { value: wp }));
  if (heater) out.push(B("heater_hold"));
  if (sdSec > 0) {
    if (mid && mid.t < sdSec) {
      const p1 = mid.t, p2 = sdSec - mid.t;
      if (p1 > 0) out.push(B("wait", `Shutter Delay (변경 전) ${fx(p1 / 60.0, 2)}분`, { sec: p1 }));
      out.push(B("pulse_set", pulseSetMessage(mid.kind, mid.power, mid.t, "ShutterDelay"),
        { kind: mid.kind, power: mid.power, polling: false }));
      if (p2 > 0) out.push(B("wait", `Shutter Delay (변경 후) ${fx(p2 / 60.0, 2)}분`, { sec: p2 }));
    } else {
      out.push(B("wait", `Shutter Delay ${fr(sdMin)}분`, { sec: sdSec }));
    }
  }
  if (thk) out.push(B("thickness_zero"));
  if (info.use_ms) out.push(B("shutter", "Main Shutter 열기", { action: "open", targets: ["ms"] }));
  if (thk) {
    out.push(B("thickness_main", "", {
      target_nm: pyTruthy(p.thickness) ? pyFloatAny(p.thickness) : 0.0,
      dep_rate: pyTruthy(p.dep_rate) ? pyFloatAny(p.dep_rate) : 0.0, integration_ms: ims,
    }));
  } else if (ptSec > 0) {
    const change = mid && sdSec <= mid.t && mid.t < sdSec + ptSec
      ? { change_after_sec: mid.t - sdSec, change_kind: mid.kind, change_power: mid.power,
          change_label: pulseSetMessage(mid.kind, mid.power, mid.t, "Main") }
      : {};
    out.push(B("main", "", { min: ptMin, integration_ms: ims, ...change }));
  }
  out.push(B("end_stop", "", { skip: null }));
  log.push(["Process", "종료 절차가 생성되었습니다."]);
  return [out, log];
}

/** blocks_expand.template_from_row — v1 레시피 한 행 → 블록(delay 판정 → TEST 표시 → 정규화 → Thickness 모드 → 템플릿) */
export function templateFromRow(raw: Row, chamber: number, cfg: Cfg, defs: Ch12Defs, rowNo = 1,
  uiTargets: Record<string, string> = {}): RowTemplate {
  const caps = capsFromCfg(cfg, chamber);
  const plan = planRow(raw);
  if (plan.kind === "delay") {
    return { row: rowNo, kind: "delay", logs: [], params: null, error: "",
      blocks: [{ type: "row_delay", params: { sec: plan.delaySec, label: plan.label, name: plan.disp }, label: "", row: rowNo }] };
  }
  const logs: Log[] = [];
  const p = normalizeRow(plan.raw, chamber, caps, logs, uiTargets);
  if (!plan.test && thicknessModeOf(p.thickness, caps.thickness)) p.thickness_mode = true;
  let blocks: TBlock[], tlog: Log[];
  try {
    [blocks, tlog] = templateBlocks(p, chamber, cfg, defs, caps);
  } catch (e) {
    if (e instanceof StepError) return { row: rowNo, kind: "error", blocks: [], logs, params: p, error: `${e.code}: ${e.detail}` };
    throw e;
  }
  for (const b of blocks) b.row = rowNo;
  return { row: rowNo, kind: plan.test ? "test" : "process", blocks, logs: [...logs, ...tlog], params: p, error: "" };
}

/** blocks_expand.template_from_rows — 행 전부 → [블록 목록(행마다 row = 순번), 행별 결과] */
export function templateFromRows(rows: Row[], chamber: number, cfg: Cfg, defs: Ch12Defs): [TBlock[], RowTemplate[]] {
  const rts = rows.map((r, i) => templateFromRow(r, chamber, cfg, defs, i + 1));
  return [rts.flatMap((r) => r.blocks), rts];
}

export { isNum };
