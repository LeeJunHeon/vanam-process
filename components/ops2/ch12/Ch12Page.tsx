"use client";

// 챔버12(CH1&2) v2 장비 화면(메뉴 "CH1&2 v2", 2026-11-18 — 챔버K v2 화면 W-10·W-11 틀로 다시 만듦).
// 화면 틀: 제목·장비 고르기 → 상태 띠(모든 탭 위에 늘 — Ch12Status, 스크롤로 안 보이면 위에 얇은 줄) → bench 정보 띠 →
//   탭 운전 · HMI · 레시피 · 기록 · 설정(노트북 로컬 화면은 운전 · HMI · 기록, 주소 ?tab= 에 남김) + 오른쪽 끝 '상세 보기' 토글.
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
import { FS, Card, InfoBand, Issue, Notices, SimpleConfirm, Tabs, type Ask, type Notice } from "../chk/kit";
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
import { toTerms12 } from "@/lib/ops2/ch12/terms";

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

export type TabKey = "run" | "hmi" | "recipe" | "log" | "config";
export const FEED_MAIN_KEEP12 = 1500;
export const WEB_TABS: { key: TabKey; label: string; title: string }[] = [
  { key: "run", label: "운전", title: "CH1·CH2 공정 상태·주요 값·장비 카드와 아래 칸 조작" },
  { key: "hmi", label: "HMI", title: "장비 계통도와 PLC 버튼" },
  { key: "recipe", label: "레시피", title: "공정·Plasma Cleaning 레시피 목록과 편집" },
  { key: "log", label: "기록", title: "로그·조작 기록·공정 이력" },
  { key: "config", label: "설정", title: "장비 설정 보기와 적용" },
];
export const LOCAL_TABS = WEB_TABS.filter((t) => t.key === "run" || t.key === "hmi" || t.key === "log");

type Device = { equipment: string; label: string | null; runMode: string | null };
/** 챔버12 장비 ID — CH12(운전)·CH12-SIM(시뮬레이터) 등 CH12 로 시작 */
const isCh12 = (e: string) => /^CH12(\b|-)/.test(e);

export default function Ch12Page() {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [switchTo, setSwitchTo] = useState<string | null>(null);
  const dirtyRef = useRef(false);

  useEffect(() => {
    void (async () => {
      const r = await fetch("/api/ops2/devices", { cache: "no-store" }).catch(() => null);
      const all: Device[] = r?.ok ? (await r.json()).devices ?? [] : [];
      const list = all.filter((d) => isCh12(d.equipment));
      setDevices(list);
      let saved: string | null = null;
      try { saved = window.localStorage.getItem(STORE_KEY); } catch { /* 저장소 없음 */ }
      const has = (e: string | null) => !!e && list.some((d) => d.equipment === e);
      setPicked(has(saved) ? saved : has("CH12") ? "CH12" : list[0]?.equipment ?? null);
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
        <h2 className={`${FS.title} font-bold text-[#1B1F24]`}>CH1&amp;2 v2</h2>
        {devices && devices.length > 0 && (
          <select value={picked ?? ""} onChange={(e) => pick(e.target.value)} aria-label="장비 고르기"
            className={`h-10 rounded-[10px] border border-[#D9DDE3] bg-white px-2 ${FS.body} font-semibold text-[#1B1F24]`}>
            {devices.map((d) => (
              <option key={d.equipment} value={d.equipment}>{d.equipment}{d.label ? ` · ${d.label}` : ""}{d.runMode ? ` (${d.runMode})` : ""}</option>
            ))}
          </select>
        )}
      </div>
      {devices && !devices.length && (
        <Card><p className={`${FS.body} text-[#5B6470]`}>등록된 CH1&amp;2 장비가 없습니다. 장비 관리에서 장비를 등록하세요.</p></Card>
      )}
      {picked && <Ch12Device key={picked} equipment={picked} dirtyRef={dirtyRef} />}
      {switchTo && (
        <SimpleConfirm title="저장하지 않음" ok="버리고 바꾸기" danger text="레시피에 저장하지 않은 변경이 있습니다. 버리고 장비를 바꿀까요?"
          onCancel={() => setSwitchTo(null)} onOk={() => { dirtyRef.current = false; setSwitchTo(null); pick(switchTo); }} />
      )}
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
  const [detail, setDetail] = useDetailPref();
  const tabs = local ? LOCAL_TABS : WEB_TABS;
  const [tab, setTabState] = useState<TabKey>("run");
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
    else notify({ tone: "warn", title: `${what}: 결과를 기다리는 중`, text: "10 s 안에 결과가 오지 않았습니다. 기록 탭의 조작 기록에서 확인하세요." });
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
      <Chk2ModeContext.Provider value={{ local, hmiKinds: [], detail, lockPrefix: LOCK_PREFIX }}>
        {d.authLost ? <Issue level="alarm"><LogIn size={14} className="mr-1 inline" />로그인이 끊겼습니다. 새로고침하세요. 조작이 잠겼습니다.</Issue>
          : d.error ? <Issue level="alarm">{d.error}</Issue>
          : <section className={`animate-pulse rounded-[12px] border border-[#D9DDE3] bg-white p-6 text-center ${FS.body} text-[#5B6470]`}>장비 정보를 읽는 중…</section>}
      </Chk2ModeContext.Provider>
    );
  }

  const up = st?.uplink;
  const chipAge = local && !d.streamUp && age !== null ? Math.max(age, LOST_MS + 1) : age;
  const who = local ? "노트북 프로그램" : "장비";
  const conn: ConnInfo = neverConnected ? { label: "연결 대기", tone: "neutral" }
    : chipAge === null ? { label: "상태 없음", tone: "neutral" }
    : chipAge <= LATE_MS ? { label: `${who} 연결됨 · ${ageSec ?? 0}초 전`, tone: "neutral" }
    : chipAge <= LOST_MS ? { label: `${who} 늦음 ${ageSec}초`, tone: "warn" } : { label: `${who} 끊김 ${ageSec}초`, tone: "alarm" };
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
    <Chk2ModeContext.Provider value={{ local, hmiKinds: perms?.kinds ?? [], detail, lockPrefix: LOCK_PREFIX }}>
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
          <p className={`${FS.card} font-bold text-[#1B1F24]`}>장비 프로그램(v2) 연결 대기</p>
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
      {d.error && <Issue level="alarm">{d.error}</Issue>}
      {web && !web.hasSchema && !neverConnected && <Issue level="warn">장비 정보를 받는 중입니다. 장비가 연결되면 받아 옵니다.</Issue>}
      {perms && !perms.canOperate && !local && !neverConnected && <InfoBand>조회만 가능합니다. 장비 담당자·관리자만 조작할 수 있습니다.</InfoBand>}
      {d.state && !connected && (!local || d.streamUp) && (
        <Issue level="alarm">
          <AlertTriangle size={13} className="mr-1 inline" /><b>장비 끊김 {ageSec}초</b>. 표시는 마지막 값이며 조작이 잠겼습니다.
          {webOnline && perms?.canOperate && " 웹은 장비와 이어져 있어 정지 명령은 보낼 수 있습니다."}
        </Issue>
      )}
      <Notices list={notices} onClose={(id) => setNotices((l) => l.filter((n) => n.id !== id))} />
      <PopupStack list={popups.open} onClose={popups.close} />

      <Tabs tabs={shownTabs} value={curTab} onChange={(t) => goTab(t)} right={detailBtn} />

      {curTab === "run" && (
        <Ch12Run bundle={bundle} st={st} connected={connected} plcOk={plcOk} lock={lock} onAsk={setAsk} feed={d.feed} trend={d.trend}
          nowMs={now + d.offsetMs} skewMs={skew} equipment={equipment} local={local} recipes={local ? null : recipes.list ?? []}
          getRecipe={fullOf} getRow={rowOf} pcRecipes={pcRecipes} onEditSeq={setSeqFor} onLog={() => goTab("log")} send={d.send} notify={notify}
          localCan={local ? localCan : undefined} />
      )}
      {curTab === "hmi" && (
        <Ch12Hmi bundle={bundle} snapshot={snap} st={st} plcOk={plcOk} lockOf={(t) => lock("PLC_BUTTON", `PLC_BUTTON:${t}`)} pending={pending}
          onAsk={setAsk} note={mimicNote} />
      )}
      {curTab === "recipe" && !local && (
        <Ch12Recipes bundle={bundle} recipes={recipes} can={(k) => !lock(k)} onAsk={setAsk} notify={notify} dirtyRef={dirtyRef} />
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
          connected={connected} reloadSchema={d.loadSchema} notify={notify} startOpen plainHead term={toTerms12} keyInDetail />
      )}

      {seqFor && (
        <Ch12SeqEdit bundle={bundle} st={st} feed={d.feed} ch={seqFor} can={(k) => !lock(k, `${k}@${seqFor}`)} onAsk={setAsk} onClose={() => setSeqFor(null)} />
      )}
      {tabTo && (
        <SimpleConfirm title="저장하지 않음" ok="버리고 나가기" danger text="레시피에 저장하지 않은 변경이 있습니다. 버리고 탭을 바꿀까요?"
          onCancel={() => setTabTo(null)} onOk={() => { dirtyRef.current = false; const t = tabTo; setTabTo(null); goTab(t, true); }} />
      )}
      <Ch12Confirm ask={ask} onOk={run} onCancel={cancel} />
    </Chk2ModeContext.Provider>
  );
}
