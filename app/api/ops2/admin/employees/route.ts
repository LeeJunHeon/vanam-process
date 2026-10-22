import { NextResponse } from "next/server";
import { ops2Db } from "@/lib/ops2/db";
import { isAdminSession, requireSession } from "@/lib/auth-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/ops2/admin/employees — 담당자로 고를 수 있는 재직 중 직원(관리자만). 공정 담당자(process_owner)를 위에.
export async function GET() {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  if (!isAdminSession(auth.session)) {
    return NextResponse.json({ error: "관리자만 볼 수 있습니다." }, { status: 403 });
  }
  const rows = await ops2Db.employee.findMany({
    where: { isActive: true },
    select: { id: true, name: true, email: true, processOwner: { select: { isActive: true, sortOrder: true } } },
  });
  const owner = (r: (typeof rows)[number]) => (r.processOwner?.isActive ? r.processOwner.sortOrder : null);
  const employees = rows
    .sort((a, b) => (owner(a) === null ? 1 : 0) - (owner(b) === null ? 1 : 0)
                    || (owner(a) ?? 0) - (owner(b) ?? 0) || a.name.localeCompare(b.name, "ko"))
    .map((r) => ({ id: r.id, name: r.name, email: r.email, processOwner: owner(r) !== null }));
  return NextResponse.json({ employees });
}
