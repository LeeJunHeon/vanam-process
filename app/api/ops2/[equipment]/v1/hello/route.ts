import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-helpers";
import { actorOf, deviceBundle, enabledDevice, permsOf } from "@/lib/ops2/browser";
import { isOnline } from "@/lib/ops2/commands";
import { connections } from "@/lib/ops2/hub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/ops2/[equipment]/v1/hello — 장비의 마지막 hello(webSchema 뺀 것 — 로컬 /api/v1/hello 와 같은 칸) + web.
// web: online(마지막 연락 10 s 안 — 명령 device_offline 과 같은 기준)·lastSeenAt·holderInstance·sse(명령 연결)·
//      clockSkewMs(장비 − 웹)·serverNow(화면이 자기 시계와의 차를 잰다)·perms(canOperate·isAdmin·kinds)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ equipment: string }> }) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  const { equipment } = await params;

  const device = await enabledDevice(equipment);
  if (!device) return NextResponse.json({ error: "unknown_device" }, { status: 404 });
  const bundle = await deviceBundle(device.webSchemaHash);
  const now = new Date();
  const hello = device.lastHello && typeof device.lastHello === "object" && !Array.isArray(device.lastHello)
    ? device.lastHello
    : { equipment, webSchemaHash: device.webSchemaHash };
  const conns = connections()[equipment] ?? [];

  return NextResponse.json({
    ...hello,
    web: {
      online: isOnline(device, now),
      lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
      holderInstance: device.holderInstance,
      sse: !!device.holderInstance && conns.some((c) => c.instance === device.holderInstance),
      clockSkewMs: device.clockSkewMs,
      serverNow: now.toISOString(),
      label: device.label,
      hasSchema: !!bundle,
      perms: await permsOf(actorOf(auth.session), equipment, bundle),
    },
  });
}
