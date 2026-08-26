import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type IngestMsg = {
  id?: string; // 리포터가 부여하는 메시지 고유 ID (재전송 중복 차단용)
  type: "hello" | "state" | "event" | "run_start" | "run_end";
  ts?: string;
  data?: Record<string, unknown>;
  level?: string;
  message?: string;
  processName?: string;
  params?: Record<string, unknown>;
  result?: string;
  errorMsg?: string;
};

type PendingEvent = {
  equipment: string;
  runId: number | null;
  ts: Date;
  level: string;
  message: string;
  msgId: string | null;
};

// POST /api/ops/ingest — 장비 리포터 수집 엔드포인트.
// 세션이 아니라 Bearer 토큰(OPS_INGEST_TOKEN) 인증이다.
// 설계 원칙:
//  - 배치당 DB 왕복을 최소화한다(이벤트는 createMany 일괄 삽입).
//  - 모든 처리는 멱등이다. 같은 배치가 재전송돼도 중복이 생기지 않는다.
//  - hello는 세션 시작 표시일 뿐 payload를 덮어쓰지 않는다.
//    (스풀 재전송 시 최신 상태가 지워지는 것을 막기 위함)
export async function POST(req: NextRequest) {
  const token = process.env.OPS_INGEST_TOKEN;
  const auth = req.headers.get("authorization") ?? "";
  if (!token || auth !== `Bearer ${token}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const equipment: string | undefined = body?.equipment;
  const messages: IngestMsg[] | undefined = body?.messages;
  if (!equipment || !Array.isArray(messages)) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  try {
    // 열린 런은 배치당 한 번만 조회한다
    let openRunId: number | null =
      (
        await prisma.opsRun.findFirst({
          where: { equipment, status: "running" },
          orderBy: { startedAt: "desc" },
          select: { id: true },
        })
      )?.id ?? null;

    let pending: PendingEvent[] = [];
    const flush = async () => {
      if (!pending.length) return;
      await prisma.opsEvent.createMany({ data: pending, skipDuplicates: true });
      pending = [];
    };

    // state는 배치 내 마지막 것만 반영하면 충분하다
    let latestState: Record<string, unknown> | null = null;

    for (const m of messages) {
      const ts = m.ts ? new Date(m.ts) : new Date();

      if (m.type === "state") {
        latestState = (m.data ?? {}) as Record<string, unknown>;
      } else if (m.type === "hello") {
        // 세션 시작 표시. payload를 덮어쓰지 않는다.
      } else if (m.type === "event") {
        pending.push({
          equipment,
          runId: openRunId,
          ts,
          level: m.level ?? "info",
          message: String(m.message ?? "").slice(0, 500),
          msgId: m.id ?? null,
        });
      } else if (m.type === "run_start") {
        await flush();
        const key = m.id ?? `${equipment}:start:${ts.toISOString()}`;
        // 비정상 종료로 남은 러닝 상태 정리
        await prisma.opsRun.updateMany({
          where: { equipment, status: "running" },
          data: { status: "aborted", endedAt: ts },
        });
        const run = await prisma.opsRun.upsert({
          where: { msgId: key },
          update: {},
          create: {
            equipment,
            msgId: key,
            status: "running",
            processName: m.processName ?? null,
            params: (m.params ?? undefined) as object | undefined,
            startedAt: ts,
          },
          select: { id: true },
        });
        openRunId = run.id;
      } else if (m.type === "run_end") {
        await flush();
        if (openRunId !== null) {
          await prisma.opsRun.update({
            where: { id: openRunId },
            data: {
              status: m.result ?? "done",
              endedAt: ts,
              errorMsg: m.errorMsg ?? null,
            },
          });
          openRunId = null;
        }
      }
    }
    await flush();

    if (latestState) {
      await prisma.opsState.upsert({
        where: { equipment },
        update: { payload: latestState as object },
        create: { equipment, payload: latestState as object },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[ops/ingest]", e);
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}
