// 챔버K v2 웹 블록 검사 — 장비와 같은 계산(TS). 마지막 판단은 장비(RECIPE_INVALID·DEVICE_DISABLED·IG_DISABLED).
// 옮긴 것(챔버K rewrite/v2 2029ce5, EXPORT_VERSION 8 — d0bb5a1·9 의 label·stage 빈 글·type 필요·valueRules.uses 반영):
//   blocks.check_blocks(_check_one·_check_param·_when — 값 사이·꺼진 장비 규칙 표 valueRules 를 묶음에서 읽어 해석,
//   repeat 안쪽·중첩 한도·정지 순서 번호·_as_type 숫자 형식 정리), blocks.expand(_expand_list·_expand_block — 펼친 단계,
//   자동 끝 정지), blocks.uses_of, process_steps.build_gas_pre_steps·build_gas_intro_steps, recipe.pulse_edge_violation,
//   tools/make_web_block_golden.summary(펼친 단계 요약 모양 {no, type, label, stage, iter, auto, params, watch?, steps}).
// 정의·규칙·한도는 묶음 blocks(defs·valueRules·blockKeys·limits·watchItems·watchDefault·shutters·spDefaultKey·heaterRampMin·
//   pulseEdge·autoEndStopLabel)와 stopSequence(steps.no·endStopMustKeep), 설정값은 recipe.ts checkEnvOf 의 cfg.
// 묶음에 없어 코드로 옮긴 것: 스텝 동작·문구·드라이버 명령 이름(블록 종류마다 펼치는 방법), 셔터 PLC 버튼
//   (S1_button·S2_button·MS_button), 가스 밸브 버튼(Ar_Button·O2_Button), 오류 문구 틀, valueRules.when 문법 해석.
// 숫자 모양: _as_type 으로 값이 정의 형식이 되므로(float → float, int 는 정수값이면 int) 문구는 정의 형식대로 찍는다.
// 골든(lib/ops2/chk/golden/web_block_cases.json)을 npm run ops2:golden 이 이 파일로 확인한다.
import type { Cfg } from "./recipe";
import { empty, isObj, pyFixed, pyExp, pyFloat, pyFloatOr0, pyG, pyInt, pyNum, pyRepr, pyRound, pyStr, pyTruthy } from "./py";

export type BParamDef = {
  name: string; type: string; unit: string; default: unknown; required: boolean;
  min: number | null; max: number | null; paramMin: string | null; paramMax: string | null; paramScale: number;
  minExclusive: boolean; enum: unknown[] | null; desc: string;
};
export type BlockDef = {
  type: string; label: string; params: BParamDef[]; stage: string; stages: string[];
  watch: Record<string, boolean> | null; container: boolean; steps: string; v1?: string; desc: string;
};
export type ValueRule = { id: string; blocks: string[]; kind: string; when: string; key: string; msg: string; uses?: string[] };
export type BlockDefs = {
  defs: BlockDef[];
  watchItems: { item: string; rule: string; label: string }[];
  watchDefault: Record<string, boolean>; watchMain: Record<string, boolean>;
  condFields: { field: string; label: string; unit: string }[];
  condOps: { op: string; label: string }[];
  shutters: { target: string; label: string }[];
  limits: { repeatMax: number; maxDepth: number; maxExpandedSteps: number; labelMax: number };
  blockKeys: string[]; valueRules: ValueRule[]; spDefaultKey: Record<string, string>;
  heaterRampMin: number; pulseEdge: { param: string }; autoEndStopLabel: string;
};
export type BlockEnv = {
  defs: BlockDefs; byType: Map<string, BlockDef>; stopNos: number[]; mustKeep: number[]; cfg: Cfg;
};
/** 정리된 블록(check_blocks 의 clean) — 반복만 blocks */
export type CleanBlock = { type: string; params: Record<string, unknown>; label: string; stage: string; blocks?: CleanBlock[] };
/** 펼친 스텝 요약 — 값이 있는 키만(null·""·false 는 뺀다) */
export type ExpStep = {
  action: string; message: string; params?: unknown; value?: number; sec?: number; timer?: string; polling?: boolean;
  ref?: string; internal?: boolean; spec?: unknown;
};
/** 펼친 블록 하나 — 반복 안은 no "5.2#2", iter "2" */
export type ExpBlock = {
  no: string; type: string; label: string; stage: string; iter: string | null; auto: boolean;
  params: Record<string, unknown>; watch?: Record<string, boolean>; steps: ExpStep[];
};
export type Uses = { dc: boolean; rf: boolean; rfp: boolean; heater: boolean; ig: boolean; ar: boolean; o2: boolean };
export type BlocksResult = { clean: CleanBlock[] | null; errors: string[]; warnings: string[] };

const SHUTTER_BTN: Record<string, string> = { g1: "S1_button", g2: "S2_button", ms: "MS_button" };
const GAS: [number, "ar" | "o2", string][] = [[1, "ar", "Ar_Button"], [2, "o2", "O2_Button"]];

const isNum = (v: unknown): v is number => typeof v === "number" && !Number.isNaN(v);

/** 묶음 → 블록 검사 환경. 블록 규칙 표(valueRules — 묶음 8)가 없으면 null(웹 블록 검사 안 함) */
export function blockEnvOf(bundle: unknown, cfg: Cfg): BlockEnv | null {
  const b = bundle as { blocks?: Partial<BlockDefs>; stopSequence?: { steps?: { no: number }[]; endStopMustKeep?: number[] } };
  const d = b?.blocks;
  if (!d || !Array.isArray(d.defs) || !Array.isArray(d.valueRules) || !Array.isArray(d.blockKeys) || !d.limits) return null;
  const steps = b.stopSequence?.steps;
  if (!Array.isArray(steps) || !steps.length) return null;
  return {
    defs: d as BlockDefs, byType: new Map(d.defs.map((x) => [x.type, x])), cfg,
    stopNos: steps.map((s) => s.no), mustKeep: b.stopSequence?.endStopMustKeep ?? [],
  };
}

/** recipe.pulse_edge_violation — ON·OFF 시간 ≥ 최소(CESAR 명령 96) */
export function pulseEdgeViolation(freqHz: number, duty: number, minEdge: number): string | null {
  if (minEdge <= 0 || freqHz <= 0) return null;
  const on = duty / 100.0 / freqHz * 1e6;
  const off = (100.0 - duty) / 100.0 / freqHz * 1e6;
  if (on >= minEdge - 1e-6 && off >= minEdge - 1e-6) return null;
  return `${pyG(freqHz)} Hz·${pyG(duty)}% → ON ${pyFixed(on, 1)} µs / OFF ${pyFixed(off, 1)} µs < ${pyG(minEdge)} µs`;
}

// ───────────── 검사 ─────────────
class UnknownRule extends Error {}

/** BRule.when — "·" 로 이은 조건이 모두 참 */
function when(env: BlockEnv, w: string, out: Record<string, unknown>): boolean {
  for (const c of w.split("·").filter(Boolean)) {
    let ok: boolean;
    if (c === "sp∉spDefaultKey") {
      ok = !(isNum(out.sp) && String(out.sp) in env.defs.spDefaultKey && Number.isInteger(out.sp));
    } else if (c.startsWith("0<") && c.endsWith("<heaterRampMin")) {
      const v = out[c.slice(2, -"<heaterRampMin".length)];
      ok = isNum(v) && 0 < v && v < env.defs.heaterRampMin;
    } else if (c.endsWith("=true")) {
      ok = out[c.slice(0, -5)] === true;
    } else if (c.endsWith(":num")) {
      ok = isNum(out[c.slice(0, -4)]);
    } else if (c.includes("^=")) {
      const [k, pre] = [c.slice(0, c.indexOf("^=")), c.slice(c.indexOf("^=") + 2)];
      ok = (pyTruthy(out[k]) ? pyStr(out[k]) : "").startsWith(pre);
    } else {
      throw new UnknownRule(c);
    }
    if (!ok) return false;
  }
  return true;
}

/** BRule.uses — 조건·문구가 쓰는 블록 값 이름(묶음 9 에 있음, 없으면 같은 방법으로 셈) */
function ruleUses(r: ValueRule): string[] {
  if (Array.isArray(r.uses)) return r.uses;
  const names = [...r.msg.matchAll(/{(w+)}/g)].map((m) => m[1])
    .concat(r.when.split("·").filter(Boolean).map((c) => c.split(/=true|:num|^=|∉|<heaterRampMin/)[0].replace(/^0</, "")));
  return [...new Set(names.filter((n) => n !== "edge"))];
}

/** BRule.msg.format(**out) — 값은 정의 형식대로 */
function fmtMsg(msg: string, vals: Record<string, unknown>, d: BlockDef | null): string {
  return msg.replace(/\{(\w+)\}/g, (_m, k: string) =>
    pyStr(vals[k], d?.params.find((p) => p.name === k)?.type === "float"));
}

function bounds(p: BParamDef, cfg: Cfg): [number | null, number | null] {
  const side = (key: string | null, v: number | null) => {
    if (!key) return v;
    const c = cfg[key];
    return isNum(c) ? pyFloat(c) * p.paramScale : null;
  };
  return [side(p.paramMin, p.min), side(p.paramMax, p.max)];
}

function checkParam(env: BlockEnv, p: BParamDef, v: unknown): string | null {
  const en = p.enum ?? [];
  switch (p.type) {
    case "bool": return typeof v === "boolean" ? null : "true/false 여야 함";
    case "str": return typeof v === "string" ? null : "문자열이어야 함";
    case "enum": return en.includes(v) ? null : `${pyRepr(en)} 중 하나`;
    case "list":
      if (!Array.isArray(v) || !v.length || v.some((x) => !en.includes(x)) || new Set(v).size !== v.length) {
        return `${pyRepr(en)} 중 하나 이상(중복 없음)`;
      }
      return null;
    case "steps": {
      const nos = env.stopNos;
      if (!Array.isArray(v) || v.some((x) => typeof x !== "number" || !Number.isInteger(x) || !nos.includes(x))) {
        return `정지 순서 단계 번호 목록(${Math.min(...nos)}~${Math.max(...nos)})`;
      }
      const keep = [...new Set(v as number[])].filter((x) => env.mustKeep.includes(x)).sort((a, b) => a - b);
      return keep.length ? `파워 끄기 단계는 뺄 수 없음(사용자 결정 2026-10-21): ${pyRepr(keep)}` : null;
    }
    case "watch": {
      const items = env.defs.watchItems.map((w) => w.item);
      if (!isObj(v) || Object.entries(v).some(([k, x]) => !items.includes(k) || typeof x !== "boolean")) {
        return `{${items.join(", ")}} 의 true/false`;
      }
      return null;
    }
  }
  if (!isNum(v)) return "숫자여야 함";
  if (p.type === "int" && !Number.isInteger(v)) return "정수여야 함";
  const [lo, hi] = bounds(p, env.cfg);
  const vs = pyNum(v, p.type === "float");
  if (lo !== null && (p.minExclusive ? v <= lo : v < lo - 1e-12)) return `${vs} ${p.minExclusive ? "≤" : "<"} ${pyG(lo)}`;
  if (hi !== null && v > hi + 1e-12) return `${vs} > ${pyG(hi)}`;
  return null;
}

function checkOne(env: BlockEnv, b: unknown, path: string, depth: number, errs: string[], warns: string[]): CleanBlock | null {
  if (!isObj(b)) {
    errs.push(`블록 ${path}: 객체여야 함`);
    return null;
  }
  const d = typeof b.type === "string" ? env.byType.get(b.type) : undefined;
  if (!d) {
    errs.push(empty(b.type) ? `블록 ${path}: type 필요` : `블록 ${path}: 모르는 종류 ${pyRepr(b.type)}`);
    return null;
  }
  const pre = `블록 ${path}(${d.type})`;
  const extra = Object.keys(b).filter((k) => !env.defs.blockKeys.includes(k)).sort();
  if (extra.length) errs.push(`${pre}: 모르는 키 ${pyRepr(extra)}`);
  const params = pyTruthy(b.params) ? b.params : {};
  if (!isObj(params)) {
    errs.push(`${pre}: params 는 객체`);
    return null;
  }
  const known = new Set(d.params.map((p) => p.name));
  for (const k of Object.keys(params)) if (!known.has(k)) errs.push(`${pre}: ${k}: 모르는 값`);
  const out: Record<string, unknown> = {};
  const bad = new Set<string>();                         // 빠졌거나(필수) 틀린 값 — 이 값을 쓰는 값 사이 규칙은 건너뛴다
  for (const p of d.params) {
    const v = Object.hasOwn(params, p.name) ? params[p.name] : undefined;
    if (empty(v)) {
      if (p.required) {
        errs.push(`${pre}: ${p.name}: 값 필요`);
        bad.add(p.name);
      }
      out[p.name] = p.default;
      continue;
    }
    const e = checkParam(env, p, v);
    if (e) {
      errs.push(`${pre}: ${p.name}: ${e}`);
      bad.add(p.name);
    }
    out[p.name] = v;
  }
  const label = empty(b.label) ? null : b.label;          // 빈 글·공백만 = 값 없음(장비 5-11)
  const max = env.defs.limits.labelMax;
  if (label !== undefined && label !== null && (typeof label !== "string" || [...label].length > max)) {
    errs.push(`${pre}: label 은 ${max}자 이하 문자열`);
  }
  const stage = empty(b.stage) ? null : b.stage;
  const stages = [d.stage, ...d.stages];
  if (stage !== undefined && stage !== null && !stages.includes(stage as string)) {
    errs.push(`${pre}: stage 는 ${pyRepr(stages)} 중 하나`);
  }
  const nb: CleanBlock = {
    type: d.type, params: out, label: pyTruthy(label) ? (label as string) : "", stage: pyTruthy(stage) ? (stage as string) : "",
  };
  for (const r of env.defs.valueRules) {                 // 값 사이(같은 블록 안) — 순서 규칙이 아니라 값의 짝
    if (!r.blocks.includes(d.type) || ruleUses(r).some((n) => bad.has(n)) || !when(env, r.when, out)) continue;
    if (r.kind === "need" && empty(out[r.key])) {
      errs.push(`${pre}: ${fmtMsg(r.msg, out, d)}`);
    } else if (r.kind === "device" && !pyTruthy(r.key in env.cfg ? env.cfg[r.key] : true)) {
      errs.push(`${pre}: ${fmtMsg(r.msg, out, d)}`);
    } else if (r.kind === "pulse_edge") {
      const e = pulseEdgeViolation(pyRound(pyFloat(out.rfp_freq_khz) * 1000.0), pyFloat(out.rfp_duty), pyFloat(env.cfg[r.key]));
      if (e) errs.push(`${pre}: ${fmtMsg(r.msg, { edge: e }, null)}`);
    } else if (r.kind === "warn") {
      warns.push(`${pre}: ${fmtMsg(r.msg, out, d)}`);
    }
  }
  if (d.container) {
    const kids = b.blocks;
    if (depth >= env.defs.limits.maxDepth) {
      errs.push(`${pre}: 반복 중첩은 ${env.defs.limits.maxDepth}단까지`);
    } else if (!Array.isArray(kids) || !kids.length) {
      errs.push(`${pre}: blocks: 블록 목록 필요`);
    } else {
      nb.blocks = kids.map((k, i) => checkOne(env, k, `${path}.${i + 1}`, depth + 1, errs, warns))
        .filter((x): x is CleanBlock => x !== null);
    }
  } else if (Object.hasOwn(b, "blocks")) {
    errs.push(`${pre}: blocks 는 반복 블록만`);
  }
  return nb;
}

/** blocks.check_blocks — (정리된 블록 목록 또는 null, 오류, 경고). 값 범위·꺼진 장비만 본다(순서·조합 규칙 없음) */
export function checkBlocks(blocks: unknown, env: BlockEnv): BlocksResult {
  const errs: string[] = [], warns: string[] = [];
  if (!Array.isArray(blocks) || !blocks.length) return { clean: null, errors: ["블록 목록이 비었다"], warnings: warns };
  let out: CleanBlock[] = [];
  try {
    out = blocks.map((b, i) => checkOne(env, b, String(i + 1), 0, errs, warns)).filter((x): x is CleanBlock => x !== null);
  } catch (e) {
    if (!(e instanceof UnknownRule)) throw e;
    errs.push(`웹 검사가 모르는 규칙 조건 ${pyRepr(e.message)} — 장비 판단만 믿을 것`);
  }
  if (!errs.length) {
    try {
      expandBlocks(out, env);
    } catch (e) {
      if (!(e instanceof TooManySteps)) throw e;
      errs.push(e.message);
    }
  }
  return { clean: errs.length ? null : out, errors: errs, warnings: warns };
}

/** blocks.uses_of — 블록 목록이 쓰는 장비 */
export function usesOf(blocks: CleanBlock[]): Uses {
  const u: Uses = { dc: false, rf: false, rfp: false, heater: false, ig: false, ar: false, o2: false };
  const pos = (v: unknown) => isNum(v) && v > 0;
  const walk = (bs: CleanBlock[]) => {
    for (const b of bs) {
      const p = b.params;
      if (b.type === "power_on") {
        u.dc ||= pos(p.dc_power);
        u.rf ||= pos(p.rf_power);
        u.rfp ||= pos(p.rfp_power);
      } else if (b.type === "heater_ramp") {
        u.heater ||= pos(p.target_c);
      } else if (b.type === "base_wait") {
        u.ig = true;
      } else if (b.type === "cond_wait" && (pyTruthy(p.field) ? pyStr(p.field) : "").startsWith("ig.")) {
        u.ig = true;
      } else if (b.type === "gas_intro" || b.type === "gas_prep" || b.type === "gas_off") {
        u.ar ||= p.ar === true;
        u.o2 ||= p.o2 === true;
      }
      if (b.blocks?.length) walk(b.blocks);
    }
  };
  walk(blocks);
  return u;
}

// ───────────── 펼치기 ─────────────
class TooManySteps extends Error {}

type Ctx = { env: BlockEnv; rfpulsePresent: boolean; out: ExpBlock[]; n: number; heaterTarget: number | null };

/** 스텝 하나 — 값이 있는 키만 */
function S(action: string, message: string, o: Omit<ExpStep, "action" | "message"> = {}): ExpStep {
  const s: ExpStep = { action, message };
  for (const [k, v] of Object.entries(o)) {
    if (v !== null && v !== undefined && v !== "" && v !== false) (s as Record<string, unknown>)[k] = v;
  }
  return s;
}

const cfgv = (v: unknown, cfg: Cfg) => (typeof v === "string" && v.startsWith("cfg:") ? cfg[v.slice(4)] : v);
/** 정수 초면 int(문구 "5s"), 아니면 float */
const dur = (x: unknown) => pyFloat(x);

/**
 * blocks.expand — 블록 → 펼친 블록 목록(스텝 포함). 끝이 정상 끝 정지가 아니면 자동 끝 정지를 덧붙인다.
 * 펼친 스텝이 maxExpandedSteps 를 넘으면 TooManySteps(checkBlocks 가 오류로 바꾼다).
 */
export function expandBlocks(blocks: CleanBlock[], env: BlockEnv, rfpulsePresent?: boolean): ExpBlock[] {
  const ctx: Ctx = {
    env, out: [], n: 0, heaterTarget: null,
    rfpulsePresent: rfpulsePresent ?? pyTruthy("RFPULSE_ENABLED" in env.cfg ? env.cfg.RFPULSE_ENABLED : true),
  };
  expandList(ctx, blocks, "", "");
  const last = ctx.out[ctx.out.length - 1]?.steps;
  if (!ctx.n || last?.[last.length - 1]?.action !== "END_STOP") {
    expandBlock(ctx, { type: "end_stop", params: {}, label: env.defs.autoEndStopLabel, stage: "" }, String(blocks.length + 1));
    ctx.out[ctx.out.length - 1].auto = true;
  }
  return ctx.out;
}

function expandList(ctx: Ctx, blocks: CleanBlock[], prefix: string, it: string): void {
  blocks.forEach((b, j) => {
    const no = `${prefix}${j + 1}`;
    if (b.type === "repeat") {
      const n = pyInt(b.params.count);
      for (let k = 1; k <= n; k++) expandList(ctx, b.blocks ?? [], `${no}.`, it ? `${it}.${k}` : `#${k}`);
      return;
    }
    expandBlock(ctx, b, no + it);
    const max = ctx.env.defs.limits.maxExpandedSteps;
    if (ctx.n > max) throw new TooManySteps(`펼친 스텝 ${ctx.n} > ${max} — 반복 횟수를 줄일 것`);
  });
}

function expandBlock(ctx: Ctx, b: CleanBlock, no: string): void {
  const env = ctx.env, c = env.cfg;
  const d = env.byType.get(b.type) as BlockDef;
  const p: Record<string, unknown> = {};
  for (const bp of d.params) {                           // 비운 값은 기본값, "cfg:키" 는 지금 설정에서
    const v = b.params[bp.name];
    p[bp.name] = cfgv(empty(v) ? bp.default : v, c);
  }
  let stage = b.stage || d.stage;
  if (b.type === "pressure" && !b.stage) stage = `PRESSURE_SP${pyInt(p.sp)}`;
  const label = b.label || "";
  const inst: ExpBlock = {
    no, type: b.type, label, stage, iter: no.includes("#") ? no.slice(no.indexOf("#") + 1) : null, auto: false, params: p,
    steps: [],
  };
  if (d.watch) inst.watch = { ...d.watch, ...(isObj(p.watch) ? (p.watch as Record<string, boolean>) : {}) };
  const out = inst.steps;
  const fl = (k: string) => pyFloat(p[k]);
  switch (b.type) {
    case "pre_clean":
      if (pyTruthy(p.dc)) out.push(S("DC_POWER_STOP", "PRE: DC Power OFF"));
      if (pyTruthy(p.rf)) out.push(S("RF_POWER_STOP", "PRE: RF Power OFF"));
      if (pyTruthy(p.rfpulse) && ctx.rfpulsePresent) out.push(S("RF_PULSE_STOP", "PRE: RF Pulse OFF"));
      out.push(S("DELAY", "PRE: Power OFF settle", { sec: pyRound(fl("settle_sec")) }));
      break;
    case "gas_prep":                                     // process_steps.build_gas_pre_steps
      for (const [ch, g] of GAS) if (pyTruthy(p[g])) out.push(S("MFC_CMD", `Ch${ch} Flow OFF`, { params: ["FLOW_OFF", { channel: ch }] }));
      out.push(S("MFC_CMD", "MFC Valve Open", { params: ["VALVE_OPEN", {}] }));
      break;
    case "heater_ramp": {
      const temp = fl("target_c");
      let ramp = pyFloatOr0(p.ramp_c_per_min) || pyFloat(c.HEATER_RAMP_RATE_C_PER_MIN);
      ramp = ramp > 0 ? Math.max(ramp, env.defs.heaterRampMin) : ramp;
      ctx.heaterTarget = temp;
      out.push(S("HEATER_RAMP", `히터 램프 속도 ${pyFixed(ramp, 0)}°C/min 설정`, { value: ramp, ref: "heater.ramp" }));
      out.push(S("HEATER_SET", `히터 목표 ${pyFixed(temp, 1)}°C 설정 — 승온 시작`, { value: temp, ref: "heater.target" }));
      break;
    }
    case "heater_wait":
      out.push(S("HEATER_WAIT", `히터 온도 도달 대기 (±${pyFixed(pyFloat(c.HEATER_SOAK_TOLERANCE), 1)}°C, `
        + `${pyInt(c.HEATER_SOAK_TIME_SEC)}s 유지)`, { value: ctx.heaterTarget ?? undefined, ref: "heater.target" }));
      break;
    case "base_wait": {
      const bp = fl("target_torr");
      out.push(S("IG_FILAMENT_ON", "이온 게이지 필라멘트 ON"),
        S("IG_BASE_WAIT", `베이스 압력 대기 (목표 ${pyExp(bp, 1)} Torr)`, { value: bp }),
        S("IG_FILAMENT_OFF", "이온 게이지 필라멘트 OFF"));
      break;
    }
    case "gas_intro": {                                  // process_steps.build_gas_intro_steps
      const on = GAS.filter(([, g]) => pyTruthy(p[g]));
      const steps: ExpStep[] = [];
      if (pyTruthy(p.zero)) {
        for (const [ch] of on) steps.push(S("MFC_CMD", `Ch${ch} ZEROING`, { params: ["MFC_ZEROING", { channel: ch }] }));
        steps.push(S("MFC_CMD", "PS ZEROING", { params: ["PS_ZEROING", {}] }));
      }
      for (const [, g, btn] of on) steps.push(S("PLC_CMD", `${g === "ar" ? "Ar" : "O2"} Valve Open`, { params: [btn, true] }));
      for (const [ch, g] of on) {
        const flow = pyFloatOr0(p[`${g}_flow`]);
        if (flow > 0.0) {
          const ref = ch === 1 ? "mfc.ar_flow" : "mfc.o2_flow";
          steps.push(S("MFC_CMD", `Ch${ch} ${pyFixed(flow, 2)}sccm 설정`, { params: ["FLOW_SET", { channel: ch, value: flow }], ref }));
          steps.push(S("MFC_CMD", `Ch${ch} Flow ON`, { params: ["FLOW_ON", { channel: ch }], ref }));
        }
      }
      out.push(...steps);
      break;
    }
    case "pressure": {
      const n = pyInt(p.sp);
      let v: unknown = p.value;
      const dk = env.defs.spDefaultKey[String(n)];
      if (empty(v) && dk) v = c[dk];
      const val = empty(v) ? null : pyFloat(v);
      const ref = n === 1 ? "mfc.wp" : "";
      const tol = pyFloat(p.tol_ratio ?? c.PRESSURE_WAIT_TOL_RATIO);
      const stable = pyFloat(p.stable_sec ?? c.PRESSURE_WAIT_STABLE_SEC);
      const to = pyFloat(p.timeout_sec ?? (n === 1 ? c.SP1_TIMEOUT_SEC : c.PRESSURE_STAGE_TIMEOUT_SEC));
      const fail = ((pyTruthy(p.on_timeout) ? p.on_timeout : n === 1 ? "abort" : "continue") === "abort");
      const tag = label || `SP${n}`;
      const bare = stage === "GAS_STABILIZE";            // v1 문구: "SP4 ON"
      if (pyTruthy(p.set) && val !== null) {
        out.push(S("MFC_CMD", bare ? `SP${n}_SET=${pyFixed(val, 2)} 설정` : `${tag}: SP${n}_SET=${pyFixed(val, 2)} 설정`,
          { params: [`SP${n}_SET`, { value: val }], ref }));
      }
      if (pyTruthy(p.select)) out.push(S("MFC_CMD", bare ? `SP${n} ON` : `${tag}: SP${n}_ON`, { params: [`SP${n}_ON`, {}] }));
      if (pyTruthy(p.wait) && val !== null) {
        const a: Record<string, unknown> = { target: val, tolerance_ratio: tol, stable_sec: stable, timeout_sec: to, fail_on_timeout: fail };
        if (fail && n !== 1) a.fail_code = "PRESSURE_WAIT_TIMEOUT";
        out.push(S("MFC_CMD", `${tag}: 압력 도달 대기 (target=${pyFixed(val, 2)}, ±${pyFixed(tol * 100, 0)}%, timeout=${Math.trunc(to)}s`
          + (fail ? ", FAIL ON TIMEOUT" : "") + ")", { params: ["WAIT_PRESSURE", a], ref }));
      }
      break;
    }
    case "valve": {
      const k = p.action as "open" | "close" | "hold";
      out.push(S("MFC_CMD", { open: "MFC Valve Open", close: "MFC Valve Close", hold: "MFC Valve Hold" }[k],
        { params: [{ open: "VALVE_OPEN", close: "VALVE_CLOSE", hold: "VALVE_HOLD" }[k], {}] }));
      break;
    }
    case "shutter": {
      const on = p.action === "open";
      const targets = Array.isArray(p.targets) ? p.targets : [];
      for (const s of env.defs.shutters) {
        if (targets.includes(s.target)) out.push(S("PLC_CMD", `${s.label} ${on ? "Open" : "Close"}`, { params: [SHUTTER_BTN[s.target], on] }));
      }
      break;
    }
    case "power_on": {
      const [dc, rf, rfp] = ["dc_power", "rf_power", "rfp_power"].map((k) => (isNum(p[k]) ? (p[k] as number) : 0.0));
      const f = p.rfp_freq_khz;
      const spec = {
        dc, rf, rfp, freq_hz: rfp && isNum(f) ? pyRound(f * 1000.0) : null,
        duty: rfp && isNum(p.rfp_duty) ? Math.trunc(p.rfp_duty) : null,
        timeout: isNum(p.timeout_sec) ? p.timeout_sec : null, wait: pyTruthy(p.wait),
      };
      if (dc || rf || rfp || pyTruthy(p.wait)) {
        out.push(S(spec.wait ? "POWER_WAIT" : "POWER_START", spec.wait ? "파워 목표치 도달 대기" : "파워 켜기(도달 대기 안 함)", { spec }));
      }
      break;
    }
    case "power_off":
      if (pyTruthy(p.dc)) out.push(S("DC_POWER_STOP", "DC Power OFF"));
      if (pyTruthy(p.rf)) out.push(S("RF_RAMP_OFF", "RF 램프다운 → OFF"));
      if (pyTruthy(p.rfpulse) && ctx.rfpulsePresent) out.push(S("RF_PULSE_STOP", "RF Pulse OFF"));
      break;
    case "gas_off":
      for (const [ch, g] of GAS) if (pyTruthy(p[g])) out.push(S("MFC_CMD", `Ch${ch} Flow OFF`, { params: ["FLOW_OFF", { channel: ch }] }));
      if (pyTruthy(p.close_valves)) {
        for (const [, g, btn] of GAS) if (pyTruthy(p[g])) out.push(S("PLC_CMD", `${g === "ar" ? "Ar" : "O2"} Valve Close`, { params: [btn, false] }));
      }
      break;
    case "heater_off":
      out.push(S("HEATER_OFF", "히터 끄기"));
      break;
    case "wait": {
      const sec = dur(p.sec);
      const sh = stage === "SHUTTER_DELAY";
      out.push(S("DELAY", label || `대기 ${pyNum(sec, false)}s`, {
        sec, timer: sh ? "shutter" : undefined, polling: sh, spec: { skippable: true },
      }));
      break;
    }
    case "main": {
      const sec = dur(p.sec);
      out.push(S("PLC_CMD", "Main Shutter Open", { params: ["MS_button", true] }));
      out.push(S("DELAY", `메인 공정 ${pyNum(sec, false)}s 진행`, {
        sec, timer: "process", polling: true, ref: "process.main_remaining", spec: { main: true },
      }));
      if (pyTruthy(p.close)) out.push(S("PLC_CMD", "Main Shutter Close", { params: ["MS_button", false] }));
      break;
    }
    case "cond_wait": {
      const a = Object.fromEntries(["field", "op", "value", "tol", "stable_sec", "timeout_sec", "on_timeout"].map((k) => [k, p[k]]));
      out.push(S("COND_WAIT", label || `조건 대기 ${pyStr(p.field)} ${pyStr(p.op)} ${pyStr(p.value, true)}`,
        { params: a, spec: { skippable: true } }));
      break;
    }
    case "end_stop":
      out.push(S("END_STOP", "정상 끝 정지 순서", { spec: { skip: Array.isArray(p.skip) ? [...p.skip] : [] }, internal: true }));
      break;
  }
  if (!out.length) out.push(S("NOP", label || d.label, { internal: true }));
  ctx.n += out.length;
  ctx.out.push(inst);
}

// ───────────── 화면용 ─────────────
/** 알 수 있는 시간(대기·메인·정리 DELAY 합, s)과 끝을 모르는 대기 수(압력·파워·히터·베이스·조건) */
export function expectedTime(exp: ExpBlock[]): { sec: number; open: number } {
  let sec = 0, open = 0;
  for (const b of exp) {
    for (const s of b.steps) {
      if (s.action === "DELAY") sec += s.sec ?? 0;
      else if (["POWER_WAIT", "HEATER_WAIT", "IG_BASE_WAIT", "COND_WAIT"].includes(s.action)
               || (Array.isArray(s.params) && s.params[0] === "WAIT_PRESSURE")) open += 1;
    }
  }
  return { sec, open };
}
