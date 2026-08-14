import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, isAdminSession } from "@/lib/auth-helpers";
import { logActivity, buildOrderState } from "@/lib/activity";
import { PROCESS_STATUSES, parseDateOnly } from "@/lib/orderUtils";
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

    const procData: {
      orderId: number; sequence: number; processCodeId: number;
      detail: string | null; qty: number | null; plannedStart: Date | null;
      durationHours: number | null; status: string; location: string | null;
      ownerEmployeeId: number | null; memo: string | null;
    }[] = [];
    // 시퀀스 재사용 금지: 소프트 삭제된 공정까지 포함해 최대값을 찾는다 (시트의 이어붙임 규칙과 동일)
    const agg = await prisma.workOrderProcess.aggregate({
      where: { orderId: order.id },
      _max: { sequence: true },
    });
    let seq = agg._max.sequence ?? 0;

    for (const raw of rows) {
      const p = raw as Record<string, unknown>;
      const processCodeId = Number(p.processCodeId);
      if (!Number.isInteger(processCodeId) || processCodeId <= 0) {
        return NextResponse.json({ error: "공정을 선택해주세요." }, { status: 400 });
      }
      const plannedStart = parseDateOnly(p.plannedStart);
      if (plannedStart === undefined) {
        return NextResponse.json({ error: "작업시작예정 날짜 형식이 올바르지 않습니다." }, { status: 400 });
      }
      const qty = p.qty === null || p.qty === undefined || p.qty === "" ? null : Number(p.qty);
      if (qty !== null && !Number.isInteger(qty)) {
        return NextResponse.json({ error: "횟수는 정수여야 합니다." }, { status: 400 });
      }
      const durationHours =
        p.durationHours === null || p.durationHours === undefined || p.durationHours === ""
          ? null : Number(p.durationHours);
      if (durationHours !== null && (!Number.isFinite(durationHours) || durationHours < 0)) {
        return NextResponse.json({ error: "소요시간은 0 이상의 숫자여야 합니다." }, { status: 400 });
      }
      const status = typeof p.status === "string" && p.status ? p.status : "대기";
      if (!(PROCESS_STATUSES as readonly string[]).includes(status)) {
        return NextResponse.json({ error: "상태 값이 올바르지 않습니다." }, { status: 400 });
      }
      seq += 1;
      procData.push({
        orderId: order.id,
        sequence: seq,
        processCodeId,
        detail: typeof p.detail === "string" && p.detail.trim() ? p.detail.trim() : null,
        qty,
        plannedStart,
        durationHours,
        status,
        location: typeof p.location === "string" && p.location.trim() ? p.location.trim() : null,
        ownerEmployeeId:
          p.ownerEmployeeId === null || p.ownerEmployeeId === undefined || p.ownerEmployeeId === ""
            ? null : Number(p.ownerEmployeeId),
        memo: typeof p.memo === "string" && p.memo.trim() ? p.memo.trim() : null,
      });
    }

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
      await sendProcessAssignMail(p.id);
    }

    return NextResponse.json({ ok: true, added: procData.length }, { status: 201 });
  } catch (e) {
    console.error("process add failed:", e);
    return NextResponse.json({ error: "공정 추가에 실패했습니다." }, { status: 500 });
  }
}
