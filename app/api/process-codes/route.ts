import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-helpers";

export const runtime = "nodejs";

// GET /api/process-codes — 드롭다운용 활성 공정 코드
export async function GET() {
  const _auth = await requireSession();
  if (!_auth.ok) return _auth.response;
  try {
    const items = await prisma.processCode.findMany({
      where: { isActive: true },
      select: { id: true, code: true, calendarEnabled: true },
      orderBy: { sortOrder: "asc" },
    });
    return NextResponse.json(items);
  } catch {
    return NextResponse.json({ error: "공정 코드를 불러오지 못했습니다." }, { status: 500 });
  }
}
