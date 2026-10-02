import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, isAdminSession } from "@/lib/auth-helpers";
import { logActivity, buildOrderState } from "@/lib/activity";
import { parseProcessRows } from "@/lib/processRows";
import { syncProcessCalendar } from "@/lib/calendarSync";
import { sendProcessAssignMail } from "@/lib/processMail";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const _auth = await requireSession();
  if (!_auth.ok) return _auth.response;
  if (!isAdminSession(_auth.session)) {
    return NextResponse.json({ error: "공정 추가는 관리자만 가능합니다." }, { status: 403 });
  }

  try {
    const { id } = await params;
    const order = await prisma.workOrder.findUnique({ where: { id: Number(id) } });
    if (!order) return NextResponse.json({ error: "발주를 찾을 수 없습니다." }, { status: 404 });
    if (order.deletedAt) {
      return NextResponse.json({ error: "삭제된 발주에는 공정을 추가할 수 없습니다." }, { status: 400 });
    }

    const body = await request.json();
    const rows: unknown[] = Array.isArray(body.processes) ? body.processes : [];
    if (rows.length === 0) {
      return NextResponse.json({ error: "공정을 1개 이상 입력해주세요." }, { status: 400 });
    }

    const parsed = parseProcessRows(rows);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    // 시퀀스 재사용 금지: 소프트 삭제된 공정까지 포함해 최대값을 찾는다 (시트의 이어붙임 규칙과 동일)
    const agg = await prisma.workOrderProcess.aggregate({
      where: { orderId: order.id },
      _max: { sequence: true },
    });
    let seq = agg._max.sequence ?? 0;
    const procData = parsed.rows.map((p) => ({ ...p, orderId: order.id, sequence: ++seq }));

    const beforeProcs = await prisma.workOrderProcess.findMany({
      where: { orderId: order.id, deletedAt: null },
      include: { processCode: { select: { code: true } }, owner: { select: { name: true } } },
      orderBy: { sequence: "asc" },
    });

    await prisma.workOrderProcess.createMany({ data: procData });

    const afterProcs = await prisma.workOrderProcess.findMany({
      where: { orderId: order.id, deletedAt: null },
      include: { processCode: { select: { code: true } }, owner: { select: { name: true } } },
      orderBy: { sequence: "asc" },
    });

    await logActivity(
      _auth.session, "update", order.id,
      `${order.orderNo} 공정 ${procData.length}건 추가 (시퀀스 ${afterProcs.length ? procData[0].sequence : ""}~${seq})`,
      { state: buildOrderState(order, afterProcs), before: buildOrderState(order, beforeProcs) },
      "work_order",
    );

    // 새로 추가된 공정만 캘린더 동기화 + 배정 메일
    const firstNewSeq = procData[0].sequence as number;
    const newProcs = afterProcs.filter((x) => x.sequence >= firstNewSeq);
    for (const p of newProcs) {
      await syncProcessCalendar(p.id);
    }
    for (const p of newProcs) {
      await sendProcessAssignMail(p.id, _auth.session.user?.email);
    }

    return NextResponse.json({ ok: true, added: procData.length }, { status: 201 });
  } catch (e) {
    console.error("process add failed:", e);
    return NextResponse.json({ error: "공정 추가에 실패했습니다." }, { status: 500 });
  }
}
