"use client";

// 챔버K v2 상태 — v1 StatusHero 모양. 공정 상태(묶음 states 라벨)·지금 블록·레시피·run·정지 순서·활성 알람·
// 지난 공정이 남긴 출력(left)·히터 소유·넘김, 오른쪽에 정지 줄(부저 정지·STOP·ALL STOP — 확인창).
import { AlertTriangle, BellOff, OctagonX, Square } from "lucide-react";
import { Card, type Ask } from "./kit";
import { fmtKst } from "@/lib/ops2/time";
import {
  GAS_STATE, HEATER_OWNER, RUN_RESULT, reasonLabel, stateLabel, type Bundle, type RunRow, type StateData,
} from "./types";

const LEFT_LABEL: Record<string, string> = {
  filament: "이온 게이지 필라멘트", ms: "Main 셔터", heater: "히터", mfc_valve: "MFC 밸브", ar: "Ar 유량", o2: "O2 유량",
};

function leftText(left: Record<string, unknown>): string {
  return Object.entries(left).map(([k, v]) => {
    const name = LEFT_LABEL[k] ?? k;
    if (v && typeof v === "object" && "target" in v) return `${name}(목표 ${String((v as { target: unknown }).target ?? "-")})`;
    if (typeof v === "number") return `${name} ${v}`;
    return name;
  }).join(" · ");
}

export default function Chk2Status({ bundle, st, connected, lastRun, can, onAsk }: {
  bundle: Bundle | null;
  st: StateData | null;
  connected: boolean;
  lastRun: RunRow | null;
  can: (kind: string) => boolean;
  onAsk: (a: Ask) => void;
}) {
  const kind = bundle?.states?.find((s) => s.name === st?.procState)?.kind;
  const step = st?.step;
  const stepType = step?.type ? bundle?.blocks?.defs?.find((d) => d.type === step.type)?.label ?? step.type : null;
  const remain = step?.remainS ?? st?.remainS;
  const alarms = st?.alarms ?? [];
  const left = st?.left ?? {};
  const owner = st?.heater?.owner;

  const stopBar = (
    <div className="flex shrink-0 flex-wrap gap-2">
      <button disabled={!can("BUZZ_STOP")}
        onClick={() => onAsk({ kind: "BUZZ_STOP", label: "부저 정지" })}
        className="flex items-center gap-1 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40">
        <BellOff size={14} /> 부저 정지
      </button>
      <button disabled={!can("PROCESS_STOP")}
        onClick={() => onAsk({ kind: "PROCESS_STOP", label: "공정 STOP", detail: "(공정이 없으면 남은 출력만 정리)" })}
        className="flex items-center gap-1 rounded-xl border border-rose-300 bg-white px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-40">
        <Square size={14} /> STOP
      </button>
      <button disabled={!can("ALL_STOP")}
        onClick={() => onAsk({ kind: "ALL_STOP", label: "ALL STOP", detail: "(공정과 무관하게 전부 끔)", danger: true })}
        className="flex items-center gap-1 rounded-xl bg-rose-600 px-3 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-40">
        <OctagonX size={14} /> ALL STOP
      </button>
    </div>
  );

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

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-gray-500">
            {kind === "active" ? "가동 중" : kind === "stopping" ? "정지 중" : kind === "end" ? "끝남" : "대기"}
            {st.runId && <span className="ml-2 font-mono font-normal text-gray-400">run {st.runId.slice(0, 12)}</span>}
          </p>
          <p className={`mt-0.5 truncate text-lg font-bold sm:text-xl ${connected ? "text-gray-900" : "text-gray-400"}`}>
            {stateLabel(bundle, st.procState)}
            <span className="ml-2 align-middle font-mono text-[11px] font-normal text-gray-300">{st.procState}</span>
          </p>
          {step && (
            <p className="mt-1 text-xs text-gray-600">
              블록 <b className="tabular-nums">{step.no}/{step.total}</b>
              {stepType && <> · {stepType}</>}
              {step.label && <> · {step.label}</>}
              {typeof remain === "number" && remain >= 0 && <> · 남은 <b className="tabular-nums">{remain}</b>초</>}
            </p>
          )}
          {st.recipe && (
            <p className="mt-0.5 text-[11px] text-gray-500">
              레시피 {st.recipe.name || "이름 없음"} · 행 {st.recipe.row ?? "-"}/{st.recipe.rows ?? "-"}
              {st.recipe.listActive && " · 리스트 진행 중"}
            </p>
          )}
          {!st.runId && lastRun && (
            <p className="mt-0.5 text-[11px] text-gray-400">
              마지막 공정 {fmtKst(lastRun.startedAt)} · {lastRun.name ?? lastRun.recipeName ?? "이름 없음"} ·{" "}
              {lastRun.result ? RUN_RESULT[lastRun.result] ?? lastRun.result : "끝 기록 없음"}
              {lastRun.reasonCode && ` (${reasonLabel(bundle, lastRun.reasonCode)})`}
            </p>
          )}
          <p className="mt-0.5 text-[11px] text-gray-500">
            히터 {owner ? `${HEATER_OWNER[owner] ?? owner} 소유` : "소유 없음"}
            {st.heater?.handedOver && " · 공정에서 넘겨받음"}
            {st.heater?.gas && st.heater.gas !== "IDLE" && ` · ${GAS_STATE[st.heater.gas] ?? st.heater.gas}`}
            {st.heaterRecipe && ` · 히터 레시피 ${st.heaterRecipe.name ?? ""} ${st.heaterRecipe.step ?? "-"}/${st.heaterRecipe.steps ?? "-"} (${st.heaterRecipe.state ?? ""})`}
          </p>
        </div>
        {stopBar}
      </div>

      {(st.stopping || alarms.length > 0 || Object.keys(left).length > 0) && (
        <div className="mt-2 space-y-1.5">
          {st.stopping && (
            <p className="rounded-lg bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700">
              정지 순서 실행 중 — {st.stopping}
            </p>
          )}
          {alarms.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {alarms.map((a) => (
                <span key={a.ruleId} title={a.since ? `시작 ${fmtKst(a.since)}` : undefined}
                  className="flex items-center gap-1 rounded-lg bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700">
                  <AlertTriangle size={12} /> {a.ruleId}{a.code && ` · ${reasonLabel(bundle, a.code)}`}
                </span>
              ))}
            </div>
          )}
          {Object.keys(left).length > 0 && (
            <p className="rounded-lg bg-amber-50 px-2 py-1 text-[11px] text-amber-700">
              <b>지난 공정이 남긴 출력</b> — {leftText(left)} (STOP 으로 정리)
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
