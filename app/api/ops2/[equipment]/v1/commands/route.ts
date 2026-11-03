import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-helpers";
import { ops2Db } from "@/lib/ops2/db";
import { enabledDevice, limitOf } from "@/lib/ops2/browser";
import { expireDue } from "@/lib/ops2/commands";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/ops2/[equipment]/v1/commands?limit=20 — 최근 명령(웹·노트북), 새것부터. 읽기 전에 만료된 pending 을 정리한다.
export async function GET(req: NextRequest, { params }: { params: Promise<{ equipment: string }> }) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  const { equipment } = await params;
  if (!(await enabledDevice(equipment))) return NextResponse.json({ error: "unknown_device" }, { status: 404 });

  await expireDue(equipment, new Date());
  const commands = await ops2Db.ops2Command.findMany({
    where: { equipment },
    orderBy: { requestedAt: "desc" },
    take: limitOf(req.nextUrl.searchParams.get("limit"), 20, 100),
    select: {
      id: true, origin: true, kind: true, label: true, args: true, requestedBy: true, requestedAt: true, status: true,
      sentVia: true, sendCount: true, sentAt: true, resultReceivedAt: true, reasonCode: true, detail: true,
    },
  });
  return NextResponse.json({ commands });
}
