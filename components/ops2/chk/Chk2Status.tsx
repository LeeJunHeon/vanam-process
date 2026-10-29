"use client";

// 챔버K v2 상태 — v1 상태 카드 모양. 대기: 큰 글 "대기 중" + 마지막 공정. 공정 중: "가동 중" + 공정 상태 한글 라벨,
// 레시피·행·블록(블록 이름·이름표), 시작·경과(부르는 쪽이 elapsedS), 오른쪽 크게 남은 시간(remainS 가 있을 때만), 블록 진행 막대.
// 정지 순서 중이면 주황 줄, 알람은 빨간 칩(사유 라벨 — 규칙 id 는 '상세'), 지난 공정이 남긴 출력은 한글로.
// 오른쪽에 정지 줄(부저 정지·STOP·ALL STOP — 확인창). StatusBar = 스크롤했을 때 위에 붙는 얇은 줄(같은 버튼·같은 동작).
// run id·원시 상태 이름·히터 레시피 원래 상태는 '상세'에서만.
import { AlertTriangle, BellOff, OctagonX, Square } from "lucide-react";
import { Card, type Ask } from "./kit";
import { fmtKst } from "@/lib/ops2/time";
import type { RecipeItem } from "./useRecipes";
import { useChk2Mode } from "./mode";
import { blockName, fmtClock, fmtDur, runTitle } from "./text";
import {
  GAS_STATE, HEATER_OWNER, RUN_RESULT, reasonLabel, stateLabel, type Bundle, type RunRow, type StateData,
} from "./types";

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

function StopButtons({ can, onAsk, small }: { can: (kind: string) => boolean; onAsk: (a: Ask) => void; small?: boolean }) {
  const pad = small ? "px-2.5 py-1" : "px-3 py-2";
  return (
    <div className="flex shrink-0 flex-wrap gap-2">
      <button disabled={!can("BUZZ_STOP")}
        onClick={() => onAsk({ kind: "BUZZ_STOP", label: "부저 정지", stop: true, note: "울리는 부저를 끕니다." })}
        className={`flex items-center gap-1 rounded-xl border border-gray-200 bg-white ${pad} text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40`}>
        <BellOff size={14} /> 부저 정지
      </button>
      <button disabled={!can("PROCESS_STOP")}
        onClick={() => onAsk({ kind: "PROCESS_STOP", label: "공정 STOP", stop: true,
                               note: "진행 중인 공정을 정지 순서대로 멈춥니다. 공정이 없으면 지난 공정이 남긴 출력만 정리합니다." })}
        className={`flex items-center gap-1 rounded-xl border border-rose-300 bg-white ${pad} text-xs font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-40`}>
        <Square size={14} /> STOP
      </button>
      <button disabled={!can("ALL_STOP")}
        onClick={() => onAsk({ kind: "ALL_STOP", label: "ALL STOP", stop: true,
                               note: "공정과 출력을 모두 끕니다(공정 여부와 무관 — 펌프·밸브 코일, 히터, 파워, 가스)." })}
        className={`flex items-center gap-1 rounded-xl bg-rose-600 ${pad} text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-40`}>
        <OctagonX size={14} /> ALL STOP
      </button>
    </div>
  );
}

const kindOf = (b: Bundle | null, st: StateData | null) => b?.states?.find((s) => s.name === st?.procState)?.kind;
const remainOf = (st: StateData | null) => {
  const r = st?.step?.remainS ?? st?.remainS;
  return typeof r === "number" && r >= 0 ? r : null;
};

/** 스크롤했을 때 위에 붙는 얇은 줄 — 상태 이름·남은 시간·정지 버튼 */
export function StatusBar({ bundle, st, connected, can, onAsk }: {
  bundle: Bundle | null; st: StateData | null; connected: boolean; can: (kind: string) => boolean; onAsk: (a: Ask) => void;
}) {
  const kind = kindOf(bundle, st);
  const remain = remainOf(st);
  const step = st?.step;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white/95 px-3 py-1.5 shadow-md backdrop-blur">
      <span className={`text-[11px] font-semibold ${kind === "active" ? "text-blue-600" : kind === "stopping" ? "text-amber-600" : "text-gray-500"}`}>
        {kind === "active" ? "가동 중" : kind === "stopping" ? "정지 중" : "대기"}
      </span>
      <b className={`truncate text-sm ${connected ? "text-gray-900" : "text-gray-400"}`}>
        {st ? (st.procState === "IDLE" ? "대기 중" : stateLabel(bundle, st.procState)) : "상태 없음"}
      </b>
      {step && <span className="text-[11px] text-gray-500">블록 {step.no}/{step.total}</span>}
      {remain !== null && <span className="text-sm font-bold tabular-nums text-gray-900">남은 {fmtClock(remain)}</span>}
      <span className="ml-auto"><StopButtons can={can} onAsk={onAsk} small /></span>
    </div>
  );
}

export default function Chk2Status({ bundle, st, connected, lastRun, can, onAsk, webRecipes, elapsedS, startedMs }: {
  bundle: Bundle | null;
  st: StateData | null;
  connected: boolean;
  lastRun: RunRow | null;
  can: (kind: string) => boolean;
  onAsk: (a: Ask) => void;
  webRecipes?: RecipeItem[] | null;              // 적재된 이름이 웹의 어느 레시피인지('상세')
  elapsedS?: number | null;                      // 진행 중 공정의 경과(초)
  startedMs?: number | null;                     // 진행 중 공정의 시작(웹 시계 ms)
}) {
  const { detail } = useChk2Mode();
  const webMark = (kind: string, name?: string | null) => !detail || !webRecipes || !name ? null
    : webRecipes.some((r) => r.kind === kind && r.name === name)
      ? <span className="ml-1 rounded bg-blue-50 px-1 text-[10px] text-blue-700">웹 레시피</span>
      : <span className="ml-1 rounded bg-gray-100 px-1 text-[10px] text-gray-500">웹 목록에 없는 이름</span>;
  const kind = kindOf(bundle, st);
  const step = st?.step;
  const remain = remainOf(st);
  const alarms = st?.alarms ?? [];
  const left = st?.left ?? {};
  const owner = st?.heater?.owner;
  const stopBar = <StopButtons can={can} onAsk={onAsk} />;

  if (!st) {
    return (
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xl font-bold tracking-tight text-gray-300 sm:text-2xl">상태 없음</p>
            <p className="mt-1 text-xs text-gray-400">장비 프로그램이 웹에 연결되면 실시간 상태가 표시됩니다</p>
          </div>
          {stopBar}
        </div>
      </Card>
    );
  }

  const active = kind === "active";
  const stepName = step?.type ? blockName(bundle, step.type) : null;
  // 블록 이름표(없으면 장비가 블록 번호를 싣는다 — 숫자면 공정 상태 라벨로)
  const stepSub = (step?.label && !/^[\d.#]+$/.test(step.label) ? step.label : "") || (st.procState ? stateLabel(bundle, st.procState) : "");
  const rec = st.recipe;
  const recText = rec ? `레시피 ${rec.name || "이름 없음"}${rec.listActive
    ? ` · 레시피 진행 중(${rec.row ?? "-"}/${rec.rows ?? "-"}행)`
    : rec.row ? ` · ${rec.row}/${rec.rows ?? "-"}행` : ` · 적재됨 · ${rec.rows ?? "-"}행`}` : null;
  const progress = step && step.total > 0 ? Math.min(1, Math.max(0, step.no / step.total)) : null;
  const startedAt = startedMs !== null && startedMs !== undefined ? new Date(startedMs) : null;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-gray-500">
            {active ? "가동 중" : kind === "stopping" ? "정지 중" : kind === "end" ? "끝남" : "대기"}
            {detail && st.runId && <span className="ml-2 font-mono font-normal text-gray-400">run {st.runId}</span>}
          </p>
          <p className={`mt-0.5 truncate text-xl font-bold sm:text-2xl ${connected ? "text-gray-900" : "text-gray-400"}`}>
            {st.procState === "IDLE" ? "대기 중" : stateLabel(bundle, st.procState)}
            {detail && <span className="ml-2 align-middle font-mono text-[11px] font-normal text-gray-300">{st.procState}</span>}
          </p>
          {(recText || step) && (
            <p className="mt-1 text-xs text-gray-600">
              {recText}{webMark("process", rec?.name)}
              {step && <>{recText && " · "}블록 <b className="tabular-nums">{step.no}/{step.total}</b>
                {stepName && <> {stepName}{stepSub && stepSub !== stepName && <span className="text-gray-500">({stepSub})</span>}</>}</>}
            </p>
          )}
          {active && startedAt && (
            <p className="mt-0.5 text-[11px] text-gray-500">
              시작 {fmtKst(startedAt.toISOString()).slice(6)} · 경과 <b className="tabular-nums">{fmtDur(elapsedS ?? 0)}</b>
            </p>
          )}
          {!active && kind !== "stopping" && lastRun && (
            <p className="mt-0.5 text-[11px] text-gray-400">
              마지막 공정 {fmtKst(lastRun.startedAt ?? lastRun.endedAt).slice(0, 11)} · {runTitle(lastRun)} ·{" "}
              {lastRun.result ? RUN_RESULT[lastRun.result] ?? lastRun.result : "끝 기록 없음"}
              {lastRun.reasonCode && ` (${reasonLabel(bundle, lastRun.reasonCode)})`}
            </p>
          )}
          {(owner || st.heaterRecipe || (st.heater?.gas && st.heater.gas !== "IDLE")) && (
            <p className="mt-0.5 text-[11px] text-gray-500">
              {owner && `히터: ${HEATER_OWNER[owner] ?? owner} 소유`}
              {st.heater?.handedOver && " · 공정에서 넘겨받음"}
              {st.heater?.gas && st.heater.gas !== "IDLE" && ` · ${GAS_STATE[st.heater.gas] ?? st.heater.gas}`}
              {st.heaterRecipe && <> · 히터 레시피 {st.heaterRecipe.name ?? ""}{webMark("heater", st.heaterRecipe.name)} {st.heaterRecipe.step ?? "-"}/{st.heaterRecipe.steps ?? "-"}
                {detail && st.heaterRecipe.state ? ` (${st.heaterRecipe.state})` : ""}{st.heaterRecipe.held ? " · 일시정지" : ""}</>}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          {stopBar}
          {remain !== null && (
            <p className="text-right">
              <span className="block text-[11px] text-gray-400">남은 시간</span>
              <span className="text-3xl font-bold tabular-nums text-gray-900">{fmtClock(remain)}</span>
            </p>
          )}
        </div>
      </div>

      {active && progress !== null && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100" title={`블록 ${step?.no}/${step?.total}`}>
          <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${progress * 100}%` }} />
        </div>
      )}

      {(st.stopping || alarms.length > 0 || Object.keys(left).length > 0) && (
        <div className="mt-2 space-y-1.5">
          {st.stopping && (
            <p className="rounded-lg bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700">
              정지 순서 실행 중 — {STOPPING_LABEL[st.stopping] ?? st.stopping}
              {detail && <span className="ml-1 font-mono font-normal">{st.stopping}</span>}
            </p>
          )}
          {alarms.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {alarms.map((a) => (
                <span key={a.ruleId} title={`${a.ruleId}${a.since ? ` · 시작 ${fmtKst(a.since)}` : ""}`}
                  className="flex items-center gap-1 rounded-lg bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700">
                  <AlertTriangle size={12} /> {a.code ? reasonLabel(bundle, a.code) : a.ruleId}
                  {detail && <span className="font-mono font-normal">{a.ruleId}{a.code && ` · ${a.code}`}</span>}
                </span>
              ))}
            </div>
          )}
          {Object.keys(left).length > 0 && (
            <p className="rounded-lg bg-amber-50 px-2 py-1 text-[11px] text-amber-700">
              <b>지난 공정이 남긴 출력</b> — {leftText(left)} 켜져 있음 — STOP 으로 정리
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
