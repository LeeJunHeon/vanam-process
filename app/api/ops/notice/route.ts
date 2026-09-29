import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/ops/notice — 장비 알림 확인 처리.
// 확인하면 모든 사용자 화면에서 사라지므로 누가 확인했는지 함께 기록한다.
export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const raw: unknown[] = Array.isArray(body?.ids)
    ? body.ids
    : body?.id !== undefined ? [body.id] : [];
  const ids = raw
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, 50);
  if (!ids.length) {
    return NextResponse.json({ error: "확인할 알림이 없습니다." }, { status: 400 });
  }

  const who = auth.session.user?.email ?? auth.session.user?.name ?? "unknown";

  // 이미 확인된 건은 건드리지 않는다(최초 확인자를 남긴다).
  const res = await prisma.opsNotice.updateMany({
    where: { id: { in: ids }, ackedAt: null },
    data: { ackedBy: who, ackedAt: new Date() },
  });

  return NextResponse.json({ ok: true, acked: res.count });
}
