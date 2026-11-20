// 챔버12 웹 블록 검사 — 장비와 같은 계산(TS). 마지막 판단은 장비(블록 레시피를 받을 때 다시 검사한다).
// 옮긴 것(Chamber.Total_program rewrite/v2 — v2/ch12): blocks.check_blocks(_check_one·_check_param·_as_type),
//   blocks.edit_sequence(시퀀스 편집 — 시작 안 한 블록만), blocks_expand.expand 중 검사에 드러나는 것
//   (heater_wait 목표 없음 = '펼치기 실패' 오류, 자동 끝 정지가 붙는가), process_steps.caps_from_cfg·step_cfg(쓰는 필드)·_cget,
//   recipe_check.rfp_freq_max_khz·dcp_max_off_us·check_dc_pulse·heater_limit_c.
// 정의는 장비 web_blocks.definitions()(defs) 에서 읽는다 — 블록 정의(값 형식·범위·enum·기본값·필수·챔버 전용·필요 지원·
//   touches), 블록 키·한도·자동 끝 정지 이름, 설정 기본값(stepCfgDefaults). 값 사이 규칙은 valueRules 의 id 로 알아보고
//   (모르는 id 가 있으면 envOf 가 null — 웹 검사 안 함), 문구 틀·계산 순서는 이 파일에 옮겨 있다.
// 숫자 모양: _as_type 으로 float 정의 값은 float, int 정의 값은 정수면 int — 문구는 정의 형식대로 찍는다.
// 골든 lib/ops2/ch12/golden/web_ch12_blocks.json 을 npm run ops2:golden 이 이 파일로 확인한다.
import {
  cmpCodePoint, g, isNum, isObj, pyEmpty, pyFixed, pyFloatAny, pyFloatRepr, pyIntAny, pyLen, pyNum, pyRepr, pyRoundN,
  pySorted, pyStrip, pyTruthy,
} from "./py";

/** 장비 web_blocks.WEB_BLOCKS_VERSION 과 같아야 웹 검사를 한다 */
export const WEB_BLOCKS_VERSION = 1;
/** 이 파일이 아는 값 사이 규칙(web_blocks.VALUE_RULES id) */
export const KNOWN_RULES = [
  "chamber_only", "needs_cap", "gas_flow_blank", "ch1_no_n2", "shutter_gun_exists", "power_cap", "pulse_exclusive",
  "rfp_freq_range", "dcp_off_range", "heater_limit", "main_change_together", "heater_wait_target",
] as const;

export type Cfg = Readonly<Record<string, unknown>>;
export type BParamDef = {
  name: string; type: string; unit: string; default: unknown; required: boolean; min: number | null; max: number | null;
  minExclusive: boolean; enum: unknown[] | null; label: string; desc: string;
};
export type BlockDef = {
  type: string; label: string; params: BParamDef[]; steps: string; v1: string; touches: boolean; chamber: number | null;
  needs: string; skippable: boolean; skipCleanup: string[]; pausable: boolean; pause: string; resumable: boolean;
  resumeChecks: string[]; desc: string;
};
export type ValueRule = { id: string; blocks: string[]; kind: string; when: string; msg: string };
export type StepCfgDefaults = {
  chamber: number; gun_shutters: string[]; base_pressure: number; integration_ms: number; pressure_wait_timeout_s: number;
  rf_pulse_post_on_delay_ms: number; boost_target: number; power_select_settle_ms: number; [k: string]: unknown;
};
/** 장비 web_blocks.definitions() */
export type Ch12Defs = {
  version: number;
  blocks: {
    defs: BlockDef[]; blockKeys: string[]; limits: { labelMax: number; maxBlocks: number }; autoEndStopLabel: string;
    valueRules: ValueRule[]; shutdownParts: { id: string; label: string; skippable: boolean }[]; endStopMustKeep: string[];
    resumeChecks: Record<string, string>; edit: { ops: string[]; reasons: string[]; desc: string };
    adjust: { command: string; items: unknown[] }; empty: string; rules: string;
  };
  cfg: {
    keys: { key: string; field: string; type: string; use: string }[]; plainKeys: { key: string; default: number; use: string }[];
    stepCfgDefaults: Record<string, StepCfgDefaults>; rfpFreqMaxHzDefault: number; channelRule: string;
  };
  recipe: {
    templateColumns: string[]; extraColumns: string[]; columnDoc: Record<string, { desc: string; unit: string; blank: string; key: string }>;
    tfTrue: string[]; tfFalse: string[];
    raw: {
      code: string; prefix: string; maxShown: number; floatKeys: string[]; rangeKeys: Record<string, [number, number, string]>;
      intKeys: string[]; offTimeKeys: string[]; tfKeys: string[]; tfTrue: string[]; tfFalse: string[];
      enumKeys: Record<string, string[]>; durationKeys: string[]; pair: [string, string];
    };
    norm: { heaterRampMax: number; heaterSoakMax: number; dcpFreq: [number, number]; dcpOff: [number, number] };
    durationPattern: string; delayNamePattern: string;
  };
};
export type Caps = { dc: boolean; dc2: boolean; rf: boolean; dcp: boolean; rfp: boolean; heater: boolean; thickness: boolean };
/** step_cfg 중 검사·기본 템플릿이 쓰는 것 */
export type StepCfg = {
  chamber: number; gunShutters: string[]; basePressure: number; integrationMs: number; pressureWaitTimeoutS: number;
  rfPulsePostOnDelayMs: number; boostTarget: number; powerSelectSettleMs: number;
};
export type Ch12Env = { defs: Ch12Defs; byType: Map<string, BlockDef>; cfg: Cfg; chamber: 1 | 2; caps: Caps };
/** 정리된 블록(check_blocks 의 clean) */
export type CleanBlock = { type: string; params: Record<string, unknown>; label: string; row?: number };
export type BlocksResult = { clean: CleanBlock[] | null; errors: string[]; warnings: string[] };
export type EditResult = {
  ok: boolean; blocks: CleanBlock[] | null; rev: number; reason: "" | "EDIT_STARTED_BLOCK" | "EDIT_BAD_OP" | "EDIT_INVALID";
  errors: string[]; warnings: string[];
};

// ───────────── 설정 ─────────────
/** process_steps._cget — CHn_키 → 키 → 기본값(null 은 없는 것). 목록·사전 기본값인데 글이면 JSON */
export function cget(cfg: Cfg, ch: number, key: string, dflt: unknown): unknown {
  let v = cfg[`CH${ch}_${key}`];
  if (v === null || v === undefined) v = cfg[key];
  if (v === null || v === undefined) return dflt;
  if (dflt !== null && typeof dflt === "object" && typeof v === "string") v = JSON.parse(v);
  return v;
}

/** process_steps.caps_from_cfg(set_dcp·set_rfp 는 늘 true) */
export function capsFromCfg(cfg: Cfg, ch: number): Caps {
  const first = (...names: string[]): boolean | null => {
    for (const n of names) {
      const v = cget(cfg, ch, n, null);
      if (v !== null && v !== undefined) return pyTruthy(v);
    }
    return null;
  };
  const pick = (v: boolean | null, d: boolean) => (v === null ? d : v);
  const heaterFlag = first("SUPPORTS_HEATER");
  return {
    dc: pick(first("SUPPORTS_DC_CONT", "SUPPORTS_DC"), ch === 2),
    dc2: pick(first("SUPPORTS_DC_CONT2", "SUPPORTS_DC2"), false) && ch === 2 && !heaterFlag,
    rf: ch === 2 ? true : pick(first("SUPPORTS_RF_CONT"), false),
    dcp: pick(first("SUPPORTS_DC_PULSE", "SUPPORTS_DCPULSE"), ch === 1),
    rfp: pick(first("SUPPORTS_RFPULSE", "SUPPORTS_RF_PULSE"), ch === 2),
    heater: !!heaterFlag && ch === 2,
    thickness: !!first("SUPPORTS_THICKNESS"),
  };
}

/** process_steps.step_cfg 중 쓰는 필드(기본값 = 묶음 stepCfgDefaults) */
export function stepCfg(defs: Ch12Defs, cfg: Cfg, ch: number): StepCfg {
  const d = defs.cfg.stepCfgDefaults[String(ch)];
  const key = (field: string) => defs.cfg.keys.find((k) => k.field === field)?.key ?? field.toUpperCase();
  const get = (field: string) => cget(cfg, ch, key(field), d[field]);
  const guns = get("gun_shutters");
  return {
    chamber: ch,
    gunShutters: Array.isArray(guns) ? guns.map((x) => String(x)) : Array.from(String(guns)),
    basePressure: pyFloatAny(get("base_pressure")),
    integrationMs: pyIntAny(get("integration_ms")),
    pressureWaitTimeoutS: pyFloatAny(get("pressure_wait_timeout_s")),
    rfPulsePostOnDelayMs: pyIntAny(get("rf_pulse_post_on_delay_ms")),
    boostTarget: pyFloatAny(get("boost_target")),
    powerSelectSettleMs: pyIntAny(get("power_select_settle_ms")),
  };
}

/** recipe_check.rfp_freq_max_khz — RFPULSE_FREQ_MAX_HZ/1000, 0 이하·오류면 30 kHz */
export function rfpFreqMaxKhz(defs: Ch12Defs, cfg: Cfg, ch: number): number {
  const d = defs.cfg.rfpFreqMaxHzDefault;
  let hz: number;
  try {
    hz = pyFloatAny(cget(cfg, ch, "RFPULSE_FREQ_MAX_HZ", d));
  } catch {
    hz = d;
  }
  return (hz > 0 ? hz : d) / 1000.0;
}

/** recipe_check.heater_limit_c — min(MAX_TEMP, SV_LIMIT), SV ≤ 0 → 500, MAX ≤ 0 또는 > SV → SV */
export function heaterLimitC(defs: Ch12Defs, cfg: Cfg): number {
  const [svK, mtK] = ["CH2_HEATER_SV_LIMIT_C", "CH2_HEATER_MAX_TEMP"].map((k) => defs.cfg.plainKeys.find((x) => x.key === k));
  const val = (k: { key: string; default: number } | undefined, dk: string) =>
    pyFloatAny(cfg[k?.key ?? dk] ?? k?.default ?? 900.0);
  let sv = val(svK, "CH2_HEATER_SV_LIMIT_C");
  if (sv <= 0) sv = 500.0;
  let mt = val(mtK, "CH2_HEATER_MAX_TEMP");
  if (mt <= 0 || mt > sv) mt = sv;
  return Math.min(mt, sv);
}

/** recipe_check.dcp_max_off_us */
export function dcpMaxOffUs(defs: Ch12Defs, f: number): number {
  const abs = defs.recipe.norm.dcpOff[1];
  if (f <= 0.0) return abs;
  return pyRoundN(Math.min(abs, 400.0 / f), 1);
}

/** recipe_check.check_dc_pulse — freq(kHz | null)·off(µs | 글 | null) */
export function checkDcPulse(defs: Ch12Defs, freq: unknown, off: unknown): string[] {
  const errs: string[] = [];
  const [fmin, fmax] = defs.recipe.norm.dcpFreq;
  const [omin, oabs] = defs.recipe.norm.dcpOff;
  const f = freq as number | null | undefined;
  if (f !== null && f !== undefined && !(fmin <= f && f <= fmax)) errs.push(`DC Pulse Freq(kHz)는 ${fmin}..${fmax}`);
  if (off === null || off === undefined) return errs;
  if (typeof off === "string") {
    if (pyStrip(off).toUpperCase() !== "DC") errs.push(`DC Pulse Off Time '${off}' 은 숫자(µs) 또는 DC 여야 합니다`);
    return errs;
  }
  let offV: number;
  try {
    offV = pyFloatAny(off);
  } catch {
    errs.push(`DC Pulse Off Time '${String(off)}' 은 숫자(µs) 또는 DC 여야 합니다`);
    return errs;
  }
  const hasF = pyTruthy(f);
  const mx = hasF ? dcpMaxOffUs(defs, f as number) : oabs;
  if (offV < omin) {
    errs.push(`DC Pulse Off Time ${pyFixed(offV, 1)}µs 는 최소 ${pyFixed(omin, 1)}µs 미만입니다 (매뉴얼 p.12/13)`);
  } else if (offV > mx) {
    const fx = hasF ? `${g(f as number)}kHz` : "(주파수 미지정 → 절대 상한)";
    errs.push(`DC Pulse Off Time ${pyFixed(offV, 1)}µs 는 ${fx} 상한 ${pyFixed(mx, 1)}µs 초과(매뉴얼 p.13 그림3)`);
  }
  return errs;
}

// ───────────── 환경 ─────────────
/** 정의(web_blocks.definitions()) + 설정 + 챔버 → 검사 환경. 정의 판·규칙 id 가 이 파일과 다르면 null(웹 검사 안 함) */
export function envOf(defs: unknown, cfg: Cfg, chamber: number): Ch12Env | null {
  const d = defs as Ch12Defs;
  if (!d || d.version !== WEB_BLOCKS_VERSION || !Array.isArray(d.blocks?.defs) || !d.cfg?.stepCfgDefaults) return null;
  if (chamber !== 1 && chamber !== 2) return null;
  const known = new Set<string>(KNOWN_RULES);
  if (!Array.isArray(d.blocks.valueRules) || d.blocks.valueRules.some((r) => !known.has(r.id))) return null;
  return { defs: d, byType: new Map(d.blocks.defs.map((x) => [x.type, x])), cfg, chamber, caps: capsFromCfg(cfg, chamber) };
}

// ───────────── 검사 ─────────────
/** blocks._as_type — float 정의는 숫자 그대로(float), int 정의는 정수값이면 int */
const numText = (p: BParamDef, v: number) => (p.type === "float" ? pyFloatRepr(v) : pyNum(v, false));

/** blocks._check_param — 오류 문구 또는 null */
function checkParam(p: BParamDef, v: unknown): string | null {
  const en = p.enum ?? [];
  const t = p.type;
  if (t === "bool") return typeof v === "boolean" ? null : "true/false 여야 함";
  if (t === "str") return typeof v === "string" ? null : "문자열이어야 함";
  if (t === "enum") return en.includes(v as never) && typeof v === "string" ? null : `${pyRepr(en)} 중 하나`;
  if (t === "list" || t === "parts") {
    const isList = Array.isArray(v);
    const bad = !isList || v.some((x) => !(typeof x === "string" && en.includes(x))) || new Set(v).size !== v.length;
    if (bad) {
      if (t === "parts" && isList) {
        const keep = pySorted(new Set((v as unknown[]).filter((x): x is string => typeof x === "string" && !en.includes(x))));
        return `뺄 수 없는 단계 ${pyRepr(keep)} — 뺄 수 있는 것 ${pyRepr(en)}`;
      }
      return `${pyRepr(en)} 중 하나 이상(중복 없음)`;
    }
    if (t === "list" && !(v as unknown[]).length) return "하나 이상";
    return null;
  }
  if (t === "off") {
    if (typeof v === "string" && pyStrip(v).toUpperCase() === "DC") return null;
    return isNum(v) ? null : "숫자(µs) 또는 DC";
  }
  if (!isNum(v)) return "숫자여야 함";
  if (t === "int" && !Number.isInteger(v)) return "정수여야 함";
  if (p.min !== null && (p.minExclusive ? v <= p.min : v < p.min)) {
    return `${numText(p, v)} ${p.minExclusive ? "≤" : "<"} ${g(p.min)}`;
  }
  if (p.max !== null && v > p.max) return `${numText(p, v)} > ${g(p.max)}`;
  return null;
}

const POWER_CAPS: [string, keyof Caps, string][] = [
  ["dc_power", "dc", "DC 연속"], ["dc2_power", "dc2", "DC2(폐지 — 히터와 배타)"], ["rf_power", "rf", "RF 연속"],
  ["dcp_power", "dcp", "DC Pulse"], ["rfp_power", "rfp", "RF Pulse"],
];

/** blocks._check_one — 정리된 블록 또는 null(더 볼 수 없음) */
function checkOne(env: Ch12Env, b: unknown, path: string, errs: string[], warns: string[]): CleanBlock | null {
  const { defs, chamber, caps, cfg } = env;
  if (!isObj(b)) {
    errs.push(`블록 ${path}: 객체여야 함`);
    return null;
  }
  const t = b.type;
  const d = typeof t === "string" ? env.byType.get(t) : undefined;
  if (!d) {
    errs.push(pyEmpty(t) ? `블록 ${path}: type 필요` : `블록 ${path}: 모르는 종류 ${pyRepr(t)}`);
    return null;
  }
  const pre = `블록 ${path}(${d.type})`;
  const extra = Object.keys(b).filter((k) => !defs.blocks.blockKeys.includes(k));
  if (extra.length) errs.push(`${pre}: 모르는 키 ${pyRepr(pySorted(extra))}`);
  const params = pyTruthy(b.params) ? b.params : {};
  if (!isObj(params)) {
    errs.push(`${pre}: params 는 객체`);
    return null;
  }
  const names = new Set(d.params.map((p) => p.name));
  for (const k of Object.keys(params)) if (!names.has(k)) errs.push(`${pre}: ${k}: 모르는 값`);
  const out: Record<string, unknown> = {};
  const bad = new Set<string>();
  for (const p of d.params) {
    let v = params[p.name];
    if (pyEmpty(v) || (p.type === "parts" && Array.isArray(v) && v.length === 0)) {
      if (p.required) {
        errs.push(`${pre}: ${p.name}: 값 필요`);
        bad.add(p.name);
      }
      out[p.name] = typeof p.default === "string" && p.default.startsWith("cfg:") ? null : p.default;
      continue;                                          // "cfg:키" 는 비운 채로 — 펼칠 때(공정 시작 때) 설정에서
    }
    if (v === undefined) v = null;
    const e = checkParam(p, v);
    if (e) {
      errs.push(`${pre}: ${p.name}: ${e}`);
      bad.add(p.name);
    }
    out[p.name] = v;
  }
  const label = pyEmpty(b.label) ? null : b.label;
  if (label !== null && (typeof label !== "string" || pyLen(label) > defs.blocks.limits.labelMax)) {
    errs.push(`${pre}: label 은 ${defs.blocks.limits.labelMax}자 이하 문자열`);
  }
  const row = b.row;
  if (row !== null && row !== undefined && (typeof row !== "number" || !Number.isInteger(row) || row < 1)) {
    errs.push(`${pre}: row 는 1 이상 정수`);
  }
  // 장비·챔버(chamber_only·needs_cap)
  if (d.chamber !== null && d.chamber !== chamber) errs.push(`${pre}: CH${chamber} 에서는 쓸 수 없음(CH${d.chamber} 전용)`);
  if (d.needs && !caps[d.needs as keyof Caps]) errs.push(`${pre}: 이 챔버 설정에서 꺼져 있음(SUPPORTS_${d.needs.toUpperCase()})`);
  const o = out;
  if (d.type === "gas_intro") {                         // gas_flow_blank
    for (const gas of ["ar", "o2", "n2"]) {
      if (o[gas] === true && !bad.has(`${gas}_flow`) && pyEmpty(o[`${gas}_flow`])) {
        warns.push(`${pre}: ${gas}_flow 비움 → 0 sccm(v1 공란 = 0)`);
      }
    }
  }
  if ((d.type === "gas_prep" || d.type === "gas_intro") && chamber === 1 && o.n2 === true) {   // ch1_no_n2
    errs.push(`${pre}: n2: CH1 은 N2 라인 없음`);
  }
  if (d.type === "shutter" && !bad.has("targets")) {    // shutter_gun_exists
    const guns = new Set(stepCfg(defs, cfg, chamber).gunShutters.map((x) => x.toLowerCase()));
    const miss = (o.targets as string[]).filter((x) => x !== "ms" && !guns.has(x));
    if (miss.length) errs.push(`${pre}: targets: 이 챔버에 없는 건 셔터 ${pyRepr(miss)}(PROCESS_GUN_SHUTTERS)`);
  }
  if (d.type === "power_on") {
    for (const [k, cap, lab] of POWER_CAPS) {           // power_cap
      if (isNum(o[k]) && !caps[cap]) errs.push(`${pre}: ${k}: 이 챔버는 ${lab} 미지원`);
    }
    if (isNum(o.dcp_power) && isNum(o.rfp_power)) {     // pulse_exclusive
      errs.push(`${pre}: RF Pulse와 DC Pulse는 동시에 사용할 수 없습니다 (같은 시리얼 포트)`);
    }
    if (isNum(o.rfp_freq_khz)) {                        // rfp_freq_range
      const fmax = rfpFreqMaxKhz(defs, cfg, chamber);
      if (!(0.001 <= o.rfp_freq_khz && o.rfp_freq_khz <= fmax)) errs.push(`${pre}: rfp_freq_khz: 허용 범위 0.001~${g(fmax)}kHz 밖`);
    }
    if (!bad.has("dcp_off_us") && o.dcp_off_us !== null) {   // dcp_off_range
      const f = isNum(o.dcp_freq_khz) ? o.dcp_freq_khz : null;
      const off = typeof o.dcp_off_us === "string" ? o.dcp_off_us : pyRoundN(o.dcp_off_us as number, 1);
      for (const e of checkDcPulse(defs, f, off)) if (!e.startsWith("DC Pulse Freq")) errs.push(`${pre}: ${e}`);
    }
  }
  if (d.type === "heater_set" && isNum(o.target_c)) {   // heater_limit
    const lim = heaterLimitC(defs, cfg);
    if (o.target_c > lim) errs.push(`${pre}: target_c: ${g(o.target_c)} > ${g(lim)}°C`);
  }
  if (d.type === "main") {                              // main_change_together
    const has = ["change_after_sec", "change_kind", "change_power"].map((k) => !pyEmpty(o[k]));
    if (has.some(Boolean) && !has.every(Boolean)) errs.push(`${pre}: change_after_sec·change_kind·change_power 는 함께 넣어야 함`);
  }
  return { type: d.type, params: out, label: (label as string | null) || "", ...(row !== null && row !== undefined ? { row: row as number } : {}) };
}

/** blocks_expand.expand 가 검사에서 실패하는 경우 — heater_wait 목표(heater_wait_target). 문구 또는 null */
function expandFailure(blocks: CleanBlock[]): string | null {
  let heater: number | null = null;
  for (const b of blocks) {
    if (b.type === "heater_set") heater = pyFloatAny(b.params.target_c);
    if (b.type === "heater_wait" && typeof b.params.target_c !== "number" && heater === null) {
      return "펼치기 실패: 히터 도달 대기: 목표 없음(앞에 히터 설정 블록이 없고 target_c 도 비었다)";
    }
  }
  return null;
}

/** blocks.check_blocks — (정리된 블록 또는 null, 오류, 경고). 값·장비 지원만 — 순서·조합 규칙 없음 */
export function checkBlocks(blocks: unknown, env: Ch12Env): BlocksResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!Array.isArray(blocks) || !blocks.length) return { clean: null, errors: ["블록 목록이 비었다"], warnings };
  const max = env.defs.blocks.limits.maxBlocks;
  if (blocks.length > max) return { clean: null, errors: [`블록 ${blocks.length}개 > ${max}`], warnings };
  const out: CleanBlock[] = [];
  blocks.forEach((b, i) => {
    const x = checkOne(env, b, String(i + 1), errors, warnings);
    if (x) out.push(x);
  });
  if (!errors.length) {
    const e = expandFailure(out);
    if (e) errors.push(e);
  }
  return { clean: errors.length ? null : out, errors, warnings };
}

/** 펼치면 자동 끝 정지가 붙는가 — 마지막 end_stop 뒤 구간에 장비를 건드리는 블록이 있으면(blocks_expand.expand) */
export function autoEndStop(blocks: CleanBlock[], env: Ch12Env): boolean {
  let seg: CleanBlock[] = [];
  for (const b of blocks) seg = b.type === "end_stop" ? [] : [...seg, b];
  return seg.some((b) => env.byType.get(b.type)?.touches);
}

// ───────────── 시퀀스 편집 ─────────────
const clone = <T>(x: T): T => (x === undefined ? x : JSON.parse(JSON.stringify(x)));

/** blocks.edit_sequence — 아직 시작 안 한 블록만 추가·삭제·순서 변경(startedUpto = 시작한 맨 위 블록 수).
 *  op = {op:"insert", at, block} · {op:"delete", at} · {op:"move", from, to}(0 부터). 편집 뒤 전체 재검사 — 통과하면 판 +1 */
export function editSequence(blocks: unknown[], startedUpto: number, op: unknown, env: Ch12Env, rev = 0): EditResult {
  const fail = (reason: EditResult["reason"], errors: string[], warnings: string[] = []): EditResult =>
    ({ ok: false, blocks: null, rev, reason, errors, warnings });
  const cur: unknown[] = clone(blocks);
  const n = cur.length;
  const k = Math.trunc(startedUpto);
  const ops = env.defs.blocks.edit.ops;
  const kind = isObj(op) ? op.op : null;
  if (!(typeof kind === "string" && ops.includes(kind)) || !(0 <= k && k <= n)) {
    return fail("EDIT_BAD_OP", [`op 는 ${pyRepr(ops)} 중 하나, started_upto 0~${n}`]);
  }
  const o = op as Record<string, unknown>;
  const idx = (name: string, hi: number): number | null => {
    const v = o[name];
    return typeof v === "number" && Number.isInteger(v) && 0 <= v && v <= hi ? v : null;
  };
  if (kind === "insert") {
    const at = idx("at", n);
    if (at === null || !isObj(o.block)) return fail("EDIT_BAD_OP", ["insert: at(0~길이)·block 필요"]);
    if (at < k) return fail("EDIT_STARTED_BLOCK", [`시작한 블록 앞(${at} < ${k})에는 넣을 수 없음`]);
    cur.splice(at, 0, clone(o.block));
  } else if (kind === "delete") {
    const at = idx("at", n - 1);
    if (at === null) return fail("EDIT_BAD_OP", ["delete: at(0~길이-1) 필요"]);
    if (at < k) return fail("EDIT_STARTED_BLOCK", [`시작한 블록(${at})은 지울 수 없음`]);
    cur.splice(at, 1);
  } else {
    const a = idx("from", n - 1), b = idx("to", n - 1);
    if (a === null || b === null) return fail("EDIT_BAD_OP", ["move: from·to(0~길이-1) 필요"]);
    if (a < k || b < k) return fail("EDIT_STARTED_BLOCK", [`시작한 블록 범위(0~${k - 1})는 옮길 수 없음`]);
    const [x] = cur.splice(a, 1);
    cur.splice(b, 0, x);
  }
  // 시작한 블록(앞 k 개)은 위 규칙으로 늘 그대로다(장비는 한 번 더 비교한다)
  const r = checkBlocks(cur, env);
  if (r.errors.length) return fail("EDIT_INVALID", r.errors, r.warnings);
  return { ok: true, blocks: r.clean, rev: rev + 1, reason: "", errors: [], warnings: r.warnings };
}

/** 정의 표에서 블록 정의(화면용) */
export const blockDef = (env: Ch12Env, type: string): BlockDef | undefined => env.byType.get(type);
/** 끝 정지에서 뺄 수 있는 단계(정의 순서) */
export const skippableParts = (env: Ch12Env): string[] =>
  env.defs.blocks.shutdownParts.filter((p) => p.skippable).map((p) => p.id);
export { cmpCodePoint };
