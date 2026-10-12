import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-helpers";
import { readPhoto } from "@/lib/photoStorage";
import { parsePhotoSize, readDerivedPhoto } from "@/lib/photoDerived";

export const runtime = "nodejs";

// GET /api/photos/[id]/file[?download=1][&size=thumb|medium] — 사진 스트리밍
// size 없음(또는 original) = 원본. thumb(긴 변 320px)·medium(1600px) 은 디스크 캐시된 JPEG.
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

    const { searchParams } = new URL(request.url);

    // 축소본 — 이미지가 아니거나 변환에 실패하면 아래 원본 응답으로 넘어간다
    const size = parsePhotoSize(searchParams.get("size"));
    if (size && (!row.mimeType || row.mimeType.startsWith("image/"))) {
      const derived = await readDerivedPhoto(row.storedPath, size);
      if (derived) {
        return new NextResponse(new Uint8Array(derived), {
          headers: {
            "Content-Type": "image/jpeg",
            // 사진 내용은 id 별로 바뀌지 않는다
            "Cache-Control": "private, max-age=31536000, immutable",
          },
        });
      }
    }

    const buf = await readPhoto(row.storedPath);
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
