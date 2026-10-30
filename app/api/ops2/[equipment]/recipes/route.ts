import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ops2Db } from "@/lib/ops2/db";
import { checkSummary, forbidden, fullItem, isUniqueViolation, listItem, readRecipeBody, recipeContext } from "@/lib/ops2/recipes";
import type { Prisma } from "@/app/generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/ops2/[equipment]/recipes?kind=process|heater — 그 기준 장비(CHK2-SIM → CHK2)의 레시피 목록(누구나).
// 줄마다 지금 묶음으로 낸 웹 검사 결과 수(check). canEdit = 저장할 수 있는가, outdated = 묶음 version ≠ 웹 검사 기준.
// 챔버12(CH12·CH12-SIM): kind 는 ch1·ch2(챔버별 블록 레시피 — lib/ops2/ch12/recipes.ts 로 검사), outdated = 블록 정의 판 ≠ 웹.
export async function GET(req: NextRequest, { params }: { params: Promise<{ equipment: string }> }) {
  const { equipment } = await params;
  const ctx = await recipeContext(equipment);
  if (!ctx.ok) return ctx.response;
  const kind = req.nextUrl.searchParams.get("kind");
  if (kind !== null && !ctx.kinds.includes(kind)) {
    return NextResponse.json({ error: "bad_kind", detail: `kind 는 ${ctx.kinds.join(" 또는 ")}` }, { status: 400 });
  }
  const rows = await ops2Db.ops2Recipe.findMany({
    where: { baseEquipment: ctx.base, ...(kind ? { kind } : {}) },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
  });
  return NextResponse.json({
    base: ctx.base, canEdit: ctx.canEdit, bundleVersion: ctx.bundleVersion, outdated: ctx.outdated,
    recipes: rows.map((r) => listItem(r, ctx.env)),
  });
}

// POST /api/ops2/[equipment]/recipes — 새로 저장(장비 담당자·관리자). 본문 {kind, name(1~80자), rows, gas?(heater)}.
// 같은 이름 409 name_taken. 검사 오류가 있어도 저장한다 — 응답 check 에 오류·경고 수.
export async function POST(req: NextRequest, { params }: { params: Promise<{ equipment: string }> }) {
  const { equipment } = await params;
  const ctx = await recipeContext(equipment);
  if (!ctx.ok) return ctx.response;
  if (!ctx.canEdit) return forbidden();
  const b = await readRecipeBody(req, true, ctx.kinds);
  if (!b.ok) return b.response;
  const kind = b.kind as string;
  const now = new Date();
  try {
    const r = await ops2Db.ops2Recipe.create({
      data: {
        id: randomUUID().replace(/-/g, ""), baseEquipment: ctx.base, kind, name: b.name,
        rows: b.rows as Prisma.InputJsonValue[],
        gas: kind === "heater" && b.gas ? (b.gas as Prisma.InputJsonValue) : undefined,
        bundleVersion: ctx.bundleVersion, createdBy: ctx.who, createdAt: now, updatedBy: ctx.who, updatedAt: now,
      },
    });
    return NextResponse.json({ recipe: fullItem(r, ctx.env), check: checkSummary(kind, r.rows, r.gas, ctx.env) }, { status: 201 });
  } catch (e) {
    if (isUniqueViolation(e)) return NextResponse.json({ error: "name_taken", detail: "같은 이름의 레시피가 있음" }, { status: 409 });
    console.error("[ops2/recipes]", equipment, (e as Error)?.message?.slice(0, 300));
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}
