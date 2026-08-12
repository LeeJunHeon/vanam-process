import type { NextConfig } from "next";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  output: "standalone",
  ...(basePath ? { basePath } : {}),
  // 기판 사진 업로드 대비 요청 본문 버퍼 한도 상향 (기본 10MB)
  experimental: {
    proxyClientMaxBodySize: "100mb",
  },
};

export default nextConfig;
