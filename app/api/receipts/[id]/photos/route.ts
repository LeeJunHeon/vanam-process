import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, canModify } from "@/lib/auth-helpers";
import { savePhoto } from "@/lib/photoStorage";
import {
  logActivity,
  toState,
  currentPhotoIds,
  RECEIPT_PROCESS_INCLUDE,
} from "@/lib/activity";

export const runtime = "nodejs";

// GET /api/receipts/[id]/photos — 뗀 사진까지 포함한 전체 사진 목록 (이력 조회용)
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const _auth = await requireSession();
  if (!_auth.ok) return _auth.response;

  try {
    const { id } = await params;
    const photos = await prisma.substratePhoto.findMany({
      where: { receiptId: Number(id) },
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        createdAt: true,
        deletedAt: true,
        deletedByEmail: true,
      },
      orderBy: { id: "asc" },
    });
    return NextResponse.json(photos);
  } catch {
    return NextResponse.json(
      { error: "사진 목록을 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}

// POST /api/receipts/[id]/photos (multipart) — 기존 기록에 사진 추가
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const _auth = await requireSession();
  if (!_auth.ok) return _auth.response;

  try {
    const { id } = await params;
    const row = await prisma.substrateReceipt.findUnique({
      where: { id: Number(id) },
      include: RECEIPT_PROCESS_INCLUDE,
    });
    if (!row) {
      return NextResponse.json({ error: "기록을 찾을 수 없습니다." }, { status: 404 });
    }
    if (row.deletedAt) {
      return NextResponse.json(
        { error: "삭제된 기록에는 사진을 추가할 수 없습니다." },
        { status: 400 },
      );
    }
    if (!canModify(_auth.session, row.createdByEmail)) {
      return NextResponse.json(
        { error: "본인이 등록한 기록만 수정할 수 있습니다." },
        { status: 403 },
      );
    }

    const form = await request.formData();
    const files = form.getAll("photos").filter((f): f is File => f instanceof File);
    if (files.length === 0) {
      return NextResponse.json({ error: "사진이 없습니다." }, { status: 400 });
    }

    const beforeIds = await currentPhotoIds(row.id);

    for (const file of files) {
      const saved = await savePhoto(file);
      await prisma.substratePhoto.create({
        data: { receiptId: row.id, ...saved },
      });
    }

    const afterIds = await currentPhotoIds(row.id);
    await logActivity(
      _auth.session,
      "update",
      row.id,
      `${row.manager} 사진 ${files.length}장 추가`,
      { state: toState(row, afterIds), before: toState(row, beforeIds) },
    );
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "사진 추가에 실패했습니다." }, { status: 500 });
  }
}
