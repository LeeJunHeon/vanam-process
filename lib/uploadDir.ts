import path from "path";

// 기판 사진 저장 루트. env UPLOAD_DIR 없으면 <프로젝트루트>/uploads.
// 운영에서는 Docker 볼륨으로 NAS의 /volume1/docker/process-web/uploads 가 마운트된다.
export function uploadDir() {
  return process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
}
