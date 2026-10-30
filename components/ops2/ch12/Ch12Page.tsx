"use client";

// 챔버12(CH1&2) v2 장비 화면(메뉴 "CH1&2 v2") — 챔버K Chk2Page 와 같은 구조: 장비 고르기(CH12·CH12-SIM) → Ch12Device.
// 데이터는 챔버K useChk2 그대로(hello·schema(묶음)·stream·commands·runs — 같은 /api/ops2/[equipment]/v1/* 와 노트북 /api/v1/*).
// 한 페이지 순서: 연결 줄 → 장비 전체 줄(ALL STOP·부저 정지·PLC·로봇·전체 알람·정지 순서) → CH1 | CH2 나란히(Ch12Chamber — 상태·조작·
// 장비 그림·1초 값·목표값·공정 중 수정·로그) → CH2 히터·두께 | 플라즈마 클리닝 | TSP → 로봇·로드락·PLC 버튼 →
// 레시피(웹만) → 공유 로그 | 조작 기록·런 이력 → 공정 기록(챔버별) → 설정(챔버K Chk2Config 그대로).
// 명령은 하나씩, 결과 알림도 따로(챔버K 와 같은 토스트). 기다리는 동안 막는 단위는 '명령@챔버'(PLC 버튼은 target).
// 정지 쪽(STOP·ALL STOP·부저·히터 정지·PC/TSP 정지)은 막지 않고, 화면 stream 이 끊겨도 웹이 장비와 이어져 있으면 보낸다.
// 노트북 로컬 화면(hmi/ch12 → Chamber.Total_program v2\hmi): 같은 Ch12Device 를 mode local — 권한 = hello.commandKinds,
// bench 면 읽기 전용. 레시피 편집·설정·공정 기록·명령 기록·장비 고르기는 없다 — 대신 장비 폴더 레시피 파일 고르기(Ch12LocalFiles).
// 알림창(Ch12Popups — v1 경고 5 s·오류창·호스트 15 s, 중복 억제·동시 5개, 오류창 닫으면 오류 표시 해제)은 두 화면 모두.
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { AlertTriangle, BellOff, Clock, Cloud, CloudOff, Code2, Eye, Laptop, Lock, LogIn, OctagonX, WifiOff } from "lucide-react";
import Chk2Config from "../chk/Chk2Config";
import { CommandLog, EventFeed, RunList } from "../chk/Chk2Logs";
import { ConfirmDialog, Notices, SimpleConfirm, type Ask, type Notice } from "../chk/kit";
import { plcFresh } from "../chk/logic";
import { Chk2ModeContext, useDetailPref } from "../chk/mode";
import { reasonLabel, type StateData } from "../chk/types";
import { useChk2, type Chk2Mode } from "../chk/useChk2";
import { useRecipes } from "../chk/useRecipes";
import { fmtKst } from "@/lib/ops2/time";
import Ch12Chamber from "./Ch12Chamber";
import { HeaterThicknessPanel, LoadLockPanel, PcPanel, RobotPanel, TspPanel } from "./Ch12Aux";
import { Btn, PlcPanel } from "./Ch12Controls";
import Ch12History from "./Ch12History";
import { LocalFiles } from "./Ch12LocalFiles";
import { PopupStack, usePopups } from "./Ch12Popups";
import Ch12Recipes from "./Ch12Recipes";
import Ch12SeqEdit from "./Ch12SeqEdit";
import { BUZZER_TARGET, KINDS, STOP_KINDS12, feedChamber, hasKind, pickKind, plcStaleSec } from "./logic";
import { asCh12, asChk, type Ch12State } from "./types";

const STORE_KEY = "vanam-process:ch12-device";
const LATE_MS = 3_000;
const LOST_MS = 10_000;
const SKEW_WARN_MS = 3_000;
const PLC_PENDING_MS = 10_000;
const OK_NOTICE_MS = 6_000;

const SEND_ERROR: Record<string, string> = {
  device_offline: "장비 연결 끊김(마지막 연락 10 s 넘음)",
  forbidden: "권한 없음 — 장비 담당자·관리자만 조작",
  no_schema: "장비 정의를 아직 받지 못함",
  unknown_kind: "웹에서 낼 수 없는 명령",
  bad_args: "인자 오류",
  config_path: "설정 변경은 설정 화면에서",
  unknown_device: "등록되지 않았거나 꺼진 장비",
  network: "웹 서버에 닿지 않음",
};

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
    <div className="space-y-3 p-3 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-bold text-gray-900">CH1&2 v2</h2>
        {devices && devices.length > 0 && (
          <select value={picked ?? ""} onChange={(e) => pick(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-semibold text-gray-700">
            {devices.map((d) => (
              <option key={d.equipment} value={d.equipment}>
                {d.equipment}{d.label ? ` · ${d.label}` : ""}{d.runMode ? ` (${d.runMode})` : ""}
              </option>
            ))}
          </select>
        )}
      </div>
      {devices && !devices.length && (
        <p className="rounded-2xl border border-gray-100 bg-white p-4 text-xs text-gray-500">
          등록된 CH1&2 v2 장비(CH12·CH12-SIM)가 없습니다. 장비 관리(v2)에서 장비를 등록하세요.
        </p>
      )}
      {picked && <Ch12Device key={picked} equipment={picked} dirtyRef={dirtyRef} />}
      {switchTo && (
        <SimpleConfirm title="저장 안 함" ok="버리고 바꾸기" danger text="레시피에 저장하지 않은 변경이 있습니다. 버리고 장비를 바꿀까요?"
          onCancel={() => setSwitchTo(null)}
          onOk={() => { dirtyRef.current = false; setSwitchTo(null); pick(switchTo); }} />
      )}
    </div>
  );
}

export function Ch12Device({ equipment, dirtyRef, mode: screen = "web" }: {
  equipment: string; dirtyRef: MutableRefObject<boolean>; mode?: Chk2Mode;
}) {
  const local = screen === "local";
  const d = useChk2(equipment, screen);
  const recipes = useRecipes(equipment, !local);
  const bundle = asCh12(d.bundle);
  const [now, setNow] = useState(() => Date.now());
  const [ask, setAsk] = useState<Ask | null>(null);
  const [inflight, setInflight] = useState<Record<string, number>>({});
  const [notices, setNotices] = useState<Notice[]>([]);
  const [plcPending, setPlcPending] = useState<Record<string, { want: boolean; at: number }>>({});
  const [seqFor, setSeqFor] = useState<"ch1" | "ch2" | null>(null);
  const [detail, setDetail] = useDetailPref();
  // 알림창(v1 경고·오류창 규칙 — Ch12Popups): 화면을 연 뒤(장비 시계) 온 popup·호스트 error_event 만
  const [openedAt] = useState(() => Date.now());
  const clearRef = useRef<(c: { kind: string; args: Record<string, unknown> }) => void>(() => {});
  const onPopupClear = useCallback((c: { kind: string; args: Record<string, unknown> }) => clearRef.current(c), []);
  const popups = usePopups(d.feed, openedAt + d.offsetMs + (d.hello?.web?.clockSkewMs ?? 0) - 5_000, onPopupClear);

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
  const bench = local && (d.hello?.runMode === "bench" || d.hello?.writesAllowed === false);
  const perms = local
    ? (d.hello ? { canOperate: !bench, isAdmin: false, kinds: bench ? [] : d.hello.commandKinds ?? [] } : undefined)
    : web?.perms;
  const st = (d.state?.data ?? null) as Ch12State | null;
  const snap = st?.snapshot;
  const skew = web?.clockSkewMs ?? 0;
  const age = d.state ? now + d.offsetMs - (Date.parse(d.state.ts) - skew) : null;
  const ageSec = age === null ? null : Math.max(0, Math.round(age / 1000));
  const connected = age !== null && age <= LOST_MS && (!local || d.streamUp);
  const plcLink = st?.links?.plc;
  const staleSec = plcStaleSec(bundle);
  const plcOk = connected && plcFresh(plcLink, staleSec);
  const canOperate = !!perms?.canOperate && !d.authLost;
  const webOnline = !!web?.online;

  const allowed = (kind: string, key: string) => {
    if (!canOperate || !perms?.kinds.includes(kind)) return false;
    if (STOP_KINDS12.includes(kind)) return connected || webOnline;
    return !inflight[key] && connected;
  };
  const can = (kind: string) => allowed(kind, kind);
  const canCh = (ch: string) => (kind: string) => allowed(kind, `${kind}@${ch}`);
  const canPlc = (target: string) => allowed("PLC_BUTTON", `PLC_BUTTON:${target}`);
  const cancel = useCallback(() => setAsk(null), [setAsk]);

  const pending = Object.fromEntries(
    Object.entries(plcPending)
      .filter(([t, p]) => {
        const b = bundle?.plcButtons?.find((x) => x.target === t);
        return now - p.at < PLC_PENDING_MS && (snap?.[`plc.${(b?.addr ?? t).toLowerCase()}`] === true) !== p.want;
      })
      .map(([t, p]) => [t, p.want]),
  );

  const notify = useCallback((n: Omit<Notice, "id" | "at">) =>
    setNotices((l) => [{ ...n, id: `${Date.now()}-${Math.random()}`, at: Date.now() }, ...l].slice(0, 4)), []);

  // 오류창(clear_on_close)이 닫히면 오류 표시 해제(v1 runtime_state.clear_error — 창 닫기 = 확인, 권한이 있을 때만 보냄)
  const send = d.send;
  useEffect(() => {
    clearRef.current = (c) => {
      if (!allowed(c.kind, c.kind)) return;
      void send(c.kind, c.args, "오류창 확인 — 오류 표시 해제").then((r) => {
        if (!r.ok || r.body.status !== "accepted") notify({ tone: "warn", title: "오류 표시 해제 — 보내지 못함", text: r.body.detail || r.body.error || r.body.reasonCode });
      });
    };
  });

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
    if (!r.ok) {
      notify({ tone: "bad", title: `${what} — 보내지 못함`,
               text: `${SEND_ERROR[b.error ?? ""] ?? b.error ?? `HTTP ${r.status}`}${b.detail ? ` · ${b.detail}` : ""}` });
    } else if (b.status === "accepted") {
      notify({ tone: "ok", title: `${what} — 장비가 받음` });
    } else if (b.status === "rejected") {
      notify({ tone: "bad", title: `${what} — 거부`,
               text: `${reasonLabel(asChk(bundle), b.reasonCode)}${b.reasonCode && detail ? ` (${b.reasonCode})` : ""}${b.detail ? ` — ${b.detail}` : ""}` });
    } else if (b.status === "expired") {
      notify({ tone: "warn", title: `${what} — 만료`, text: reasonLabel(asChk(bundle), b.reasonCode) });
    } else {
      notify({ tone: "warn", title: `${what} — 결과를 기다리는 중`, text: "10 s 안에 결과가 오지 않았습니다. 조작 기록에서 확인하세요." });
    }
    if (a.plc && !(r.ok && b.status === "accepted")) {
      const t = a.plc.target;
      setPlcPending((m) => { const next = { ...m }; delete next[t]; return next; });
    }
  };

  const mode = d.hello?.runMode;
  const plcAge = typeof plcLink?.age === "number" ? `${plcLink.age.toFixed(1)} s` : "나이 없음";
  const mimicNote = !connected ? (local && !d.streamUp ? "노트북 프로그램 연결 끊김 — 조작 잠금" : "장비 끊김 — 조작 잠금")
    : !plcOk ? `PLC 응답 늦음 — 조작 잠금${detail ? ` (${plcLink?.q ?? "-"} · ${plcAge}, 기준 ${staleSec} s)` : ""}`
    : !canOperate ? "조회만" : !perms?.kinds.includes("PLC_BUTTON") ? "PLC 버튼 권한·정의 없음 — 보기만" : "노드를 눌러 조작";

  const h = d.hello;
  const neverConnected = !!h && !h.instance && !h.webSchemaHash && !h.web?.hasSchema && !h.web?.lastSeenAt && !d.bundle && !d.state;

  if (!d.hello) {
    return (
      <Chk2ModeContext.Provider value={{ local, hmiKinds: [], detail }}>
        {d.authLost ? (
          <p className="flex items-center gap-2 rounded-2xl border border-rose-300 bg-rose-50 p-3 text-xs font-bold text-rose-700">
            <LogIn size={14} /> 로그인이 끊겼습니다 — 새로고침하세요. 조작이 잠겼습니다.
          </p>
        ) : d.error ? (
          <p className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{d.error}</p>
        ) : (
          <section className="animate-pulse rounded-2xl border border-gray-100 bg-gray-50 p-6 text-center text-sm text-gray-400">장비 정보를 읽는 중…</section>
        )}
      </Chk2ModeContext.Provider>
    );
  }

  const up = st?.uplink;
  const chipAge = local && !d.streamUp && age !== null ? Math.max(age, LOST_MS + 1) : age;
  const kAll = pickKind(bundle, KINDS.allStop);
  const kBuzz = pickKind(bundle, KINDS.buzz);
  const buzzPlc = !hasKind(bundle, KINDS.buzz) && !!bundle?.plcButtons?.some((b) => b.target === BUZZER_TARGET);
  const shared = d.feed.filter((e) => !["ch1", "ch2"].includes(feedChamber(e)));
  const globalAlarms = (st?.alarms ?? []).filter((a) => !a.chamber || !["ch1", "ch2"].includes(a.chamber));
  const cmn = { bundle, st, onAsk: setAsk };

  return (
    <Chk2ModeContext.Provider value={{ local, hmiKinds: perms?.kinds ?? [], detail }}>
      {local && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-gray-900 px-3 py-2 text-xs text-white">
          <Laptop size={15} /> <b>노트북 로컬 화면 · CH1&2</b>
          <span className="font-mono font-bold">{d.hello?.equipment ?? "-"}</span>
          <span className="text-gray-300">{d.hello?.runMode ?? "-"}</span>
          <span className="font-mono text-gray-400">{d.hello?.version ?? ""}</span>
          <span className={`ml-auto flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] ${
            !up?.enabled ? "bg-gray-700 text-gray-300" : up.connected ? "bg-emerald-700/60 text-emerald-100" : "bg-amber-600/70 text-amber-50"}`}
            title={up?.lastError ? `마지막 오류: ${up.lastError}` : undefined}>
            {up?.enabled && up.connected ? <Cloud size={12} /> : <CloudOff size={12} />}
            {!up?.enabled ? "웹 연결 안 씀" : `웹 ${up.connected ? "연결" : "끊김"}`}
            {up?.enabled && ` · 마지막 성공 ${up.lastOkAt ? fmtKst(up.lastOkAt) : "-"} · 보관 ${up.queued ?? 0} · 버림 ${up.dropped ?? 0}`}
          </span>
        </div>
      )}
      {bench && (
        <p className="flex items-center gap-2 rounded-2xl border border-amber-300 bg-amber-100 p-3 text-xs font-bold text-amber-900">
          <Lock size={14} /> 읽기 전용(bench) — 조작은 장비 앞면으로
        </p>
      )}
      {local && !d.streamUp && d.streamEver && (
        <p className="flex items-center gap-2 rounded-2xl border border-rose-300 bg-rose-50 p-3 text-xs font-bold text-rose-700">
          <WifiOff size={14} /> 노트북 프로그램 연결 끊김 — 다시 붙는 중, 조작이 잠겼습니다. 표시는 마지막 값입니다.
        </p>
      )}
      {/* 연결 줄 */}
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        {neverConnected ? (
          <span className="flex items-center gap-1.5 rounded-lg bg-gray-100 px-2 py-1 font-semibold text-gray-500">
            <span className="h-2 w-2 rounded-full bg-gray-300" /> 연결 대기
          </span>
        ) : (
          <span className={`flex items-center gap-1.5 rounded-lg px-2 py-1 font-semibold ${
            chipAge === null ? "bg-gray-100 text-gray-500" : chipAge <= LATE_MS ? "bg-emerald-50 text-emerald-700"
            : chipAge <= LOST_MS ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700"}`}>
            <span className={`h-2 w-2 rounded-full ${chipAge === null ? "bg-gray-300" : chipAge <= LATE_MS ? "bg-emerald-500"
              : chipAge <= LOST_MS ? "bg-amber-500" : "bg-rose-500"}`} />
            {chipAge === null ? "상태 없음" : chipAge <= LATE_MS ? "실시간" : chipAge <= LOST_MS ? `늦음 ${ageSec}초` : `끊김 ${ageSec}초`}
          </span>
        )}
        {mode && (
          <span className={`rounded-lg px-2 py-1 font-bold ${mode === "sim" ? "bg-fuchsia-600 text-white" : mode === "bench" ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-700"}`}>
            {mode === "sim" ? "SIM — 모의 장비" : mode.toUpperCase()}
          </span>
        )}
        {!d.streamUp && !local && (
          <span className="flex items-center gap-1 rounded-lg bg-gray-100 px-2 py-1 text-gray-500"><WifiOff size={12} /> {d.streamEver ? "다시 연결 중…" : "연결 중…"}</span>
        )}
        {Math.abs(skew) > SKEW_WARN_MS && (
          <span className="flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-1 font-semibold text-amber-700"><Clock size={12} /> 장비 시계 차 {(skew / 1000).toFixed(1)} s</span>
        )}
        <span className={`rounded-lg px-2 py-1 ${plcOk ? "bg-gray-100 text-gray-600" : "bg-rose-50 font-semibold text-rose-700"}`}>PLC {plcOk ? "정상" : "값 오래됨"}</span>
        {detail && d.hello?.version && <span className="font-mono text-gray-400">{d.hello.version}</span>}
        {detail && d.hello?.instance && <span className="font-mono text-gray-400">실행 {d.hello.instance.slice(0, 8)}</span>}
        {local && !perms?.kinds.length && !bench && (
          <span className="rounded-lg bg-amber-50 px-2 py-1 text-amber-700">장비가 이 화면에서 받는 명령이 아직 없음 — 보기만</span>
        )}
        <button onClick={() => setDetail(!detail)} aria-pressed={detail} title="켜면 원시 코드·키·run id 등 개발용 정보까지 보입니다"
          className={`ml-auto flex items-center gap-1 rounded-lg px-2 py-1 font-semibold ${detail ? "bg-gray-800 text-white" : "border border-gray-200 bg-white text-gray-500 hover:bg-gray-50"}`}>
          <Code2 size={12} /> 상세 {detail ? "켬" : "끔"}
        </button>
      </div>

      {d.authLost && (
        <p className="flex items-center gap-2 rounded-2xl border border-rose-300 bg-rose-50 p-3 text-xs font-bold text-rose-700">
          <LogIn size={14} /> 로그인이 끊겼습니다 — 새로고침하세요. 조작이 잠겼습니다.
        </p>
      )}
      {d.error && <p className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{d.error}</p>}
      {web && !web.hasSchema && !neverConnected && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">장비 정의를 아직 받지 못했습니다 — 장비가 연결되면 받아 옵니다.</p>
      )}
      {perms && !perms.canOperate && !local && !neverConnected && (
        <p className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-gray-50 p-3 text-xs font-semibold text-gray-600">
          <Eye size={14} /> 조회만 — 장비 담당자·관리자만 조작
        </p>
      )}
      {d.state && !connected && (!local || d.streamUp) && (
        <p className="flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
          <AlertTriangle size={14} /> <b>장비 끊김 {ageSec}초</b> — 표시는 마지막 값이며 조작이 잠겼습니다.
          {webOnline && canOperate && " 웹은 장비와 이어져 있어 정지 명령은 보낼 수 있습니다."}
        </p>
      )}
      <Notices list={notices} onClose={(id) => setNotices((l) => l.filter((n) => n.id !== id))} />
      <PopupStack list={popups.open} onClose={popups.close} />

      {neverConnected ? (
        <section className="rounded-2xl border border-dashed border-gray-200 bg-white p-6 text-center">
          <p className="text-base font-bold text-gray-700">장비 프로그램(v2) 연결 대기</p>
          <p className="mt-1 text-xs text-gray-500">이 장비는 아직 v2 프로그램이 웹에 연결된 적이 없습니다. 장비 노트북에서 v2 를 실행하면 화면이 채워집니다.</p>
        </section>
      ) : (
        <>
          {/* 장비 전체 줄 */}
          <section className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-100 bg-white p-3">
            <b className="text-sm text-gray-900">장비 전체</b>
            <span className="text-[11px] text-gray-500">{st?.procState === "BUSY" ? "어딘가 진행 중" : st ? "모두 대기" : "상태 없음"}</span>
            {st?.stopping && <span className="rounded-lg bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700">정지 순서 실행 중 — {String(st.stopping)}</span>}
            {globalAlarms.map((a) => (
              <span key={a.ruleId} className="flex items-center gap-1 rounded-lg bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700">
                <AlertTriangle size={12} /> {a.code ? reasonLabel(asChk(bundle), a.code) : a.ruleId}{detail && ` ${a.ruleId}`}
              </span>
            ))}
            <span className="ml-auto flex flex-wrap gap-2">
              <Btn disabled={buzzPlc ? !canPlc(BUZZER_TARGET) : !can(kBuzz)} onClick={() => setAsk(buzzPlc
                ? { kind: "PLC_BUTTON", label: "부저 정지", stop: true, args: { target: BUZZER_TARGET, on: true }, key: `PLC_BUTTON:${BUZZER_TARGET}`,
                    note: "울리는 부저를 끕니다(PLC BUZZER_STOP_SW)." }
                : { kind: kBuzz, label: "부저 정지", stop: true, note: "울리는 부저를 끕니다." })}>
                <BellOff size={14} /> 부저 정지
              </Btn>
              <Btn tone="roseSolid" disabled={!can(kAll)} onClick={() => setAsk({ kind: kAll, label: "ALL STOP", stop: true,
                note: "CH1·CH2·플라즈마 클리닝·TSP 를 모두 멈추고 출력을 끕니다(공정 여부와 무관 — 정지 순서 고정)." })}>
                <OctagonX size={14} /> ALL STOP
              </Btn>
            </span>
          </section>

          <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-2">
            {(["ch1", "ch2"] as const).map((ch) => (
              <Ch12Chamber key={ch} bundle={bundle} st={st} ch={ch} connected={connected} plcOk={plcOk} allowed={allowed} canPlc={canPlc}
                pending={pending} onAsk={setAsk} feed={d.feed} skewMs={skew} mimicNote={mimicNote} nowMs={now + d.offsetMs}
                onEditSeq={() => setSeqFor(ch)} />
            ))}
          </div>

          <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            <HeaterThicknessPanel {...cmn} can={canCh("ch2")} plcOk={plcOk} feed={d.feed} send={d.send} notify={notify} />
            <PcPanel {...cmn} can={canCh("pc")} />
            <TspPanel {...cmn} can={canCh("tsp")} nowMs={now + d.offsetMs} />
          </div>

          <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-3">
            <RobotPanel bundle={bundle} st={st} feed={d.feed} />
            <LoadLockPanel bundle={bundle} st={st} plcOk={plcOk} can={can} onAsk={setAsk} />
            <PlcPanel bundle={bundle} snapshot={snap} plcOk={plcOk} canPress={canPlc} pending={pending} onAsk={setAsk} note={mimicNote} />
          </div>
        </>
      )}

      {local ? (
        <>
          {!neverConnected && <LocalFiles bundle={bundle} can={(k) => allowed(k, k)} onAsk={setAsk} />}
          <EventFeed bundle={d.bundle} feed={shared} />
          <p className="text-[11px] text-gray-400">레시피 편집·설정·공정 기록·조작 기록은 웹 화면에서</p>
        </>
      ) : (
        <>
          {!neverConnected && (
            <Ch12Recipes bundle={bundle} recipes={recipes} can={(k) => allowed(k, k)} onAsk={setAsk} notify={notify} dirtyRef={dirtyRef} />
          )}
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            <EventFeed bundle={d.bundle} feed={shared} />
            <div className="space-y-3">
              <CommandLog bundle={d.bundle} commands={d.commands} />
              <RunList bundle={d.bundle} runs={d.runs} />
            </div>
          </div>
          <Ch12History equipment={equipment} bundle={bundle} refreshKey={`${d.runs[0]?.runId ?? ""}-${d.runs[0]?.endedAt ?? ""}`} />
          {!neverConnected && (
            <Chk2Config equipment={equipment} bundle={d.bundle} st={st as unknown as StateData | null} perms={perms ?? null}
              connected={connected} reloadSchema={d.loadSchema} notify={notify} />
          )}
        </>
      )}

      {seqFor && (
        <Ch12SeqEdit bundle={bundle} st={st} feed={d.feed} ch={seqFor} can={canCh(seqFor)} onAsk={setAsk} onClose={() => setSeqFor(null)} />
      )}
      <ConfirmDialog ask={ask} onOk={run} onCancel={cancel} />
    </Chk2ModeContext.Provider>
  );
}
