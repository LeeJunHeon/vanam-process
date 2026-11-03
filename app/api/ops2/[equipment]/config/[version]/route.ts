import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-helpers";
import { ops2Db } from "@/lib/ops2/db";
import { actorOf, enabledDevice } from "@/lib/ops2/browser";
import { isAdminRole, isOperatorOf, operatorEquipments } from "@/lib/ops2/perm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/ops2/[equipment]/config/[version] — 설정 버전 하나(값 전체·changes·ack). 장비 담당자·관리자. 비교는 화면이 두 번 읽는다.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ equipment: string; version: string }> }) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  const { equipment, version } = await params;
  if (!(await enabledDevice(equipment))) return NextResponse.json({ error: "unknown_device" }, { status: 404 });
  const actor = actorOf(auth.session);
  if (!isAdminRole(actor.role) && !isOperatorOf(actor, equipment, await operatorEquipments(ops2Db, actor.employeeId))) {
    return NextResponse.json({ error: "forbidden", detail: "설정은 장비 담당자·관리자만 봄" }, { status: 403 });
  }
  const v = Number(version);
  if (!Number.isInteger(v) || v < 0) return NextResponse.json({ error: "bad_version" }, { status: 400 });
  const row = await ops2Db.ops2ConfigVersion.findUnique({ where: { equipment_version: { equipment, version: v } } });
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ version: row });
}
