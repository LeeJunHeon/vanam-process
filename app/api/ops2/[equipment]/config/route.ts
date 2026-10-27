import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-helpers";
import { ops2Db } from "@/lib/ops2/db";
import { actorOf, deviceBundle, enabledDevice, limitOf } from "@/lib/ops2/browser";
import { readLimited } from "@/lib/ops2/body";
import { COMMAND_TTL_MS, expireDue, isOnline, webCommandDef } from "@/lib/ops2/commands";
import {
  checkParamValue, currentConfig, inFlightVersion, isObj, nextVersion, pendingResync, requestResync, RESYNC_TTL_MS,
  type Obj, type ParamDefLite,
} from "@/lib/ops2/config";
import { stripNul } from "@/lib/ops2/ingest";
import { kick } from "@/lib/ops2/hub";
import { canRunCommand, isAdminRole, isOperatorOf, operatorEquipments } from "@/lib/ops2/perm";
import type { Prisma } from "@/app/generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 512 * 1024;
const WAIT_MAX_S = 15;

/** 세션·장비·묶음·권한 — 보기는 그 장비 담당자·관리자, 적용·되돌리기는 묶음 role(CONFIG_APPLY·CONFIG_ROLLBACK = admin) */
async function ctxOf(equipment: string) {
  const auth = await requireSession();
  if (!auth.ok) return { ok: false as const, response: auth.response };
  const device = await enabledDevice(equipment);
  if (!device) return { ok: false as const, response: NextResponse.json({ error: "unknown_device" }, { status: 404 }) };
  const actor = actorOf(auth.session);
  const ops = await operatorEquipments(ops2Db, actor.employeeId);
  const canView = isAdminRole(actor.role) || isOperatorOf(actor, equipment, ops);
  if (!canView) {
    return { ok: false as const, response: NextResponse.json({ error: "forbidden", detail: "설정은 장비 담당자·관리자만 봄" }, { status: 403 }) };
  }
  const bundle = await deviceBundle(device.webSchemaHash);
  const role = (k: string) => webCommandDef(bundle, k)?.role;
  const user = auth.session.user;
  return {
    ok: true as const, device, bundle, actor,
    canApply: !!bundle && canRunCommand(actor, equipment, role("CONFIG_APPLY"), ops),
    canRollback: !!bundle && canRunCommand(actor, equipment, role("CONFIG_ROLLBACK"), ops),
    who: user?.email ?? user?.name ?? "unknown",
  };
}

const VERSION_SEL = {
  version: true, kind: true, createdBy: true, createdAt: true, note: true, cmdId: true, ackStatus: true, ackAt: true,
  reasonCode: true, errors: true, appliedKeys: true, pendingKeys: true, overriddenKeys: true, changes: true, paramSchemaHash: true,
} as const;

// GET /api/ops2/[equipment]/config?limit=50 — 설정 보기(장비 담당자·관리자). 장비 버전·지금 값·대기 중·버전 목록(값 없이).
// 지금 값 = 장비 configVersion 의 웹 행(그보다 큰 resync 행이 있으면 그 값 — base). 없으면 null(화면이 묶음 current 로 + 안내).
// 대기 중 = 지금보다 새 웹 버전 중 ack 가 없거나 pending_idle·pending_restart 인 것(resync 는 장비에 안 가므로 빼고), state.configPending.
// 덮어쓰기 = hello overriddenKeys + 그 키의 실행 값(묶음 current — ingest 가 lastHello._overriddenCurrent 로 이어 둔 것).
export async function GET(req: NextRequest, { params }: { params: Promise<{ equipment: string }> }) {
  const { equipment } = await params;
  const ctx = await ctxOf(equipment);
  if (!ctx.ok) return ctx.response;
  const cur = await currentConfig(equipment);
  const [list, st] = await Promise.all([
    ops2Db.ops2ConfigVersion.findMany({
      where: { equipment }, orderBy: { version: "desc" }, take: limitOf(req.nextUrl.searchParams.get("limit"), 50, 500),
      select: VERSION_SEL,
    }),
    ops2Db.ops2State.findUnique({ where: { equipment }, select: { data: true } }),
  ]);
  const dv = cur.version ?? -1;
  const pendingVersions = list.filter((v) => v.version > dv && v.kind !== "resync" && (v.ackStatus === null || v.ackStatus.startsWith("pending")))
    .map((v) => v.version);
  const lh = isObj(ctx.device.lastHello) ? ctx.device.lastHello : {};
  const helloKeys = Array.isArray(lh.overriddenKeys) ? lh.overriddenKeys.map(String) : [];
  const ovCur = isObj(lh._overriddenCurrent) ? lh._overriddenCurrent : {};
  const pendingRows = pendingVersions.length ? await ops2Db.ops2ConfigVersion.findMany({
    where: { equipment, version: { in: pendingVersions } }, select: { version: true, paramValues: true, ackStatus: true },
  }) : [];
  return NextResponse.json({
    equipment, canApply: ctx.canApply, canRollback: ctx.canRollback,
    deviceVersion: cur.version, current: cur.values, base: cur.base,
    overridden: Object.fromEntries(helloKeys.map((k) => [k, k in ovCur ? ovCur[k] : null])),
    resyncPending: !!pendingResync(equipment),
    currentRow: cur.row ? { version: cur.row.version, kind: cur.row.kind, ackStatus: cur.row.ackStatus,
                            overriddenKeys: cur.row.overriddenKeys, pendingKeys: cur.row.pendingKeys } : null,
    statePending: isObj(st?.data) ? st.data.configPending ?? null : null,
    pending: pendingRows.map((r) => ({ version: r.version, ackStatus: r.ackStatus, values: r.paramValues })),
    webMaxVersion: list[0]?.version ?? null,
    versions: list,
  });
}

// POST /api/ops2/[equipment]/config?wait=초 — 관리자(묶음 role).
//  {action: "apply", baseVersion, changes: {키: 새 값}, note?}: 지금 버전 값(비밀값 뺀 전체) + changes 로 새 버전 행과
//    CONFIG_APPLY {version, values, schemaHash} 명령을 한 트랜잭션에. version = max(웹 최대, 장비 configVersion) + 1.
//    baseVersion ≠ 장비 지금 버전이면 409 base_changed, 같은 version 동시 생성은 409 version_taken,
//    앞서 보낸 웹 버전이 아직 답이 없으면(30 s 안) 409 in_flight — 같은 지금 값 위의 두 버전이 서로를 되돌리지 않게.
//    키 하나 웹 검사(형식·범위·enum·pattern)를 통과하지 못하면 400 — 키 사이 규칙은 장비(CONFIG_INVALID).
//  {action: "rollback"}: CONFIG_ROLLBACK {version} 명령만 — version 은 적용과 같은 규칙으로 웹이 정한다(5-12). 장비가 그 번호로
//    직전 값을 적용하고 config_ack(values)로 웹 행이 생긴다(같은 in_flight 막기).
//  {action: "resync", note?}: 장비 저장 값으로 기준 다시 읽기 — 명령은 보내지 않는다. 다음 POST 응답 needWebSchema 로 묶음을
//    다시 받아 ingest 가 kind resync 행(stored 값)을 만든다(in_flight 이면 409).
//  ?wait 동안 명령 결과·ack(resync 는 그 행)를 기다려 {version, command, ack} 로 돌려준다.
export async function POST(req: NextRequest, { params }: { params: Promise<{ equipment: string }> }) {
  const { equipment } = await params;
  const ctx = await ctxOf(equipment);
  if (!ctx.ok) return ctx.response;
  const bad = (error: string, detail: string, status = 400) => NextResponse.json({ error, detail }, { status });

  const text = await readLimited(req, MAX_BODY);
  if (text === null) return bad("too_large", `본문은 ${MAX_BODY / 1024} KB 까지`, 413);
  let body: Obj;
  try {
    const b = stripNul(JSON.parse(text));
    if (!isObj(b)) return bad("bad_request", "본문은 객체");
    body = b;
  } catch {
    return bad("bad_json", "JSON 이 아님");
  }
  const action = body.action;
  if (action !== "apply" && action !== "rollback" && action !== "resync") return bad("bad_action", "action 은 apply·rollback·resync");
  if (!ctx.bundle) return bad("no_schema", "장비 묶음이 아직 없음", 409);
  if (!(action === "rollback" ? ctx.canRollback : ctx.canApply)) {
    return NextResponse.json({ error: "forbidden", detail: "설정 적용·되돌리기는 관리자만" }, { status: 403 });
  }
  const now = new Date();
  const device = ctx.device;
  if (!isOnline(device, now)) return bad("device_offline", "장비 연결 끊김", 409);
  const cur = await currentConfig(equipment);
  const cmdId = randomUUID().replace(/-/g, "");
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) || null : null;
  let version: number | null = null;
  let kind: string;
  let args: Obj;
  let label: string;
  const inFlightErr = (v: number) => bad("in_flight", `앞서 보낸 버전 ${v} 이 장비 답을 기다리는 중 — 결과를 본 뒤 다시`, 409);
  const waitS = Math.min(Math.max(Number(req.nextUrl.searchParams.get("wait") ?? 0) || 0, 0), WAIT_MAX_S);
  const until = Date.now() + waitS * 1000;

  if (action === "resync") {
    const busyV = await ops2Db.$transaction((tx) => inFlightVersion(tx, equipment, cur.version, now));
    if (busyV !== null) return inFlightErr(busyV);
    requestResync(equipment, ctx.who, note, now.getTime());
    kick(equipment);
    let row = null;
    for (;;) {
      row = await ops2Db.ops2ConfigVersion.findFirst({
        where: { equipment, kind: "resync", createdAt: { gte: now } }, orderBy: { version: "desc" }, select: VERSION_SEL,
      });
      if (row || Date.now() >= until) break;
      await new Promise((x) => setTimeout(x, 250));
    }
    return NextResponse.json({ version: row?.version ?? null, cmdId: null, command: null, ack: row,
                               waiting: !row, ttlSec: RESYNC_TTL_MS / 1000 });
  }

  if (action === "apply") {
    if (body.baseVersion !== cur.version) {
      return bad("base_changed", `장비 설정 버전이 바뀜(편집 기준 ${String(body.baseVersion)} → 지금 ${String(cur.version)}) — 다시 읽고 다시`, 409);
    }
    if (!cur.values) return bad("no_current", `장비 버전 ${String(cur.version)} 의 웹 행이 없어 전체 값을 만들 수 없음 — 되돌리기나 장비 확인 먼저`, 409);
    if (!isObj(body.changes) || !Object.keys(body.changes).length) return bad("no_changes", "바뀐 키가 없음");
    const defs = new Map((Array.isArray(ctx.bundle.params) ? ctx.bundle.params : [])
      .filter((p): p is ParamDefLite => isObj(p) && typeof p.key === "string").map((p) => [p.key, p]));
    const errs: string[] = [];
    for (const [k, v] of Object.entries(body.changes)) {
      const p = defs.get(k);
      if (!p) errs.push(`${k}: 정의되지 않은 키`);
      else if (p.scope === "secret") errs.push(`${k}: 비밀값은 웹에서 보내지 않음`);
      else if (p.webLocked) errs.push(`${k}: 웹에서 바꿀 수 없는 키(노트북 설정 파일로만)`);
      else {
        const e = checkParamValue(p, v);
        if (e) errs.push(e);
      }
    }
    if (errs.length) return NextResponse.json({ error: "bad_values", detail: errs[0], errors: errs }, { status: 400 });
    // 전체 값 = 지금 버전 값(비밀값·정의에 없는 키 제외) + 바꾼 키
    const values: Obj = {};
    for (const [k, p] of defs) if (p.scope !== "secret") values[k] = k in body.changes ? body.changes[k] : cur.values[k];
    const missing = [...defs.values()].filter((p) => p.scope !== "secret" && values[p.key] === undefined).map((p) => p.key);
    if (missing.length) return bad("missing_keys", `지금 버전에 없는 키 ${missing.length}개(${missing.slice(0, 5).join(", ")}) — 묶음이 바뀐 뒤 장비 버전 행이 없음`, 409);
    version = await nextVersion(ops2Db, equipment, cur.version);
    kind = "CONFIG_APPLY";
    const schemaHash = typeof ctx.bundle.paramSchemaHash === "string" ? ctx.bundle.paramSchemaHash : "";
    args = { version, values, schemaHash };
    label = `설정 버전 ${version} 적용(${Object.keys(body.changes).length}개 키)`;
    try {
      await ops2Db.$transaction(async (tx) => {
        // 앞서 보낸 버전(적용·되돌리기)이 아직 장비 답을 기다리면 거부 — 둘 다 같은 지금 값 위에 만들면 뒤 것이 앞 것을 되돌린다
        const inFlight = await inFlightVersion(tx, equipment, cur.version, now);
        if (inFlight !== null) throw Object.assign(new Error("in_flight"), { inFlight });
        await tx.ops2ConfigVersion.create({
          data: { equipment, version: version!, kind: "web", paramValues: values as Prisma.InputJsonValue, paramSchemaHash: schemaHash,
                  createdBy: ctx.who, createdAt: now, note, cmdId,
                  changes: Object.keys(body.changes as Obj).sort().map((k) => ({ key: k, old: cur.values![k] ?? null, new: (body.changes as Obj)[k] })) as Prisma.InputJsonValue },
        });
        await createCommand(tx, device, cmdId, kind, args, label, ctx.who, now);
      }, { isolationLevel: "Serializable" });                  // 되돌리기(행 없이 번호만 씀)와 같은 번호를 잡지 않게
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === "P2002" || code === "P2034") return bad("version_taken", `버전 ${version} 을 다른 요청이 먼저 잡음 — 다시`, 409);
      const busyV = (e as { inFlight?: number })?.inFlight;
      if (busyV !== undefined) return inFlightErr(busyV);
      console.error("[ops2/config]", equipment, (e as Error)?.message?.slice(0, 300));
      return NextResponse.json({ error: "server error" }, { status: 500 });
    }
  } else {
    kind = "CONFIG_ROLLBACK";
    try {
      // 번호는 적용과 같은 규칙(웹이 정함) — 트랜잭션 안에서 in_flight 를 본 뒤 정한다
      version = await ops2Db.$transaction(async (tx) => {
        const inFlight = await inFlightVersion(tx, equipment, cur.version, now);
        if (inFlight !== null) throw Object.assign(new Error("in_flight"), { inFlight });
        const v = await nextVersion(tx, equipment, cur.version);
        await createCommand(tx, device, cmdId, kind, { version: v },
                            `설정 되돌리기(지금 버전 ${String(cur.version)} → 이전 값으로 v${v})`, ctx.who, now);
        return v;
      }, { isolationLevel: "Serializable" });
    } catch (e) {
      const busyV = (e as { inFlight?: number })?.inFlight;
      if (busyV !== undefined) return inFlightErr(busyV);
      if ((e as { code?: string })?.code === "P2034") return bad("version_taken", "다른 설정 요청과 겹침 — 다시", 409);
      console.error("[ops2/config]", equipment, (e as Error)?.message?.slice(0, 300));
      return NextResponse.json({ error: "server error" }, { status: 500 });
    }
  }
  await expireDue(equipment, now);
  kick(equipment);

  // 결과 기다리기 — 명령 결과, 그리고 ack(그 버전 행 — 되돌리기도 웹이 정한 번호)
  const v = version!;
  const read = async () => {
    const c = await ops2Db.ops2Command.findUnique({ where: { id: cmdId }, select: { status: true, reasonCode: true, detail: true } });
    const row = await ops2Db.ops2ConfigVersion.findUnique({ where: { equipment_version: { equipment, version: v } }, select: VERSION_SEL });
    return { c, row };
  };
  let r = await read();
  while (Date.now() < until) {
    // 되돌리기 거부는 행이 생기지 않는다(ack 에 values 없음) — 명령 거부면 끝
    const done = r.c && (r.c.status === "expired" || (r.c.status === "rejected" && (action === "rollback" || r.row?.ackStatus))
      || (r.c.status === "accepted" && r.row?.ackStatus && r.row.ackAt));
    if (done) break;
    await new Promise((x) => setTimeout(x, 250));
    r = await read();
  }
  return NextResponse.json({ version: v, cmdId, command: r.c, ack: r.row });
}

/** 웹 명령 행(pending) — /v1/command 와 같은 칸(만료·대상 실행·장비 시계 기준 만료) */
async function createCommand(tx: Prisma.TransactionClient, device: { equipment: string; holderInstance: string | null; clockSkewMs: number | null },
                             id: string, kind: string, args: Obj, label: string, by: string, now: Date) {
  const expiresAtServer = new Date(now.getTime() + COMMAND_TTL_MS);
  await tx.ops2Command.create({
    data: {
      id, equipment: device.equipment, targetInstance: device.holderInstance, origin: "web", kind, args: args as Prisma.InputJsonValue,
      label, requestedBy: by, requestedAt: now, expiresAtServer,
      expiresAt: new Date(expiresAtServer.getTime() + (device.clockSkewMs ?? 0)), status: "pending",
    },
  });
}
