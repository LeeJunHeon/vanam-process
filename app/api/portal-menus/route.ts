import { NextResponse } from "next/server";
import { requireSession, isAdminSession } from "@/lib/auth-helpers";
import { visibleMenus } from "@/lib/navMenu";

export const runtime = "nodejs";

// GET /api/portal-menus — 포털 런처용 메뉴 목록.
// 로그인한 사용자가 사이드바에서 볼 수 있는 메뉴만, 사이드바 순서(업무 → 운전)로 돌려준다.
export async function GET() {
  const _auth = await requireSession();
  if (!_auth.ok) return _auth.response;

  const menus = visibleMenus(isAdminSession(_auth.session)).map((m) => ({
    page: m.key,
    label: m.label,
    icon: m.icon,
    adminOnly: !!m.adminOnly,
  }));

  return NextResponse.json(
    { app: "process", menus },
    { headers: { "Cache-Control": "no-store" } },
  );
}
