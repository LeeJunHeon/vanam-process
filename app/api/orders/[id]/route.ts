import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, isAdminSession } from "@/lib/auth-helpers";
import { logActivity, buildOrderState } from "@/lib/activity";
import { PAYMENT_STATUSES, PRECHECK_STATUSES, parseDateOnly } from "@/lib/orderUtils";
import { syncProcessCalendar } from "@/lib/calendarSync";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const _auth = await requireSession();
  if (!_auth.ok) return _auth.response;
  if (!isAdminSession(_auth.session)) {
    return NextResponse.json({ error: "발주 수정은 관리자만 가능합니다." }, { status: 403 });
  }

  try {
    const { id } = await params;
    const row = await prisma.workOrder.findUnique({ where: { id: Number(id) } });
    if (!row) return NextResponse.json({ error: "발주를 찾을 수 없습니다." }, { status: 404 });
    if (row.deletedAt) {
      return NextResponse.json({ error: "삭제된 발주는 수정할 수 없습니다." }, { status: 400 });
    }

    const body = await request.json();

    const nextReceivedAt = body.receivedAt !== undefined ? parseDateOnly(body.receivedAt) : row.receivedAt;
    const nextSample = body.sampleReceivedAt !== undefined ? parseDateOnly(body.sampleReceivedAt) : row.sampleReceivedAt;
    const nextDue = body.dueAt !== undefined ? parseDateOnly(body.dueAt) : row.dueAt;
    if (nextReceivedAt === undefined || nextReceivedAt === null || nextSample === undefined || nextDue === undefined) {
      return NextResponse.json({ error: "날짜 형식이 올바르지 않습니다." }, { status: 400 });
    }
    const nextCompany = typeof body.company === "string" ? body.company.trim() || null : row.company;
    const nextCustomer = typeof body.customerName === "string" ? body.customerName.trim() || null : row.customerName;
    const nextJob = typeof body.jobName === "string" ? body.jobName.trim() || null : row.jobName;
    const nextMemo = typeof body.memo === "string" ? body.memo.trim() || null : row.memo;
    const nextPayment = typeof body.paymentStatus === "string" && body.paymentStatus ? body.paymentStatus : row.paymentStatus;
    const nextPrecheck = typeof body.precheckStatus === "string" && body.precheckStatus ? body.precheckStatus : row.precheckStatus;
    if (
      !(PAYMENT_STATUSES as readonly string[]).includes(nextPayment) ||
      !(PRECHECK_STATUSES as readonly string[]).includes(nextPrecheck)
    ) {
      return NextResponse.json({ error: "결제/검수 상태 값이 올바르지 않습니다." }, { status: 400 });
    }

    const changed =
      nextReceivedAt.getTime() !== row.receivedAt.getTime() ||
      (nextSample?.getTime() ?? null) !== (row.sampleReceivedAt?.getTime() ?? null) ||
      (nextDue?.getTime() ?? null) !== (row.dueAt?.getTime() ?? null) ||
      nextCompany !== row.company ||
      nextCustomer !== row.customerName ||
      nextJob !== row.jobName ||
      nextMemo !== row.memo ||
      nextPayment !== row.paymentStatus ||
      nextPrecheck !== row.precheckStatus;
    if (!changed) return NextResponse.json(row);

    const before = buildOrderState(row);
    const updated = await prisma.workOrder.update({
      where: { id: row.id },
      data: {
        receivedAt: nextReceivedAt,
        sampleReceivedAt: nextSample,
        dueAt: nextDue,
        company: nextCompany,
        customerName: nextCustomer,
        jobName: nextJob,
        memo: nextMemo,
        paymentStatus: nextPayment,
        precheckStatus: nextPrecheck,
      },
    });

    await logActivity(
      _auth.session, "update", updated.id,
      `${updated.orderNo} 발주 수정`,
      { state: buildOrderState(updated), before },
      "work_order",
    );
    return NextResponse.json(updated);
  } catch (e) {
    console.error("order update failed:", e);
    return NextResponse.json({ error: "수정에 실패했습니다." }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const _auth = await requireSession();
  if (!_auth.ok) return _auth.response;
  if (!isAdminSession(_auth.session)) {
    return NextResponse.json({ error: "발주 삭제는 관리자만 가능합니다." }, { status: 403 });
  }

  try {
    const { id } = await params;
    const row = await prisma.workOrder.findUnique({
      where: { id: Number(id) },
      include: {
        processes: {
          where: { deletedAt: null },
          include: { processCode: { select: { code: true } }, owner: { select: { name: true } } },
          orderBy: { sequence: "asc" },
        },
      },
    });
    if (!row) return NextResponse.json({ error: "발주를 찾을 수 없습니다." }, { status: 404 });
    if (row.deletedAt) return NextResponse.json({ error: "이미 삭제된 발주입니다." }, { status: 400 });

    const email = _auth.session.user?.email ?? "unknown";
    const now = new Date();
    await prisma.$transaction([
      prisma.workOrder.update({
        where: { id: row.id },
        data: { deletedAt: now, deletedByEmail: email },
      }),
      prisma.workOrderProcess.updateMany({
        where: { orderId: row.id, deletedAt: null },
        data: { deletedAt: now, deletedByEmail: email },
      }),
    ]);

    await logActivity(
      _auth.session, "delete", row.id,
      `${row.orderNo} 발주 삭제 (공정 ${row.processes.length}건 포함)`,
      { state: buildOrderState(row, row.processes) },
      "work_order",
    );

    // 공정이 방금 소프트 삭제되었으므로 sync 가 '취소' 분기를 타며 일정을 제거한다
    for (const p of row.processes) {
      await syncProcessCalendar(p.id);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("order delete failed:", e);
    return NextResponse.json({ error: "삭제에 실패했습니다." }, { status: 500 });
  }
}
