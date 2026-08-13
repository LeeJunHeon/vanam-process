import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-helpers";

export const runtime = "nodejs";

// GET /api/employees — 담당자 드롭다운용 목록.
// hr 전체가 아니라 process.process_owner 에 등록된(활성) 인원만 반환한다.
export async function GET() {
  const _auth = await requireSession();
  if (!_auth.ok) return _auth.response;
  try {
    const items = await prisma.processOwner.findMany({
      where: { isActive: true, employee: { isActive: true } },
      select: { employee: { select: { id: true, name: true } } },
      orderBy: { sortOrder: "asc" },
    });
    return NextResponse.json(items.map((i) => i.employee));
  } catch {
    return NextResponse.json({ error: "직원 목록을 불러오지 못했습니다." }, { status: 500 });
  }
}
