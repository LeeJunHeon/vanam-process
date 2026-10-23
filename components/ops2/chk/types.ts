// 챔버K v2 장비 화면 — 브라우저 API(/api/ops2/[equipment]/v1/*) 모양과 값 표시.
// 계약: 챔버K v2 common/messages.py(envelope·state), chk/web_schema.py(묶음). 화면은 묶음 정의만 보고 그린다.

export type Envelope<T = Record<string, unknown>> = {
  id: string; instance: string; seq: number; ts: string; type: string; data: T;
};

export type Perms = { canOperate: boolean; isAdmin: boolean; kinds: string[] };

export type Hello = {
  equipment?: string; instance?: string; program?: string; version?: string; runMode?: string;
  configVersion?: number; webSchemaHash?: string | null; writesAllowed?: boolean; deviceUtc?: string;
  web?: {
    online: boolean; lastSeenAt: string | null; holderInstance: string | null; sse: boolean;
    clockSkewMs: number | null; serverNow: string; label: string | null; hasSchema: boolean; perms: Perms;
  };
};

export type FieldDef = {
  column: string; name: string; type: string; unit: string; label: string; fmt: string; ownQuality?: boolean;
};
export type BlockDef = { name: string; label: string; worker: string; quality: string[]; fields: FieldDef[] };
export type ArgDef = {
  name: string; type?: string; required?: boolean; min?: number | null; max?: number | null;
  paramMin?: string | null; paramMax?: string | null;
};
export type CommandDef = { kind: string; label: string; role?: string; sources?: string[]; args?: ArgDef[] };
export type ParamDef = { key: string; label?: string; unit?: string; current?: unknown; default?: unknown };
export type Bundle = {
  hash: string; version: number;
  params?: ParamDef[];
  commands?: CommandDef[];
  reasons?: { code: string; label: string; category?: string }[];
  plcButtons?: { target: string; addr: string; label: string }[];
  states?: { name: string; label: string; kind: string }[];
  blocks?: { defs?: { type: string; label: string }[] };
  snapshot?: { blocks?: BlockDef[] };
};

export type Link = { q?: string | null; age?: number | null };
export type StateData = {
  procState?: string; runId?: string | null;
  step?: { no: number; total: number; type?: string | null; label?: string | null; remainS?: number | null } | null;
  remainS?: number | null;
  recipe?: { name?: string; rows?: number; row?: number | null; listActive?: boolean } | null;
  heaterRecipe?: { name?: string; state?: string; step?: number; steps?: number } | null;
  heater?: { owner?: string | null; handedOver?: boolean; gas?: string | null };
  alarms?: { ruleId: string; code?: string; since?: string }[];
  links?: Record<string, Link>;
  configVersion?: number;
  snapshot?: Record<string, unknown>;
  left?: Record<string, unknown>;
  stopping?: string | null;
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
