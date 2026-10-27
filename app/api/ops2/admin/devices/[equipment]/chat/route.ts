import { NextRequest, NextResponse } from "next/server";
import { isAdminSession, requireSession } from "@/lib/auth-helpers";
import { retryFailed } from "@/lib/ops2/chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/ops2/admin/devices/[equipment]/chat {action: "retry", id} — 구글챗 알림 실패(failed)를 다시 보내기(관리자만).
// 처음처럼 queued(tries 0) — 보내기 타이머가 곧 하나씩 보낸다.
export async function POST(req: NextRequest, { params }: { params: Promise<{ equipment: string }> }) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  if (!isAdminSession(auth.session)) {
    return NextResponse.json({ error: "관리자만 할 수 있습니다." }, { status: 403 });
  }
  const { equipment } = await params;
  const body = (await req.json().catch(() => null)) as { action?: unknown; id?: unknown } | null;
  if (body?.action !== "retry" || typeof body.id !== "number" || !Number.isInteger(body.id)) {
    return NextResponse.json({ error: "action 은 retry, id 는 정수" }, { status: 400 });
  }
  const ok = await retryFailed(equipment, body.id);
  if (!ok) return NextResponse.json({ error: "실패(failed) 상태인 그 장비의 알림이 아닙니다." }, { status: 409 });
  return NextResponse.json({ ok: true });
}
