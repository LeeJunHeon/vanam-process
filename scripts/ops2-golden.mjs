// 챔버K v2 웹 검사 골든 — npm run ops2:golden [-- --file <골든 파일>]
// lib/ops2/chk/golden/ 의 챔버K v2/tests/golden 복사본 두 개를 웹 검사가 같게 내는지 본다(--file 이면 그 파일 하나).
//  - web_template_cases.json(기본 템플릿): 경우마다 lib/ops2/chk/recipe.ts 가 checkErrors·checkWarnings(문구까지)·params·
//    blocks(숫자 그대로)·igEnabled·rfpulsePresent 를 같게.
//  - web_block_cases.json(블록 검사): 경우마다 lib/ops2/chk/blocks.ts 가 clean·errors·warnings(문구까지)·uses·expanded 를 같게.
// 챔버12(CH12): lib/ops2/ch12/golden/ 의 Chamber.Total_program v2/tests/golden/web_ch12_*.json 복사본 세 개도 본다.
//  - web_ch12_blocks.json: 블록 검사 lib/ops2/ch12/blocks.ts checkBlocks(clean·errors·warnings·autoEndStop)·editSequence.
//  - web_ch12_template.json: v1 행 → 기본 템플릿 lib/ops2/ch12/recipe.ts templateFromRow(kind·params·logs·blocks·error·
//    exception)·checkNormParams(normErrors).
//  - web_ch12_recipe_check.json: E230 행 값 검사 checkRawRows(errors·message·popup)·시작 전 값 검사 checkNormParams.
//  각 파일 머리의 defs(장비 web_blocks.definitions())·cfg(기준 설정) + 경우마다 cfgOver(null = 키 없음).
// 새 의존성 없이: node 가 .ts 의 타입만 지우고 실행한다(Node 22.18+/23.6+ 기본). 다른 것이 하나라도 있으면 exit 1.
// 숫자가 float 인지(900.0 과 900)는 JSON.parse 의 원문(reviver context.source)으로 안다 — 행은 원문, 설정은 묶음 파라미터 형식.
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// lib/ops2/chk 의 .ts 끼리는 확장자 없이 가져온다(Next 와 같게) — node 에서는 .ts 를 붙여 찾는다
registerHooks({
  resolve(spec, ctx, next) {
    if (/^\.\.?\//.test(spec) && !/\.[cm]?[jt]s$/.test(spec) && ctx.parentURL?.endsWith(".ts")) return next(`${spec}.ts`, ctx);
    return next(spec, ctx);
  },
});
const R = await import("../lib/ops2/chk/recipe.ts");
const BK = await import("../lib/ops2/chk/blocks.ts");
const C12B = await import("../lib/ops2/ch12/blocks.ts");
const C12R = await import("../lib/ops2/ch12/recipe.ts");
const C12P = await import("../lib/ops2/ch12/py.ts");

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fi = process.argv.indexOf("--file");
const CH12_FILES = ["web_ch12_blocks.json", "web_ch12_template.json", "web_ch12_recipe_check.json"];
const isCh12 = (f) => basename(f).startsWith("web_ch12_");
const picked = fi > 0 ? [resolve(process.argv[fi + 1])] : null;
const files = picked ? picked.filter((f) => !isCh12(f))
  : ["web_template_cases.json", "web_block_cases.json"].map((f) => resolve(root, "lib/ops2/chk/golden", f));
const ch12Files = picked ? picked.filter(isCh12) : CH12_FILES.map((f) => resolve(root, "lib/ops2/ch12/golden", f));
if (typeof JSON.parse("[1]", (_k, v, c) => c?.source ?? v)[0] !== "string") {
  console.error("이 node 는 JSON.parse 원문(context.source)을 주지 않습니다 — Node 21 이상이 필요합니다.");
  process.exit(2);
}

// 숫자는 {$n, $f}(값·원문이 float 모양인가)로 읽고, 쓰기 전에 푼다
const NUM = Symbol("num");
const unwrap = (v) => (v && v[NUM] ? v.n : Array.isArray(v) ? v.map(unwrap) : v && typeof v === "object"
  ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, unwrap(x)])) : v);
const floatKeys = (o) => Object.entries(o).filter(([, v]) => v && v[NUM] && v.f).map(([k]) => k);

function same(a, b, path, out) {
  if (typeof a === "number" && typeof b === "number") {
    if (a !== b) out.push(`${path}: 웹 ${a} / 장비 ${b}`);
    return;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      out.push(`${path}: 웹 ${JSON.stringify(a)} / 장비 ${JSON.stringify(b)}`);
      return;
    }
    a.forEach((x, i) => same(x, b[i], `${path}[${i}]`, out));
    return;
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
    if (ka.join() !== kb.join()) out.push(`${path}: 키 웹 [${ka}] / 장비 [${kb}]`);
    for (const k of kb) if (k in a) same(a[k], b[k], `${path}.${k}`, out);
    return;
  }
  if (a !== b) out.push(`${path}: 웹 ${JSON.stringify(a)} / 장비 ${JSON.stringify(b)}`);
}

/** 설정값 모양이 묶음 파라미터 형식과 맞는지(float 키는 늘 float — 5-10) */
function cfgShape(rc, c, defs, diffs) {
  const cfgFloats = new Set(Object.keys(c.cfg).filter((k) => defs.paramTypes[k] === "float"));
  const srcFloats = new Set(floatKeys(rc.cfg));
  for (const k of Object.keys(c.cfg)) {
    if (cfgFloats.has(k) !== srcFloats.has(k) && typeof c.cfg[k] === "number") {
      diffs.push(`cfg.${k}: 파라미터 형식 ${defs.paramTypes[k]} 인데 골든 값 모양이 ${srcFloats.has(k) ? "float" : "int"}`);
    }
  }
  return cfgFloats;
}

function templateCase(rc, c, defs, diffs) {
  const cfgFloats = cfgShape(rc, c, defs, diffs);
  const env = { defs: defs.recipe, cfg: c.cfg, floats: new Set([...cfgFloats, ...floatKeys(rc.row)]) };
  const ig = R.pyTruthy(c.cfg.IG_ENABLED), rfp = R.pyTruthy(c.cfg.RFPULSE_ENABLED);
  same(ig, c.igEnabled, "igEnabled", diffs);
  same(rfp, c.rfpulsePresent, "rfpulsePresent", diffs);
  const r = R.checkProcessRow(c.row, env);
  same(r.errors, c.checkErrors, "checkErrors", diffs);
  same(r.warnings, c.checkWarnings, "checkWarnings", diffs);
  const params = r.errors.length ? null : R.rowToParams(r.clean, c.cfg);
  const blocks = params ? R.templateBlocks(params, c.cfg, ig, rfp) : null;
  same(params, c.params, "params", diffs);
  same(blocks, c.blocks, "blocks", diffs);
}

function blockCase(rc, c, defs, diffs) {
  cfgShape(rc, c, defs, diffs);
  const env = BK.blockEnvOf(defs, c.cfg);
  const ig = R.pyTruthy(c.cfg.IG_ENABLED), rfp = R.pyTruthy(c.cfg.RFPULSE_ENABLED);
  same(ig, c.igEnabled, "igEnabled", diffs);
  same(rfp, c.rfpulsePresent, "rfpulsePresent", diffs);
  const r = BK.checkBlocks(c.blocks, env);
  same(r.errors, c.errors, "errors", diffs);
  same(r.warnings, c.warnings, "warnings", diffs);
  same(r.clean, c.clean, "clean", diffs);
  same(r.clean ? BK.usesOf(r.clean) : null, c.uses, "uses", diffs);
  same(r.clean ? BK.expandBlocks(r.clean, env, rfp) : null, c.expanded, "expanded", diffs);
}

let failed = false;
for (const file of files) {
  const raw = JSON.parse(readFileSync(file, "utf8"), (_k, v, ctx) =>
    typeof v === "number" ? { [NUM]: true, n: v, f: /[.eE]/.test(ctx?.source ?? "") } : v);
  const src = unwrap(raw._출처), defs = unwrap(raw._묶음);
  const isBlock = "covers" in (raw.cases?.[0] ?? {});
  const problems = [];
  if (src.exportVersion !== R.GOLDEN_EXPORT_VERSION) {
    problems.push(`골든 exportVersion ${src.exportVersion} ≠ recipe.ts GOLDEN_EXPORT_VERSION ${R.GOLDEN_EXPORT_VERSION}`);
  }
  if (!isBlock && defs.recipe.delayPattern !== R.DELAY_PATTERN) problems.push(`delayPattern 다름: ${defs.recipe.delayPattern}`);
  let ok = 0;
  const bad = [];
  for (const rc of raw.cases) {
    const c = unwrap(rc);
    const diffs = [];
    try {
      (isBlock ? blockCase : templateCase)(rc, c, defs, diffs);
    } catch (e) {
      diffs.push(`웹 계산이 멈춤: ${e?.stack?.split("\n").slice(0, 2).join(" ") ?? e}`);
    }
    if (diffs.length) bad.push({ name: c.name, diffs });
    else ok += 1;
  }
  console.log(`골든 ${basename(file)} (${isBlock ? "블록 검사" : "기본 템플릿"})`);
  console.log(`  챔버K ${src["챔버K"]} · EXPORT_VERSION ${src.exportVersion}`);
  for (const p of problems) console.log(`  ! ${p}`);
  for (const b of bad) {
    console.log(`  ✗ ${b.name}`);
    for (const d of b.diffs.slice(0, 8)) console.log(`      ${d}`);
  }
  console.log(`  경우 ${raw.cases.length} · 같음 ${ok} · 다름 ${bad.length}`);
  failed ||= bad.length > 0 || problems.length > 0;
}
// ───────────── 챔버12 ─────────────
/** 기준 설정 + 경우 바꿈(null = 키 없음 — 장비 생성기와 같게) */
function cfgOf(base, over) {
  const c = { ...base };
  for (const [k, v] of Object.entries(over ?? {})) {
    if (v === null) delete c[k];
    else c[k] = v;
  }
  return c;
}

function ch12BlockCase(c, head, diffs) {
  const env = C12B.envOf(head.defs, cfgOf(head.cfg, c.cfgOver), c.ch);
  if (!env) throw new Error("envOf 가 null(정의 판·규칙 id 를 이 웹 코드가 모름)");
  const r = C12B.checkBlocks(c.blocks, env);
  same(r.errors, c.errors, "errors", diffs);
  same(r.warnings, c.warnings, "warnings", diffs);
  same(r.clean, c.clean, "clean", diffs);
  same(r.clean ? C12B.autoEndStop(r.clean, env) : null, c.autoEndStop, "autoEndStop", diffs);
}

function ch12EditCase(c, head, diffs) {
  const env = C12B.envOf(head.defs, cfgOf(head.cfg, c.cfgOver), c.ch);
  if (!env) throw new Error("envOf 가 null");
  const r = C12B.editSequence(c.blocks, c.startedUpto, c.op, env, c.rev);
  same(r.ok, c.ok, "ok", diffs);
  same(r.blocks, c.result, "result", diffs);
  same(r.rev, c.rev2, "rev2", diffs);
  same(r.reason, c.reason, "reason", diffs);
  same(r.errors, c.errors, "errors", diffs);
  same(r.warnings, c.warnings, "warnings", diffs);
  same(r.blocks ? C12B.autoEndStop(r.blocks, env) : null, c.autoEndStop, "autoEndStop", diffs);
}

function ch12TemplateCase(c, head, diffs) {
  const cfg = cfgOf(head.cfg, c.cfgOver);
  let rt;
  try {
    rt = C12R.templateFromRow(c.raw, c.ch, cfg, head.defs);
  } catch (e) {
    if (!(e instanceof C12P.PyError)) throw e;
    same(e.pyName, c.exception, "exception", diffs);
    return;
  }
  same(null, c.exception, "exception", diffs);
  same(rt.kind, c.kind, "kind", diffs);
  same(rt.params, c.params, "params", diffs);
  same(rt.logs, c.logs, "logs", diffs);
  same(rt.blocks, c.blocks, "blocks", diffs);
  same(rt.error, c.error, "error", diffs);
  let norm = null;
  if (rt.params) {
    const p = { ...rt.params };
    delete p.thickness_mode;
    norm = C12R.checkNormParams(p, c.ch, C12B.capsFromCfg(cfg, c.ch), cfg, head.defs);
  }
  same(norm, c.normErrors, "normErrors", diffs);
}

function ch12RawCase(c, head, diffs) {
  const errs = C12R.checkRawRows(c.rows, head.defs, c.rowNumbers);
  same(errs, c.errors, "errors", diffs);
  same(errs.length ? C12R.e230Message(errs, head.defs) : "", c.message, "message", diffs);
  same(errs.length ? C12R.e230Popup(errs, head.defs) : "", c.popup, "popup", diffs);
}

function ch12NormCase(c, head, diffs) {
  same(C12R.checkNormParams(c.params, c.ch, c.caps, head.cfg, head.defs), c.errors, "errors", diffs);
}

const CH12_KINDS = {
  blockCases: ["블록 검사", ch12BlockCase], editCases: ["시퀀스 편집", ch12EditCase], cases: ["기본 템플릿", ch12TemplateCase],
  rawCases: ["E230 행 값 검사", ch12RawCase], normCases: ["시작 전 값 검사", ch12NormCase],
};

for (const file of ch12Files) {
  const raw = JSON.parse(readFileSync(file, "utf8"));
  const src = raw._출처 ?? {};
  const problems = [];
  if (raw.defsVersion !== C12B.WEB_BLOCKS_VERSION) {
    problems.push(`골든 defsVersion ${raw.defsVersion} ≠ ch12/blocks.ts WEB_BLOCKS_VERSION ${C12B.WEB_BLOCKS_VERSION}`);
  }
  if (raw.defs?.recipe?.delayNamePattern !== C12R.DELAY_NAME_PATTERN) problems.push("delayNamePattern 다름");
  if (raw.defs?.recipe?.durationPattern !== C12R.DURATION_PATTERN) problems.push("durationPattern 다름");
  if (src.dirty) problems.push("참고: 장비 작업 트리(커밋 전)에서 만든 사본 — 장비 쪽 커밋 뒤 다시 복사하면 해시가 맞다");
  console.log(`골든 ${basename(file)} (CH12)`);
  console.log(`  Chamber.Total_program ${src["Chamber.Total_program"] ?? "?"} · 정의 판 ${raw.defsVersion}`);
  for (const p of problems) console.log(`  ! ${p}`);
  for (const [key, [label, fn]] of Object.entries(CH12_KINDS)) {
    if (!Array.isArray(raw[key])) continue;
    let ok = 0;
    const bad = [];
    for (const c of raw[key]) {
      const diffs = [];
      try {
        fn(c, raw, diffs);
      } catch (e) {
        diffs.push(`웹 계산이 멈춤: ${e?.stack?.split("\n").slice(0, 2).join(" ") ?? e}`);
      }
      if (diffs.length) bad.push({ name: c.name, diffs });
      else ok += 1;
    }
    for (const b of bad) {
      console.log(`  ✗ ${label} ${b.name}`);
      for (const d of b.diffs.slice(0, 8)) console.log(`      ${d}`);
    }
    console.log(`  ${label} 경우 ${raw[key].length} · 같음 ${ok} · 다름 ${bad.length}`);
    failed ||= bad.length > 0;
  }
  failed ||= problems.some((p) => !p.startsWith("참고:"));
}
process.exit(failed ? 1 : 0);
