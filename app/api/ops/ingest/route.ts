import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type IngestMsg = {
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

// POST /api/ops/ingest — 장비 리포터 수집 엔드포인트.
// 세션이 아니라 Bearer 토큰(OPS_INGEST_TOKEN) 인증이다.
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

  for (const m of messages) {
    const ts = m.ts ? new Date(m.ts) : new Date();
    try {
      if (m.type === "state" || m.type === "hello") {
        await prisma.opsState.upsert({
          where: { equipment },
          update: { payload: (m.data ?? {}) as object },
          create: { equipment, payload: (m.data ?? {}) as object },
        });
      } else if (m.type === "event") {
        const open = await prisma.opsRun.findFirst({
          where: { equipment, status: "running" },
          orderBy: { startedAt: "desc" },
        });
        await prisma.opsEvent.create({
          data: {
            equipment,
            runId: open?.id ?? null,
            ts,
            level: m.level ?? "info",
            message: String(m.message ?? ""),
          },
        });
      } else if (m.type === "run_start") {
        // 비정상 종료로 남은 러닝 상태 정리 후 새 런 생성
        await prisma.opsRun.updateMany({
          where: { equipment, status: "running" },
          data: { status: "aborted", endedAt: ts },
        });
        await prisma.opsRun.create({
          data: {
            equipment,
            status: "running",
            processName: m.processName ?? null,
            params: (m.params ?? undefined) as object | undefined,
            startedAt: ts,
          },
        });
      } else if (m.type === "run_end") {
        const open = await prisma.opsRun.findFirst({
          where: { equipment, status: "running" },
          orderBy: { startedAt: "desc" },
        });
        if (open) {
          await prisma.opsRun.update({
            where: { id: open.id },
            data: {
              status: m.result ?? "done",
              endedAt: ts,
              errorMsg: m.errorMsg ?? null,
            },
          });
        }
      }
    } catch (e) {
      console.error("[ops/ingest]", e);
    }
  }

  return NextResponse.json({ ok: true });
}
