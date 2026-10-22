// 챔버K v2 장비 → 웹 받기(POST /api/ops2/uplink/ingest). 계약은 v2 common/messages.py 독스트링.
// - 배치 하나 = 트랜잭션 하나. 커밋 뒤에만 acked(이미 있던 id 도 넣는다). state 는 ack 하지 않는다.
// - type 별 표의 msg_id UNIQUE 로 한 번만 저장(createMany skipDuplicates) — 뒤따르는 처리는 새로 들어간 행에만.
// - 형식이 틀린 envelope 은 ops2_bad_message 에 넣고 ack 한다(안 하면 장비가 계속 다시 보낸다).
// - 같은 장비 ID 의 두 실행: lease. 주인이 없거나·같은 실행이거나·주인이 LEASE_MS 넘게 조용하면 받는다.
//   그 밖은 hello 가 있어도 409(v2 는 다시 연결할 때마다 hello 를 보내므로 v1 처럼 "hello 면 인수" 를 쓰지 않는다).
import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export const LEASE_MS = 30_000;
export const INGEST_BODY_MAX = 2 * 1024 * 1024;   // 넘으면 413 — 장비가 반으로 나눠 다시 보낸다

type Obj = Record<string, unknown>;

export type Envelope = {
  id: string;
  instance: string;
  seq: number;
  ts: Date;
  type: string;
  data: Obj;
};

type Bad = { id: string; ackId: string | null; instance: string | null; error: string; raw: unknown };

export class LeaseConflict extends Error {
  constructor(public holder: string, public quietMs: number) {
    super("another instance is active");
  }
}

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const int = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) ? v : null);
const json = (v: unknown) => v as Prisma.InputJsonValue;
const ID_RE = /^[A-Za-z0-9_-]{1,100}$/;

function parseIso(v: unknown): Date | null {
  if (typeof v !== "string" || !v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t) : null;
}

// type 별로 저장에 꼭 필요한 것만 본다(계약의 required 중 장비가 null 을 보내기도 하는 것 — HMI cmd_result 의 cmdId 등 — 은 허용).
const REQUIRED: Record<string, [string, "str" | "int" | "obj" | "iso"][]> = {
  hello: [["instance", "str"], ["webSchemaHash", "str"]],
  state: [],
  event: [["level", "str"], ["code", "str"], ["message", "str"]],
  run_start: [["runId", "str"]],
  run_end: [["runId", "str"]],
  snapshot_summary: [["from", "iso"], ["to", "iso"], ["rows", "int"], ["values", "obj"], ["quality", "obj"]],
  cmd_result: [["kind", "str"], ["status", "str"]],
  config_ack: [["status", "str"]],
};

function checkField(v: unknown, t: "str" | "int" | "obj" | "iso"): boolean {
  if (t === "str") return typeof v === "string";
  if (t === "int") return int(v) !== null;
  if (t === "obj") return isObj(v);
  return parseIso(v) !== null;
}

/** envelope 하나 검사 — 통과하면 Envelope, 아니면 Bad. */
export function parseEnvelope(raw: unknown): { env: Envelope } | { bad: Bad } {
  const rawId = isObj(raw) ? str(raw.id) : null;
  const ackId = rawId;
  const badId = rawId && rawId.length <= 200
    ? rawId
    : `bad-${createHash("sha256").update(JSON.stringify(raw) ?? "").digest("hex").slice(0, 32)}`;
  const fail = (error: string) => ({
    bad: { id: badId, ackId, instance: isObj(raw) ? str(raw.instance) : null, error, raw },
  });
  if (!isObj(raw)) return fail("envelope 이 객체가 아님");
  if (!rawId || !ID_RE.test(rawId)) return fail("id 형식");
  const instance = str(raw.instance);
  if (!instance) return fail("instance 없음");
  const seq = int(raw.seq);
  if (seq === null) return fail("seq 형식");
  const ts = parseIso(raw.ts);
  if (!ts) return fail("ts 형식");
  const type = str(raw.type);
  if (!type) return fail("type 없음");
  if (!isObj(raw.data)) return fail("data 가 객체가 아님");
  const req = REQUIRED[type];
  if (!req) return fail(`모르는 type ${type.slice(0, 40)}`);
  for (const [k, t] of req) {
    if (!checkField(raw.data[k], t)) return fail(`${type}.data.${k} 형식(${t})`);
  }
  return { env: { id: rawId, instance, seq, ts, type, data: raw.data } };
}

// 큰 원본은 잘라서 넣는다(형식 틀린 메시지 기록이 DB 를 키우지 않게)
function rawForStore(raw: unknown): Prisma.InputJsonValue {
  const s = JSON.stringify(raw) ?? "null";
  if (s.length <= 64 * 1024) return json(raw ?? null);
  return { truncated: true, bytes: s.length, head: s.slice(0, 4000) };
}

export type IngestInput = {
  equipment: string;
  instance: string;
  schemaHash: string | null;
  messages: unknown[];
};

export type IngestResult = { acked: string[]; needWebSchema: boolean };

export async function processIngest(input: IngestInput): Promise<IngestResult> {
  const { equipment, instance } = input;
  const now = new Date();

  const valid: Envelope[] = [];
  const bads: Bad[] = [];
  for (const raw of input.messages) {
    const r = parseEnvelope(raw);
    if ("env" in r) valid.push(r.env);
    else bads.push(r.bad);
  }

  const hellos = valid.filter((e) => e.type === "hello");
  const states = valid.filter((e) => e.type === "state");
  const lastState = states.length ? states[states.length - 1] : null;
  const lastHello = hellos.length ? hellos[hellos.length - 1] : null;
  const byType = (t: string) => valid.filter((e) => e.type === t);

  let needWebSchema = false;

  await prisma.$transaction(async (tx) => {
    // ── lease: 장비 행을 잠그고 판정(같은 장비의 ingest 는 여기서 한 줄로 선다) ──
    const rows = await tx.$queryRaw<{ holder_instance: string | null; holder_seen_at: Date | null }[]>`
      SELECT holder_instance, holder_seen_at FROM "process"."ops2_device" WHERE equipment = ${equipment} FOR UPDATE`;
    const prev = rows[0]?.holder_instance ?? null;
    const seenAt = rows[0]?.holder_seen_at ?? null;
    const quietMs = seenAt ? now.getTime() - seenAt.getTime() : Infinity;
    if (prev && prev !== instance && quietMs <= LEASE_MS) {
      throw new LeaseConflict(prev, quietMs);
    }
    if (prev && prev !== instance) {
      const q = Number.isFinite(quietMs) ? Math.round(quietMs / 1000) : null;
      await tx.ops2Event.create({
        data: {
          msgId: `web-${randomUUID().replace(/-/g, "")}`,
          equipment, instance, ts: now, receivedAt: now, level: "warn", code: "INSTANCE_TAKEOVER",
          message: `실행 ${prev.slice(0, 8)} → ${instance.slice(0, 8)} 넘겨받음(이전 실행 ${q ?? "?"} s 조용)`,
          source: "web", kind: "takeover", context: { from: prev, to: instance, quietSec: q },
        },
      });
    }

    const device: Prisma.Ops2DeviceUpdateInput = {
      holderInstance: instance, holderSeenAt: now, lastSeenAt: now,
      ...(input.schemaHash ? { schemaHash: input.schemaHash } : {}),
    };

    // ── hello: 실행 이력·장비 정보·웹 묶음 ──
    for (const h of hellos) {
      const { webSchema, ...rest } = h.data;
      await tx.ops2Instance.upsert({
        where: { instance: h.instance },
        create: {
          instance: h.instance, equipment, program: str(rest.program), version: str(rest.version),
          runMode: str(rest.runMode), firstSeenAt: now, lastSeenAt: now, hello: json(rest),
        },
        update: { lastSeenAt: now, program: str(rest.program), version: str(rest.version),
                  runMode: str(rest.runMode), hello: json(rest) },
      });
      const hash = rest.webSchemaHash as string;
      if (isObj(webSchema)) {
        if (webSchema.hash === hash) {
          await tx.ops2WebSchema.createMany({
            data: [{ hash, version: int(webSchema.version), paramSchemaHash: str(webSchema.paramSchemaHash),
                     configVersion: int(webSchema.configVersion), bundle: json(webSchema),
                     firstEquipment: equipment, receivedAt: now }],
            skipDuplicates: true,
          });
        } else {
          // 다시 달라고 하지 않는다(같은 묶음이 매초 다시 오는 것을 막는다)
          await tx.ops2Event.create({
            data: {
              msgId: `web-${randomUUID().replace(/-/g, "")}`, equipment, instance: h.instance, ts: now, receivedAt: now,
              level: "warn", code: "WEB_SCHEMA_HASH_MISMATCH",
              message: `webSchema 묶음 해시(${String(webSchema.hash).slice(0, 12)})가 hello 의 해시(${hash.slice(0, 12)})와 다름 — 저장하지 않음`,
              source: "web", kind: "web_schema",
            },
          });
        }
      }
    }
    if (lastHello) {
      const d = lastHello.data;
      const { webSchema: _omit, ...rest } = d;
      void _omit;
      const deviceUtc = parseIso(d.deviceUtc);
      Object.assign(device, {
        runMode: str(d.runMode), writesAllowed: typeof d.writesAllowed === "boolean" ? d.writesAllowed : null,
        program: str(d.program), version: str(d.version), webSchemaHash: d.webSchemaHash as string,
        configVersion: int(d.configVersion), lastHello: json(rest),
        ...(str(d.schemaHash) ? { schemaHash: str(d.schemaHash) } : {}),
        ...(deviceUtc ? { clockSkewMs: deviceUtc.getTime() - now.getTime(), clockCheckedAt: now } : {}),
      });
      if (!isObj(d.webSchema)) {
        const known = await tx.ops2WebSchema.findUnique({ where: { hash: d.webSchemaHash as string }, select: { hash: true } });
        needWebSchema = !known;
      }
    }

    // ── 형식이 틀린 것 ──
    if (bads.length) {
      await tx.ops2BadMessage.createMany({
        data: bads.map((b) => ({ id: b.id, equipment, instance: b.instance, receivedAt: now, error: b.error,
                                 raw: rawForStore(b.raw) })),
        skipDuplicates: true,
      });
    }

    // ── 공정(run): run_end 가 먼저 와도 행을 만들고, 나중 run_start 가 시작 쪽을 채운다 ──
    for (const e of valid) {
      if (e.type === "run_start") {
        const d = e.data;
        const start = {
          startMsgId: e.id, recipeName: str(d.recipeName), startedBy: str(d.by), name: str(d.name),
          stepNo: int(d.stepNo), params: isObj(d.params) ? json(d.params) : undefined,
          blocks: Array.isArray(d.blocks) ? json(d.blocks) : undefined, configVersion: int(d.configVersion),
          startedAt: e.ts,
        };
        const c = await tx.ops2Run.createMany({
          data: [{ equipment, runId: d.runId as string, instance: e.instance, ...start }], skipDuplicates: true,
        });
        if (c.count === 0) {
          await tx.ops2Run.updateMany({ where: { equipment, runId: d.runId as string, startMsgId: null }, data: start });
        }
      } else if (e.type === "run_end") {
        const d = e.data;
        const end = {
          endMsgId: e.id, endedAt: e.ts, result: str(d.result), reasonCode: str(d.reasonCode),
          summary: isObj(d.summary) ? json(d.summary) : undefined,
        };
        const c = await tx.ops2Run.createMany({
          data: [{ equipment, runId: d.runId as string, instance: e.instance, ...end }], skipDuplicates: true,
        });
        if (c.count === 0) {
          await tx.ops2Run.updateMany({ where: { equipment, runId: d.runId as string, endMsgId: null }, data: end });
        }
      }
    }

    // ── 사건: context.data.run_id → 없으면 같은 instance 의 그 시각에 열린 run ──
    const events = byType("event");
    if (events.length) {
      const runOf = (e: Envelope): string | null => {
        const ctx = isObj(e.data.context) ? e.data.context : null;
        const cd = ctx && isObj(ctx.data) ? ctx.data : null;
        return (cd && str(cd.run_id)) || null;
      };
      const loose = events.filter((e) => !runOf(e));
      let open: { runId: string; instance: string; startedAt: Date | null; endedAt: Date | null }[] = [];
      if (loose.length) {
        const minTs = new Date(Math.min(...loose.map((e) => e.ts.getTime())));
        const maxTs = new Date(Math.max(...loose.map((e) => e.ts.getTime())));
        open = await tx.ops2Run.findMany({
          where: {
            equipment, instance: { in: [...new Set(loose.map((e) => e.instance))] },
            startedAt: { lte: maxTs }, OR: [{ endedAt: null }, { endedAt: { gte: minTs } }],
          },
          select: { runId: true, instance: true, startedAt: true, endedAt: true },
          orderBy: { startedAt: "desc" },
        });
      }
      const openAt = (e: Envelope) =>
        open.find((r) => r.instance === e.instance && r.startedAt && r.startedAt <= e.ts
                         && (!r.endedAt || r.endedAt >= e.ts))?.runId ?? null;

      await tx.ops2Event.createMany({
        data: events.map((e) => {
          const d = e.data;
          const ctx = isObj(d.context) ? d.context : null;
          return {
            msgId: e.id, equipment, instance: e.instance, seq: e.seq, runId: runOf(e) ?? openAt(e),
            ts: e.ts, receivedAt: now, level: d.level as string, code: d.code as string, ruleId: str(d.ruleId),
            message: (d.message as string).slice(0, 2000), source: ctx ? str(ctx.source) : null,
            kind: ctx ? str(ctx.kind) : null, context: ctx ? json(ctx) : undefined,
          };
        }),
        skipDuplicates: true,
      });
    }

    // ── 1분 요약 ──
    const sums = byType("snapshot_summary");
    if (sums.length) {
      await tx.ops2Summary.createMany({
        data: sums.map((e) => ({
          msgId: e.id, equipment, instance: e.instance, fromTs: parseIso(e.data.from)!, toTs: parseIso(e.data.to)!,
          rows: e.data.rows as number, vals: json(e.data.values), quality: json(e.data.quality), receivedAt: now,
        })),
        skipDuplicates: true,
      });
    }

    // ── 명령 결과: 원본 저장. hmi 출처는 명령 표에 origin hmi 행으로(새로 들어간 것만) ──
    const results = byType("cmd_result");
    if (results.length) {
      const fresh = await tx.ops2CmdResult.createManyAndReturn({
        data: results.map((e) => ({
          msgId: e.id, equipment, instance: e.instance, seq: e.seq, ts: e.ts, receivedAt: now,
          cmdId: str(e.data.cmdId), kind: e.data.kind as string, status: e.data.status as string,
          reasonCode: str(e.data.reasonCode), source: str(e.data.source), requestedBy: str(e.data.by),
          detail: str(e.data.detail),
        })),
        skipDuplicates: true,
        select: { msgId: true, instance: true, ts: true, cmdId: true, kind: true, status: true, reasonCode: true,
                  source: true, requestedBy: true, detail: true },
      });
      const hmi = fresh.filter((r) => r.source === "hmi");
      if (hmi.length) {
        await tx.ops2Command.createMany({
          data: hmi.map((r) => ({
            id: `hmi-${r.msgId}`, equipment, targetInstance: r.instance, origin: "hmi", kind: r.kind, args: {},
            requestedBy: r.requestedBy ?? "local", requestedAt: r.ts, status: r.status, resultAt: r.ts,
            reasonCode: r.reasonCode, detail: r.detail, resultMsgId: r.msgId, localCmdId: r.cmdId,
          })),
          skipDuplicates: true,
        });
      }
    }

    // ── 설정 결과: 원본만(버전 반영은 W-5) ──
    const acks = byType("config_ack");
    if (acks.length) {
      await tx.ops2ConfigAck.createMany({
        data: acks.map((e) => ({
          msgId: e.id, equipment, instance: e.instance, ts: e.ts, receivedAt: now, version: int(e.data.version),
          status: e.data.status as string, reasonCode: str(e.data.reasonCode), kind: str(e.data.kind),
          requestedBy: str(e.data.by), data: json(e.data),
        })),
        skipDuplicates: true,
      });
    }

    // ── 최신 state(배치의 마지막 것) ──
    if (lastState) {
      await tx.ops2State.upsert({
        where: { equipment },
        create: { equipment, instance: lastState.instance, msgId: lastState.id, ts: lastState.ts, receivedAt: now,
                  data: json(lastState.data) },
        update: { instance: lastState.instance, msgId: lastState.id, ts: lastState.ts, receivedAt: now,
                  data: json(lastState.data) },
      });
      // 시계 차: hello 가 없으면 state ts 로(state 는 POST 마다 막 만든 것 — 1 s 안쪽으로 늦을 수 있다)
      if (!lastHello) Object.assign(device, { clockSkewMs: lastState.ts.getTime() - now.getTime(), clockCheckedAt: now });
    }

    await tx.ops2Device.update({ where: { equipment }, data: device });
  }, { timeout: 20_000, maxWait: 10_000 });

  const acked = [
    ...valid.filter((e) => e.type !== "state").map((e) => e.id),
    ...bads.map((b) => b.ackId).filter((v): v is string => !!v),
  ];
  return { acked, needWebSchema };
}
