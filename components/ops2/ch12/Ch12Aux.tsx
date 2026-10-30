"use client";

// 챔버12 공유·보조 칸 — CH2 히터·두께(1초 행 ch2.heater·ch2.thk·ch2.stm100 블록 + 히터 엔진 state.heater), 플라즈마 클리닝(pc.proc·
// pc.rf·pc.set), TSP(tsp·tsp.ig·tsp.proc + 매일 예약 TSP_DAILY_*), 로봇 연결 상태(state.robot 또는 엔진 robot — 없으면 로봇 사건).
// 블록이 묶음에 없으면(장비가 아직 그 열을 내지 않음) 그 카드만 안내 줄. 조작 버튼은 묶음 명령 정의가 있을 때만(CmdForm).
import { Bot, Flame, Layers3, Sparkles, Timer } from "lucide-react";
import { BlockCard } from "../chk/Chk2Cards";
import { Card, type Ask } from "../chk/kit";
import { paramValue } from "../chk/logic";
import { useChk2Mode } from "../chk/mode";
import type { FeedItem } from "../chk/useChk2";
import { logLine } from "../chk/text";
import { fmtKst } from "@/lib/ops2/time";
import { CmdForm } from "./Ch12Controls";
import { KINDS, chamberState, clockOrDash, hasKind, pickKind, short, stateInfo } from "./logic";
import { OWNER_LABEL, asChk, type Ch12Bundle, type Ch12State, type ChamberId } from "./types";

type Common = { bundle: Ch12Bundle | null; st: Ch12State | null; can: (kind: string) => boolean; onAsk: (a: Ask) => void };

const blockOf = (b: Ch12Bundle | null, name: string) => b?.snapshot?.blocks?.find((x) => x.name === name);

function Missing({ what }: { what: string }) {
  return <p className="rounded-lg bg-gray-50 px-2 py-1.5 text-[11px] text-gray-400">{what} — 장비가 아직 이 값을 보내지 않습니다</p>;
}

/** 진행 줄 — 상태·소유자·블록(단계)·남은 시간·ETA */
function ProcLine({ bundle, st, ch }: { bundle: Ch12Bundle | null; st: Ch12State | null; ch: ChamberId }) {
  const cs = chamberState(st, ch);
  const info = stateInfo(bundle, cs?.procState, ch);
  const { detail } = useChk2Mode();
  const idle = !cs?.procState || /^idle$/i.test(cs.procState);
  return (
    <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-xl bg-gray-50 px-2.5 py-1.5 text-xs">
      <b className={idle ? "text-gray-500" : "text-blue-700"}>{idle ? "대기" : info.label}</b>
      {cs?.owner && <span className="text-gray-500">소유 {OWNER_LABEL[cs.owner] ?? cs.owner}</span>}
      {cs?.step && <span className="text-gray-600">{cs.step.label ?? cs.step.type ?? ""} {cs.step.no != null && `(${cs.step.no}/${cs.step.total ?? "-"})`}</span>}
      {!idle && <span className="tabular-nums text-gray-700">남은 {clockOrDash(cs?.remainS ?? cs?.step?.remainS)}</span>}
      {!idle && <span className="tabular-nums text-gray-700">ETA {clockOrDash(cs?.etaRemainingS)}</span>}
      {detail && cs?.runId && <span className="font-mono text-[10px] text-gray-400">run {cs.runId}</span>}
    </div>
  );
}

/** CH2 히터·두께 */
export function HeaterThicknessPanel({ bundle, st, can, onAsk, plcOk }: Common & { plcOk: boolean }) {
  const { detail } = useChk2Mode();
  const snap = st?.snapshot;
  const heat = blockOf(bundle, "ch2.heater");
  const thk = blockOf(bundle, "ch2.thk");
  const stm = blockOf(bundle, "ch2.stm100");
  const he = st?.heater ?? {};
  const heEntries = Object.entries(he).filter(([, v]) => v !== null && v !== undefined && typeof v !== "object");
  const supports = bundle?.chambers?.find((c) => c.id === "ch2")?.supports;
  const heaterRun = snap?.["ch2.heater.run"] === true;
  const ctl = (k: readonly string[], label: string, extra: Partial<Parameters<typeof CmdForm>[0]> = {}) =>
    hasKind(bundle, k) ? <CmdForm bundle={bundle} kind={pickKind(bundle, k)} chamber="ch2" label={label} can={can} onAsk={onAsk} {...extra} /> : null;
  return (
    <Card title={<><Flame size={15} /> CH2 히터·두께</>}
      right={supports && <span className="text-[10px] text-gray-400">히터 {supports.heater ? "사용" : "꺼짐"} · 두께 모니터 {supports.thickness ? "사용" : "꺼짐"}</span>}>
      <div className="space-y-2">
        {heat ? (
          <BlockCard def={heat} snap={snap} link={st?.links?.["ch2.heater"]} big={["pv", "sv", "mv_pct"]} />
        ) : <Missing what="히터 1초 값(ch2.heater)" />}
        {heEntries.length > 0 && (
          <div className="grid grid-cols-2 gap-x-4 rounded-xl border border-gray-100 px-2.5 py-1.5 sm:grid-cols-3">
            {heEntries.filter(([k]) => detail || !k.startsWith("_")).slice(0, detail ? 60 : 12).map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-2 py-0.5 text-[11px]">
                <span className="truncate text-gray-400">{k}</span><span className="font-semibold tabular-nums text-gray-800">{short(v)}</span>
              </div>
            ))}
          </div>
        )}
        {(hasKind(bundle, KINDS.heaterOnOff) || hasKind(bundle, KINDS.heaterApply)) && (
          <div className="space-y-1.5 rounded-xl border border-gray-100 p-2">
            <p className="text-[11px] font-semibold text-gray-500">히터 조작(v1 히터 패널과 같게 — ON/OFF 는 RUN 이면 끄기, 아니면 목표 검사 뒤 켜기)</p>
            {ctl(KINDS.heaterOnOff, heaterRun ? "히터 끄기" : "히터 켜기", { red: !heaterRun, stop: heaterRun })}
            {ctl(KINDS.heaterApply, "목표 적용")}
            <div className="flex flex-wrap gap-2">
              {ctl(KINDS.heaterReset, "이상 리셋", { note: "히터 이상 표시를 지웁니다(RUN 이면 장비가 거부)." })}
              {ctl(KINDS.thkZero, "두께 영점", { note: "두께 모니터 영점을 맞춥니다(공정 중이면 장비가 거부)." })}
            </div>
            {!plcOk && <p className="text-[10px] text-rose-600">PLC 값이 오래됨 — 히터 조작은 장비가 거부할 수 있습니다</p>}
          </div>
        )}
        {thk ? (
          <BlockCard def={thk} snap={snap} link={st?.links?.["ch2.thk"]} big={["eff_nm", "target_nm", "remaining_nm", "pct"]} />
        ) : <Missing what="두께 판정(ch2.thk)" />}
        {stm && <BlockCard def={stm} snap={snap} link={st?.links?.["ch2.stm100"]} big={["thickness_nm", "rate_nm_s"]} foldable />}
      </div>
    </Card>
  );
}

/** 플라즈마 클리닝 */
export function PcPanel({ bundle, st, can, onAsk }: Common) {
  const snap = st?.snapshot;
  const rf = blockOf(bundle, "pc.rf");
  const targets = (bundle?.snapshot?.process ?? []).filter((f) => f.column.startsWith("pc.set.") && snap?.[f.column] != null);
  return (
    <Card title={<><Sparkles size={15} /> 플라즈마 클리닝</>}>
      <ProcLine bundle={bundle} st={st} ch="pc" />
      {rf ? <BlockCard def={rf} snap={snap} link={st?.links?.["pc.rf"]} big={["fwd_w", "ref_w", "set_w"]} /> : <Missing what="PC RF(pc.rf)" />}
      {targets.length > 0 && (
        <div className="mt-2 grid grid-cols-2 gap-x-4 text-[11px]">
          {targets.map((f) => (
            <div key={f.column} className="flex justify-between gap-2"><span className="text-gray-400">{f.label.replace("플라즈마 클리닝 ", "")}</span>
              <b className="tabular-nums">{short(snap?.[f.column])} {f.unit}</b></div>
          ))}
        </div>
      )}
      <div className="mt-2 space-y-1.5">
        <CmdForm bundle={bundle} kind={pickKind(bundle, KINDS.pcSelect)} label="채널 선택" can={can} onAsk={onAsk} />
        <CmdForm bundle={bundle} kind={pickKind(bundle, KINDS.pcStart)} label="클리닝 시작" can={can} onAsk={onAsk} red hide={["path"]} />
        <div className="flex flex-wrap gap-2">
          <CmdForm bundle={bundle} kind={pickKind(bundle, KINDS.pcStop)} label="클리닝 정지" can={can} onAsk={onAsk} stop
            note="플라즈마 클리닝을 멈춥니다(RF 끄기·쿨다운은 장비 순서대로)." />
          <CmdForm bundle={bundle} kind={pickKind(bundle, KINDS.pcErrClear)} label="오류 해제" can={can} onAsk={onAsk} />
        </div>
        {!hasKind(bundle, KINDS.pcStart) && <p className="text-[10px] text-gray-400">시작·정지 명령은 장비 명령 표가 내면 나타납니다(로봇 START_PLASMA_CLEANING 은 그대로).</p>}
      </div>
    </Card>
  );
}

/** 다음 매일 예약 시각(KST 장비 노트북 시계 기준 — 장비가 정한다, 웹은 보여 주기만) */
function nextDaily(hh: number, mm: number, nowMs: number): string {
  const kst = new Date(nowMs + 9 * 3600_000);
  const t = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate(), hh, mm) - 9 * 3600_000;
  const next = t > nowMs ? t : t + 86_400_000;
  return fmtKst(new Date(next).toISOString());
}

/** TSP(+ 매일 예약) */
export function TspPanel({ bundle, st, can, onAsk, nowMs }: Common & { nowMs: number }) {
  const snap = st?.snapshot;
  const tsp = blockOf(bundle, "tsp");
  const ig = blockOf(bundle, "tsp.ig");
  const pv = (k: string) => paramValue(asChk(bundle), k);
  const en = pv("TSP_DAILY_ENABLE") === true;
  const hh = typeof pv("TSP_DAILY_HH") === "number" ? (pv("TSP_DAILY_HH") as number) : null;
  const mm = typeof pv("TSP_DAILY_MM") === "number" ? (pv("TSP_DAILY_MM") as number) : 0;
  const sched = st?.engines?.tsp as Record<string, unknown> | undefined;
  return (
    <Card title={<><Timer size={15} /> TSP</>}>
      <ProcLine bundle={bundle} st={st} ch="tsp" />
      <p className="mb-2 rounded-lg bg-blue-50/60 px-2 py-1 text-[11px] text-gray-700">
        매일 예약: <b>{hh === null ? "설정 없음" : `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`}</b>
        {" · "}{en ? <span className="font-semibold text-emerald-700">켬</span> : <span className="text-gray-500">끔</span>}
        {en && hh !== null && <> · 다음 {nextDaily(hh, mm, nowMs)}</>}
        {typeof sched?.next_at === "string" && <> · 장비 예약 {fmtKst(sched.next_at)}</>}
        <span className="block text-[10px] text-gray-400">사이클 {short(pv("TSP_UI_DEFAULT_CYCLES"))}회 · 목표 {short(pv("TSP_UI_DEFAULT_TARGET"))} Torr · ON {short(pv("TSP_ON_SEC"))} s / OFF {short(pv("TSP_OFF_SEC"))} s — 바꾸기는 설정(TSP 운전)에서</span>
      </p>
      <div className="grid grid-cols-1 gap-2">
        {tsp ? <BlockCard def={tsp} snap={snap} link={st?.links?.tsp} big={[]} /> : <Missing what="TSP(tsp)" />}
        {ig && <BlockCard def={ig} snap={snap} link={st?.links?.["tsp.ig"]} big={["pressure_torr"]} />}
      </div>
      <div className="mt-2 space-y-1.5">
        <CmdForm bundle={bundle} kind={pickKind(bundle, KINDS.tspStart)} label="TSP 시작" can={can} onAsk={onAsk} red />
        <CmdForm bundle={bundle} kind={pickKind(bundle, KINDS.tspStop)} label="TSP 정지" can={can} onAsk={onAsk} stop note="TSP 사이클을 멈춥니다." />
        <CmdForm bundle={bundle} kind={pickKind(bundle, KINDS.tspSchedule)} label="예약 바꾸기" can={can} onAsk={onAsk} />
      </div>
    </Card>
  );
}

/** 로봇 연결 상태 */
export function RobotPanel({ bundle, st, feed }: { bundle: Ch12Bundle | null; st: Ch12State | null; feed: FeedItem[] }) {
  const { detail } = useChk2Mode();
  const r = (st?.robot ?? (st?.engines?.robot as Record<string, unknown> | undefined) ?? null) as Record<string, unknown> | null;
  const evs = feed.filter((e) => {
    const c = (e.data as { context?: { source?: string } }).context;
    return e.type === "event" && (c?.source === "robot" || c?.source === "robot_server");
  }).slice(-5).reverse();
  const conn = r?.connected;
  return (
    <Card title={<><Bot size={15} /> 로봇 연결</>}>
      {r ? (
        <div className="space-y-1 text-xs">
          <p className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${conn === true ? "bg-emerald-500" : conn === false ? "bg-rose-500" : "bg-gray-300"}`} />
            <b>{conn === true ? "로봇 연결됨" : conn === false ? "로봇 연결 없음" : "모름"}</b>
            {typeof r.peer === "string" && <span className="font-mono text-[11px] text-gray-500">{r.peer}</span>}
          </p>
          {typeof r.lastCmd === "string" && <p className="text-[11px] text-gray-600">마지막 명령 {r.lastCmd}{typeof r.lastAt === "string" && ` · ${fmtKst(r.lastAt)}`}</p>}
          {detail && <pre className="max-h-32 overflow-auto rounded bg-gray-50 p-1 text-[10px] text-gray-500">{JSON.stringify(r, null, 1)}</pre>}
        </div>
      ) : (
        <p className="text-[11px] text-gray-400">장비가 로봇 연결 상태를 아직 보내지 않습니다(로봇 서버 v2/robot_server — 0.0.0.0:50070).</p>
      )}
      {evs.length > 0 && (
        <ul className="mt-2 space-y-0.5 border-t border-gray-50 pt-1.5">
          {evs.map((e) => { const l = logLine(asChk(bundle), e); return (
            <li key={e.id} className="truncate text-[11px] text-gray-600"><span className="text-gray-300">{fmtKst(e.ts).slice(6)}</span> {l.kind} {l.text}</li>
          ); })}
        </ul>
      )}
    </Card>
  );
}

/** 로드락(공유) — PLC 열만 보기 */
export function LoadLockPanel({ bundle, st, plcOk, can, onAsk }: {
  bundle: Ch12Bundle | null; st: Ch12State | null; plcOk: boolean; can: (kind: string) => boolean; onAsk: (a: Ask) => void;
}) {
  const snap = st?.snapshot;
  const plc = blockOf(bundle, "plc");
  const want = ["l_r_p_sw", "l_r_v_sw", "l_vent_sw", "l_pin_up_lamp", "l_pin_down_lamp", "l_atm", "l_atm_sensor", "l_vac_ready_sw",
    "l_vac_not_ready", "l_gauge_a", "buzzer_stop_sw"];
  const fields = (plc?.fields ?? []).filter((f) => want.includes(f.name));
  return (
    <Card title={<><Layers3 size={15} /> 로드락·공통 PLC</>} right={<span className="text-[10px] text-gray-400">PLC {plcOk ? "정상" : "값 오래됨"}</span>}>
      {fields.length ? (
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {fields.map((f) => (
            <span key={f.column} className="flex items-center gap-1.5 text-xs text-gray-600">
              <span className={`inline-block h-2.5 w-2.5 rounded-full border ${!plcOk ? "border-gray-300 bg-gray-200"
                : snap?.[f.column] === true ? "border-green-600 bg-green-500" : "border-gray-300 bg-white"}`} />{f.label}
            </span>
          ))}
        </div>
      ) : <Missing what="PLC(plc)" />}
      <div className="mt-2 space-y-1.5 border-t border-gray-50 pt-2">
        <CmdForm bundle={bundle} kind={pickKind(bundle, KINDS.powerSelect)} label="Power Select 보내기" can={can} onAsk={onAsk}
          note="정말 하시겠습니까? SW_POWER_SELECT 출력을 바꿉니다(DC Pulse 중에는 RF Select 를 켜지 않음 — 장비 규칙)." />
        <CmdForm bundle={bundle} kind={pickKind(bundle, KINDS.dump)} label="런타임 덤프" can={can} onAsk={onAsk} />
      </div>
    </Card>
  );
}
