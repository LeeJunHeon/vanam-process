"use client";

// 챔버12(CH1&2) 장비 화면(메뉴 "CH1&2 Sputter", 2026-11-18 — 챔버K 화면 W-10·W-11 틀로 다시 만듦. 옛 고정 값 시안 화면은 없앰).
// 화면 틀: 제목·장비 고르기 → 상태 띠(모든 탭 위에 늘 — Ch12Status, 스크롤로 안 보이면 위에 얇은 줄) → bench 정보 띠 →
//   탭 상태 · 운전 · HMI · 레시피 · 기록 · 설정(노트북 화면은 상태 · 운전 · HMI · 기록, 주소 ?tab= 에 남김 — 옛 ?tab=run 도 그대로)
//   + 오른쪽 끝 '상세 보기' 토글. 상태 = 장비 박스와 알림, 운전 = 다음 공정과 공정 중 화면(U4 — 챔버K Chk2Page 와 같은 나눔).
//   T: 운전 탭에 Plasma Cleaning · TSP · 프리스퍼터 예약 · 노트북 레시피 파일(노트북만), 상태 탭에 Loadlock · 로봇 연결 · 장비 공통 조작 · 장비 응답 시간.
//   화면 글이 가리키는 곳('아래 …'·'… 탭')은 실제 자리와 맞춘다(노트북에는 레시피·설정 탭과 조작 기록이 없음).
// 떠 있는 상자(확인창·알림창·토스트·도움말·순서 고치기)는 body 포털(Float — 챔버K W-23 A)이라 열고 닫아도 페이지 높이·스크롤이 그대로(U5).
// kit 옵션(U1): chkColors(확인창 빨강은 정지·끄기·끝내기만)·lineIcons(띠 아이콘을 첫 줄 가운데에)는 챔버K 와 같이 켜고, chkWords 는 켜지 않는다
//   (설정 카드 접은 줄에 챔버K 장비 이름 'CHK·CHK-SIM', 기록의 출처 'LOCAL' 이 나와서 — 보고).
// 버튼 색(C — 챔버K 규칙): 시작·켜기·적재·적용 파랑(primary), 정지·끄기 빨강 테두리(danger), 빨강 채움(dangerSolid)은 ALL STOP 뿐.
//   레시피 편집 중 저장 안 한 변경이 있으면 탭·장비를 바꿀 때 확인창.
// 데이터는 챔버K useChk2 그대로(hello·schema(묶음)·stream·commands·runs — /api/ops2/[equipment]/v1/* 와 노트북 /api/v1/*), 추세 열만 챔버12 열.
// 잠금(logic.lockReason — 챔버K lockOf 와 같은 순서·문구): 로그인 끊김 → 권한(웹 perms·노트북은 hello.commandKinds) → bench(runMode bench·
//   writesAllowed false 면 묶음 commands[].benchOk 가 참인 명령만) → 정지 쪽(연결 또는 웹 온라인이면 됨) → 결과 기다리는 중 → 장비 끊김 →
//   PLC 값 오래됨(PLC 버튼·히터·Power Select). 기다리는 동안 막는 단위는 '명령@챔버'(PLC 버튼은 target).
// 노트북 화면도 PLC 버튼을 보낸다(v2 장비는 HMI 에서도 PLC_BUTTON 을 받는다 — 챔버K 는 웹만) — 웹과 같은 잠금·확인창.
// 알림창(Ch12Popups — v1 경고 5 s·오류창·호스트 15 s, 중복 억제·동시 5개, 오류창 닫으면 오류 표시 해제)은 두 화면 모두.
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { AlertTriangle, Cloud, CloudOff, Code2, Laptop, Lock, LogIn, WifiOff } from "lucide-react";
import Chk2Config from "../chk/Chk2Config";
import { CommandLog, RunList } from "../chk/Chk2Logs";
import { FS, Card, InfoBand, Issue, Notices, SimpleConfirm, Tabs, TipLayer, type Ask, type Notice } from "../chk/kit";
import { Float } from "../chk/Float";
import { ConnLabel } from "../chk/Chk2Status";
import { connOf, connParts } from "@/lib/ops2/chk/conn";
import { deviceChoiceOf } from "@/lib/ops2/display";
import Ch12Confirm from "./Ch12Confirm";
import { plcFresh } from "../chk/logic";
import { Chk2ModeContext, useDetailPref } from "../chk/mode";
import { reasonLabel, type StateData } from "../chk/types";
import { useChk2, type Chk2Mode } from "../chk/useChk2";
import { useRecipes } from "../chk/useRecipes";
import { fmtKst } from "@/lib/ops2/time";
import Ch12Hmi from "./Ch12Hmi";
import Ch12History from "./Ch12History";
import { Ch12EventFeed } from "./Ch12Logs";
import { PopupStack, usePopups } from "./Ch12Popups";
import Ch12Recipes from "./Ch12Recipes";
import Ch12Run, { TREND_COLS12 } from "./Ch12Run";
import Ch12SeqEdit from "./Ch12SeqEdit";
import { StatusBand12, StatusBar12, type ConnInfo } from "./Ch12Status";
import { lockReason, plcCol, plcStaleSec } from "./logic";
import { asCh12, asChk, type Ch12State } from "./types";
import { settingValue12, toTerms12 } from "@/lib/ops2/ch12/terms";

const STORE_KEY = "vanam-process:ch12-device";
const LATE_MS = 3_000;
const LOST_MS = 10_000;
const SKEW_WARN_MS = 3_000;
const PLC_PENDING_MS = 10_000;
const OK_NOTICE_MS = 6_000;
const LOCK_PREFIX = "잠김: ";          // 잠긴 버튼 마우스 설명 앞말(kit Btn — 챔버K 는 '잠김 — ' 그대로)

const SEND_ERROR: Record<string, string> = {
  device_offline: "장비 연결 끊김",
  forbidden: "권한 없음",
  no_schema: "장비 정보를 받는 중",
  unknown_kind: "웹에서 낼 수 없는 명령",
  bad_args: "인자 오류",
  config_path: "설정 변경은 설정 화면에서",
  unknown_device: "등록되지 않았거나 꺼진 장비",
  network: "웹 서버에 닿지 않음",
};

export type TabKey = "status" | "run" | "hmi" | "recipe" | "log" | "config";
export const FEED_MAIN_KEEP12 = 1500;
// U4(챔버K W-21 과 같은 나눔): 상태(장비 박스 + 알림 — 기본 탭) / 운전(대기: 다음 공정, 공정 중: 공정 화면). 공정이 시작·끝나도 탭은 그대로
export const WEB_TABS: { key: TabKey; label: string; title: string }[] = [
  { key: "status", label: "상태", title: "장비 박스·Loadlock·로봇 연결·장비 공통 조작과 알림" },
  { key: "run", label: "운전", title: "다음 공정, 공정 중이면 공정 순서·주요 값·추세, Plasma Cleaning·TSP·프리스퍼터 예약" },
  { key: "hmi", label: "HMI", title: "장비 계통도와 PLC 버튼" },
  { key: "recipe", label: "레시피", title: "공정·Plasma Cleaning 레시피 목록과 편집" },
  { key: "log", label: "기록", title: "로그·조작 기록·공정 이력" },
  { key: "config", label: "설정", title: "장비 설정 보기와 적용" },
];
export const LOCAL_TABS = WEB_TABS.filter((t) => t.key === "status" || t.key === "run" || t.key === "hmi" || t.key === "log")
  .map((t) => (t.key === "run" ? { ...t, title: `${t.title}·노트북 레시피 파일` } : t.key === "log" ? { ...t, title: "장비 로그(조작 기록·공정 이력은 웹 화면)" } : t));   // 노트북 기록 탭은 로그만(T)

type Device = { equipment: string; label: string | null; runMode: string | null };

export default function Ch12Page() {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [switchTo, setSwitchTo] = useState<string | null>(null);
  const dirtyRef = useRef(false);

  useEffect(() => {
    void (async () => {
      const r = await fetch("/api/ops2/devices", { cache: "no-store" }).catch(() => null);
      const all: Device[] = r?.ok ? (await r.json()).devices ?? [] : [];
      let saved: string | null = null;
      try { saved = window.localStorage.getItem(STORE_KEY); } catch { /* 저장소 없음 */ }
      // 챔버12 장비만(CH12·CH12-SIM — lib/ops2/display.deviceChoiceOf). 저장된 선택이 그 안에 없으면 CH12
      const c = deviceChoiceOf("ch12", all, saved);
      setDevices(c.list);
      setPicked(c.picked);
    })();
  }, []);

  const pick = (e: string) => {
    if (dirtyRef.current) return setSwitchTo(e);
    setPicked(e);
    try { window.localStorage.setItem(STORE_KEY, e); } catch { /* 저장 실패는 무시 */ }
  };

  return (
    <div className="min-h-full space-y-3 bg-[#EEF0F3] p-3 text-[#1B1F24] sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className={`${FS.title} font-bold text-[#1B1F24]`}>CH1&amp;2 Sputter</h2>
        {devices && devices.length > 1 && (                    // 고를 장비가 하나면 고르기 상자를 그리지 않는다(U6 — 챔버K W-24 A)
          <select value={picked ?? ""} onChange={(e) => pick(e.target.value)} aria-label="장비 고르기"
            className={`h-10 rounded-[10px] border border-[#D9DDE3] bg-white px-2 ${FS.body} font-semibold text-[#1B1F24]`}>
            {devices.map((d) => (
              <option key={d.equipment} value={d.equipment}>{d.equipment}{d.label ? ` · ${d.label}` : ""}{d.runMode ? ` (${d.runMode})` : ""}</option>
            ))}
          </select>
        )}
      </div>
      {devices && !devices.length && (
        <Card><p className={`${FS.body} text-[#5B6470]`}>사용 중인 CH1&amp;2 장비가 없습니다. 장비 관리에서 장비를 등록하거나 사용을 켜세요.</p></Card>
      )}
      {picked && <Ch12Device key={picked} equipment={picked} dirtyRef={dirtyRef} />}
      {switchTo && <Float>
        <SimpleConfirm title="저장하지 않음" ok="버리고 바꾸기" danger text="레시피에 저장하지 않은 변경이 있습니다. 버리고 장비를 바꿀까요?"
          onCancel={() => setSwitchTo(null)} onOk={() => { dirtyRef.current = false; setSwitchTo(null); pick(switchTo); }} />
      </Float>}
    </div>
  );
}

/** 주소 ?tab= 읽기·쓰기(다른 검색어는 그대로) */
function readTab(allowed: TabKey[]): TabKey | null {
  try {
    const t = new URLSearchParams(window.location.search).get("tab") as TabKey | null;
    return t && allowed.includes(t) ? t : null;
  } catch { return null; }
}
function writeTab(t: TabKey) {
  try {
    const u = new URL(window.location.href);
    u.searchParams.set("tab", t);
    window.history.replaceState(window.history.state, "", u.toString());
  } catch { /* 주소를 못 바꿔도 화면은 동작 */ }
}

export function Ch12Device({ equipment, dirtyRef, mode: screen = "web" }: {
  equipment: string; dirtyRef: MutableRefObject<boolean>; mode?: Chk2Mode;
}) {
  const local = screen === "local";
  // 로그 목록 — 기본 보기 줄(공정 진행·경고·오류·공정 시작/끝·명령 결과)은 상세 줄과 따로 1500 개(장비 허브 HUB_KEEP_MAIN 300 × 챔버 5)까지 —
  // 화면을 다시 열면 장비·웹이 앞선 공정 진행 줄을 먼저 보내는데, 상세 줄에 밀려 다시 잘리지 않게(2026-11-19)
  const d = useChk2(equipment, screen, TREND_COLS12, FEED_MAIN_KEEP12);
  const recipes = useRecipes(equipment, !local);
  const bundle = asCh12(d.bundle);
  const [now, setNow] = useState(() => Date.now());
  const [ask, setAsk] = useState<Ask | null>(null);
  const [inflight, setInflight] = useState<Record<string, number>>({});
  const [notices, setNotices] = useState<Notice[]>([]);
  const [plcPending, setPlcPending] = useState<Record<string, { want: boolean; at: number }>>({});
  const [seqFor, setSeqFor] = useState<"ch1" | "ch2" | null>(null);
  const [recipeReq, setRecipeReq] = useState<{ id: string | null; n: number } | null>(null);   // 운전 탭 [레시피 열기·편집](W-20)
  const [detail, setDetail] = useDetailPref();
  const tabs = local ? LOCAL_TABS : WEB_TABS;
  const [tab, setTabState] = useState<TabKey>("status");
  const [tabTo, setTabTo] = useState<TabKey | null>(null);
  const [logTab, setLogTab] = useState<"events" | "commands" | "runs">("events");
  // 알림창(v1 경고·오류창 규칙 — Ch12Popups): 화면을 연 뒤(장비 시계) 온 popup·호스트 error_event 만
  const [openedAt] = useState(() => Date.now());
  const clearRef = useRef<(c: { kind: string; args: Record<string, unknown> }) => void>(() => {});
  const onPopupClear = useCallback((c: { kind: string; args: Record<string, unknown> }) => clearRef.current(c), []);
  const popups = usePopups(d.feed, openedAt + d.offsetMs + (d.hello?.web?.clockSkewMs ?? 0) - 5_000, onPopupClear);

  useEffect(() => {
    const t = setTimeout(() => { const x = readTab(tabs.map((y) => y.key)); if (x) setTabState(x); }, 0);
    return () => clearTimeout(t);
  }, [tabs]);
  const goTab = (t: TabKey, force = false) => {
    if (t === tab) return;
    if (!force && tab === "recipe" && dirtyRef.current) return setTabTo(t);
    setTabState(t);
    writeTab(t);
  };
  useEffect(() => {
    if (!local) return;
    const prev = document.body.style.background;
    document.body.style.background = "#EEF0F3";
    return () => { document.body.style.background = prev; };
  }, [local]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!notices.some((n) => n.tone === "ok")) return;
    const t = setTimeout(() => setNotices((l) => l.filter((n) => n.tone !== "ok" || Date.now() - n.at < OK_NOTICE_MS)), OK_NOTICE_MS + 200);
    return () => clearTimeout(t);
  }, [notices]);

  const web = d.hello?.web;
  const bench = d.hello?.runMode === "bench" || d.hello?.writesAllowed === false;
  const perms = local ? (d.hello ? { canOperate: true, isAdmin: false, kinds: d.hello.commandKinds ?? [] } : undefined) : web?.perms;
  const st = (d.state?.data ?? null) as Ch12State | null;
  const snap = st?.snapshot;
  const skew = web?.clockSkewMs ?? 0;
  const age = d.state ? now + d.offsetMs - (Date.parse(d.state.ts) - skew) : null;
  const ageSec = age === null ? null : Math.max(0, Math.round(age / 1000));
  const connected = age !== null && age <= LOST_MS && (!local || d.streamUp);
  const plcLink = st?.links?.plc;
  const staleSec = plcStaleSec(bundle);
  const plcOk = connected && plcFresh(plcLink, staleSec);
  const webOnline = !!web?.online;
  const benchOk = (kind: string) => d.bundle?.commands?.find((c) => c.kind === kind)?.benchOk === true;
  const lock = (kind: string, key: string = kind) => lockReason({
    authLost: d.authLost, perms, local, bench, benchOk, connected, webOnline, streamUp: d.streamUp, plcOk, inflight: (k) => !!inflight[k],
  }, kind, key);
  const cancel = useCallback(() => setAsk(null), [setAsk]);

  const pending = Object.fromEntries(Object.entries(plcPending).filter(([t, p]) => {
    const b = bundle?.plcButtons?.find((x) => x.target === t);
    return now - p.at < PLC_PENDING_MS && (snap?.[b ? plcCol(b) : `plc.${t}`] === true) !== p.want;
  }).map(([t, p]) => [t, p.want]));

  const notify = useCallback((n: Omit<Notice, "id" | "at">) =>
    setNotices((l) => [{ ...n, id: `${Date.now()}-${Math.random()}`, at: Date.now() }, ...l].slice(0, 4)), [setNotices]);

  // 오류창(clear_on_close)이 닫히면 오류 표시 해제(v1 runtime_state.clear_error — 창 닫기 = 확인, 잠기지 않았을 때만 보냄)
  const send = d.send;
  useEffect(() => {
    clearRef.current = (c) => {
      if (lock(c.kind)) return;
      void send(c.kind, c.args, "오류창 확인: 오류 표시 해제").then((r) => {
        if (!r.ok || r.body.status !== "accepted") notify({ tone: "warn", title: "오류 표시 해제: 보낼 수 없었음", text: r.body.detail || r.body.error || reasonLabel(asChk(bundle), r.body.reasonCode) });
      });
    };
  });

  const run = async () => {
    if (!ask) return;
    const a = ask;
    const key = a.key ?? (a.plc ? `PLC_BUTTON:${a.plc.target}` : a.kind);
    setAsk(null);
    setInflight((m) => ({ ...m, [key]: (m[key] ?? 0) + 1 }));
    if (a.plc) { const p = a.plc; setPlcPending((m) => ({ ...m, [p.target]: { want: p.want, at: Date.now() } })); }
    const what = `${a.label}${a.detail ? ` ${a.detail}` : ""}`;
    const r = await d.send(a.kind, a.args ?? {}, what.slice(0, 200));
    setInflight((m) => { const next = { ...m }; if ((next[key] = (next[key] ?? 1) - 1) <= 0) delete next[key]; return next; });
    const b = r.body;
    if (!r.ok) notify({ tone: "bad", title: `${what}: 보낼 수 없었음`, text: [SEND_ERROR[b.error ?? ""] ?? "", detail ? [b.error, `HTTP ${r.status}`, b.detail].filter(Boolean).join(" · ") : ""].filter(Boolean).join(" · ") });
    else if (b.status === "accepted") notify({ tone: "ok", title: `${what}: 장비가 받음` });
    else if (b.status === "rejected") notify({ tone: "bad", title: `${what}: 거부`,
      text: `${reasonLabel(asChk(bundle), b.reasonCode)}${b.reasonCode && detail ? ` (${b.reasonCode})` : ""}${detail && b.detail ? ` · ${b.detail}` : ""}` });
    else if (b.status === "expired") notify({ tone: "warn", title: `${what}: 만료`, text: reasonLabel(asChk(bundle), b.reasonCode) });
    else notify({ tone: "warn", title: `${what}: 결과를 기다리는 중`, text: `10 s 안에 결과가 오지 않았습니다. ${local ? "웹 화면 " : ""}기록 탭의 조작 기록에서 확인하세요.` });   // 노트북 기록 탭에는 조작 기록이 없다(T)
    if (a.plc && !(r.ok && b.status === "accepted")) {
      const t = a.plc.target;
      setPlcPending((m) => { const next = { ...m }; delete next[t]; return next; });
    }
  };

  const getRecipe = recipes.get;
  const fullOf = useCallback(async (id: string) => { const r = await getRecipe(id); return r.ok ? r.data.recipe : null; }, [getRecipe]);
  const rowOf = useCallback(async (id: string) => { const r = await getRecipe(id); return r.ok ? ((r.data.recipe.rows[0] ?? null) as Record<string, unknown> | null) : null; },
    [getRecipe]);
  const pcRecipes = useMemo(() => (local ? null : (recipes.list ?? []).filter((r) => (r.kind as string) === "pc")), [local, recipes.list]);

  const plcAge = typeof plcLink?.age === "number" ? `${plcLink.age.toFixed(1)} s` : "나이 없음";
  const mimicNote = !connected ? (local && !d.streamUp ? "노트북 프로그램 연결이 끊겨 조작 잠금" : "장비가 끊겨 조작 잠금")
    : !plcOk ? `PLC 응답이 늦어 조작 잠금${detail ? ` · ${plcLink?.q ?? "-"} · ${plcAge}, 기준 ${staleSec} s` : ""}`
    : bench ? "읽기 전용이라 조작 잠금" : lock("PLC_BUTTON") ? `조회만 · ${lock("PLC_BUTTON")}` : "기호를 눌러 조작";

  const h = d.hello;
  const neverConnected = !!h && !h.instance && !h.webSchemaHash && !h.web?.hasSchema && !h.web?.lastSeenAt && !d.bundle && !d.state;

  // 상태 띠가 스크롤 영역 위로 다 지나가면 그때만 위에 얇은 줄(같은 확인창·같은 동작)
  const [statusEl, setStatusEl] = useState<HTMLDivElement | null>(null);
  const [bar, setBar] = useState<{ top: number; left: number; width: number } | null>(null);
  useEffect(() => {
    if (!statusEl) return;
    let scroller: HTMLElement | null = statusEl.parentElement;
    while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
    let raf = 0;
    const check = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const top = Math.max(scroller ? scroller.getBoundingClientRect().top : 0, 0);
        const r = statusEl.getBoundingClientRect();
        const next = r.bottom <= top + 1 ? { top, left: Math.round(r.left), width: Math.round(r.width) } : null;
        setBar((b) => (!b && !next) || (b && next && b.top === next.top && b.left === next.left && b.width === next.width) ? b : next);
      });
    };
    check();
    window.addEventListener("scroll", check, true);
    window.addEventListener("resize", check);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("scroll", check, true); window.removeEventListener("resize", check); };
  }, [statusEl]);

  if (!d.hello) {
    return (
      <Chk2ModeContext.Provider value={{ local, hmiKinds: [], detail, lockPrefix: LOCK_PREFIX, chkColors: true, lineIcons: true }}>
        {d.authLost ? <Issue level="alarm"><LogIn size={14} className="mr-1 inline" />로그인이 끊겼습니다. 새로고침하세요. 조작이 잠겼습니다.</Issue>
          : d.error ? <Issue level="alarm">{d.error}</Issue>
          : <section className={`animate-pulse rounded-[12px] border border-[#D9DDE3] bg-white p-6 text-center ${FS.body} text-[#5B6470]`}>장비 정보를 읽는 중…</section>}
      </Chk2ModeContext.Provider>
    );
  }

  const up = st?.uplink;
  // 연결 칩(U2 — 챔버K lib/ops2/chk/conn): 연결됨 / 늦음 N초 / 끊김 N초 / 60초 넘으면 '끊김 · 18:05부터'. 노트북 화면은 프로그램과의
  //   stream 이 끊기면 바로 끊김(초는 실제로 지난 시간)
  const cs = connOf(age, now, LATE_MS, LOST_MS, local && !d.streamUp);
  const conn: ConnInfo = neverConnected ? { label: "연결 대기", tone: "neutral" } : { label: <ConnLabel parts={connParts(cs)} />, tone: cs.tone };
  const lostCs = connOf(age, now, LATE_MS, LOST_MS);
  const links: ConnInfo[] = [
    ...(neverConnected ? [] : [{ label: plcOk ? "PLC 정상" : "PLC 값 오래됨", tone: (plcOk || !connected ? "neutral" : "warn") as ConnInfo["tone"] }]),
  ];
  const runMode = d.hello.runMode;
  const modeChip = bench ? "bench" : runMode === "sim" ? "sim" : runMode ? "run" : null;
  const shownTabs = neverConnected ? tabs.filter((t) => t.key === "recipe" || t.key === "log") : tabs;
  const curTab = shownTabs.some((t) => t.key === tab) ? tab : shownTabs[0].key;
  const detailBtn = (
    <button onClick={() => setDetail(!detail)} aria-pressed={detail} title="개발·점검용 정보를 함께 표시합니다."
      className={`flex h-8 items-center gap-1 rounded-[8px] px-2.5 ${FS.small} font-semibold ${
        detail ? "bg-[#3A424D] text-white" : "border border-[#D9DDE3] bg-white text-[#5B6470] hover:bg-[#F5F6F8]"}`}>
      <Code2 size={12} /> 상세 보기 {detail ? "켜짐" : "꺼짐"}
    </button>
  );
  const detailInfo = detail && (
    <span className={`flex flex-wrap items-center gap-2 font-mono ${FS.small} text-[#5B6470]`}>
      {d.hello.version && <span>{d.hello.version}</span>}
      {d.hello.instance && <span>실행 {d.hello.instance.slice(0, 8)}</span>}
      {web && <span>{web.sse ? "명령 통로(SSE)" : "명령 통로 없음(POST 응답으로만)"}</span>}
    </span>
  );
  const localCan = (k: string) => !lock(k);

  return (
    <Chk2ModeContext.Provider value={{ local, hmiKinds: perms?.kinds ?? [], detail, lockPrefix: LOCK_PREFIX, chkColors: true, lineIcons: true }}>
      {local && (
        <div className={`flex flex-wrap items-center gap-2 rounded-[12px] bg-[#3A424D] px-4 py-2 ${FS.body} text-white`}>
          <Laptop size={15} /> <b>노트북 화면</b>
          <span className={`ml-auto flex items-center gap-1 rounded-[8px] px-2 py-0.5 ${FS.small} ${
            !up?.enabled ? "bg-white/10 text-white/80" : up.connected ? "bg-white/15" : "bg-[#B54708] text-white"}`}
            title={up?.enabled ? `마지막 성공 ${up.lastOkAt ? fmtKst(up.lastOkAt) : "-"}${detail && up.lastError ? ` · ${up.lastError}` : ""}` : undefined}>
            {up?.enabled && up.connected ? <Cloud size={12} /> : <CloudOff size={12} />}
            {!up?.enabled ? "웹 연결 사용하지 않음" : up.connected ? "웹 연결됨" : `웹 끊김${(up.queued ?? 0) > 0 ? ` · 미전송 ${up.queued}건` : ""}`}
            {up?.enabled && detail && ` · 보관 ${up.queued ?? 0} · 버림 ${up.dropped ?? 0}`}
          </span>
        </div>
      )}
      {neverConnected ? (
        <section className="rounded-[12px] border border-dashed border-[#C9CED6] bg-white p-6 text-center">
          <p className={`${FS.card} font-bold text-[#1B1F24]`}>장비 프로그램 연결 대기</p>
          <p className={`mt-1 ${FS.body} text-[#5B6470]`}>장비 노트북에서 프로그램을 실행하면 화면이 채워집니다.</p>
        </section>
      ) : (
        <>
          {bar && statusEl && (
            // 스크롤 영역 맨 위에 틈 없이 붙이고 위·아래 여백(8px)까지 화면 바탕색으로 가린다(챔버K W-16 — 뒤 글자가 비치지 않게)
            <div className="fixed z-30 bg-[#EEF0F3] pb-2 pt-2" style={{ top: bar.top, left: bar.left, width: bar.width }} data-status-bar="">
              <StatusBar12 bundle={bundle} st={st} connected={connected} lock={lock} onAsk={setAsk} />
            </div>
          )}
          <div ref={setStatusEl}>
            <StatusBand12 bundle={bundle} st={st} connected={connected} conn={conn} links={links} mode={modeChip}
              equipment={d.hello.equipment ?? equipment} label={web?.label ?? null} lock={lock} onAsk={setAsk} nowMs={now + d.offsetMs} plcOk={plcOk}
              extra={<>{detailInfo}{!d.streamUp && !local && (
                <span className={`flex items-center gap-1 ${FS.small} text-[#5B6470]`}><WifiOff size={12} /> {d.streamEver ? "다시 연결 중…" : "연결 중…"}</span>)}
                {Math.abs(skew) > SKEW_WARN_MS && <span className={`${FS.small} font-semibold text-[#B54708]`}>장비 시계 차 {(skew / 1000).toFixed(1)} s</span>}</>} />
          </div>
        </>
      )}
      {bench && (
        <InfoBand icon={<Lock size={15} />}>
          읽기 전용입니다. 값은 실제 장비에서 읽고, 장비로 보내는 버튼은 잠겨 있습니다.
        </InfoBand>
      )}
      {local && !d.streamUp && d.streamEver && <Issue level="alarm"><b>노트북 프로그램 연결 끊김</b>. 다시 붙는 중이라 조작이 잠겼습니다. 표시는 마지막 값입니다.</Issue>}
      {d.authLost && <Issue level="alarm">로그인이 끊겼습니다. 새로고침하세요. 조작이 잠겼습니다.</Issue>}
      {/* 노트북 화면이 프로그램과 끊겼을 때는 위 띠 한 줄만(챔버K W-24 B2 — hello 를 못 읽은 글은 같은 일이라 겹쳐 내지 않는다) */}
      {d.error && !(local && !d.streamUp && d.streamEver) && <Issue level="alarm">{d.error}</Issue>}
      {web && !web.hasSchema && !neverConnected && <Issue level="warn">장비 정보를 받는 중입니다. 장비가 연결되면 받아 옵니다.</Issue>}
      {perms && !perms.canOperate && !local && !neverConnected && <InfoBand>조회만 가능합니다. 장비 담당자·관리자만 조작할 수 있습니다.</InfoBand>}
      {d.state && !connected && (!local || d.streamUp) && (
        <Issue level="alarm">
          <AlertTriangle size={13} className="mr-1 inline" /><b>장비 끊김{lostCs.since ? ` · ${lostCs.since}부터` : <> <span className="inline-block min-w-[2ch] text-right tabular-nums">{ageSec}</span>초</>}</b>. 표시는 마지막 값이며 조작이 잠겼습니다.
          {webOnline && perms?.canOperate && " 웹은 장비와 이어져 있어 정지 명령은 보낼 수 있습니다."}
        </Issue>
      )}
      <Float>
        <Notices list={notices} onClose={(id) => setNotices((l) => l.filter((n) => n.id !== id))} />
        <PopupStack list={popups.open} onClose={popups.close} />
      </Float>

      <Tabs tabs={shownTabs} value={curTab} onChange={(t) => goTab(t)} right={detailBtn} wrap />

      {(curTab === "status" || curTab === "run") && (
        <Ch12Run view={curTab === "status" ? "status" : "run"} bundle={bundle} st={st} connected={connected} plcOk={plcOk} lock={lock} onAsk={setAsk} feed={d.feed} trend={d.trend}
          nowMs={now + d.offsetMs} skewMs={skew} equipment={equipment} local={local} recipes={local ? null : recipes.list ?? []}
          getRecipe={fullOf} getRow={rowOf} pcRecipes={pcRecipes} onEditSeq={setSeqFor} onLog={() => goTab("log")} send={d.send} notify={notify}
          localCan={local ? localCan : undefined}
          onHmi={shownTabs.some((t) => t.key === "hmi") ? () => goTab("hmi") : undefined}
          onConfig={shownTabs.some((t) => t.key === "config") ? () => goTab("config") : undefined}
          onEditRecipe={shownTabs.some((t) => t.key === "recipe") ? (id) => { setRecipeReq({ id, n: Date.now() }); goTab("recipe"); } : undefined} />
      )}
      {curTab === "hmi" && (
        <Ch12Hmi bundle={bundle} snapshot={snap} st={st} plcOk={plcOk} lockOf={(t) => lock("PLC_BUTTON", `PLC_BUTTON:${t}`)} pending={pending}
          onAsk={setAsk} note={mimicNote} />
      )}
      {curTab === "recipe" && !local && (
        <Ch12Recipes bundle={bundle} recipes={recipes} can={(k) => !lock(k)} onAsk={setAsk} notify={notify} dirtyRef={dirtyRef} openReq={recipeReq} />
      )}
      {curTab === "log" && (
        <div className="space-y-3">
          {!local && (
            <Tabs small value={logTab} onChange={setLogTab}
              tabs={[{ key: "events", label: "로그", title: "장비가 보낸 기록과 공정 진행" }, { key: "commands", label: "조작 기록", title: "웹·노트북에서 보낸 명령과 결과" },
                { key: "runs", label: "공정 이력", title: "끝난 공정과 챔버별 공정 기록" }]} />
          )}
          {(local || logTab === "events") && <Ch12EventFeed bundle={bundle} feed={d.feed} />}
          {!local && logTab === "commands" && <CommandLog bundle={d.bundle} commands={d.commands} plain />}
          {!local && logTab === "runs" && (
            <>
              <RunList bundle={d.bundle} runs={d.runs} plain idInDetail />
              <Ch12History equipment={equipment} bundle={bundle} refreshKey={`${d.runs[0]?.runId ?? ""}-${d.runs[0]?.endedAt ?? ""}`} />
            </>
          )}
          {local && <p className={`${FS.small} text-[#5B6470]`}>레시피·설정·공정 기록·조작 기록은 웹 화면에서 봅니다.</p>}
        </div>
      )}
      {curTab === "config" && !local && !neverConnected && (
        <Chk2Config equipment={equipment} bundle={d.bundle} st={st as unknown as StateData | null} perms={perms ?? null}
          connected={connected} reloadSchema={d.loadSchema} notify={notify} startOpen plainHead keyInDetail
          term={toTerms12} valueText={detail ? undefined : settingValue12} />
      )}

      {/* 떠 있는 상자는 body 포털(U5 — 챔버K W-23 A: 페이지 묶음의 마지막 자식이 되어 여백이 붙지 않게, 열고 닫아도 높이가 그대로) */}
      <Float>
        {seqFor && (
          <Ch12SeqEdit bundle={bundle} st={st} feed={d.feed} ch={seqFor} can={(k) => !lock(k, `${k}@${seqFor}`)} onAsk={setAsk} onClose={() => setSeqFor(null)} />
        )}
        {tabTo && (
          <SimpleConfirm title="저장하지 않음" ok="버리고 나가기" danger text="레시피에 저장하지 않은 변경이 있습니다. 버리고 탭을 바꿀까요?"
            onCancel={() => setTabTo(null)} onOk={() => { dirtyRef.current = false; const t = tabTo; setTabTo(null); goTab(t, true); }} />
        )}
        <Ch12Confirm ask={ask} onOk={run} onCancel={cancel} />
        <TipLayer />
      </Float>
    </Chk2ModeContext.Provider>
  );
}
