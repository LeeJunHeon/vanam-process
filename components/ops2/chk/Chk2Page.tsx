"use client";

// 챔버K v2 장비 화면(메뉴 "CHK v2") — 로그인한 누구나 보고, 조작은 권한대로(hello.web.perms).
// 브라우저 API /api/ops2/[equipment]/v1/*(노트북 로컬 화면 API 와 같은 모양 — W-7 에서 같은 화면 코드가 둘 다 쓴다).
// 위: 장비 고르기·연결 띠(마지막 state 3 s 늦음·10 s 끊김 — 끊기면 조작 잠금)·runMode·버전·시계 차·명령 연결.
// 조작: STOP·ALL STOP·부저 정지·히터 정지, PLC 버튼, 히터 SV·ON·OFF·RESET·가스 해제, 이온 게이지 필라멘트,
// 레시피(W-4a — Chk2Recipes: 저장·편집·웹 검사, 적재·시작·해제, 한 행 시작, 히터 레시피 실행·정지·일시정지·건너뛰기).
// 명령은 하나씩 따로 보내고 결과 알림도 따로 — 기다리는 동안 막는 것은 같은 명령 종류만(PLC 버튼은 같은 target 만).
// 정지 쪽(logic.STOP_KINDS)은 막지 않는다 — 다른 명령이나 같은 정지의 결과를 기다리는 중에도(다시 눌러도 해가 없고, 첫 명령이 갔는지
// 모를 때 바로 다시 누를 수 있게), 화면 stream 이 끊겨도 웹이 장비와 이어져 있으면(hello.web.online) 보낸다.
// 블록 편집(Chk2BlockEditor — 레시피 안의 블록 행)·공정 기록(Chk2History — 목록·상세·1분 요약 그래프)은 W-4b.
// 공정 중 값 수정(Chk2Adjust — PROCESS_ADJUST, 항목마다 결과를 기다림)·설정(Chk2Config — 관리자 적용·되돌리기, 이력)은 W-5.
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { AlertTriangle, Clock, Eye, LogIn, Radio, WifiOff } from "lucide-react";
import Chk2Mimic from "./Chk2Mimic";
import Chk2Status from "./Chk2Status";
import { BlockCard, HeaterCard, IgCard } from "./Chk2Cards";
import { CommandLog, EventFeed, RunList } from "./Chk2Logs";
import Chk2Adjust from "./Chk2Adjust";
import Chk2Config from "./Chk2Config";
import Chk2History from "./Chk2History";
import Chk2Recipes from "./Chk2Recipes";
import { ConfirmDialog, Notices, SimpleConfirm, type Ask, type Notice } from "./kit";
import { STALE_SEC_DEFAULT, STOP_KINDS, paramValue, plcFresh } from "./logic";
import { reasonLabel } from "./types";
import { useChk2 } from "./useChk2";
import { useRecipes } from "./useRecipes";

const STORE_KEY = "vanam-process:chk2-device";
const LATE_MS = 3_000;
const LOST_MS = 10_000;
const SKEW_WARN_MS = 3_000;
const PLC_PENDING_MS = 10_000;     // PLC 버튼 "전환 중" 최대
const OK_NOTICE_MS = 6_000;

const SEND_ERROR: Record<string, string> = {
  device_offline: "장비 연결 끊김(마지막 연락 10 s 넘음)",
  forbidden: "권한 없음 — 장비 담당자·관리자만 조작",
  no_schema: "장비 묶음이 아직 없음",
  unknown_kind: "웹에서 낼 수 없는 명령",
  bad_args: "인자 오류",
  config_path: "설정 변경은 설정 화면에서",
  unknown_device: "등록되지 않았거나 꺼진 장비",
  network: "웹 서버에 닿지 않음",
};

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
    <div className="space-y-3 p-3 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-bold text-gray-900">CHK v2</h2>
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
          등록된 v2 장비가 없습니다. 장비 관리(v2)에서 장비를 등록하세요.
        </p>
      )}
      {picked && <Chk2Device key={picked} equipment={picked} dirtyRef={dirtyRef} />}
      {switchTo && (
        <SimpleConfirm title="저장 안 함" ok="버리고 바꾸기" danger text="레시피에 저장하지 않은 변경이 있습니다. 버리고 장비를 바꿀까요?"
          onCancel={() => setSwitchTo(null)}
          onOk={() => { dirtyRef.current = false; setSwitchTo(null); pick(switchTo); }} />
      )}
    </div>
  );
}

function Chk2Device({ equipment, dirtyRef }: { equipment: string; dirtyRef: MutableRefObject<boolean> }) {
  const d = useChk2(equipment);
  const recipes = useRecipes(equipment);
  const [now, setNow] = useState(() => Date.now());
  const [ask, setAsk] = useState<Ask | null>(null);
  const [inflight, setInflight] = useState<Record<string, number>>({});   // 결과를 기다리는 명령(종류 또는 PLC_BUTTON:target)
  const [notices, setNotices] = useState<Notice[]>([]);
  const [plcPending, setPlcPending] = useState<Record<string, { want: boolean; at: number }>>({});

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
  const perms = web?.perms;
  const st = d.state?.data ?? null;
  const snap = st?.snapshot;
  const skew = web?.clockSkewMs ?? 0;
  // 마지막 state 의 나이 — 장비 시계(ts) → 웹 시계(− 시계 차) → 이 브라우저 시계(− 웹과의 차)
  const age = d.state ? now + d.offsetMs - (Date.parse(d.state.ts) - skew) : null;
  const ageSec = age === null ? null : Math.max(0, Math.round(age / 1000));
  const connected = age !== null && age <= LOST_MS;
  const plcLink = st?.links?.plc;
  const staleSec = typeof paramValue(d.bundle, "HEATER_STALE_SEC") === "number"
    ? (paramValue(d.bundle, "HEATER_STALE_SEC") as number) : STALE_SEC_DEFAULT;
  const plcOk = connected && plcFresh(plcLink, staleSec);
  const canOperate = !!perms?.canOperate && !d.authLost;
  const webOnline = !!web?.online;

  const allowed = (kind: string, key: string) => {
    if (!canOperate || !perms?.kinds.includes(kind)) return false;
    if (STOP_KINDS.includes(kind)) return connected || webOnline;
    return !inflight[key] && connected;
  };
  const can = (kind: string) => allowed(kind, kind);
  const canPlc = (target: string) => allowed("PLC_BUTTON", `PLC_BUTTON:${target}`);
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
               text: `${reasonLabel(d.bundle, b.reasonCode)}${b.reasonCode ? ` (${b.reasonCode})` : ""}${b.detail ? ` — ${b.detail}` : ""}` });
    } else if (b.status === "expired") {
      notify({ tone: "warn", title: `${what} — 만료`, text: reasonLabel(d.bundle, b.reasonCode) });
    } else {
      notify({ tone: "warn", title: `${what} — 결과를 기다리는 중`,
               text: "10 s 안에 결과가 오지 않았습니다. 명령 기록에서 확인하세요." });
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

  const block = (name: string) => d.bundle?.snapshot?.blocks?.find((b) => b.name === name);
  const link = (name: string) => st?.links?.[name];
  const mode = d.hello?.runMode;

  const plcAge = typeof plcLink?.age === "number" ? `${plcLink.age.toFixed(1)} s` : "나이 없음";
  const mimicNote = !connected ? "장비 끊김 · 조작 잠금"
    : !plcOk ? `PLC 값 ${plcLink?.q ?? "-"} · ${plcAge}(기준 ${staleSec} s) · 조작 잠금`
    : !canOperate ? "조회만" : "노드를 눌러 조작";

  return (
    <>
      {/* 연결 띠 */}
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className={`flex items-center gap-1.5 rounded-lg px-2 py-1 font-semibold ${
          age === null ? "bg-gray-100 text-gray-500"
          : age <= LATE_MS ? "bg-emerald-50 text-emerald-700"
          : age <= LOST_MS ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700"}`}>
          <span className={`h-2 w-2 rounded-full ${age === null ? "bg-gray-300" : age <= LATE_MS ? "bg-emerald-500"
            : age <= LOST_MS ? "bg-amber-500" : "bg-rose-500"}`} />
          {age === null ? "상태 없음" : age <= LATE_MS ? "실시간" : age <= LOST_MS ? `늦음 ${ageSec}초` : `끊김 ${ageSec}초`}
        </span>
        {mode && (
          <span className={`rounded-lg px-2 py-1 font-bold ${
            mode === "sim" ? "bg-fuchsia-600 text-white" : mode === "bench" ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-700"}`}>
            {mode === "sim" ? "SIM — 모의 장비" : mode.toUpperCase()}
          </span>
        )}
        {d.hello?.version && <span className="font-mono text-gray-400">{d.hello.version}</span>}
        {web && (
          <span className={`flex items-center gap-1 rounded-lg px-2 py-1 ${web.sse ? "text-gray-500" : "bg-amber-50 text-amber-700"}`}>
            <Radio size={12} /> {web.sse ? "명령 연결(SSE)" : "명령 연결 없음 — POST 응답으로만"}
          </span>
        )}
        {Math.abs(skew) > SKEW_WARN_MS && (
          <span className="flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-1 font-semibold text-amber-700">
            <Clock size={12} /> 장비 시계 차 {(skew / 1000).toFixed(1)} s
          </span>
        )}
        {!d.streamUp && (
          <span className="flex items-center gap-1 rounded-lg bg-gray-100 px-2 py-1 text-gray-500">
            <WifiOff size={12} /> 화면 연결 다시 붙는 중
          </span>
        )}
      </div>

      {d.authLost && (
        <p className="flex items-center gap-2 rounded-2xl border border-rose-300 bg-rose-50 p-3 text-xs font-bold text-rose-700">
          <LogIn size={14} /> 로그인이 끊겼습니다 — 새로고침하세요. 조작이 잠겼습니다.
        </p>
      )}
      {d.error && <p className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{d.error}</p>}
      {web && !web.hasSchema && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
          이 장비의 웹 설정 묶음이 아직 없습니다 — 장비가 연결되면 받아 옵니다.
        </p>
      )}
      {perms && !perms.canOperate && (
        <p className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-gray-50 p-3 text-xs font-semibold text-gray-600">
          <Eye size={14} /> 조회만 — 장비 담당자·관리자만 조작
        </p>
      )}
      {d.state && !connected && (
        <p className="flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
          <AlertTriangle size={14} /> <b>장비 끊김 {ageSec}초</b> — 표시는 마지막 값이며 조작이 잠겼습니다.
          {webOnline && canOperate && " 웹은 장비와 이어져 있어 정지 명령은 보낼 수 있습니다."}
        </p>
      )}
      <Notices list={notices} onClose={(id) => setNotices((l) => l.filter((n) => n.id !== id))} />

      <Chk2Status bundle={d.bundle} st={st} connected={connected} lastRun={d.runs[0] ?? null} can={can} onAsk={setAsk}
        webRecipes={recipes.list} />

      <Chk2Adjust equipment={equipment} bundle={d.bundle} st={st} feed={d.feed} canKey={allowed} onAsk={setAsk} />

      <div className="grid grid-cols-1 items-stretch gap-3 xl:grid-cols-2">
        <Chk2Mimic bundle={d.bundle} snapshot={snap} plcOk={plcOk} canPress={canPlc}
          pending={pending} onAsk={setAsk} note={mimicNote} />
        <div className="flex flex-col gap-3">
          <HeaterCard bundle={d.bundle} def={block("heater")} snap={snap} link={link("heater")} st={st} can={can}
            locked={!plcOk} onAsk={setAsk} />
          <IgCard def={block("ig")} snap={snap} link={link("ig")} can={can} onAsk={setAsk} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <BlockCard def={block("mfc")} snap={snap} link={link("mfc")} big={["ar_sccm", "o2_sccm", "pressure_mtorr"]} />
        <BlockCard def={block("dc")} snap={snap} link={link("dc")} big={["v", "i", "p"]} />
        <BlockCard def={block("rf")} snap={snap} link={link("rf")} big={["fwd_w", "ref_w"]} />
        <BlockCard def={block("rfp")} snap={snap} link={link("rfp")} big={["fwd_w", "ref_w"]} foldable />
      </div>

      <Chk2Recipes bundle={d.bundle} st={st} recipes={recipes} can={can} onAsk={setAsk} notify={notify} dirtyRef={dirtyRef} />

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <EventFeed bundle={d.bundle} feed={d.feed} />
        <div className="space-y-3">
          <CommandLog bundle={d.bundle} commands={d.commands} />
          <RunList bundle={d.bundle} runs={d.runs} />
        </div>
      </div>

      <Chk2Config equipment={equipment} bundle={d.bundle} st={st} perms={perms ?? null} connected={connected}
        reloadSchema={d.loadSchema} notify={notify} />

      <Chk2History equipment={equipment} bundle={d.bundle} refreshKey={`${d.runs[0]?.runId ?? ""}-${d.runs[0]?.endedAt ?? ""}`} />

      <ConfirmDialog ask={ask} onOk={run} onCancel={cancel} />
    </>
  );
}
