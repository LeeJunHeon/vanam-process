import { assetPath } from "@/lib/assetPath";

// 기판 사진 주소. size 없음 = 원본, thumb = 목록용 작은 사진(긴 변 320px), medium = 크게 보기(1600px).
// 서버 변환 코드(lib/photoDerived)는 sharp 를 쓰므로 화면에서는 이 파일만 쓴다.
export function photoUrl(id: number, size?: "thumb" | "medium"): string {
  return assetPath(`/api/photos/${id}/file${size ? `?size=${size}` : ""}`);
}
