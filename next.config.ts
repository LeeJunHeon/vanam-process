import type { NextConfig } from "next";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  output: "standalone",
  ...(basePath ? { basePath } : {}),
  // 기판 사진 축소본(sharp) — 번들하지 않고 Node require 로 써야 standalone 이 @img/sharp-* 바이너리를 함께 추적한다
  serverExternalPackages: ["sharp"],
  // 기판 사진 업로드 대비 요청 본문 버퍼 한도 상향 (기본 10MB)
  experimental: {
    proxyClientMaxBodySize: "100mb",
  },
};

export default nextConfig;
