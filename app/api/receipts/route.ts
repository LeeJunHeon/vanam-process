import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-helpers";
import { uploadDir } from "@/lib/uploadDir";
import { logActivity } from "@/lib/activity";

export const runtime = "nodejs"; // Prisma·fs는 edge 불가

// GET /api/receipts?q= — 기판 반입 기록 목록 (사진 포함)
export async function GET(request: Request) {
  const _auth = await requireSession();
  if (!_auth.ok) return _auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim();

    const items = await prisma.substrateReceipt.findMany({
      where: q
        ? {
            OR: [
              { manager: { contains: q, mode: "insensitive" } },
              { source: { contains: q, mode: "insensitive" } },
              { clientName: { contains: q, mode: "insensitive" } },
              { memo: { contains: q, mode: "insensitive" } },
            ],
          }
        : undefined,
      include: {
        photos: {
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
    const manager = form.get("manager");
    const sourceRaw = form.get("source");
    const clientNameRaw = form.get("clientName");
    const memoRaw = form.get("memo");
    const files = form.getAll("photos").filter((f): f is File => f instanceof File);

    if (typeof receivedAtRaw !== "string" || !receivedAtRaw) {
      return NextResponse.json({ error: "날짜는 필수입니다." }, { status: 400 });
    }
    if (typeof manager !== "string" || !manager.trim()) {
      return NextResponse.json({ error: "담당자는 필수입니다." }, { status: 400 });
    }
    if (files.length === 0) {
      return NextResponse.json(
        { error: "기판 사진은 최소 1장 이상 필요합니다." },
        { status: 400 },
      );
    }

    const email = _auth.session.user?.email ?? "unknown";

    // 1) 기록 생성
    const created = await prisma.substrateReceipt.create({
      data: {
        receivedAt: new Date(receivedAtRaw),
        manager: manager.trim(),
        source: typeof sourceRaw === "string" && sourceRaw.trim() ? sourceRaw.trim() : null,
        clientName:
          typeof clientNameRaw === "string" && clientNameRaw.trim()
            ? clientNameRaw.trim()
            : null,
        memo: typeof memoRaw === "string" && memoRaw.trim() ? memoRaw.trim() : null,
        createdByEmail: email,
      },
    });

    // 2) 사진 저장 (연월 폴더로 분산)
    const now = new Date();
    const dir = `substrate/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}`;
    await fs.mkdir(path.join(uploadDir(), dir), { recursive: true });

    for (const file of files) {
      const ext = path.extname(file.name) || ".jpg";
      const key = `${dir}/${crypto.randomUUID()}${ext}`;
      await fs.writeFile(
        path.join(uploadDir(), key),
        Buffer.from(await file.arrayBuffer()),
      );
      await prisma.substratePhoto.create({
        data: {
          receiptId: created.id,
          originalName: file.name,
          storedPath: key,
          fileSize: file.size,
          mimeType: file.type || null,
        },
      });
    }

    await logActivity(
      _auth.session,
      "create",
      created.id,
      `${created.manager} · 사진 ${files.length}장`,
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
