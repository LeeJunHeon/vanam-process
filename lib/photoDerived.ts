import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { uploadDir } from "@/lib/uploadDir";

// 기판 사진의 축소본(썸네일·중간 크기). 원본은 건드리지 않고
// <uploadDir>/derived/<size>/<storedPath>.jpg 에 한 번 만들어 두고 다시 쓴다.

// NAS 메모리가 작으므로 동시에 한 장씩, libvips 캐시 없이 처리한다
sharp.concurrency(1);
sharp.cache(false);

export type PhotoSize = "thumb" | "medium";

const SPEC: Record<PhotoSize, { px: number; quality: number }> = {
  thumb: { px: 320, quality: 75 },
  medium: { px: 1600, quality: 82 },
};

export function parsePhotoSize(v: string | null): PhotoSize | null {
  return v === "thumb" || v === "medium" ? v : null;
}

// root 아래로만 경로를 만든다. storedPath 가 root 밖을 가리키면(../ 등) null.
function inside(root: string, rel: string): string | null {
  const full = path.resolve(root, rel);
  return full.startsWith(root + path.sep) ? full : null;
}

/** 원본 → 축소 JPEG(EXIF 방향 반영, 확대하지 않음). */
export async function renderPhoto(src: string | Buffer, size: PhotoSize): Promise<Buffer> {
  const { px, quality } = SPEC[size];
  return sharp(src)
    .rotate()
    .resize({ width: px, height: px, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();
}

/**
 * 축소본을 돌려준다. 캐시 파일이 있으면 그대로 읽고, 없으면 만들어 저장한다.
 * 변환할 수 없으면(이미지가 아님·HEIC 등) 로그만 남기고 null — 호출부가 원본을 준다.
 */
export async function readDerivedPhoto(
  storedPath: string,
  size: PhotoSize,
  root: string = uploadDir(),
): Promise<Buffer | null> {
  const base = path.resolve(root);
  const src = inside(base, storedPath);
  const dest = inside(path.join(base, "derived", size), `${storedPath}.jpg`);
  if (!src || !dest) {
    console.error(`photo derive skipped (bad path): ${storedPath}`);
    return null;
  }

  try {
    return await fs.readFile(dest);
  } catch {
    // 캐시 없음 → 아래에서 만든다
  }

  let out: Buffer;
  try {
    out = await renderPhoto(src, size);
  } catch (e) {
    console.error(`photo derive failed (${size}): ${storedPath}`, e);
    return null;
  }

  // 임시 파일에 다 쓴 뒤 rename — 동시 요청이 반쯤 쓴 파일을 읽지 않게 한다.
  // 저장에 실패해도 만든 결과는 그대로 돌려준다.
  const tmp = `${dest}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(tmp, out);
    await fs.rename(tmp, dest);
  } catch (e) {
    console.error(`photo derive cache write failed: ${dest}`, e);
    await fs.unlink(tmp).catch(() => {});
  }
  return out;
}
