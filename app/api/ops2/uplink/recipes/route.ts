import { NextRequest, NextResponse } from "next/server";
import { ops2Db } from "@/lib/ops2/db";
import { tokenMatches } from "@/lib/ops2/token";
import { deviceBundle } from "@/lib/ops2/browser";
import { baseEquipment } from "@/lib/ops2/perm";
import { isCh12 } from "@/lib/ops2/ch12/ids";
import { checkEnvOf } from "@/lib/ops2/chk/recipe";
import { checkSummary } from "@/lib/ops2/recipes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/ops2/uplink/recipes?equipment= — 챔버K v2 장비가 웹 레시피 사본을 받는 곳(W-22 F). 장비 토큰만(사용자 로그인과 별개 —
// /uplink/ingest·stream 과 같은 Authorization: Bearer). 그 장비의 기준 장비(CHK2-SIM → CHK2) 레시피 전체: id·kind·name·rows·gas·
// updatedAt·updatedBy·check(지금 묶음으로 낸 웹 검사 수 — 장비는 보여 주기만 하고 적재 때 다시 검사한다).
// 장비는 웹 연결(SSE)이 붙을 때와 웹이 레시피를 저장·지울 때 보내는 'event: recipes'(lib/ops2/hub.ts notifyRecipes) 때 부른다.
// 챔버12 장비는 이 길을 쓰지 않는다(404).
export async function GET(req: NextRequest) {
  const equipment = req.nextUrl.searchParams.get("equipment") ?? "";
  if (!equipment) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const device = await ops2Db.ops2Device.findUnique({ where: { equipment }, select: { tokenHash: true, enabled: true, webSchemaHash: true } });
  if (!device || !device.enabled || !tokenMatches(req.headers.get("authorization"), device.tokenHash)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (isCh12(equipment)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  try {
    const base = baseEquipment(equipment);
    const env = checkEnvOf(await deviceBundle(device.webSchemaHash));
    const rows = await ops2Db.ops2Recipe.findMany({ where: { baseEquipment: base }, orderBy: [{ kind: "asc" }, { name: "asc" }] });
    return NextResponse.json({
      base,
      recipes: rows.map((r) => ({
        id: r.id, kind: r.kind, name: r.name, rows: Array.isArray(r.rows) ? r.rows : [], gas: r.gas ?? null,
        updatedAt: r.updatedAt.toISOString(), updatedBy: r.updatedBy, check: checkSummary(r.kind, r.rows, r.gas, env),
      })),
    });
  } catch (e) {
    console.error("[ops2/uplink/recipes]", equipment, (e as Error)?.message?.slice(0, 300));
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}
