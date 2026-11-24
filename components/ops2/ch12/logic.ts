// 챔버12 v2 장비 화면의 판단(순수 함수) — 명령 종류 고르기·챔버 인자·지금 블록의 건너뛰기/일시정지·시퀀스 편집 위치·
// 레시피 검사 환경(lib/ops2/ch12/blocks.ts envOf)·로그 챔버 나누기. React 없이.
// 명령 이름: 묶음 commands 에 있는 것만 버튼으로 낸다(장비 명령 표가 정한다). 후보 여러 개 중 묶음에 있는 첫 이름을 쓴다 —
// 묶음에 없으면 첫 후보(권한 kinds 에도 없으므로 버튼은 잠긴다).
import { envOf, type BlockDef, type Cfg, type Ch12Defs, type Ch12Env } from "@/lib/ops2/ch12/blocks";
import { paramValue } from "../chk/logic";
import type { FeedItem } from "../chk/useChk2";
import { STATE_FALLBACK, buttonName, placeName, plcLabel, toTerms12 } from "@/lib/ops2/ch12/terms";
import {
  asChk, type ArgDef12, type Ch12Bundle, type Ch12State, type ChamberId, type ChamberState, type CommandDef12,
  type EngineState,
} from "./types";

/** 명령 이름 — 장비 v2/ch12/commands.py 명령 표(묶음 commands)의 이름을 먼저, 뒤 후보는 표가 바뀌었을 때를 대비한 것 */
export const KINDS = {
  stop: ["PROCESS_STOP"], allStop: ["ALL_STOP"], buzz: ["BUZZ_STOP"],
  skip: ["BLOCK_SKIP", "PROCESS_SKIP"], pause: ["PROCESS_PAUSE"], resume: ["PROCESS_RESUME"],
  edit: ["SEQUENCE_EDIT", "PROCESS_EDIT"], adjust: ["PROCESS_ADJUST"],
  load: ["RECIPE_LOAD"], start: ["PROCESS_START", "RECIPE_START"], clear: ["RECIPE_CLEAR"],
  errClear: ["CHAMBER_ERROR_CLEAR"], preReserve: ["PRESPUTTER_RESERVE"], preCancel: ["PRESPUTTER_CANCEL"],
  pcStart: ["PC_START"], pcStop: ["PC_STOP"], pcSelect: ["PC_SELECT_CH"], pcErrClear: ["PC_ERROR_CLEAR"],
  tspStart: ["TSP_START"], tspStop: ["TSP_STOP"], tspSchedule: ["TSP_SCHEDULE"],
  heaterOnOff: ["HEATER_ONOFF"], heaterApply: ["HEATER_APPLY"], heaterReset: ["HEATER_RESET"],
  thkZero: ["THICKNESS_ZERO"], thkReload: ["THICKNESS_RELOAD"], thkWindow: ["THICKNESS_WINDOW"], powerSelect: ["POWER_SELECT"], dump: ["RUNTIME_DUMP"],
  plc: ["PLC_BUTTON"],
} as const;

/** 부저 정지 PLC 버튼(장비에 BUZZ_STOP 명령이 없으면 이 버튼 — v1 BUZZER_STOP_SW) */
export const BUZZER_TARGET = "buzzer_stop_sw";

/** 정지 쪽 — 결과를 기다리는 중에도 막지 않고, 화면 stream 이 끊겨도 웹이 장비와 이어져 있으면 보낸다(챔버K STOP_KINDS + 챔버12) */
export const STOP_KINDS12: readonly string[] = ["PROCESS_STOP", "ALL_STOP", "BUZZ_STOP", "PC_STOP", "TSP_STOP"];

export const cmdDef = (b: Ch12Bundle | null, kind: string): CommandDef12 | undefined =>
  b?.commands?.find((c) => c.kind === kind);

/** 후보 중 묶음에 있는 첫 이름(없으면 첫 후보) */
export function pickKind(b: Ch12Bundle | null, cands: readonly string[]): string {
  return cands.find((k) => !!cmdDef(b, k)) ?? cands[0];
}
export const hasKind = (b: Ch12Bundle | null, cands: readonly string[]) => cands.some((k) => !!cmdDef(b, k));

export const argOf = (b: Ch12Bundle | null, kind: string, name: string): ArgDef12 | undefined =>
  cmdDef(b, kind)?.args?.find((a) => a.name === name);

/** 챔버 인자 이름 — 장비 명령 표는 ch(1|2), 정의에 chamber 가 있으면 그것 */
export function chamberArgName(b: Ch12Bundle | null, kind: string): "ch" | "chamber" {
  return argOf(b, kind, "chamber") && !argOf(b, kind, "ch") ? "chamber" : "ch";
}

/** 챔버 인자 값 — int(ch) 면 1·2, 글이면 "ch1"·"ch2" */
export function chamberArg(b: Ch12Bundle | null, kind: string, ch: "ch1" | "ch2"): unknown {
  const a = argOf(b, kind, chamberArgName(b, kind));
  return a && a.type !== "int" ? ch : ch === "ch1" ? 1 : 2;
}

/** 챔버별 명령 인자 — ch 를 늘 넣는다(정의에 없는 extra 키는 뺀다 — 장비가 BAD_ARGS 로 거부하지 않게) */
export function chArgs(b: Ch12Bundle | null, kind: string, ch: "ch1" | "ch2", extra: Record<string, unknown> = {}) {
  const def = cmdDef(b, kind);
  const keep = def?.args ? Object.fromEntries(Object.entries(extra).filter(([k]) => def.args!.some((a) => a.name === k))) : extra;
  return { [chamberArgName(b, kind)]: chamberArg(b, kind, ch), ...keep };
}

// ───────────── 상태 ─────────────
export const chamberState = (st: Ch12State | null, ch: ChamberId): ChamberState | null => st?.chambers?.[ch] ?? null;

/** 엔진 화면 상태 — 장비 허브 state.engines 의 키는 챔버 공정이 "proc.ch1"·"proc.ch2"(assembly.register_engine),
 *  플라즈마 클리닝·TSP 는 "pc"·"tsp". 챔버 이름만으로도(옛 키) 찾는다 */
export function engineOf(st: Ch12State | null, ch: ChamberId): EngineState | undefined {
  const e = st?.engines;
  if (!e) return undefined;
  return (ch === "ch1" || ch === "ch2" ? e[`proc.${ch}`] ?? e[ch] : e[ch]) ?? undefined;
}

/** 공정 상태 이름·종류 — 묶음 states(장비 표)를 먼저, 없으면 대신 쓰는 이름 */
export function stateInfo(b: Ch12Bundle | null, name: string | null | undefined, ch?: string): { label: string; kind: string } {
  if (!name) return { label: "상태 없음", kind: "none" };
  const s = b?.states?.find((x) => x.name === name) ?? (ch ? b?.states?.find((x) => x.name === `${ch}.${name}`) : undefined);
  if (s) return { label: toTerms12(s.label), kind: s.kind };
  const f = STATE_FALLBACK[name];
  return f ? { label: f.label, kind: f.kind } : { label: name, kind: "active" };
}

/** 진행 중인가 — 상태 종류 active 이거나 run id 가 있음(정지 순서 제외) */
export function isRunning(b: Ch12Bundle | null, cs: ChamberState | null): boolean {
  if (!cs) return false;
  const k = stateInfo(b, cs.procState).kind;
  if (k === "stopping" || k === "end") return false;
  return k === "active" || (!!cs.runId && k !== "idle");
}

/** 블록 정의(챔버12 — 이름·skippable·pausable·pause 뜻) */
export const blockDefOf = (b: Ch12Bundle | null, type: string | null | undefined): BlockDef | undefined =>
  type ? (b?.blocks?.defs as BlockDef[] | undefined)?.find((d) => d.type === type) : undefined;

/** 단계 종류 이름 — 묶음 blocks.defs label(옛 묶음이면 용어표 말) */
export const blockLabel = (b: Ch12Bundle | null, type: string | null | undefined): string => {
  const l = blockDefOf(b, type)?.label;
  return l ? toTerms12(l) : type ?? "-";
};

/** 지금 블록을 건너뛸·멈출 수 있는가(블록 정의 — 마지막 판단은 장비: SKIP_NOT_ALLOWED·PAUSE_NOT_ALLOWED) */
export function blockControl(b: Ch12Bundle | null, cs: ChamberState | null): {
  def: BlockDef | undefined; skip: boolean; pause: boolean; why: string; pauseText: string; auto: boolean;
} {
  const step = cs?.step;
  const def = blockDefOf(b, step?.type);
  const auto = !!step && typeof step.no === "number" && typeof step.total === "number" && step.no > step.total;
  if (!def) return { def, skip: false, pause: false, auto, why: step?.type ? "장비 정보에 없는 단계" : "지금 단계 없음", pauseText: "" };
  if (auto) return { def, skip: false, pause: false, auto, why: "정상 끝 정지라 건너뛰기·일시정지 없음", pauseText: "" };
  return {
    def, auto, skip: def.skippable, pause: def.pausable, pauseText: def.pause || "",
    why: [!def.skippable && "건너뛸 수 없는 단계", !def.pausable && "멈출 수 없는 단계"].filter(Boolean).join(" · "),
  };
}

// ───────────── 레시피 검사 환경 ─────────────
/** 묶음 params 의 지금 값(current, 없으면 default) — 검사·템플릿이 읽는 설정 */
export function cfgOf(b: Ch12Bundle | null): Cfg {
  const out: Record<string, unknown> = {};
  for (const p of b?.params ?? []) out[p.key] = p.current ?? p.default ?? null;
  return out;
}

/** 묶음 → 장비 web_blocks.definitions() 모양(version·blocks·cfg·recipe) */
export function defsOf(b: Ch12Bundle | null): Ch12Defs | null {
  if (!b?.blocks || !b.recipe || !b.blocks.cfg) return null;
  return { version: b.blocks.version ?? 0, blocks: b.blocks, cfg: b.blocks.cfg, recipe: b.recipe } as Ch12Defs;
}

/** 챔버 1·2 검사 환경 — 정의 판·규칙이 이 웹과 다르면 null(웹 검사 안 함, 장비가 판단) */
export function envFor(b: Ch12Bundle | null, chamber: 1 | 2): Ch12Env | null {
  const d = defsOf(b);
  return d ? envOf(d, cfgOf(b), chamber) : null;
}

/** PLC 값 믿음 기준(초) — CH2_HEATER_STALE_SEC(히터 'PLC 응답 없음'과 같은 기준), 없으면 5 */
export function plcStaleSec(b: Ch12Bundle | null): number {
  const v = paramValue(asChk(b), "CH2_HEATER_STALE_SEC");
  return typeof v === "number" && v > 0 ? v : 5;
}

// ───────────── PLC 버튼(2026-11-20 D425) ─────────────
/** 누가 — 웹은 로그인한 이름(없으면 계정, 이메일이면 @ 앞)'(웹)', 노트북은 로그인이 없어 '노트북' */
export function whoOf(origin: unknown, by: unknown, byName?: unknown): string {
  if (origin === "local") return "노트북";
  if (origin === "robot") return "로봇";
  const b = typeof by === "string" ? by : "";
  const n = (typeof byName === "string" ? byName.trim() : "") || (b.includes("@") ? b.split("@")[0] : b) || "알 수 없음";
  return origin === "web" ? `${n}(웹)` : n;
}

/** PLC 버튼 사건(장비 command/plc_button data) → 평소 보기 로그 한 줄의 출처·내용(W-19 ⑤ — 시각 | 출처 | 이름 | 내용).
 *  출처 = 누른 곳(웹·노트북·로봇), 이름 = 'PLC 버튼'(부르는 쪽), 내용 = 'CH1 Vent 켜기 · 홍길동', 공정 중이면 ' · 공정 중 TEST 모드'
 *  (버튼 이름에 그 챔버가 없을 때만 'CH2 공정 중'), 거부·실패면 ' · 거부 · 사유 이름'. 같은 말이 두 번 나오지 않게(출처 '웹' 이면 이름만).
 *  장비 문장(사유 원문·계정)은 상세 보기 원시 줄에만 */
export function plcButtonLine(b: Ch12Bundle | null, cd: Record<string, unknown>): { source: string; text: string } {
  const origin = String(cd.origin ?? "");
  const source = origin === "local" ? "노트북" : origin === "robot" ? "로봇" : origin === "web" ? "웹" : "장비";
  const by = typeof cd.by === "string" ? cd.by : "";
  const name = origin === "web" ? ((typeof cd.by_name === "string" ? cd.by_name.trim() : "") || (by.includes("@") ? by.split("@")[0] : by)) : "";
  const target = typeof cd.target === "string" ? cd.target : "";
  const btn = target && b?.plcButtons?.some((x) => x.target === target) ? buttonName(b, target) : "";
  const label = btn || (typeof cd.short === "string" && cd.short && cd.short !== target ? toTerms12(cd.short) : "모르는 대상");
  const parts = [`${label} ${cd.on === true ? "켜기" : "끄기"}`];
  if (name) parts.push(name);
  const p = (cd.process && typeof cd.process === "object" ? cd.process : null) as Record<string, unknown> | null;
  if (p?.busy === true) {
    const ch = typeof p.chamber === "string" ? placeName(b, p.chamber) : "";
    const blk = typeof p.block === "string" && p.block ? toTerms12(p.block) : "";
    parts.push(`${ch && !label.startsWith(`${ch} `) ? `${ch} ` : ""}공정 중${blk ? ` ${blk}` : ""}`);
  }
  if (cd.result === "rejected" || cd.result === "failed") {
    const code = typeof cd.reason === "string" ? cd.reason : "";
    const why = b?.reasons?.find((r) => r.code === code)?.label;
    parts.push(cd.result === "rejected" ? "거부" : "실패");
    if (why && !isCodeLike(why)) parts.push(toTerms12(why));
  }
  return { source, text: parts.join(" · ") };
}
const isCodeLike = (t: string) => /^[A-Z][A-Z0-9]*_[A-Z0-9_]+$/.test(t);

/** 이 장비가 PLC 버튼 사건을 내는가(묶음 eventKinds 에 command/plc_button) — 내면 PLC_BUTTON 명령 결과 줄은 상세에만(같은 일 두 줄 막기) */
export const hasPlcEvent = (b: Ch12Bundle | null): boolean =>
  !!b?.eventKinds?.some((k) => k.source === "command" && k.kind === "plc_button");

// ───────────── 로그 ─────────────
/** 사건이 속한 챔버 — event context.chamber, run_start·run_end data.chamber, 나머지 shared */
export function feedChamber(e: FeedItem): string {
  const d = e.data as Record<string, unknown>;
  if (e.type === "event") {
    const c = d.context as Record<string, unknown> | null | undefined;
    return typeof c?.chamber === "string" ? c.chamber : "shared";
  }
  if (typeof d.chamber === "string") return d.chamber;
  const a = d.args as Record<string, unknown> | undefined;
  return typeof a?.chamber === "string" ? a.chamber : "shared";
}

/** 시퀀스 편집 — 지금 레시피 블록(엔진 web_state → 마지막 편집 사건 record.blocks → 이 run 의 run_start.blocks) */
export function currentBlocks(st: Ch12State | null, feed: FeedItem[], ch: ChamberId): { blocks: unknown[] | null; from: string } {
  const eng = engineOf(st, ch);
  // 엔진 블록 {i, type, label, params} — i(자리 번호)는 블록 정의 키가 아니라 뺀다(웹 검사가 '모르는 키'로 보지 않게)
  if (Array.isArray(eng?.blocks)) {
    return { blocks: eng.blocks.map((b) => {
      if (typeof b !== "object" || b === null) return b;
      const { i: _i, ...rest } = b as Record<string, unknown>;
      void _i;
      return rest;
    }), from: "engine" };
  }
  const runId = st?.chambers?.[ch]?.runId ?? null;
  for (let i = feed.length - 1; i >= 0; i--) {
    const e = feed[i];
    if (feedChamber(e) !== ch) continue;
    const d = e.data as Record<string, unknown>;
    if (e.type === "event") {
      const c = (d.context ?? {}) as Record<string, unknown>;
      const rec = (c.record ?? (c.data as Record<string, unknown> | undefined)?.record) as { blocks?: unknown } | undefined;
      if (c.kind === "edit" && Array.isArray(rec?.blocks)) return { blocks: rec.blocks as unknown[], from: "edit" };
    }
    if (e.type === "run_start" && (!runId || d.runId === runId) && Array.isArray(d.blocks)) {
      return { blocks: d.blocks as unknown[], from: "run_start" };
    }
  }
  return { blocks: null, from: "" };
}

/** 시작한(지금 포함) 블록 수 — 엔진 started_upto, 없으면 블록 번호(1부터 = cur_block + 1) */
export function startedUpto(st: Ch12State | null, ch: ChamberId, n: number): number {
  const eng = engineOf(st, ch);
  const v = eng?.startedUpto ?? eng?.started_upto;
  if (typeof v === "number") return Math.max(0, Math.min(n, v));
  const no = st?.chambers?.[ch]?.step?.no;
  return typeof no === "number" ? Math.max(0, Math.min(n, no)) : 0;
}

/** 초 → "1:02:05" · null 이면 "—"(확정 전 — 추정값을 만들지 않는다) */
export function clockOrDash(sec: number | null | undefined): string {
  if (typeof sec !== "number" || !Number.isFinite(sec) || sec < 0) return "—";
  const t = Math.round(sec);
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), x = t % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}` : `${m}:${String(x).padStart(2, "0")}`;
}

/** 숫자 짧게(유효 6자리) */
export const short = (v: unknown): string =>
  typeof v === "number" && Number.isFinite(v) ? String(Number(v.toPrecision(6))) : v === null || v === undefined || v === "" ? "—" : String(v);

// ───────────── 잠금(2026-11-18 화면 다시 만들기 — 챔버K Chk2Page lockOf 와 같은 순서·문구) ─────────────
/** PLC 값이 있어야 하는 명령(PLC 값이 오래되면 잠금 — 챔버K PLC_KINDS 의 챔버12 짝) */
export const PLC_KINDS12: readonly string[] = ["PLC_BUTTON", "HEATER_ONOFF", "HEATER_APPLY", "HEATER_RESET", "POWER_SELECT"];

export type LockCtx = {
  authLost: boolean; perms: { canOperate: boolean; kinds: readonly string[] } | undefined; local: boolean; bench: boolean;
  benchOk: (kind: string) => boolean; connected: boolean; webOnline: boolean; streamUp: boolean; plcOk: boolean;
  inflight: (key: string) => boolean;
};

/** 잠금 이유(없으면 null) — 로그인 끊김 → 권한(노트북은 장비가 이 화면에서 받는 명령 hello.commandKinds) → bench(benchOk 아닌 명령) →
 *  정지 쪽(연결 또는 웹 온라인이면 됨) → 결과 기다리는 중 → 장비 끊김 → PLC 값 오래됨. 마지막 판단은 장비 */
export function lockReason(c: LockCtx, kind: string, key: string = kind): string | null {
  if (c.authLost) return "로그인이 끊겨 새로고침해야 함";
  if (!c.perms) return "권한 정보를 읽는 중";
  if (c.local && !c.perms.kinds.includes(kind)) return "노트북 화면에서 받지 않는 조작이라 웹에서 해야 함";
  if (!c.perms.canOperate || !c.perms.kinds.includes(kind)) return "권한 없음(장비 담당자·관리자만)";
  if (c.bench && !c.benchOk(kind)) return "읽기 전용이라 잠김";
  if (STOP_KINDS12.includes(kind)) return c.connected || c.webOnline ? null : "장비 끊김";
  if (c.inflight(key)) return "결과를 기다리는 중";
  if (!c.connected) return c.local && !c.streamUp ? "노트북 프로그램 연결 끊김" : "장비 끊김";
  if (PLC_KINDS12.includes(kind) && !c.plcOk) return "PLC 값이 오래됨";
  return null;
}

// ───────────── PLC 버튼 이름 ─────────────
/** 작업자에게 보이는 PLC 버튼 이름 — 묶음 label(묶음 16 'CH1 MV'), 옛 묶음 label 의 코일 이름 괄호는 뺀다(terms.plcLabel). 원래 이름은 상세 보기에서만 */
export const plcName = plcLabel;

/** 버튼의 지금 값 열 — 묶음 addr(있으면) 또는 target, plc.<소문자> */
export const plcCol = (b: { target: string; addr?: string | null }) => `plc.${String(b.addr || b.target).toLowerCase()}`;

// ───────────── 입력 칸 ─────────────
export type NumRange = { min: number | null; max: number | null; unit: string; int?: boolean; minExclusive?: boolean };

/** 입력 글 → 값·오류(빈 칸은 value null, required 면 '값을 넣으세요'). 지수 표기(5e-6) 받음. 범위 문구는 장비 검사(D11)와 같은 '최소~최대 단위' */
export function checkNum(text: string, r: NumRange | null, required = false): { value: number | null; error: string | null } {
  const t = text.trim();
  if (!t) return { value: null, error: required ? "값을 넣으세요" : null };
  const v = Number(t);
  if (!Number.isFinite(v)) return { value: null, error: "숫자가 아닙니다" };
  if (r?.int && !Number.isInteger(v)) return { value: v, error: "정수여야 합니다" };
  const lo = r?.min ?? null, hi = r?.max ?? null;
  const span = `${lo ?? ""}~${hi ?? ""}${r?.unit ? ` ${r.unit}` : ""}`;
  if (lo !== null && (r?.minExclusive ? v <= lo : v < lo)) return { value: v, error: `${span} 밖입니다` };
  if (hi !== null && v > hi) return { value: v, error: `${span} 밖입니다` };
  return { value: v, error: null };
}

/** 묶음 파라미터의 범위(min·max·단위) — 입력 칸이 장비 설정 범위(D11)와 같게 */
export function paramRange(b: Ch12Bundle | null, key: string, extra: Partial<NumRange> = {}): NumRange | null {
  const p = b?.params?.find((x) => x.key === key);
  if (!p) return null;
  return { min: typeof p.min === "number" ? p.min : null, max: typeof p.max === "number" ? p.max : null, unit: p.unit ?? "",
           int: p.type === "int", ...extra };
}

/** "HH:MM"(0~23·0~59 두 자리) 인가 */
export const isHHMM = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
