import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-helpers";

export const runtime = "nodejs";

// GET /api/employees — 담당자 드롭다운용 재직자 목록 (hr.employees 재사용)
export async function GET() {
  const _auth = await requireSession();
  if (!_auth.ok) return _auth.response;
  try {
    const items = await prisma.employee.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(items);
  } catch {
    return NextResponse.json({ error: "직원 목록을 불러오지 못했습니다." }, { status: 500 });
  }
}
