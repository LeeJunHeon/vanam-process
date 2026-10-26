import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth-helpers";
import { deviceBundle, enabledDevice } from "@/lib/ops2/browser";
import { currentConfig, overlayCurrent } from "@/lib/ops2/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/ops2/[equipment]/v1/schema — 장비 web_schema_hash 의 묶음(로컬 /api/v1/schema 와 같은 모양).
// params[].current 는 장비가 지금 쓰는 설정 버전(state.configVersion, 없으면 hello)의 웹 행(ops2_config_version) 값으로
// 덮는다 — 그 행이 없으면 묶음 current 그대로(webConfigVersion null). 묶음은 해시마다 하나라 current 는 처음 보낸 장비 값이다.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ equipment: string }> }) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  const { equipment } = await params;

  const device = await enabledDevice(equipment);
  if (!device) return NextResponse.json({ error: "unknown_device" }, { status: 404 });
  const bundle = await deviceBundle(device.webSchemaHash);
  if (!bundle) return NextResponse.json({ error: "no_schema" }, { status: 409 });

  const cur = await currentConfig(equipment);
  return NextResponse.json({
    ...overlayCurrent(bundle, cur.values),
    deviceConfigVersion: cur.version,
    webConfigVersion: cur.values ? cur.version : null,
  });
}
