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
  const limit = req.nextUrl.searchParams.get("limit");
  const before = req.nextUrl.searchParams.get("before");
  const full = req.nextUrl.searchParams.get("full") !== "0";
  const afterEventId = Number(req.nextUrl.searchParams.get("afterEventId") || "") || null;

  const [state, run, events, runs, commands] = await Promise.all([
    prisma.opsState.findUnique({ where: { equipment } }),
    prisma.opsRun.findFirst({
      where: { equipment, status: "running" },
      orderBy: { startedAt: "desc" },
    }),
    prisma.opsEvent.findMany({
      where: {
        equipment,
        // 증분 조회: 마지막으로 받은 id 이후만 (평소 0건이라 매우 가볍다)
        ...(afterEventId ? { id: { gt: afterEventId } } : {}),
        ...(before ? { ts: { lt: new Date(before) } } : {}),
      },
      // 같은 초에 여러 이벤트가 들어오면 ts만으로는 순서가 흔들리므로 id를 보조 정렬로 쓴다
      orderBy: [{ ts: "desc" }, { id: "desc" }],
      take: afterEventId ? 100 : Math.min(Math.max(Number(limit) || 50, 1), 500),
    }),
    full
      ? prisma.opsRun.findMany({
          where: { equipment },
          orderBy: { startedAt: "desc" },
          take: 10,
        })
      : Promise.resolve(undefined),
    full
      ? prisma.opsCommand.findMany({
          where: { equipment },
          orderBy: { requestedAt: "desc" },
          take: 10,
        })
      : Promise.resolve(undefined),
  ]);

  return NextResponse.json({
    state,
    run,
    events,
    ...(runs !== undefined ? { runs } : {}),
    ...(commands !== undefined ? { commands } : {}),
  });
}
