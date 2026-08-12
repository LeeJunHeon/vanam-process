import fs from "fs/promises";
import path from "path";
import { uploadDir } from "@/lib/uploadDir";

// 기판 사진 저장 규칙을 한 곳에서 관리한다.
// 폴더 구조를 바꿀 일이 생기면 이 파일만 수정하면 된다.
const ROOT = "substrate";

// substrate/YYYY/MM — 한 폴더에 파일이 수천 개 쌓이는 것을 방지
function monthDir(at: Date = new Date()): string {
  return `${ROOT}/${at.getFullYear()}/${String(at.getMonth() + 1).padStart(2, "0")}`;
}

export type SavedPhoto = {
  originalName: string;
  storedPath: string;
  fileSize: number;
  mimeType: string | null;
};

// 사진 1장 저장 후 DB에 넣을 메타데이터를 반환한다.
export async function savePhoto(file: File): Promise<SavedPhoto> {
  const dir = monthDir();
  await fs.mkdir(path.join(uploadDir(), dir), { recursive: true });

  // 한글 파일명·중복 회피를 위해 UUID로 저장. 원본명은 DB에 따로 보관.
  const ext = path.extname(file.name) || ".jpg";
  const key = `${dir}/${crypto.randomUUID()}${ext}`;

  await fs.writeFile(
    path.join(uploadDir(), key),
    Buffer.from(await file.arrayBuffer()),
  );

  return {
    originalName: file.name,
    storedPath: key,
    fileSize: file.size,
    mimeType: file.type || null,
  };
}

// 사진 파일 읽기 (스트리밍용)
export async function readPhoto(
  storedPath: string,
): Promise<Buffer<ArrayBuffer>> {
  return fs.readFile(path.join(uploadDir(), storedPath));
}

// 사진 파일 삭제. 이미 없는 파일은 조용히 무시한다
// (파일이 없다고 DB 삭제까지 막으면 정리가 불가능해지므로).
export async function deletePhotos(storedPaths: string[]): Promise<void> {
  for (const p of storedPaths) {
    try {
      await fs.unlink(path.join(uploadDir(), p));
    } catch {
      // 이미 삭제됨 — 무시
    }
  }
}
