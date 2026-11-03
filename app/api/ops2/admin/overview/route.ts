import { NextRequest, NextResponse } from "next/server";
import { ops2Db } from "@/lib/ops2/db";
import { isAdminSession, requireSession } from "@/lib/auth-helpers";
import { LEASE_MS } from "@/lib/ops2/ingest";
import { connections } from "@/lib/ops2/hub";
import { expireDue } from "@/lib/ops2/commands";
import { sendsChat, treatAsProd, webhookState } from "@/lib/ops2/chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/ops2/admin/overview[?equipment=CHK2] — 장비 관리(v2) 화면(관리자만).
// 장비 목록(+ SSE 연결) + 고른 장비의 최신 state 요약·사건·run·명령 결과·받지 못한 메시지·1분 요약 수·
// 구글챗 알림(W-6 — 주소 있음/없음만, 주소 자체는 내지 않음 · 최근 outbox 20).
export async function GET(req: NextRequest) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  if (!isAdminSession(auth.session)) {
    return NextResponse.json({ error: "관리자만 볼 수 있습니다." }, { status: 403 });
  }

  await expireDue(null, new Date());       // 장비가 끊겨 ingest 가 없어도 만료가 보이게
  const rows = await ops2Db.ops2Device.findMany({ orderBy: { equipment: "asc" } });
  const schemas = new Set((await ops2Db.ops2WebSchema.findMany({
    where: { hash: { in: rows.map((d) => d.webSchemaHash).filter((h): h is string => !!h) } },
    select: { hash: true },
  })).map((s) => s.hash));
  const bases = await ops2Db.ops2ConfigVersion.groupBy({ by: ["equipment"], _max: { version: true } });
  const baseOf = new Map(bases.map((b) => [b.equipment, b._max.version]));

  const sse = connections();
  const devices = rows.map((d) => ({
    equipment: d.equipment, label: d.label, enabled: d.enabled, hasToken: !!d.tokenHash,
    holderInstance: d.holderInstance, holderSeenAt: d.holderSeenAt,
    conflictInstance: d.conflictInstance, conflictAt: d.conflictAt,
    runMode: d.runMode, writesAllowed: d.writesAllowed, program: d.program, version: d.version,
    configVersion: d.configVersion, webConfigVersion: baseOf.get(d.equipment) ?? null,
    webSchemaHash: d.webSchemaHash, hasWebSchema: !!d.webSchemaHash && schemas.has(d.webSchemaHash),
    clockSkewMs: d.clockSkewMs, lastHelloAt: d.lastHelloAt, lastSeenAt: d.lastSeenAt,
    sse: sse[d.equipment] ?? [],
  }));

  const equipment = req.nextUrl.searchParams.get("equipment");
  if (!equipment) return NextResponse.json({ devices, leaseSec: LEASE_MS / 1000 });

  const [state, events, runs, commands, bad, summaryCount, outbox] = await Promise.all([
    ops2Db.ops2State.findUnique({ where: { equipment } }),
    ops2Db.ops2Event.findMany({ where: { equipment }, orderBy: [{ ts: "desc" }, { seq: "desc" }], take: 30 }),
    ops2Db.ops2Run.findMany({
      where: { equipment }, orderBy: { startedAt: { sort: "desc", nulls: "first" } }, take: 10,
      select: { runId: true, instance: true, name: true, recipeName: true, startedBy: true, stepNo: true,
                startedAt: true, endedAt: true, result: true, reasonCode: true },
    }),
    ops2Db.ops2Command.findMany({
      where: { equipment }, orderBy: { requestedAt: "desc" }, take: 20,
      select: { id: true, origin: true, kind: true, status: true, reasonCode: true, detail: true, requestedBy: true,
                requestedAt: true, resultAt: true, resultReceivedAt: true, targetInstance: true, sentVia: true, sentAt: true,
                lastSentAt: true, sendCount: true, expiresAtServer: true },
    }),
    ops2Db.ops2BadMessage.findMany({
      where: { equipment }, orderBy: { receivedAt: "desc" }, take: 10,
      select: { id: true, instance: true, receivedAt: true, reason: true },
    }),
    ops2Db.ops2Summary.count({ where: { equipment } }),
    ops2Db.ops2ChatOutbox.findMany({
      where: { equipment }, orderBy: { id: "desc" }, take: 20,
      select: { id: true, kind: true, msgId: true, payload: true, status: true, tries: true, lastError: true, nextAt: true,
                createdAt: true, sentAt: true },
    }),
  ]);
  const dev = rows.find((d) => d.equipment === equipment);
  const hook = webhookState(equipment);
  const chat = {
    process: hook.process, alert: hook.alert, envNames: hook.names, runMode: dev?.runMode ?? null,
    sends: sendsChat(equipment, dev?.runMode ?? null), treatAsProd: treatAsProd(equipment),
    outbox: outbox.map((o) => {
      const p = (o.payload ?? {}) as Record<string, unknown>;
      return { id: o.id, kind: o.kind, msgId: o.msgId, title: typeof p.title === "string" ? p.title : "", channel: p.channel ?? null,
               status: o.status, tries: o.tries, lastError: o.lastError, nextAt: o.nextAt, createdAt: o.createdAt, sentAt: o.sentAt };
    }),
  };

  // state 는 요약만(전체 행은 크다)
  const sd = (state?.data ?? {}) as Record<string, unknown>;
  const up = (sd.uplink ?? {}) as Record<string, unknown>;
  const stateBrief = state && {
    instance: state.instance, ts: state.ts, receivedAt: state.receivedAt, procState: state.procState,
    runId: state.runId, step: sd.step ?? null, alarmCount: Array.isArray(sd.alarms) ? sd.alarms.length : 0,
    stopping: sd.stopping ?? null, configVersion: sd.configVersion ?? null,
    uplink: { connected: up.connected ?? null, queued: up.queued ?? null, dropped: up.dropped ?? null,
              lastError: up.lastError ?? null },
  };

  return NextResponse.json({
    devices, leaseSec: LEASE_MS / 1000, state: stateBrief, events, runs, commands, bad, summaryCount, chat,
  });
}
