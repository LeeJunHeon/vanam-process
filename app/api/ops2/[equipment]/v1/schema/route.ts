import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-helpers";
import { ops2Db } from "@/lib/ops2/db";
import { deviceBundle, enabledDevice } from "@/lib/ops2/browser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/ops2/[equipment]/v1/schema — 장비 web_schema_hash 의 묶음(로컬 /api/v1/schema 와 같은 모양).
// params[].current 는 이 장비의 마지막 설정 버전(ops2_config_version, 거부된 버전 제외) 값으로 덮어 준다(있으면).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ equipment: string }> }) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  const { equipment } = await params;

  const device = await enabledDevice(equipment);
  if (!device) return NextResponse.json({ error: "unknown_device" }, { status: 404 });
  const bundle = await deviceBundle(device.webSchemaHash);
  if (!bundle) return NextResponse.json({ error: "no_schema" }, { status: 409 });

  const last = await ops2Db.ops2ConfigVersion.findFirst({
    where: { equipment, OR: [{ ackStatus: null }, { ackStatus: { not: "rejected" } }] },
    orderBy: { version: "desc" },
    select: { version: true, paramValues: true },
  });
  const values = last?.paramValues && typeof last.paramValues === "object" && !Array.isArray(last.paramValues)
    ? (last.paramValues as Record<string, unknown>)
    : null;
  if (!values) return NextResponse.json(bundle);

  const list = Array.isArray(bundle.params) ? bundle.params : [];
  return NextResponse.json({
    ...bundle,
    webConfigVersion: last!.version,
    params: list.map((p) => {
      if (!p || typeof p !== "object") return p;
      const q = p as Record<string, unknown>;
      return typeof q.key === "string" && q.scope !== "secret" && q.key in values ? { ...q, current: values[q.key] } : q;
    }),
  });
}
