// 챔버K v2 웹 레시피 검사 골든 — npm run ops2:golden [-- --file <골든 파일>]
// lib/ops2/chk/golden/web_template_cases.json(챔버K v2/tests/golden 복사본)의 경우마다 웹 검사(lib/ops2/chk/recipe.ts)가
// checkErrors·checkWarnings(문구까지)·params·blocks(숫자 그대로)·igEnabled·rfpulsePresent 를 같게 내는지 본다.
// 새 의존성 없이: node 가 .ts 의 타입만 지우고 실행한다(Node 22.18+/23.6+ 기본). 다른 것이 하나라도 있으면 exit 1.
// 숫자가 float 인지(900.0 과 900)는 JSON.parse 의 원문(reviver context.source)으로 안다 — 행은 원문, 설정은 묶음 파라미터 형식.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as R from "../lib/ops2/chk/recipe.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fi = process.argv.indexOf("--file");
const file = fi > 0 ? resolve(process.argv[fi + 1]) : resolve(root, "lib/ops2/chk/golden/web_template_cases.json");

// 숫자는 {$n, $f}(값·원문이 float 모양인가)로 읽고, 쓰기 전에 푼다
const NUM = Symbol("num");
const raw = JSON.parse(readFileSync(file, "utf8"), (_k, v, ctx) =>
  typeof v === "number" ? { [NUM]: true, n: v, f: /[.eE]/.test(ctx?.source ?? "") } : v);
if (!raw.cases?.[0] || typeof JSON.parse("[1]", (_k, v, c) => c?.source ?? v)[0] !== "string") {
  console.error("이 node 는 JSON.parse 원문(context.source)을 주지 않습니다 — Node 21 이상이 필요합니다.");
  process.exit(2);
}
const unwrap = (v) => (v && v[NUM] ? v.n : Array.isArray(v) ? v.map(unwrap) : v && typeof v === "object"
  ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, unwrap(x)])) : v);
const floatKeys = (o) => Object.entries(o).filter(([, v]) => v && v[NUM] && v.f).map(([k]) => k);

const src = unwrap(raw._출처), defs = unwrap(raw._묶음);
const problems = [];
if (src.exportVersion !== R.GOLDEN_EXPORT_VERSION) {
  problems.push(`골든 exportVersion ${src.exportVersion} ≠ recipe.ts GOLDEN_EXPORT_VERSION ${R.GOLDEN_EXPORT_VERSION}`);
}
if (defs.recipe.delayPattern !== R.DELAY_PATTERN) problems.push(`delayPattern 다름: ${defs.recipe.delayPattern}`);

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

let ok = 0;
const bad = [];
for (const rc of raw.cases) {
  const c = unwrap(rc);
  const cfgFloats = new Set(Object.keys(c.cfg).filter((k) => defs.paramTypes[k] === "float"));
  const srcFloats = new Set(floatKeys(rc.cfg));
  const diffs = [];
  for (const k of Object.keys(c.cfg)) {
    if (cfgFloats.has(k) !== srcFloats.has(k) && typeof c.cfg[k] === "number") {
      diffs.push(`cfg.${k}: 파라미터 형식 ${defs.paramTypes[k]} 인데 골든 값 모양이 ${srcFloats.has(k) ? "float" : "int"}`);
    }
  }
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
  if (diffs.length) bad.push({ name: c.name, diffs });
  else ok += 1;
}

console.log(`골든 ${file.replace(root, ".")}`);
console.log(`  챔버K ${src["챔버K"]} · EXPORT_VERSION ${src.exportVersion}`);
for (const p of problems) console.log(`  ! ${p}`);
for (const b of bad) {
  console.log(`  ✗ ${b.name}`);
  for (const d of b.diffs.slice(0, 8)) console.log(`      ${d}`);
}
console.log(`  경우 ${raw.cases.length} · 같음 ${ok} · 다름 ${bad.length}`);
process.exit(bad.length || problems.length ? 1 : 0);
