import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, isAdminSession } from "@/lib/auth-helpers";
import { PROCESS_STATUSES } from "@/lib/status";

export const runtime = "nodejs";

// GET /api/dashboard — 발주공정 현황 요약 (전 직원)
export async function GET() {
  const _auth = await requireSession();
  if (!_auth.ok) return _auth.response;

  try {
    const admin = isAdminSession(_auth.session);
    const myEmail = (_auth.session.user?.email ?? "").toLowerCase();
    // 일반 직원은 본인 담당 공정 기준으로만 집계한다
    const ownerFilter = admin
      ? {}
      : { owner: { email: { equals: myEmail, mode: "insensitive" as const } } };

    // planned_start/due_at 은 date 타입. 서버 TZ(UTC)와 무관하게 KST 기준 '오늘'을 계산한다.
    const todayStr = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    const today = new Date(todayStr);
    const week = new Date(today);
    week.setDate(week.getDate() + 7);

    const [grouped, overdueRaw, upcomingRaw, dueRaw] = await Promise.all([
      prisma.workOrderProcess.groupBy({
        by: ["status"],
        where: { deletedAt: null, order: { deletedAt: null }, ...ownerFilter },
        _count: { _all: true },
      }),
      // 시작 지연: 예정일이 지났는데 아직 대기/예약
      prisma.workOrderProcess.findMany({
        where: {
          deletedAt: null,
          order: { deletedAt: null },
          ...ownerFilter,
          plannedStart: { lt: today },
          status: { in: ["대기", "예약"] },
        },
        include: {
          order: { select: { orderNo: true, company: true, jobName: true } },
          processCode: { select: { code: true } },
          owner: { select: { name: true } },
        },
        orderBy: { plannedStart: "asc" },
        take: 20,
      }),
      // 7일 내 시작 예정 (완료/취소 제외)
      prisma.workOrderProcess.findMany({
        where: {
          deletedAt: null,
          order: { deletedAt: null },
          ...ownerFilter,
          plannedStart: { gte: today, lte: week },
          status: { notIn: ["완료", "취소"] },
        },
        include: {
          order: { select: { orderNo: true, company: true, jobName: true } },
          processCode: { select: { code: true } },
          owner: { select: { name: true } },
        },
        orderBy: { plannedStart: "asc" },
        take: 20,
      }),
      // 납기 임박·초과 발주
      admin
        ? prisma.workOrder.findMany({
            where: { deletedAt: null, dueAt: { not: null, lte: week } },
            include: { processes: { where: { deletedAt: null }, select: { status: true } } },
            orderBy: { dueAt: "asc" },
            take: 15,
          })
        : Promise.resolve([]),
    ]);

    const statusCounts: Record<string, number> = {};
    for (const s of PROCESS_STATUSES) statusCounts[s] = 0;
    for (const g of grouped) statusCounts[g.status] = g._count._all;

    const mapProc = (p: (typeof overdueRaw)[number]) => ({
      id: p.id,
      orderNo: p.order.orderNo,
      company: p.order.company,
      jobName: p.order.jobName,
      sequence: p.sequence,
      code: p.processCode.code,
      detail: p.detail,
      plannedStart: p.plannedStart ? p.plannedStart.toISOString().slice(0, 10) : null,
      status: p.status,
      owner: p.owner?.name ?? null,
    });

    // 전 공정 완료된 발주는 납기 목록에서 제외
    const dueSoon = dueRaw
      .map((o) => ({
        id: o.id,
        orderNo: o.orderNo,
        company: o.company,
        jobName: o.jobName,
        dueAt: o.dueAt!.toISOString().slice(0, 10),
        done: o.processes.filter((p) => p.status === "완료").length,
        total: o.processes.length,
      }))
      .filter((o) => o.total === 0 || o.done < o.total);

    return NextResponse.json({
      scope: admin ? "all" : "mine",
      today: todayStr,
      statusCounts,
      overdue: overdueRaw.map(mapProc),
      upcoming: upcomingRaw.map(mapProc),
      dueSoon,
    });
  } catch (e) {
    console.error("dashboard failed:", e);
    return NextResponse.json({ error: "현황을 불러오지 못했습니다." }, { status: 500 });
  }
}
