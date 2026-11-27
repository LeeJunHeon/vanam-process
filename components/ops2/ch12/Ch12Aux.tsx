"use client";

// 챔버12 공통 박스(W-20 — 챔버K W-20 장비 박스 틀 DevCard 를 그대로 가져다 씀): 운전 탭 = Plasma Cleaning · TSP · 프리스퍼터 예약,
// 상태 탭 = 로봇 연결 · 장비 공통 조작(T). Loadlock 은 Ch12Devices, 노트북 레시피 파일은 Ch12LocalFiles, 장비 응답 시간은 Ch12Timing — 같은 틀.
// 틀: 머리(제목 + 칩) → 큰 값 또는 요약 한 줄 → 라벨-값 줄 → 상태 → 안내 → 맨 아래 버튼 줄(위에 구분선, 버튼 없으면 줄 없음).
// 입력은 작업자 말로(이름·단위·범위 — 범위는 묶음 파라미터·장비 판단과 같은 값, 범위 밖이면 보내기 전에 막음), 명령 인자를 그대로 그리지 않는다.
// 조작은 확인창 → 명령(잠금 = 부르는 쪽 lock — 권한·bench·끊김·결과 기다림·PLC 값 오래됨, 챔버K 와 같은 순서·문구). 마지막 판단은 장비.
// 명령 종류·인자·잠금·확인창 문구는 W-19 칸 그대로(틀만 바꿈). 값은 1초 행 블록(묶음 snapshot — pc.rf·tsp·tsp.ig)과 엔진 상태(state.engines).
import { useMemo, useState } from "react";
import { Play, Square, X } from "lucide-react";
import { FS, Btn, Chip, Empty, FieldValue, KV, QBadge, type Ask } from "../chk/kit";
import { DevCard } from "../chk/Chk2Devices";
import { StateBadge, StateTag } from "../chk/StateTag";
import { paramValue } from "../chk/logic";
import { useChk2Mode } from "../chk/mode";
import type { FeedItem } from "../chk/useChk2";
import { fmtKst } from "@/lib/ops2/time";
import { Big12, RfUncmdChip, blockOf, rfShownState, viewDef } from "./Ch12Devices";
import { NumField, TextField, TimeField } from "./Ch12Inputs";
import { ch12LogLine } from "./Ch12Logs";
import {
  KINDS, chArgs, chamberState, checkNum, clockOrDash, engineOf, isHHMM, isRunning, paramRange, pickKind, short, stateInfo,
  type NumRange,
} from "./logic";
import { asChk, type Ch12Bundle, type Ch12State, type ChamberId } from "./types";
import { CARD, buttonName, commandName, dropPrefix, fieldName, ownerName, placeName, toTerms12 } from "@/lib/ops2/ch12/terms";
import type { RecipeItem as RecipeSummary } from "../chk/useRecipes";
import { PC_FIELDS, pcRowLine } from "@/lib/ops2/ch12/pc";

export type LockFn = (kind: string, key?: string) => string | null;
type Common = { bundle: Ch12Bundle | null; st: Ch12State | null; lock: LockFn; onAsk: (a: Ask) => void };

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

function Missing({ what }: { what: string }) {
  return <p className={`rounded-[10px] bg-[#F5F6F8] px-3 py-2 ${FS.small} text-[#5B6470]`}>{what}: 장비가 아직 이 값을 보내지 않습니다.</p>;
}

/** 진행 상태 칩(PC·TSP) — 대기면 없음, 아니면 상태 이름 */
function ProcChip({ bundle, st, ch }: { bundle: Ch12Bundle | null; st: Ch12State | null; ch: ChamberId }) {
  const cs = chamberState(st, ch);
  const idle = !cs?.procState || /^idle$/i.test(cs.procState);
  const n = (cs?.alarms ?? []).length;
  return <>{!idle && <Chip tone="dark">{stateInfo(bundle, cs?.procState, ch).label}</Chip>}{n > 0 && <Chip tone="alarm">알람 {n}</Chip>}</>;
}

/** 진행 줄(PC·TSP) — 상태·소유자·단계·남은 시간·공정 끝까지(줄을 바꿔 가며 — 자르지 않음) */
function ProcLine({ bundle, st, ch }: { bundle: Ch12Bundle | null; st: Ch12State | null; ch: ChamberId }) {
  const cs = chamberState(st, ch);
  const info = stateInfo(bundle, cs?.procState, ch);
  const { detail } = useChk2Mode();
  const idle = !cs?.procState || /^idle$/i.test(cs.procState);
  return (
    <p className={`flex flex-wrap items-baseline gap-x-3 gap-y-0.5 ${FS.body}`}>
      <b className={idle ? "text-[#5B6470]" : "text-[#1B1F24]"}>{idle ? "대기" : info.label}</b>
      {cs?.owner && <span className="text-[#5B6470]">{ownerName(bundle, cs.owner)}</span>}
      {cs?.step && <span className="text-[#5B6470]">{cs.step.label ? toTerms12(cs.step.label) : cs.step.type ? "단계" : ""}{cs.step.no != null && ` ${cs.step.no}/${cs.step.total ?? "-"}`}</span>}
      {!idle && <span className="tabular-nums">남은 <b className="text-[#133A7C]">{clockOrDash(cs?.remainS ?? cs?.step?.remainS)}</b></span>}
      {!idle && <span className="tabular-nums">공정 끝까지 <b className="text-[#133A7C]">{clockOrDash(cs?.etaRemainingS)}</b></span>}
      {detail && cs?.runId && <span className={`font-mono ${FS.small} text-[#8A929D]`}>run {cs.runId}</span>}
    </p>
  );
}

/** 블록 필드 줄(이름 = 묶음, 앞말 뺌) — 박스 안 라벨-값 줄 */
function BlockRows({ bundle, st, name, strip, skip = [] }: { bundle: Ch12Bundle | null; st: Ch12State | null; name: string; strip: string; skip?: string[] }) {
  const { detail } = useChk2Mode();
  const d0 = blockOf(bundle, name);
  if (!d0) return null;
  const d = viewDef(d0, detail, strip);
  const snap = st?.snapshot;
  const off = st?.links?.[name]?.q === "off";
  return <>
    {d.fields.filter((f) => (detail || !f.detail) && !skip.includes(f.name)).map((f) => (f.type === "bool"
      ? <StateTag key={f.column} on={off ? null : snap?.[f.column] === true} label={f.label} />
      : <FieldValue key={f.column} f={f} v={snap?.[f.column]} dim={off} snap={snap} blocks={bundle?.snapshot?.blocks} />))}
  </>;
}

// ───────────── 플라즈마 클리닝 ─────────────
/** Plasma Cleaning — 큰 값 RF Forward, 줄 = 진행·RF 값·공정 목표, 채널·레시피 고르기, 버튼 줄 = 시작 · 정지 · 오류 해제 */
export function PcPanel({ bundle, st, lock, onAsk, recipes, getRecipe }: Common & {
  recipes: RecipeSummary[] | null;                               // 웹 저장 PC 레시피(kind pc) — 노트북 화면은 null(장비 폴더 '파일 고르기')
  getRecipe?: (id: string) => Promise<Record<string, unknown> | null>;
}) {
  const { detail } = useChk2Mode();
  const snap = st?.snapshot;
  const rf0 = blockOf(bundle, "pc.rf");
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
  const rf = rf0 ? viewDef(rf0, detail, pc) : undefined;
  const shown = rfShownState(st, "pc.rf", detail);                // W-21·22 B — RF 꺼짐이면 Forward·Reflected 0 W(평소 보기)
  return (
    <DevCard title={pc} sub={detail ? rf0?.desc : undefined}
      chip={<><ProcChip bundle={bundle} st={st} ch="pc" /><RfUncmdChip snap={snap} block="pc.rf" /><QBadge link={st?.links?.["pc.rf"]} /></>}
      big={rf && <Big12 f={rf.fields.find((f) => f.name === "fwd_w")} snap={shown?.snapshot} bundle={bundle} off={st?.links?.["pc.rf"]?.q === "off"} />}
      note={<>
        {!recipes && <p>{`레시피는 아래 '${CARD.localFiles}'에서 CSV 를 골라 불러옵니다.`}</p>}
        <p>입력 칸 순서: {PC_FIELDS.map((f) => f.label).join(" · ")}</p>
      </>}
      actions={<>
        <Btn size="lg" kind="primary" lock={lock(kStart) ?? (running ? "실행 중" : null)}
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
      </>}>
      <ProcLine bundle={bundle} st={st} ch="pc" />
      {rf0 ? <BlockRows bundle={bundle} st={shown} name="pc.rf" strip={pc} skip={["fwd_w", "uncommanded"]} /> : <Missing what={pc} />}
      {targets.length > 0 && (
        <div className="mt-1 border-t border-[#E3E6EA] pt-1">
          {targets.map((f) => <KV key={f.column} k={fieldName(bundle, f.column, pc)}><b className="tabular-nums">{short(snap?.[f.column])}</b> {f.unit}</KV>)}
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <span className={`flex flex-col gap-1 ${FS.small} text-[#5B6470]`}>
          <span className="font-semibold text-[#1B1F24]">채널</span>
          <span className="flex gap-1" role="radiogroup" aria-label={`${pc} 채널`}>
            {([1, 2] as const).map((n) => (
              <Btn key={n} kind={chSel === n ? "primary" : "neutral"} onClick={() => setChSel(n)} ariaLabel={`CH${n}`}>CH{n}</Btn>
            ))}
          </span>
        </span>
        <Btn lock={lock(kSel) ?? (running ? "실행 중에는 채널을 바꾸지 않음" : null)}
          onClick={() => onAsk({ kind: kSel, label: "채널 선택", detail: `CH${chSel}`, args: { ch: chSel } })}>채널 선택</Btn>
      </div>
      {recipes && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
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
      {row && <p className={`mt-1 ${FS.body} text-[#1B1F24]`}>{pcRowLine(row)}</p>}
    </DevCard>
  );
}

// ───────────── TSP ─────────────
function nextDaily(hh: number, mm: number, nowMs: number): string {
  const kst = new Date(nowMs + 9 * 3600_000);
  const t = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate(), hh, mm) - 9 * 3600_000;
  return fmtKst(new Date(t > nowMs ? t : t + 86_400_000).toISOString());
}
const pad2 = (n: number) => String(n).padStart(2, "0");

/** TSP — 큰 값 TSP Ion Gauge 압력, 줄 = 진행·TSP 상태, 목표 압력·사이클 칸, 매일 예약, 버튼 줄 = TSP 시작 · TSP 정지 */
export function TspPanel({ bundle, st, lock, onAsk, nowMs }: Common & { nowMs: number }) {
  const { detail, local } = useChk2Mode();   // local — 노트북 화면에는 설정 탭이 없어 안내 글이 '웹 화면 설정 탭'(T)
  const snap = st?.snapshot;
  const tsp = blockOf(bundle, "tsp"), ig0 = blockOf(bundle, "tsp.ig");
  const name = placeName(bundle, "tsp");
  const ig = ig0 ? viewDef(ig0, detail, name) : undefined;
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
    <DevCard title={name} sub={detail ? tsp?.desc : undefined}
      chip={<><ProcChip bundle={bundle} st={st} ch="tsp" /><QBadge link={st?.links?.tsp} /></>}
      big={ig && <Big12 f={ig.fields.find((f) => f.name === "pressure_torr")} snap={snap} bundle={bundle} off={st?.links?.["tsp.ig"]?.q === "off"} />}
      note={<p>켜짐 {short(pv("TSP_ON_SEC"))} s / 꺼짐 {short(pv("TSP_OFF_SEC"))} s. 바꾸기는 {local ? "웹 화면 " : ""}설정 탭의 TSP 운전에서 합니다.</p>}
      actions={<>
        <Btn size="lg" kind="primary" lock={lock(kStart) ?? bad ?? (running ? "실행 중" : null)}
          onClick={() => onAsk({ kind: kStart, label: "TSP 시작", red: true, args,
            lines: [`목표 ${args.target ?? `${short(pv("TSP_UI_DEFAULT_TARGET"))}(설정)`} Torr · 사이클 ${args.cycles ?? `${short(pv("TSP_UI_DEFAULT_CYCLES"))}(설정)`}회`] })}>
          <Play size={14} /> TSP 시작
        </Btn>
        <Btn size="lg" kind="danger" lock={lock(kStop)} onClick={() => onAsk({ kind: kStop, label: "TSP 정지", stop: true, note: "TSP 사이클을 멈춥니다." })}>
          <Square size={14} /> TSP 정지
        </Btn>
      </>}>
      <ProcLine bundle={bundle} st={st} ch="tsp" />
      {tsp ? <BlockRows bundle={bundle} st={st} name="tsp" strip={name} /> : <Missing what={name} />}
      {ig0 && <BlockRows bundle={bundle} st={st} name="tsp.ig" strip={name} skip={["pressure_torr"]} />}
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <NumField label="목표 압력" value={target} onChange={setTarget} range={tr} placeholder={short(pv("TSP_UI_DEFAULT_TARGET"))}
          hint={`비우면 ${short(pv("TSP_UI_DEFAULT_TARGET"))} Torr(설정) · 예 5e-7`} />
        <NumField label="사이클 수" value={cycles} onChange={setCycles} range={cr} width="w-20" placeholder={short(pv("TSP_UI_DEFAULT_CYCLES"))}
          hint={`비우면 ${short(pv("TSP_UI_DEFAULT_CYCLES"))}회(설정)`} />
      </div>
      <div className="mt-3 space-y-2 border-t border-[#E3E6EA] pt-2">
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
      </div>
    </DevCard>
  );
}

// ───────────── 프리스퍼터 예약 ─────────────
/** 프리스퍼터 예약 — 챔버마다 한 줄(상태·남은 시간·레시피, 시각 칸, 예약 · 예약 취소) */
export function PresputterPanel({ bundle, st, lock, onAsk }: Common) {
  const kRes = pickKind(bundle, KINDS.preReserve), kCan = pickKind(bundle, KINDS.preCancel);
  return (
    <DevCard title={CARD.presputter} note={<p>챔버마다 매일 같은 시각에 합니다. 그 시각에 공정 중이면 그날은 건너뜁니다.</p>}>
      <div className="space-y-3">
        {(["ch1", "ch2"] as const).map((ch) => <PresputterRow key={ch} bundle={bundle} st={st} ch={ch} lock={lock} onAsk={onAsk} kRes={kRes} kCan={kCan} />)}
      </div>
    </DevCard>
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
    <DevCard title={CARD.robot}>
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
            <li key={e.id} className={`${FS.small} leading-snug ${l.level === "info" ? "text-[#5B6470]" : "text-[#B54708]"}`}>
              <span className="tabular-nums text-[#8A929D]">{fmtKst(e.ts).slice(-8)}</span> {l.source} · {l.kind}{l.text ? ` · ${l.text}` : ""}
            </li>
          ); })}
        </ul>
      )}
    </DevCard>
  );
}

// ───────────── 장비 공통 조작 ─────────────
/** Power Select(PLC SW_POWER_SELECT 출력)·런타임 덤프 — 확인창 + 사유(선택). 버튼 줄 = 런타임 덤프 */
export function CommonOps({ bundle, st, lock, onAsk, plcOk }: Common & { plcOk: boolean }) {
  const [reason, setReason] = useState("");
  const kPs = pickKind(bundle, KINDS.powerSelect), kDump = pickKind(bundle, KINDS.dump);
  const ps = plcOk ? st?.snapshot?.["plc.sw_power_select"] === true : null;
  const why = reason.trim();
  return (
    <DevCard title={CARD.common} chip={<QBadge link={st?.links?.plc} />}
      note={<p>런타임 덤프는 장비 기록 폴더에 지금 상태·스레드 목록을 남깁니다(동시에 1개).</p>}
      actions={<Btn lock={lock(kDump)} onClick={() => onAsk({ kind: kDump, label: "런타임 덤프", args: why ? { reason: why } : {},
        lines: [why ? `사유: ${why}` : "사유 없음(수동 버튼)"], note: "장비 기록 폴더에 지금 상태·스레드 목록을 남깁니다(동시에 1개)." })}>런타임 덤프</Btn>}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`${FS.body} font-semibold text-[#1B1F24]`}>{buttonName(bundle, "sw_power_select")}</span>
        <StateBadge on={ps} />
        <Btn lock={lock(kPs)} onClick={() => onAsk({ kind: kPs, label: "Power Select 켜기", args: { on: true },
          note: "Power Select 출력을 켭니다. DC Pulse 사용 중이면 RF Select 는 켜지 않습니다." })}>켜기</Btn>
        <Btn lock={lock(kPs)} onClick={() => onAsk({ kind: kPs, label: "Power Select 끄기", args: { on: false },
          note: "Power Select 출력을 끕니다." })}>끄기</Btn>
      </div>
      <div className="mt-3 border-t border-[#E3E6EA] pt-3">
        <TextField label="런타임 덤프 사유(선택)" value={reason} onChange={setReason} placeholder="예: 화면 멈춤 확인" />
      </div>
    </DevCard>
  );
}
