"use client";

// 챔버12 운전 탭 아래 칸(2026-11-18 — 챔버K kit 틀): 플라즈마 클리닝 · TSP · 프리스퍼터 예약 · 로봇 연결 · 장비 공통 조작.
// 입력은 작업자 말로(이름·단위·범위 — 범위는 묶음 파라미터·장비 판단과 같은 값, 범위 밖이면 보내기 전에 막음), 명령 인자를 그대로 그리지 않는다.
// 조작은 확인창 → 명령(잠금 = 부르는 쪽 lock — 권한·bench·끊김·결과 기다림·PLC 값 오래됨, 챔버K 와 같은 순서·문구). 마지막 판단은 장비.
// (CH2 히터·두께는 W-20 부터 CH2 칸 장비 박스 — Ch12Devices) 값은 1초 행 블록(묶음 snapshot — pc.rf·tsp·tsp.ig)과 엔진 상태(state.heater·state.engines).
import { useMemo, useState } from "react";
import { Bot, Play, Sparkles, Square, Timer, Wrench, X } from "lucide-react";
import { FS, Btn, Card, Chip, Empty, KV, type Ask } from "../chk/kit";
import { StateBadge, StateTag } from "../chk/StateTag";
import { paramValue } from "../chk/logic";
import { useChk2Mode } from "../chk/mode";
import type { FeedItem } from "../chk/useChk2";
import { fmtKst } from "@/lib/ops2/time";
import { BlockCard } from "./BlockCard";
import { NumField, TextField, TimeField } from "./Ch12Inputs";
import { ch12LogLine } from "./Ch12Logs";
import {
  KINDS, chArgs, chamberState, checkNum, clockOrDash, engineOf, isHHMM, isRunning, paramRange, pickKind, short, stateInfo,
  type NumRange,
} from "./logic";
import { asChk, type Ch12Bundle, type Ch12State, type ChamberId } from "./types";
import { CARD, blockName, buttonName, commandName, dropPrefix, fieldName, ownerName, placeName, toTerms12 } from "@/lib/ops2/ch12/terms";
import type { RecipeItem as RecipeSummary } from "../chk/useRecipes";
import { PC_FIELDS, pcRowLine } from "@/lib/ops2/ch12/pc";

export type LockFn = (kind: string, key?: string) => string | null;
type Common = { bundle: Ch12Bundle | null; st: Ch12State | null; lock: LockFn; onAsk: (a: Ask) => void };

const blockOf = (b: Ch12Bundle | null, name: string) => b?.snapshot?.blocks?.find((x) => x.name === name);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

function Missing({ what }: { what: string }) {
  return <p className={`rounded-[10px] bg-[#F5F6F8] px-3 py-2 ${FS.small} text-[#5B6470]`}>{what}: 장비가 아직 이 값을 보내지 않습니다.</p>;
}

/** 진행 줄 — 상태·소유자·단계·남은 시간·ETA(PC·TSP) */
function ProcLine({ bundle, st, ch }: { bundle: Ch12Bundle | null; st: Ch12State | null; ch: ChamberId }) {
  const cs = chamberState(st, ch);
  const info = stateInfo(bundle, cs?.procState, ch);
  const { detail } = useChk2Mode();
  const idle = !cs?.procState || /^idle$/i.test(cs.procState);
  return (
    <div className={`mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-[10px] border border-[#E3E6EA] px-3 py-2 ${FS.body}`}>
      <b className={idle ? "text-[#5B6470]" : "text-[#1B1F24]"}>{idle ? "대기" : info.label}</b>
      {cs?.owner && <span className="text-[#5B6470]">{ownerName(bundle, cs.owner)}</span>}
      {cs?.step && <span className="text-[#5B6470]">{cs.step.label ? toTerms12(cs.step.label) : cs.step.type ? "단계" : ""}{cs.step.no != null && ` ${cs.step.no}/${cs.step.total ?? "-"}`}</span>}
      {!idle && <span className="tabular-nums">남은 <b className="text-[#133A7C]">{clockOrDash(cs?.remainS ?? cs?.step?.remainS)}</b></span>}
      {!idle && <span className="tabular-nums">ETA <b className="text-[#133A7C]">{clockOrDash(cs?.etaRemainingS)}</b></span>}
      {(cs?.alarms ?? []).length > 0 && <Chip tone="alarm">알람 {(cs?.alarms ?? []).length}</Chip>}
      {detail && cs?.runId && <span className={`font-mono ${FS.small} text-[#8A929D]`}>run {cs.runId}</span>}
    </div>
  );
}

// ───────────── 플라즈마 클리닝 ─────────────
export function PcPanel({ bundle, st, lock, onAsk, recipes, getRecipe }: Common & {
  recipes: RecipeSummary[] | null;                               // 웹 저장 PC 레시피(kind pc) — 노트북 화면은 null(장비 폴더 '파일 고르기')
  getRecipe?: (id: string) => Promise<Record<string, unknown> | null>;
}) {
  const snap = st?.snapshot;
  const rf = blockOf(bundle, "pc.rf");
  const cs = chamberState(st, "pc");
  const running = isRunning(bundle, cs);
  const targets = (bundle?.snapshot?.process ?? []).filter((f) => f.column.startsWith("pc.set.") && snap?.[f.column] != null);
  const [chSel, setChSel] = useState<1 | 2>(1);
  const [rid, setRid] = useState("");
  const [row, setRow] = useState<Record<string, unknown> | null>(null);
  const kSel = pickKind(bundle, KINDS.pcSelect), kStart = pickKind(bundle, KINDS.pcStart), kStop = pickKind(bundle, KINDS.pcStop);
  const kErr = pickKind(bundle, KINDS.pcErrClear), kLoad = "PC_RECIPE_LOAD";
  const pick = async (id: string) => {
    setRid(id);
    setRow(null);
    if (id && getRecipe) setRow(await getRecipe(id));
  };
  const rowCh = row && (Number(row.use_ch) === 2 ? 2 : Number(row.use_ch) === 1 ? 1 : null);
  const pc = placeName(bundle, "pc");
  return (
    <Card title={<><Sparkles size={15} /> {pc}</>}>
      <ProcLine bundle={bundle} st={st} ch="pc" />
      <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <span className={`flex flex-col gap-1 ${FS.small} text-[#5B6470]`}>
            <span className="font-semibold text-[#1B1F24]">채널</span>
            <span className="flex gap-1" role="radiogroup" aria-label={`${placeName(bundle, "pc")} 채널`}>
              {([1, 2] as const).map((n) => (
                <Btn key={n} kind={chSel === n ? "primary" : "neutral"} onClick={() => setChSel(n)} ariaLabel={`CH${n}`}>CH{n}</Btn>
              ))}
            </span>
          </span>
          <Btn lock={lock(kSel) ?? (running ? "실행 중에는 채널을 바꾸지 않음" : null)}
            onClick={() => onAsk({ kind: kSel, label: "채널 선택", detail: `CH${chSel}`, args: { ch: chSel } })}>채널 선택</Btn>
        </div>
        {recipes && (
          <div className="flex flex-wrap items-end gap-2">
            <label className={`flex min-w-0 flex-1 flex-col gap-1 ${FS.small} text-[#5B6470]`}>
              <span className="font-semibold text-[#1B1F24]">레시피</span>
              <select value={rid} onChange={(e) => void pick(e.target.value)} aria-label={`${pc} 레시피 고르기`}
                className={`h-10 min-w-0 rounded-[10px] border border-[#D9DDE3] bg-white px-2 ${FS.body}`}>
                <option value="">고르지 않음(장비에 불러온 값으로)</option>
                {recipes.map((r) => <option key={r.id} value={r.id}>{r.name}{r.check?.errors ? ` (오류 ${r.check.errors})` : ""}</option>)}
              </select>
            </label>
            <Btn lock={lock(kLoad) ?? (!row ? "레시피를 고르세요" : running ? "실행 중" : null)}
              onClick={() => row && onAsk({ kind: kLoad, label: commandName(bundle, kLoad), args: { rows: [row] }, lines: [pcRowLine(row)],
                note: `값을 장비 ${pc} 화면 칸에 넣습니다. 시작은 하지 않습니다.` })}>불러오기</Btn>
          </div>
        )}
        {row && <p className={`${FS.body} text-[#1B1F24]`}>{pcRowLine(row)}</p>}
        {!recipes && <p className={`${FS.small} text-[#5B6470]`}>{`레시피는 아래 '${CARD.localFiles}'에서 CSV 를 골라 불러옵니다.`}</p>}
        <div className="flex flex-wrap gap-2">
          <Btn size="lg" kind="dangerSolid" lock={lock(kStart) ?? (running ? "실행 중" : null)}
            onClick={() => onAsk({ kind: kStart, label: commandName(bundle, kStart), red: true, args: { ch: rowCh ?? chSel, ...(row ? { rows: [row] } : {}) },
              lines: [row ? pcRowLine(row) : "장비에 불러온 값(마지막 CSV·화면 값)으로 시작합니다.", `채널 CH${rowCh ?? chSel}`],
              note: `${pc} 을(를) 시작합니다. 가스·RF 가 움직입니다.` })}>
            <Play size={14} /> 시작
          </Btn>
          <Btn size="lg" kind="danger" lock={lock(kStop)}
            onClick={() => onAsk({ kind: kStop, label: commandName(bundle, kStop), stop: true, note: `${pc} 을(를) 장비 정지 순서대로 멈춥니다.` })}>
            <Square size={14} /> 정지
          </Btn>
          <Btn lock={lock(kErr)} onClick={() => onAsk({ kind: kErr, label: commandName(bundle, kErr), args: {} })}>오류 해제</Btn>
        </div>
        {rf ? <BlockCard def={rf} snap={snap} link={st?.links?.["pc.rf"]} big={["fwd_w", "ref_w", "set_w"]} strip={pc} /> : <Missing what={blockName(bundle, "pc.rf", pc)} />}
        {targets.length > 0 && (
          <div className="grid grid-cols-2 gap-x-4">
            {targets.map((f) => <KV key={f.column} k={fieldName(bundle, f.column, pc)}><b className="tabular-nums">{short(snap?.[f.column])}</b> {f.unit}</KV>)}
          </div>
        )}
        <p className={`${FS.small} text-[#5B6470]`}>입력 칸 순서: {PC_FIELDS.map((f) => f.label).join(" · ")}</p>
      </div>
    </Card>
  );
}

// ───────────── TSP ─────────────
function nextDaily(hh: number, mm: number, nowMs: number): string {
  const kst = new Date(nowMs + 9 * 3600_000);
  const t = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate(), hh, mm) - 9 * 3600_000;
  return fmtKst(new Date(t > nowMs ? t : t + 86_400_000).toISOString());
}
const pad2 = (n: number) => String(n).padStart(2, "0");

export function TspPanel({ bundle, st, lock, onAsk, nowMs }: Common & { nowMs: number }) {
  const snap = st?.snapshot;
  const tsp = blockOf(bundle, "tsp"), ig = blockOf(bundle, "tsp.ig");
  const pv = (k: string) => paramValue(asChk(bundle), k);
  const en = pv("TSP_DAILY_ENABLE") === true;
  const hh = num(pv("TSP_DAILY_HH")), mm = num(pv("TSP_DAILY_MM")) ?? 0;
  const running = isRunning(bundle, chamberState(st, "tsp"));
  const [target, setTarget] = useState("");
  const [cycles, setCycles] = useState("");
  const [time, setTime] = useState(() => (hh !== null ? `${pad2(hh)}:${pad2(mm)}` : "05:00"));
  const tr: NumRange = { min: 0, max: 1, unit: "Torr", minExclusive: true };
  const cr = paramRange(bundle, "TSP_UI_DEFAULT_CYCLES", { int: true, unit: "회" });
  const ct = checkNum(target, tr), cc = checkNum(cycles, cr);
  const kStart = pickKind(bundle, KINDS.tspStart), kStop = pickKind(bundle, KINDS.tspStop), kSch = pickKind(bundle, KINDS.tspSchedule);
  const bad = ct.error ?? cc.error;
  const args: Record<string, unknown> = {};
  if (ct.value !== null) args.target = String(target.trim());
  if (cc.value !== null) args.cycles = cc.value;
  return (
    <Card title={<><Timer size={15} /> {placeName(bundle, "tsp")}</>}>
      <ProcLine bundle={bundle} st={st} ch="tsp" />
      <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <NumField label="목표 압력" value={target} onChange={setTarget} range={tr} placeholder={short(pv("TSP_UI_DEFAULT_TARGET"))}
            hint={`비우면 ${short(pv("TSP_UI_DEFAULT_TARGET"))} Torr(설정) · 예 5e-7`} />
          <NumField label="사이클 수" value={cycles} onChange={setCycles} range={cr} width="w-20" placeholder={short(pv("TSP_UI_DEFAULT_CYCLES"))}
            hint={`비우면 ${short(pv("TSP_UI_DEFAULT_CYCLES"))}회(설정)`} />
          <Btn size="lg" kind="dangerSolid" lock={lock(kStart) ?? bad ?? (running ? "실행 중" : null)}
            onClick={() => onAsk({ kind: kStart, label: "TSP 시작", red: true, args,
              lines: [`목표 ${args.target ?? `${short(pv("TSP_UI_DEFAULT_TARGET"))}(설정)`} Torr · 사이클 ${args.cycles ?? `${short(pv("TSP_UI_DEFAULT_CYCLES"))}(설정)`}회`] })}>
            <Play size={14} /> TSP 시작
          </Btn>
          <Btn size="lg" kind="danger" lock={lock(kStop)} onClick={() => onAsk({ kind: kStop, label: "TSP 정지", stop: true, note: "TSP 사이클을 멈춥니다." })}>
            <Square size={14} /> TSP 정지
          </Btn>
        </div>
        <div className="space-y-2 rounded-[10px] border border-[#E3E6EA] p-3">
          <p className={`${FS.body} text-[#1B1F24]`}>
            <b>매일 예약</b> · {en ? "켜짐" : "꺼짐"}{hh !== null && ` · ${pad2(hh)}:${pad2(mm)}`}
            {en && hh !== null && <span className="text-[#5B6470]"> · 다음 {nextDaily(hh, mm, nowMs)}</span>}
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <TimeField label="예약 시각" value={time} onChange={setTime} />
            <Btn kind="primary" lock={lock(kSch) ?? (isHHMM(time) ? null : "시각을 고르세요")}
              onClick={() => onAsk({ kind: kSch, label: "TSP 매일 예약 켜기", detail: time, args: { on: true, time }, lines: [`매일 ${time} 에 TSP 를 시작합니다`] })}>예약 켜기</Btn>
            <Btn lock={lock(kSch) ?? (en ? null : "예약이 꺼져 있음")}
              onClick={() => onAsk({ kind: kSch, label: "TSP 매일 예약 끄기", args: { on: false } })}>예약 끄기</Btn>
          </div>
          <p className={`${FS.small} text-[#5B6470]`}>켜짐 {short(pv("TSP_ON_SEC"))} s / 꺼짐 {short(pv("TSP_OFF_SEC"))} s. 바꾸기는 설정의 TSP 운전에서 합니다.</p>
        </div>
        <div className="grid grid-cols-1 gap-2">
          {tsp ? <BlockCard def={tsp} snap={snap} link={st?.links?.tsp} big={[]} /> : <Missing what={placeName(bundle, "tsp")} />}
          {ig && <BlockCard def={ig} snap={snap} link={st?.links?.["tsp.ig"]} big={["pressure_torr"]} strip={placeName(bundle, "tsp")} />}
        </div>
      </div>
    </Card>
  );
}

// ───────────── 프리스퍼터 예약 ─────────────
export function PresputterPanel({ bundle, st, lock, onAsk }: Common) {
  const kRes = pickKind(bundle, KINDS.preReserve), kCan = pickKind(bundle, KINDS.preCancel);
  return (
    <Card title={<><Wrench size={15} /> {CARD.presputter}</>} right={<span className={`${FS.small} text-[#5B6470]`}>챔버마다 매일 같은 시각</span>}>
      <div className="space-y-3">
        {(["ch1", "ch2"] as const).map((ch) => <PresputterRow key={ch} bundle={bundle} st={st} ch={ch} lock={lock} onAsk={onAsk} kRes={kRes} kCan={kCan} />)}
      </div>
    </Card>
  );
}

function PresputterRow({ bundle, st, ch, lock, onAsk, kRes, kCan }: Common & { ch: "ch1" | "ch2"; kRes: string; kCan: string }) {
  const pre = engineOf(st, ch)?.presputter as Record<string, unknown> | undefined;
  const [time, setTime] = useState(() => (typeof pre?.hhmm === "string" && isHHMM(pre.hhmm) ? pre.hhmm : "06:00"));
  const label = placeName(bundle, ch);
  const key = (k: string) => `${k}@${ch}`;
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-[10px] border border-[#E3E6EA] p-3">
      <div className="min-w-[10rem] flex-1">
        <p className={`${FS.body} font-semibold text-[#1B1F24]`}>{label}</p>
        <p className={`${FS.body} text-[#5B6470]`}>
          {pre ? <>{toTerms12(short(pre.status_text))} · 남은 <b className="tabular-nums text-[#133A7C]">{short(pre.left_text)}</b> · 레시피 {short(pre.recipe_display)}</> : "예약 상태 없음"}
        </p>
      </div>
      <TimeField label="시각(HH:MM)" value={time} onChange={setTime} />
      <Btn kind="primary" lock={lock(kRes, key(kRes)) ?? (isHHMM(time) ? null : "시각을 고르세요")}
        onClick={() => onAsk({ kind: kRes, key: key(kRes), label: `${label} 프리스퍼터 예약`, detail: time, args: chArgs(bundle, kRes, ch, { time }),
          lines: [`매일 ${time} 에 ${label} 프리스퍼터를 합니다. 그 시각에 공정 중이면 그날은 건너뜁니다.`] })}>예약</Btn>
      <Btn lock={lock(kCan, key(kCan))} onClick={() => onAsk({ kind: kCan, key: key(kCan), label: `${label} 프리스퍼터 예약 취소`, args: chArgs(bundle, kCan, ch) })}>
        <X size={14} /> 예약 취소
      </Btn>
    </div>
  );
}

// ───────────── 로봇 연결 ─────────────
type RobotWeb = { apiPort?: number | null; listening?: boolean; count?: number; last?: Record<string, unknown> | null; inflight?: Record<string, unknown>[] };
const RESULT_WORD: Record<string, string> = { success: "성공", fail: "실패", ok: "성공" };
/** 로봇 명령 이름 — 묶음 commands 'ROBOT_<명령>' label 에서 '로봇 ' 을 뺀 것('Loadlock 진공'), 모르는 명령은 '명령' */
const robotCmd = (b: Ch12Bundle | null, cmd: unknown) => {
  const k = `ROBOT_${String(cmd ?? "")}`;
  const n = commandName(b, k);
  return n === k ? "명령" : dropPrefix(n, "로봇");
};

/** 로봇 연결 — 장비 state.engines.robot(내부 명령 API: 받는 중·포트·처리한 명령 수·처리 중·마지막 명령). 값이 없으면 '보내지 않음' */
export function RobotPanel({ bundle, st, feed }: { bundle: Ch12Bundle | null; st: Ch12State | null; feed: FeedItem[] }) {
  const { detail } = useChk2Mode();
  const r = (st?.engines?.robot ?? null) as RobotWeb | null;
  const evs = useMemo(() => feed.filter((e) => {
    const c = (e.data as { context?: { source?: string } }).context;
    return e.type === "event" && (c?.source === "robot" || c?.source === "robot_server" || c?.source === "robot_api");
  }).slice(-5).reverse(), [feed]);
  const last = r?.last ?? null;
  const infl = r?.inflight ?? [];
  return (
    <Card title={<><Bot size={15} /> {CARD.robot}</>}>
      {r ? (
        <div className="space-y-0.5">
          <StateTag on={!!r.listening} label="로봇 명령 받기" />
          {detail && <KV k="내부 명령 포트"><span className="font-mono">{r.apiPort ?? "—"}</span></KV>}
          <KV k="처리한 명령"><b className="tabular-nums">{r.count ?? 0}</b>건</KV>
          <KV k="처리 중">{infl.length ? `${infl.length}건 · ${infl.map((x) => robotCmd(bundle, x.cmd)).join(", ")}` : "없음"}</KV>
          <KV k="마지막 명령">
            {last ? <>{robotCmd(bundle, last.cmd)} · {typeof last.at === "string" ? fmtKst(last.at).slice(-8) : "—"} · {RESULT_WORD[String(last.result)] ?? (detail ? String(last.result ?? "—") : "—")}
              {detail && last.errorCode ? <Chip tone="warn" className="ml-1">{String(last.errorCode)}</Chip> : null}</> : "아직 없음"}
          </KV>
          {detail && typeof last?.peer === "string" && <KV k="보낸 곳"><span className="font-mono">{String(last.peer)}</span></KV>}
        </div>
      ) : <Empty>장비가 로봇 연결 상태를 보내지 않습니다</Empty>}
      {evs.length > 0 && (
        <ul className="mt-2 space-y-0.5 border-t border-[#E3E6EA] pt-2">
          {evs.map((e) => { const l = ch12LogLine(bundle, e); return (
            <li key={e.id} className={`truncate ${FS.small} ${l.level === "info" ? "text-[#5B6470]" : "text-[#B54708]"}`}>
              <span className="tabular-nums text-[#8A929D]">{fmtKst(e.ts).slice(-8)}</span> {l.source} · {l.kind}{l.text ? ` · ${l.text}` : ""}
            </li>
          ); })}
        </ul>
      )}
    </Card>
  );
}

// ───────────── 장비 공통 조작 ─────────────
/** Power Select(PLC SW_POWER_SELECT 출력)·런타임 덤프 — 확인창 + 사유(선택) */
export function CommonOps({ bundle, st, lock, onAsk, plcOk }: Common & { plcOk: boolean }) {
  const [reason, setReason] = useState("");
  const kPs = pickKind(bundle, KINDS.powerSelect), kDump = pickKind(bundle, KINDS.dump);
  const ps = plcOk ? st?.snapshot?.["plc.sw_power_select"] === true : null;
  const why = reason.trim();
  return (
    <Card title={CARD.common}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`${FS.body} font-semibold text-[#1B1F24]`}>{buttonName(bundle, "sw_power_select")}</span>
          <StateBadge on={ps} />
          <Btn lock={lock(kPs)} onClick={() => onAsk({ kind: kPs, label: "Power Select 켜기", args: { on: true },
            note: "Power Select 출력을 켭니다. DC Pulse 사용 중이면 RF Select 는 켜지 않습니다." })}>켜기</Btn>
          <Btn lock={lock(kPs)} onClick={() => onAsk({ kind: kPs, label: "Power Select 끄기", args: { on: false },
            note: "Power Select 출력을 끕니다." })}>끄기</Btn>
        </div>
        <div className="flex flex-wrap items-end gap-2 border-t border-[#E3E6EA] pt-3">
          <TextField label="런타임 덤프 사유(선택)" value={reason} onChange={setReason} placeholder="예: 화면 멈춤 확인" />
          <Btn lock={lock(kDump)} onClick={() => onAsk({ kind: kDump, label: "런타임 덤프", args: why ? { reason: why } : {},
            lines: [why ? `사유: ${why}` : "사유 없음(수동 버튼)"], note: "장비 기록 폴더에 지금 상태·스레드 목록을 남깁니다(동시에 1개)." })}>런타임 덤프</Btn>
        </div>
      </div>
    </Card>
  );
}
