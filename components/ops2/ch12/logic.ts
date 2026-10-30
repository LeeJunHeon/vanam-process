// 챔버12 v2 장비 화면의 판단(순수 함수) — 명령 종류 고르기·챔버 인자·지금 블록의 건너뛰기/일시정지·시퀀스 편집 위치·
// 레시피 검사 환경(lib/ops2/ch12/blocks.ts envOf)·로그 챔버 나누기. React 없이.
// 명령 이름: 묶음 commands 에 있는 것만 버튼으로 낸다(장비 명령 표가 정한다). 후보 여러 개 중 묶음에 있는 첫 이름을 쓴다 —
// 묶음에 없으면 첫 후보(권한 kinds 에도 없으므로 버튼은 잠긴다).
import { envOf, type BlockDef, type Cfg, type Ch12Defs, type Ch12Env } from "@/lib/ops2/ch12/blocks";
import { paramValue } from "../chk/logic";
import type { FeedItem } from "../chk/useChk2";
import {
  STATE_FALLBACK, asChk, type ArgDef12, type Ch12Bundle, type Ch12State, type ChamberId, type ChamberState, type CommandDef12,
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
  thkZero: ["THICKNESS_ZERO"], thkReload: ["THICKNESS_RELOAD"], powerSelect: ["POWER_SELECT"], dump: ["RUNTIME_DUMP"],
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

/** 공정 상태 이름·종류 — 묶음 states(장비 표)를 먼저, 없으면 대신 쓰는 이름 */
export function stateInfo(b: Ch12Bundle | null, name: string | null | undefined, ch?: string): { label: string; kind: string } {
  if (!name) return { label: "상태 없음", kind: "none" };
  const s = b?.states?.find((x) => x.name === name) ?? (ch ? b?.states?.find((x) => x.name === `${ch}.${name}`) : undefined);
  if (s) return { label: s.label, kind: s.kind };
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

export const blockLabel = (b: Ch12Bundle | null, type: string | null | undefined): string =>
  blockDefOf(b, type)?.label ?? type ?? "-";

/** 지금 블록을 건너뛸·멈출 수 있는가(블록 정의 — 마지막 판단은 장비: SKIP_NOT_ALLOWED·PAUSE_NOT_ALLOWED) */
export function blockControl(b: Ch12Bundle | null, cs: ChamberState | null): {
  def: BlockDef | undefined; skip: boolean; pause: boolean; why: string; pauseText: string; auto: boolean;
} {
  const step = cs?.step;
  const def = blockDefOf(b, step?.type);
  const auto = !!step && typeof step.no === "number" && typeof step.total === "number" && step.no > step.total;
  if (!def) return { def, skip: false, pause: false, auto, why: step?.type ? "정의 없는 블록" : "지금 블록 없음", pauseText: "" };
  if (auto) return { def, skip: false, pause: false, auto, why: "자동 끝 정지 — 건너뛰기·일시정지 없음", pauseText: "" };
  return {
    def, auto, skip: def.skippable, pause: def.pausable, pauseText: def.pause || "",
    why: [!def.skippable && "건너뛸 수 없는 블록", !def.pausable && "멈출 수 없는 블록"].filter(Boolean).join(" · "),
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
  const eng = st?.engines?.[ch];
  if (Array.isArray(eng?.blocks)) return { blocks: eng.blocks, from: "engine" };
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
  const eng = st?.engines?.[ch];
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
