import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ops2Db } from "@/lib/ops2/db";
import { requireSession } from "@/lib/auth-helpers";
import { readLimited } from "@/lib/ops2/body";
import { COMMAND_TTL_MS, expireDue, missingArgs, webCommandDef } from "@/lib/ops2/commands";
import { canRunCommand, operatorEquipments } from "@/lib/ops2/perm";
import { kick } from "@/lib/ops2/hub";
import type { Prisma } from "@/app/generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 256 * 1024;
const ONLINE_MS = 10_000;        // 장비 연결: 주인 실행이 있고 마지막 연락이 이만큼 안
const WAIT_MAX_S = 10;
const DONE = new Set(["accepted", "rejected", "expired"]);
const CLIENT_ID = /^[A-Za-z0-9_-]{8,64}$/;

type Out = { id: string; status: string; reasonCode: string | null; detail: string | null };
const outOf = (c: Out) => ({
  id: c.id, status: c.status, ...(c.reasonCode ? { reasonCode: c.reasonCode } : {}), ...(c.detail ? { detail: c.detail } : {}),
});
const SEL = { id: true, equipment: true, status: true, reasonCode: true, detail: true } as const;

// ?wait=초(최대 10) — 결과(accepted·rejected·expired)가 올 때까지 200 ms 마다 확인. 그때까지 없으면 그 상태 그대로.
async function waitResult(c: Out, waitS: number): Promise<Out> {
  const until = Date.now() + Math.min(Math.max(waitS, 0), WAIT_MAX_S) * 1000;
  let cur = c;
  while (!DONE.has(cur.status) && Date.now() < until) {
    await new Promise((r) => setTimeout(r, 200));
    cur = (await ops2Db.ops2Command.findUnique({ where: { id: c.id }, select: SEL })) ?? cur;
  }
  return cur;
}

// POST /api/ops2/[equipment]/v1/command — 웹 → 장비 명령 만들기(세션 필요). 본문 {kind, args?, label?, id?}
// 검사: 장비(404) → 웹 설정 묶음(409 no_schema) → kind·sources·args(400) → 권한(403, lib/ops2/perm.ts) → 연결(409 device_offline)
// 만들면 pending — 장비 SSE(hub.kick)나 다음 POST 응답으로 간다. 30 s 안에 못 보내면 expired(WEB_EXPIRED).
export async function POST(req: NextRequest, { params }: { params: Promise<{ equipment: string }> }) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  const { equipment } = await params;

  const text = await readLimited(req, MAX_BODY);
  if (text === null) return NextResponse.json({ error: "too_large", max: MAX_BODY }, { status: 413 });
  let body: { kind?: unknown; args?: unknown; label?: unknown; id?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const device = await ops2Db.ops2Device.findUnique({ where: { equipment } });
  if (!device || !device.enabled) return NextResponse.json({ error: "unknown_device" }, { status: 404 });

  const schema = device.webSchemaHash
    ? await ops2Db.ops2WebSchema.findUnique({ where: { hash: device.webSchemaHash }, select: { bundle: true } })
    : null;
  if (!schema) return NextResponse.json({ error: "no_schema" }, { status: 409 });

  const kind = typeof body.kind === "string" ? body.kind : "";
  const def = kind ? webCommandDef(schema.bundle, kind) : null;
  if (!def) return NextResponse.json({ error: "unknown_kind", detail: "웹에서 낼 수 없는 명령" }, { status: 400 });
  const args = body.args === undefined ? {} : body.args;
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return NextResponse.json({ error: "bad_args", detail: "args 는 객체" }, { status: 400 });
  }
  const missing = missingArgs(def, args as Record<string, unknown>);
  if (missing.length) return NextResponse.json({ error: "bad_args", detail: `빠진 인자: ${missing.join(", ")}` }, { status: 400 });
  if (body.id !== undefined && (typeof body.id !== "string" || !CLIENT_ID.test(body.id))) {
    return NextResponse.json({ error: "bad_id", detail: "id 는 ^[A-Za-z0-9_-]{8,64}$" }, { status: 400 });
  }
  const label = typeof body.label === "string" ? body.label.slice(0, 200) : null;

  const user = auth.session.user;
  const actor = { role: user?.role ?? null, employeeId: user?.employeeId ?? null };
  if (!canRunCommand(actor, equipment, def.role, await operatorEquipments(ops2Db, actor.employeeId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const waitS = Number(req.nextUrl.searchParams.get("wait") ?? 0) || 0;
  const id = (body.id as string | undefined) ?? randomUUID().replace(/-/g, "");

  // 같은 클라이언트 id — 다시 만들지 않고 그 명령을 돌려준다
  const same = async () => {
    const c = await ops2Db.ops2Command.findUnique({ where: { id }, select: SEL });
    if (!c) return null;
    if (c.equipment !== equipment) return NextResponse.json({ error: "id_conflict" }, { status: 409 });
    return NextResponse.json(outOf(await waitResult(c, waitS)));
  };
  if (body.id !== undefined) {
    const r = await same();
    if (r) return r;
  }

  const now = new Date();
  if (!device.holderInstance || !device.lastSeenAt || now.getTime() - device.lastSeenAt.getTime() > ONLINE_MS) {
    return NextResponse.json({ error: "device_offline" }, { status: 409 });
  }
  await expireDue(equipment, now);

  const expiresAtServer = new Date(now.getTime() + COMMAND_TTL_MS);
  try {
    await ops2Db.ops2Command.create({
      data: {
        id, equipment, targetInstance: device.holderInstance, origin: "web", kind,
        args: args as Prisma.InputJsonValue, label,
        requestedBy: user?.email ?? user?.name ?? "unknown", requestedAt: now,
        expiresAtServer, expiresAt: new Date(expiresAtServer.getTime() + (device.clockSkewMs ?? 0)),   // 장비 시계 기준(계약)
        status: "pending",
      },
    });
  } catch (e) {
    if ((e as { code?: string })?.code === "P2002") {                  // 같은 id 가 동시에
      const r = await same();
      if (r) return r;
    }
    console.error("[ops2/command]", equipment, (e as Error)?.message?.slice(0, 300));
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
  kick(equipment);

  const created = { id, status: "pending", reasonCode: null, detail: null };
  return NextResponse.json(outOf(waitS > 0 ? await waitResult(created, waitS) : created));
}
