// 브라우저가 직접 로드하는 자산 URL(<img src> 등)에 basePath를 접두어로 붙인다.
// fetch는 BasePathFetch 래퍼가 보정하지만, <img>/<video> 등은 별도 접두어가 필요하다.
// NEXT_PUBLIC_BASE_PATH 가 비어 있으면 경로를 그대로 반환한다(무동작).
export function assetPath(path: string): string {
  const bp = process.env.NEXT_PUBLIC_BASE_PATH || "";
  if (!path.startsWith("/") || path.startsWith("//")) return path;
  return bp + path;
}
