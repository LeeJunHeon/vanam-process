import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-helpers";
import { ops2Db } from "@/lib/ops2/db";
import { enabledDevice, limitOf } from "@/lib/ops2/browser";
import { Prisma } from "@/app/generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESULTS = ["done", "aborted", "error", "running"] as const;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** "2026-10-23" → 그날 00:00 KST(+1 이면 다음 날 00:00) */
const kstDay = (d: string, plus = 0) => new Date(Date.parse(`${d}T00:00:00+09:00`) + plus * 86_400_000);

type Row = {
  run_id: string; name: string | null; recipe_name: string | null; started_by: string | null; step_no: number | null;
  started_at: Date | string | null; ended_at: Date | string | null; result: string | null; reason_code: string | null;
  config_version: number | null; at: Date | string;
};

// GET /api/ops2/[equipment]/runs?from=YYYY-MM-DD&to=YYYY-MM-DD&result=done|aborted|error|running&cursor=…&limit=20
// 공정 기록 목록(웹 전용 — W-3 v1/runs 는 상태 카드용으로 그대로). 누구나 읽기. 날짜는 KST 하루 단위(to 포함).
// 기준 시각 at = COALESCE(started_at, ended_at) — 시작 기록이 없는 run(run_end 만 온 것)도 끝 시각으로 보인다(noStart).
// 정렬은 at·run_id 내림차순, 쪽 넘김은 cursor(앞 쪽 마지막 줄의 "at ISO|runId"). limit 은 100 까지.
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

  const at = Prisma.sql`date_trunc('milliseconds', COALESCE(started_at, ended_at))`;   // 커서(ISO, ms)와 같은 자리수
  const where: Prisma.Sql[] = [Prisma.sql`equipment = ${equipment}`, Prisma.sql`${at} IS NOT NULL`];
  if (from) where.push(Prisma.sql`${at} >= ${kstDay(from)}`);
  if (to) where.push(Prisma.sql`${at} < ${kstDay(to, 1)}`);
  if (result === "running") where.push(Prisma.sql`ended_at IS NULL`);
  else if (result) where.push(Prisma.sql`result = ${result}`);
  if (cursor) {
    const cut = cursor.lastIndexOf("|");
    const [iso, id] = [cursor.slice(0, cut), cursor.slice(cut + 1)];
    const t = new Date(iso);
    if (cut < 0 || !id || !Number.isFinite(t.getTime())) return bad("cursor 모양이 틀림");
    where.push(Prisma.sql`(${at} < ${t} OR (${at} = ${t} AND run_id < ${id}))`);
  }
  const rows = await ops2Db.$queryRaw<Row[]>`
    SELECT run_id, name, recipe_name, started_by, step_no, started_at, ended_at, result, reason_code, config_version, ${at} AS at
    FROM "process"."ops2_run" WHERE ${Prisma.join(where, " AND ")}
    ORDER BY at DESC, run_id DESC LIMIT ${take + 1}`;
  const d = (v: Date | string | null) => (v === null ? null : new Date(v));     // 드라이버가 글로 줄 수도 있다
  const page = rows.slice(0, take);
  const last = page[page.length - 1];
  return NextResponse.json({
    runs: page.map((r) => ({
      runId: r.run_id, name: r.name, recipeName: r.recipe_name, startedBy: r.started_by, stepNo: r.step_no,
      startedAt: d(r.started_at), endedAt: d(r.ended_at), result: r.result, reasonCode: r.reason_code, configVersion: r.config_version,
      noStart: !r.started_at,
      durationS: r.started_at && r.ended_at ? Math.round(((d(r.ended_at) as Date).getTime() - (d(r.started_at) as Date).getTime()) / 1000) : null,
    })),
    next: rows.length > take && last ? `${(d(last.at) as Date).toISOString()}|${last.run_id}` : null,
  });
}
