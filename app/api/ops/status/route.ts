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

  const [state, run, events, runs, commands] = await Promise.all([
    prisma.opsState.findUnique({ where: { equipment } }),
    prisma.opsRun.findFirst({
      where: { equipment, status: "running" },
      orderBy: { startedAt: "desc" },
    }),
    prisma.opsEvent.findMany({
      where: { equipment },
      // 같은 초에 여러 이벤트가 들어오면 ts만으로는 순서가 흔들리므로 id를 보조 정렬로 쓴다
      orderBy: [{ ts: "desc" }, { id: "desc" }],
      take: 50,
    }),
    prisma.opsRun.findMany({
      where: { equipment },
      orderBy: { startedAt: "desc" },
      take: 10,
    }),
    prisma.opsCommand.findMany({
      where: { equipment },
      orderBy: { requestedAt: "desc" },
      take: 10,
    }),
  ]);

  return NextResponse.json({ state, run, events, runs, commands });
}
