import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, canModify } from "@/lib/auth-helpers";
import { logActivity } from "@/lib/activity";

export const runtime = "nodejs";

// PATCH /api/receipts/[id] — 본문 정보 수정 (사진은 이 API에서 다루지 않음)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const _auth = await requireSession();
  if (!_auth.ok) return _auth.response;

  try {
    const { id } = await params;
    const row = await prisma.substrateReceipt.findUnique({
      where: { id: Number(id) },
    });
    if (!row) {
      return NextResponse.json({ error: "기록을 찾을 수 없습니다." }, { status: 404 });
    }
    if (row.deletedAt) {
      return NextResponse.json(
        { error: "삭제된 기록은 수정할 수 없습니다." },
        { status: 400 },
      );
    }
    if (!canModify(_auth.session, row.createdByEmail)) {
      return NextResponse.json(
        { error: "본인이 등록한 기록만 수정할 수 있습니다." },
        { status: 403 },
      );
    }

    const body = await request.json();
    const updated = await prisma.substrateReceipt.update({
      where: { id: row.id },
      data: {
        receivedAt: body.receivedAt ? new Date(body.receivedAt) : undefined,
        manager: typeof body.manager === "string" ? body.manager.trim() : undefined,
        source: typeof body.source === "string" ? body.source.trim() || null : undefined,
        clientName:
          typeof body.clientName === "string" ? body.clientName.trim() || null : undefined,
        memo: typeof body.memo === "string" ? body.memo.trim() || null : undefined,
      },
    });

    await logActivity(_auth.session, "update", updated.id, `${updated.manager} 기록 수정`);
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "수정에 실패했습니다." }, { status: 500 });
  }
}

// DELETE /api/receipts/[id] — 소프트 삭제 (사진 파일은 보존)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const _auth = await requireSession();
  if (!_auth.ok) return _auth.response;

  try {
    const { id } = await params;
    const row = await prisma.substrateReceipt.findUnique({
      where: { id: Number(id) },
      include: { photos: true },
    });
    if (!row) {
      return NextResponse.json({ error: "기록을 찾을 수 없습니다." }, { status: 404 });
    }
    if (row.deletedAt) {
      return NextResponse.json({ error: "이미 삭제된 기록입니다." }, { status: 400 });
    }
    if (!canModify(_auth.session, row.createdByEmail)) {
      return NextResponse.json(
        { error: "본인이 등록한 기록만 삭제할 수 있습니다." },
        { status: 403 },
      );
    }

    // 증거 보존: DB 행도 사진 파일도 지우지 않고 삭제 표시만 남긴다.
    await prisma.substrateReceipt.update({
      where: { id: row.id },
      data: {
        deletedAt: new Date(),
        deletedByEmail: _auth.session.user?.email ?? "unknown",
      },
    });

    await logActivity(
      _auth.session,
      "delete",
      row.id,
      `${row.manager} 기록 삭제 (사진 ${row.photos.length}장 보존)`,
    );
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "삭제에 실패했습니다." }, { status: 500 });
  }
}
