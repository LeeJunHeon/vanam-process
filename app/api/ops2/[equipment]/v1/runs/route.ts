import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-helpers";
import { ops2Db } from "@/lib/ops2/db";
import { enabledDevice, limitOf } from "@/lib/ops2/browser";
import { CH12_CHAMBERS, isCh12 } from "@/lib/ops2/ch12/ids";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/ops2/[equipment]/v1/runs?limit=10 — 최근 공정(시작·끝·결과·사유·이름), 시작이 늦은 것부터.
// 챔버12: chamber·owner·recipeRev 칸(챔버K 는 null), &chamber=ch1|ch2|pc|tsp 로 그 챔버만.
export async function GET(req: NextRequest, { params }: { params: Promise<{ equipment: string }> }) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  const { equipment } = await params;
  if (!(await enabledDevice(equipment))) return NextResponse.json({ error: "unknown_device" }, { status: 404 });

  const chamber = req.nextUrl.searchParams.get("chamber");
  if (chamber && !(isCh12(equipment) && (CH12_CHAMBERS as readonly string[]).includes(chamber))) {
    return NextResponse.json({ error: "bad_query", detail: `chamber 는 챔버12 장비에서만 ${CH12_CHAMBERS.join("·")}` }, { status: 400 });
  }
  const runs = await ops2Db.ops2Run.findMany({
    where: { equipment, ...(chamber ? { chamber } : {}) },
    orderBy: { startedAt: { sort: "desc", nulls: "last" } },
    take: limitOf(req.nextUrl.searchParams.get("limit"), 10, 100),
    select: {
      runId: true, name: true, recipeName: true, startedBy: true, stepNo: true, startedAt: true, endedAt: true,
      result: true, reasonCode: true, chamber: true, owner: true, recipeRev: true,
    },
  });
  return NextResponse.json({ runs });
}
