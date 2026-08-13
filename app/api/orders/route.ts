import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, isAdminSession } from "@/lib/auth-helpers";
import { logActivity, buildOrderState } from "@/lib/activity";
import {
  PAYMENT_STATUSES,
  PRECHECK_STATUSES,
  PROCESS_STATUSES,
  parseDateOnly,
  generateOrderNo,
} from "@/lib/orderUtils";

export const runtime = "nodejs";

const PROCESS_INCLUDE = {
  where: { deletedAt: null },
  include: {
    processCode: { select: { id: true, code: true } },
    owner: { select: { id: true, name: true } },
  },
  orderBy: { sequence: "asc" as const },
};

// GET /api/orders?q= — 발주 목록 (살아있는 공정 포함)
export async function GET(request: Request) {
  const _auth = await requireSession();
  if (!_auth.ok) return _auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim();

    const items = await prisma.workOrder.findMany({
      where: {
        deletedAt: null,
        ...(q
          ? {
              OR: [
                { orderNo: { contains: q, mode: "insensitive" } },
                { company: { contains: q, mode: "insensitive" } },
                { customerName: { contains: q, mode: "insensitive" } },
                { jobName: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: { processes: PROCESS_INCLUDE },
      orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
      take: 200,
    });
    return NextResponse.json(items);
  } catch (e) {
    console.error("orders list failed:", e);
    return NextResponse.json({ error: "목록을 불러오지 못했습니다." }, { status: 500 });
  }
}

// POST /api/orders — 발주 + 공정 일괄 등록 (관리자 전용, 발주번호 자동 채번)
export async function POST(request: Request) {
  const _auth = await requireSession();
  if (!_auth.ok) return _auth.response;
  if (!isAdminSession(_auth.session)) {
    return NextResponse.json({ error: "발주 등록은 관리자만 가능합니다." }, { status: 403 });
  }

  try {
    const body = await request.json();

    if (typeof body.receivedAt !== "string" || parseDateOnly(body.receivedAt) === undefined || body.receivedAt === "") {
      return NextResponse.json({ error: "접수일은 필수입니다." }, { status: 400 });
    }
    const rows: unknown[] = Array.isArray(body.processes) ? body.processes : [];
    if (rows.length === 0) {
      return NextResponse.json({ error: "공정을 1개 이상 입력해주세요." }, { status: 400 });
    }

    // 공정 행 검증·정규화
    const procData: {
      processCodeId: number; detail: string | null; qty: number | null;
      plannedStart: Date | null; durationHours: number | null; status: string;
      location: string | null; ownerEmployeeId: number | null; memo: string | null;
    }[] = [];
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
          ? null
          : Number(p.durationHours);
      if (durationHours !== null && (!Number.isFinite(durationHours) || durationHours < 0)) {
        return NextResponse.json({ error: "소요시간은 0 이상의 숫자여야 합니다." }, { status: 400 });
      }
      const status = typeof p.status === "string" && p.status ? p.status : "대기";
      if (!(PROCESS_STATUSES as readonly string[]).includes(status)) {
        return NextResponse.json({ error: "상태 값이 올바르지 않습니다." }, { status: 400 });
      }
      procData.push({
        processCodeId,
        detail: typeof p.detail === "string" && p.detail.trim() ? p.detail.trim() : null,
        qty,
        plannedStart,
        durationHours,
        status,
        location: typeof p.location === "string" && p.location.trim() ? p.location.trim() : null,
        ownerEmployeeId:
          p.ownerEmployeeId === null || p.ownerEmployeeId === undefined || p.ownerEmployeeId === ""
            ? null
            : Number(p.ownerEmployeeId),
        memo: typeof p.memo === "string" && p.memo.trim() ? p.memo.trim() : null,
      });
    }

    const sampleReceivedAt = parseDateOnly(body.sampleReceivedAt);
    const dueAt = parseDateOnly(body.dueAt);
    if (sampleReceivedAt === undefined || dueAt === undefined) {
      return NextResponse.json({ error: "날짜 형식이 올바르지 않습니다." }, { status: 400 });
    }
    const paymentStatus =
      typeof body.paymentStatus === "string" && body.paymentStatus ? body.paymentStatus : "미결제";
    const precheckStatus =
      typeof body.precheckStatus === "string" && body.precheckStatus ? body.precheckStatus : "미완료";
    if (
      !(PAYMENT_STATUSES as readonly string[]).includes(paymentStatus) ||
      !(PRECHECK_STATUSES as readonly string[]).includes(precheckStatus)
    ) {
      return NextResponse.json({ error: "결제/검수 상태 값이 올바르지 않습니다." }, { status: 400 });
    }

    const email = _auth.session.user?.email ?? "unknown";

    // 채번 충돌(P2002) 시 1회 재시도
    let created: { id: number } | null = null;
    for (let attempt = 0; attempt < 2 && !created; attempt++) {
      try {
        created = await prisma.$transaction(async (tx) => {
          const orderNo = await generateOrderNo(tx, body.receivedAt);
          const order = await tx.workOrder.create({
            data: {
              orderNo,
              receivedAt: new Date(body.receivedAt),
              company: typeof body.company === "string" && body.company.trim() ? body.company.trim() : null,
              customerName:
                typeof body.customerName === "string" && body.customerName.trim() ? body.customerName.trim() : null,
              jobName: typeof body.jobName === "string" && body.jobName.trim() ? body.jobName.trim() : null,
              sampleReceivedAt,
              dueAt,
              paymentStatus,
              precheckStatus,
              memo: typeof body.memo === "string" && body.memo.trim() ? body.memo.trim() : null,
              createdByEmail: email,
            },
          });
          await tx.workOrderProcess.createMany({
            data: procData.map((p, i) => ({ ...p, orderId: order.id, sequence: i + 1 })),
          });
          return order;
        });
      } catch (e) {
        const code = (e as { code?: string }).code;
        if (code !== "P2002" || attempt === 1) throw e;
      }
    }

    const full = await prisma.workOrder.findUnique({
      where: { id: created!.id },
      include: { processes: PROCESS_INCLUDE },
    });

    await logActivity(
      _auth.session,
      "create",
      full!.id,
      `${full!.orderNo} 발주 등록 · 공정 ${full!.processes.length}건`,
      { state: buildOrderState(full!, full!.processes) },
      "work_order",
    );

    return NextResponse.json(full, { status: 201 });
  } catch (e) {
    console.error("order create failed:", e);
    return NextResponse.json({ error: "등록에 실패했습니다." }, { status: 500 });
  }
}
