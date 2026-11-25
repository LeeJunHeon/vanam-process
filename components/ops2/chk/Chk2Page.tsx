"use client";

// 챔버K v2 장비 화면(메뉴 "CHK v2") — 로그인한 누구나 보고, 조작은 권한대로(hello.web.perms).
// 브라우저 API /api/ops2/[equipment]/v1/*(노트북 로컬 화면 API 와 같은 모양 — W-7 에서 같은 화면 코드가 둘 다 쓴다).
// 명령은 하나씩 따로 보내고 결과 알림도 따로 — 기다리는 동안 막는 것은 같은 명령 종류만(PLC 버튼은 같은 target 만).
// 정지 쪽(logic.STOP_KINDS)은 막지 않는다 — 다른 명령이나 같은 정지의 결과를 기다리는 중에도(다시 눌러도 해가 없고, 첫 명령이 갔는지
// 모를 때 바로 다시 누를 수 있게), 화면 stream 이 끊겨도 웹이 장비와 이어져 있으면(hello.web.online) 보낸다.
// W-10 화면 틀: 제목·장비 고르기 → 상태 띠(모든 탭 위에 늘 — Chk2Status, 스크롤로 안 보이면 위에 얇은 줄) → bench 정보 띠 →
//   탭 운전 · HMI · 레시피 · 기록 · 설정(노트북 로컬 화면은 운전 · HMI · 기록, 주소 ?tab= 에 남김) + 오른쪽 끝 '상세 보기' 토글.
//   레시피 편집 중 저장 안 한 변경이 있으면 탭·장비를 바꿀 때 확인창.
// HMI 탭 = Chk2Hmi(계통도). 잠금(lockOf — 버튼에 자물쇠 + 이유): 로그인 끊김 → 권한(웹 perms·로컬은 hello.commandKinds) → bench(runMode bench·writesAllowed false
//   면 묶음 commands[].benchOk 가 참인 명령만 — 옛 묶음이라 benchOk 가 없으면 전부) → 정지 쪽(연결 또는 웹 온라인이면 됨) →
//   결과 기다리는 중 → 장비 끊김 → PLC 값 오래됨(PLC 버튼·히터 목표·켜기·끄기·리셋).
// hello 를 받기 전에는 '장비 정보를 읽는 중…' 자리표시, v2 프로그램이 붙은 적 없는 장비는 연결 대기 카드(레시피·기록만).
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { AlertTriangle, Code2, Cloud, CloudOff, Laptop, Lock, LockOpen, LogIn, WifiOff } from "lucide-react";
import Chk2Hmi from "./Chk2Hmi";
import { StatusBand, StatusBar, type ConnInfo } from "./Chk2Status";
import Chk2Run from "./Chk2Run";
import Chk2SettingsDrawer, { type DevKey } from "./Chk2SettingsDrawer";
import Chk2DevParams from "./Chk2DevParams";
import { CommandLog, EventFeed, RunList } from "./Chk2Logs";
import Chk2Config from "./Chk2Config";
import Chk2LocalConfig from "./Chk2LocalConfig";
import Chk2History from "./Chk2History";
import Chk2Recipes from "./Chk2Recipes";
import Chk2Manual from "./Chk2Manual";
import { FS, Btn, Card, ConfirmDialog, InfoBand, Issue, Notices, SimpleConfirm, Tabs, TipLayer, type Ask, type Notice } from "./kit";
import { stepName } from "@/lib/ops2/chk/terms";
import { STALE_SEC_DEFAULT, STOP_KINDS, paramValue, plcFresh } from "./logic";
import { reasonLabel } from "./types";
import { useChk2, type Chk2Mode } from "./useChk2";
import { Chk2ModeContext, useDetailPref } from "./mode";
import { fmtKst } from "@/lib/ops2/time";
import { useRecipes } from "./useRecipes";

const STORE_KEY = "vanam-process:chk2-device";
const LATE_MS = 3_000;
const HOLD_KINDS = ["PROCESS_PAUSE", "PROCESS_RESUME", "PROCESS_SKIP"];
const HOLD_MS = 3_000;
const LOST_MS = 10_000;
const SKEW_WARN_MS = 3_000;
const PLC_PENDING_MS = 10_000;     // PLC 버튼 "전환 중" 최대
const OK_NOTICE_MS = 6_000;
const PLC_KINDS = new Set(["PLC_BUTTON", "HEATER_SV", "HEATER_ON", "HEATER_OFF", "HEATER_RESET"]);   // PLC 값이 있어야 하는 명령

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

export type TabKey = "status" | "run" | "hmi" | "manual" | "recipe" | "log" | "config";
// W-21: 상태(장비 박스 + 알림 — 기본 탭) / 운전(대기: 다음 공정, 공정·수동 조작 중: 공정 화면). 공정이 시작·끝나도 탭은 저절로 바뀌지 않는다
const WEB_TABS: { key: TabKey; label: string; title: string }[] = [
  { key: "status", label: "상태", title: "장비 박스와 알림" },
  { key: "run", label: "운전", title: "다음 공정, 공정 중이면 공정 순서·주요 값·추세" },
  { key: "hmi", label: "HMI", title: "장비 계통도와 PLC 버튼" },
  { key: "manual", label: "수동 조작", title: "가스·압력·셔터·파워를 하나씩 조작합니다." },
  { key: "recipe", label: "레시피", title: "공정·히터 레시피 목록과 편집" },
  { key: "log", label: "기록", title: "로그·조작 기록·공정 이력" },
  { key: "config", label: "설정", title: "장비 설정 보기와 적용" },
];
// 노트북: 설정은 보기 전용(W-15 — Chk2LocalConfig)
const LOCAL_TABS = WEB_TABS.filter((t) => t.key !== "recipe").map((t) => (t.key === "config" ? { ...t, title: "장비 설정을 봅니다. 바꾸기는 웹에서 합니다." } : t));
// 노트북 조작(묶음 18, 장비 LOCAL_HMI_CONTROL) — 화면 이름. 옛 장비(값 없음)는 보기와 정지만
const HMI_CONTROL_LABEL: Record<string, string> = { view_stop: "보기·정지만", unlock: "조작 잠김", always: "조작 가능" };

type Device = { equipment: string; label: string | null; runMode: string | null };

export default function Chk2Page() {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [switchTo, setSwitchTo] = useState<string | null>(null);   // 저장 안 한 레시피가 있을 때 바꾸려는 장비
  const dirtyRef = useRef(false);                              // 레시피 편집 중 저장 안 한 변경(Chk2Recipes 가 적는다)

  useEffect(() => {
    void (async () => {
      const r = await fetch("/api/ops2/devices", { cache: "no-store" }).catch(() => null);
      const list: Device[] = r?.ok ? (await r.json()).devices ?? [] : [];
      setDevices(list);
      let saved: string | null = null;
      try { saved = window.localStorage.getItem(STORE_KEY); } catch { /* 저장소 없음 */ }
      const has = (e: string | null) => !!e && list.some((d) => d.equipment === e);
      setPicked(has(saved) ? saved : has("CHK2") ? "CHK2" : list[0]?.equipment ?? null);
    })();
  }, []);

  const pick = (e: string) => {
    if (dirtyRef.current) return setSwitchTo(e);
    setPicked(e);
    try { window.localStorage.setItem(STORE_KEY, e); } catch { /* 저장 실패는 무시 */ }
  };

  return (
    <div className="min-h-full space-y-3 bg-[#EEF0F3] p-3 text-[#1B1F24] sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className={`${FS.title} font-bold text-[#1B1F24]`}>CHK Sputter</h2>
        {devices && devices.length > 0 && (
          <select value={picked ?? ""} onChange={(e) => pick(e.target.value)} aria-label="장비 고르기"
            className={`h-10 rounded-[10px] border border-[#D9DDE3] bg-white px-2 ${FS.body} font-semibold text-[#1B1F24]`}>
            {devices.map((d) => (
              <option key={d.equipment} value={d.equipment}>
                {d.equipment}{d.label ? ` · ${d.label}` : ""}{d.runMode ? ` (${d.runMode})` : ""}
              </option>
            ))}
          </select>
        )}
      </div>
      {devices && !devices.length && (
        <Card><p className={`${FS.body} text-[#5B6470]`}>등록된 v2 장비가 없습니다. 장비 관리(v2)에서 장비를 등록하세요.</p></Card>
      )}
      {picked && <Chk2Device key={picked} equipment={picked} dirtyRef={dirtyRef} />}
      {switchTo && (
        <SimpleConfirm title="저장하지 않음" ok="버리고 바꾸기" danger text="레시피에 저장하지 않은 변경이 있습니다. 버리고 장비를 바꿀까요?"
          onCancel={() => setSwitchTo(null)}
          onOk={() => { dirtyRef.current = false; setSwitchTo(null); pick(switchTo); }} />
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

export function Chk2Device({ equipment, dirtyRef, mode: screen = "web" }: {
  equipment: string; dirtyRef: MutableRefObject<boolean>; mode?: Chk2Mode;
}) {
  const local = screen === "local";
  const d = useChk2(equipment, screen);
  const recipes = useRecipes(equipment, !local);
  const [now, setNow] = useState(() => Date.now());
  const [ask, setAsk] = useState<Ask | null>(null);
  const [inflight, setInflight] = useState<Record<string, number>>({});
  // W-21 — 일시정지·재개·건너뛰기는 받은 뒤 1초 상태가 바뀔 때까지(최대 3초) 같은 버튼을 다시 누르지 못하게
  const [holdUntil, setHoldUntil] = useState<Record<string, number>>({});   // 결과를 기다리는 명령(종류 또는 PLC_BUTTON:target)
  const [notices, setNotices] = useState<Notice[]>([]);
  const [plcPending, setPlcPending] = useState<Record<string, { want: boolean; at: number }>>({});
  const [detail, setDetail] = useDetailPref();
  const tabs = local ? LOCAL_TABS : WEB_TABS;
  const [tab, setTabState] = useState<TabKey>("status");
  const [drawer, setDrawer] = useState<DevKey | null>(null);          // W-21 장비 설정 서랍
  const [tabTo, setTabTo] = useState<TabKey | null>(null);           // 저장 안 한 레시피가 있을 때 가려는 탭
  const [recipeReq, setRecipeReq] = useState<{ id: string | null; n: number } | null>(null);
  const [logTab, setLogTab] = useState<"events" | "commands" | "runs">("events");
  const [unlockUntil, setUnlockUntil] = useState(0);              // 노트북 조작 잠금이 풀린 때까지(ms, 0 = 잠김)

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

  // 노트북 로컬 화면은 이 화면만 있는 페이지 — 바탕색을 화면 규칙(#EEF0F3)으로
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

  // 받음 알림은 잠시 뒤 닫는다(거부·오류는 사람이 닫는다)
  useEffect(() => {
    if (!notices.some((n) => n.tone === "ok")) return;
    const t = setTimeout(() => setNotices((l) => l.filter((n) => n.tone !== "ok" || Date.now() - n.at < OK_NOTICE_MS)),
                         OK_NOTICE_MS + 200);
    return () => clearTimeout(t);
  }, [notices]);

  const web = d.hello?.web;
  const bench = d.hello?.runMode === "bench" || d.hello?.writesAllowed === false;
  const perms = local ? (d.hello ? { canOperate: true, isAdmin: false, kinds: d.hello.commandKinds ?? [] } : undefined) : web?.perms;
  const st = d.state?.data ?? null;
  const snap = st?.snapshot;
  const skew = web?.clockSkewMs ?? 0;
  // 마지막 state 의 나이 — 장비 시계(ts) → 웹 시계(− 시계 차) → 이 브라우저 시계(− 웹과의 차)
  const age = d.state ? now + d.offsetMs - (Date.parse(d.state.ts) - skew) : null;
  const ageSec = age === null ? null : Math.max(0, Math.round(age / 1000));
  const connected = age !== null && age <= LOST_MS && (!local || d.streamUp);   // 로컬은 노트북 프로그램 stream 이 살아 있어야
  const plcLink = st?.links?.plc;
  const staleSec = typeof paramValue(d.bundle, "HEATER_STALE_SEC") === "number"
    ? (paramValue(d.bundle, "HEATER_STALE_SEC") as number) : STALE_SEC_DEFAULT;
  const plcOk = connected && plcFresh(plcLink, staleSec);
  const webOnline = !!web?.online;
  const benchOk = (kind: string) => d.bundle?.commands?.find((c) => c.kind === kind)?.benchOk === true;
  // 노트북 조작(묶음 18): operate 명령은 '잠금을 푼 뒤 조작'이면 잠금을 풀어야 보낸다(정지 쪽·always 는 늘). 잠금은 화면이 한다 —
  // 마지막 조작 뒤 hmiRelockMin 분 동안 아무 조작이 없으면 다시 잠근다
  const hmiControl = d.hello?.hmiControl ?? "view_stop";
  const relockMin = typeof d.hello?.hmiRelockMin === "number" && d.hello.hmiRelockMin > 0 ? d.hello.hmiRelockMin : 10;
  const operate = (kind: string) => d.bundle?.commands?.find((c) => c.kind === kind)?.hmi === "operate";
  const unlocked = !local || hmiControl === "always" || (hmiControl === "unlock" && unlockUntil > now);
  const canUnlock = local && hmiControl === "unlock" && (perms?.kinds ?? []).some(operate);
  useEffect(() => {
    if (!local || hmiControl !== "unlock" || unlockUntil <= Date.now()) return;
    const bump = () => setUnlockUntil((u) => (u > Date.now() ? Date.now() + relockMin * 60_000 : u));
    window.addEventListener("pointerdown", bump, true);
    window.addEventListener("keydown", bump, true);
    return () => { window.removeEventListener("pointerdown", bump, true); window.removeEventListener("keydown", bump, true); };
  }, [local, hmiControl, unlockUntil, relockMin]);

  const lockOf = (kind: string, key: string = kind): string | null => {
    if (d.authLost) return "로그인이 끊겨 새로고침해야 함";
    if (!perms) return "권한 정보를 읽는 중";
    if (local && !perms.kinds.includes(kind)) return "노트북 화면에서 받지 않는 조작이라 웹에서 해야 함";
    if (local && operate(kind) && !unlocked) return "조작 잠김 · 위의 [잠금 풀기]를 누르세요";
    if (!perms.canOperate || !perms.kinds.includes(kind)) return "권한 없음 · 장비 담당자·관리자만 조작합니다";
    if (bench && !benchOk(kind)) return "읽기 전용이라 잠김";
    if (STOP_KINDS.includes(kind)) return connected || webOnline ? null : "장비 끊김";
    if (inflight[key] || (holdUntil[key] ?? 0) > now) return "결과를 기다리는 중";
    if (!connected) return local && !d.streamUp ? "노트북 프로그램 연결 끊김" : "장비 끊김";
    if (PLC_KINDS.has(kind) && !plcOk) return "PLC 값이 오래됨";
    return null;
  };
  const lock = (kind: string) => lockOf(kind);
  const canKey = (kind: string, key: string) => !lockOf(kind, key);
  const cancel = useCallback(() => setAsk(null), []);

  // PLC "전환 중" — 바라는 값이 아직 아니고 10 s 안
  const pending = Object.fromEntries(
    Object.entries(plcPending)
      .filter(([t, p]) => now - p.at < PLC_PENDING_MS
        && (snap?.[`plc.${d.bundle?.plcButtons?.find((b) => b.target === t)?.addr ?? t}`] === true) !== p.want)
      .map(([t, p]) => [t, p.want]),
  );

  const notify = (n: Omit<Notice, "id" | "at">) =>
    setNotices((l) => [{ ...n, id: `${Date.now()}-${Math.random()}`, at: Date.now() }, ...l].slice(0, 4));

  /** 거부 글(W-21) — 건너뛰기·일시정지가 늦었으면 지금 단계로 말한다. 평소 보기에는 블록 번호·판을 쓰지 않는다(상세 보기에서만) */
  const rejectText = (kind: string, code: string | null, det: string | null): string => {
    const cur = st?.step ? `${st.step.no} ${stepName(d.bundle, { type: st.step.type ?? null, label: st.step.label ?? null })}` : "";
    const plainText = code === "PROCESS_PAUSED" ? "이미 일시정지 중입니다"
      : (code === "SKIP_STALE" || code === "PAUSE_STALE") && cur
        ? `이미 다음 단계(${cur})로 넘어가 ${kind === "PROCESS_PAUSE" ? "일시정지하지" : "건너뛰지"} 않았습니다` : "";
    if (detail) return `${plainText || reasonLabel(d.bundle, code)}${code ? ` (${code})` : ""}${det ? ` — ${det}` : ""}`;
    const showDet = det && !/블록|판 \d|판\d/.test(det) ? ` — ${det}` : "";
    return plainText || `${reasonLabel(d.bundle, code)}${showDet}`;
  };

  const run = async () => {
    if (!ask) return;
    const a = ask;
    const key = a.key ?? (a.plc ? `PLC_BUTTON:${a.plc.target}` : a.kind);
    setAsk(null);
    setInflight((m) => ({ ...m, [key]: (m[key] ?? 0) + 1 }));
    if (a.plc) {
      const p = a.plc;
      setPlcPending((m) => ({ ...m, [p.target]: { want: p.want, at: Date.now() } }));
    }
    const what = `${a.label}${a.detail ? ` ${a.detail}` : ""}`;
    const r = await d.send(a.kind, a.args ?? {}, what.slice(0, 200));
    setInflight((m) => {
      const next = { ...m };
      if ((next[key] = (next[key] ?? 1) - 1) <= 0) delete next[key];
      return next;
    });
    const b = r.body;
    if (r.ok && b.status === "accepted" && HOLD_KINDS.includes(a.kind)) setHoldUntil((m) => ({ ...m, [key]: Date.now() + HOLD_MS }));
    if (!r.ok) {
      notify({ tone: "bad", title: `${what}: 보낼 수 없었음`,
               text: `${SEND_ERROR[b.error ?? ""] ?? b.error ?? `HTTP ${r.status}`}${b.detail ? ` · ${b.detail}` : ""}` });
    } else if (b.status === "accepted") {
      notify({ tone: "ok", title: `${what}: 장비가 받음` });
    } else if (b.status === "rejected") {
      notify({ tone: "bad", title: `${what}: 거부`, text: rejectText(a.kind, b.reasonCode ?? null, b.detail ?? null) });
    } else if (b.status === "expired") {
      notify({ tone: "warn", title: `${what}: 만료`, text: reasonLabel(d.bundle, b.reasonCode) });
    } else {
      notify({ tone: "warn", title: `${what}: 결과를 기다리는 중`,
               text: "10 s 안에 결과가 오지 않았습니다. 기록 탭의 조작 기록에서 확인하세요." });
    }
    if (a.plc && !(r.ok && b.status === "accepted")) {
      const t = a.plc.target;
      setPlcPending((m) => {
        const next = { ...m };
        delete next[t];
        return next;
      });
    }
  };

  const plcAge = typeof plcLink?.age === "number" ? `${plcLink.age.toFixed(1)} s` : "나이 없음";
  const plcLocal = local && (perms?.kinds ?? []).includes("PLC_BUTTON");
  const mimicNote = local && connected && !plcLocal ? "보기만 가능 · PLC 버튼은 웹에서"
    : local && connected && !unlocked ? "조작 잠김 · 위의 [잠금 풀기]를 누르세요"
    : !connected ? (local && !d.streamUp ? "노트북 프로그램 연결이 끊겨 조작 잠금" : "장비가 끊겨 조작 잠금")
    : !plcOk ? `PLC 응답이 늦어 조작 잠금${detail ? ` · ${plcLink?.q ?? "-"} · ${plcAge}, 기준 ${staleSec} s` : ""}`
    : bench ? "읽기 전용이라 조작 잠금" : !perms?.canOperate ? "조회만" : "기호를 눌러 조작";

  // 진행 중 공정의 시작 시각(웹 시계 ms) — 런 이력의 진행 중 run, 없으면(노트북 화면) stream 의 run_start(장비 시계 − 시계 차)
  const runStart = st?.runId ? [...d.feed].reverse().find((x) => x.type === "run_start" && x.data.runId === st.runId) : undefined;
  const runStartMs = (() => {
    if (!st?.runId) return null;
    const r = d.runs.find((x) => x.runId === st.runId && x.startedAt);
    if (r?.startedAt) return Date.parse(r.startedAt);
    return runStart ? Date.parse(runStart.ts) - skew : null;
  })();
  const elapsedS = runStartMs !== null ? Math.max(0, (now + d.offsetMs - runStartMs) / 1000) : null;
  const runParams = runStart && runStart.data.params && typeof runStart.data.params === "object" ? runStart.data.params as Record<string, unknown> : null;
  const v1Row = !!runParams && runParams.blocks !== true;

  // v2 프로그램이 웹에 붙은 적 없는 장비 — 안내만. hello 만으로 판정(묶음·state 를 받아 오는 사이 안내가 잠깐 보이지 않게)
  const h = d.hello;
  const neverConnected = !!h && !h.instance && !h.webSchemaHash && !h.web?.hasSchema && !h.web?.lastSeenAt && !d.bundle && !d.state;

  // 상태 띠가 스크롤 영역 위로 다 지나가면 그때만 위에 얇은 줄(같은 확인창·같은 동작) — 겹쳐 뜨는 fixed 요소(레이아웃 안 밀림).
  //   W-16: 스크롤 영역 맨 위(top)에 붙고 줄의 위·아래 여백은 바탕색으로 가린다
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
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", check, true);
      window.removeEventListener("resize", check);
    };
  }, [statusEl]);

  // hello 를 받기 전 — 연결된 적 없는 장비도 전체 화면이 잠깐 보였다 바뀌지 않게 자리표시만(못 받으면 오류 안내)
  if (!d.hello) {
    return (
      <Chk2ModeContext.Provider value={{ local, hmiKinds: [], detail, chkWords: true, chkColors: true }}>
        {d.authLost ? <Issue level="alarm"><LogIn size={14} className="mr-1 inline" />로그인이 끊겼습니다. 새로고침하세요. 조작이 잠겼습니다.</Issue>
          : d.error ? <Issue level="alarm">{d.error}</Issue>
          : <section className={`animate-pulse rounded-[12px] border border-[#D9DDE3] bg-white p-6 text-center ${FS.body} text-[#5B6470]`}>장비 정보를 읽는 중…</section>}
      </Chk2ModeContext.Provider>
    );
  }

  const up = st?.uplink;
  const chipAge = local && !d.streamUp && age !== null ? Math.max(age, LOST_MS + 1) : age;   // 로컬은 stream 이 끊기면 바로 끊김
  const conn: ConnInfo = neverConnected ? { label: "연결 대기", tone: "neutral" }
    : chipAge === null ? { label: "상태 없음", tone: "neutral" }
    : chipAge <= LATE_MS ? { label: `연결됨 · ${ageSec ?? 0}초 전`, tone: "neutral" }
    : chipAge <= LOST_MS ? { label: `늦음 ${ageSec}초`, tone: "warn" } : { label: `끊김 ${ageSec}초`, tone: "alarm" };
  const runMode = d.hello.runMode;
  const modeChip = bench ? "bench" : runMode === "sim" ? "sim" : runMode ? "run" : null;
  const shownTabs = neverConnected ? tabs.filter((t) => t.key === "recipe" || t.key === "log")
    : tabs.filter((t) => t.key !== "manual" || !!d.bundle?.manual);      // 옛 묶음(수동 조작 없음)은 탭을 숨긴다
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

  return (
    <Chk2ModeContext.Provider value={{ local, hmiKinds: perms?.kinds ?? [], detail, chkWords: true, chkColors: true }}>
      {local && (
        <div className={`flex flex-wrap items-center gap-2 rounded-[12px] bg-[#3A424D] px-4 py-2 ${FS.body} text-white`}>
          <Laptop size={15} /> <b>노트북 화면</b>
          <span className={`flex items-center gap-1.5 rounded-[8px] bg-white/10 px-2 py-0.5 ${FS.small}`}
            title="노트북에서 받는 조작은 장비 설정의 '노트북 조작'이 정합니다. 정지 버튼은 늘 누를 수 있습니다.">
            {hmiControl === "unlock"
              ? (unlocked
                ? <><LockOpen size={12} /> 조작 가능 · {Math.max(1, Math.ceil((unlockUntil - now) / 60_000))}분 뒤 잠김</>
                : <><Lock size={12} /> 조작 잠김</>)
              : HMI_CONTROL_LABEL[hmiControl] ?? hmiControl}
          </span>
          {canUnlock && (unlocked
            ? <Btn size="sm" kind="ghost" className="text-white hover:bg-white/10" onClick={() => setUnlockUntil(0)}>다시 잠그기</Btn>
            : <Btn size="sm" onClick={() => setUnlockUntil(Date.now() + relockMin * 60_000)}
                title={`${relockMin}분 동안 조작이 없으면 다시 잠깁니다.`}><LockOpen size={12} /> 잠금 풀기</Btn>)}
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
          <p className={`mt-1 ${FS.body} text-[#5B6470]`}>
            장비 노트북에서 프로그램을 실행하면 화면이 채워집니다.
          </p>
        </section>
      ) : (
        <>
          {bar && statusEl && (
            // 스크롤 영역 맨 위에 틈 없이 붙이고 위쪽 여백(8px)·아래 여백까지 화면 바탕색으로 가린다(W-16 — 뒤 글자가 비치지 않게)
            <div className="fixed z-30 bg-[#EEF0F3] pb-2 pt-2" style={{ top: bar.top, left: bar.left, width: bar.width }}>
              <StatusBar bundle={d.bundle} st={st} connected={connected} lock={lock} onAsk={setAsk} />
            </div>
          )}
          <div ref={setStatusEl}>
            <StatusBand bundle={d.bundle} st={st} connected={connected} conn={conn} mode={modeChip} equipment={d.hello.equipment ?? equipment}
              label={web?.label ?? null} lock={lock} onAsk={setAsk} lastRun={d.runs[0] ?? null} startedMs={runStartMs} elapsedS={elapsedS}
              blocks={d.runBlocks?.blocks ?? null} nowMs={now + d.offsetMs} v1Row={v1Row}
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
      {local && !d.streamUp && d.streamEver && (
        <Issue level="alarm"><b>노트북 프로그램 연결 끊김</b>. 다시 붙는 중이라 조작이 잠겼습니다. 표시는 마지막 값입니다.</Issue>
      )}
      {d.authLost && <Issue level="alarm">로그인이 끊겼습니다. 새로고침하세요. 조작이 잠겼습니다.</Issue>}
      {d.error && <Issue level="alarm">{d.error}</Issue>}
      {web && !web.hasSchema && !neverConnected && <Issue level="warn">장비 정보를 받는 중입니다. 장비가 연결되면 받아 옵니다.</Issue>}
      {perms && !perms.canOperate && !local && !neverConnected && (
        <InfoBand>조회만 가능합니다. 장비 담당자·관리자만 조작할 수 있습니다.</InfoBand>
      )}
      {d.state && !connected && (!local || d.streamUp) && (
        <Issue level="alarm">
          <AlertTriangle size={13} className="mr-1 inline" /><b>장비 끊김 {ageSec}초</b>. 표시는 마지막 값이며 조작이 잠겼습니다.
          {webOnline && perms?.canOperate && " 웹은 장비와 이어져 있어 정지 명령은 보낼 수 있습니다."}
        </Issue>
      )}
      <Notices list={notices} onClose={(id) => setNotices((l) => l.filter((n) => n.id !== id))} />

      <Tabs tabs={shownTabs} value={curTab} onChange={(t) => goTab(t)} right={detailBtn} wrap />

      {(curTab === "status" || curTab === "run") && (
        <Chk2Run equipment={equipment} bundle={d.bundle} st={st} runBlocks={d.runBlocks} editBase={d.editBase} feed={d.feed} trend={d.trend}
          view={curTab === "status" ? "status" : "run"} onSettings={setDrawer}
          recipes={local ? null : recipes} lock={lock} canKey={canKey} onAsk={setAsk} nowMs={now + d.offsetMs} skewMs={skew}
          onHmi={() => goTab("hmi")} onLog={() => goTab("log")}
          onManual={shownTabs.some((t) => t.key === "manual") ? () => goTab("manual") : undefined}
          onConfig={shownTabs.some((t) => t.key === "config") ? () => goTab("config") : undefined}
          onEditRecipe={local ? undefined : (id) => { setRecipeReq({ id, n: Date.now() }); goTab("recipe"); }} />
      )}
      {curTab === "hmi" && (
        <Chk2Hmi bundle={d.bundle} snapshot={snap} links={st?.links} plcOk={plcOk} lockOf={(t) => lockOf("PLC_BUTTON", `PLC_BUTTON:${t}`)} pending={pending}
          onAsk={setAsk} note={mimicNote} viewOnly={local && !plcLocal} />
      )}
      {curTab === "manual" && (
        <Chk2Manual bundle={d.bundle} st={st} lock={lock} onAsk={setAsk} onHmi={() => goTab("hmi")} onSettings={setDrawer} nowMs={now + d.offsetMs}
          onConfig={shownTabs.some((t) => t.key === "config") ? () => goTab("config") : undefined} />
      )}
      {curTab === "recipe" && !local && (
        <Chk2Recipes bundle={d.bundle} st={st} recipes={recipes} lock={lock} onAsk={setAsk} notify={notify} dirtyRef={dirtyRef}
          listOnly={neverConnected} openReq={recipeReq} />
      )}
      {curTab === "log" && (
        <div className="space-y-3">
          {!local && (
            <Tabs small value={logTab} onChange={setLogTab}
              tabs={[{ key: "events", label: "로그" }, { key: "commands", label: "조작 기록" }, { key: "runs", label: "공정 이력" }]} />
          )}
          {(local || logTab === "events") && <EventFeed bundle={d.bundle} feed={d.feed} fill plain commands={local ? undefined : d.commands} />}
          {!local && logTab === "commands" && <CommandLog bundle={d.bundle} commands={d.commands} plain />}
          {!local && logTab === "runs" && (
            <>
              <RunList bundle={d.bundle} runs={d.runs} plain />
              <Chk2History equipment={equipment} bundle={d.bundle} refreshKey={`${d.runs[0]?.runId ?? ""}-${d.runs[0]?.endedAt ?? ""}`} />
            </>
          )}
          {local && <p className={`${FS.small} text-[#5B6470]`}>레시피·공정 기록·조작 기록은 웹 화면에서</p>}
        </div>
      )}
      {curTab === "config" && !local && !neverConnected && (
        <Chk2Config equipment={equipment} bundle={d.bundle} st={st} perms={perms ?? null} connected={connected}
          reloadSchema={d.loadSchema} notify={notify} startOpen plainHead />
      )}
      {curTab === "config" && local && <Chk2LocalConfig bundle={d.bundle} st={st} />}

      {drawer && (
        <Chk2SettingsDrawer dev={drawer} bundle={d.bundle} st={st} onClose={() => setDrawer(null)}
          controller={st?.devParams && ["gas", "pressure", "ig"].includes(drawer) ? (
            <Chk2DevParams dev={drawer === "ig" ? "ig" : "mfc"} bundle={d.bundle} st={st}
              canWrite={!local && !!perms?.isAdmin && (perms?.kinds ?? []).includes("DEVICE_PARAM_WRITE")}
              writeLock={lock("DEVICE_PARAM_WRITE")} readLock={local ? "노트북 화면은 보기만 합니다" : lock("DEVICE_PARAMS_READ")}
              onAsk={setAsk} onRead={() => setAsk({ kind: "DEVICE_PARAMS_READ", label: "컨트롤러 값 다시 읽기",
                note: "MFC 컨트롤러에 질의만 보내 저장된 값을 다시 읽습니다. 공정·수동 조작 중이면 끝난 뒤 읽습니다." })} />
          ) : undefined}
          editor={!local && !neverConnected ? (key) => (
            <Chk2Config equipment={equipment} bundle={d.bundle} st={st} perms={perms ?? null} connected={connected}
              reloadSchema={d.loadSchema} notify={notify} startOpen onlyKeys={[key]} />
          ) : undefined} />
      )}
      {tabTo && (
        <SimpleConfirm title="저장하지 않음" ok="버리고 나가기" danger text="레시피에 저장하지 않은 변경이 있습니다. 버리고 탭을 바꿀까요?"
          onCancel={() => setTabTo(null)}
          onOk={() => { dirtyRef.current = false; const t = tabTo; setTabTo(null); goTab(t, true); }} />
      )}
      <ConfirmDialog ask={ask} onOk={run} onCancel={cancel} />
      <TipLayer />
    </Chk2ModeContext.Provider>
  );
}
