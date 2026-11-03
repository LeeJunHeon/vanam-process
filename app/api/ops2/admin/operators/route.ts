import { NextRequest, NextResponse } from "next/server";
import { ops2Db } from "@/lib/ops2/db";
import { isAdminSession, requireSession } from "@/lib/auth-helpers";
import { baseEquipment } from "@/lib/ops2/perm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 장비 담당자(관리자만) — 기준 장비 ID(-SIM 을 뗀 것)마다. CHK2 담당자는 CHK2·CHK2-SIM 모두 조작할 수 있다(lib/ops2/perm.ts).
// GET 목록 · POST {equipment, employeeId} 추가 · DELETE ?equipment=&employeeId= 삭제
async function admin() {
  const auth = await requireSession();
  if (!auth.ok) return { res: auth.response, who: "" };
  if (!isAdminSession(auth.session)) {
    return { res: NextResponse.json({ error: "관리자만 할 수 있습니다." }, { status: 403 }), who: "" };
  }
  return { res: null, who: auth.session.user?.email ?? auth.session.user?.name ?? "unknown" };
}

/** 등록된 장비들의 기준 ID */
async function baseIds(): Promise<string[]> {
  const rows = await ops2Db.ops2Device.findMany({ select: { equipment: true } });
  return [...new Set(rows.map((d) => baseEquipment(d.equipment)))].sort();
}

export async function GET() {
  const a = await admin();
  if (a.res) return a.res;
  const [equipments, rows] = await Promise.all([
    baseIds(),
    ops2Db.ops2Operator.findMany({ orderBy: [{ equipment: "asc" }, { createdAt: "asc" }] }),
  ]);
  const people = new Map((await ops2Db.employee.findMany({
    where: { id: { in: rows.map((r) => r.employeeId) } }, select: { id: true, name: true, isActive: true },
  })).map((e) => [e.id, e]));
  const operators = rows.map((r) => ({
    equipment: r.equipment, employeeId: r.employeeId, name: people.get(r.employeeId)?.name ?? null,
    active: people.get(r.employeeId)?.isActive ?? false, createdBy: r.createdBy, createdAt: r.createdAt,
  }));
  return NextResponse.json({ equipments, operators });
}

export async function POST(req: NextRequest) {
  const a = await admin();
  if (a.res) return a.res;
  const b = (await req.json().catch(() => null)) as { equipment?: unknown; employeeId?: unknown } | null;
  const equipment = typeof b?.equipment === "string" ? b.equipment : "";
  const employeeId = Number(b?.employeeId);
  if (!(await baseIds()).includes(equipment)) {
    return NextResponse.json({ error: "기준 장비 ID 가 아닙니다." }, { status: 400 });
  }
  if (!Number.isInteger(employeeId)
      || !(await ops2Db.employee.findFirst({ where: { id: employeeId, isActive: true }, select: { id: true } }))) {
    return NextResponse.json({ error: "재직 중 직원이 아닙니다." }, { status: 400 });
  }
  await ops2Db.ops2Operator.createMany({ data: [{ equipment, employeeId, createdBy: a.who }], skipDuplicates: true });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const a = await admin();
  if (a.res) return a.res;
  const equipment = req.nextUrl.searchParams.get("equipment") ?? "";
  const employeeId = Number(req.nextUrl.searchParams.get("employeeId"));
  if (!equipment || !Number.isInteger(employeeId)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const r = await ops2Db.ops2Operator.deleteMany({ where: { equipment, employeeId } });
  return NextResponse.json({ ok: true, deleted: r.count });
}
