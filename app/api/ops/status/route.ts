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
  // 결과 추적: 이 화면에서 보낸 명령 id 만 가볍게 함께 조회한다(추가 요청을 만들지 않기 위해).
  const cmdIds = (req.nextUrl.searchParams.get("cmdIds") ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, 10);

  const [state, run, events, runs, commands, tracked, notices] = await Promise.all([
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
    cmdIds.length
      ? prisma.opsCommand.findMany({ where: { equipment, id: { in: cmdIds } } })
      : Promise.resolve(undefined),
    // 미확인 장비 알림. (equipment, acked_at) 인덱스로 가볍게 조회한다.
    // 이 조회가 실패해도 나머지 응답은 정상으로 보낸다.
    prisma.opsNotice
      .findMany({
        where: { equipment, ackedAt: null },
        orderBy: { ts: "desc" },
        take: 10,
      })
      .catch((e) => {
        console.error("[ops/status] notice 조회 실패", e);
        return [];
      }),
  ]);

  return NextResponse.json({
    state,
    run,
    events,
    ...(runs !== undefined ? { runs } : {}),
    ...(commands !== undefined ? { commands } : {}),
    ...(tracked !== undefined ? { tracked } : {}),
    notices,
  });
}
