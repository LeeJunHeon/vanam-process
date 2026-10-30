"use client";

// 챔버12 챔버 한 칸(CH1 또는 CH2) — 위에서부터: 상태(공정 상태·소유자·블록 n/전체·블록 이름·블록 경과·남은 시간·ETA·판 번호·
// 일시정지·알람) + 조작(챔버 STOP·일시정지/재개·블록 건너뛰기·시퀀스 편집·적재 레시피 시작/해제) → 장비 그림 → 장비 값(1초) →
// 공정 목표값(<c>.set.*) → 공정 중 값 수정(챔버K Chk2Adjust 를 이 챔버 인자로) → 이 챔버 로그(챔버K EventFeed).
// 남은 시간 = <c>.proc.remain_s(지금 블록), ETA = eta_remaining_s(공정 끝까지 — 확정 전 null 이면 '—', 웹이 추정하지 않음).
// 건너뛰기·일시정지는 블록 정의(skippable·pausable·pause 뜻 — 묶음 blocks.defs)로 버튼을 막고, 마지막 판단은 장비.
import { AlertTriangle, ListOrdered, Pause, Play, SkipForward, Square } from "lucide-react";
import { BlockCard } from "../chk/Chk2Cards";
import Chk2Adjust from "../chk/Chk2Adjust";
import { EventFeed } from "../chk/Chk2Logs";
import { Card, type Ask } from "../chk/kit";
import { useChk2Mode } from "../chk/mode";
import { reasonLabel, type AdjustState, type StateData } from "../chk/types";
import type { FeedItem } from "../chk/useChk2";
import { fmtKst } from "@/lib/ops2/time";
import Ch12Mimic from "./Ch12Mimic";
import { RgaChart } from "./Ch12Spectra";
import { Btn, CmdForm } from "./Ch12Controls";
import {
  KINDS, blockControl, blockLabel, chArgs, chamberState, clockOrDash, feedChamber, hasKind, isRunning, pickKind, short, stateInfo,
} from "./logic";
import { OWNER_LABEL, asChk, type Ch12Bundle, type Ch12State } from "./types";

type Props = {
  bundle: Ch12Bundle | null; st: Ch12State | null; ch: "ch1" | "ch2"; connected: boolean; plcOk: boolean;
  allowed: (kind: string, key: string) => boolean; canPlc: (target: string) => boolean; pending: Record<string, boolean>;
  onAsk: (a: Ask) => void; feed: FeedItem[]; skewMs: number; mimicNote: string; nowMs: number; onEditSeq: () => void;
};

/** 장비 블록별 크게 볼 값 */
const BIG: Record<string, string[]> = {
  mfc: ["ar_sccm", "o2_sccm", "n2_sccm", "pressure_mtorr"], ig: ["pressure_torr"], dcpulse: ["p_w", "v_v", "i_a"],
  rfpulse: ["fwd_w", "ref_w"], dc: ["dc1_p", "dc1_v", "dc1_i"], rf: ["fwd_w", "ref_w"], stm100: ["thickness_nm", "rate_nm_s"],
  oes: [], rga: [],
};
const FOLD = new Set(["dcpulse", "rfpulse", "stm100", "oes", "rga", "dc", "rf"]);

export default function Ch12Chamber(p: Props) {
  const { bundle, st, ch, connected, plcOk, allowed, onAsk, feed, nowMs } = p;
  const { detail } = useChk2Mode();
  const cs = chamberState(st, ch);
  const snap = st?.snapshot;
  const cdef = bundle?.chambers?.find((c) => c.id === ch);
  const info = stateInfo(bundle, cs?.procState, ch);
  const running = isRunning(bundle, cs);
  const ctl = blockControl(bundle, cs);
  const eng = st?.engines?.[ch];
  // 프리스퍼터 예약 표시(장비 proc.chN web_state.presputter — v1 preSputter_remainigTime_edit·LeftTime_edit·레시피 표시칸)
  const pre = (eng ?? st?.engines?.[`proc.${ch}`])?.presputter as Record<string, unknown> | undefined;
  const label = cdef?.label ?? ch.toUpperCase();
  const can = (kind: string) => allowed(kind, `${kind}@${ch}`);

  const kStop = pickKind(bundle, KINDS.stop);
  const kSkip = pickKind(bundle, KINDS.skip);
  const kPause = pickKind(bundle, KINDS.pause);
  const kResume = hasKind(bundle, KINDS.resume) ? pickKind(bundle, KINDS.resume) : kPause;
  const kEdit = pickKind(bundle, KINDS.edit);
  const kStart = pickKind(bundle, KINDS.start);
  const kClear = pickKind(bundle, KINDS.clear);
  const kErr = pickKind(bundle, KINDS.errClear);
  const paused = cs?.paused === true;
  const step = cs?.step;
  const bname = step?.type ? blockLabel(bundle, step.type) : null;
  const alarms = [...(cs?.alarms ?? []).map((r) => ({ ruleId: r, code: undefined as string | undefined })),
    ...(st?.alarms ?? []).filter((a) => a.chamber === ch && !(cs?.alarms ?? []).includes(a.ruleId))];
  const eta = cs?.etaRemainingS;
  const etaAt = typeof eta === "number" && eta >= 0 ? fmtKst(new Date(nowMs + eta * 1000).toISOString()).slice(6) : null;
  const ask = (a: Ask) => onAsk({ ...a, key: a.key ?? `${a.kind}@${ch}` });

  // 장비 블록(묶음 chambers[].blocks 순서), 두께 모니터는 지원할 때만(CH2 는 히터·두께 칸에서도)
  const blocks = (cdef?.blocks ?? []).map((name) => bundle?.snapshot?.blocks?.find((b) => b.name === name)).filter((b) => !!b);
  const targets = (bundle?.snapshot?.process ?? []).filter((f) => (cdef?.targets ?? []).includes(f.column))
    .filter((f) => snap?.[f.column] !== null && snap?.[f.column] !== undefined);

  // 공정 중 수정 — 챔버K 화면을 이 챔버 값으로(인자에 chamber, 기다림 단위도 챔버별)
  const adjList = Array.isArray(eng?.adjust) ? (eng.adjust as AdjustState[]) : null;
  const adjSt = { procState: running ? "__RUN__" : "IDLE", runId: cs?.runId ?? null, adjust: adjList } as StateData;
  const adjBundle = bundle ? { ...asChk(bundle)!, states: [{ name: "__RUN__", label: "진행", kind: "active" }] } : null;
  const myFeed = feed.filter((e) => feedChamber(e) === ch);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-[11px] font-semibold text-gray-500">
              <span className="rounded bg-gray-900 px-1.5 py-0.5 text-white">{label}</span>
              {info.kind === "active" ? "가동 중" : info.kind === "stopping" ? "정지 중" : "대기"}
              {cs?.owner && <span className="text-gray-400">· 소유 {OWNER_LABEL[cs.owner] ?? cs.owner}</span>}
              {typeof cs?.recipeRev === "number" && cs.recipeRev > 0 && <span className="text-blue-600">· 레시피 판 {cs.recipeRev}</span>}
              {paused && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">일시정지</span>}
            </p>
            <p className={`mt-0.5 truncate text-xl font-bold ${connected ? "text-gray-900" : "text-gray-400"}`}>
              {cs ? (cs.procState === "IDLE" || cs.procState === "idle" || !cs.procState ? "대기 중" : info.label) : "상태 없음"}
              {detail && cs?.procState && <span className="ml-2 align-middle font-mono text-[11px] font-normal text-gray-300">{cs.procState}</span>}
            </p>
            {step && (
              <p className="mt-0.5 text-xs text-gray-600">
                블록 <b className="tabular-nums">{step.no ?? "-"}/{step.total ?? "-"}</b> {bname}
                {step.label && step.label !== bname && <span className="text-gray-500">({step.label})</span>}
                {typeof step.elapsedS === "number" && <span className="text-gray-400"> · 블록 경과 {clockOrDash(step.elapsedS)}</span>}
              </p>
            )}
            {eng?.text && <p className="mt-0.5 truncate text-[11px] text-gray-500">{String(eng.text)}</p>}
            {eng?.error && <p className="mt-0.5 text-[11px] font-semibold text-rose-600">{String(eng.error)}</p>}
            {detail && cs?.runId && <p className="font-mono text-[10px] text-gray-400">run {cs.runId}</p>}
          </div>
          <div className="grid grid-cols-2 gap-x-4 text-right">
            <p><span className="block text-[10px] text-gray-400">남은 시간(블록)</span>
              <span className="text-2xl font-bold tabular-nums text-gray-900">{clockOrDash(cs?.remainS ?? step?.remainS)}</span></p>
            <p title="공정 끝까지 — 장비가 확정하기 전에는 '—'"><span className="block text-[10px] text-gray-400">ETA(공정 끝까지)</span>
              <span className="text-2xl font-bold tabular-nums text-blue-700">{clockOrDash(eta)}</span>
              <span className="block text-[10px] text-gray-400">{etaAt ? `끝 예정 ${etaAt}` : "확정 전"}</span></p>
          </div>
        </div>
        {alarms.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {alarms.map((a) => (
              <span key={a.ruleId} className="flex items-center gap-1 rounded-lg bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700">
                <AlertTriangle size={12} /> {a.code ? reasonLabel(asChk(bundle), a.code) : a.ruleId}
                {detail && <span className="font-mono font-normal">{a.ruleId}</span>}
              </span>
            ))}
          </div>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-gray-50 pt-2">
          <Btn tone="rose" disabled={!can(kStop)} onClick={() => ask({ kind: kStop, label: `${label} STOP`, stop: true,
            args: chArgs(bundle, kStop, ch), note: `${label} 공정을 정지 순서대로 멈춥니다(끝날 때 파워 끄기는 빠지지 않습니다). 다른 챔버는 그대로입니다.` })}>
            <Square size={13} /> {label} STOP
          </Btn>
          {paused ? (
            <Btn tone="amber" disabled={!running || !can(kResume)} onClick={() => ask({ kind: kResume, label: `${label} 재개`,
              args: chArgs(bundle, kResume, ch, { on: false }) })}>
              <Play size={13} /> 재개
            </Btn>
          ) : (
            <Btn tone="amber" disabled={!running || !ctl.pause || !can(kPause)}
              title={ctl.pause ? ctl.pauseText || "일시정지" : ctl.why}
              onClick={() => ask({ kind: kPause, label: `${label} 일시정지`, detail: bname ?? "",
                args: chArgs(bundle, kPause, ch, { on: true }), lines: [ctl.pauseText ? `이 블록에서 일시정지: ${ctl.pauseText}` : "지금 블록을 멈춥니다"] })}>
              <Pause size={13} /> 일시정지
            </Btn>
          )}
          <Btn disabled={!running || !ctl.skip || !can(kSkip)} title={ctl.skip ? `정리: ${ctl.def?.skipCleanup?.join(", ") || "없음"}` : ctl.why}
            onClick={() => ask({ kind: kSkip, label: `${label} 블록 건너뛰기`, detail: bname ?? "", red: true, args: chArgs(bundle, kSkip, ch),
              lines: [`지금 블록 ${step?.no ?? "-"} ${bname ?? ""} 을(를) 끝내고 다음 블록으로`,
                      `정리: ${ctl.def?.skipCleanup?.join(", ") || "없음"}`] })}>
            <SkipForward size={13} /> 건너뛰기
          </Btn>
          <Btn disabled={!running || !hasKind(bundle, KINDS.edit)} onClick={p.onEditSeq}
            title={hasKind(bundle, KINDS.edit) ? "아직 시작 안 한 블록만 추가·삭제·순서 변경" : "장비가 시퀀스 편집 명령을 아직 내지 않음"}>
            <ListOrdered size={13} /> 시퀀스 편집
          </Btn>
          {!running && hasKind(bundle, KINDS.start) && (
            <Btn tone="roseSolid" disabled={!can(kStart)} onClick={() => ask({ kind: kStart, label: `${label} 공정 시작`, red: true,
              args: chArgs(bundle, kStart, ch), lines: [`${label} 에 적재된 레시피(큐)를 시작합니다 — 적재가 없으면 장비가 거부(NO_RECIPE)`] })}>
              <Play size={13} /> 공정 시작
            </Btn>
          )}
          {!running && hasKind(bundle, KINDS.clear) && (
            <Btn small disabled={!can(kClear)} onClick={() => ask({ kind: kClear, label: `${label} 적재 해제`, args: chArgs(bundle, kClear, ch) })}>
              적재 해제
            </Btn>
          )}
          {hasKind(bundle, KINDS.errClear) && (
            <Btn small disabled={!can(kErr)} onClick={() => ask({ kind: kErr, label: `${label} 오류 표시 해제`, args: chArgs(bundle, kErr, ch) })}>
              오류 해제
            </Btn>
          )}
          {running && !ctl.skip && !ctl.pause && step?.type && <span className="text-[10px] text-gray-400">{ctl.why}</span>}
          {detail && <span className="ml-auto font-mono text-[10px] text-gray-300">{kStop}·{kPause}·{kSkip}·{kEdit}</span>}
        </div>
        {hasKind(bundle, KINDS.preReserve) && (
          <div className="mt-2 flex flex-wrap items-end gap-2 border-t border-gray-50 pt-2">
            <span className="text-[11px] font-semibold text-gray-500">프리스퍼터 예약</span>
            <CmdForm bundle={bundle} kind={pickKind(bundle, KINDS.preReserve)} chamber={ch} label="예약" can={can} onAsk={ask} />
            <CmdForm bundle={bundle} kind={pickKind(bundle, KINDS.preCancel)} chamber={ch} label="예약 취소" can={can} onAsk={ask} />
            {pre && (
              <span className="text-[11px] text-gray-500">
                {short(pre.status_text)} · 남은 {short(pre.left_text)} · 레시피 {short(pre.recipe_display)}
              </span>
            )}
          </div>
        )}
      </Card>

      <Ch12Mimic bundle={bundle} snapshot={snap} ch={ch} plcOk={plcOk} canPress={p.canPlc} pending={p.pending} onAsk={onAsk} note={p.mimicNote} />

      <div className="grid grid-cols-1 gap-3 2xl:grid-cols-2">
        {blocks.map((b) => {
          const kind = b.name.split(".").pop() ?? "";
          return (
            <BlockCard key={b.name} def={b} snap={snap} link={st?.links?.[b.name]} big={(BIG[kind] ?? []).filter((n) => b.fields.some((f) => f.name === n))}
              foldable={FOLD.has(kind)} />
          );
        })}
      </div>

      <RgaChart feed={feed} ch={ch} />

      {targets.length > 0 && (
        <Card title="공정 목표값" right={<span className="text-[10px] text-gray-400">그 시각 엔진이 장비에 요청한 값</span>}>
          <div className="grid grid-cols-2 gap-x-4 sm:grid-cols-3">
            {targets.map((f) => (
              <div key={f.column} className="flex items-baseline justify-between gap-2 py-0.5 text-xs" title={detail ? f.column : undefined}>
                <span className="truncate text-gray-400">{f.label.replace(/^(CH\d|플라즈마 클리닝) /, "")}</span>
                <span className="font-semibold tabular-nums text-gray-900">{short(snap?.[f.column])}<span className="ml-0.5 text-[10px] font-normal text-gray-400">{f.unit}</span></span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Chk2Adjust bundle={adjBundle} st={adjSt} skewMs={p.skewMs}
        canKey={(kind, key) => allowed(kind, `${key}@${ch}`)}
        onAsk={(a) => onAsk({ ...a, key: `${a.key ?? a.kind}@${ch}`, label: `${label} ${a.label}`,
                               args: chArgs(bundle, a.kind, ch, a.args ?? {}) })} />

      <EventFeed bundle={asChk(bundle)} feed={myFeed} />
    </div>
  );
}
