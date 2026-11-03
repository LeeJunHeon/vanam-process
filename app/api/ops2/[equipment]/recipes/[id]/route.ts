import { NextRequest, NextResponse } from "next/server";
import { ops2Db } from "@/lib/ops2/db";
import { checkSummary, forbidden, fullItem, isUniqueViolation, readRecipeBody, recipeContext } from "@/lib/ops2/recipes";
import { Prisma } from "@/app/generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type P = { params: Promise<{ equipment: string; id: string }> };
const notFound = () => NextResponse.json({ error: "not_found" }, { status: 404 });

// GET /api/ops2/[equipment]/recipes/[id] — 레시피 하나(행 전체 + 지금 묶음으로 낸 웹 검사 수). 누구나
export async function GET(_req: NextRequest, { params }: P) {
  const { equipment, id } = await params;
  const ctx = await recipeContext(equipment);
  if (!ctx.ok) return ctx.response;
  const r = await ops2Db.ops2Recipe.findUnique({ where: { id } });
  if (!r || r.baseEquipment !== ctx.base) return notFound();
  return NextResponse.json({ recipe: fullItem(r, ctx.env), canEdit: ctx.canEdit });
}

// PUT /api/ops2/[equipment]/recipes/[id] — 고치기(이름·rows·gas, kind 는 그대로). 장비 담당자·관리자.
// 본문 updatedAt(읽을 때의 값)이 지금과 다르면 409 stale — 다른 사람이 먼저 고친 것을 덮지 않게. 같은 이름 409 name_taken.
export async function PUT(req: NextRequest, { params }: P) {
  const { equipment, id } = await params;
  const ctx = await recipeContext(equipment);
  if (!ctx.ok) return ctx.response;
  if (!ctx.canEdit) return forbidden();
  const b = await readRecipeBody(req, false);
  if (!b.ok) return b.response;
  const cur = await ops2Db.ops2Recipe.findUnique({ where: { id } });
  if (!cur || cur.baseEquipment !== ctx.base) return notFound();
  if (b.updatedAt !== undefined && b.updatedAt !== cur.updatedAt.toISOString()) {
    return NextResponse.json({ error: "stale", detail: `다른 사람이 먼저 고침(${cur.updatedBy})`, updatedAt: cur.updatedAt },
                             { status: 409 });
  }
  try {
    const r = await ops2Db.ops2Recipe.update({
      where: { id, updatedAt: cur.updatedAt },        // 읽은 뒤 바뀌었으면 P2025
      data: {
        name: b.name, rows: b.rows as Prisma.InputJsonValue[],
        gas: cur.kind === "heater" && b.gas ? (b.gas as Prisma.InputJsonValue) : Prisma.DbNull,
        bundleVersion: ctx.bundleVersion, updatedBy: ctx.who, updatedAt: new Date(),
      },
    });
    return NextResponse.json({ recipe: fullItem(r, ctx.env), check: checkSummary(r.kind, r.rows, r.gas, ctx.env) });
  } catch (e) {
    if (isUniqueViolation(e)) return NextResponse.json({ error: "name_taken", detail: "같은 이름의 레시피가 있음" }, { status: 409 });
    if ((e as { code?: string })?.code === "P2025") {
      return NextResponse.json({ error: "stale", detail: "다른 사람이 먼저 고침" }, { status: 409 });
    }
    console.error("[ops2/recipes]", equipment, (e as Error)?.message?.slice(0, 300));
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}

// DELETE /api/ops2/[equipment]/recipes/[id] — 지우기(장비 담당자·관리자). 장비에 적재된 것은 장비 쪽 그대로(이름만 남음)
export async function DELETE(_req: NextRequest, { params }: P) {
  const { equipment, id } = await params;
  const ctx = await recipeContext(equipment);
  if (!ctx.ok) return ctx.response;
  if (!ctx.canEdit) return forbidden();
  const n = await ops2Db.ops2Recipe.deleteMany({ where: { id, baseEquipment: ctx.base } });
  if (!n.count) return notFound();
  return NextResponse.json({ ok: true });
}
