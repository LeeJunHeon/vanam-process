import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-helpers";
import { ops2Db } from "@/lib/ops2/db";
import { enabledDevice, limitOf } from "@/lib/ops2/browser";
import type { Prisma } from "@/app/generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESULTS = ["done", "aborted", "error", "running"] as const;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** "2026-10-23" → 그날 00:00 KST(+1 이면 다음 날 00:00) */
const kstDay = (d: string, plus = 0) => new Date(Date.parse(`${d}T00:00:00+09:00`) + plus * 86_400_000);

// GET /api/ops2/[equipment]/runs?from=YYYY-MM-DD&to=YYYY-MM-DD&result=done|aborted|error|running&cursor=…&limit=20
// 공정 기록 목록(웹 전용 — W-3 v1/runs 는 상태 카드용으로 그대로). 누구나 읽기. 시작이 늦은 것부터, 날짜는 KST 하루 단위(to 포함).
// 쪽 넘김은 cursor(앞 쪽 마지막 줄의 "시작 ISO|runId") — limit 은 100 까지. 시작을 모르는 run(run_end 만 온 것)은 목록에 없다.
export async function GET(req: NextRequest, { params }: { params: Promise<{ equipment: string }> }) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  const { equipment } = await params;
  if (!(await enabledDevice(equipment))) return NextResponse.json({ error: "unknown_device" }, { status: 404 });

  const q = req.nextUrl.searchParams;
  const bad = (detail: string) => NextResponse.json({ error: "bad_query", detail }, { status: 400 });
  const from = q.get("from"), to = q.get("to"), result = q.get("result"), cursor = q.get("cursor");
  if (from && !DAY.test(from)) return bad("from 은 YYYY-MM-DD");
  if (to && !DAY.test(to)) return bad("to 는 YYYY-MM-DD");
  if (result && !RESULTS.includes(result as (typeof RESULTS)[number])) return bad(`result 는 ${RESULTS.join("·")}`);
  const take = limitOf(q.get("limit"), 20, 100);

  const and: Prisma.Ops2RunWhereInput[] = [{ equipment }, { startedAt: { not: null } }];
  if (from) and.push({ startedAt: { gte: kstDay(from) } });
  if (to) and.push({ startedAt: { lt: kstDay(to, 1) } });
  if (result === "running") and.push({ endedAt: null });
  else if (result) and.push({ result });
  if (cursor) {
    const [iso, id] = [cursor.slice(0, cursor.lastIndexOf("|")), cursor.slice(cursor.lastIndexOf("|") + 1)];
    const at = new Date(iso);
    if (!id || !Number.isFinite(at.getTime())) return bad("cursor 모양이 틀림");
    and.push({ OR: [{ startedAt: { lt: at } }, { startedAt: at, runId: { lt: id } }] });
  }
  const rows = await ops2Db.ops2Run.findMany({
    where: { AND: and },
    orderBy: [{ startedAt: "desc" }, { runId: "desc" }],
    take: take + 1,
    select: {
      runId: true, name: true, recipeName: true, startedBy: true, stepNo: true, startedAt: true, endedAt: true,
      result: true, reasonCode: true, configVersion: true,
    },
  });
  const page = rows.slice(0, take);
  const last = page[page.length - 1];
  return NextResponse.json({
    runs: page.map((r) => ({
      ...r, durationS: r.startedAt && r.endedAt ? Math.round((r.endedAt.getTime() - r.startedAt.getTime()) / 1000) : null,
    })),
    next: rows.length > take && last?.startedAt ? `${last.startedAt.toISOString()}|${last.runId}` : null,
  });
}
