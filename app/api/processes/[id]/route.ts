import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, isAdminSession } from "@/lib/auth-helpers";
import { logActivity, buildProcessState } from "@/lib/activity";
import { PROCESS_STATUSES, parseDateOnly } from "@/lib/orderUtils";
import { syncProcessCalendar } from "@/lib/calendarSync";
import { sendProcessAssignMail, sendProcessRescheduleMail } from "@/lib/processMail";

export const runtime = "nodejs";

const FULL_INCLUDE = {
  order: { select: { orderNo: true, deletedAt: true } },
  processCode: { select: { id: true, code: true } },
  owner: { select: { id: true, name: true } },
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const _auth = await requireSession();
  if (!_auth.ok) return _auth.response;

  try {
    const { id } = await params;
    const row = await prisma.workOrderProcess.findUnique({
      where: { id: Number(id) },
      include: FULL_INCLUDE,
    });
    if (!row) return NextResponse.json({ error: "공정을 찾을 수 없습니다." }, { status: 404 });
    if (row.deletedAt || row.order.deletedAt) {
      return NextResponse.json({ error: "삭제된 공정은 수정할 수 없습니다." }, { status: 400 });
    }

    const body = await request.json();

    const nextCodeId = body.processCodeId !== undefined ? Number(body.processCodeId) : row.processCodeId;
    if (!Number.isInteger(nextCodeId) || nextCodeId <= 0) {
      return NextResponse.json({ error: "공정 값이 올바르지 않습니다." }, { status: 400 });
    }
    const nextPlanned = body.plannedStart !== undefined ? parseDateOnly(body.plannedStart) : row.plannedStart;
    if (nextPlanned === undefined) {
      return NextResponse.json({ error: "작업시작예정 날짜 형식이 올바르지 않습니다." }, { status: 400 });
    }
    const nextQty =
      body.qty === undefined ? row.qty
      : body.qty === null || body.qty === "" ? null : Number(body.qty);
    if (nextQty !== null && !Number.isInteger(nextQty)) {
      return NextResponse.json({ error: "횟수는 정수여야 합니다." }, { status: 400 });
    }
    const nextDuration =
      body.durationHours === undefined ? row.durationHours
      : body.durationHours === null || body.durationHours === "" ? null : Number(body.durationHours);
    if (nextDuration !== null && (!Number.isFinite(nextDuration) || nextDuration < 0)) {
      return NextResponse.json({ error: "소요시간은 0 이상의 숫자여야 합니다." }, { status: 400 });
    }
    const nextStatus = typeof body.status === "string" && body.status ? body.status : row.status;
    if (!(PROCESS_STATUSES as readonly string[]).includes(nextStatus)) {
      return NextResponse.json({ error: "상태 값이 올바르지 않습니다." }, { status: 400 });
    }
    const nextDetail = typeof body.detail === "string" ? body.detail.trim() || null : row.detail;
    const nextLocation = typeof body.location === "string" ? body.location.trim() || null : row.location;
    const nextMemo = typeof body.memo === "string" ? body.memo.trim() || null : row.memo;
    const nextOwner =
      body.ownerEmployeeId === undefined ? row.ownerEmployeeId
      : body.ownerEmployeeId === null || body.ownerEmployeeId === "" ? null : Number(body.ownerEmployeeId);

    const changed =
      nextCodeId !== row.processCodeId ||
      (nextPlanned?.getTime() ?? null) !== (row.plannedStart?.getTime() ?? null) ||
      nextQty !== row.qty ||
      nextDuration !== row.durationHours ||
      nextStatus !== row.status ||
      nextDetail !== row.detail ||
      nextLocation !== row.location ||
      nextMemo !== row.memo ||
      nextOwner !== row.ownerEmployeeId;
    if (!changed) return NextResponse.json(row);

    const before = buildProcessState(row);
    const updated = await prisma.workOrderProcess.update({
      where: { id: row.id },
      data: {
        processCodeId: nextCodeId,
        plannedStart: nextPlanned,
        qty: nextQty,
        durationHours: nextDuration,
        status: nextStatus,
        detail: nextDetail,
        location: nextLocation,
        memo: nextMemo,
        ownerEmployeeId: nextOwner,
      },
      include: FULL_INCLUDE,
    });

    await logActivity(
      _auth.session, "update", updated.id,
      `${row.order.orderNo} #${row.sequence} ${updated.processCode.code} 공정 수정`,
      { state: buildProcessState(updated), before },
      "work_order_process",
    );

    await syncProcessCalendar(updated.id);

    // 담당자 변경 → 배정 메일 (본문에 새 날짜가 이미 들어가므로 일정 변경 알림은 생략)
    // 담당자 유지 + 작업시작예정일 변경 → 일정 변경 알림
    // row 는 update 이전에 조회한 값이라 row.plannedStart 가 변경 전 날짜다
    const ownerChanged = nextOwner !== row.ownerEmployeeId && nextOwner !== null;
    const plannedChanged =
      (nextPlanned?.getTime() ?? null) !== (row.plannedStart?.getTime() ?? null);
    if (ownerChanged) {
      await sendProcessAssignMail(updated.id);
    } else if (plannedChanged) {
      await sendProcessRescheduleMail(updated.id, row.plannedStart);
    }

    return NextResponse.json(updated);
  } catch (e) {
    console.error("process update failed:", e);
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
    return NextResponse.json({ error: "공정 삭제는 관리자만 가능합니다." }, { status: 403 });
  }

  try {
    const { id } = await params;
    const row = await prisma.workOrderProcess.findUnique({
      where: { id: Number(id) },
      include: FULL_INCLUDE,
    });
    if (!row) return NextResponse.json({ error: "공정을 찾을 수 없습니다." }, { status: 404 });
    if (row.deletedAt) return NextResponse.json({ error: "이미 삭제된 공정입니다." }, { status: 400 });

    await prisma.workOrderProcess.update({
      where: { id: row.id },
      data: { deletedAt: new Date(), deletedByEmail: _auth.session.user?.email ?? "unknown" },
    });

    await logActivity(
      _auth.session, "delete", row.id,
      `${row.order.orderNo} #${row.sequence} ${row.processCode.code} 공정 삭제`,
      { state: buildProcessState(row) },
      "work_order_process",
    );

    await syncProcessCalendar(row.id);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("process delete failed:", e);
    return NextResponse.json({ error: "삭제에 실패했습니다." }, { status: 500 });
  }
}
