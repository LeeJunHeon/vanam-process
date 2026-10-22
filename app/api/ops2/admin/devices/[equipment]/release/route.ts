import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminSession, requireSession } from "@/lib/auth-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/ops2/admin/devices/[equipment]/release — 강제 인수(관리자만): 주인 실행을 비운다.
// 다음에 먼저 ingest 한 실행이 주인이 된다(지금 주인이 살아 있으면 다음 POST 에서 다시 잡는다).
export async function POST(_req: NextRequest, { params }: { params: Promise<{ equipment: string }> }) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  if (!isAdminSession(auth.session)) {
    return NextResponse.json({ error: "관리자만 할 수 있습니다." }, { status: 403 });
  }
  const { equipment } = await params;
  const who = auth.session.user?.email ?? auth.session.user?.name ?? "unknown";
  const now = new Date();

  const prev = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ holder_instance: string | null }[]>`
      SELECT holder_instance FROM "process"."ops2_device" WHERE equipment = ${equipment} FOR UPDATE`;
    if (!rows.length) return undefined;
    const from = rows[0].holder_instance;
    await tx.ops2Device.update({ where: { equipment }, data: { holderInstance: null, holderSeenAt: null } });
    await tx.ops2Event.create({
      data: {
        msgId: `web-${randomUUID().replace(/-/g, "")}`, equipment, instance: from ?? "-", seq: 0, ts: now,
        receivedAt: now, level: "info", code: "INSTANCE_RELEASED",
        message: `주인 실행 ${from?.slice(0, 8) ?? "없음"} 을 비움(강제 인수, ${who})`,
        source: "web", kind: "lease", context: { from, by: who },
      },
    });
    return from;
  });
  if (prev === undefined) return NextResponse.json({ error: "없는 장비입니다." }, { status: 404 });
  return NextResponse.json({ ok: true, released: prev });
}
