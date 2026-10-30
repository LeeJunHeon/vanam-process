// 챔버K v2 구글챗 알림(W-6) — 웹 서버가 보낸다. 장비는 보내지 않는다(챔버K params Dropped CHAT_WEBHOOK_URL·
// CHAT_WEBHOOK_PLC_DISCONNECT_URL — "웹 서버가 보낸다"). 문구·카드 모양·조건은 v1(챔버K 저장소 main.py _chat_*·
// controller/chat_notifier.py ChatNotifier)과 같게.
// - 보내는 것: 장비 runMode 가 prod 일 때만(hello). sim·bench 는 outbox 에 skipped "보내지 않음(모드 …)"로만.
//   개발 노트북 시험용 OPS2_CHAT_TREAT_AS_PROD=<장비ID,…> 는 개발 모드(next dev)에서만 — 운영 빌드에서는 무시.
// - 주소: 서버 환경변수 OPS2_CHAT_WEBHOOK_<장비ID>(공정 시작·끝·실패 이유), OPS2_CHAT_ALERT_WEBHOOK_<장비ID>(이상·PLC 끊김·
//   장비 연결 끊김). 장비ID 는 대문자, 영숫자 밖은 _(CHK2-SIM → CHK2_SIM). 알림용이 없으면 v1 처럼 공정용으로
//   (v1 notify_plc_link: PLC 전용 주소 or 기본 주소). 둘 다 없으면 skipped "주소 없음". 주소는 기록·화면에 쓰지 않는다.
// - outbox(ops2_chat_outbox): ingest 가 커밋한 뒤 넣는다(msg_id = 원인 envelope id — 같은 원인은 한 번만).
//   받은 지 10 분 넘은 원인(장비 시각을 시계 차로 맞춰 — 끊겼다 몰아서 보낸 것)은 skipped "늦게 받음", 공정 끝만 예외로
//   보내되 카드에 "늦게 받음". 이상 글은 같은 규칙·사유가 공정당 한 번(공정 밖은 10 분에 한 번) — 나머지는 skipped "반복".
// - 보내기: 서버 안 타이머(instrumentation.ts → startChat) — 하나씩, 실패면 30 s·2 분·10 분 뒤 다시, 그 세 번도 실패면 failed.
// - 장비 연결 끊김: 마지막 연락이 OPS2_CHAT_OFFLINE_SEC(기본 180 s) 넘으면 웹이 판단 — 끊김 한 번·다시 연락이 오면 복구 한 번.
// - 챔버12(CH12·CH12-SIM)는 ingest 가 lib/ops2/ch12/chat.ts(enqueueChatCh12 — v1 챔버12 카드)로 넣는다. 보내기·다시 보내기·
//   장비 연결 끊김은 여기 그대로(채널 plc·monitor·client·oes 가 더해짐 — 자기 주소만, 공정용으로 넘어가지 않음).
import { ops2Db } from "@/lib/ops2/db";
import { deviceBundle } from "@/lib/ops2/browser";
import { fmtKst } from "@/lib/ops2/time";
import type { Prisma } from "@/app/generated/prisma/client";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export const LATE_MS = 10 * 60_000;              // 받은 지 이만큼 넘은 원인은 늦게 받음
const REPEAT_MS = 10 * 60_000;                   // 공정 밖 이상 글 — 같은 것은 이만큼에 한 번
export const RETRY_MS = [30_000, 120_000, 600_000];   // 실패 뒤 다시 보내기(세 번 다 실패면 failed)
const SEND_TIMEOUT_MS = 10_000;
const TICK_MS = 5_000;
const WATCH_MS = 15_000;

// 챔버12(CH12) 가 더한 채널 — v1 의 따로 둔 웹훅(PLC 끊김·공정 모니터·로봇 요청 공정·OES 이상). 공정용으로 넘어가지 않는다
// (v1: 주소가 비면 그 알림은 꺼짐). 챔버K 는 process·alert 만 쓴다.
export type Channel = "process" | "alert" | "plc" | "monitor" | "client" | "oes";
export type ChatKind = "run_start" | "run_end" | "run_fail" | "alert" | "plc_link" | "device_link";
const CHANNEL: Record<ChatKind, Channel> = {
  run_start: "process", run_end: "process", run_fail: "process", alert: "alert", plc_link: "alert", device_link: "alert",
};

/** 환경변수 이름의 장비 부분 — CHK2-SIM → CHK2_SIM */
export function envId(equipment: string): string {
  return equipment.toUpperCase().replace(/[^A-Z0-9]/g, "_");
}
export function webhookEnvNames(equipment: string) {
  return { process: `OPS2_CHAT_WEBHOOK_${envId(equipment)}`, alert: `OPS2_CHAT_ALERT_WEBHOOK_${envId(equipment)}` };
}
/** 챔버12 가 더한 채널의 환경변수 이름 — OPS2_CHAT_PLC_WEBHOOK_CH12 등 */
export function extraWebhookEnvNames(equipment: string) {
  const id = envId(equipment);
  return { plc: `OPS2_CHAT_PLC_WEBHOOK_${id}`, monitor: `OPS2_CHAT_MONITOR_WEBHOOK_${id}`,
           client: `OPS2_CHAT_CLIENT_WEBHOOK_${id}`, oes: `OPS2_CHAT_OES_WEBHOOK_${id}` };
}
/** 보낼 주소(없으면 null) — 알림용이 없으면 공정용(v1 과 같음). 챔버12 채널(plc·monitor·client·oes)은 자기 주소만 */
export function webhookOf(equipment: string, ch: Channel): string | null {
  if (ch === "plc" || ch === "monitor" || ch === "client" || ch === "oes") {
    return process.env[extraWebhookEnvNames(equipment)[ch]]?.trim() || null;
  }
  const n = webhookEnvNames(equipment);
  const p = process.env[n.process]?.trim() || null;
  return ch === "alert" ? process.env[n.alert]?.trim() || p : p;
}
/** 주소 있음/없음만(관리 화면). extra = 챔버12 채널(이름·있음) */
export function webhookState(equipment: string) {
  const n = webhookEnvNames(equipment);
  const x = extraWebhookEnvNames(equipment);
  return {
    names: n, process: !!process.env[n.process]?.trim(), alert: !!process.env[n.alert]?.trim(),
    extra: Object.fromEntries(Object.entries(x).map(([k, v]) => [k, { name: v, set: !!process.env[v]?.trim() }])),
  };
}

/** 개발 노트북 시험용 — 개발 모드(next dev)에서만(인증 우회 DEV_AUTH_BYPASS 와 같은 판정: NODE_ENV 는 빌드 때 인라인되어
 *  운영 빌드에서는 이 분기가 빠진다). 켜져 있으면 서버 로그에 한 번 */
const TREAT_AS_PROD = process.env.NODE_ENV === "development"
  ? (process.env.OPS2_CHAT_TREAT_AS_PROD ?? "").split(",").map((s) => s.trim()).filter(Boolean) : [];
if (TREAT_AS_PROD.length) console.warn(`[ops2/chat] OPS2_CHAT_TREAT_AS_PROD 켜짐(개발 모드 전용) — ${TREAT_AS_PROD.join(", ")} 를 prod 로 봄`);
export function treatAsProd(equipment: string): boolean {
  return TREAT_AS_PROD.includes(equipment);
}
export function sendsChat(equipment: string, runMode: string | null): boolean {
  return runMode === "prod" || treatAsProd(equipment);
}

function offlineMs(): number {
  const v = Number(process.env.OPS2_CHAT_OFFLINE_SEC);
  return (Number.isFinite(v) && v >= 10 ? v : 180) * 1000;
}

// ───────────── 메시지(v1 ChatNotifier 모양) ─────────────
type CardStatus = "INFO" | "SUCCESS" | "FAIL";
const ICON: Record<CardStatus, string> = { INFO: "ℹ️", SUCCESS: "✅", FAIL: "❌" };

/** v1 _post_card — 머리 "Sputter Controller / Status Notification", 굵은 제목·부제·칸(decoratedText) */
function card(cardId: string, title: string, subtitle: string, status: CardStatus, fields: [string, string][]): Obj {
  const widgets: Obj[] = [{ textParagraph: { text: `<b>${ICON[status]} ${title}</b>` } }];
  if (subtitle) widgets.push({ textParagraph: { text: subtitle } });
  for (const [k, v] of fields) widgets.push({ decoratedText: { topLabel: k, text: v } });
  return { cardsV2: [{ cardId, card: { header: { title: "Sputter Controller", subtitle: "Status Notification" }, sections: [{ widgets }] } }] };
}

const fmtMin = (v: unknown): string => {        // v1 _fmt_min — 0 이하 "—"
  const f = num(typeof v === "string" ? Number(v) : v);
  if (f === null || f <= 0) return "—";
  return Number.isInteger(f) ? `${f}분` : `${f.toFixed(1)}분`;
};
const n0 = (v: number) => String(Number(v.toPrecision(6)));
const dur = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return h ? `${h}시간 ${m}분 ${x}초` : m ? `${m}분 ${x}초` : `${x}초`;
};
const kstOf = (d: Date | null | undefined) => (d ? fmtKst(d.toISOString()) : "-");

type Blk = { type?: string; params?: Obj };
/** 공정 시작 카드 칸 — 행 params(v1 키) + 블록 행이면 blocks 에서(가스·파워·메인 시간·히터) */
function startFields(params: Obj, blocks: Blk[]): [string, string][] {
  const p = params;
  const bl = (t: string) => blocks.filter((b) => b.type === t).map((b) => (isObj(b.params) ? b.params : {}));
  const out: [string, string][] = [];
  // 건/타겟(v1 _guns_and_targets)
  const guns = [1, 2, 3].flatMap((i) => {
    const name = String(p[`g${i}_target_name`] ?? p[`G${i}_target_name`] ?? "").trim();
    return p[`use_g${i}`] === true || name ? [`G${i}: ${name || "-"}`] : [];
  });
  if (guns.length) out.push(["사용 Guns / 타겟", guns.join(", ")]);
  // 가스
  const gas: string[] = [];
  const intro = bl("gas_intro")[0];
  const ar = num(p.ar_flow) ?? num(intro?.ar_flow), o2 = num(p.o2_flow) ?? num(intro?.o2_flow);
  if ((p.use_ar_gas === true || intro?.ar === true) && ar !== null) gas.push(`Ar ${n0(ar)} sccm`);
  if ((p.use_o2_gas === true || intro?.o2 === true) && o2 !== null) gas.push(`O₂ ${n0(o2)} sccm`);
  const sp = num(p.sp1_set) ?? num(bl("pressure").find((x) => Number(x.sp) === 1)?.value);
  if (sp !== null && sp > 0) gas.push(`SP1 ${n0(sp)} mTorr`);
  out.push(["가스", gas.join(" / ") || "—"]);
  // 파워(v1 _power_summary — 0 W 는 빼고)
  const on = bl("power_on")[0] ?? {};
  const pw: string[] = [];
  const dc = num(p.dc_power) ?? num(on.dc_power), rf = num(p.rf_power) ?? num(on.rf_power);
  const rfp = num(p.rf_pulse_power) ?? num(on.rfp_power);
  if (rfp !== null && rfp > 0) {
    const hz = num(p.rf_pulse_freq_hz), khz = hz !== null ? hz / 1000 : num(on.rfp_freq_khz);
    const duty = num(p.rf_pulse_duty) ?? num(on.rfp_duty);
    pw.push(`RF Pulse ${n0(rfp)} W @ ${khz !== null ? `${n0(khz)} kHz` : "keep"}, ${duty !== null ? `${n0(duty)} %` : "keep"}`);
  }
  if (dc !== null && dc > 0) pw.push(`DC ${n0(dc)} W`);
  if (rf !== null && rf > 0) pw.push(`RF ${n0(rf)} W`);
  out.push(["파워", pw.join(" / ") || "—"]);
  // 시간
  const mainSec = bl("main").reduce((a, x) => a + (num(x.sec) ?? 0), 0);
  out.push(["Shutter Delay", fmtMin(p.shutter_delay)]);
  out.push(["Process Time", p.process_time !== undefined ? fmtMin(p.process_time) : mainSec > 0 ? fmtMin(mainSec / 60) : "—"]);
  // 히터
  const hr = bl("heater_ramp")[0];
  const ht = p.use_heater === true ? num(p.heater_temp) : num(hr?.target_c);
  if (ht !== null && ht > 0) {
    const ramp = num(p.heater_ramp) ?? num(hr?.ramp_c_per_min);
    out.push(["히터", `${n0(ht)} °C${ramp ? ` (램프 ${n0(ramp)} °C/min)` : ""}`]);
  }
  return out;
}

type Labels = { reason: (code: string | null) => string; base: string };
async function labelsOf(webSchemaHash: string | null, equipment: string): Promise<Labels> {
  const b = await deviceBundle(webSchemaHash);
  const reasons = Array.isArray(b?.reasons) ? (b.reasons as { code?: string; label?: string }[]) : [];
  return {
    reason: (code) => (code ? reasons.find((r) => r.code === code)?.label ?? code : ""),
    base: equipment.endsWith("-SIM") ? equipment.slice(0, -4) : equipment,
  };
}

// ───────────── outbox 넣기 ─────────────
type Env = { id: string; instance: string; seq: number; ts: Date; type: string; data: Obj };
type Item = { kind: ChatKind; msgId: string; payload: Obj; skip?: string | null; key?: string; runId?: string | null; at: number };

/** ingest 가 커밋한 envelope 들 → outbox. 같은 msg_id 는 넣지 않는다(skipDuplicates) */
export async function enqueueChat(equipment: string, envs: Env[], now: Date): Promise<number> {
  const want = envs.filter((e) => e.type === "run_start" || e.type === "run_end" || (e.type === "event" && isAlertEvent(e.data)));
  if (!want.length) return 0;
  const dev = await ops2Db.ops2Device.findUnique({
    where: { equipment }, select: { runMode: true, label: true, clockSkewMs: true, webSchemaHash: true },
  });
  if (!dev) return 0;
  const L = await labelsOf(dev.webSchemaHash, equipment);
  const runIds = [...new Set(want.flatMap((e) => {
    const r = str(e.data.runId) ?? str((isObj(e.data.context) && isObj(e.data.context.data) ? e.data.context.data : {}).run_id);
    return r ? [r] : [];
  }))];
  const runs = new Map((runIds.length ? await ops2Db.ops2Run.findMany({
    where: { runId: { in: runIds } },
    select: { runId: true, name: true, recipeName: true, startedBy: true, startedAt: true, endedAt: true, params: true, blocks: true, stepNo: true },
  }) : []).map((r) => [r.runId, r]));
  // 이상 글이 붙을 공정 — 사건이 run 을 모르면 ingest 가 붙인 run_id(ops2_event.run_id)
  const evRuns = new Map((await ops2Db.ops2Event.findMany({
    where: { msgId: { in: want.filter((e) => e.type === "event").map((e) => e.id) } }, select: { msgId: true, runId: true },
  })).map((x) => [x.msgId, x.runId]));
  const lateOf = (e: Env) => now.getTime() - (e.ts.getTime() - (dev.clockSkewMs ?? 0)) > LATE_MS;
  const name = (r?: { name: string | null } | null) => r?.name || "Untitled";

  const items: Item[] = [];
  for (const e of want) {
    const d = e.data;
    const late = lateOf(e);
    const lateNote = late ? `늦게 받음(장비 시각 ${kstOf(new Date(e.ts.getTime() - (dev.clockSkewMs ?? 0)))} · 받은 ${kstOf(now)})` : null;
    if (e.type === "run_start") {
      const r = runs.get(str(d.runId) ?? "");
      const params = isObj(d.params) ? d.params : {};
      const blocks = Array.isArray(d.blocks) ? (d.blocks as Blk[]) : [];
      const fields: [string, string][] = [
        ["Chamber", L.base], ["장비", `${equipment}${dev.label ? ` (${dev.label})` : ""}`],
        ["공정 이름", name(r)], ["레시피", str(d.recipeName) ?? "—"],
        ["시작 시각", kstOf(r?.startedAt ?? e.ts)], ["시작한 사람", str(d.by) ?? "—"],
        ...startFields(params, blocks),
      ];
      items.push({ kind: "run_start", msgId: e.id, at: e.ts.getTime(), skip: late ? "늦게 받음" : null,
                   payload: { title: `공정 시작 · ${name(r)}`, body: card("notify-card", "공정 시작", `${L.base} · ${name(r)}`, "INFO", fields) } });
    } else if (e.type === "run_end") {
      const r = runs.get(str(d.runId) ?? "");
      const result = str(d.result) ?? "";
      const code = str(d.reasonCode);
      const userStop = code === "USER_STOP";
      const ok = result === "done";
      // v1 notify_process_finished_detail — 정상 / 사용자 Stop / 긴급 중단(ALL STOP) / 오류
      const subtitle = ok ? "정상 종료" : userStop ? "사용자 Stop으로 종료" : code === "ALL_STOP" ? "긴급 중단으로 종료"
        : result === "aborted" ? "중단으로 종료" : "오류로 종료";
      const fields: [string, string][] = [["공정 이름", name(r)],
        ["결과", ({ done: "정상", aborted: "중단", error: "오류" } as Obj)[result] as string ?? (result || "—")]];
      if (r?.startedAt && r.endedAt) fields.push(["소요", dur(r.endedAt.getTime() - r.startedAt.getTime())]);
      else fields.push(["소요", "— (시작 기록 없음)"]);
      if (!ok && !userStop) fields.push(["원인", code ? ` • ${L.reason(code)} (${code})` : "알 수 없음"]);
      else if (code) fields.push(["사유", `${L.reason(code)} (${code})`]);
      if (lateNote) fields.push(["⚠ 늦게 받음", lateNote]);
      items.push({ kind: "run_end", msgId: e.id, at: e.ts.getTime(),
                   payload: { title: `공정 종료 · ${name(r)} · ${subtitle}${late ? " · 늦게 받음" : ""}`, late,
                              body: card("notify-card", "공정 종료", subtitle, ok ? "SUCCESS" : "FAIL", fields) } });
      // v1: 실패 && STOP 아님이면 카드 뒤 일반 글로 원인 한 줄
      if (!ok && !userStop) {
        const text = `❌ ${L.base} 공정 실패 이유: ${name(r)} | ${code ? `${L.reason(code)} (${code})` : "오류"}`;
        items.push({ kind: "run_fail", msgId: `${e.id}:fail`, at: e.ts.getTime(), skip: late ? "늦게 받음" : null,
                     payload: { title: text, body: { text } } });
      }
    } else {
      const code = str(d.code) ?? "?";
      const rule = str(d.ruleId);
      const msg = String(d.message ?? "").replace(/\s+/g, " ").trim();
      if (code === "PLC_DISCONNECTED" || code === "PLC_RECONNECTED") {
        // v1 notify_plc_link — 끊김 "장비 오류" ❌ / 재연결 "PLC 재연결" ✅, 전용 채널
        const up = code === "PLC_RECONNECTED";
        const title = up ? "PLC 재연결" : "장비 오류";
        const text = `[${L.base}] ${up ? "PLC 재연결 성공" : "PLC 연결 끊김"}${msg ? ` — ${msg}` : ""}`;
        items.push({ kind: "plc_link", msgId: e.id, at: e.ts.getTime(), skip: late ? "늦게 받음" : null,
                     payload: { title: `${title} · ${text}`, body: {
                       cardsV2: [{ cardId: "plc-link", card: { header: { title: "Sputter Controller", subtitle: "Status Notification" },
                         sections: [{ widgets: [{ textParagraph: { text: `<b>${up ? "✅" : "❌"} ${title}</b>` } }, { textParagraph: { text } }] }] } }],
                     } } });
        continue;
      }
      const runId = evRuns.get(e.id) ?? null;
      const r = runId ? runs.get(runId) ?? await ops2Db.ops2Run.findUnique({ where: { runId }, select: { runId: true, name: true, recipeName: true, startedBy: true, startedAt: true, endedAt: true, params: true, blocks: true, stepNo: true } }) : null;
      const icon = d.level === "error" ? "❌" : "⚠️";
      const label = L.reason(code);
      const text = `${icon} ${L.base} 이상 — ${label}${label !== code ? ` (${code})` : ""}${rule ? ` · ${rule}` : ""}`
        + `${msg && msg !== label ? ` | ${msg.slice(0, 300)}` : ""}${r ? ` | 공정 ${name(r)}` : ""}`;
      items.push({ kind: "alert", msgId: e.id, at: e.ts.getTime(), skip: late ? "늦게 받음" : null, key: `${rule ?? code}|${runId ?? "-"}`, runId,
                   payload: { title: text, body: { text } } });
    }
  }

  // 반복 이상 글 — 같은 key 가 이미 있으면(공정당 한 번, 공정 밖은 10 분 안) skipped
  const keys = [...new Set(items.flatMap((i) => (i.key ? [i.key] : [])))];
  const seen = new Map<string, number>();       // key → 마지막 보낸(넣은) 시각
  if (keys.length) {
    const prev = await ops2Db.ops2ChatOutbox.findMany({
      where: { equipment, kind: "alert", status: { in: ["queued", "sent", "failed"] }, OR: keys.map((k) => ({ payload: { path: ["key"], equals: k } })) },
      select: { payload: true, createdAt: true },
    });
    for (const p of prev) {
      const k = isObj(p.payload) ? str(p.payload.key) : null;
      if (k) seen.set(k, Math.max(seen.get(k) ?? 0, p.createdAt.getTime()));
    }
  }
  const mode = sendsChat(equipment, dev.runMode);
  const rows: Prisma.Ops2ChatOutboxCreateManyInput[] = [];
  for (const i of items) {
    let skip = !mode ? `보내지 않음(모드 ${dev.runMode ?? "?"})` : !webhookOf(equipment, CHANNEL[i.kind]) ? "주소 없음" : i.skip ?? null;
    if (!skip && i.key) {
      const last = seen.get(i.key);
      if (last !== undefined && (i.runId || now.getTime() - last < REPEAT_MS)) skip = i.runId ? "반복(공정당 한 번)" : "반복(10 분 안)";
      else seen.set(i.key, now.getTime());
    }
    rows.push({ equipment, kind: i.kind, msgId: i.msgId, payload: { ...i.payload, channel: CHANNEL[i.kind], ...(i.key ? { key: i.key } : {}) } as Prisma.InputJsonValue,
                status: skip ? "skipped" : "queued", lastError: skip, nextAt: skip ? null : now, createdAt: now });
  }
  const r = await ops2Db.ops2ChatOutbox.createMany({ data: rows, skipDuplicates: true });
  if (rows.some((x) => x.status === "queued")) wake();
  return r.count;
}

/** 이상 글이 되는 사건 — error 수준, safety 알람 발생(fired, warn 이상). PLC 링크 사건은 따로(plc_link) */
export function isAlertEvent(d: Obj): boolean {
  const code = str(d.code);
  if (code === "PLC_DISCONNECTED" || code === "PLC_RECONNECTED") return true;
  const c = isObj(d.context) ? d.context : {};
  if (d.level === "error") return true;
  return c.source === "safety" && c.kind === "fired" && d.level === "warn";
}

// ───────────── 장비 연결 끊김·복구(웹이 판단) ─────────────
async function watchDevices(now: Date): Promise<void> {
  const lim = offlineMs();
  const devs = await ops2Db.ops2Device.findMany({
    where: { enabled: true, lastSeenAt: { not: null } }, select: { equipment: true, runMode: true, lastSeenAt: true, label: true },
  });
  for (const d of devs) {
    const seen = d.lastSeenAt!;
    const quiet = now.getTime() - seen.getTime();
    const base = d.equipment.endsWith("-SIM") ? d.equipment.slice(0, -4) : d.equipment;
    const mode = sendsChat(d.equipment, d.runMode);
    const skipOf = () => (!mode ? `보내지 않음(모드 ${d.runMode ?? "?"})` : !webhookOf(d.equipment, "alert") ? "주소 없음" : null);
    if (quiet > lim) {
      const id = `web-offline-${d.equipment}-${seen.getTime()}`;
      if (await ops2Db.ops2ChatOutbox.findUnique({ where: { msgId: id }, select: { id: true } })) continue;   // 이번 끊김은 이미
      // 웹 서버가 꺼져 있었던 등으로 한참 지나서 알게 되면 보내지 않는다(늦게 판단)
      const skip = skipOf() ?? (quiet > lim + LATE_MS ? "늦게 판단(웹이 그동안 보지 못함)" : null);
      const text = `[${base}] 웹이 장비 연락을 ${dur(quiet)} 동안 받지 못함(기준 ${Math.round(lim / 1000)} s) — 마지막 연락 ${kstOf(seen)}`;
      const r = await ops2Db.ops2ChatOutbox.createMany({
        data: [{ equipment: d.equipment, kind: "device_link", msgId: id, status: skip ? "skipped" : "queued", lastError: skip,
                 nextAt: skip ? null : now, createdAt: now,
                 payload: { title: `장비 연결 끊김 · ${text}`, channel: "alert", down: true, lastSeen: seen.toISOString(),
                            body: linkCard("device-link", false, "장비 연결 끊김", text) } as Prisma.InputJsonValue }],
        skipDuplicates: true,
      });
      if (r.count && !skip) wake();
      continue;
    }
    // 복구 — 마지막 끊김 알림 뒤 다시 연락이 왔으면 한 번
    const down = await ops2Db.ops2ChatOutbox.findFirst({
      where: { equipment: d.equipment, kind: "device_link", msgId: { startsWith: "web-offline-" } }, orderBy: { id: "desc" },
      select: { msgId: true, payload: true, status: true },
    });
    if (!down || !isObj(down.payload)) continue;
    const was = Date.parse(String(down.payload.lastSeen ?? ""));
    if (!Number.isFinite(was) || seen.getTime() <= was) continue;
    const id = down.msgId.replace("web-offline-", "web-online-");
    if (await ops2Db.ops2ChatOutbox.findUnique({ where: { msgId: id }, select: { id: true } })) continue;
    // 끊김을 보내지 않았으면(모드·주소·늦게 판단) 복구도 같은 까닭으로
    const skip = skipOf() ?? (down.status === "skipped" ? "끊김 알림을 보내지 않음" : null);
    const text = `[${base}] 장비 연락을 다시 받음 — 끊김 약 ${dur(seen.getTime() - was)}(마지막 연락 ${kstOf(new Date(was))} → ${kstOf(seen)})`;
    const r = await ops2Db.ops2ChatOutbox.createMany({
      data: [{ equipment: d.equipment, kind: "device_link", msgId: id, status: skip ? "skipped" : "queued", lastError: skip,
               nextAt: skip ? null : now, createdAt: now,
               payload: { title: `장비 연결 복구 · ${text}`, channel: "alert", down: false, lastSeen: seen.toISOString(),
                          body: linkCard("device-link", true, "장비 연결 복구", text) } as Prisma.InputJsonValue }],
      skipDuplicates: true,
    });
    if (r.count && !skip) wake();
  }
}

function linkCard(cardId: string, up: boolean, title: string, text: string): Obj {
  return { cardsV2: [{ cardId, card: { header: { title: "Sputter Controller", subtitle: "Status Notification" },
    sections: [{ widgets: [{ textParagraph: { text: `<b>${up ? "✅" : "❌"} ${title}</b>` } }, { textParagraph: { text } }] }] } }] };
}

// ───────────── 보내기(서버 안 타이머, 하나씩) ─────────────
/** 실패 까닭 — 주소·본문은 쓰지 않는다(HTTP 상태·오류 코드만) */
function errText(e: unknown): string {
  const x = e as { name?: string; code?: string; cause?: { code?: string; name?: string } };
  if (x?.name === "TimeoutError" || x?.cause?.name === "TimeoutError") return "시간 초과(10 s)";
  return `연결 실패${x?.cause?.code ? ` ${x.cause.code}` : x?.code ? ` ${x.code}` : ""}`;
}

export async function sendOne(id: number, now = new Date()): Promise<string> {
  const row = await ops2Db.ops2ChatOutbox.findUnique({ where: { id } });
  if (!row || row.status !== "queued") return "none";
  const p = isObj(row.payload) ? row.payload : {};
  const url = webhookOf(row.equipment, (p.channel as Channel) ?? CHANNEL[row.kind as ChatKind] ?? "process");
  if (!url) {
    await ops2Db.ops2ChatOutbox.update({ where: { id }, data: { status: "skipped", lastError: "주소 없음", nextAt: null } });
    return "skipped";
  }
  let err: string | null = null;
  try {
    const r = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json; charset=UTF-8" }, body: JSON.stringify(p.body ?? {}),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (!r.ok) err = `HTTP ${r.status}`;
    await r.body?.cancel().catch(() => {});
  } catch (e) {
    err = errText(e);
  }
  const tries = row.tries + 1;
  if (!err) {
    await ops2Db.ops2ChatOutbox.update({ where: { id }, data: { status: "sent", tries, sentAt: new Date(), lastError: null, nextAt: null } });
    return "sent";
  }
  const wait = RETRY_MS[tries - 1];
  await ops2Db.ops2ChatOutbox.update({
    where: { id },
    data: wait === undefined ? { status: "failed", tries, lastError: err, nextAt: null }
      : { tries, lastError: err, nextAt: new Date(now.getTime() + wait) },
  });
  return wait === undefined ? "failed" : "retry";
}

type Worker = { timer: ReturnType<typeof setInterval> | null; busy: boolean; lastWatch: number; wake: () => void };
const g = globalThis as unknown as { __ops2Chat?: Worker };

/** 보낼 것을 하나씩 — 도는 중이면 끝난 뒤 이어서 */
async function drain(w: Worker): Promise<void> {
  if (w.busy) return;
  w.busy = true;
  try {
    const now = new Date();
    if (now.getTime() - w.lastWatch >= WATCH_MS) {
      w.lastWatch = now.getTime();
      await watchDevices(now).catch((e) => console.error("[ops2/chat] 장비 끊김 보기 실패", String((e as Error)?.message ?? e).slice(0, 200)));
    }
    for (let n = 0; n < 50; n++) {
      const next = await ops2Db.ops2ChatOutbox.findFirst({
        where: { status: "queued", nextAt: { lte: new Date() } }, orderBy: { id: "asc" }, select: { id: true },
      });
      if (!next) break;
      await sendOne(next.id);
    }
  } catch (e) {
    console.error("[ops2/chat] 보내기 실패", String((e as Error)?.message ?? e).slice(0, 200));
  } finally {
    w.busy = false;
  }
}

function wake() {
  g.__ops2Chat?.wake();
}
/** 보내기 타이머 깨우기 — 챔버12 outbox 넣기(lib/ops2/ch12/chat.ts)가 쓴다 */
export function wakeChat(): void {
  wake();
}

/** 서버가 켜질 때 한 번(instrumentation.ts) — 같은 프로세스에서 두 번 불러도 타이머는 하나 */
export function startChat(): void {
  if (g.__ops2Chat) return;
  const w: Worker = { timer: null, busy: false, lastWatch: 0, wake: () => { setTimeout(() => void drain(w), 50); } };
  w.timer = setInterval(() => void drain(w), TICK_MS);
  w.timer.unref?.();
  g.__ops2Chat = w;
}

/** 관리 화면 "다시 보내기" — failed 를 처음처럼 queued 로 */
export async function retryFailed(equipment: string, id: number): Promise<boolean> {
  const r = await ops2Db.ops2ChatOutbox.updateMany({
    where: { id, equipment, status: "failed" }, data: { status: "queued", tries: 0, nextAt: new Date(), lastError: null },
  });
  if (r.count) wake();
  return r.count > 0;
}
