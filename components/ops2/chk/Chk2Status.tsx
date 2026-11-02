"use client";

// 챔버K v2 상태 띠(W-10 — 모든 탭 위에 늘 보임). 왼쪽: 장비 이름·id·연결 칩(연결됨·n초 전 / 늦음 / 끊김 — 끊김만 빨강)·
// 모드 칩(실제 운전 / 읽기 전용(bench) 어두운 칩 + 자물쇠 / SIM — 모의 장비). 가운데: 공정 상태(크게)·레시피·행,
// 지금 블록 글(블록 이름 + 목표 + 장비가 주는 진행 — v1 행 템플릿 블록은 공정 상태 이름), 진행 막대·시작·경과·남은 시간·
// 예상 끝(정해진 시간만, 끝을 모르는 블록이 남으면 '이상'). 일시정지 중이면 '일시정지 m:ss / 한도'(주의색).
// 히터 레시피·정지 순서·알람·지난 공정이 남긴 출력 줄. 오른쪽: 부저 정지·공정 STOP(빨간 테두리)·ALL STOP(빨간 채움).
// StatusBar = 스크롤로 띠가 안 보일 때 위에 붙는 얇은 줄(같은 버튼·같은 동작). run id·원시 이름은 '상세'에서만.
import type { ReactNode } from "react";
import { BellOff, Lock, OctagonX, PauseCircle, Square } from "lucide-react";
import { Btn, Chip, Issue, type Ask, type Tone } from "./kit";
import { fmtKst } from "@/lib/ops2/time";
import { useChk2Mode } from "./mode";
import { fmtClock, fmtDur, runTitle } from "./text";
import { blockTarget, blockTitle, kindOf, remainOf, DONE_STATUS, OPEN_TYPES } from "./runview";
import { paramValue } from "./logic";
import { HEATER_OWNER, GAS_STATE, RUN_RESULT, reasonLabel, stateLabel, type Bundle, type RunBlock, type RunRow, type StateData } from "./types";

const LEFT_LABEL: Record<string, string> = {
  filament: "이온 게이지 필라멘트", ms: "Main 셔터", heater: "히터", mfc_valve: "MFC 밸브", ar: "Ar 유량", o2: "O₂ 유량",
  s1: "Gun1 셔터", s2: "Gun2 셔터", ar_valve: "Ar 차단밸브", o2_valve: "O₂ 차단밸브",
};
const STOPPING_LABEL: Record<string, string> = {
  stop: "STOP 정지 순서", row_end: "행 끝 정지", end_stop: "정상 끝 정지", all_stop: "ALL STOP", abort: "이상 중단 정지",
};

function leftText(left: Record<string, unknown>): string {
  return Object.entries(left).map(([k, v]) => {
    const name = LEFT_LABEL[k] ?? k;
    if (v && typeof v === "object" && "target" in v) {
      const t = (v as { target: unknown }).target;
      return `${name}(목표 ${String(t ?? "-")}${k === "heater" ? " °C" : ""})`;
    }
    if (typeof v === "number") return `${name} ${v}`;
    return name;
  }).join("·");
}

export type LockFn = (kind: string) => string | null;

/** 정지 줄 — 부저 정지·공정 STOP(빨간 테두리)·ALL STOP(빨간 채움). 정지 쪽 규칙은 부르는 쪽(lock) */
export function StopButtons({ lock, onAsk, small }: { lock: LockFn; onAsk: (a: Ask) => void; small?: boolean }) {
  const size = small ? "sm" : "lg";
  return (
    <div className="flex shrink-0 flex-nowrap gap-2">
      <Btn size={size} lock={lock("BUZZ_STOP")}
        onClick={() => onAsk({ kind: "BUZZ_STOP", label: "부저 정지", stop: true, note: "울리는 부저를 끕니다." })}>
        <BellOff size={14} /> 부저 정지
      </Btn>
      <Btn size={size} kind="danger" lock={lock("PROCESS_STOP")}
        onClick={() => onAsk({ kind: "PROCESS_STOP", label: "공정 STOP", stop: true,
                               note: "진행 중인 공정을 정지 순서대로 멈춥니다. 공정이 없으면 지난 공정이 남긴 출력만 정리합니다." })}>
        <Square size={14} /> STOP
      </Btn>
      <Btn size={size} kind="dangerSolid" lock={lock("ALL_STOP")}
        onClick={() => onAsk({ kind: "ALL_STOP", label: "ALL STOP", stop: true,
                               note: "공정과 출력을 모두 끕니다(공정 여부와 무관 — 펌프·밸브 코일, 히터, 파워, 가스)." })}>
        <OctagonX size={14} /> ALL STOP
      </Btn>
    </div>
  );
}

const STATE_WORD: Record<string, string> = { active: "가동 중", stopping: "정지 중", end: "끝남" };

/** 스크롤했을 때 위에 붙는 얇은 줄 — 상태 이름·블록·남은 시간·정지 버튼 */
export function StatusBar({ bundle, st, connected, lock, onAsk }: {
  bundle: Bundle | null; st: StateData | null; connected: boolean; lock: LockFn; onAsk: (a: Ask) => void;
}) {
  const kind = kindOf(bundle, st);
  const r = st?.step?.remainS ?? st?.remainS;
  const step = st?.step;
  return (
    <div className="flex items-center gap-3 whitespace-nowrap rounded-[12px] border border-[#D9DDE3] bg-white/95 px-3 py-1.5 shadow-md backdrop-blur">
      <span className="text-[11px] font-semibold text-[#5B6470]">{STATE_WORD[kind ?? ""] ?? "대기"}</span>
      <b className={`truncate text-sm ${connected ? "text-[#1B1F24]" : "text-[#8A929D]"}`}>
        {st ? (st.procState === "IDLE" ? "대기 중" : stateLabel(bundle, st.procState)) : "상태 없음"}
      </b>
      {st?.paused && <Chip tone="warn" icon={<PauseCircle size={11} />}>일시정지</Chip>}
      {step && <span className="text-[11px] text-[#5B6470]">블록 {step.no}/{step.total}</span>}
      {typeof r === "number" && r >= 0 && <span className="text-sm font-bold tabular-nums text-[#133A7C]">남은 {fmtClock(r)}</span>}
      <span className="ml-auto"><StopButtons lock={lock} onAsk={onAsk} small /></span>
    </div>
  );
}

export type ConnInfo = { label: string; tone: Tone };

export function StatusBand({ bundle, st, connected, conn, mode, equipment, label, lock, onAsk, lastRun, startedMs, elapsedS,
  blocks, nowMs, v1Row, extra }: {
  bundle: Bundle | null; st: StateData | null; connected: boolean;
  conn: ConnInfo;                                 // 연결 칩
  mode: "run" | "bench" | "sim" | null;           // 모드 칩
  equipment: string; label: string | null;
  lock: LockFn; onAsk: (a: Ask) => void;
  lastRun: RunRow | null;
  startedMs: number | null; elapsedS: number | null;
  blocks: RunBlock[] | null;                      // state.run.blocks(기억한 것)
  nowMs: number;                                  // 웹 시계 지금(ms)
  v1Row: boolean;                                 // 지금 행이 v1 행(템플릿 블록)
  extra?: ReactNode;                              // 띠 오른쪽 아래(상세 토글 등)
}) {
  const { detail } = useChk2Mode();
  const kind = kindOf(bundle, st);
  const active = kind === "active" || kind === "stopping";
  const step = st?.step;
  const alarms = st?.alarms ?? [];
  const left = st?.left ?? {};
  const rec = st?.recipe;
  const hr = st?.heaterRecipe;
  const rem = remainOf(st, active ? blocks : null);
  const cur = typeof (step?.remainS ?? st?.remainS) === "number" ? (step?.remainS ?? st?.remainS) as number : null;
  const doneN = blocks?.filter((b) => DONE_STATUS.has(b.status)).length ?? null;
  const total = blocks?.length || step?.total || 0;
  const progress = active && total ? Math.min(1, Math.max(0, (doneN ?? Math.max(0, (step?.no ?? 1) - 1)) / total)) : null;
  const curType = step?.type ?? st?.run?.blocks?.find((b) => b.status === "running" || b.status === "paused")?.type ?? null;
  const target = blockTarget(curType, st?.snapshot);
  const pauseMax = typeof paramValue(bundle, "PROCESS_PAUSE_MAX_SEC") === "number" ? paramValue(bundle, "PROCESS_PAUSE_MAX_SEC") as number : 0;
  const paused = st?.run?.paused ?? null;
  const progText = st?.paused ? "멈춤" : cur !== null ? `남은 ${fmtClock(cur)}` : curType && OPEN_TYPES.has(curType) ? "도달 대기 중" : "";
  const endAt = rem.sec !== null && active ? new Date(nowMs + rem.sec * 1000) : null;
  const recText = rec ? `${rec.name || "이름 없음"}${rec.listActive ? ` · ${rec.row ?? "-"}/${rec.rows ?? "-"}행` : rec.row ? ` · ${rec.row}/${rec.rows ?? "-"}행` : ` · 적재됨 · ${rec.rows ?? "-"}행`}` : null;
  const hm = (d: Date) => fmtKst(d.toISOString()).slice(-8, -3);

  return (
    <section className="min-w-0 rounded-[12px] border border-[#D9DDE3] bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <b className="text-sm text-[#1B1F24]">{label || equipment}</b>
        {label && <span className="font-mono text-[11px] text-[#5B6470]">{equipment}</span>}
        <Chip tone={conn.tone}>{conn.label}</Chip>
        {mode === "bench" && <Chip tone="dark" icon={<Lock size={11} />}>읽기 전용(bench)</Chip>}
        {mode === "sim" && <Chip tone="info">SIM — 모의 장비</Chip>}
        {mode === "run" && <Chip>실제 운전</Chip>}
        {extra && <span className="ml-auto flex items-center gap-2">{extra}</span>}
      </div>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <p className={`truncate text-2xl font-bold tracking-tight ${connected ? "text-[#1B1F24]" : "text-[#8A929D]"}`}>
            {!st ? "상태 없음" : st.procState === "IDLE" ? "대기 중" : stateLabel(bundle, st.procState)}
            {detail && st?.procState && <span className="ml-2 align-middle font-mono text-[11px] font-normal text-[#8A929D]">{st.procState}</span>}
          </p>
          {!st && <p className="mt-1 text-xs text-[#5B6470]">장비 프로그램이 웹에 연결되면 실시간 상태가 표시됩니다</p>}
          {(recText || (active && step)) && (
            <p className="mt-1 text-xs text-[#5B6470]">
              {recText && <>레시피 <b className="text-[#1B1F24]">{recText}</b></>}
              {detail && st?.runId && <span className="ml-2 font-mono text-[#8A929D]">run {st.runId}</span>}
            </p>
          )}
          {active && st && (
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[#1B1F24]">
              {step && <span className="tabular-nums text-[#5B6470]">블록 {step.no}/{step.total}</span>}
              <b>{blockTitle(bundle, st, v1Row)}</b>
              {target && <span className="text-[#5B6470]">{target}</span>}
              {progText && <span className="font-semibold tabular-nums text-[#133A7C]">{progText}</span>}
            </p>
          )}
          {st && !active && lastRun && (
            <p className="mt-1 text-xs text-[#5B6470]">
              마지막 공정 {fmtKst(lastRun.startedAt ?? lastRun.endedAt).slice(0, 11)} · {runTitle(lastRun)} ·{" "}
              {lastRun.result ? RUN_RESULT[lastRun.result] ?? lastRun.result : "끝 기록 없음"}
              {lastRun.reasonCode && ` (${reasonLabel(bundle, lastRun.reasonCode)})`}
            </p>
          )}
        </div>
        <StopButtons lock={lock} onAsk={onAsk} />
      </div>

      {active && (
        <div className="mt-3 space-y-1.5">
          {progress !== null && (
            <div className="h-2 overflow-hidden rounded-full bg-[#E3E6EA]" role="progressbar" aria-valuemin={0} aria-valuemax={100}
              aria-valuenow={Math.round(progress * 100)} aria-label="공정 진행">
              <div className="h-full rounded-full bg-[#133A7C] transition-all" style={{ width: `${progress * 100}%` }} />
            </div>
          )}
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#5B6470]">
            {startedMs !== null && <span>시작 <b className="tabular-nums text-[#1B1F24]">{hm(new Date(startedMs))}</b></span>}
            {elapsedS !== null && <span>경과 <b className="tabular-nums text-[#1B1F24]">{fmtDur(elapsedS)}</b></span>}
            {rem.sec !== null && <span>남은 시간 <b className="tabular-nums text-[#1B1F24]">{fmtDur(rem.sec)}{rem.open ? " 이상" : ""}</b></span>}
            {endAt && <span>예상 끝 <b className="tabular-nums text-[#1B1F24]">{hm(endAt)}{rem.open ? " 이후" : ""}</b>
              {rem.open > 0 && <span className="ml-1">(끝을 모르는 대기 {rem.open}개)</span>}</span>}
          </p>
        </div>
      )}

      {(st?.paused || hr || st?.stopping || alarms.length > 0 || Object.keys(left).length > 0
        || (st?.heater?.owner && !active) || (st?.heater?.gas && st.heater.gas !== "IDLE")) && (
        <div className="mt-3 space-y-1.5">
          {st?.paused && (
            <Issue level="warn">
              <b>일시정지 {fmtClock(paused?.pausedS ?? 0)}</b>{pauseMax > 0 ? ` / 한도 ${fmtClock(pauseMax)}` : " · 한도 없음"}
              {paused?.by && ` · ${paused.by}`}{pauseMax > 0 && " — 한도를 넘으면 정지 순서"}
            </Issue>
          )}
          {hr && (
            <p className="text-xs text-[#5B6470]">
              히터 레시피 <b className="text-[#1B1F24]">{hr.name || "이름 없음"}</b> · 스텝 {hr.step ?? "-"}/{hr.steps ?? "-"}
              {hr.held && <Chip tone="warn" className="ml-1.5" icon={<PauseCircle size={11} />}>일시정지</Chip>}
              {detail && hr.state ? <span className="ml-1 font-mono text-[#8A929D]">{hr.state}</span> : null}
            </p>
          )}
          {(st?.heater?.owner || (st?.heater?.gas && st.heater.gas !== "IDLE")) && !hr && (
            <p className="text-xs text-[#5B6470]">
              {st?.heater?.owner && `히터: ${HEATER_OWNER[st.heater.owner] ?? st.heater.owner} 소유`}
              {st?.heater?.handedOver && " · 공정에서 넘겨받음"}
              {st?.heater?.gas && st.heater.gas !== "IDLE" && ` · ${GAS_STATE[st.heater.gas] ?? st.heater.gas}`}
            </p>
          )}
          {st?.stopping && (
            <Issue level="warn">
              정지 순서 실행 중 — {STOPPING_LABEL[st.stopping] ?? st.stopping}
              {detail && <span className="ml-1 font-mono">{st.stopping}</span>}
            </Issue>
          )}
          {alarms.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {alarms.map((a) => (
                <Chip key={a.ruleId} tone="alarm" title={`${a.ruleId}${a.since ? ` · 시작 ${fmtKst(a.since)}` : ""}`}>
                  {a.code ? reasonLabel(bundle, a.code) : a.ruleId}
                  {detail && <span className="font-mono font-normal">{a.ruleId}{a.code && ` · ${a.code}`}</span>}
                </Chip>
              ))}
            </div>
          )}
          {Object.keys(left).length > 0 && (
            <Issue level="warn"><b>지난 공정이 남긴 출력</b> — {leftText(left)} 켜져 있음 — STOP 으로 정리</Issue>
          )}
        </div>
      )}
    </section>
  );
}
