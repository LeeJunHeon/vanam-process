import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-helpers";

export const runtime = "nodejs";

// GET /api/activity — 활동 이력 목록 (최근 200건)
export async function GET() {
  const _auth = await requireSession();
  if (!_auth.ok) return _auth.response;

  try {
    const items = await prisma.activityLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return NextResponse.json(items);
  } catch {
    return NextResponse.json(
      { error: "이력을 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}
