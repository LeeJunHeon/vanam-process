// 챔버12(CH12) 레시피 저장 사전 검사 — /api/ops2/[equipment]/recipes(kind ch1·ch2 — 챔버별 블록 레시피, 기준 장비 CH12 를
// CH12·CH12-SIM 이 같이 쓴다). 순수(DB 없음). 검사는 lib/ops2/ch12/blocks.ts·recipe.ts(장비와 같은 계산 — 골든)로:
//   행 = 블록 행 {name?, blocks: [...]} → checkBlocks(블록 값·장비 지원·펼치기 실패)
//       v1 행(Process_name … 열)        → checkRawRows(E230 행 값 검사, 전 행 한 번) + 행마다 templateFromRow(기본 템플릿 — 오류 E###)
//                                           + checkNormParams(시작 전 값 검사)
// 마지막 판단은 장비(RECIPE_LOAD 를 받을 때 다시 검사). 오류가 있어도 저장한다(작성 중 저장 — 챔버K 와 같음), 응답에 수만.
// 정의 = 묶음 blocks(+version·cfg)·recipe(장비 web_blocks.definitions() 와 같은 모양), 설정 = 묶음 params current.
// 묶음 blocks.version 이 이 웹 코드(WEB_BLOCKS_VERSION)와 다르면 검사하지 않는다(null — 화면 안내 outdated).
import { capsFromCfg, checkBlocks, envOf, WEB_BLOCKS_VERSION, type Cfg, type Ch12Defs, type Ch12Env } from "./blocks";
import { checkNormParams, checkRawRows, templateFromRow, type Row } from "./recipe";
import { PyError } from "./py";
import { CH12_RECIPE_KINDS, type Ch12RecipeKind } from "./ids";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

export type Ch12RecipeEnv = { ch12: true; defs: Ch12Defs; cfg: Cfg; envs: Record<1 | 2, Ch12Env | null> };
export type Ch12CheckSummary = { errors: number; warnings: number; first: string | null };

/** 묶음 → 정의(web_blocks.definitions() 모양) — blocks·recipe 가 없으면 null */
export function ch12DefsOf(bundle: unknown): Ch12Defs | null {
  const b = bundle as Obj | null;
  if (!isObj(b) || !isObj(b.blocks) || !isObj(b.recipe)) return null;
  const blocks = b.blocks as Obj;
  return { version: blocks.version, blocks, cfg: blocks.cfg, recipe: b.recipe } as unknown as Ch12Defs;
}

/** 묶음 params current(없으면 default) */
export function ch12CfgOf(bundle: unknown): Cfg {
  const cfg: Record<string, unknown> = {};
  const params = isObj(bundle) && Array.isArray(bundle.params) ? bundle.params : [];
  for (const p of params) if (isObj(p) && typeof p.key === "string") cfg[p.key] = p.current ?? p.default ?? null;
  return cfg;
}

/** 검사 환경 — 묶음 정의 판이 이 웹 코드와 다르면 null */
export function ch12RecipeEnvOf(bundle: unknown): Ch12RecipeEnv | null {
  const defs = ch12DefsOf(bundle);
  if (!defs || defs.version !== WEB_BLOCKS_VERSION) return null;
  const cfg = ch12CfgOf(bundle);
  const envs = { 1: envOf(defs, cfg, 1), 2: envOf(defs, cfg, 2) };
  if (!envs[1] || !envs[2]) return null;
  return { ch12: true, defs, cfg, envs };
}

/** 묶음 블록 정의 판이 이 웹 검사와 다른가(화면 안내 — 검사는 하지 않음) */
export function ch12Outdated(bundle: unknown): boolean {
  const defs = ch12DefsOf(bundle);
  return !!defs && defs.version !== WEB_BLOCKS_VERSION;
}

export const isCh12RecipeKind = (k: unknown): k is Ch12RecipeKind => (CH12_RECIPE_KINDS as readonly unknown[]).includes(k);

export type Ch12RowCheck = { row: number; kind: "blocks" | "v1" | "delay" | "test" | "bad"; errors: string[]; warnings: string[] };

/** 레시피 하나(행 목록) 검사 — 행마다 오류·경고(문구) + E230 전 행 오류 */
export function ch12CheckRecipe(kind: Ch12RecipeKind, rows: unknown, env: Ch12RecipeEnv) {
  const ch = kind === "ch1" ? 1 : 2;
  const benv = env.envs[ch]!;
  const list = Array.isArray(rows) ? rows : [];
  const out: Ch12RowCheck[] = [];
  const listErrors: string[] = [];
  if (!list.length) listErrors.push("행 목록이 비어 있음");
  const v1: Row[] = [], v1No: number[] = [];
  list.forEach((r, j) => {
    const i = j + 1;
    if (!isObj(r)) {
      out.push({ row: i, kind: "bad", errors: ["객체가 아님"], warnings: [] });
      return;
    }
    if ("blocks" in r) {
      const x = checkBlocks(r.blocks, benv);
      out.push({ row: i, kind: "blocks", errors: x.errors, warnings: x.warnings });
      return;
    }
    v1.push(r as Row);
    v1No.push(i + 1);                                   // E230 행 번호 = 순번 + 1(헤더 = 1행)
    try {
      const rt = templateFromRow(r as Row, ch, env.cfg, env.defs, i);
      const errors = rt.error ? [rt.error] : [];
      if (rt.params && rt.kind === "process") {
        const p = { ...rt.params };
        delete p.thickness_mode;
        errors.push(...checkNormParams(p, ch, capsFromCfg(env.cfg, ch), env.cfg, env.defs));
      }
      out.push({ row: i, kind: rt.kind === "delay" ? "delay" : rt.kind === "test" ? "test" : "v1", errors, warnings: [] });
    } catch (e) {
      if (!(e instanceof PyError)) throw e;
      out.push({ row: i, kind: "v1", errors: [`값 형식: ${e.pyName} — 장비가 처리하지 못하는 값`], warnings: [] });
    }
  });
  if (v1.length) listErrors.push(...checkRawRows(v1, env.defs, v1No));
  return { rows: out, listErrors };
}

/** 저장 응답·목록의 검사 수 */
export function ch12CheckSummary(kind: string, rows: unknown, env: Ch12RecipeEnv | null): Ch12CheckSummary | null {
  if (!env || !isCh12RecipeKind(kind)) return null;
  const r = ch12CheckRecipe(kind, rows, env);
  const rowErr = r.rows.flatMap((x) => x.errors.map((m) => `${x.row}행: ${m}`));
  const errors = [...r.listErrors, ...rowErr];
  return { errors: errors.length, warnings: r.rows.reduce((a, x) => a + x.warnings.length, 0), first: errors[0] ?? null };
}
