import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ops2Db } from "@/lib/ops2/db";
import { isAdminSession, requireSession } from "@/lib/auth-helpers";
import { eventEnvelope, publishBrowser } from "@/lib/ops2/hub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/ops2/admin/devices/[equipment]/enabled {enabled: boolean} — 장비 '사용' 켜기·끄기(W-24 A, 관리자만).
// 끈 장비(enabled false)는 지금 규칙 그대로: 장비 화면·운전 대시보드 목록(/api/ops2/devices)에서 빠지고, 장비 화면 API·
// 장비 보고(ingest·stream·recipes)도 받지 않는다. 기록·설정 행은 지우지 않는다(다시 켜면 그대로). 바꾼 사람·시각을 사건 한 줄로.
export async function POST(req: NextRequest, { params }: { params: Promise<{ equipment: string }> }) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  if (!isAdminSession(auth.session)) {
    return NextResponse.json({ error: "관리자만 할 수 있습니다." }, { status: 403 });
  }
  const { equipment } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "enabled(true·false)가 필요합니다." }, { status: 400 });
  }
  const enabled: boolean = body.enabled;
  const who = auth.session.user?.email ?? auth.session.user?.name ?? "unknown";
  const now = new Date();

  const out = await ops2Db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ enabled: boolean; holder_instance: string | null }[]>`
      SELECT enabled, holder_instance FROM "process"."ops2_device" WHERE equipment = ${equipment} FOR UPDATE`;
    if (!rows.length) return undefined;
    if (rows[0].enabled === enabled) return { changed: false, ev: null };
    await tx.ops2Device.update({ where: { equipment }, data: { enabled } });
    const ev = await tx.ops2Event.create({
      data: {
        msgId: `web-${randomUUID().replace(/-/g, "")}`, equipment, instance: rows[0].holder_instance ?? "-", seq: 0, ts: now,
        receivedAt: now, level: "info", code: enabled ? "DEVICE_ENABLED" : "DEVICE_DISABLED",
        message: `장비 사용을 ${enabled ? "켰습니다" : "껐습니다"}(${who})`,
        source: "web", kind: "device_enabled", context: { data: { enabled, by: who } },
      },
    });
    return { changed: true, ev };
  });
  if (out === undefined) return NextResponse.json({ error: "없는 장비입니다." }, { status: 404 });
  if (out.ev) publishBrowser(equipment, [eventEnvelope(out.ev)]);
  return NextResponse.json({ ok: true, enabled, changed: out.changed });
}
