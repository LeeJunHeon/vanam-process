"use client";

// 운전 대시보드의 CH1&2 Sputter 박스(D — 챔버K ChkBox 와 같은 틀). 데이터는 챔버12 화면과 같은 웹 스트림(useChk2 — 웹 서버가 가진 마지막
// state·사건, 장비에 새 요청 없음), 화면은 2초마다만 다시 그린다.
// 머리: 연결 칩(lib/ops2/chk/conn — 연결됨 / 늦음 N초 / 끊김 N초 / '끊김 · 18:05부터')·운전 모드·상태 칩.
// 칸 CH1 · CH2 · Loadlock: 챔버가 공정 중이면 레시피·단계 n/m·단계 이름·진행 막대·남은 시간, 아니면 상태와 주요 값(압력·Ion Gauge).
//   Loadlock 은 진공 준비·대기압 요약(챔버12 화면 Loadlock 박스와 같은 글). 맨 아래 지난 공정 한 줄과 [CH1&2 Sputter 열기].
// 맨 위 개수·연결된 장비·최근 알림(두 장비 한 목록)은 부르는 쪽(OpsDashboardPage)이 onReport 로 받는다 — 세는 단위는 CH1·CH2·Loadlock.
import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import { FS, Btn, Card, Chip } from "../chk/kit";
import { ConnLabel } from "../chk/Chk2Status";
import { useChk2 } from "../chk/useChk2";
import { RUN_RESULT } from "../chk/types";
import { runTitle } from "../chk/text";
import { connOf, connParts } from "@/lib/ops2/chk/conn";
import { fmtKst } from "@/lib/ops2/time";
import { MODE_NAME, fieldName, placeName } from "@/lib/ops2/ch12/terms";
import { alarmList12, alertLines12 } from "./Ch12Logs";
import { blockLabel, chamberState, engineOf, isRunning, stateInfo } from "./logic";
import { asCh12, type Ch12State } from "./types";

export type DashState = "가동" | "대기" | "경고" | "오류" | "미연결";
/** 최근 알림 한 줄(두 장비 공통 모양) */
export type DashAlert = { key: string; ts: string; device: string; source: string; kind: string; text: string; level: string; desc?: string };
export type Ch12Report = { units: Record<"ch1" | "ch2" | "ll", DashState>; online: boolean; alerts: DashAlert[]; alarms: string[] };

const LOST_MS = 10_000;
const REDRAW_MS = 2_000;
export const CH12_DEVICE_NAME = "CH1&2";
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const fmtN = (v: number | null, d = 1) => (v === null ? "—" : String(Number(v.toFixed(d))));
const fmtTorr = (v: number | null) => (v === null ? "—" : v.toExponential(1).replace("e", "E"));
const hm = (ms: number) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour12: false, hour: "2-digit", minute: "2-digit" }).format(new Date(ms));
const dur = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}시간 ${Math.floor((s % 3600) / 60)}분` : s >= 60 ? `${Math.floor(s / 60)}분 ${Math.round(s % 60)}초` : `${Math.round(s)}초`);

/** 2초마다만 바뀌는 값(화면 다시 그리기 간격 — 챔버K 박스와 같게) */
function useEvery<T>(v: T, ms: number): T {
  const ref = useRef(v);
  useEffect(() => { ref.current = v; }, [v]);
  const [shown, setShown] = useState(v);
  useEffect(() => {
    const t = setInterval(() => setShown(ref.current), ms);
    return () => clearInterval(t);
  }, [ms]);
  return shown;
}

type Snap = Record<string, unknown> | undefined;
type B = ReturnType<typeof asCh12>;

export function ChamberCell({ bundle, st, ch, nowMs, online }: { bundle: B; st: Ch12State | null; ch: "ch1" | "ch2"; nowMs: number; online: boolean }) {
  const cs = chamberState(st, ch);
  const info = stateInfo(bundle, cs?.procState, ch);
  const running = isRunning(bundle, cs);
  const eng = engineOf(st, ch);
  const snap: Snap = st?.snapshot;
  const step = cs?.step;
  const pct = step && step.total ? Math.min(100, Math.max(0, (((step.no ?? 1) - 1) / step.total) * 100)) : 0;
  const eta = num(cs?.etaRemainingS) ?? num(cs?.remainS ?? step?.remainS);
  const alarms = (cs?.alarms ?? []).length;
  const name = placeName(bundle, ch);
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-[10px] border border-[#E3E6EA] px-3.5 py-3" data-dash-cell={ch}>
      <span className={`flex flex-wrap items-center gap-1.5 ${FS.small} text-[#5B6470]`}>
        <b className="text-[#1B1F24]">{name}</b>
        {!online ? <Chip>미연결</Chip>   /* 끊기면 챔버 칩도 미연결(맨 위 개수와 같게 — 값은 챔버K 박스처럼 마지막 값 그대로) */
          : running ? <Chip tone="dark">{info.kind === "stopping" ? "정지 중" : "공정 중"}</Chip> : info.kind === "stopping" ? <Chip tone="warn">정지 중</Chip> : <Chip>대기</Chip>}
        {cs?.paused && <Chip tone="warn">일시정지</Chip>}
        {alarms > 0 && <Chip tone="alarm">알람 {alarms}개</Chip>}
      </span>
      {running && step ? (
        <>
          <span className={`min-w-0 truncate ${FS.body} text-[#1B1F24]`}>
            <b>{eng?.recipe_name ? String(eng.recipe_name) : "공정"}</b>{` · 단계 ${step.no ?? "-"}/${step.total ?? "-"} ${blockLabel(bundle, step.type)}`}
          </span>
          <div className="h-2 overflow-hidden rounded-full bg-[#E3E6EA]" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={`${name} 공정 진행`}>
            <i className="block h-full rounded-full bg-[#1D4ED8]" style={{ width: `${pct}%` }} />
          </div>
          <span className={`${FS.small} text-[#5B6470]`}>{eta !== null ? `남은 ${dur(eta)} · 예상 끝 ${hm(nowMs + eta * 1000)}` : "남은 시간 확정 전"}</span>
        </>
      ) : (
        <span className={`grid grid-cols-2 gap-2 ${FS.small} text-[#5B6470]`}>
          <span className="min-w-0"><span className="block truncate">{fieldName(bundle, `${ch}.mfc.pressure_mtorr`, name)}</span>
            <b className={`${FS.body} tabular-nums text-[#133A7C]`}>{fmtN(num(snap?.[`${ch}.mfc.pressure_mtorr`]), 2)}</b> mTorr</span>
          <span className="min-w-0"><span className="block truncate">{fieldName(bundle, `${ch}.ig.pressure_torr`, name)}</span>
            <b className={`${FS.body} tabular-nums text-[#133A7C]`}>{fmtTorr(num(snap?.[`${ch}.ig.pressure_torr`]))}</b> Torr</span>
        </span>
      )}
    </div>
  );
}

function LoadlockCell({ bundle, snap }: { bundle: B; snap: Snap }) {
  const title = placeName(bundle, "loadlock");
  const fn = (c: string) => fieldName(bundle, `plc.${c}`, title);
  const plc = (c: string) => snap?.[`plc.${c}`] === true;
  const known = typeof snap?.["plc.l_vac_ready_sw"] === "boolean" || typeof snap?.["plc.l_atm"] === "boolean";
  const sum = plc("l_vac_ready_sw") ? fn("l_vac_ready_sw") : plc("l_atm") || plc("l_atm_sensor") ? fn("l_atm")
    : plc("l_vac_not_ready") ? fn("l_vac_not_ready") : known ? "—" : "PLC 값 없음";
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-[10px] border border-[#E3E6EA] px-3.5 py-3" data-dash-cell="loadlock">
      <span className={`${FS.small} text-[#5B6470]`}><b className="text-[#1B1F24]">{title}</b></span>
      <span className={`${FS.body} text-[#1B1F24]`}>{sum}</span>
    </div>
  );
}

/** CH1&2 박스 + 맨 위 개수·알림 보고(스트림 하나) */
export function Ch12Area({ id, onOpen, onReport }: { id: string; onOpen?: () => void; onReport: (r: Ch12Report) => void }) {
  const d = useChk2(id, "web");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), REDRAW_MS); return () => clearInterval(t); }, []);
  const state = useEvery(d.state, REDRAW_MS);
  const feed = useEvery(d.feed, REDRAW_MS);
  const bundle = asCh12(d.bundle);
  const st = (state?.data ?? null) as Ch12State | null;
  const snap: Snap = st?.snapshot;
  const skew = d.hello?.web?.clockSkewMs ?? 0;
  const age = state ? now + d.offsetMs - (Date.parse(state.ts) - skew) : null;
  const online = age !== null && age <= LOST_MS;
  const running = (["ch1", "ch2"] as const).filter((c) => isRunning(bundle, chamberState(st, c)));
  const unitOf = (c: "ch1" | "ch2"): DashState => !online ? "미연결" : (chamberState(st, c)?.alarms ?? []).length
    || (st?.alarms ?? []).some((a) => a.chamber === c) ? "오류" : running.includes(c) ? "가동" : "대기";
  const units = { ch1: unitOf("ch1"), ch2: unitOf("ch2"), ll: (online ? "대기" : "미연결") as DashState };
  // 최근 알림(챔버K 와 같은 규칙 — 경고·오류 사건, 거부·실패한 명령, 24시간, 최근 20줄)과 활성 알람 — 1분마다만 다시 거른다
  const minute = Math.floor(now / 60_000);
  const raw = d.bundle;
  const alerts = useMemo(() => alertLines12(asCh12(raw), feed, minute * 60_000).map((r): DashAlert => ({
    key: `${id}:${r.e.id}`, ts: r.e.ts, device: CH12_DEVICE_NAME, source: r.source ?? "", kind: r.kind, text: r.text, level: r.level, desc: r.desc,
  })), [raw, feed, minute, id]);
  const alarms = alarmList12(bundle, st, false).map((a) => a.text);
  const sig = JSON.stringify([units, online, alerts.map((a) => a.key), alarms]);
  const report = useRef(onReport);
  useEffect(() => { report.current = onReport; }, [onReport]);
  useEffect(() => { report.current({ units, online, alerts, alarms }); }, [sig]);   // eslint-disable-line react-hooks/exhaustive-deps

  const runMode = d.hello?.runMode;
  const bench = runMode === "bench" || d.hello?.writesAllowed === false;
  const mode = bench ? "bench" : runMode === "sim" ? "sim" : runMode ? "run" : null;
  const last = (d.runs ?? []).find((r) => r.endedAt) as (typeof d.runs[number] & { chamber?: string | null }) | undefined;
  const c = connOf(age, now);
  const stateChip = !online ? <Chip>미연결</Chip>
    : running.length ? <Chip tone="dark">{running.map((x) => placeName(bundle, x)).join("·")} 공정 중</Chip> : <Chip>대기 중</Chip>;
  return (
    <Card className="flex flex-col gap-3" title={<>CH1&amp;2 Sputter</>}
      right={<span className="flex flex-wrap items-center justify-end gap-1.5">
        <Chip tone={c.tone} className="tabular-nums"><ConnLabel parts={connParts(c)} /></Chip>
        {mode && <Chip>{MODE_NAME[mode]}</Chip>}
        {stateChip}
      </span>}>
      <div className="grid grid-cols-1 gap-2.5 @min-[520px]/dash:grid-cols-3" data-dash-ch12="">
        <ChamberCell bundle={bundle} st={st} ch="ch1" nowMs={now + d.offsetMs} online={online} />
        <ChamberCell bundle={bundle} st={st} ch="ch2" nowMs={now + d.offsetMs} online={online} />
        <LoadlockCell bundle={bundle} snap={snap} />
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-[#E3E6EA] pt-3">
        <span className={`min-w-0 ${FS.body} text-[#5B6470]`}>
          {last ? `지난 공정 ${last.startedAt ? fmtKst(last.startedAt).slice(-8, -3) : ""}${last.chamber ? ` ${placeName(bundle, last.chamber)}` : ""} ${runTitle({ name: last.name, recipeName: last.recipeName }) || "공정"} · ${RUN_RESULT[last.result ?? ""] ?? last.result ?? ""}`
            : "지난 공정 없음"}
        </span>
        <span className="ml-auto"><Btn kind="primary" onClick={() => onOpen?.()}><ExternalLink size={14} /> CH1&amp;2 Sputter 열기</Btn></span>
      </div>
    </Card>
  );
}
