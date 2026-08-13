import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, isAdminSession } from "@/lib/auth-helpers";

export const runtime = "nodejs";

// GET /api/activity — 활동 이력 목록 (최근 200건). 관리자/대표만 조회 가능.
export async function GET() {
  const _auth = await requireSession();
  if (!_auth.ok) return _auth.response;

  if (!isAdminSession(_auth.session)) {
    return NextResponse.json(
      { error: "활동 이력은 관리자만 조회할 수 있습니다." },
      { status: 403 },
    );
  }

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
