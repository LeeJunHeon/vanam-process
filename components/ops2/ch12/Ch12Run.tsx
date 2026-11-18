"use client";

// 챔버12 운전 탭(2026-11-18 — 챔버K Chk2Run 구성). CH1·CH2 를 나란히(1280 이상 두 열), 챔버마다 위에서부터:
//   상태·조작(공정 상태·블록·남은 시간·ETA·엔진 상태 글 + STOP·공정 시작·적재 해제·오류 해제, 웹은 '다음 공정' 레시피 고르기·적재) →
//   공정 순서(블록 목록 — 끝남·지금·남음, 건너뛰기·일시정지/재개·시퀀스 편집) → 공정 중 값 바꾸기(챔버K Chk2Adjust) → 주요 값(칸마다 목표·큰 값·막대) →
//   추세(챔버K Chk2Trend — 챔버 열) → 장비 카드(묶음 블록 순서, 꺼진 장비는 접힘)·OES/RGA·공정 목표값 → 알림·로그(이 챔버 평소 보기 줄).
// 그 아래: CH2 히터·두께 · 플라즈마 클리닝 · TSP · 프리스퍼터 예약 · 로봇 연결 · 장비 공통 조작 · 장비 응답 시간(노트북 화면은 + 장비 폴더 레시피).
// 1366×768 에서 상태 띠 + 탭 + 두 챔버 상태·조작 칸이 첫 화면에 보이게 조작 칸을 맨 위에, 줄 수를 적게 둔다.
import { useEffect, useMemo, useState } from "react";
import { ListOrdered, Pause, Play, SkipForward, Square, Upload, X } from "lucide-react";
import { FS, Btn, Card, Chip, Empty, KV, RangeBar, Tile, Val, type Ask } from "../chk/kit";
import Chk2Adjust from "../chk/Chk2Adjust";
import Chk2Trend, { type TrendDef } from "../chk/Chk2Trend";
import { useChk2Mode } from "../chk/mode";
import { fieldText } from "../chk/text";
import { scaleMax } from "../chk/runview";
import { reasonLabel, type AdjustState, type FieldDef, type StateData } from "../chk/types";
import type { FeedItem, SendResult, TrendPt } from "../chk/useChk2";
import type { Notice } from "../chk/kit";
import type { RecipeFull, RecipeItem } from "../chk/useRecipes";
import { BlockCard } from "./BlockCard";
import { ChamberLog } from "./Ch12Logs";
import { CommonOps, HeaterThicknessPanel, PcPanel, PresputterPanel, RobotPanel, TspPanel, type LockFn } from "./Ch12Aux";
import { hasRowContent, loadPayload, rowLine } from "./Ch12Recipes";
import { Spectra } from "./Ch12Spectra";
import Ch12Timing from "./Ch12Timing";
import { LocalFiles } from "./Ch12LocalFiles";
import {
  KINDS, blockControl, blockLabel, chArgs, chamberState, clockOrDash, engineOf, hasKind, isRunning, pickKind, short, startedUpto, stateInfo,
} from "./logic";
import { OWNER_LABEL, asChk, type Ch12Bundle, type Ch12State } from "./types";
import type { Row } from "@/lib/ops2/ch12/recipe";
import { fmtKst } from "@/lib/ops2/time";

type Ch = "ch1" | "ch2";
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const fieldOf = (b: Ch12Bundle | null, col: string): FieldDef | undefined =>
  b?.snapshot?.blocks?.flatMap((x) => x.fields).find((f) => f.column === col);

// ───────────── 추세 열(챔버별 — useChk2 trendCols·Chk2Trend defs, 모듈 상수라 값이 바뀌지 않는다) ─────────────
const gasLines = (ch: Ch): [string, string, string | null][] =>
  (ch === "ch1" ? ["ar", "o2"] : ["ar", "o2", "n2"]).map((g) => [`${ch}.mfc.${g}_sccm`, `${{ ar: "Ar", o2: "O₂", n2: "N₂" }[g]} 유량`, `${ch}.set.${g}_sccm`]);
export const TREND_DEFS12: Record<Ch, TrendDef[]> = {
  ch1: [
    { title: "압력", unit: "mTorr", lines: [["ch1.mfc.pressure_mtorr", "챔버 압력", "ch1.set.pressure_mtorr"]] },
    { title: "밸브 위치", unit: "%", lines: [["ch1.mfc.valve_pct", "MFC 밸브 위치", null]] },
    { title: "가스 유량", unit: "sccm", lines: gasLines("ch1") },
    { title: "파워", unit: "W", lines: [["ch1.dcpulse.p_w", "DC Pulse", "ch1.set.dcpulse_w"], ["ch1.rfpulse.fwd_w", "RF Pulse", "ch1.set.rfpulse_w"]] },
  ],
  ch2: [
    { title: "압력", unit: "mTorr", lines: [["ch2.mfc.pressure_mtorr", "챔버 압력", "ch2.set.pressure_mtorr"]] },
    { title: "밸브 위치", unit: "%", lines: [["ch2.mfc.valve_pct", "MFC 밸브 위치", null]] },
    { title: "가스 유량", unit: "sccm", lines: gasLines("ch2") },
    { title: "파워", unit: "W", lines: [["ch2.dcpulse.p_w", "DC Pulse", "ch2.set.dcpulse_w"], ["ch2.rfpulse.fwd_w", "RF Pulse", "ch2.set.rfpulse_w"],
      ["ch2.dc.dc1_p", "DC Power", "ch2.set.dc_w"], ["ch2.rf.fwd_w", "RF Power", "ch2.set.rf_w"]] },
    { title: "히터 온도", unit: "°C", lines: [["ch2.heater.pv", "히터", "ch2.heater.sv"]] },
  ],
};
export const TREND_COLS12: readonly string[] = Object.values(TREND_DEFS12).flatMap((ds) => ds.flatMap((d) => d.lines.flatMap(([a, , b]) => (b ? [a, b] : [a]))));

// ───────────── 주요 값 ─────────────
type KeyDef = { label: string; value: string; target: string | null; limit?: string; bar: boolean };
const keyDefs = (ch: Ch): KeyDef[] => [
  { label: "챔버 압력", value: `${ch}.mfc.pressure_mtorr`, target: `${ch}.set.pressure_mtorr`, bar: true },
  ...(ch === "ch1" ? ["ar", "o2"] : ["ar", "o2", "n2"]).map((g) => ({
    label: `${{ ar: "Ar", o2: "O₂", n2: "N₂" }[g]} 유량`, value: `${ch}.mfc.${g}_sccm`, target: `${ch}.set.${g}_sccm`, bar: true })),
  { label: "DC Pulse", value: `${ch}.dcpulse.p_w`, target: `${ch}.set.dcpulse_w`, bar: true },
  { label: "RF Pulse", value: `${ch}.rfpulse.fwd_w`, target: `${ch}.set.rfpulse_w`, bar: true },
  ...(ch === "ch2" ? [
    { label: "DC Power", value: "ch2.dc.dc1_p", target: "ch2.set.dc_w", bar: true },
    { label: "RF Power", value: "ch2.rf.fwd_w", target: "ch2.set.rf_w", bar: true },
    { label: "히터", value: "ch2.heater.pv", target: "ch2.heater.sv", limit: "CH2_HEATER_MAX_TEMP", bar: true },
    { label: "두께", value: "ch2.thk.eff_nm", target: "ch2.thk.target_nm", bar: true },
  ] : []),
  { label: "이온 게이지", value: `${ch}.ig.pressure_torr`, target: null, bar: false },
];

function KeyTile({ d, bundle, snap }: { d: KeyDef; bundle: Ch12Bundle | null; snap?: Record<string, unknown> }) {
  const f = fieldOf(bundle, d.value), tf = d.target ? fieldOf(bundle, d.target) ?? (bundle?.snapshot?.process ?? []).find((x) => x.column === d.target) : undefined;
  const v = num(snap?.[d.value]), t = d.target ? num(snap?.[d.target]) : null;
  const unit = f?.unit ?? "";
  const txt = f ? fieldText(f, snap?.[d.value], snap, bundle?.snapshot?.blocks) : { text: "", alt: null, warn: false };
  const max = scaleMax(t, v, null);
  return (
    <Tile className="p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className={`truncate ${FS.body} font-semibold text-[#1B1F24]`}>{d.label}</span>
        {t !== null && <span className={`shrink-0 ${FS.small} text-[#5B6470]`}>목표 {short(t)} {tf?.unit ?? unit}</span>}
      </div>
      <div className="mt-1"><Val text={txt.text} unit={unit} size="big" alt={txt.alt} altWarn={txt.warn} /></div>
      {d.bar ? <div className="mt-1"><RangeBar value={v} target={t} band={null} max={max} label={`${d.label} 막대`} /></div>
        : <p className={`mt-1 ${FS.small} text-[#8A929D]`}>로그 값 — 막대 없음</p>}
    </Tile>
  );
}

function KeyValues({ bundle, st, ch, running }: { bundle: Ch12Bundle | null; st: Ch12State | null; ch: Ch; running: boolean }) {
  const snap = st?.snapshot;
  const supports = bundle?.chambers?.find((c) => c.id === ch)?.supports ?? null;
  const all = keyDefs(ch).filter((d) => !!fieldOf(bundle, d.value));
  // 공정 중 = 이번 공정이 목표를 준 장비(+ 압력·이온 게이지), 대기 = 지원 장비(지원 모르면 값이 있는 것)
  const sup = (d: KeyDef) => {
    if (!supports) return num(snap?.[d.value]) !== null;
    if (d.value.includes(".dcpulse.")) return supports.dcp !== false;
    if (d.value.includes(".rfpulse.")) return supports.rfp !== false;
    if (d.value === "ch2.dc.dc1_p") return supports.dc !== false;
    if (d.value === "ch2.rf.fwd_w") return supports.rf !== false;
    if (d.value === "ch2.heater.pv") return supports.heater !== false;
    if (d.value === "ch2.thk.eff_nm") return supports.thickness !== false;
    return true;
  };
  const always = (d: KeyDef) => d.value.endsWith(".pressure_mtorr") || d.value.endsWith(".pressure_torr");
  const shown = all.filter((d) => (running ? always(d) || (d.target !== null && num(snap?.[d.target]) !== null) : sup(d)));
  return (
    <Card title="주요 값" right={<span className={`${FS.small} text-[#5B6470]`}>{running ? "이번 공정이 쓰는 장비" : "지원 장비"}</span>}>
      {shown.length ? (
        <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">{shown.map((d) => <KeyTile key={d.value} d={d} bundle={bundle} snap={snap} />)}</div>
      ) : <Empty>값을 아직 받지 못했습니다</Empty>}
      <p className={`mt-2 ${FS.small} text-[#5B6470]`}>막대: ▲ = 목표 · 세로선 = 지금</p>
    </Card>
  );
}

// ───────────── 공정 순서 ─────────────
type EngBlock = { i?: number; type?: string; label?: string; params?: Record<string, unknown> };

function Seq({ bundle, st, ch, lock, onAsk, onEditSeq, label }: {
  bundle: Ch12Bundle | null; st: Ch12State | null; ch: Ch; lock: LockFn; onAsk: (a: Ask) => void; onEditSeq: () => void; label: string;
}) {
  const { detail } = useChk2Mode();
  const cs = chamberState(st, ch);
  const eng = engineOf(st, ch);
  const running = isRunning(bundle, cs);
  const ctl = blockControl(bundle, cs);
  const blocks = (Array.isArray(eng?.blocks) ? eng.blocks : []) as EngBlock[];
  const upto = startedUpto(st, ch, blocks.length);
  const cur = typeof eng?.cur_block === "number" ? eng.cur_block : upto - 1;
  const paused = cs?.paused === true;
  const step = cs?.step;
  const bname = step?.type ? blockLabel(bundle, step.type) : "";
  const kPause = pickKind(bundle, KINDS.pause), kResume = hasKind(bundle, KINDS.resume) ? pickKind(bundle, KINDS.resume) : kPause;
  const kSkip = pickKind(bundle, KINDS.skip), kEdit = pickKind(bundle, KINDS.edit);
  const key = (k: string) => `${k}@${ch}`;
  const ask = (a: Ask) => onAsk({ ...a, key: a.key ?? key(a.kind) });
  return (
    <Card title={<><ListOrdered size={15} /> 공정 순서</>} right={running && <span className={`${FS.small} text-[#5B6470]`}>시작한 블록 {upto}/{blocks.length}</span>}>
      <div className="mb-2 flex flex-wrap gap-2">
        {paused ? (
          <Btn kind="primary" lock={lock(kResume, key(kResume)) ?? (running ? null : "공정 중이 아님")}
            onClick={() => ask({ kind: kResume, label: `${label} 재개`, args: chArgs(bundle, kResume, ch, { on: false }) })}><Play size={14} /> 재개</Btn>
        ) : (
          <Btn lock={lock(kPause, key(kPause)) ?? (!running ? "공정 중이 아님" : !ctl.pause ? ctl.why || "멈출 수 없는 블록" : null)}
            onClick={() => ask({ kind: kPause, label: `${label} 일시정지`, detail: bname, args: chArgs(bundle, kPause, ch, { on: true }),
              lines: [ctl.pauseText ? `이 블록에서 일시정지: ${ctl.pauseText}` : "지금 블록을 멈춥니다"] })}><Pause size={14} /> 일시정지</Btn>
        )}
        <Btn lock={lock(kSkip, key(kSkip)) ?? (!running ? "공정 중이 아님" : !ctl.skip ? ctl.why || "건너뛸 수 없는 블록" : null)}
          onClick={() => ask({ kind: kSkip, label: `${label} 블록 건너뛰기`, detail: bname, red: true, args: chArgs(bundle, kSkip, ch),
            lines: [`지금 블록 ${step?.no ?? "-"} ${bname} 을(를) 끝내고 다음 블록으로`, `정리: ${ctl.def?.skipCleanup?.join(", ") || "없음"}`] })}>
          <SkipForward size={14} /> 건너뛰기
        </Btn>
        <Btn lock={lock(kEdit, key(kEdit)) ?? (!running ? "공정 중이 아님" : null)} onClick={onEditSeq}
          title="아직 시작 안 한 블록만 추가·삭제·순서 변경"><ListOrdered size={14} /> 시퀀스 편집</Btn>
      </div>
      {!blocks.length ? <Empty>{running ? "블록 목록을 아직 받지 못했습니다" : "공정 중이 아닙니다 — 시작하면 블록 순서가 보입니다"}</Empty> : (
        <ol className="max-h-72 space-y-1 overflow-y-auto pr-1">
          {blocks.map((b, i) => {
            const done = running && i < cur, now = running && i === cur;
            return (
              <li key={`${i}-${b.type}`} className={`flex items-baseline gap-2 rounded-[8px] px-2 py-1 ${FS.body} ${
                now ? "bg-[#E8EEFC] font-semibold text-[#1B1F24]" : done ? "text-[#8A929D]" : "text-[#1B1F24]"}`}>
                <span className="w-6 shrink-0 text-right tabular-nums text-[#5B6470]">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate">{blockLabel(bundle, b.type)}{b.label && b.label !== b.type && b.label !== blockLabel(bundle, b.type) ? ` · ${b.label}` : ""}</span>
                {now && <span className="shrink-0 tabular-nums text-[#133A7C]">{paused ? "멈춤" : `남은 ${clockOrDash(cs?.remainS ?? step?.remainS)}`}</span>}
                {done && <span className={`shrink-0 ${FS.small}`}>끝남</span>}
                {detail && <span className={`shrink-0 font-mono ${FS.small} text-[#8A929D]`}>{b.type}</span>}
              </li>
            );
          })}
        </ol>
      )}
      {running && !ctl.skip && !ctl.pause && step?.type && <p className={`mt-1 ${FS.small} text-[#5B6470]`}>{ctl.why}</p>}
    </Card>
  );
}

// ───────────── 챔버 칸 ─────────────
export type ChamberProps = {
  bundle: Ch12Bundle | null; st: Ch12State | null; ch: Ch; connected: boolean; lock: LockFn; onAsk: (a: Ask) => void;
  feed: FeedItem[]; trend: TrendPt[]; nowMs: number; skewMs: number; equipment: string; local: boolean;
  recipes: RecipeItem[] | null; getRecipe?: (id: string) => Promise<RecipeFull | null>; onEditSeq: () => void; onLog?: () => void;
};

function NextRecipe({ bundle, ch, recipes, getRecipe, lock, onAsk, label }: {
  bundle: Ch12Bundle | null; ch: Ch; recipes: RecipeItem[]; getRecipe?: (id: string) => Promise<RecipeFull | null>; lock: LockFn;
  onAsk: (a: Ask) => void; label: string;
}) {
  const [id, setId] = useState("");
  const [full, setFull] = useState<RecipeFull | null>(null);
  useEffect(() => {
    if (!id || !getRecipe) return;
    let off = false;
    void getRecipe(id).then((r) => { if (!off) setFull(r); });
    return () => { off = true; };
  }, [id, getRecipe]);
  const kLoad = pickKind(bundle, KINDS.load);
  const list = recipes.filter((r) => r.kind === (ch as unknown as RecipeItem["kind"]));
  const item = list.find((r) => r.id === id);
  const rows = (full && full.id === id ? (full.rows as Row[]).filter(hasRowContent) : []);
  const p = full && full.id === id ? loadPayload(rows, full.name) : null;
  const why = !id ? "레시피를 고르세요" : !p ? "레시피를 읽는 중" : item?.check?.errors ? `웹 검사 오류 ${item.check.errors}개 — 레시피 탭에서 고친 뒤` : !rows.length ? "행 없음" : p.why || null;
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-[#E3E6EA] pt-3">
      <select value={id} onChange={(e) => { setId(e.target.value); setFull(null); }} aria-label={`${label} 공정 레시피 고르기`}
        className={`h-10 min-w-0 flex-1 rounded-[10px] border border-[#D9DDE3] bg-white px-2 ${FS.body}`}>
        <option value="">{label} 공정 레시피 고르기…</option>
        {list.map((r) => <option key={r.id} value={r.id}>{r.name}{r.check?.errors ? ` (오류 ${r.check.errors})` : ""}</option>)}
      </select>
      <Btn kind="primary" lock={lock(kLoad, `${kLoad}@${ch}`) ?? why}
        onClick={() => p && full && onAsk({ kind: kLoad, key: `${kLoad}@${ch}`, label: `${label} 레시피 적재`, detail: `'${full.name}'`,
          args: chArgs(bundle, kLoad, ch, p.args), lines: [`${rows.length}행`, ...rows.slice(0, 3).map((r) => (Array.isArray(r.blocks) ? `블록 ${(r.blocks as unknown[]).length}개` : rowLine(r)))],
          note: "장비에 행 목록을 올립니다(장비가 다시 검사). 시작은 '공정 시작'." })}>
        <Upload size={14} /> 적재
      </Btn>
    </div>
  );
}

export function ChamberRun(p: ChamberProps) {
  const { bundle, st, ch, connected, lock, onAsk, feed, nowMs } = p;
  const { detail } = useChk2Mode();
  const cs = chamberState(st, ch);
  const cdef = bundle?.chambers?.find((c) => c.id === ch);
  const info = stateInfo(bundle, cs?.procState, ch);
  const running = isRunning(bundle, cs);
  const eng = engineOf(st, ch);
  const snap = st?.snapshot;
  const label = cdef?.label ?? ch.toUpperCase();
  const key = (k: string) => `${k}@${ch}`;
  const ask = (a: Ask) => onAsk({ ...a, key: a.key ?? key(a.kind) });
  const kStop = pickKind(bundle, KINDS.stop), kStart = pickKind(bundle, KINDS.start), kClear = pickKind(bundle, KINDS.clear), kErr = pickKind(bundle, KINDS.errClear);
  const step = cs?.step;
  const eta = cs?.etaRemainingS;
  const etaAt = typeof eta === "number" && eta >= 0 ? new Date(nowMs + eta * 1000).toISOString() : null;
  const alarms = [...(cs?.alarms ?? []).map((r) => ({ ruleId: r, text: r })),
    ...(st?.alarms ?? []).filter((a) => a.chamber === ch && !(cs?.alarms ?? []).includes(a.ruleId))
      .map((a) => ({ ruleId: a.ruleId, text: a.code ? reasonLabel(asChk(bundle), a.code) : a.ruleId }))];
  const blocks = (cdef?.blocks ?? []).map((n) => bundle?.snapshot?.blocks?.find((b) => b.name === n)).filter((b) => !!b)
    .filter((b) => !(ch === "ch2" && ["ch2.heater", "ch2.thk", "ch2.stm100"].includes(b.name)));          // CH2 히터·두께는 아래 칸
  const targets = (bundle?.snapshot?.process ?? []).filter((f) => (cdef?.targets ?? []).includes(f.column))
    .filter((f) => snap?.[f.column] !== null && snap?.[f.column] !== undefined);
  // 공정 중 값 바꾸기 — 챔버K 화면을 이 챔버 값으로(인자에 ch, 기다림 단위도 챔버별)
  const adjList = Array.isArray(eng?.adjust) ? (eng.adjust as AdjustState[]) : null;
  const adjSt = { procState: running ? "__RUN__" : "IDLE", runId: cs?.runId ?? null, adjust: adjList } as StateData;
  const adjBundle = useMemo(() => (bundle ? { ...asChk(bundle)!, states: [{ name: "__RUN__", label: "진행", kind: "active" }] } : null), [bundle]);
  const queue = eng?.queue as { index?: number; total?: number; mode?: boolean } | null | undefined;
  const FOLD = new Set(["dcpulse", "rfpulse", "stm100", "oes", "rga", "dc", "rf"]);
  const BIG: Record<string, string[]> = { mfc: ["ar_sccm", "o2_sccm", "n2_sccm", "pressure_mtorr"], ig: ["pressure_torr"], dcpulse: ["p_w", "v_v", "i_a"],
    rfpulse: ["fwd_w", "ref_w"], dc: ["dc1_p", "dc1_v", "dc1_i"], rf: ["fwd_w", "ref_w"] };
  return (
    <div className="flex min-w-0 flex-col gap-3" data-chamber={ch}>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <div className="min-w-0 flex-1">
            <p className={`flex flex-wrap items-center gap-1.5 ${FS.small} font-semibold text-[#5B6470]`}>
              <span className="rounded bg-[#3A424D] px-1.5 py-px text-white">{label}</span>
              {info.kind === "active" ? "가동 중" : info.kind === "stopping" ? "정지 중" : "대기"}
              {cs?.owner && <span>· 소유 {OWNER_LABEL[cs.owner] ?? cs.owner}</span>}
              {typeof cs?.recipeRev === "number" && cs.recipeRev > 0 && <span>· 레시피 판 {cs.recipeRev}</span>}
              {cs?.paused && <Chip tone="warn"><Pause size={11} />일시정지</Chip>}
            </p>
            <p className={`mt-0.5 truncate ${FS.title} font-bold ${connected ? "text-[#1B1F24]" : "text-[#8A929D]"}`}>
              {cs ? (cs.procState === "IDLE" || cs.procState === "idle" || !cs.procState ? "대기 중" : info.label) : "상태 없음"}
              {detail && cs?.procState && <span className={`ml-2 align-middle font-mono ${FS.small} font-normal text-[#8A929D]`}>{cs.procState}</span>}
            </p>
            {running && step && (
              <p className={`${FS.body} text-[#1B1F24]`}>
                <span className="tabular-nums text-[#5B6470]">블록 {step.no ?? "-"}/{step.total ?? "-"}</span> <b>{blockLabel(bundle, step.type)}</b>
                {typeof step.elapsedS === "number" && <span className="text-[#5B6470]"> · 블록 경과 {clockOrDash(step.elapsedS)}</span>}
              </p>
            )}
            {eng?.text && <p className={`truncate ${FS.body} text-[#5B6470]`}>{String(eng.text)}</p>}
            {eng?.error && <p className={`${FS.body} font-semibold text-[#B42318]`}>{String(eng.error)}</p>}
            <p className={`${FS.body} text-[#5B6470]`}>
              {eng?.recipe_name ? <>적재 <b className="text-[#1B1F24]">{String(eng.recipe_name)}</b>
                {queue?.mode === true || (queue?.total ?? 0) > 1 ? ` · ${typeof queue?.index === "number" ? queue.index + 1 : "-"}/${queue?.total ?? "-"}행` : ""}</>
                : running ? "화면 값으로 시작한 공정(적재 레시피 없음)" : "적재된 레시피 없음"}
            </p>
            {detail && cs?.runId && <p className={`font-mono ${FS.small} text-[#8A929D]`}>run {cs.runId}</p>}
          </div>
          <div className="grid grid-cols-2 gap-x-4 text-right">
            <p><span className={`block ${FS.small} text-[#5B6470]`}>남은 시간(블록)</span>
              <span className={`${FS.big} font-bold text-[#133A7C]`}>{clockOrDash(cs?.remainS ?? step?.remainS)}</span></p>
            <p title="공정 끝까지 — 장비가 확정하기 전에는 '—'"><span className={`block ${FS.small} text-[#5B6470]`}>ETA(공정 끝까지)</span>
              <span className={`${FS.big} font-bold text-[#133A7C]`}>{clockOrDash(eta)}</span>
              <span className={`block ${FS.small} text-[#5B6470]`}>{etaAt ? `끝 예정 ${fmtKst(etaAt).slice(-8, -3)}` : running ? "확정 전" : ""}</span></p>
          </div>
        </div>
        {alarms.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{alarms.map((a) => <Chip key={a.ruleId} tone="alarm">{a.text}</Chip>)}</div>}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Btn size="lg" kind="danger" lock={lock(kStop, key(kStop))} onClick={() => ask({ kind: kStop, label: `${label} STOP`, stop: true,
            args: chArgs(bundle, kStop, ch), note: `${label} 공정을 정지 순서대로 멈춥니다(끝날 때 파워 끄기는 빠지지 않습니다). 다른 챔버는 그대로입니다.` })}>
            <Square size={14} /> {label} STOP
          </Btn>
          {!running && hasKind(bundle, KINDS.start) && (
            <Btn size="lg" kind="dangerSolid" lock={lock(kStart, key(kStart))} onClick={() => ask({ kind: kStart, label: `${label} 공정 시작`, red: true,
              args: chArgs(bundle, kStart, ch), lines: [eng?.recipe_name ? `적재된 '${String(eng.recipe_name)}' 을(를) 시작합니다` : "적재된 레시피가 없으면 장비가 거부합니다"],
              note: "공정을 시작합니다 — 가스·파워·셔터가 움직입니다." })}>
              <Play size={14} /> 공정 시작
            </Btn>
          )}
          {!running && hasKind(bundle, KINDS.clear) && (
            <Btn lock={lock(kClear, key(kClear))} onClick={() => ask({ kind: kClear, label: `${label} 적재 해제`, args: chArgs(bundle, kClear, ch),
              note: "장비에 올린 행 목록을 내립니다." })}><X size={14} /> 적재 해제</Btn>
          )}
          {hasKind(bundle, KINDS.errClear) && (
            <Btn lock={lock(kErr, key(kErr))} onClick={() => ask({ kind: kErr, label: `${label} 오류 표시 해제`, args: chArgs(bundle, kErr, ch) })}>오류 해제</Btn>
          )}
        </div>
        {!running && p.recipes && <NextRecipe bundle={bundle} ch={ch} recipes={p.recipes} getRecipe={p.getRecipe} lock={lock} onAsk={onAsk} label={label} />}
      </Card>

      <Seq bundle={bundle} st={st} ch={ch} lock={lock} onAsk={onAsk} onEditSeq={p.onEditSeq} label={label} />

      <Chk2Adjust bundle={adjBundle} st={adjSt} skewMs={p.skewMs} canKey={(kind, k) => !lock(kind, `${k}@${ch}`)}
        onAsk={(a) => onAsk({ ...a, key: `${a.key ?? a.kind}@${ch}`, label: `${label} ${a.label}`, args: chArgs(bundle, a.kind, ch, a.args ?? {}) })} />

      <KeyValues bundle={bundle} st={st} ch={ch} running={running} />

      <Chk2Trend trend={p.trend} equipment={p.equipment} runId={cs?.runId ?? null} local={p.local} nowMs={nowMs}
        defs={TREND_DEFS12[ch]} title={`추세 — ${label}`} />

      <div className="grid grid-cols-1 gap-3">
        {blocks.map((b) => {
          const kind = b.name.split(".").pop() ?? "";
          const gases = cdef?.gases ?? [];
          const big = (BIG[kind] ?? []).filter((n) => b.fields.some((f) => f.name === n))
            .filter((n) => kind !== "mfc" || !/_sccm$/.test(n) || gases.includes(n.split("_")[0]));        // 그 챔버 가스 라인만
          return <BlockCard key={b.name} def={b} snap={snap} link={st?.links?.[b.name]} big={big} foldable={FOLD.has(kind)} />;
        })}
      </div>
      <Spectra feed={feed} st={st} ch={ch} />
      {targets.length > 0 && (
        <Card title="공정 목표값" right={<span className={`${FS.small} text-[#5B6470]`}>그 시각 엔진이 장비에 요청한 값</span>}>
          <div className="grid grid-cols-2 gap-x-4 sm:grid-cols-3">
            {targets.map((f) => (
              <KV key={f.column} k={f.label.replace(/^(CH\d|플라즈마 클리닝) /, "")} title={detail ? f.column : undefined}>
                <b className="tabular-nums text-[#133A7C]">{short(snap?.[f.column])}</b><span className={`ml-1 ${FS.small} text-[#5B6470]`}>{f.unit}</span>
              </KV>
            ))}
          </div>
        </Card>
      )}
      <ChamberLog bundle={bundle} feed={feed} ch={ch} alarms={alarms} onLog={p.onLog} />
    </div>
  );
}

// ───────────── 운전 탭 ─────────────
export type RunProps = Omit<ChamberProps, "ch" | "onEditSeq"> & {
  plcOk: boolean; onEditSeq: (ch: Ch) => void; pcRecipes: RecipeItem[] | null;
  getRow?: (id: string) => Promise<Record<string, unknown> | null>;
  send: (kind: string, args: Record<string, unknown>, label?: string) => Promise<SendResult>;
  notify: (n: Omit<Notice, "id" | "at">) => void;
  localCan?: (kind: string) => boolean;
};

export default function Ch12Run(p: RunProps) {
  const { bundle, st, lock, onAsk, feed, nowMs } = p;
  const cmn = { bundle, st, lock, onAsk };
  return (
    <div className="space-y-3">
      <div className="grid items-start gap-3 min-[1280px]:grid-cols-2">
        {(["ch1", "ch2"] as const).map((ch) => <ChamberRun key={ch} {...p} ch={ch} onEditSeq={() => p.onEditSeq(ch)} />)}
      </div>
      <div className="grid items-start gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        <HeaterThicknessPanel {...cmn} plcOk={p.plcOk} feed={feed} send={p.send} notify={p.notify} />
        <PcPanel {...cmn} recipes={p.pcRecipes} getRecipe={p.getRow} />
        <TspPanel {...cmn} nowMs={nowMs} />
      </div>
      <div className="grid items-start gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        <PresputterPanel {...cmn} />
        <RobotPanel bundle={bundle} st={st} feed={feed} />
        <CommonOps {...cmn} plcOk={p.plcOk} />
        {p.local && p.localCan && <LocalFiles bundle={bundle} can={p.localCan} onAsk={onAsk} />}
        <Ch12Timing st={st} bundle={bundle} />
      </div>
    </div>
  );
}
