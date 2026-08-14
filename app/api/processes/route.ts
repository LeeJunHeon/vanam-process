import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, isAdminSession } from "@/lib/auth-helpers";

export const runtime = "nodejs";

// GET /api/processes?q= — 공정 목록.
// 관리자는 전체, 일반 직원은 본인 담당 공정만 (서버에서 강제).
export async function GET(request: Request) {
  const _auth = await requireSession();
  if (!_auth.ok) return _auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim();
    const admin = isAdminSession(_auth.session);
    const myEmail = (_auth.session.user?.email ?? "").toLowerCase();

    const items = await prisma.workOrderProcess.findMany({
      where: {
        deletedAt: null,
        order: { deletedAt: null },
        ...(admin ? {} : { owner: { email: { equals: myEmail, mode: "insensitive" } } }),
        ...(q
          ? {
              OR: [
                { detail: { contains: q, mode: "insensitive" } },
                { order: { orderNo: { contains: q, mode: "insensitive" } } },
                { order: { company: { contains: q, mode: "insensitive" } } },
                { order: { jobName: { contains: q, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
      include: {
        order: {
          select: { id: true, orderNo: true, company: true, jobName: true, receivedAt: true, dueAt: true },
        },
        processCode: { select: { id: true, code: true } },
        owner: { select: { id: true, name: true, email: true } },
        _count: { select: { substrateReceipts: { where: { deletedAt: null } } } },
      },
      // PostgreSQL 은 ASC 에서 NULL 을 마지막에 두므로 미정 공정이 자연히 뒤로 간다
      orderBy: [{ plannedStart: "asc" }, { id: "asc" }],
      take: 300,
    });

    // owner 이메일은 본인 여부 판정에만 쓰고 응답에서는 제거한다
    return NextResponse.json(
      items.map((p) => ({
        id: p.id,
        sequence: p.sequence,
        detail: p.detail,
        qty: p.qty,
        plannedStart: p.plannedStart,
        durationHours: p.durationHours,
        status: p.status,
        location: p.location,
        memo: p.memo,
        syncStatus: p.syncStatus,
        order: p.order,
        processCode: p.processCode,
        owner: p.owner ? { id: p.owner.id, name: p.owner.name } : null,
        mine: !!p.owner?.email && p.owner.email.toLowerCase() === myEmail,
        receiptCount: p._count.substrateReceipts,
      })),
    );
  } catch (e) {
    console.error("processes list failed:", e);
    return NextResponse.json({ error: "공정 목록을 불러오지 못했습니다." }, { status: 500 });
  }
}
