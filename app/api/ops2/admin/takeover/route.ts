import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminSession, requireSession } from "@/lib/auth-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/ops2/admin/takeover {equipment} — admin 강제 인수: 주인 실행(holder)을 비운다.
// 다음에 먼저 ingest 한 실행이 주인이 된다(지금 주인이 살아 있으면 1 s 안에 다시 잡을 수 있다).
export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  if (!isAdminSession(auth.session)) {
    return NextResponse.json({ error: "관리자만 할 수 있습니다." }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const equipment: string = typeof body?.equipment === "string" ? body.equipment : "";
  const who = auth.session.user?.email ?? auth.session.user?.name ?? "unknown";

  const now = new Date();
  const r = await prisma.$transaction(async (tx) => {
    const dev = await tx.ops2Device.findUnique({ where: { equipment }, select: { holderInstance: true } });
    if (!dev) return null;
    await tx.ops2Device.update({ where: { equipment }, data: { holderInstance: null, holderSeenAt: null } });
    await tx.ops2Event.create({
      data: {
        msgId: `web-${randomUUID().replace(/-/g, "")}`, equipment, instance: dev.holderInstance ?? "-",
        ts: now, receivedAt: now, level: "warn", code: "HOLDER_CLEARED",
        message: `강제 인수 — 주인 실행 ${dev.holderInstance?.slice(0, 8) ?? "없음"} 을 비움(${who})`,
        source: "web", kind: "takeover", context: { from: dev.holderInstance, by: who },
      },
    });
    return { cleared: dev.holderInstance };
  });
  if (!r) return NextResponse.json({ error: "없는 장비입니다." }, { status: 404 });
  return NextResponse.json({ ok: true, cleared: r.cleared });
}
