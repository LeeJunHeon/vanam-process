import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const equipment = req.nextUrl.searchParams.get("equipment") ?? "CHK";
  const kind = req.nextUrl.searchParams.get("kind") ?? "process";
  const items = await prisma.opsRecipe.findMany({
    where: { equipment, kind },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  const who = auth.session.user?.email ?? auth.session.user?.name ?? "unknown";

  const body = await req.json().catch(() => null);
  const equipment: string = body?.equipment ?? "";
  const kind: string = body?.kind ?? "";
  const name: string = (body?.name ?? "").trim();
  const rows = body?.rows;
  const id: number | undefined = body?.id;

  if (!equipment || !["process", "heater"].includes(kind) || !name || !Array.isArray(rows)) {
    return NextResponse.json({ error: "입력값이 올바르지 않습니다." }, { status: 400 });
  }

  // 이름 중복 확인 (수정 중인 자기 자신은 제외)
  const dup = await prisma.opsRecipe.findFirst({
    where: { equipment, kind, name, ...(id ? { NOT: { id } } : {}) },
    select: { id: true },
  });
  if (dup) {
    return NextResponse.json(
      { error: `"${name}" 이름의 레시피가 이미 있습니다.` }, { status: 409 },
    );
  }

  if (id) {
    const saved = await prisma.opsRecipe.update({
      where: { id },
      data: { name, rows, updatedBy: who, updatedAt: new Date() },
    });
    return NextResponse.json({ ok: true, item: saved });
  }

  const saved = await prisma.opsRecipe.create({
    data: { equipment, kind, name, rows, createdBy: who, updatedBy: who },
  });
  return NextResponse.json({ ok: true, item: saved });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id가 필요합니다." }, { status: 400 });
  await prisma.opsRecipe.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
