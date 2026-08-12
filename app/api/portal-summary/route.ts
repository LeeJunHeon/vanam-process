import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-helpers";

export const runtime = "nodejs";

const ALLOWED_ORIGIN = "https://vanam.synology.me";

function withCors(res: NextResponse) {
  res.headers.set("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.headers.set("Access-Control-Allow-Credentials", "true");
  return res;
}

export async function OPTIONS() {
  const res = new NextResponse(null, { status: 204 });
  res.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return withCors(res);
}

// GET /api/portal-summary — 포털 대시보드 카드용 요약
export async function GET() {
  const _auth = await requireSession();
  if (!_auth.ok) return withCors(_auth.response);

  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [total, thisMonth] = await Promise.all([
      prisma.substrateReceipt.count({ where: { deletedAt: null } }),
      prisma.substrateReceipt.count({
        where: { deletedAt: null, receivedAt: { gte: monthStart } },
      }),
    ]);

    return withCors(NextResponse.json({ total, thisMonth }));
  } catch {
    return withCors(
      NextResponse.json({ error: "요약을 불러오지 못했습니다." }, { status: 500 }),
    );
  }
}
