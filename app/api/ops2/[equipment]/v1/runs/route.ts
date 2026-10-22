import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-helpers";
import { ops2Db } from "@/lib/ops2/db";
import { enabledDevice, limitOf } from "@/lib/ops2/browser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/ops2/[equipment]/v1/runs?limit=10 — 최근 공정(시작·끝·결과·사유·이름), 시작이 늦은 것부터.
export async function GET(req: NextRequest, { params }: { params: Promise<{ equipment: string }> }) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  const { equipment } = await params;
  if (!(await enabledDevice(equipment))) return NextResponse.json({ error: "unknown_device" }, { status: 404 });

  const runs = await ops2Db.ops2Run.findMany({
    where: { equipment },
    orderBy: { startedAt: { sort: "desc", nulls: "last" } },
    take: limitOf(req.nextUrl.searchParams.get("limit"), 10, 100),
    select: {
      runId: true, name: true, recipeName: true, startedBy: true, stepNo: true, startedAt: true, endedAt: true,
      result: true, reasonCode: true,
    },
  });
  return NextResponse.json({ runs });
}
