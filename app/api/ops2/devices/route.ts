import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-helpers";
import { ops2Db } from "@/lib/ops2/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/ops2/devices — 장비 화면에서 고를 수 있는 장비(enabled), 로그인한 누구나.
export async function GET() {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  const devices = await ops2Db.ops2Device.findMany({
    where: { enabled: true },
    orderBy: { equipment: "asc" },
    select: { equipment: true, label: true, runMode: true },
  });
  return NextResponse.json({ devices });
}
