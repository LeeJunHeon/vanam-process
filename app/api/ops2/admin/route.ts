import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminSession, requireSession } from "@/lib/auth-helpers";
import { LEASE_MS } from "@/lib/ops2/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/ops2/admin[?equipment=CHK2] — 확인용(admin). 장비 목록 + 고른 장비의 최근 state·사건·run 등.
export async function GET(req: NextRequest) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  if (!isAdminSession(auth.session)) {
    return NextResponse.json({ error: "관리자만 볼 수 있습니다." }, { status: 403 });
  }

  const now = Date.now();
  const devices = (await prisma.ops2Device.findMany({
    orderBy: { equipment: "asc" },
    select: {
      equipment: true, label: true, enabled: true, holderInstance: true, holderSeenAt: true, runMode: true,
      writesAllowed: true, program: true, version: true, schemaHash: true, webSchemaHash: true,
      configVersion: true, clockSkewMs: true, clockCheckedAt: true, lastSeenAt: true,
    },
  })).map((d) => ({
    ...d,
    online: !!d.lastSeenAt && now - d.lastSeenAt.getTime() < LEASE_MS,
  }));

  const equipment = req.nextUrl.searchParams.get("equipment");
  if (!equipment) return NextResponse.json({ devices, leaseSec: LEASE_MS / 1000 });

  const [state, events, runs, results, instances, bad, schemas, summaries, acks] = await Promise.all([
    prisma.ops2State.findUnique({ where: { equipment } }),
    prisma.ops2Event.findMany({ where: { equipment }, orderBy: [{ ts: "desc" }, { seq: "desc" }], take: 50 }),
    prisma.ops2Run.findMany({ where: { equipment }, orderBy: [{ startedAt: { sort: "desc", nulls: "first" } }], take: 20 }),
    prisma.ops2CmdResult.findMany({ where: { equipment }, orderBy: { ts: "desc" }, take: 20 }),
    prisma.ops2Instance.findMany({ where: { equipment }, orderBy: { firstSeenAt: "desc" }, take: 10,
                                   select: { instance: true, program: true, version: true, runMode: true,
                                             firstSeenAt: true, lastSeenAt: true } }),
    prisma.ops2BadMessage.findMany({ where: { equipment }, orderBy: { receivedAt: "desc" }, take: 10 }),
    prisma.ops2WebSchema.findMany({ where: { firstEquipment: equipment }, orderBy: { receivedAt: "desc" }, take: 5,
                                    select: { hash: true, version: true, paramSchemaHash: true, receivedAt: true } }),
    prisma.ops2Summary.count({ where: { equipment } }),
    prisma.ops2ConfigAck.findMany({ where: { equipment }, orderBy: { ts: "desc" }, take: 10 }),
  ]);

  return NextResponse.json({
    devices, leaseSec: LEASE_MS / 1000, state, events, runs, results, instances, bad, schemas,
    summaryCount: summaries, configAcks: acks,
  });
}
