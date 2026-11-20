// 챔버K v2 레시피 저장(ops2_recipe) 공통 — /api/ops2/[equipment]/recipes(웹 전용, 노트북 로컬 화면 API 와 무관).
// 레시피는 기준 장비(CHK2) 것을 CHK2·CHK2-SIM 이 같이 쓴다. 저장할 때 서버도 웹 검사(lib/ops2/chk/recipe.ts)를 돌려
// 오류·경고 수를 함께 돌려준다 — 오류가 있어도 저장은 된다(작성 중 저장). 검사 기준은 그 장비의 지금 묶음(설정값 포함).
// 챔버12(CH12·CH12-SIM): kind 는 ch1·ch2(챔버별 블록 레시피), 검사는 lib/ops2/ch12/recipes.ts(블록·v1 행 — 장비와 같은 골든).
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-helpers";
import { actorOf, deviceBundle, enabledDevice } from "@/lib/ops2/browser";
import { checkEnvOf, checkHeaterRecipe, checkOutdated, checkProcessRecipe, type CheckEnv, type Row } from "@/lib/ops2/chk/recipe";
import { CH12_RECIPE_KINDS, isCh12 } from "@/lib/ops2/ch12/ids";
import { ch12CheckSummary, ch12Outdated, ch12RecipeEnvOf, type Ch12RecipeEnv } from "@/lib/ops2/ch12/recipes";
import { readLimited } from "@/lib/ops2/body";
import { stripNul } from "@/lib/ops2/ingest";
import { baseEquipment, canEditRecipes, operatorEquipments } from "@/lib/ops2/perm";
import { ops2Db } from "@/lib/ops2/db";

export const RECIPE_MAX_BODY = 256 * 1024;
export const RECIPE_KINDS = ["process", "heater"] as const;
export type RecipeKind = (typeof RECIPE_KINDS)[number];
const NAME_MAX = 80;

export type RecipeCheckSummary = { errors: number; warnings: number; first: string | null };

/** 검사 환경 — 챔버K(CheckEnv) 또는 챔버12(Ch12RecipeEnv) */
export type AnyRecipeEnv = CheckEnv | Ch12RecipeEnv;

/** 레시피 하나의 웹 검사 결과(수) — 묶음에 열 정의가 없으면 null */
export function checkSummary(kind: string, rows: unknown, gas: unknown, env: AnyRecipeEnv | null): RecipeCheckSummary | null {
  if (!env) return null;
  if ("ch12" in env) return ch12CheckSummary(kind, rows, env);
  if (kind === "heater") {
    const steps = Array.isArray(rows) ? (rows.filter((s) => isObj(s)) as Row[]) : [];
    const r = checkHeaterRecipe(steps, isObj(gas) ? (gas as Row) : null, env);
    return { errors: r.errors.length, warnings: r.warnings.length, first: r.errors[0] ?? null };
  }
  const r = checkProcessRecipe(rows, env);
  return { errors: r.errors, warnings: r.warnings, first: r.first };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** 본문 → {name, rows, gas} 또는 오류 응답. kind 는 POST 만(PUT 은 저장된 것). kinds = 그 장비가 받는 kind(챔버12 ch1·ch2) */
export async function readRecipeBody(req: NextRequest, needKind: boolean, kinds: readonly string[] = RECIPE_KINDS): Promise<
  { ok: true; kind?: string; name: string; rows: Record<string, unknown>[]; gas: Record<string, unknown> | null;
    updatedAt?: string } | { ok: false; response: NextResponse }
> {
  const bad = (error: string, detail: string, status = 400) =>
    ({ ok: false as const, response: NextResponse.json({ error, detail }, { status }) });
  const text = await readLimited(req, RECIPE_MAX_BODY);
  if (text === null) return bad("too_large", `본문은 ${RECIPE_MAX_BODY / 1024} KB 까지`, 413);
  let body: unknown;
  try {
    body = stripNul(JSON.parse(text));                 // NUL 은 text·jsonb 가 받지 못한다
  } catch {
    return bad("bad_json", "JSON 이 아님");
  }
  if (!isObj(body)) return bad("bad_request", "본문은 객체");
  let kind: string | undefined;
  if (needKind) {
    if (!kinds.includes(body.kind as string)) return bad("bad_kind", `kind 는 ${kinds.join(" 또는 ")}`);
    kind = body.kind as string;
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || [...name].length > NAME_MAX) return bad("bad_name", `이름은 1~${NAME_MAX}자`);
  if (!Array.isArray(body.rows) || !body.rows.every(isObj)) return bad("bad_rows", "rows 는 객체 목록");
  if (body.gas !== undefined && body.gas !== null && !isObj(body.gas)) return bad("bad_gas", "gas 는 객체 또는 null");
  const updatedAt = typeof body.updatedAt === "string" ? body.updatedAt : undefined;
  return { ok: true, kind, name, rows: body.rows as Record<string, unknown>[], gas: isObj(body.gas) ? body.gas : null, updatedAt };
}

/** 세션·장비·묶음·편집 권한 — 레시피 API 공통 앞부분 */
export async function recipeContext(equipment: string) {
  const auth = await requireSession();
  if (!auth.ok) return { ok: false as const, response: auth.response };
  const device = await enabledDevice(equipment);
  if (!device) return { ok: false as const, response: NextResponse.json({ error: "unknown_device" }, { status: 404 }) };
  const bundle = await deviceBundle(device.webSchemaHash);
  const actor = actorOf(auth.session);
  const canEdit = canEditRecipes(actor, equipment, await operatorEquipments(ops2Db, actor.employeeId));
  const user = auth.session.user;
  const ch12 = isCh12(equipment);
  return {
    ok: true as const, base: baseEquipment(equipment), bundle,
    env: (ch12 ? ch12RecipeEnvOf(bundle) : checkEnvOf(bundle)) as AnyRecipeEnv | null,
    kinds: (ch12 ? CH12_RECIPE_KINDS : RECIPE_KINDS) as readonly string[],
    outdated: ch12 ? ch12Outdated(bundle) : checkOutdated(bundle),
    bundleVersion: typeof bundle?.version === "number" ? bundle.version : null,
    canEdit, who: user?.email ?? user?.name ?? "unknown",
  };
}

export const forbidden = () =>
  NextResponse.json({ error: "forbidden", detail: "레시피 저장은 장비 담당자·관리자만" }, { status: 403 });

/** Prisma 유일 제약 위반 */
export const isUniqueViolation = (e: unknown) => (e as { code?: string })?.code === "P2002";

export type RecipeRow = {
  id: string; baseEquipment: string; kind: string; name: string; rows: unknown; gas: unknown; bundleVersion: number | null;
  createdBy: string; createdAt: Date; updatedBy: string; updatedAt: Date;
};

/** 목록 한 줄(행 내용 없이) */
export function listItem(r: RecipeRow, env: AnyRecipeEnv | null) {
  return {
    id: r.id, kind: r.kind, name: r.name, rowCount: Array.isArray(r.rows) ? r.rows.length : 0,
    bundleVersion: r.bundleVersion, createdBy: r.createdBy, createdAt: r.createdAt.toISOString(),
    updatedBy: r.updatedBy, updatedAt: r.updatedAt.toISOString(), check: checkSummary(r.kind, r.rows, r.gas, env),
  };
}

/** 하나 전체 */
export function fullItem(r: RecipeRow, env: AnyRecipeEnv | null) {
  return { ...listItem(r, env), rows: Array.isArray(r.rows) ? r.rows : [], gas: r.gas ?? null };
}
