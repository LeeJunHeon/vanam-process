import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-helpers";
import { readPhoto } from "@/lib/photoStorage";

export const runtime = "nodejs";

// GET /api/photos/[id]/file[?download=1] — 사진 스트리밍
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const _auth = await requireSession();
  if (!_auth.ok) return _auth.response;

  try {
    const { id } = await params;
    const row = await prisma.substratePhoto.findUnique({
      where: { id: Number(id) },
    });
    if (!row) {
      return NextResponse.json({ error: "사진을 찾을 수 없습니다." }, { status: 404 });
    }

    const buf = await readPhoto(row.storedPath);
    const { searchParams } = new URL(request.url);
    const download = searchParams.get("download") === "1";

    return new NextResponse(buf, {
      headers: {
        "Content-Type": row.mimeType || "image/jpeg",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(row.originalName)}`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "사진을 불러오지 못했습니다." }, { status: 500 });
  }
}
