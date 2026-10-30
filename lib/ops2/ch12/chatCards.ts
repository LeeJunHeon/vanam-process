// 챔버12(CH12) 구글챗 카드 만들기 — 순수 함수(DB 없음 — scripts/ops2-chat-ch12.mjs 골든이 그대로 부른다).
// 포털이 보낸다(챔버K 와 같음 — 장비는 보내지 않는다). 문구·카드 모양·계기는 v1(Chamber.Total_program main) controller/chat_notifier.py
// ChatNotifier 와 그를 부르는 곳(runtime/chamber_runtime.py·plasma_cleaning_runtime.py·tsp_runtime.py·controller/heater_service.py·
// main.py 링크 카드·util/camera_recorder·self_watch) 그대로 — 근거 목록은 장비 저장소 v2/ch12/spec/inv_chat.py(CHAT-001~059).
// 새 알림은 늘리지 않는다 — 재시작·이어가기 결과 카드 1장만 더(지시 3장 (7)).
//
// 장비 이벤트 → 카드(context = {source, chamber, kind, origin, data} — 장비 v2/ch12/hub.py)
//   run_start(chamber ch1·ch2)                     → '공정 시작' 카드(INFO) — v1 notify_process_started(_format_card_payload_for_chat)
//   run_end(chamber ch1·ch2)                       → '공정 종료' 카드 — v1 notify_process_finished_detail(시작 값 위에 detail)
//       reasonCode PROGRAM_RESTART                 → 재시작 결과 카드(이어가지 못함 — 새 카드, 위 종료 카드 대신 1장)
//   event process·kind chat(엔진 v1 문구)
//       code 가 CHAT 이 아니고 level error         → '장비 오류' 즉시 카드(src CHn — 시작 차단 E301·두께 점검)  v1 notify_error_event
//       '❌ …'                                     → 글(실패 이유) — 엔진이 run_end 앞에 내므로 3 s 늦춰 종료 카드 뒤로(v1 순서)
//       '[RGA1] …'·'[OES] …'                       → 글
//       그 밖(DC·RF·펄스 OFF 미확인·출력 이상·정리 중 OFF 미확인) → '장비 오류' 집계 카드 '• [src] 문구' — v1 notify_error_with_src
//         src 는 data.src, 없으면 문구에서(DC1·DC2·RF·RFPulse·DCPulse·'정리 중 {이름}')
//   event process·chamber pc·kind card(data.api)   → v1 chat_pc 호출 그대로(notify_process_started·notify_process_finished_detail·
//                                                     notify_text·notify_error_with_src)
//   event tsp_engine·kind card(data.card started·finished) → TSP 시작·종료 카드
//   event heater·kind card(data title·subtitle·status·fields) → CH2 히터 카드
//   event plc·kind link_down·link_up(data.card)    → PLC 연결 끊김·재연결 카드(PLC 웹훅)
//   event camera·kind disk_low                     → 집계 카드 '[CAM] …'(HOST)
//   event selfwatch                                → '장비 오류' 즉시 카드 [SELFWATCH](PLC 웹훅, 없으면 공정 웹훅 — v1 chat_plc or chat_ch1)
//   계약(장비가 아직 내지 않음 — 이 이름으로 내면 보낸다):
//     event kind error_event {src, code, message}  → '장비 오류' 즉시 카드(호스트·로봇 서버 오류 E1xx·E4xx·E999 …)
//     event kind monitor_card {text}               → 공정 모니터 글(MONITOR 웹훅 — 가스·압력 편차·REFP·Arc 경고, 엑셀 Arc 경고)
//     event oes·kind anomaly {text}                → OES 이상 감지 글(OES 웹훅 — D28)
//     event kind client_process {kind started|finished, info} → 로봇 요청 공정 카드(CLIENT 웹훅)
//     event process·kind resumed {run_id, gap_s, name?, block?, checks?} → 이어가기 결과 카드(새 카드)
// 상태(v1 노티파이어 CH1·CH2·PC·TSP·HOST 마다): errors(이번 공정 집계 오류 — 종료 카드 '원인' 대체값)·lastStart(시작 값 — 종료 카드가
//   덮어 쓰는 바탕). 부르는 쪽(lib/ops2/ch12/chat.ts)이 outbox 기록으로 채워 넘기고, 이 함수가 묶음 순서대로 고친다.
// 중복 억제(장비 오류 60 s·로봇 에러 카드 60 s)는 기록이 필요해 부르는 쪽이 한다 — 여기는 dedup 열쇠와 finish(반복 정보)만.
import { pyFixed, pyFloatRepr, pyG, pyStrip } from "./py";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

export type Ch12Envelope = { id: string; instance: string; seq: number; ts: Date | string; type: string; data: Obj };
export type Ch12Channel = "process" | "plc" | "monitor" | "client" | "oes";
export type Ch12ChatKind =
  | "run_start" | "run_end" | "run_fail" | "text" | "aggregate" | "error_event" | "heater" | "plc_link" | "monitor" | "client"
  | "oes" | "resumed";
export type Notifier = "CH1" | "CH2" | "PC" | "TSP" | "HOST";
export const NOTIFIERS: readonly Notifier[] = ["CH1", "CH2", "PC", "TSP", "HOST"];

/** 반복 정보 — 같은 열쇠가 억제된 횟수·첫 발생에서 지난 초 */
export type Repeat = { n: number; elapsedS: number };
export type Built = { title: string; body: Obj };

export type Ch12Item = {
  kind: Ch12ChatKind;
  channel: Ch12Channel;
  /** channel 웹훅이 없을 때 쓰는 채널(v1 chat_plc or chat_ch1 — selfwatch) */
  fallback?: Ch12Channel;
  msgId: string;
  notifier: Notifier | null;
  title: string;
  body: Obj;
  skip?: string | null;
  late?: boolean;
  /** 보내기를 이만큼 늦춘다(ms) — 실패 이유 글을 종료 카드 뒤로 */
  delayMs?: number;
  /** 중복 억제 — scope 마다 열쇠, 만료 요약 카드 부제(장비 오류만) */
  dedup?: { scope: "error" | "client"; key: string; summarySub?: string };
  /** 반복 정보로 다시 만들기(중복 억제 뒤 — 장비 오류 부제 끝·로봇 에러 '반복' 칸) */
  finish?: (rep: Repeat | null) => Built;
  /** 집계 카드의 한 줄(상태 errors 에 넣은 것) */
  errorLine?: string;
  /** 시작 카드의 시작 값(상태 lastStart — 다음 묶음이 이어 받는다) */
  startParams?: Obj;
  runId?: string | null;
  chamber?: string | null;
  /** 이 원인이 어느 장비 이벤트에서 왔는가(시험·기록) */
  from: string;
};

export type Ch12ChatCfg = {
  /** CHAT_ERR_DEDUP_S — 같은 오류 카드 재전송 억제 창(0 = 끔) */
  dedupS: number;
  /** CHAT_PLC_LINK_SUPPRESS — PLC 연결계 코드 장비 오류 카드 억제 */
  plcSuppress: boolean;
  /** CHAT_PLC_LINK_CODES */
  plcCodes: string[];
  /** CHAT_POST_CONCURRENCY — 동시 POST 상한(v1 4). 보내기(lib/ops2/chat.ts)는 하나씩이라 늘 안(chatLimits.SENDER_CONCURRENCY) */
  postConcurrency: number;
  /** CHAT_PENDING_MAX — 노티파이어마다 보내지 못한 카드 상한(넘으면 일반 카드 생략·건수 표기, v1 200 — chatLimits) */
  pendingMax: number;
  /** CHAT_PENDING_HARD_MAX — urgent 카드도 넘지 못하는 상한(v1 1000) */
  pendingHardMax: number;
};
export const DEFAULT_CFG: Ch12ChatCfg = {
  dedupS: 60, plcSuppress: true, plcCodes: ["E401", "E402"], postConcurrency: 4, pendingMax: 200, pendingHardMax: 1000,
};

export type NotifierState = { errors: string[]; lastStart: Obj | null };
export type Ch12State = Record<Notifier, NotifierState>;
export const emptyState = (): Ch12State =>
  Object.fromEntries(NOTIFIERS.map((n) => [n, { errors: [], lastStart: null }])) as unknown as Ch12State;

export type Ch12Ctx = {
  /** 사유 코드 → 이름(묶음 reasons, 없으면 코드) */
  reason?: (code: string) => string;
  /** 지금(웹 시계) */
  now: Date;
  /** 장비 시계 − 웹 시계(ms) — 늦게 받음 판정 */
  skewMs?: number | null;
  /** 이만큼 넘게 늦게 받은 원인은 보내지 않는다(종료 카드만 예외 — 챔버K 와 같은 규칙) */
  lateMs?: number;
};
export const LATE_MS = 10 * 60_000;

/** CHAT_* 설정(묶음 params current) → 카드 설정 */
export function chatCfgOf(values: Obj | null | undefined): Ch12ChatCfg {
  const v = values ?? {};
  const d = Number(v.CHAT_ERR_DEDUP_S);
  let codes: unknown = v.CHAT_PLC_LINK_CODES;
  if (typeof codes === "string") {
    try {
      const j = JSON.parse(codes);
      codes = Array.isArray(j) ? j : String(codes).split(",");
    } catch {
      codes = String(codes).split(",");
    }
  }
  const list = Array.isArray(codes) ? codes.map((c) => String(c).trim().toUpperCase()).filter(Boolean) : DEFAULT_CFG.plcCodes;
  // v1 max(1, int(값)) — 숫자가 아니면 기본값(v1 은 설정 조회 실패 시 (4, 200)·1000)
  const atLeast1 = (x: unknown, dflt: number) => {
    const n = Number(x);
    return x !== null && x !== undefined && x !== "" && typeof x !== "boolean" && Number.isFinite(n) ? Math.max(1, Math.trunc(n)) : dflt;
  };
  return {
    dedupS: Number.isFinite(d) && d >= 0 ? d : DEFAULT_CFG.dedupS,
    plcSuppress: typeof v.CHAT_PLC_LINK_SUPPRESS === "boolean" ? v.CHAT_PLC_LINK_SUPPRESS : DEFAULT_CFG.plcSuppress,
    plcCodes: list,
    postConcurrency: atLeast1(v.CHAT_POST_CONCURRENCY, DEFAULT_CFG.postConcurrency),
    pendingMax: atLeast1(v.CHAT_PENDING_MAX, DEFAULT_CFG.pendingMax),
    pendingHardMax: atLeast1(v.CHAT_PENDING_HARD_MAX, DEFAULT_CFG.pendingHardMax),
  };
}

// ───────────── 파이썬 모양 도우미(v1 ChatNotifier) ─────────────
const PY_FLOAT = /^[+-]?(?:\d+(?:_\d+)*\.?(?:\d+(?:_\d+)*)?|\.\d+(?:_\d+)*)(?:[eE][+-]?\d+)?$/;
/** float(v) — 안 되면 null */
function pyFloatOrNull(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string") {
    const t = pyStrip(v);
    if (PY_FLOAT.test(t)) return Number(t.replace(/_/g, ""));
    const l = t.toLowerCase().replace(/^[+-]/, "");
    if (l === "inf" || l === "infinity") return t.startsWith("-") ? -Infinity : Infinity;
    if (l === "nan") return NaN;
  }
  return null;
}
/** ChatNotifier._num — float(v), 안 되면 글에서 첫 숫자, 없으면 null */
function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const f = pyFloatOrNull(v);
  if (f !== null) return f;
  const m = /[-+]?\d+(\.\d+)?/.exec(pyS(v));
  return m ? Number(m[0]) : null;
}
/** ChatNotifier._b */
function b(p: Obj, key: string): boolean {
  const v = key in p ? p[key] : false;
  if (typeof v === "string") return ["1", "t", "true", "y", "yes", "on", "checked"].includes(pyStrip(v).toLowerCase());
  return truthy(v);
}
function truthy(v: unknown): boolean {
  if (v === null || v === undefined || v === false || v === "" || v === 0) return false;
  if (typeof v === "number" && Number.isNaN(v)) return true;
  if (Array.isArray(v)) return v.length > 0;
  if (isObj(v)) return Object.keys(v).length > 0;
  return true;
}
/** str(v) — 숫자는 파이썬 모양(정수 JSON 값은 int, 아니면 repr(float)) */
function pyS(v: unknown): string {
  if (v === null || v === undefined) return "None";
  if (typeof v === "boolean") return v ? "True" : "False";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : pyFloatRepr(v);
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}
/** a or b or c … (파이썬 truthiness) */
const or = (...xs: unknown[]): unknown => xs.find(truthy) ?? xs[xs.length - 1];
const trunc = (x: number) => (Number.isFinite(x) ? Math.trunc(x) : x);
const cut = (s: string, n: number) => Array.from(s).slice(0, n).join("");
/** ChatNotifier._fmt_min */
function fmtMin(v: unknown): string {
  const f = pyFloatOrNull(v ?? null);
  if (f === null || Number.isNaN(f) || f <= 0) return "—";
  if (!Number.isFinite(f)) return "—";
  return Math.abs(f - Math.trunc(f)) < 1e-6 ? `${Math.trunc(f)}분` : `${pyFixed(f, 1)}분`;
}

// ───────────── 카드 모양(v1 _post_card·_upsert_error_card·notify_text) ─────────────
type CardStatus = "INFO" | "SUCCESS" | "FAIL" | "WARN";
const ICON: Record<string, string> = { INFO: "ℹ️", SUCCESS: "✅", FAIL: "❌", WARN: "⚠️" };
const HEADER = { title: "Sputter Controller", subtitle: "Status Notification" };

/** v1 _post_card — cardId notify-card */
export function card(title: string, subtitle: string, status: string, fields: [string, unknown][] | null): Obj {
  const widgets: Obj[] = [{ textParagraph: { text: `<b>${ICON[status] ?? "ℹ️"} ${title}</b>` } }];
  if (subtitle) widgets.push({ textParagraph: { text: subtitle } });
  for (const [k, v] of fields ?? []) widgets.push({ decoratedText: { topLabel: String(k), text: pyS(v) } });
  return { cardsV2: [{ cardId: "notify-card", card: { header: HEADER, sections: [{ widgets }] } }] };
}
/** v1 _upsert_error_card — cardId error-aggregate, '• 줄' 을 <br> 로 */
export function errorAggregateCard(lines: string[]): Obj {
  const bullets = lines.map((e) => `• ${e}`).join("<br>");
  return { cardsV2: [{ cardId: "error-aggregate", card: { header: HEADER, sections: [{ widgets: [
    { textParagraph: { text: "<b>❌ 장비 오류</b>" } }, { textParagraph: { text: bullets } }] }] } }] };
}
const textBody = (text: string): Obj => ({ text });

// ───────────── 시작·종료 카드(v1 notify_process_started·notify_process_finished_detail) ─────────────
/** v1 _guns_and_targets */
function gunsAndTargets(p: Obj): string {
  const items: string[] = [];
  for (const i of [1, 2, 3]) {
    const used = `use_g${i}` in p && b(p, `use_g${i}`);
    const name = pyStrip(pyS(or(p[`G${i}_target_name`], p[`G${i} Target`], "")));
    if (used || name) items.push(`G${i}: ${name || "-"}`);
  }
  if (!items.length) {
    const legacy = pyStrip(pyS(or(p.gunTarget_name, "")));
    if (legacy) items.push(`G1: ${legacy}`);
  }
  return items.length ? items.join(", ") : "—";
}

/** v1 _power_summary */
function powerSummary(p: Obj): string {
  const items: string[] = [];
  const dcpw = num(p.dc_pulse_power), dcfq = num(p.dc_pulse_freq);
  const dcoffRaw = "dc_pulse_off_time" in p ? p.dc_pulse_off_time : p.dc_pulse_off_time_us;
  const dcdt = num("dc_pulse_duty" in p ? p.dc_pulse_duty : p.dc_pulse_duty_cycle);
  const blank = (v: unknown) => v === null || v === undefined || v === "";
  if (b(p, "use_dc_pulse") || dcpw !== null || dcfq !== null || !blank(dcoffRaw) || dcdt !== null) {
    const pw = dcpw !== null ? `${trunc(dcpw)} W` : "—";
    const fq = dcfq !== null ? `${trunc(dcfq)} kHz` : "keep";
    let off: string;
    if (blank(dcoffRaw)) off = "Off keep";
    else if (typeof dcoffRaw === "string" && pyStrip(dcoffRaw).toUpperCase() === "DC") off = "Off DC";
    else {
      const ov = num(dcoffRaw);
      off = ov !== null ? `Off ${pyFixed(ov, 1)} µs` : "Off keep";
    }
    const dt = dcdt !== null ? ` (duty ${pyG(dcdt)}%)` : "";
    items.push(`DC Pulse ${pw} @ ${fq}, ${off}${dt}`);
  }
  const rfpw = num(p.rf_pulse_power), rffq = num(p.rf_pulse_freq);
  const rfdt = num("rf_pulse_duty" in p ? p.rf_pulse_duty : p.rf_pulse_duty_cycle);
  if (b(p, "use_rf_pulse") || rfpw !== null || rffq !== null || rfdt !== null) {
    const pw = rfpw !== null ? `${trunc(rfpw)} W` : "—";
    const fq = rffq !== null ? `${pyG(rffq)} kHz` : "keep";
    const dt = rfdt !== null ? `duty ${trunc(rfdt)}%` : "duty keep";
    items.push(`RF Pulse ${pw} @ ${fq}, ${dt}`);
  }
  const dcp = num(p.dc_power);
  if (b(p, "use_dc_power") || truthy(dcp)) items.push(dcp !== null ? `DC1 ${trunc(dcp)} W` : "DC1 — W");
  const dcp2 = num(p.dc_power2);
  if (b(p, "use_dc_power2") && truthy(dcp2)) items.push(`DC2 ${trunc(dcp2 as number)} W`);
  const rfp = num(p.rf_power);
  if (b(p, "use_rf_power") || truthy(rfp)) items.push(rfp !== null ? `RF ${trunc(rfp)} W` : "RF — W");
  return items.length ? items.join(" / ") : "—";
}

/** v1 ch_txt — ch → chamber → prefix 첫 낱말(CH…) */
function chTxtOf(p: Obj): string {
  let v = p.ch;
  if (v === null || v === undefined || v === "") v = p.chamber;
  if (!(v === null || v === undefined || v === "")) {
    if (typeof v === "number" && Number.isFinite(v)) return `CH${Math.trunc(v)}`;
    if (typeof v === "boolean") return `CH${v ? 1 : 0}`;
    if (typeof v === "string" && /^\s*[+-]?\d+\s*$/.test(v)) return `CH${Number(v)}`;
    const t = pyStrip(pyS(v));
    if (t) return t;
  }
  const prefix = pyStrip(pyS(p.prefix ?? ""));
  if (prefix) {
    const head = prefix.split(/\s+/)[0];
    if (head.toUpperCase().startsWith("CH")) return head;
  }
  return "";
}

/** v1 notify_process_started — 시작 카드 */
export function startCard(params: Obj): Built {
  const p = params ?? {};
  const name = pyS(or(p.process_note, p.process_name, p.Process_name, "Untitled"));
  const ch = chTxtOf(p);
  const subtitle = ch ? `${ch} · ${name}` : name;
  const f: [string, unknown][] = [
    ["사용 Guns / 타겟", gunsAndTargets(p) || "—"], ["파워", powerSummary(p) || "—"],
    ["Shutter Delay", fmtMin("shutter_delay" in p ? p.shutter_delay : 0)],
    ["Process Time", fmtMin("process_time" in p ? p.process_time : 0)],
  ];
  if (truthy(p.thickness_mode)) {
    // with suppress(Exception) — 값이 틀리면 Time 모드 칸 그대로
    const th = pyFloatOrNull(p.thickness ?? null);
    const m = (sec: unknown): string | null => {
      if (sec === null || sec === undefined || sec === "") return "—";
      const x = pyFloatOrNull(sec);
      return x === null ? null : `${pyFixed(x / 60.0, 1)}분`;
    };
    const ex = m(p.thickness_expected_s), lim = m(p.thickness_limit_s);
    if (th !== null && ex !== null && lim !== null) {
      f[3] = ["Process Time", `목표 두께 ${pyG(th)} nm (예상 ${ex}, 상한 ${lim})`];
      f.push(["종료 방식", "Thickness"]);
      if (truthy(p.thickness_factor_note)) f.push(["Factor", pyS(p.thickness_factor_note)]);
    }
  }
  const fields: [string, unknown][] = ch ? [["Chamber", ch], ...f] : f;
  return { title: `공정 시작 · ${name}`, body: card("공정 시작", subtitle, "INFO", fields) };
}

const preview = (xs: unknown[]): string => {
  let s = " • " + xs.slice(0, 3).map(pyS).join("\n • ");
  if (xs.length > 3) s += `\n(+${xs.length - 3}건 더)`;
  return s;
};

/** v1 notify_process_finished_detail — 종료 카드(merged = 시작 값 위에 detail). runErrors = 이번 공정 집계 오류 */
export function endCard(ok: boolean, merged: Obj, runErrors: string[], extra: [string, string][] = []): Built & { subtitleBase: string } {
  const name = pyS(or(merged.process_name, merged.process_note, merged.Process_name, "Untitled"));
  const stopped = truthy(merged.stopped), aborting = truthy(merged.aborting);
  let errs: unknown[] = Array.isArray(merged.errors) ? [...merged.errors] : truthy(merged.errors) ? [merged.errors] : [];
  if (!errs.length && runErrors.length) errs = [...runErrors];
  const ch = chTxtOf(merged);
  let base: string, status: CardStatus;
  const fields = new Map<string, unknown>();
  const setdefault = (k: string, v: unknown) => { if (!fields.has(k)) fields.set(k, v); };
  if (ok) {
    base = "정상 종료"; status = "SUCCESS"; fields.set("공정 이름", name);
  } else {
    status = "FAIL";
    if (stopped) { base = "사용자 Stop으로 종료"; fields.set("공정 이름", name); }
    else if (aborting) { base = "긴급 중단으로 종료"; fields.set("공정 이름", name); }
    else {
      base = "오류로 종료";
      fields.set("공정 이름", name);
      fields.set("원인", errs.length ? preview(errs) : "알 수 없음");
    }
  }
  const sa = merged.soft_arc_count, ha = merged.hard_arc_count;
  if (sa !== null && sa !== undefined && ha !== null && ha !== undefined) {
    const s = pyFloatOrNull(sa), h = pyFloatOrNull(ha);
    if (s !== null && h !== null && Number.isFinite(s) && Number.isFinite(h)) setdefault("Arc (런 누적)", `Soft ${Math.trunc(s)} / Hard ${Math.trunc(h)}`);
  }
  if (truthy(merged.chuck_position)) setdefault("Chuck Position", pyS(merged.chuck_position));
  if (truthy(merged.thickness_end)) setdefault("종료 방식", pyS(merged.thickness_end));
  if (truthy(merged.thickness_final)) setdefault("최종 두께", pyS(merged.thickness_final));
  if (truthy(merged.thickness_jumps)) setdefault("큰 튐", pyS(merged.thickness_jumps));
  const warns = Array.isArray(merged.warnings) ? merged.warnings : [];
  if (warns.length) setdefault("주의", preview(warns));
  for (const [k, v] of extra) setdefault(k, v);
  let list: [string, unknown][] = [["결과", base], ...fields];
  let subtitle = name;
  if (ch) {
    subtitle = `${ch} · ${name}`;
    list = [["Chamber", ch], ...list];
  }
  return { title: `공정 종료 · ${subtitle} · ${base}`, body: card("공정 종료", subtitle, status, list), subtitleBase: base };
}

// ───────────── 장비 오류 즉시 카드(v1 notify_error_event) ─────────────
type ErrParts = { src: string; code: string; cause: string; fix: string };
/** src·code·문구 → 원인·해결방법(줄바꿈 제거·앞의 코드 중복 제거·'해결방법:' 분리) */
export function errorEventParts(src: unknown, code: unknown, message: unknown): ErrParts {
  const s = pyStrip(String(src ?? "") || "HOST") || "HOST";
  const c = pyStrip(String(code ?? "")).toUpperCase();
  let msg = String(message ?? "").replace(/\r/g, "\n");
  msg = pyStrip(msg.split(/[\n\v\f\x1c\x1d\x1e\x85\u2028\u2029]/).join(" "));
  if (c && msg.toUpperCase().startsWith(c)) {
    let tail = msg.slice(c.length).replace(/^[\s]+/, "");
    if (tail.startsWith("|") || tail.startsWith(":")) tail = tail.slice(1).replace(/^[\s]+/, "");
    msg = tail || msg;
  }
  let cause = msg, fix = "";
  const i = msg.indexOf("해결방법:");
  if (i >= 0) {
    cause = pyStrip(msg.slice(0, i));
    fix = pyStrip(msg.slice(i + "해결방법:".length));
  }
  return { src: s, code: c, cause, fix };
}
const errSub = (e: ErrParts, cause = e.cause) => (e.code ? `[${e.src}] ${e.code} | ${cause}` : `[${e.src}] ${cause}`);
/** 반복 요약 접미사 — v1 _err_dedup_summary */
export const repeatSuffix = (r: Repeat) => ` | 직전 ${pyFixed(r.elapsedS, 0)}초 동안 같은 오류 ${Math.trunc(r.n)}회 반복`;
export function errorEventCard(e: ErrParts, rep: Repeat | null): Built {
  const sub = errSub(e) + (rep && rep.n > 0 ? repeatSuffix(rep) : "");
  return { title: `장비 오류 · ${sub}`, body: card("장비 오류", sub, "FAIL", e.fix ? [["해결방법", e.fix]] : null) };
}
/** 만료된 다른 열쇠의 요약 카드 — v1 expired_cards(해결방법 칸 없음, 원인은 열쇠의 120자) */
export function errorSummaryCard(summarySub: string, rep: Repeat): Built {
  const sub = summarySub + repeatSuffix(rep);
  return { title: `장비 오류 · ${sub}`, body: card("장비 오류", sub, "FAIL", null) };
}

// ───────────── 로봇 요청 공정 카드(v1 _notify_client_process) ─────────────
const KST_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" });
const KST_PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Seoul", hour12: false, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
});
/** 장비 시각 글(오프셋 없으면 KST — v1 은 노트북 지역 시각) → Date */
function cpDt(v: unknown): Date | null {
  if (typeof v !== "string" || !v) return null;
  const t = /([zZ]|[+-]\d{2}:?\d{2})$/.test(v) ? Date.parse(v) : Date.parse(`${v.replace(" ", "T")}+09:00`);
  return Number.isFinite(t) ? new Date(t) : null;
}
/** 오늘이면 HH:MM:SS, 아니면 MM/DD HH:MM:SS(KST) */
function cpTime(d: Date | null, now: Date): string {
  if (!d) return "—";
  const p = Object.fromEntries(KST_PARTS.formatToParts(d).map((x) => [x.type, x.value]));
  const hms = `${p.hour === "24" ? "00" : p.hour}:${p.minute}:${p.second}`;
  return KST_DAY.format(d) !== KST_DAY.format(now) ? `${p.month}/${p.day} ${hms}` : hms;
}
function cpName(info: Obj): string {
  const names = pyS(info.process_names ?? "").split(" / ").map((x) => pyStrip(x)).filter(Boolean);
  if (names.length === 1) return names[0];
  if (names.length > 1) return `${names[0]} 외 ${names.length - 1}개`;
  const rn = pyStrip(pyS(or(info.recipe_name, "")));
  if (!rn) return "—";
  const slash = Math.max(rn.lastIndexOf("/"), rn.lastIndexOf("\\"));
  const dot = rn.lastIndexOf(".");
  let lead = slash + 1;
  while (lead < rn.length && rn[lead] === ".") lead += 1;
  return dot > lead ? rn.slice(0, dot) : rn;
}
const CLIENT_ERROR_LABELS: Record<string, string> = {
  거절: "요청 거절 (시작 전)", 실패: "공정 실패", "중단(재시작)": "프로그램 재시작으로 중단", 미확인: "종료 미확인",
};
/** 로봇 요청 공정 카드 — started·finished(성공·STOP → 종료, 그 밖 → 에러 + 중복 억제) */
export function clientCard(kind: string, info: Obj, now: Date): { built: Built | null; dedupKey?: string; finish?: (r: Repeat | null) => Built } {
  const target = pyStrip(pyS(or(info.target, ""))) || "—";
  const subtitle = `${target} · ${cpName(info)}`;
  const rx = cpDt(info.received_at), st = cpDt(info.started_at), fin = cpDt(info.finished_at);
  const rn = pyStrip(pyS(or(info.recipe_name, ""))), rc = pyStrip(pyS(or(info.row_count, "")));
  const recipe = rn && rc ? `${rn} (공정 ${rc}개)` : rn || (rc ? `공정 ${rc}개` : "—");
  const rid = pyStrip(pyS(or(info.request_id, "")));
  if (kind === "started") {
    const f: [string, unknown][] = [["대상", target], ["레시피", recipe], ["요청 시각", cpTime(rx, now)], ["시작 시각", cpTime(st, now)]];
    if (rid) f.push(["request_id", rid]);
    return { built: { title: `공정 시작 · ${subtitle}`, body: card("공정 시작", subtitle, "INFO", f) } };
  }
  if (kind !== "finished") return { built: null };
  const result = pyStrip(pyS(or(info.result, ""))), reason = pyStrip(pyS(or(info.reason, "")));
  if (result === "성공" || result === "STOP") {
    const status = result === "성공" ? "SUCCESS" : "WARN";
    const res = (result === "성공" ? "정상 완료" : "STOP") + (reason ? ` · ${reason}` : "");
    const f: [string, unknown][] = [["대상", target], ["결과", res], ["레시피", recipe]];
    const end = fin ?? now;
    if (st) {
      f.push(["시작 ~ 종료", `${cpTime(st, now)} ~ ${cpTime(end, now)}`]);
      f.push(["소요", `${pyFixed(Math.max(0, (end.getTime() - st.getTime()) / 1000) / 60.0, 1)}분`]);
    } else f.push(["종료 시각", cpTime(end, now)]);
    if (rid) f.push(["request_id", rid]);
    return { built: { title: `공정 종료 · ${subtitle}`, body: card("공정 종료", subtitle, status, f) } };
  }
  let label = CLIENT_ERROR_LABELS[result] ?? (result || "알 수 없음");
  if (result === "실패" && !st) label = "공정 실패 (시작 전)";
  const finish = (rep: Repeat | null): Built => {
    const f: [string, unknown][] = [["구분", label], ["사유", reason ? cut(reason, 300) : "—"], ["대상", target], ["레시피", recipe],
      ["요청 시각", cpTime(rx, now)]];
    if (st) f.push(["시작 시각", cpTime(st, now)]);
    f.push(["시각", cpTime(fin ?? now, now)]);
    if (rep && rep.n > 0) f.push(["반복", `직전 ${pyFixed(rep.elapsedS, 0)}초 동안 같은 에러 ${Math.trunc(rep.n)}회 더 (생략)`]);
    if (rid) f.push(["request_id", rid]);
    return { title: `공정 에러 · ${subtitle} · ${label}`, body: card("공정 에러", subtitle, "FAIL", f) };
  };
  return { built: finish(null), dedupKey: `${target}|${result}|${cut(reason, 120)}`, finish };
}

// ───────────── 장비 이벤트 → 카드 ─────────────
const NOTIFIER_OF: Record<string, Notifier> = { ch1: "CH1", ch2: "CH2", pc: "PC", tsp: "TSP" };
const CH_LABEL: Record<string, string> = { ch1: "CH1", ch2: "CH2", pc: "Plasma Cleaning", tsp: "TSP" };

/** 엔진 chat 문구의 src(v1 notify_error_with_src 의 첫 인자) — data.src 가 없을 때 문구에서 */
export function chatSrcOf(text: string): string {
  const m = /정리 중 (RF Pulse|DC Pulse|DC Power2|DC Power|RF Power) 출력 OFF 미확인/.exec(text);
  if (m) return m[1];
  if (/RF Pulse/.test(text)) return "RFPulse";
  if (/DC Pulse/.test(text)) return "DCPulse";
  if (/CH\d DC2 /.test(text)) return "DC2";
  if (/CH\d DC1 Power/.test(text) || /CH\d DC Power/.test(text)) return "DC1";
  if (/CH\d RF Power/.test(text)) return "RF";
  return "";
}

const tsOf = (e: Ch12Envelope) => (e.ts instanceof Date ? e.ts : new Date(e.ts));

/** 시작 값(상태 lastStart)·이름에 (i/n) — v1 리스트 공정 표기(종료 카드에만 보인다 — 시작 카드는 process_note 라 안 보임, CHAT-010) */
function withIndex(name: string, p: Obj): string {
  const i = Number(p.process_index), n = Number(p.process_total);
  return Number.isInteger(i) && Number.isInteger(n) && n > 0 && i > 0 ? `${name} (${i}/${n})` : name;
}

/** v1 _format_card_payload_for_chat — CH1 은 건 하나, 쓰지 않는 파워 키는 지움 */
export function formatCardPayload(p0: Obj, n: number): Obj {
  const q: Obj = { ...p0 };
  if (!("prefix" in q)) q.prefix = `CH${n} Sputter`;
  if (n === 1) {
    const name = pyStrip(pyS(or(q.G1_target_name, q["G1 Target"], q.ch1_gunTarget_name, "")));
    if (name) {
      q.use_g1 = true;
      q.G1_target_name = name;
    }
    for (const k of ["use_g2", "use_g3", "G2_target_name", "G3_target_name", "G2 Target", "G3 Target"]) delete q[k];
  }
  const drop = (ks: string[]) => { for (const k of ks) delete q[k]; };
  if (!truthy(q.use_dc_pulse)) drop(["dc_pulse_power", "dc_pulse_freq", "dc_pulse_off_time", "dc_pulse_duty", "dc_pulse_duty_cycle"]);
  if (!truthy(q.use_rf_pulse)) drop(["rf_pulse_power", "rf_pulse_freq", "rf_pulse_duty", "rf_pulse_duty_cycle"]);
  if (!truthy(q.use_dc_power)) drop(["dc_power"]);
  if (!truthy(q.use_dc_power2)) drop(["dc_power2"]);
  if (!truthy(q.use_rf_power)) drop(["rf_power"]);
  return q;
}

/** run_end summary → v1 detail(장비가 result_detail 을 summary.detail·summary.result_detail 또는 summary 자체로 싣는다) */
function detailOf(d: Obj): Obj {
  const s = isObj(d.summary) ? d.summary : {};
  const inner = isObj(s.detail) ? s.detail : isObj(s.result_detail) ? s.result_detail : null;
  const out: Obj = inner ? { ...inner } : { ...s };
  delete out.name;
  if (!truthy(out.process_name) && truthy(s.name)) out.process_name = s.name;
  return out;
}

const PROGRAM_RESTART = "PROGRAM_RESTART";

/** 묶음(커밋된 envelope, 받은 순서) → 카드. state 는 노티파이어마다 고친다 */
export function buildCh12Items(envs: Ch12Envelope[], ctx: Ch12Ctx, state: Ch12State, cfg: Ch12ChatCfg = DEFAULT_CFG): Ch12Item[] {
  const reason = ctx.reason ?? ((c: string) => c);
  const lateMs = ctx.lateMs ?? LATE_MS;
  const out: Ch12Item[] = [];
  for (const e of envs) {
    const ts = tsOf(e);
    const late = ctx.now.getTime() - (ts.getTime() - (ctx.skewMs ?? 0)) > lateMs;
    const d = e.data ?? {};
    const push = (it: Omit<Ch12Item, "from" | "late"> & { late?: boolean }) =>
      out.push({ late, ...it, skip: it.skip !== undefined ? it.skip : late ? "늦게 받음" : null, from: e.id });

    if (e.type === "run_start" || e.type === "run_end") {
      const chamber = str(d.chamber);
      if (chamber !== "ch1" && chamber !== "ch2") continue;           // pc·tsp 의 run_* 는 카드가 따로(엔진 card 이벤트)
      const n = chamber === "ch1" ? 1 : 2;
      const nt = NOTIFIER_OF[chamber];
      const st = state[nt];
      if (e.type === "run_start") {
        const params = isObj(d.params) ? d.params : {};
        // v1: p.setdefault("ch", n) · p["prefix"] = "CHn Sputter"
        const p: Obj = { ...params, ch: "ch" in params ? params.ch : n, prefix: `CH${n} Sputter` };
        const idx = Number(d.stepNo ?? params.process_index), tot = Number(d.processTotal ?? params.process_total);
        if (Number.isInteger(tot) && tot > 0 && Number.isInteger(idx) && idx > 0) {
          p.process_index = idx;
          p.process_total = tot;
        }
        const q = formatCardPayload(p, n);
        st.errors = [];
        st.lastStart = q;
        const c = startCard(q);
        push({ kind: "run_start", channel: "process", msgId: e.id, notifier: nt, ...c, startParams: q, runId: str(d.runId), chamber });
      } else {
        const code = str(d.reasonCode);
        const detail = detailOf(d);
        const merged: Obj = { ...(st.lastStart ?? {}), ...detail };
        if (merged.ch === undefined || merged.ch === null || merged.ch === "") merged.ch = n;
        const name0 = pyS(or(merged.process_name, merged.process_note, merged.Process_name, ""));
        if (name0 && st.lastStart) merged.process_name = withIndex(name0, st.lastStart);
        const result = str(d.result) ?? "";
        const ok = result === "done";
        if (merged.stopped === undefined) merged.stopped = result === "aborted";
        if (merged.aborting === undefined && code === "ALL_STOP") merged.aborting = true;
        const errs = [...st.errors];
        st.errors = [];
        const lateNote: [string, string][] = late ? [["⚠ 늦게 받음", "장비 시각과 받은 시각이 10 분 넘게 차이"]] : [];
        if (code === PROGRAM_RESTART) {
          push({ kind: "run_end", channel: "process", msgId: e.id, notifier: nt, skip: null, ...restartFailCard(merged, d, errs, reason),
                 runId: str(d.runId), chamber });
          continue;
        }
        // 오류인데 원인 목록이 없으면 사유 코드(장비 run_end 가 detail.errors 를 싣지 않을 때 — v1 '알 수 없음' 대신)
        if (!ok && !truthy(merged.stopped) && !truthy(merged.aborting) && !truthy(merged.errors) && !errs.length && code) {
          merged.errors = [`${reason(code)}${reason(code) !== code ? ` (${code})` : ""}`];
        }
        const c = endCard(ok, merged, errs, lateNote);
        push({ kind: "run_end", channel: "process", msgId: e.id, notifier: nt, title: c.title + (late ? " · 늦게 받음" : ""),
               body: c.body, skip: null, runId: str(d.runId), chamber });
      }
      continue;
    }
    if (e.type !== "event") continue;

    const c = isObj(d.context) ? d.context : {};
    const source = str(c.source) ?? "", kind = str(c.kind) ?? "", chamber = str(c.chamber) ?? "shared";
    const data = isObj(c.data) ? c.data : c;                          // dict 이벤트는 키가 context 에 바로 붙는다
    const msg = String(d.message ?? "");
    const code = str(d.code) ?? "";
    const level = str(d.level) ?? "info";

    const aggregate = (src: string, text: string, notifier: Notifier) => {
      const base = pyStrip(text || "unknown") || "unknown";
      const line = src ? `[${src}] ${base}` : base;
      state[notifier].errors.push(line);
      push({ kind: "aggregate", channel: "process", msgId: e.id, notifier, title: `장비 오류 · ${line}`, body: errorAggregateCard([line]),
             errorLine: line, chamber });
    };
    const errorEvent = (src: unknown, ecode: unknown, message: unknown, channel: Ch12Channel = "process", fallback?: Ch12Channel) => {
      const parts = errorEventParts(src, ecode, message);
      if (cfg.plcSuppress && parts.code && cfg.plcCodes.includes(parts.code)) {
        push({ kind: "error_event", channel, fallback, msgId: e.id, notifier: "HOST", ...errorEventCard(parts, null),
               skip: "PLC 연결계 오류 억제(재연결 카드에 건수)", chamber });
        return;
      }
      push({ kind: "error_event", channel, fallback, msgId: e.id, notifier: "HOST", ...errorEventCard(parts, null), chamber,
             dedup: { scope: "error", key: `${parts.src}|${parts.code}|${cut(parts.cause, 120)}`, summarySub: errSub(parts, cut(parts.cause, 120)) },
             finish: (rep) => errorEventCard(parts, rep) });
    };

    // ── 공정 엔진 chat(CH1·CH2) ──
    if (source === "process" && kind === "chat" && (chamber === "ch1" || chamber === "ch2")) {
      const n = chamber === "ch1" ? 1 : 2;
      const text = str(data.text) ?? msg;
      if (code && code !== "CHAT" && level === "error") errorEvent(str(data.src) ?? `CH${n}`, code, text);
      else if (text.startsWith("❌")) {
        push({ kind: "run_fail", channel: "process", msgId: e.id, notifier: NOTIFIER_OF[chamber], title: text, body: textBody(text),
               delayMs: 3000, chamber });
      } else if (text.startsWith("[")) {
        push({ kind: "text", channel: "process", msgId: e.id, notifier: NOTIFIER_OF[chamber], title: text, body: textBody(text), chamber });
      } else aggregate(str(data.src) ?? chatSrcOf(text), text, NOTIFIER_OF[chamber]);
      continue;
    }
    // ── 플라즈마 클리닝 카드(v1 chat_pc 호출 그대로) ──
    if (kind === "card" && chamber === "pc" && str(data.api)) {
      const api = str(data.api);
      const st = state.PC;
      const payload = isObj(data.payload) ? data.payload : {};
      if (api === "notify_process_started") {
        st.errors = [];
        st.lastStart = { ...payload };
        push({ kind: "run_start", channel: "process", msgId: e.id, notifier: "PC", ...startCard(payload), startParams: { ...payload }, chamber });
      } else if (api === "notify_process_finished_detail") {
        const errs = [...st.errors];
        st.errors = [];
        const r = endCard(truthy(data.ok), { ...(st.lastStart ?? {}), ...payload }, errs);
        push({ kind: "run_end", channel: "process", msgId: e.id, notifier: "PC", title: r.title, body: r.body, skip: null, chamber });
      } else if (api === "notify_text") {
        const text = str(data.text) ?? msg;
        push({ kind: text.startsWith("❌") ? "run_fail" : "text", channel: "process", msgId: e.id, notifier: "PC", title: text,
               body: textBody(text), chamber });
      } else if (api === "notify_error_with_src") aggregate(str(data.src) ?? "PC", str(data.text) ?? msg, "PC");
      continue;
    }
    // ── TSP 카드 ──
    if (kind === "card" && (source === "tsp_engine" || chamber === "tsp") && str(data.card)) {
      const st = state.TSP;
      if (data.card === "started") {
        const p = isObj(data.params) ? data.params : {};
        st.errors = [];
        st.lastStart = { ...p };
        push({ kind: "run_start", channel: "process", msgId: e.id, notifier: "TSP", ...startCard(p), startParams: { ...p }, chamber: "tsp" });
      } else if (data.card === "finished") {
        const errs = [...st.errors];
        st.errors = [];
        const r = endCard(truthy(data.ok), { ...(st.lastStart ?? {}), ...(isObj(data.detail) ? data.detail : {}) }, errs);
        push({ kind: "run_end", channel: "process", msgId: e.id, notifier: "TSP", title: r.title, body: r.body, skip: null, chamber: "tsp" });
      }
      continue;
    }
    // ── CH2 히터 카드(v1 _post_card('[CH2] 히터 …', urgent)) ──
    if (kind === "card" && source === "heater" && str(data.title)) {
      const fields = isObj(data.fields) ? Object.entries(data.fields) : null;
      const title = str(data.title)!, sub = pyS(data.subtitle ?? "");
      push({ kind: "heater", channel: "process", msgId: e.id, notifier: "CH2", title: `${title}${sub ? ` · ${sub}` : ""}`,
             body: card(title, sub, str(data.status) ?? "INFO", fields), chamber: "ch2" });
      continue;
    }
    // ── PLC 링크 카드(PLC 웹훅 — v1 chat_plc, 없으면 보내지 않음) ──
    if (source === "plc" && (kind === "link_down" || kind === "link_up")) {
      const cd = isObj(data.card) ? data.card : {};
      const title = str(cd.title) ?? (kind === "link_down" ? "PLC 연결 끊김" : "PLC 재연결");
      const sub = str(cd.subtitle) ?? msg;
      push({ kind: "plc_link", channel: "plc", msgId: e.id, notifier: null, title: `${title} · ${sub}`,
             body: card(title, sub, str(cd.status) ?? (kind === "link_down" ? "FAIL" : "SUCCESS"), null), chamber });
      continue;
    }
    // ── 카메라 디스크 여유 부족(HOST 집계 카드 '[CAM] …') ──
    if (source === "camera" && kind === "disk_low") {
      aggregate("CAM", msg, "HOST");
      continue;
    }
    // ── 프로그램 자기 감시(장비 오류 즉시 카드 — v1 chat_plc or chat_ch1) ──
    if (source === "selfwatch" || kind === "selfwatch") {
      errorEvent("SELFWATCH", "", msg, "plc", "process");
      continue;
    }
    // ── 계약: 장비 오류 즉시 카드(호스트·로봇 서버 오류) ──
    if (kind === "error_event") {
      errorEvent(data.src ?? "HOST", data.code ?? (code && code !== "ERROR_EVENT" ? code : ""), data.message ?? msg);
      continue;
    }
    // ── 계약: 공정 모니터 글(MONITOR 웹훅) ──
    if (kind === "monitor_card") {
      const text = str(data.text) ?? msg;
      push({ kind: "monitor", channel: "monitor", msgId: e.id, notifier: null, title: text, body: textBody(text), chamber });
      continue;
    }
    // ── 계약: OES 이상 감지 글(OES 웹훅 — 중복 억제 없음, v1 그대로) ──
    if (source === "oes" && kind === "anomaly") {
      const text = str(data.text) ?? msg;
      push({ kind: "oes", channel: "oes", msgId: e.id, notifier: null, title: text, body: textBody(text), chamber });
      continue;
    }
    // ── 계약: 로봇 요청 공정 카드(CLIENT 웹훅) ──
    if (kind === "client_process") {
      const r = clientCard(str(data.kind) ?? "", isObj(data.info) ? data.info : {}, ctx.now);
      if (r.built) {
        push({ kind: "client", channel: "client", msgId: e.id, notifier: null, ...r.built, chamber,
               ...(r.dedupKey ? { dedup: { scope: "client" as const, key: r.dedupKey }, finish: r.finish } : {}) });
      }
      continue;
    }
    // ── 재시작·이어가기 결과(새 카드 1장) ──
    if (source === "process" && kind === "resumed" && NOTIFIER_OF[chamber]) {
      push({ kind: "resumed", channel: "process", msgId: e.id, notifier: NOTIFIER_OF[chamber], ...resumedCard(chamber, data, state[NOTIFIER_OF[chamber]].lastStart, msg),
             runId: str(data.run_id), chamber });
      continue;
    }
    // 재시작 뒤 열린 공정을 모르는 허브가 run_end 를 event 로 낸 경우(PROGRAM_RESTART 만 — 그 밖 시작 전 거부는 v1 도 종료 카드 없음)
    if (source === "process" && kind === "run_end" && code === PROGRAM_RESTART && NOTIFIER_OF[chamber]) {
      const st = state[NOTIFIER_OF[chamber]];
      const errs = [...st.errors];
      st.errors = [];
      const merged: Obj = { ...(st.lastStart ?? {}), ...(isObj(data.result_detail) ? data.result_detail : {}) };
      if (!truthy(merged.process_name) && msg) merged.process_name = msg;
      if (merged.ch === undefined && (chamber === "ch1" || chamber === "ch2")) merged.ch = chamber === "ch1" ? 1 : 2;
      push({ kind: "run_end", channel: "process", msgId: e.id, notifier: NOTIFIER_OF[chamber], skip: null,
             ...restartFailCard(merged, data, errs, reason, chamber), runId: str(data.run_id), chamber });
    }
  }
  return out;
}

// ───────────── 재시작·이어가기 결과 카드(새 카드 — v1 에 없음, 지시 3장 (7)) ─────────────
type Check = { name?: unknown; ok?: unknown; detail?: unknown };
const checksOf = (d: Obj): Check[] => (Array.isArray(d.checks) ? d.checks.filter(isObj) as Check[] : []);
const gapOf = (d: Obj): string | null => {
  const g = Number(d.gap_s ?? d.gapS);
  return Number.isFinite(g) ? `${Math.round(g)} s` : null;
};
function chLabel(chamber: string | null | undefined, merged: Obj | null): string {
  const t = merged ? chTxtOf(merged) : "";
  return t || CH_LABEL[chamber ?? ""] || "";
}

/** 이어가기 성공 — '공정 이어가기' SUCCESS */
export function resumedCard(chamber: string, d: Obj, lastStart: Obj | null, msg: string): Built {
  const name = pyS(or(d.name, lastStart?.process_name, lastStart?.process_note, lastStart?.Process_name, "Untitled"));
  const ch = chLabel(chamber, (chamber === "ch1" || chamber === "ch2") ? { ch: chamber === "ch1" ? 1 : 2 } : lastStart);
  const gap = gapOf(d);
  const f: [string, unknown][] = [];
  if (ch) f.push(["Chamber", ch]);
  f.push(["결과", `프로그램 재시작 뒤 이어감${gap ? `(공백 ${gap})` : ""}`], ["공정 이름", name]);
  const blk = isObj(d.block) ? d.block : null;
  const bl = blk ? [blk.no !== undefined ? `${pyS(blk.no)}` : "", str(blk.label) ?? str(blk.type) ?? ""].filter(Boolean).join(" ")
    : str(d.block_label) ?? "";
  if (bl) f.push(["이어간 블록", bl]);
  const checks = checksOf(d);
  if (checks.length) f.push(["확인", `${checks.filter((x) => x.ok === true).length}/${checks.length} 통과`]);
  if (!checks.length && !gap && msg) f.push(["내용", msg]);
  const subtitle = ch ? `${ch} · ${name}` : name;
  return { title: `공정 이어가기 · ${subtitle}`, body: card("공정 이어가기", subtitle, "SUCCESS", f) };
}

/** 이어가지 못함(run_end PROGRAM_RESTART) — '공정 종료' FAIL, 종료 카드 대신 1장 */
function restartFailCard(merged: Obj, d: Obj, runErrors: string[], reason: (c: string) => string, chamber?: string): Built {
  const name = pyS(or(merged.process_name, merged.process_note, merged.Process_name, d.name, "Untitled"));
  const ch = chLabel(chamber, merged);
  const res = isObj(d.summary) ? d.summary : d;
  const checks = checksOf(isObj(res.detail) ? res.detail : res).filter((x) => x.ok !== true);
  const gap = gapOf(isObj(res.detail) ? res.detail : res) ?? gapOf(d);
  const why: string[] = checks.map((x) => `${pyS(x.name ?? "?")}${x.detail ? `: ${pyS(x.detail)}` : ""}`);
  const errs = Array.isArray(merged.errors) ? merged.errors.map(pyS) : [];
  const all = [...why, ...errs, ...runErrors];
  const f: [string, unknown][] = [];
  if (ch) f.push(["Chamber", ch]);
  f.push(["결과", `프로그램 재시작 — 이어가지 못해 안전 정지${gap ? `(공백 ${gap})` : ""}`], ["공정 이름", name],
         ["원인", all.length ? preview(all) : ` • ${reason(PROGRAM_RESTART)}${reason(PROGRAM_RESTART) !== PROGRAM_RESTART ? ` (${PROGRAM_RESTART})` : ""}`]);
  const subtitle = ch ? `${ch} · ${name}` : name;
  return { title: `공정 종료 · ${subtitle} · 프로그램 재시작`, body: card("공정 종료", subtitle, "FAIL", f) };
}
