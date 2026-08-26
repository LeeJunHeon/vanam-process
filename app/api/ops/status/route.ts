import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/ops/status?equipment=CHK — 브라우저 폴링용 장비 상태 조회.
export async function GET(req: NextRequest) {
  const _auth = await requireSession();
  if (!_auth.ok) return _auth.response;

  const equipment = req.nextUrl.searchParams.get("equipment") ?? "CHK";

  const [state, run, events, runs] = await Promise.all([
    prisma.opsState.findUnique({ where: { equipment } }),
    prisma.opsRun.findFirst({
      where: { equipment, status: "running" },
      orderBy: { startedAt: "desc" },
    }),
    prisma.opsEvent.findMany({
      where: { equipment },
      orderBy: { ts: "desc" },
      take: 20,
    }),
    prisma.opsRun.findMany({
      where: { equipment },
      orderBy: { startedAt: "desc" },
      take: 10,
    }),
  ]);

  return NextResponse.json({ state, run, events, runs });
}
