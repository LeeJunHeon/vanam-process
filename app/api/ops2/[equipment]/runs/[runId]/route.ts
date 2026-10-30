import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-helpers";
import { ops2Db } from "@/lib/ops2/db";
import { enabledDevice } from "@/lib/ops2/browser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 쿼리 크기 상한 — 넘으면 truncated 에 표시(사건은 앞에서부터, 요약은 앞에서부터 24시간분, 명령은 앞에서부터)
const MAX_EVENTS = 2000;
const MAX_SUMMARY = 1440;
const MAX_COMMANDS = 200;
const PAD_MS = 60_000;           // 명령 기록은 공정 앞뒤 1분까지

// GET /api/ops2/[equipment]/runs/[runId] — 공정 하나(웹 전용, 누구나 읽기): run(시작·끝·결과·사유·설정 버전·params·blocks),
// 그 run 의 사건(ops2_event run_id, 시각 순), 1분 요약(ops2_summary run_id, 구간 순), 그 시간대의 명령(ops2_command).
// 챔버12 run(chamber 가 있는 것)의 1분 요약은 run_ids(챔버별 run id 목록)에 이 run 이 든 것도 — CH1·CH2 동시 공정은 같은 요약을 같이 쓴다.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ equipment: string; runId: string }> }) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  const { equipment, runId } = await params;
  if (!(await enabledDevice(equipment))) return NextResponse.json({ error: "unknown_device" }, { status: 404 });
  const run = await ops2Db.ops2Run.findUnique({ where: { runId } });
  if (!run || run.equipment !== equipment) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const [events, summaries] = await Promise.all([
    ops2Db.ops2Event.findMany({
      where: { runId, equipment }, orderBy: [{ ts: "asc" }, { seq: "asc" }], take: MAX_EVENTS + 1,
      select: { msgId: true, ts: true, level: true, code: true, ruleId: true, message: true, kind: true, source: true, context: true },
    }),
    ops2Db.ops2Summary.findMany({
      where: run.chamber ? { equipment, OR: [{ runId }, { runIds: { array_contains: [runId] } }] } : { runId, equipment },
      orderBy: { fromTs: "asc" }, take: MAX_SUMMARY + 1,
      select: { fromTs: true, toTs: true, rowCount: true, stats: true, quality: true, instance: true },
    }),
  ]);
  const t0 = run.startedAt ?? events[0]?.ts ?? null;
  const t1 = run.endedAt ?? (run.startedAt ? new Date() : events[events.length - 1]?.ts ?? null);
  const commands = t0 && t1 ? await ops2Db.ops2Command.findMany({
    where: { equipment, requestedAt: { gte: new Date(t0.getTime() - PAD_MS), lte: new Date(t1.getTime() + PAD_MS) } },
    orderBy: { requestedAt: "asc" }, take: MAX_COMMANDS + 1,
    select: {
      id: true, origin: true, kind: true, label: true, args: true, requestedBy: true, requestedAt: true, status: true,
      sentVia: true, resultReceivedAt: true, reasonCode: true, detail: true,
    },
  }) : [];
  return NextResponse.json({
    run,
    events: events.slice(0, MAX_EVENTS),
    summaries: summaries.slice(0, MAX_SUMMARY),
    commands: commands.slice(0, MAX_COMMANDS),
    truncated: { events: events.length > MAX_EVENTS, summaries: summaries.length > MAX_SUMMARY, commands: commands.length > MAX_COMMANDS },
    limits: { events: MAX_EVENTS, summaries: MAX_SUMMARY, commands: MAX_COMMANDS },
  });
}
