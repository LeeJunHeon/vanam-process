"use client";

// 운전 대시보드(W-21 — 시안 '운전 대시보드'). CHK Sputter 는 v2(ops2) 데이터: CHK 화면과 같은 웹 스트림(useChk2 — 웹 서버가 가진
// 마지막 state·사건, 장비에 새 요청 없음)을 받고, 화면은 2초마다만 다시 그린다.
// 맨 위: 가동·대기·경고·오류·미연결 개수, 연결된 장비 수. CHK Sputter 박스: 연결·운전 모드·상태 칩, 공정 중이면 레시피·단계 n/m·단계 이름·
//   진행 막대·시작·남은 시간·예상 끝, 주요 값 4칸, 상태 칩, 맨 아래 지난 공정 한 줄과 [CHK Sputter 열기]. 오른쪽 '최근 알림'은
//   두 장비(CHK·CH1&2)의 알림 줄(시각 · 장비 · 출처 · 이름 · 내용)을 시간 순 한 목록으로와 활성 알람. CH1&2 Sputter 박스는 챔버12 데이터
//   (components/ops2/ch12/Ch12Dash — 같은 틀: 연결·모드·상태 칩, CH1·CH2·Loadlock 칸, 지난 공정, [CH1&2 Sputter 열기]), 장비 고르기는
//   lib/ops2/display.deviceChoiceOf("ch12")(켜진 CH12, 없으면 첫 챔버12 장비). 맨 위 개수의 세는 단위는 CH1·CH2·LoadLock·CHK·나머지 넷.
//   나머지 장비는 지금 데이터(연동 예정) 그대로 같은 박스 틀로.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import { FS, Btn, Card, Chip } from "@/components/ops2/chk/kit";
import { useChk2 } from "@/components/ops2/chk/useChk2";
import { rfState } from "@/lib/ops2/chk/rf";
import { connOf, connParts } from "@/lib/ops2/chk/conn";
import { ConnLabel } from "@/components/ops2/chk/Chk2Status";
import { kindOf, pressureTargetCol } from "@/components/ops2/chk/runview";
import { ALERT_KEEP, alertLines, reasonText } from "@/components/ops2/chk/logView";
import { CH12_DEVICE_NAME, Ch12Area, type Ch12Report, type DashAlert } from "@/components/ops2/ch12/Ch12Dash";
import { RUN_RESULT, type StateData } from "@/components/ops2/chk/types";
import { runTitle } from "@/components/ops2/chk/text";
import { MODE_NAME, fieldName, stepName } from "@/lib/ops2/chk/terms";
import { CHK_BASE_ID, deviceChoiceOf, isChkEquipment } from "@/lib/ops2/display";
import { fmtKst } from "@/lib/ops2/time";

type EquipState = "가동" | "대기" | "경고" | "오류" | "미연결";
type EquipPage = "equipCh12v2" | "equipChk2" | "equipRayvac" | "equipNcd" | "equipEvap" | "equipInline";
type Unit = { key: string; name: string; state: EquipState; page: EquipPage };

// 연동 전 장비는 상태를 지어내지 않는다(지금 데이터 그대로 — 연동 예정)
const OTHERS: Unit[] = [
  { key: "rayvac", name: "Rayvac ALD", state: "미연결", page: "equipRayvac" },
  { key: "ncd", name: "NCD ALD", state: "미연결", page: "equipNcd" },
  { key: "evap", name: "Evaporator", state: "미연결", page: "equipEvap" },
  { key: "inline", name: "In-Line Sputter", state: "미연결", page: "equipInline" },
];
const LOST_MS = 10_000;
const REDRAW_MS = 2_000;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const fmtN = (v: number | null, d = 1) => (v === null ? "—" : String(Number(v.toFixed(d))));
const hm = (ms: number) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour12: false, hour: "2-digit", minute: "2-digit" }).format(new Date(ms));
const dur = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}시간 ${Math.floor((s % 3600) / 60)}분` : s >= 60 ? `${Math.floor(s / 60)}분 ${Math.round(s % 60)}초` : `${Math.round(s)}초`);

/** CHK Sputter 장비 ID — 켜진 챔버K 장비 중 CHK2, 없으면 첫 챔버K 장비(CHK2-SIM — 챔버12 제외, W-24 A 와 같은 규칙) */
function useChkId(): string | null {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    let off = false;
    void fetch("/api/ops2/devices", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => {
      const ds = (j?.devices ?? []) as { equipment: string }[];
      const pick = ds.find((d) => d.equipment === CHK_BASE_ID) ?? ds.find((d) => isChkEquipment(d.equipment));
      if (!off) setId(pick?.equipment ?? "");
    }).catch(() => { if (!off) setId(""); });
    return () => { off = true; };
  }, []);
  return id;
}

/** 2초마다만 바뀌는 값(화면 다시 그리기 간격) */
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

function Tile({ title, value, unit }: { title: string; value: string; unit: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-[10px] border border-[#E3E6EA] px-3.5 py-3">
      <span className={`truncate ${FS.small} text-[#5B6470]`}>{title}</span>
      <span className="whitespace-nowrap text-[24px] font-bold leading-tight text-[#133A7C]">{value} <span className={`${FS.small} font-normal text-[#5B6470]`}>{unit}</span></span>
    </div>
  );
}

function ChkBox({ d, onNavigate, onState }: { d: ReturnType<typeof useChk2>; onNavigate?: (p: EquipPage) => void; onState: (s: EquipState, online: boolean) => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), REDRAW_MS); return () => clearInterval(t); }, []);
  const state = useEvery(d.state, REDRAW_MS);
  const st: StateData | null = state?.data ?? null;
  const snap = st?.snapshot;
  const b = d.bundle;
  const skew = d.hello?.web?.clockSkewMs ?? 0;
  const age = state ? now + d.offsetMs - (Date.parse(state.ts) - skew) : null;
  const online = age !== null && age <= LOST_MS;
  const kind = kindOf(b, st);
  const active = kind === "active" || kind === "stopping";
  const alarms = st?.alarms ?? [];
  const eqState: EquipState = !online ? "미연결" : alarms.length ? "오류" : active ? "가동" : "대기";
  useEffect(() => { onState(eqState, online); }, [eqState, online, onState]);

  const mode = d.hello?.runMode as keyof typeof MODE_NAME | undefined;
  const step = st?.step ?? null;
  const remain = num(st?.step?.remainS ?? st?.remainS);
  const run = d.runs?.find((r) => r.runId === st?.runId) ?? null;
  const started = run?.startedAt ? Date.parse(run.startedAt) : null;
  const last = d.runs?.find((r) => r.endedAt) ?? null;
  const pct = step && step.total ? Math.min(100, Math.max(0, ((step.no - 1) / step.total) * 100)) : 0;
  const pt = pressureTargetCol(snap, b);
  const tgt = (v: number | null) => (v !== null && v > 0 ? ` · 목표 ${fmtN(v)}` : "");
  // 꺼져 있으면 목표 대신 '꺼짐'(W-23 G3 — 꺼진 채널의 남은 목표 값은 보이지 않는다). on 을 모르면(옛 묶음) 목표 그대로
  const tgtIf = (on: unknown, v: number | null) => (on === false ? " · 꺼짐" : tgt(v));
  const rfOn = snap?.["rf.cmd_on"] ?? snap?.["rf.out_on"];
  // 쓰는 파워 — 켜진 것(DC·RF·RF Pulse), 없으면 RF
  const pw = snap?.["dc.out"] === true ? ["DC Power", "dc.p", "dc.set_w", "dc.out"] : snap?.["rfp.out_on"] === true ? ["RF Pulse", "rfp.fwd_w", "rfp.set_w", "rfp.out_on"]
    : ["RF Power", "rf.fwd_w", "rf.set_w", ""];
  const pwOn = pw[3] ? snap?.[pw[3]] : rfOn;
  const openShut = ["ms", "s1", "s2"].filter((k) => snap?.[`plc.${k}`] === true).map((k) => fieldName(b, `plc.${k}`));
  const vacOk = snap?.["plc.mv"] === true && snap?.["plc.turbo"] === true;
  const itlOk = snap?.["plc.mv_interlock"] === true;
  const stateChip = !online ? <Chip>미연결</Chip> : active ? <Chip tone="dark">{st?.run?.manual ? "수동 조작 중" : "공정 중"}</Chip> : <Chip>대기 중</Chip>;
  return (
    <Card className="flex flex-col gap-3" title={<>CHK Sputter</>}
      right={<span className="flex flex-wrap items-center justify-end gap-1.5">
        {(() => { const c = connOf(age, now); return <Chip tone={c.tone} className="tabular-nums"><ConnLabel parts={connParts(c)} /></Chip>; })()}
        {mode && MODE_NAME[mode] && <Chip>{MODE_NAME[mode]}</Chip>}
        {stateChip}
      </span>}>
      {active && step ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className={`min-w-0 ${FS.body} text-[#1B1F24]`}>
              <b>{st?.run?.manual ? "수동 조작" : runTitle({ name: run?.name ?? st?.recipe?.name ?? null, recipeName: run?.recipeName ?? null }) || "공정"}</b>
              {` · 단계 ${step.no}/${step.total} ${stepName(b, { type: step.type ?? null, label: step.label ?? null })}`}
            </span>
            <span className={`${FS.small} text-[#5B6470]`}>
              {[started ? `시작 ${hm(started)}` : "", remain !== null ? `남은 ${dur(remain)}` : "", remain !== null ? `예상 끝 ${hm(now + remain * 1000)}` : ""].filter(Boolean).join(" · ")}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[#E3E6EA]" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="공정 진행">
            <i className="block h-full rounded-full bg-[#1D4ED8]" style={{ width: `${pct}%` }} />
          </div>
        </div>
      ) : <p className={`${FS.body} text-[#5B6470]`}>{online ? "대기 중" : "장비 연결을 기다리는 중"}</p>}
      <div className="grid grid-cols-2 gap-2.5 @min-[640px]/dash:grid-cols-4">
        <Tile title={`챔버 압력${tgt(num(snap?.[pt]))}`} value={fmtN(num(snap?.["mfc.pressure_mtorr"]), 2)} unit="mTorr" />
        <Tile title={`Ar 유량${tgtIf(snap?.["mfc.ar_on"], num(snap?.["mfc.ar_set"]))}`} value={fmtN(num(snap?.["mfc.ar_sccm"]))} unit="sccm" />
        <Tile title={`${pw[0]}${tgtIf(pwOn, num(snap?.[pw[2]]))}`} value={fmtN(num(snap?.[pw[1]]))} unit="W" />
        <Tile title={`히터 TC1${snap?.["heater.run"] === true ? tgt(num(snap?.["heater.sv"])) : ""}`} value={fmtN(num(snap?.["heater.pv"]))} unit="°C" />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Chip tone={vacOk ? "neutral" : "warn"}>{vacOk ? "진공 정상" : "진공 확인"}</Chip>
        <Chip tone={openShut.length ? "dark" : "neutral"}>{openShut.length ? `${openShut.join("·")} 열림` : "셔터 모두 닫힘"}</Chip>
        <Chip tone={itlOk ? "neutral" : "warn"}>{itlOk ? "인터락 정상" : `${fieldName(b, "plc.mv_interlock")} 꺼짐`}</Chip>
        <Chip tone={alarms.length ? "alarm" : "neutral"}>{alarms.length ? `활성 알람 ${alarms.length}개` : "활성 알람 없음"}</Chip>
        {rfState(snap) === "uncommanded" && <Chip tone="warn">RF 명령 없이 출력 중</Chip>}
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-[#E3E6EA] pt-3">
        <span className={`min-w-0 ${FS.body} text-[#5B6470]`}>
          {last ? `지난 공정 ${last.startedAt ? fmtKst(last.startedAt).slice(-8, -3) : ""} ${runTitle({ name: last.name, recipeName: last.recipeName }) || "공정"} · ${RUN_RESULT[last.result ?? ""] ?? last.result ?? ""}` : "지난 공정 없음"}
        </span>
        <span className="ml-auto"><Btn kind="primary" onClick={() => onNavigate?.("equipChk2")}><ExternalLink size={14} /> CHK Sputter 열기</Btn></span>
      </div>
    </Card>
  );
}

/** 최근 알림 — 두 장비(CHK·CH1&2)의 알림 줄(시각 · 장비 · 출처 · 이름 · 내용)을 시간 순 한 목록으로, 규칙은 챔버K logView.alertLines
 *  (경고·오류 사건·거부·실패한 명령, 24시간, 최근 20줄 — 챔버12 는 같은 규칙의 alertLines12)와 활성 알람. 큰 화면에서는 오른쪽 띠 */
function RecentCard({ items, alarms, onNavigate }: { items: DashAlert[]; alarms: string[]; onNavigate?: (p: EquipPage) => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t); }, []);
  const today = fmtKst(new Date(now).toISOString()).slice(0, 5);
  return (
    <Card className="flex flex-col @min-[1200px]/dash:absolute @min-[1200px]/dash:inset-0" title="최근 알림"
      right={<Btn size="sm" kind="ghost" onClick={() => onNavigate?.("equipChk2")}>전체 보기</Btn>}>
      <p className={`mb-2 rounded-[10px] bg-[#F5F6F8] px-3 py-2 ${FS.body} text-[#5B6470]`}>
        활성 알람 {alarms.length ? alarms.join(" · ") : <b className="text-[#1B1F24]">없음</b>} · 모든 장비
      </p>
      {items.length ? (
        <ul className="max-h-[360px] min-h-0 flex-1 overflow-y-auto pr-1 @min-[1200px]/dash:max-h-none">
          {items.map((r) => {
            const full = fmtKst(r.ts);
            return (
              <li key={r.key} className={`grid grid-cols-[auto_auto_auto_minmax(0,1fr)] items-baseline gap-2 border-b border-[#EEF0F3] py-1.5 ${FS.small}`} title={r.desc}>
                <span className="tabular-nums text-[#5B6470]">{full.slice(0, 5) === today ? full.slice(-8) : full.slice(0, 11)}</span>
                <span className="text-[#5B6470]">{r.device}</span>
                <span className="text-[#5B6470]">{r.source}</span>
                <span className="min-w-0">
                  {r.level === "warn" ? <Chip tone="warn">{r.kind}</Chip> : r.level === "error" || r.level === "critical" ? <Chip tone="alarm">{r.kind}</Chip>
                    : <b className="text-[#1B1F24]">{r.kind}</b>}
                  <span className={`ml-1 ${r.level === "warn" ? "text-[#B54708]" : r.level === "error" || r.level === "critical" ? "text-[#B42318]" : "text-[#5B6470]"}`}>{r.text}</span>
                </span>
              </li>
            );
          })}
        </ul>
      ) : <p className={`${FS.body} text-[#5B6470]`}>알림 없음</p>}
    </Card>
  );
}

function SmallBox({ u, onNavigate }: { u: Unit; onNavigate?: (p: EquipPage) => void }) {
  return (
    <Card className="flex flex-col gap-2" tight title={<span className="truncate">{u.name}</span>}>
      <p className={`flex flex-wrap items-center gap-1.5 ${FS.small} text-[#8A929D]`}><Chip>{u.state}</Chip> 연동 예정</p>
      <div className="mt-auto border-t border-[#E3E6EA] pt-2">
        <Btn size="sm" kind="ghost" onClick={() => onNavigate?.(u.page)}>열기</Btn>
      </div>
    </Card>
  );
}

/** CHK Sputter 박스 — 스트림 하나(useChk2)로 박스를 그리고 최근 알림 줄·활성 알람을 부르는 쪽에 알린다(알림은 두 장비 한 목록). 큰 화면: 왼쪽 8칸 */
function ChkArea({ id, onNavigate, onState, onAlerts }: { id: string; onNavigate?: (p: EquipPage) => void;
  onState: (s: EquipState, online: boolean) => void; onAlerts: (items: DashAlert[], alarms: string[]) => void }) {
  const d = useChk2(id, "web");
  const feed = useEvery(d.feed, REDRAW_MS);
  const st = useEvery(d.state, REDRAW_MS);
  // 주의가 필요한 것만(W-23 C — 경고·오류 사건, 거부·실패한 명령, 24시간 안, 최근 20줄) — 1분마다만 다시 거른다
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t); }, []);
  const items = useMemo(() => alertLines(d.bundle, feed, now).map((r): DashAlert => ({
    key: `${id}:${r.e.id}`, ts: r.e.ts, device: "CHK", source: r.source ?? "", kind: r.kind, text: r.text, level: r.level, desc: r.desc,
  })), [d.bundle, feed, now, id]);
  const alarms = (st?.data?.alarms ?? []).map((a) => reasonText(d.bundle, a.code, "알람"));
  const sig = JSON.stringify([items.map((x) => x.key), alarms]);
  const cb = useRef(onAlerts);
  useEffect(() => { cb.current = onAlerts; }, [onAlerts]);
  useEffect(() => { cb.current(items, alarms); }, [sig]);   // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="min-w-0 @min-[1200px]/dash:col-span-8"><ChkBox d={d} onNavigate={onNavigate} onState={onState} /></div>;
}

/** CH1&2 Sputter 장비 ID — 켜진 챔버12 장비 중 CH12, 없으면 첫 챔버12 장비(CH12-SIM — useChkId 와 같은 규칙) */
function useCh12Id(): string | null {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    let off = false;
    void fetch("/api/ops2/devices", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => {
      const ds = (j?.devices ?? []) as { equipment: string }[];
      if (!off) setId(deviceChoiceOf("ch12", ds, null).picked ?? "");
    }).catch(() => { if (!off) setId(""); });
    return () => { off = true; };
  }, []);
  return id;
}

export default function OpsDashboardPage({ onNavigate }: { onNavigate?: (p: EquipPage) => void }) {
  const chkId = useChkId();
  const ch12Id = useCh12Id();
  const [chk, setChk] = useState<{ state: EquipState; online: boolean }>({ state: "미연결", online: false });
  const onState = useMemo(() => (s: EquipState, online: boolean) => setChk((x) => (x.state === s && x.online === online ? x : { state: s, online })), []);
  const [chkAl, setChkAl] = useState<{ items: DashAlert[]; alarms: string[] }>({ items: [], alarms: [] });
  const onChkAlerts = useCallback((items: DashAlert[], alarms: string[]) => setChkAl({ items, alarms }), []);
  const [ch12, setCh12] = useState<Ch12Report | null>(null);
  const onCh12 = useCallback((r: Ch12Report) => setCh12(r), []);
  // 세는 단위는 지금 그대로(CH1·CH2·LoadLock 셋 + CHK 하나 + 나머지 넷) — 챔버12 장비가 없거나 끊기면 셋 다 미연결
  const ch12Units: EquipState[] = ch12Id && ch12 ? [ch12.units.ch1, ch12.units.ch2, ch12.units.ll] : ["미연결", "미연결", "미연결"];
  const units: EquipState[] = [...ch12Units, ...OTHERS.map((u) => u.state)];
  const counts = { 가동: 0, 대기: 0, 경고: 0, 오류: 0, 미연결: 0 } as Record<EquipState, number>;
  for (const u of units) counts[u] += 1;
  counts[chk.state] += 1;
  const total = units.length + 1;
  const online = (chk.online ? 1 : 0) + (ch12Id && ch12?.online ? ch12Units.length : 0);
  const items = [...chkAl.items, ...(ch12Id && ch12 ? ch12.alerts : [])].sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts)).slice(0, ALERT_KEEP);
  const alarms = [...chkAl.alarms, ...(ch12Id && ch12 ? ch12.alarms.map((a) => `${CH12_DEVICE_NAME} ${a}`) : [])];
  return (
    <div className="@container/dash min-h-full bg-[#EEF0F3] p-3 text-[#1B1F24] sm:p-5">
      <div className="grid grid-cols-1 gap-3 @min-[1200px]/dash:grid-cols-12">
        <Card className="@min-[1200px]/dash:col-span-12" tight>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <b className={`mr-1 ${FS.card}`}>운전 대시보드</b>
              <Chip tone={counts.가동 ? "dark" : "neutral"}>가동 {counts.가동}</Chip>
              <Chip>대기 {counts.대기}</Chip>
              <Chip tone={counts.경고 ? "warn" : "neutral"}>경고 {counts.경고}</Chip>
              <Chip tone={counts.오류 ? "alarm" : "neutral"}>오류 {counts.오류}</Chip>
              <Chip>미연결 {counts.미연결}</Chip>
            </div>
            <span className={`${FS.body} text-[#5B6470]`}>연결된 장비 {online} / {total}</span>
          </div>
        </Card>
        {chkId ? <ChkArea id={chkId} onNavigate={onNavigate} onState={onState} onAlerts={onChkAlerts} />
          : <Card className="@min-[1200px]/dash:col-span-8" title="CHK Sputter">
              <p className={`${FS.body} text-[#5B6470]`}>{chkId === "" ? "등록된 CHK Sputter 장비가 없습니다." : "장비 목록을 읽는 중…"}</p>
            </Card>}
        <div className="relative min-w-0 @min-[1200px]/dash:col-span-4 @min-[1200px]/dash:col-start-9 @min-[1200px]/dash:row-span-3 @min-[1200px]/dash:row-start-2">
          <RecentCard items={items} alarms={alarms} onNavigate={onNavigate} />
        </div>
        {ch12Id ? <div className="min-w-0 @min-[1200px]/dash:col-span-8"><Ch12Area id={ch12Id} onOpen={() => onNavigate?.("equipCh12v2")} onReport={onCh12} /></div>
          : <Card className="@min-[1200px]/dash:col-span-8" title="CH1&2 Sputter">
              <p className={`${FS.body} text-[#5B6470]`}>{ch12Id === "" ? "등록된 CH1&2 Sputter 장비가 없습니다." : "장비 목록을 읽는 중…"}</p>
            </Card>}
        <div className="grid grid-cols-1 gap-3 @min-[420px]/dash:grid-cols-2 @min-[900px]/dash:grid-cols-4 @min-[1200px]/dash:col-span-8">
          {OTHERS.map((u) => <SmallBox key={u.key} u={u} onNavigate={onNavigate} />)}
        </div>
      </div>
    </div>
  );
}
