import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Edge Runtime용 — Prisma 미포함 authConfig만 사용
const { auth } = NextAuth(authConfig);
const isLocal =
  !process.env.NEXTAUTH_URL || process.env.NEXTAUTH_URL.includes("localhost");
const disableAuth = process.env.DISABLE_AUTH === "true"; // 로컬 UI 확인용. 운영 금지.

export default auth((req: NextRequest & { auth: any }) => {
  const bp = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const pathname =
    bp && req.nextUrl.pathname.startsWith(bp)
      ? req.nextUrl.pathname.slice(bp.length) || "/"
      : req.nextUrl.pathname;

  if (disableAuth) return NextResponse.next(); // 로컬 우회

  if (pathname.startsWith("/api/auth")) return NextResponse.next();
  if (pathname.startsWith("/login")) return NextResponse.next();

  // 포털 대시보드 카드용 cross-origin API — route 핸들러가 자체 인증/CORS 처리
  if (pathname === "/api/portal-summary") return NextResponse.next();

  // 장비 리포터 수집 API — 세션이 아닌 Bearer 토큰(OPS_INGEST_TOKEN) 인증.
  // route 핸들러가 자체 검증하므로 미들웨어 세션 검사에서 제외한다.
  if (pathname === "/api/ops/ingest") return NextResponse.next();

  // /api/* 미인증 시 401 JSON
  if (pathname.startsWith("/api/")) {
    if (!req.auth?.user)
      return NextResponse.json(
        { error: "로그인이 필요합니다." },
        { status: 401 },
      );
    return NextResponse.next();
  }

  // 정적 자산(아이콘, manifest 등)은 인증 없이 통과.
  // ★ 반드시 /api/ 블록보다 "뒤"에 둘 것.
  //   앞에 두면 .json 등으로 끝나는 API 경로가 인증을 우회한다.
  if (/\.(?:json|js|png|jpg|jpeg|gif|svg|ico|webmanifest)$/.test(pathname))
    return NextResponse.next();

  // 페이지 라우트 미인증 시 포털 로그인으로
  if (!req.auth?.user) {
    return NextResponse.redirect(
      new URL("/login", isLocal ? req.url : "https://vanam.synology.me"),
    );
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/api/((?!auth).*)", "/((?!_next/static|_next/image|favicon.ico).*)"],
};
