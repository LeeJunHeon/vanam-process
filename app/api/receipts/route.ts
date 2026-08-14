import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-helpers";
import { savePhoto } from "@/lib/photoStorage";
import {
  logActivity,
  toState,
  currentPhotoIds,
  managerFromSession,
  RECEIPT_PROCESS_INCLUDE,
} from "@/lib/activity";

export const runtime = "nodejs"; // Prisma·fs는 edge 불가

// GET /api/receipts?q= — 기판 반입 기록 목록 (사진 포함)
export async function GET(request: Request) {
  const _auth = await requireSession();
  if (!_auth.ok) return _auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim();

    const items = await prisma.substrateReceipt.findMany({
      where: {
        // 소프트 삭제된 기록은 목록에서 제외
        deletedAt: null,
        ...(searchParams.get("orderProcessId")
          ? { orderProcessId: Number(searchParams.get("orderProcessId")) }
          : {}),
        ...(q
          ? {
              OR: [
                { manager: { contains: q, mode: "insensitive" } },
                { source: { contains: q, mode: "insensitive" } },
                { clientName: { contains: q, mode: "insensitive" } },
                { memo: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: {
        ...RECEIPT_PROCESS_INCLUDE,
        photos: {
          // 뗀 사진은 목록에 보이지 않는다 (이력에서만 조회 가능)
          where: { deletedAt: null },
          select: { id: true, originalName: true, mimeType: true },
          orderBy: { id: "asc" },
        },
      },
      orderBy: { receivedAt: "desc" },
      take: 300,
    });

    return NextResponse.json(items);
  } catch {
    return NextResponse.json(
      { error: "목록을 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}

// POST /api/receipts (multipart) — 기록 등록 + 사진 저장 (사진 1장 이상 필수)
export async function POST(request: Request) {
  const _auth = await requireSession();
  if (!_auth.ok) return _auth.response;

  try {
    const form = await request.formData();
    const receivedAtRaw = form.get("receivedAt");
    const sourceRaw = form.get("source");
    const clientNameRaw = form.get("clientName");
    const memoRaw = form.get("memo");
    const files = form.getAll("photos").filter((f): f is File => f instanceof File);

    if (typeof receivedAtRaw !== "string" || !receivedAtRaw) {
      return NextResponse.json({ error: "날짜는 필수입니다." }, { status: 400 });
    }
    if (files.length === 0) {
      return NextResponse.json(
        { error: "기판 사진은 최소 1장 이상 필요합니다." },
        { status: 400 },
      );
    }

    const orderProcessIdRaw = form.get("orderProcessId");
    let orderProcessId: number | null = null;
    if (typeof orderProcessIdRaw === "string" && orderProcessIdRaw !== "") {
      orderProcessId = Number(orderProcessIdRaw);
      if (!Number.isInteger(orderProcessId) || orderProcessId <= 0) {
        return NextResponse.json({ error: "공정 값이 올바르지 않습니다." }, { status: 400 });
      }
      // 담당자 본인만 자기 공정에 기록할 수 있다 (관리자도 예외 없음 — 증거는 작업자 본인이 남긴다)
      const proc = await prisma.workOrderProcess.findUnique({
        where: { id: orderProcessId },
        include: {
          order: { select: { deletedAt: true } },
          owner: { select: { email: true } },
        },
      });
      if (!proc || proc.deletedAt || proc.order.deletedAt) {
        return NextResponse.json({ error: "공정을 찾을 수 없습니다." }, { status: 404 });
      }
      const myEmail = (_auth.session.user?.email ?? "").toLowerCase();
      if (!proc.owner?.email || proc.owner.email.toLowerCase() !== myEmail) {
        return NextResponse.json(
          { error: "본인이 담당한 공정에만 기판 사진을 기록할 수 있습니다." },
          { status: 403 },
        );
      }
    }

    const email = _auth.session.user?.email ?? "unknown";
    // 담당자는 로그인 사용자로 고정한다. 클라이언트가 보낸 값은 신뢰하지 않는다.
    const manager = managerFromSession(_auth.session);

    // 1) 기록 생성
    const created = await prisma.substrateReceipt.create({
      include: RECEIPT_PROCESS_INCLUDE,
      data: {
        orderProcessId,
        receivedAt: new Date(receivedAtRaw),
        manager,
        source: typeof sourceRaw === "string" && sourceRaw.trim() ? sourceRaw.trim() : null,
        clientName:
          typeof clientNameRaw === "string" && clientNameRaw.trim()
            ? clientNameRaw.trim()
            : null,
        memo: typeof memoRaw === "string" && memoRaw.trim() ? memoRaw.trim() : null,
        createdByEmail: email,
      },
    });

    // 2) 사진 저장 — 저장 규칙은 lib/photoStorage 가 담당
    for (const file of files) {
      const saved = await savePhoto(file);
      await prisma.substratePhoto.create({
        data: { receiptId: created.id, ...saved },
      });
    }

    const photoIds = await currentPhotoIds(created.id);
    await logActivity(
      _auth.session,
      "create",
      created.id,
      `${created.manager} · 사진 ${files.length}장`,
      { state: toState(created, photoIds) },
    );

    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    console.error("receipt create failed:", e);
    return NextResponse.json(
      { error: "등록에 실패했습니다." },
      { status: 500 },
    );
  }
}
