// 챔버K v2 장비 화면 — 브라우저 API(/api/ops2/[equipment]/v1/*) 모양과 값 표시.
// 계약: 챔버K v2 common/messages.py(envelope·state), chk/web_schema.py(묶음). 화면은 묶음 정의만 보고 그린다.
import type { BlockDefs } from "@/lib/ops2/chk/blocks";
import type { RecipeDefs } from "@/lib/ops2/chk/recipe";

export type Envelope<T = Record<string, unknown>> = {
  id: string; instance: string; seq: number; ts: string; type: string; data: T;
};

export type Perms = { canOperate: boolean; isAdmin: boolean; kinds: string[] };

export type Hello = {
  equipment?: string; instance?: string; program?: string; version?: string; runMode?: string;
  configVersion?: number; webSchemaHash?: string | null; writesAllowed?: boolean; deviceUtc?: string;
  commandKinds?: string[];                       // 노트북 로컬 화면(HMI 경로)에서 받는 명령 — local 모드 권한
  web?: {
    online: boolean; lastSeenAt: string | null; holderInstance: string | null; sse: boolean;
    clockSkewMs: number | null; serverNow: string; label: string | null; hasSchema: boolean; perms: Perms;
  };
};

export type FieldDef = {
  column: string; name: string; type: string; unit: string; label: string; fmt: string; ownQuality?: boolean;
  summary?: string;                              // 1분 요약 방식 mean·max·min·last·any
  detail?: boolean; desc?: string; enumLabels?: Record<string, string> | null;   // 묶음 v11 — detail 은 '상세'에서만
};
export type BlockDef = { name: string; label: string; worker: string; quality: string[]; fields: FieldDef[]; desc?: string };
/** 정지 순서 단계(묶음 stopSequence·allStopSequence) */
export type SeqStepDef = { no: number; act?: string; must?: boolean; desc?: string; label?: string; when?: string };
/** event 메시지 (context.source, context.kind) → 화면 이름·level(main 평소 로그 / detail 상세에서만) — 묶음 v11 */
export type EventKindDef = { source: string; kind: string; label: string; level: string };
export type ArgDef = {
  name: string; type?: string; required?: boolean; min?: number | null; max?: number | null;
  paramMin?: string | null; paramMax?: string | null;
};
export type CommandDef = { kind: string; label: string; role?: string; sources?: string[]; args?: ArgDef[] };
export type ParamDef = {
  key: string; label?: string; unit?: string; type?: string; current?: unknown; default?: unknown; pending?: unknown;
  group?: string; min?: number | null; max?: number | null; enum?: unknown[] | null; pattern?: string | null;
  safety?: string; apply?: string; scope?: string; role?: string; webLocked?: boolean; desc?: string; note?: string;
  v1Key?: string | null; v1Source?: string | null; v1Default?: unknown; pendingConfirm?: boolean;
};
/** 공정 중 수정 항목(묶음 adjust.items — blocks.ADJUST_ITEMS) */
export type AdjustItemDef = {
  device: string; item: string; key: string; apply?: string; whenLive?: string; rules?: string[]; settle?: boolean;
  label?: string; help?: string;                 // 묶음 v11 화면용
  param: { name: string; type: string; unit?: string; required?: boolean; min?: number | null; max?: number | null;
           paramMin?: string | null; paramMax?: string | null; paramScale?: number; minExclusive?: boolean; desc?: string };
};
export type Bundle = {
  hash: string; version: number;
  paramSchemaHash?: string;
  deviceConfigVersion?: number | null;           // schema API — current 를 덮은 장비 설정 버전
  configVersion?: number | null;                 // 묶음 머리(로컬 /api/v1/schema — 장비 설정 버전)
  webConfigVersion?: number | null;              // 그 버전의 웹 행이 있으면 같은 값, 없으면 null(묶음 current 그대로)
  params?: ParamDef[];
  commands?: CommandDef[];
  reasons?: { code: string; label: string; category?: string }[];
  plcButtons?: { target: string; addr: string; label: string }[];
  states?: { name: string; label: string; kind: string }[];
  blocks?: Partial<BlockDefs>;
  stopSequence?: { steps?: SeqStepDef[]; endStopMustKeep?: number[] };
  allStopSequence?: { steps?: SeqStepDef[] };
  eventKinds?: EventKindDef[];                   // 묶음 v11
  paramGroups?: { key: string; label: string }[];   // 묶음 v11 — 설정 묶음 이름
  recipe?: RecipeDefs;
  snapshot?: { tick?: FieldDef[]; process?: FieldDef[]; blocks?: BlockDef[] };
  events?: { kind: string; label: string }[];
  crossRules?: { id: string; keys: string[]; desc: string }[];
  adjust?: { command?: string; items?: AdjustItemDef[]; settleParam?: string };
};

export type Link = { q?: string | null; age?: number | null };
/** state.adjust 한 항목 — scope live 지금 블록이 쓰는 중 · future 앞으로 올 블록 · done 쓰던 블록이 지남 · unused 안 씀.
 *  adjusted.t 는 장비 시계 epoch 초. busy = RF Pulse START 중(ADJUST_BUSY) */
export type AdjustState = {
  device: string; item: string; value: number | null; recipe: number | null;
  adjusted: { by?: string | null; t?: number | null; source?: string | null } | null;
  scope: "live" | "future" | "done" | "unused"; busy: boolean;
};
export type StateData = {
  procState?: string; runId?: string | null;
  step?: { no: number; total: number; type?: string | null; label?: string | null; remainS?: number | null } | null;
  remainS?: number | null;
  recipe?: { name?: string; rows?: number; row?: number | null; listActive?: boolean } | null;
  heaterRecipe?: { name?: string; state?: string; step?: number; steps?: number; held?: boolean } | null;   // held: 묶음 8(5-10)부터
  heater?: { owner?: string | null; handedOver?: boolean; gas?: string | null };
  alarms?: { ruleId: string; code?: string; since?: string }[];
  links?: Record<string, Link>;
  configVersion?: number;
  configPending?: { idle?: Record<string, unknown>; restart?: Record<string, unknown> } | null;
  adjust?: AdjustState[] | null;                 // 묶음 10(5-12)부터 — 공정 중 수정 항목의 지금 값, 공정 밖 null
  snapshot?: Record<string, unknown>;
  left?: Record<string, unknown>;
  stopping?: string | null;
  uplink?: { enabled?: boolean; connected?: boolean; lastOkAt?: string | null; lastError?: string | null;
             queued?: number; spoolBytes?: number; dropped?: number } | null;   // 장비가 본 웹 연결
};

export type EventData = {
  level: string; code: string; ruleId?: string | null; message: string;
  context?: { source?: string | null; kind?: string | null } | null;
};

export type CmdRow = {
  id: string; origin: string; kind: string; label: string | null; args: Record<string, unknown> | null;
  requestedBy: string; requestedAt: string; status: string; sentVia: string | null; sendCount: number;
  sentAt: string | null; resultReceivedAt: string | null; reasonCode: string | null; detail: string | null;
};
export type RunRow = {
  runId: string; name: string | null; recipeName: string | null; startedBy: string | null; stepNo: number | null;
  startedAt: string | null; endedAt: string | null; result: string | null; reasonCode: string | null;
};

const ADJ_RESULT: Record<string, string> = {
  applied: "바로 적용", scheduled: "다음 블록부터", confirmed: "장비 확인", failed: "장비 적용 실패", rejected: "거부",
};

/** 공정 중 수정 사건(PROCESS_ADJUST — context.data {device, item, old, new, by, result, reason}) 한 줄. 아니면 null */
export function adjustText(b: Bundle | null, code: unknown, context: unknown): string | null {
  if (code !== "PROCESS_ADJUST" || !context || typeof context !== "object") return null;
  const d = (context as { data?: Record<string, unknown> }).data;
  if (!d) return null;
  const v = (x: unknown) => (x === null || x === undefined ? "—" : String(x));
  const r = String(d.result ?? "");
  return `공정 중 수정 — ${v(d.by)} · ${v(d.device)}.${v(d.item)} ${v(d.old)} → ${v(d.new)} · ${ADJ_RESULT[r] ?? r}`
    + `${d.reason ? ` (${reasonLabel(b, String(d.reason))})` : ""}${d.block ? ` · 블록 ${v(d.block)}` : ""}`;
}

/** 웹이 붙이는 사유(묶음 reasons 에 없는 것) */
const WEB_REASONS: Record<string, string> = {
  WEB_EXPIRED: "웹이 장비로 보내지 못하고 만료",
  INSTANCE_CHANGED: "장비 프로그램이 다시 켜져 보내지 않음",
  INSTANCE_TAKEOVER: "다른 실행이 넘겨받음",
  INSTANCE_RELEASED: "주인 실행 비움(강제 인수)",
};

export function reasonLabel(b: Bundle | null, code?: string | null): string {
  if (!code) return "";
  return b?.reasons?.find((r) => r.code === code)?.label ?? WEB_REASONS[code] ?? code;
}

export function stateLabel(b: Bundle | null, name?: string | null): string {
  if (!name) return "-";
  return b?.states?.find((s) => s.name === name)?.label ?? name;
}

export function commandLabel(b: Bundle | null, kind: string): string {
  return b?.commands?.find((c) => c.kind === kind)?.label ?? kind;
}

/** 파이썬 format spec(.Nf·.NE·.Ne·d) 그대로. 빈 값은 "" — 부르는 쪽이 "—" 로 */
export function fmtValue(v: unknown, fmt: string): string {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "boolean") return v ? "ON" : "OFF";
  if (typeof v !== "number" || !Number.isFinite(v)) return String(v);
  const m = /^\.(\d+)([fFeE])$/.exec(fmt);
  if (m) {
    const n = Number(m[1]);
    if (m[2] === "f" || m[2] === "F") return v.toFixed(n);
    // 파이썬은 지수를 부호와 두 자리 이상으로(1.23E-06)
    const s = v.toExponential(n).replace(/e([+-])(\d)$/, (_m, sign: string, d: string) => `e${sign}0${d}`);
    return m[2] === "E" ? s.toUpperCase() : s;
  }
  if (fmt === "d") return String(Math.trunc(v));
  return String(v);
}

/** 품질 배지 이름(평소) — state.links 의 q */
export const Q_LABEL: Record<string, string> = {
  ok: "정상", late: "늦음", stale: "오래됨", fail: "끊김", off: "꺼짐", suppressed: "쉼",
};

/** 품질 배지 색 — state.links 의 q */
export const Q_TONE: Record<string, string> = {
  ok: "bg-emerald-50 text-emerald-700",
  late: "bg-amber-50 text-amber-700",
  stale: "bg-orange-50 text-orange-700",
  fail: "bg-rose-50 text-rose-700",
  off: "bg-gray-100 text-gray-500",
  suppressed: "bg-sky-50 text-sky-700",
};

export const HEATER_OWNER: Record<string, string> = { manual: "수동", recipe: "히터 레시피", process: "공정" };
export const GAS_STATE: Record<string, string> = {
  IDLE: "가스 없음", PREPARING: "가스 준비 중", READY: "가스 유지 중", RELEASING: "가스 해제 중",
};
export const RUN_RESULT: Record<string, string> = { done: "정상", aborted: "중단", error: "오류" };
export const CMD_STATUS: Record<string, string> = {
  pending: "대기", sent: "보냄", accepted: "받음", rejected: "거부", expired: "만료",
};
