"use client";

// 챔버12 운전 탭(2026-11-18 — 챔버K Chk2Run 구성). CH1·CH2 를 나란히(1280 이상 두 열), 챔버마다 위에서부터:
//   상태·조작(공정 상태·블록·남은 시간·ETA·엔진 상태 글 + STOP·공정 시작·적재 해제·오류 해제, 웹은 '다음 공정' 레시피 고르기·적재) →
//   공정 순서(블록 목록 — 끝남·지금·남음, 건너뛰기·일시정지/재개·시퀀스 편집) → 공정 중 값 바꾸기(챔버K Chk2Adjust) → 주요 값(칸마다 목표·큰 값·막대) →
//   추세(챔버K Chk2Trend — 챔버 열) → 장비 카드(묶음 블록 순서, 꺼진 장비는 접힘)·OES/RGA·공정 목표값 → 알림·로그(이 챔버 평소 보기 줄).
// 그 아래: CH2 히터·두께 · 플라즈마 클리닝 · TSP · 프리스퍼터 예약 · 로봇 연결 · 장비 공통 조작 · 장비 응답 시간(노트북 화면은 + 장비 폴더 레시피).
// 1366×768 에서 상태 띠 + 탭 + 두 챔버 상태·조작 칸이 첫 화면에 보이게 조작 칸을 맨 위에, 줄 수를 적게 둔다.
import { useEffect, useMemo, useState } from "react";
import { FileEdit, ListOrdered, Pause, Play, SkipForward, Square, Upload, X } from "lucide-react";
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
import { ChamberDevices } from "./Ch12Devices";
import { ChamberLog } from "./Ch12Logs";
import { CommonOps, PcPanel, PresputterPanel, RobotPanel, TspPanel, type LockFn } from "./Ch12Aux";
import { hasRowContent, loadPayload, rowLine } from "./Ch12Recipes";
import { Spectra } from "./Ch12Spectra";
import Ch12Timing from "./Ch12Timing";
import { LocalFiles } from "./Ch12LocalFiles";
import {
  KINDS, blockControl, blockLabel, chArgs, chamberState, clockOrDash, engineOf, hasKind, isRunning, pickKind, short, startedUpto, stateInfo,
} from "./logic";
import { asChk, type Ch12Bundle, type Ch12State } from "./types";
import { CARD, blockName, commandName, fieldName, fieldTip, fieldTipOf, ownerName, placeName, reasonTip, toTerms12 } from "@/lib/ops2/ch12/terms";
import type { Row } from "@/lib/ops2/ch12/recipe";
import { fmtKst } from "@/lib/ops2/time";

type Ch = "ch1" | "ch2";
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const fieldOf = (b: Ch12Bundle | null, col: string): FieldDef | undefined =>
  b?.snapshot?.blocks?.flatMap((x) => x.fields).find((f) => f.column === col);

// ───────────── 추세 열(챔버별 — useChk2 trendCols 는 모듈 상수 열, 그래프 제목·선 이름은 그릴 때 묶음에서) ─────────────
type TrendCol = { title: string; unit: string; lines: [string, string | null][] };      // [값 열, 목표 열]
const TREND12: Record<Ch, TrendCol[]> = {
  ch1: [
    { title: "압력", unit: "mTorr", lines: [["ch1.mfc.pressure_mtorr", "ch1.set.pressure_mtorr"]] },
    { title: "밸브 위치", unit: "%", lines: [["ch1.mfc.valve_pct", null]] },
    { title: "가스 유량", unit: "sccm", lines: [["ch1.mfc.ar_sccm", "ch1.set.ar_sccm"], ["ch1.mfc.o2_sccm", "ch1.set.o2_sccm"]] },
    { title: "파워", unit: "W", lines: [["ch1.dcpulse.p_w", "ch1.set.dcpulse_w"], ["ch1.rfpulse.fwd_w", "ch1.set.rfpulse_w"]] },
  ],
  ch2: [
    { title: "압력", unit: "mTorr", lines: [["ch2.mfc.pressure_mtorr", "ch2.set.pressure_mtorr"]] },
    { title: "밸브 위치", unit: "%", lines: [["ch2.mfc.valve_pct", null]] },
    { title: "가스 유량", unit: "sccm", lines: [["ch2.mfc.ar_sccm", "ch2.set.ar_sccm"], ["ch2.mfc.o2_sccm", "ch2.set.o2_sccm"], ["ch2.mfc.n2_sccm", "ch2.set.n2_sccm"]] },
    { title: "파워", unit: "W", lines: [["ch2.dcpulse.p_w", "ch2.set.dcpulse_w"], ["ch2.rfpulse.fwd_w", "ch2.set.rfpulse_w"],
      ["ch2.dc.dc1_p", "ch2.set.dc_w"], ["ch2.rf.fwd_w", "ch2.set.rf_w"]] },
    { title: "히터 온도", unit: "°C", lines: [["ch2.heater.pv", "ch2.heater.sv"]] },
  ],
};
export const TREND_COLS12: readonly string[] = Object.values(TREND12).flatMap((ds) => ds.flatMap((d) => d.lines.flatMap(([a, b]) => (b ? [a, b] : [a]))));

/** 값 이름 — 장비 이름이 있어야 뜻이 서는 값(파워·Forward·현재 온도)은 '장비 이름 + 필드 이름'('DC Pulse 파워'·'RF Pulse Forward'), 나머지는 필드 이름 */
const DEV_NAMED = /\.(dcpulse|rfpulse|rf|heater)\./;
function valueName(b: Ch12Bundle | null, col: string, ch: Ch): string {
  const f = fieldName(b, col, placeName(b, ch));
  if (!DEV_NAMED.test(col)) return f;
  const dev = blockName(b, col.split(".").slice(0, 2).join("."), placeName(b, ch));
  return f.startsWith(dev) ? f : `${dev} ${f}`;
}
/** 추세 그래프 정의(Chk2Trend defs) — 선 이름은 묶음 필드 이름 */
export const trendDefs = (b: Ch12Bundle | null, ch: Ch): TrendDef[] =>
  TREND12[ch].map((d) => ({ title: d.title, unit: d.unit, lines: d.lines.map(([a, t]) => [a, valueName(b, a, ch), t] as [string, string, string | null]) }));

// ───────────── 주요 값 ─────────────
type KeyDef = { value: string; target: string | null; limit?: string; bar: boolean };
const keyDefs = (ch: Ch): KeyDef[] => [
  { value: `${ch}.mfc.pressure_mtorr`, target: `${ch}.set.pressure_mtorr`, bar: true },
  ...(ch === "ch1" ? ["ar", "o2"] : ["ar", "o2", "n2"]).map((g) => ({ value: `${ch}.mfc.${g}_sccm`, target: `${ch}.set.${g}_sccm`, bar: true })),
  { value: `${ch}.dcpulse.p_w`, target: `${ch}.set.dcpulse_w`, bar: true },
  { value: `${ch}.rfpulse.fwd_w`, target: `${ch}.set.rfpulse_w`, bar: true },
  ...(ch === "ch2" ? [
    { value: "ch2.dc.dc1_p", target: "ch2.set.dc_w", bar: true },
    { value: "ch2.rf.fwd_w", target: "ch2.set.rf_w", bar: true },
    { value: "ch2.heater.pv", target: "ch2.heater.sv", limit: "CH2_HEATER_MAX_TEMP", bar: true },
    { value: "ch2.thk.eff_nm", target: "ch2.thk.target_nm", bar: true },
  ] : []),
  { value: `${ch}.ig.pressure_torr`, target: null, bar: false },
];

function KeyTile({ d, bundle, snap, ch }: { d: KeyDef; bundle: Ch12Bundle | null; snap?: Record<string, unknown>; ch: Ch }) {
  const { detail } = useChk2Mode();
  const name = valueName(bundle, d.value, ch);
  const f = fieldOf(bundle, d.value), tf = d.target ? fieldOf(bundle, d.target) ?? (bundle?.snapshot?.process ?? []).find((x) => x.column === d.target) : undefined;
  const v = num(snap?.[d.value]), t = d.target ? num(snap?.[d.target]) : null;
  const unit = f?.unit ?? "";
  const txt = f ? fieldText(f, snap?.[d.value], snap, bundle?.snapshot?.blocks) : { text: "", alt: null, warn: false };
  const max = scaleMax(t, v, null);
  return (
    <Tile className="p-3">
      <div className="flex items-baseline justify-between gap-2" title={fieldTip(f, detail)}>
        <span className={`truncate ${FS.body} font-semibold text-[#1B1F24]`}>{name}</span>
        {t !== null && <span className={`shrink-0 ${FS.small} text-[#5B6470]`}>목표 {short(t)} {tf?.unit ?? unit}</span>}
      </div>
      <div className="mt-1"><Val text={txt.text} unit={unit} size="big" alt={txt.alt} altWarn={txt.warn} /></div>
      {d.bar ? <div className="mt-1"><RangeBar value={v} target={t} band={null} max={max} label={`${name} 막대`} /></div>
        : <p className={`mt-1 ${FS.small} text-[#8A929D]`}>로그 눈금 값이라 막대 없음</p>}
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
        <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">{shown.map((d) => <KeyTile key={d.value} d={d} bundle={bundle} snap={snap} ch={ch} />)}</div>
      ) : <Empty>값을 아직 받지 못했습니다</Empty>}
      <p className={`mt-2 ${FS.small} text-[#5B6470]`}>▲ 목표 · │ 현재</p>
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
    <Card title={<><ListOrdered size={15} /> {CARD.seq}</>} right={running && <span className={`${FS.small} text-[#5B6470]`}>시작한 단계 {upto}/{blocks.length}</span>}>
      <div className="mb-2 flex flex-wrap gap-2">
        {paused ? (
          <Btn kind="primary" lock={lock(kResume, key(kResume)) ?? (running ? null : "공정 중이 아님")}
            onClick={() => ask({ kind: kResume, label: `${label} 재개`, args: chArgs(bundle, kResume, ch, { on: false }) })}><Play size={14} /> 재개</Btn>
        ) : (
          <Btn lock={lock(kPause, key(kPause)) ?? (!running ? "공정 중이 아님" : !ctl.pause ? ctl.why || "멈출 수 없는 단계" : null)}
            onClick={() => ask({ kind: kPause, label: `${label} 일시정지`, detail: bname, args: chArgs(bundle, kPause, ch, { on: true }),
              lines: [ctl.pauseText ? `이 단계에서 일시정지: ${toTerms12(ctl.pauseText)}` : "지금 단계를 멈춥니다."] })}><Pause size={14} /> 일시정지</Btn>
        )}
        <Btn lock={lock(kSkip, key(kSkip)) ?? (!running ? "공정 중이 아님" : !ctl.skip ? ctl.why || "건너뛸 수 없는 단계" : null)}
          onClick={() => ask({ kind: kSkip, label: `${label} ${commandName(bundle, kSkip)}`, detail: bname, red: true, args: chArgs(bundle, kSkip, ch),
            lines: [`지금 단계 ${step?.no ?? "-"} ${bname} 을(를) 끝내고 다음 단계로 갑니다.`, `정리: ${ctl.def?.skipCleanup?.map(toTerms12).join(", ") || "없음"}`] })}>
          <SkipForward size={14} /> 건너뛰기
        </Btn>
        <Btn lock={lock(kEdit, key(kEdit)) ?? (!running ? "공정 중이 아님" : null)} onClick={onEditSeq}
          title="아직 시작하지 않은 단계만 넣고 빼고 옮길 수 있습니다."><ListOrdered size={14} /> {commandName(bundle, kEdit)}</Btn>
      </div>
      {!blocks.length ? <Empty>{running ? "단계 목록을 받는 중입니다" : "공정을 시작하면 단계 순서가 보입니다"}</Empty> : (
        <ol className="max-h-72 space-y-1 overflow-y-auto pr-1">
          {blocks.map((b, i) => {
            const done = running && i < cur, now = running && i === cur;
            return (
              <li key={`${i}-${b.type}`} className={`flex items-baseline gap-2 rounded-[8px] px-2 py-1 ${FS.body} ${
                now ? "bg-[#E8EEFC] font-semibold text-[#1B1F24]" : done ? "text-[#8A929D]" : "text-[#1B1F24]"}`}>
                <span className="w-6 shrink-0 text-right tabular-nums text-[#5B6470]">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate">{blockLabel(bundle, b.type)}{b.label && b.label !== b.type && b.label !== blockLabel(bundle, b.type) ? ` · ${b.label}` : ""}</span>
                {now && <span className="shrink-0 tabular-nums text-[#133A7C]">{paused ? "멈춤" : typeof (cs?.remainS ?? step?.remainS) === "number" ? `남은 ${clockOrDash(cs?.remainS ?? step?.remainS)}` : "진행 중"}</span>}
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
  plcOk?: boolean; send?: (kind: string, args: Record<string, unknown>, label?: string) => Promise<SendResult>;
  notify?: (n: Omit<Notice, "id" | "at">) => void;
  onHmi?: () => void; onConfig?: () => void;        // W-20 장비 박스 [HMI 열기]·[설정 열기] — 탭이 없으면 넘기지 않는다
  onEditRecipe?: (id: string | null) => void;       // W-20 다음 공정 [레시피 열기]·[레시피 편집] — 레시피 탭이 있을 때만
};

/** 다음 공정(대기, W-20 — 챔버K 다음 공정 카드와 같게): 적재된 레시피가 없으면 머리 오른쪽 한 줄, 고르기 줄(레시피 고르기 · [레시피 열기]/
 *  [레시피 편집](레시피 탭이 있을 때만) · [적재]), 고른 레시피 요약은 아래 전체 폭. 적재 명령·인자·잠금·확인창은 W-19 와 같다.
 *  노트북 화면(웹 레시피 목록 없음)은 고르기 대신 안내 한 줄 */
function NextProcess({ bundle, st, ch, recipes, getRecipe, lock, onAsk, label, onEdit }: {
  bundle: Ch12Bundle | null; st: Ch12State | null; ch: Ch; recipes: RecipeItem[] | null; getRecipe?: (id: string) => Promise<RecipeFull | null>;
  lock: LockFn; onAsk: (a: Ask) => void; label: string; onEdit?: (id: string | null) => void;
}) {
  const [id, setId] = useState("");
  const [full, setFull] = useState<RecipeFull | null>(null);
  useEffect(() => {
    if (!id || !getRecipe) return;
    let off = false;
    void getRecipe(id).then((r) => { if (!off) setFull(r); });
    return () => { off = true; };
  }, [id, getRecipe]);
  const loaded = engineOf(st, ch)?.recipe_name;
  const kLoad = pickKind(bundle, KINDS.load);
  const list = (recipes ?? []).filter((r) => r.kind === (ch as unknown as RecipeItem["kind"]));
  const item = list.find((r) => r.id === id);
  const rows = (full && full.id === id ? (full.rows as Row[]).filter(hasRowContent) : []);
  const p = full && full.id === id ? loadPayload(rows, full.name) : null;
  const why = !id ? "레시피를 고르세요" : !p ? "레시피를 읽는 중" : item?.check?.errors ? `웹 검사 오류 ${item.check.errors}개(레시피 탭에서 고치세요)` : !rows.length ? "행 없음" : p.why || null;
  const blockRows = rows.filter((r) => Array.isArray(r.blocks));
  const steps = blockRows.reduce((n, r) => n + (r.blocks as unknown[]).length, 0);
  const first = rows.find((r) => !Array.isArray(r.blocks));
  return (
    <Card title={CARD.next} right={!loaded && <span className={`${FS.body} text-[#5B6470]`}>장비에 적재된 공정 레시피 없음</span>}>
      {!recipes ? (
        <p className={`${FS.body} text-[#5B6470]`}>{`레시피 고르기·적재는 웹 화면에서 합니다. 장비 폴더의 레시피 파일은 아래 '${CARD.localFiles}'에서 고릅니다.`}</p>
      ) : (
        <div className="space-y-3">
          <div className="min-w-0">
            <p className={`mb-1 ${FS.small} text-[#5B6470]`}>공정 레시피</p>
            <div className="flex flex-wrap items-center gap-2">
              <select value={id} onChange={(e) => { setId(e.target.value); setFull(null); }} aria-label={`${label} 공정 레시피 고르기`}
                className={`h-10 min-w-0 flex-1 rounded-[10px] border border-[#D9DDE3] bg-white px-2 ${FS.body}`}>
                <option value="">{label} 공정 레시피 고르기…</option>
                {list.map((r) => <option key={r.id} value={r.id}>{r.name}{r.check?.errors ? ` (오류 ${r.check.errors})` : ""}</option>)}
              </select>
              {onEdit && <Btn onClick={() => onEdit(id || null)}><FileEdit size={14} /> {id ? "레시피 편집" : "레시피 열기"}</Btn>}
              <Btn kind="primary" lock={lock(kLoad, `${kLoad}@${ch}`) ?? why}
                onClick={() => p && full && onAsk({ kind: kLoad, key: `${kLoad}@${ch}`, label: `${label} 레시피 적재`, detail: `'${full.name}'`,
                  args: chArgs(bundle, kLoad, ch, p.args), lines: [`${rows.length}행`, ...rows.slice(0, 3).map((r) => (Array.isArray(r.blocks) ? `단계 ${(r.blocks as unknown[]).length}개` : rowLine(r)))],
                  note: "장비에 행 목록을 올리고 장비가 다시 검사합니다. 시작은 '공정 시작'으로 합니다." })}>
                <Upload size={14} /> 적재
              </Btn>
            </div>
          </div>
          {full && id && full.id === id && (
            <div className="space-y-2 rounded-[10px] border border-[#E3E6EA] p-3" data-next-summary={ch}>
              <div className="flex flex-wrap gap-1.5">
                {item?.check ? (item.check.errors ? <Chip tone="alarm">검사 오류 {item.check.errors}</Chip> : item.check.warnings ? <Chip tone="warn">경고 {item.check.warnings}</Chip> : <Chip>검사 통과</Chip>)
                  : <Chip>검사 없음</Chip>}
                <Chip>{rows.length}행</Chip>
                {steps > 0 && <Chip>단계 {steps}개</Chip>}
              </div>
              {first && <p className={`${FS.body} text-[#1B1F24]`}>{rowLine(first)}</p>}
              {item?.check?.first && item.check.errors > 0 && <p className={`${FS.small} text-[#B42318]`}>{item.check.first}</p>}
              {p?.why && <p className={`${FS.small} text-[#B42318]`}>{p.why}</p>}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export function ChamberRun(p: ChamberProps) {
  const { bundle, st, ch, connected, lock, onAsk, feed, nowMs } = p;
  const { detail } = useChk2Mode();
  const cs = chamberState(st, ch);
  const cdef = bundle?.chambers?.find((c) => c.id === ch);
  const info = stateInfo(bundle, cs?.procState, ch);
  const running = isRunning(bundle, cs);
  const busy = running || info.kind === "stopping";          // 공정 중 배치(W-20) — 공정 중·정지 중. 대기면 머리 → 다음 공정 → 장비 박스
  const eng = engineOf(st, ch);
  const snap = st?.snapshot;
  const label = placeName(bundle, ch);
  const key = (k: string) => `${k}@${ch}`;
  const ask = (a: Ask) => onAsk({ ...a, key: a.key ?? key(a.kind) });
  const kStop = pickKind(bundle, KINDS.stop), kStart = pickKind(bundle, KINDS.start), kClear = pickKind(bundle, KINDS.clear), kErr = pickKind(bundle, KINDS.errClear);
  const step = cs?.step;
  const stepLabel = cs?.stepLabel ?? eng?.step_label ?? null;           // 장비 묶음 16 — 진행 중 동작의 화면 이름
  const eta = cs?.etaRemainingS;
  const etaAt = typeof eta === "number" && eta >= 0 ? new Date(nowMs + eta * 1000).toISOString() : null;
  // 챔버 알람(1초 행 <c>.proc.alarms — 사유 코드)은 묶음 사유 이름으로, 이름이 없으면 '알람'(코드는 상세 보기에서만)
  const alarmName = (code: string) => { const l = reasonLabel(asChk(bundle), code); return l !== code ? l : detail ? code : "알람"; };
  const alarms = [...(cs?.alarms ?? []).map((r) => ({ ruleId: r, text: alarmName(r), tip: reasonTip(asChk(bundle), r, detail) })),
    ...(st?.alarms ?? []).filter((a) => a.chamber === ch && !(cs?.alarms ?? []).includes(a.ruleId))
      .map((a) => ({ ruleId: a.ruleId, text: a.code ? reasonLabel(asChk(bundle), a.code) : a.ruleId, tip: reasonTip(asChk(bundle), a.code, detail) }))];
  const targets = (bundle?.snapshot?.process ?? []).filter((f) => (cdef?.targets ?? []).includes(f.column))
    .filter((f) => snap?.[f.column] !== null && snap?.[f.column] !== undefined);
  // 공정 중 값 바꾸기 — 챔버K 화면을 이 챔버 값으로(인자에 ch, 기다림 단위도 챔버별)
  const adjList = Array.isArray(eng?.adjust) ? (eng.adjust as AdjustState[]) : null;
  // 가스 단계 규칙 C(장비 D420) — 흐르는 중 올림의 단계 진행('O2 9.0 → 9.5 → 10 진행 중 2/3')
  const stepping = (adjList ?? []).map((a) => (a as unknown as { stepping?: { text?: unknown } | null }).stepping?.text)
    .filter((t): t is string => typeof t === "string" && t.length > 0);
  const adjSt = { procState: running ? "__RUN__" : "IDLE", runId: cs?.runId ?? null, adjust: adjList } as StateData;
  const adjBundle = useMemo(() => (bundle ? { ...asChk(bundle)!, states: [{ name: "__RUN__", label: "진행", kind: "active" }] } : null), [bundle]);
  const queue = eng?.queue as { index?: number; total?: number; mode?: boolean } | null | undefined;
  return (
    <div className="@container/ch flex min-w-0 flex-col gap-3" data-chamber={ch} data-layout={busy ? "run" : "idle"}>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <div className="min-w-0 flex-1">
            <p className={`flex flex-wrap items-center gap-1.5 ${FS.small} font-semibold text-[#5B6470]`}>
              <span className="rounded bg-[#3A424D] px-1.5 py-px text-white">{label}</span>
              {info.kind === "active" ? "가동 중" : info.kind === "stopping" ? "정지 중" : "대기"}
              {cs?.owner && <span>· {ownerName(bundle, cs.owner)}</span>}
              {typeof cs?.recipeRev === "number" && cs.recipeRev > 0 && <span>· 레시피 판 {cs.recipeRev}</span>}
              {cs?.paused && <Chip tone="warn"><Pause size={11} />일시정지</Chip>}
            </p>
            <p className={`mt-0.5 truncate ${FS.title} font-bold ${connected ? "text-[#1B1F24]" : "text-[#8A929D]"}`}>
              {cs ? (cs.procState === "IDLE" || cs.procState === "idle" || !cs.procState ? "대기 중" : info.label) : "상태 없음"}
              {detail && cs?.procState && <span className={`ml-2 align-middle font-mono ${FS.small} font-normal text-[#8A929D]`}>{cs.procState}</span>}
            </p>
            {running && step && (
              <p className={`${FS.body} text-[#1B1F24]`}>
                <span className="tabular-nums text-[#5B6470]">단계 {step.no ?? "-"}/{step.total ?? "-"}</span> <b>{blockLabel(bundle, step.type)}</b>
                {typeof step.elapsedS === "number" && <span className="text-[#5B6470]"> · 단계 경과 {clockOrDash(step.elapsedS)}</span>}
              </p>
            )}
            {/* 지금 동작(W-19 ④) — 장비 묶음 16 의 화면 이름(stepLabel — 'MV 열기'·'RF Pulse 켜기 120 W'). v1 스텝 문구(엔진 text)는 상세 보기에서만 */}
            {running && stepLabel && (
              <p className={`truncate ${FS.body} text-[#1B1F24]`} title={fieldTipOf(bundle, `${ch}.proc.step_label`, detail)} data-step-label={ch}>
                <span className="text-[#5B6470]">{fieldName(bundle, `${ch}.proc.step_label`, label)}</span> <b>{stepLabel}</b>
              </p>
            )}
            {detail && eng?.text && <p className={`truncate font-mono ${FS.small} text-[#8A929D]`}>{String(eng.text)}</p>}
            {eng?.error && <p className={`${FS.body} font-semibold text-[#B42318]`} title={reasonTip(asChk(bundle), String(eng.error), detail)}>{alarmName(String(eng.error))}</p>}
            <p className={`${FS.body} text-[#5B6470]`}>
              {eng?.recipe_name ? <>적재 <b className="text-[#1B1F24]">{String(eng.recipe_name)}</b>
                {queue?.mode === true || (queue?.total ?? 0) > 1 ? ` · 공정 ${typeof queue?.index === "number" ? queue.index + 1 : "-"}/${queue?.total ?? "-"}` : ""}</>
                : running ? "화면 값으로 시작한 공정(적재 레시피 없음)" : "적재된 레시피 없음"}
            </p>
            {detail && cs?.runId && <p className={`font-mono ${FS.small} text-[#8A929D]`}>run {cs.runId}</p>}
          </div>
          <div className="grid grid-cols-2 gap-x-4 text-right">
            <p title="지금 단계가 끝날 때까지 남은 시간입니다."><span className={`block ${FS.small} text-[#5B6470]`}>단계 남은 시간</span>
              <span className={`${FS.big} font-bold text-[#133A7C]`}>{clockOrDash(cs?.remainS ?? step?.remainS)}</span></p>
            <p title={fieldTipOf(bundle, `${ch}.proc.eta_remaining_s`, detail) ?? "공정이 끝날 때까지 남은 예상 시간입니다."}><span className={`block ${FS.small} text-[#5B6470]`}>공정 끝까지</span>
              <span className={`${FS.big} font-bold text-[#133A7C]`}>{clockOrDash(eta)}</span>
              <span className={`block ${FS.small} text-[#5B6470]`}>{etaAt ? `끝 예정 ${fmtKst(etaAt).slice(-8, -3)}` : running ? "확정 전" : ""}</span></p>
          </div>
        </div>
        {alarms.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{alarms.map((a) => <Chip key={a.ruleId} tone="alarm" title={a.tip}>{a.text}</Chip>)}</div>}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Btn size="lg" kind="danger" lock={lock(kStop, key(kStop))} onClick={() => ask({ kind: kStop, label: `${label} STOP`, stop: true,
            args: chArgs(bundle, kStop, ch), note: `${label} 공정을 정지 순서대로 멈춥니다. 다른 챔버는 그대로입니다.` })}>
            <Square size={14} /> {label} STOP
          </Btn>
          {!running && hasKind(bundle, KINDS.start) && (
            <Btn size="lg" kind="dangerSolid" lock={lock(kStart, key(kStart))} onClick={() => ask({ kind: kStart, label: `${label} 공정 시작`, red: true,
              args: chArgs(bundle, kStart, ch), lines: [eng?.recipe_name ? `적재된 '${String(eng.recipe_name)}' 을(를) 시작합니다.` : "적재된 레시피가 없으면 장비가 거부합니다."],
              note: "공정을 시작합니다. 가스·파워·셔터가 움직입니다." })}>
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
      </Card>

      {!busy && <NextProcess bundle={bundle} st={st} ch={ch} recipes={p.recipes} getRecipe={p.getRecipe} lock={lock} onAsk={onAsk} label={label}
        onEdit={p.onEditRecipe} />}
      {busy && <>

      <Seq bundle={bundle} st={st} ch={ch} lock={lock} onAsk={onAsk} onEditSeq={p.onEditSeq} label={label} />

      {stepping.length > 0 && (
        <div className={`rounded-xl border border-[#B9D3F5] bg-[#EEF5FF] px-4 py-2 ${FS.body} text-[#133A7C]`} data-gas-stepping={ch}>
          {stepping.map((t) => <p key={t}><b>가스 단계</b> · {t}</p>)}
        </div>
      )}
      <Chk2Adjust bundle={adjBundle} st={adjSt} skewMs={p.skewMs} canKey={(kind, k) => !lock(kind, `${k}@${ch}`)} plain
        onAsk={(a) => onAsk({ ...a, key: `${a.key ?? a.kind}@${ch}`, label: `${label} ${a.label}`, args: chArgs(bundle, a.kind, ch, a.args ?? {}) })} />

      <KeyValues bundle={bundle} st={st} ch={ch} running={running} />

      <Chk2Trend trend={p.trend} equipment={p.equipment} runId={cs?.runId ?? null} local={p.local} nowMs={nowMs}
        defs={trendDefs(bundle, ch)} title={`${label} ${CARD.trend}`} edgeTicks />

      </>}
      {/* 장비 박스(W-20 — 챔버K DevCard 틀): 진공 · 셔터·인터락 · 가스·압력 · Ion Gauge · 파워 · 히터(CH2) · 두께 모니터 · OES · RGA.
          격자는 이 챔버 칸 폭 기준(컨테이너 ch) 950px 이상 3개, 650px 이상 2개, 그 밖 1개 — 이름이 잘리지 않는 폭 */}
      <ChamberDevices ctx={{ bundle, st, lock, onAsk, onHmi: p.onHmi, onConfig: p.onConfig }} ch={ch} plcOk={p.plcOk ?? true} feed={feed}
        send={p.send} notify={p.notify} grid="grid grid-cols-1 gap-3 @min-[650px]/ch:grid-cols-2 @min-[950px]/ch:grid-cols-3" />
      {busy && <Spectra feed={feed} st={st} ch={ch} />}
      {busy && targets.length > 0 && (
        <Card title="공정 목표값" right={<span className={`${FS.small} text-[#5B6470]`}>그 시각 엔진이 장비에 요청한 값</span>}>
          <div className="grid grid-cols-2 gap-x-4 sm:grid-cols-3">
            {targets.map((f) => (
              <KV key={f.column} k={fieldName(bundle, f.column, label)} title={fieldTipOf(bundle, f.column, detail)}>
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
