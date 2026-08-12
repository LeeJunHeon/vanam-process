import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, canModify } from "@/lib/auth-helpers";
import { logActivity } from "@/lib/activity";

export const runtime = "nodejs";

// DELETE /api/photos/[id] — 사진 떼어내기 (파일은 보존, 목록에서만 숨김)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const _auth = await requireSession();
  if (!_auth.ok) return _auth.response;

  try {
    const { id } = await params;
    const photo = await prisma.substratePhoto.findUnique({
      where: { id: Number(id) },
      include: { receipt: true },
    });
    if (!photo) {
      return NextResponse.json({ error: "사진을 찾을 수 없습니다." }, { status: 404 });
    }
    if (photo.deletedAt) {
      return NextResponse.json({ error: "이미 삭제된 사진입니다." }, { status: 400 });
    }
    if (!canModify(_auth.session, photo.receipt.createdByEmail)) {
      return NextResponse.json(
        { error: "본인이 등록한 기록만 수정할 수 있습니다." },
        { status: 403 },
      );
    }

    // 마지막 남은 사진은 뗄 수 없다 (사진 필수 규칙 유지)
    const remaining = await prisma.substratePhoto.count({
      where: { receiptId: photo.receiptId, deletedAt: null },
    });
    if (remaining <= 1) {
      return NextResponse.json(
        { error: "사진은 최소 1장 남아 있어야 합니다." },
        { status: 400 },
      );
    }

    await prisma.substratePhoto.update({
      where: { id: photo.id },
      data: {
        deletedAt: new Date(),
        deletedByEmail: _auth.session.user?.email ?? "unknown",
      },
    });

    await logActivity(
      _auth.session,
      "update",
      photo.receiptId,
      `사진 제외: ${photo.originalName}`,
    );
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "사진 삭제에 실패했습니다." }, { status: 500 });
  }
}
