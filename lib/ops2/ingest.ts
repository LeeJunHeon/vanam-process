// 챔버K v2 장비 → 웹 받기(POST /api/ops2/uplink/ingest). 계약은 챔버K v2 common/messages.py 독스트링.
// - lease(같은 장비 ID 두 실행): 배치 전에 조건부 UPDATE 한 문장으로. 주인이 없거나·같은 실행이거나·
//   주인이 LEASE_MS 넘게 조용하면 받는다. 그 밖은 hello 가 있어도 409(v2 는 다시 연결할 때마다 hello 를 보낸다).
// - 배치 하나 = 트랜잭션 하나, 받은 순서대로. 표마다 한 번에 넣는다(메시지마다 왕복하지 않음).
//   같은 id 는 한 번만 저장(msg_id PK·UNIQUE), 이미 있던 것도 acked. 뒤따르는 처리는 새로 들어간 것에만.
// - 받지 못하는 envelope 은 ops2_bad_message 에 넣고 ack(안 하면 장비가 계속 다시 보낸다).
// - 배치가 데이터 오류(SQLSTATE 22xxx·23xxx)로 실패하면 하나씩 따로 — 혼자서도 데이터 오류인 것만 bad_message 로
//   (하나 때문에 보관함이 막히지 않게). 그 밖(연결 끊김·시간 초과·직렬화 충돌 …)은 버리지 않고 500(장비가 다시 보낸다).
// - 이미 bad_message 에 있는 id 는 다시 처리하지 않고 바로 acked(같은 묶음이 다시 와도 빠르게).
import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "@/app/generated/prisma/client";
import { ops2Db } from "@/lib/ops2/db";
import { closeOthers } from "@/lib/ops2/hub";

export const LEASE_MS = 30_000;
const SCHEMA_RETRY_MS = 10 * 60_000;   // 해시가 다른 webSchema 를 받은 뒤 다시 달라고 하지 않는 시간
const RAW_MAX = 64 * 1024;

export function ingestMaxBytes(): number {
  const v = Number(process.env.OPS2_INGEST_MAX_BYTES);
  return Number.isInteger(v) && v > 0 ? v : 2 * 1024 * 1024;
}

type Obj = Record<string, unknown>;
type Tx = Prisma.TransactionClient;

export type Envelope = { id: string; instance: string; seq: number; ts: Date; type: string; data: Obj };
type Bad = { id: string; ackId: string | null; instance: string | null; reason: string; raw: unknown };

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
// 정수 칸은 int4 — 범위 밖이면 null(필수 칸이면 bad).
const int = (v: unknown): number | null =>
  typeof v === "number" && Number.isInteger(v) && v >= -2147483648 && v <= 2147483647 ? v : null;
const json = (v: unknown) => v as Prisma.InputJsonValue;
const webId = () => `web-${randomUUID().replace(/-/g, "")}`;

// 시각은 1900~2200년 안만(밖이면 null — 필수 칸이면 bad).
const TS_MIN = Date.UTC(1900, 0, 1);
const TS_MAX = Date.UTC(2200, 0, 1);
function parseIso(v: unknown): Date | null {
  if (typeof v !== "string" || !v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) && t >= TS_MIN && t < TS_MAX ? new Date(t) : null;
}

/** 문자열(객체 키 포함)의 NUL(\u0000)을 지운다 — text·jsonb 가 받지 못해 묶음 전체가 실패하므로. JSON.parse 직후에. */
export function stripNul(v: unknown): unknown {
  if (typeof v === "string") return v.includes("\u0000") ? v.replaceAll("\u0000", "") : v;
  if (Array.isArray(v)) return v.map(stripNul);
  if (isObj(v)) {
    const out: Obj = {};
    for (const [k, x] of Object.entries(v)) out[k.includes("\u0000") ? k.replaceAll("\u0000", "") : k] = stripNul(x);
    return out;
  }
  return v;
}

/** Prisma·드라이버 어댑터 오류의 SQLSTATE(없으면 null — 연결 끊김·시간 초과 등). */
export function sqlState(e: unknown): string | null {
  const x = e as { cause?: { originalCode?: unknown }; meta?: { driverAdapterError?: { cause?: { originalCode?: unknown } } } };
  const c = x?.cause?.originalCode ?? x?.meta?.driverAdapterError?.cause?.originalCode;
  return typeof c === "string" ? c : null;
}
const isDataError = (code: string | null) => !!code && /^2[23][0-9A-Z]{3}$/.test(code);

// type 별로 저장에 꼭 필요한 것만 본다(계약의 required 중 장비가 null 을 보내기도 하는 것 — id 없는
// 노트북 명령의 cmd_result.cmdId 등 — 은 허용).
type FT = "str" | "int" | "obj" | "iso";
const REQUIRED: Record<string, [string, FT][]> = {
  hello: [["equipment", "str"], ["instance", "str"], ["webSchemaHash", "str"]],
  state: [],
  event: [["level", "str"], ["code", "str"], ["message", "str"]],
  run_start: [["runId", "str"]],
  run_end: [["runId", "str"]],
  snapshot_summary: [["from", "iso"], ["to", "iso"], ["rows", "int"], ["values", "obj"], ["quality", "obj"]],
  cmd_result: [["kind", "str"], ["status", "str"]],
  config_ack: [["status", "str"]],
};

function fieldOk(v: unknown, t: FT): boolean {
  if (t === "str") return typeof v === "string";
  if (t === "int") return int(v) !== null;
  if (t === "obj") return isObj(v);
  return parseIso(v) !== null;
}

function badOf(raw: unknown, reason: string): Bad {
  const rawId = isObj(raw) ? str(raw.id) : null;
  const id = rawId && rawId.length <= 200
    ? rawId
    : `bad-${createHash("sha256").update(JSON.stringify(raw) ?? "").digest("hex").slice(0, 32)}`;
  return { id, ackId: rawId, instance: isObj(raw) ? str(raw.instance) : null, reason, raw };
}

/** envelope 하나 검사. */
export function parseEnvelope(raw: unknown, equipment: string): { env: Envelope } | { bad: Bad } {
  const fail = (reason: string) => ({ bad: badOf(raw, reason) });
  if (!isObj(raw)) return fail("envelope 이 객체가 아님");
  const id = str(raw.id);
  if (!id || id.length > 64) return fail("id 형식(문자열 1~64)");
  const instance = str(raw.instance);
  if (!instance) return fail("instance 없음");
  const seq = int(raw.seq);
  if (seq === null) return fail("seq 형식(int32 정수)");
  const ts = parseIso(raw.ts);
  if (!ts) return fail("ts 형식(ISO, 1900~2200년)");
  const type = str(raw.type);
  const req = type ? REQUIRED[type] : undefined;
  if (!type || !req) return fail(`모르는 type ${String(raw.type).slice(0, 40)}`);
  if (!isObj(raw.data)) return fail("data 가 객체가 아님");
  for (const [k, t] of req) {
    if (!fieldOk(raw.data[k], t)) return fail(`${type}.data.${k} 형식(${t})`);
  }
  if (type === "hello" && raw.data.equipment !== equipment) {
    return fail(`hello.data.equipment(${String(raw.data.equipment).slice(0, 20)}) ≠ ${equipment}`);
  }
  return { env: { id, instance, seq, ts, type, data: raw.data } };
}

function rawText(raw: unknown): string {
  const s = typeof raw === "string" ? raw : JSON.stringify(raw) ?? String(raw);
  return s.length > RAW_MAX ? s.slice(0, RAW_MAX) : s;
}

// ───────────── lease ─────────────
export type Lease =
  | { ok: true; prev: string | null; prevSeen: Date | null }
  | { ok: false; holder: string | null; quietMs: number | null };

/** 조건부 UPDATE 한 문장 — 동시에 와도 주인은 하나(경합하면 PostgreSQL 이 바뀐 행으로 조건을 다시 본다). */
export async function claimLease(equipment: string, instance: string, now: Date): Promise<Lease> {
  const stale = new Date(now.getTime() - LEASE_MS);
  const won = await ops2Db.$queryRaw<{ prev: string | null; prev_seen: Date | null }[]>`
    WITH prev AS (SELECT holder_instance, holder_seen_at FROM "process"."ops2_device" WHERE equipment = ${equipment})
    UPDATE "process"."ops2_device" d
       SET holder_instance = ${instance}, holder_seen_at = ${now}, last_seen_at = ${now}
     WHERE d.equipment = ${equipment}
       AND (d.holder_instance IS NULL OR d.holder_instance = ${instance}
            OR d.holder_seen_at IS NULL OR d.holder_seen_at < ${stale})
    RETURNING (SELECT holder_instance FROM prev) AS prev, (SELECT holder_seen_at FROM prev) AS prev_seen`;
  if (won.length) {
    const { prev, prev_seen } = won[0];
    closeOthers(equipment, instance);                  // 주인이 바뀌었으면(넘겨받음·주인 비우기 뒤) 다른 실행의 SSE 를 닫는다
    if (prev && prev !== instance) {
      const silentSec = prev_seen ? Math.round((now.getTime() - prev_seen.getTime()) / 1000) : null;
      await ops2Db.ops2Event.create({
        data: {
          msgId: webId(), equipment, instance, seq: 0, ts: now, receivedAt: now, level: "info",
          code: "INSTANCE_TAKEOVER",
          message: `실행 ${prev.slice(0, 8)} → ${instance.slice(0, 8)} 넘겨받음(이전 실행 ${silentSec ?? "?"} s 조용)`,
          source: "web", kind: "lease", context: { from: prev, to: instance, silentSec },
        },
      });
    }
    return { ok: true, prev, prevSeen: prev_seen };
  }
  // 409 — 사건은 남기지 않는다(장비가 10 s 마다 다시 오므로). 마지막 409 만 장비 행에.
  const cur = await ops2Db.$queryRaw<{ holder_instance: string | null; holder_seen_at: Date | null }[]>`
    UPDATE "process"."ops2_device" SET conflict_instance = ${instance}, conflict_at = ${now}
     WHERE equipment = ${equipment}
    RETURNING holder_instance, holder_seen_at`;
  const seen = cur[0]?.holder_seen_at ?? null;
  return { ok: false, holder: cur[0]?.holder_instance ?? null, quietMs: seen ? now.getTime() - seen.getTime() : null };
}

// ───────────── 배치 ─────────────
// 해시가 다른 webSchema 를 받았을 때 그 해시로는 한동안 needWebSchema 를 주지 않는다(200 KB 무한 반복 방지).
const g = globalThis as unknown as { __ops2SchemaHold?: Map<string, number> };
const schemaHold = (g.__ops2SchemaHold ??= new Map<string, number>());

type Ctx = { equipment: string; instance: string; now: Date };

/** 메시지 묶음 하나를 트랜잭션 하나로. 돌려주는 값 = acked(커밋되면 유효) */
async function applyBatch(tx: Tx, ctx: Ctx, raws: unknown[]): Promise<string[]> {
  const { equipment, now } = ctx;
  const ok: Envelope[] = [];
  const bads: Bad[] = [];
  for (const raw of raws) {
    const r = parseEnvelope(raw, equipment);
    if ("env" in r) ok.push(r.env);
    else bads.push(r.bad);
  }
  const of = (t: string) => ok.filter((e) => e.type === t);
  const hellos = of("hello");
  const states = of("state");
  const runMsgs = ok.filter((e) => e.type === "run_start" || e.type === "run_end");
  const events = of("event");
  const sums = of("snapshot_summary");
  const results = of("cmd_result");
  const acks = of("config_ack");
  const devicePatch: Prisma.Ops2DeviceUpdateInput = {};

  // ── hello: 실행·장비 정보, 웹 묶음, 설정 첫 기준값(장비 현재값) ──
  for (const h of hellos) {
    const { webSchema, ...d } = h.data;
    const fields = {
      program: str(d.program), version: str(d.version), runMode: str(d.runMode), schemaHash: str(d.schemaHash),
      webSchemaHash: d.webSchemaHash as string, configVersion: int(d.configVersion),
      snapshotColumns: Array.isArray(d.snapshotColumns) ? json(d.snapshotColumns) : undefined,
      commandKinds: Array.isArray(d.commandKinds) ? json(d.commandKinds) : undefined,
      writesAllowed: typeof d.writesAllowed === "boolean" ? d.writesAllowed : null,
      helloAt: now, lastSeenAt: now,
    };
    // 다른 실행 앞으로 만든 pending 은 보내지 않는다(sent 는 그대로 — 그 실행의 cmd_result 가 보관함에서 늦게 올 수 있음)
    await tx.ops2Command.updateMany({
      where: { equipment, status: "pending", NOT: { targetInstance: h.instance } },
      data: { status: "expired", reasonCode: "INSTANCE_CHANGED", resultAt: now },
    });
    await tx.ops2Instance.upsert({
      where: { instance: h.instance },
      create: { instance: h.instance, equipment, firstSeenAt: now, ...fields },
      update: fields,
    });
    const deviceUtc = parseIso(d.deviceUtc);
    Object.assign(devicePatch, {
      runMode: fields.runMode, program: fields.program, version: fields.version, schemaHash: fields.schemaHash,
      webSchemaHash: fields.webSchemaHash, configVersion: fields.configVersion, writesAllowed: fields.writesAllowed,
      lastHello: json(d), lastHelloAt: now,
      ...(deviceUtc ? { clockSkewMs: deviceUtc.getTime() - now.getTime() } : {}),
    });

    if (isObj(webSchema)) {
      const hash = d.webSchemaHash as string;
      if (webSchema.hash === hash) {
        await tx.ops2WebSchema.createMany({
          data: [{ hash, version: int(webSchema.version), paramSchemaHash: str(webSchema.paramSchemaHash),
                   bundle: json(webSchema), firstEquipment: equipment, receivedAt: now }],
          skipDuplicates: true,
        });
        const hasBase = await tx.ops2ConfigVersion.findFirst({ where: { equipment }, select: { version: true } });
        if (!hasBase) {
          const values: Obj = {};
          for (const p of Array.isArray(webSchema.params) ? webSchema.params : []) {
            if (isObj(p) && typeof p.key === "string" && p.scope !== "secret") values[p.key] = p.current ?? null;
          }
          await tx.ops2ConfigVersion.createMany({
            data: [{ equipment, version: int(d.configVersion) ?? 0, kind: "import", paramValues: json(values),
                     paramSchemaHash: str(webSchema.paramSchemaHash), createdBy: "device", createdAt: now }],
            skipDuplicates: true,
          });
        }
      } else {
        schemaHold.set(hash, now.getTime() + SCHEMA_RETRY_MS);
        bads.push({ id: `schema-${h.id}`, ackId: null, instance: h.instance,
                    reason: `webSchema 해시 불일치(묶음 ${String(webSchema.hash).slice(0, 12)} ≠ hello ${hash.slice(0, 12)}) — 저장하지 않음`,
                    raw: { id: h.id, bundleHash: webSchema.hash, helloHash: hash } });
      }
    }
  }

  // ── 받지 못한 것 ──
  if (bads.length) {
    await tx.ops2BadMessage.createMany({
      data: bads.map((b) => ({ id: b.id, equipment, instance: b.instance, receivedAt: now, reason: b.reason,
                               raw: rawText(b.raw) })),
      skipDuplicates: true,
    });
  }

  // ── 사건이 붙을 열린 run: 배치 전 DB 상태에서 시작해 배치 순서대로 따라간다 ──
  const evInstances = [...new Set(events.map((e) => e.instance))];
  const openRun = new Map<string, string>();
  if (evInstances.length) {
    const open = await tx.ops2Run.findMany({
      where: { equipment, instance: { in: evInstances }, endedAt: null, startedAt: { not: null } },
      orderBy: { startedAt: "desc" },
      select: { runId: true, instance: true },
    });
    for (const r of open) if (!openRun.has(r.instance)) openRun.set(r.instance, r.runId);
  }
  const eventRun = new Map<string, string | null>();
  for (const e of ok) {
    if (e.type === "run_start") openRun.set(e.instance, e.data.runId as string);
    else if (e.type === "run_end" && openRun.get(e.instance) === e.data.runId) openRun.delete(e.instance);
    else if (e.type === "event") {
      const ctxObj = isObj(e.data.context) ? e.data.context : null;
      const cd = ctxObj && isObj(ctxObj.data) ? ctxObj.data : null;
      eventRun.set(e.id, (cd && str(cd.run_id)) || openRun.get(e.instance) || null);
    }
  }

  // ── 공정(run): run_start·run_end 가 어느 순서로 와도 한 행 ──
  if (runMsgs.length) {
    const ids = [...new Set(runMsgs.map((e) => e.data.runId as string))];
    const have = new Map((await tx.ops2Run.findMany({
      where: { runId: { in: ids } }, select: { runId: true, startMsgId: true, endMsgId: true },
    })).map((r) => [r.runId, r]));
    const creates = new Map<string, Prisma.Ops2RunCreateManyInput>();
    const updates = new Map<string, Prisma.Ops2RunUpdateInput>();
    for (const e of runMsgs) {
      const runId = e.data.runId as string;
      const d = e.data;
      const isStart = e.type === "run_start";
      const fields = isStart
        ? { startMsgId: e.id, recipeName: str(d.recipeName), startedBy: str(d.by), name: str(d.name),
            stepNo: int(d.stepNo), params: isObj(d.params) ? json(d.params) : undefined,
            blocks: Array.isArray(d.blocks) ? json(d.blocks) : undefined, configVersion: int(d.configVersion),
            startedAt: e.ts }
        : { endMsgId: e.id, endedAt: e.ts, result: str(d.result), reasonCode: str(d.reasonCode),
            summary: isObj(d.summary) ? json(d.summary) : undefined };
      const cur = have.get(runId);
      if (cur) {
        if (isStart ? cur.startMsgId : cur.endMsgId) continue;              // 이미 받음(같은 메시지 다시 등)
        if (isStart) cur.startMsgId = e.id; else cur.endMsgId = e.id;
        updates.set(runId, { ...updates.get(runId), ...fields });
      } else {
        const c = creates.get(runId);
        if (c && (isStart ? c.startMsgId : c.endMsgId)) continue;
        creates.set(runId, { ...(c ?? { runId, equipment, instance: e.instance }), ...fields });
      }
    }
    if (creates.size) await tx.ops2Run.createMany({ data: [...creates.values()], skipDuplicates: true });
    for (const [runId, data] of updates) await tx.ops2Run.update({ where: { runId }, data });
  }

  // ── 사건 ──
  if (events.length) {
    await tx.ops2Event.createMany({
      data: events.map((e) => {
        const d = e.data;
        const c = isObj(d.context) ? d.context : null;
        return {
          msgId: e.id, equipment, instance: e.instance, seq: e.seq, runId: eventRun.get(e.id) ?? null, ts: e.ts,
          receivedAt: now, level: d.level as string, code: d.code as string, ruleId: str(d.ruleId),
          message: d.message as string, source: c ? str(c.source) : null, kind: c ? str(c.kind) : null,
          context: c ? json(c) : undefined,
        };
      }),
      skipDuplicates: true,
    });
  }

  // ── 1분 요약: 공정 중인 것만(같은 장비·instance 의 run 중 started_at < to, ended_at 없음 또는 > from) ──
  if (sums.length) {
    const span = sums.map((e) => ({ e, from: parseIso(e.data.from)!, to: parseIso(e.data.to)! }));
    const maxTo = new Date(Math.max(...span.map((s) => s.to.getTime())));
    const minFrom = new Date(Math.min(...span.map((s) => s.from.getTime())));
    const runs = await tx.ops2Run.findMany({
      where: { equipment, instance: { in: [...new Set(sums.map((e) => e.instance))] },
               startedAt: { lt: maxTo }, OR: [{ endedAt: null }, { endedAt: { gt: minFrom } }] },
      orderBy: { startedAt: "desc" },
      select: { runId: true, instance: true, startedAt: true, endedAt: true },
    });
    const keep = span.flatMap(({ e, from, to }) => {
      const r = runs.find((x) => x.instance === e.instance && x.startedAt! < to && (!x.endedAt || x.endedAt > from));
      return r ? [{ msgId: e.id, equipment, instance: e.instance, runId: r.runId, fromTs: from, toTs: to,
                    rowCount: e.data.rows as number, stats: json(e.data.values), quality: json(e.data.quality) }] : [];
    });
    if (keep.length) await tx.ops2Summary.createMany({ data: keep, skipDuplicates: true });
  }

  // ── 명령 결과: 같은 장비·id 의 명령이 있으면 결과 칸, 없으면 새 행(노트북 명령 등) ──
  if (results.length) {
    const idOf = (e: Envelope) => str(e.data.cmdId) || `hmi-${e.id}`;
    const have = new Map((await tx.ops2Command.findMany({
      where: { equipment, id: { in: [...new Set(results.map(idOf))] } },
      select: { id: true, resultMsgId: true },
    })).map((c) => [c.id, c]));
    const creates = new Map<string, Prisma.Ops2CommandCreateManyInput>();
    for (const e of results) {
      const d = e.data;
      const id = idOf(e);
      const result = { status: d.status as string, reasonCode: str(d.reasonCode), detail: str(d.detail),
                       resultAt: e.ts, resultMsgId: e.id, resultInstance: e.instance };
      const cur = have.get(id);
      if (cur) {
        if (cur.resultMsgId === e.id) continue;
        cur.resultMsgId = e.id;
        await tx.ops2Command.updateMany({ where: { id, equipment }, data: result });
      } else if (!creates.has(id)) {
        creates.set(id, { id, equipment, targetInstance: e.instance, origin: str(d.source) ?? "hmi",
                          kind: d.kind as string, args: {}, requestedBy: str(d.by) ?? "local", requestedAt: e.ts,
                          ...result });
      }
    }
    if (creates.size) await tx.ops2Command.createMany({ data: [...creates.values()], skipDuplicates: true });
  }

  // ── 설정 결과: (장비, 버전) 행이 있으면 ack 칸, 없으면 사건 CONFIG_ACK ──
  if (acks.length) {
    const versions = [...new Set(acks.map((e) => int(e.data.version)).filter((v): v is number => v !== null))];
    const have = new Map((await tx.ops2ConfigVersion.findMany({
      where: { equipment, version: { in: versions } }, select: { version: true, ackMsgId: true },
    })).map((r) => [r.version, r]));
    const loose: Prisma.Ops2EventCreateManyInput[] = [];
    for (const e of acks) {
      const d = e.data;
      const v = int(d.version);
      const cur = v === null ? undefined : have.get(v);
      if (cur) {
        if (cur.ackMsgId === e.id) continue;
        cur.ackMsgId = e.id;
        await tx.ops2ConfigVersion.update({
          where: { equipment_version: { equipment, version: v! } },
          data: { ackStatus: d.status as string, ackAt: e.ts, reasonCode: str(d.reasonCode), ackMsgId: e.id,
                  errors: Array.isArray(d.errors) ? json(d.errors) : undefined,
                  appliedKeys: Array.isArray(d.appliedKeys) ? json(d.appliedKeys) : undefined,
                  pendingKeys: Array.isArray(d.pendingKeys) ? json(d.pendingKeys) : undefined,
                  overriddenKeys: Array.isArray(d.overriddenKeys) ? json(d.overriddenKeys) : undefined,
                  changes: Array.isArray(d.changes) ? json(d.changes) : undefined },
        });
      } else {
        loose.push({ msgId: e.id, equipment, instance: e.instance, seq: e.seq, ts: e.ts, receivedAt: now,
                     level: d.status === "rejected" ? "warn" : "info", code: "CONFIG_ACK",
                     message: `설정 버전 ${v ?? "?"} ${String(d.status)}${d.reasonCode ? ` (${String(d.reasonCode)})` : ""}`,
                     source: "config", kind: str(d.kind), context: json(d) });
      }
    }
    if (loose.length) await tx.ops2Event.createMany({ data: loose, skipDuplicates: true });
  }

  // ── 최신 state(배치의 마지막 것) ──
  const st = states.length ? states[states.length - 1] : null;
  if (st) {
    const row = { instance: st.instance, msgId: st.id, seq: st.seq, ts: st.ts, receivedAt: now,
                  procState: str(st.data.procState), runId: str(st.data.runId), data: json(st.data) };
    await tx.ops2State.upsert({ where: { equipment }, create: { equipment, ...row }, update: row });
    // 시계 차: hello 가 없으면 state ts 로(state 는 최대 1 s 늦게 만들어진 것)
    if (!hellos.length) devicePatch.clockSkewMs = st.ts.getTime() - now.getTime();
  }

  if (Object.keys(devicePatch).length) await tx.ops2Device.update({ where: { equipment }, data: devicePatch });
  await tx.ops2Instance.updateMany({ where: { instance: ctx.instance }, data: { lastSeenAt: now } });

  return [
    ...ok.filter((e) => e.type !== "state" && e.type !== "hello").map((e) => e.id),
    ...bads.map((b) => b.ackId).filter((v): v is string => !!v),
  ];
}

const TX_OPTS = { timeout: 10_000, maxWait: 5_000 };

export type IngestResult = { acked: string[]; needWebSchema: boolean; fallback: number };

export async function processIngest(ctx: Ctx, all: unknown[]): Promise<IngestResult> {
  // 이미 bad_message 에 있는 id 는 다시 처리하지 않고 acked
  const rawIds = [...new Set(all.flatMap((m) => (isObj(m) && typeof m.id === "string" ? [m.id] : [])))];
  const known = new Set(rawIds.length
    ? (await ops2Db.ops2BadMessage.findMany({ where: { id: { in: rawIds } }, select: { id: true } })).map((b) => b.id)
    : []);
  const messages = known.size ? all.filter((m) => !(isObj(m) && known.has(m.id as string))) : all;

  let acked: string[] = [...known];
  let fallback = 0;
  try {
    acked.push(...await ops2Db.$transaction((tx) => applyBatch(tx, ctx, messages), TX_OPTS));
  } catch (batchErr) {
    // 데이터 오류일 때만 하나씩 따로. 혼자서도 데이터 오류면 bad_message 로 넣고 ack.
    // 그 밖(연결 끊김·시간 초과·40001·40P01·코드 없음)은 던진다(500 — 장비가 나중에 다시 보낸다).
    const code = sqlState(batchErr);
    if (!isDataError(code)) throw batchErr;
    console.error("[ops2/ingest] 배치 실패 — 하나씩 처리", ctx.equipment, code);
    acked = [...known];
    for (const raw of messages) {
      try {
        acked.push(...await ops2Db.$transaction((tx) => applyBatch(tx, ctx, [raw]), TX_OPTS));
      } catch (e) {
        const one = sqlState(e);
        if (!isDataError(one)) throw e;
        fallback += 1;
        const b = badOf(raw, `처리 실패 SQLSTATE ${one}: ${String((e as Error)?.message ?? e).slice(0, 300)}`);
        await ops2Db.ops2BadMessage.createMany({
          data: [{ id: b.id, equipment: ctx.equipment, instance: b.instance, receivedAt: ctx.now, reason: b.reason,
                   raw: rawText(raw) }],
          skipDuplicates: true,
        });
        if (b.ackId) acked.push(b.ackId);
      }
    }
  }

  // needWebSchema 는 hello 가 있는 POST 만: 묶음이 없거나 이 장비의 설정 기준값이 없으면
  let needWebSchema = false;
  const hello = messages
    .map((m) => parseEnvelope(m, ctx.equipment))
    .flatMap((r) => ("env" in r && r.env.type === "hello" ? [r.env] : []))
    .pop();
  if (hello) {
    const hash = hello.data.webSchemaHash as string;
    const hold = schemaHold.get(hash);
    if (!hold || hold < ctx.now.getTime()) {
      const [ws, base] = await Promise.all([
        ops2Db.ops2WebSchema.findUnique({ where: { hash }, select: { hash: true } }),
        ops2Db.ops2ConfigVersion.findFirst({ where: { equipment: ctx.equipment }, select: { version: true } }),
      ]);
      needWebSchema = !ws || !base;
    }
  }
  return { acked, needWebSchema, fallback };
}
