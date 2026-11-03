"use client";

// 장비 관리(v2) — 챔버K v2 장비 연결 확인(관리자만). 3 s 마다 갱신.
// 장비 목록(연결된 실행·마지막 연락·시계 차·중복 연결 거절 …)과 고른 장비의 최근 기록, 연결 비우기(다른 실행이 넘겨받게).
// W-9: 말만 정리(진단 화면이라 구조는 그대로) — 최근 사건은 장비 화면 로그와 같은 규칙(묶음 이름, components/ops2/chk/text).
// 장비(기준 ID)별 담당자 추가·삭제, 장비별 명령 SSE 연결, 명령 목록(보낸 길·횟수·결과까지 시간·결과 모름).
// 명령 버튼은 두지 않는다(W-3). 토큰 교체는 W-3 에서 이 화면에 더한다.
// 구글챗 알림(W-6): 고른 장비의 주소 있음/없음(주소 자체는 안 보임)·보내는 모드·최근 outbox 20·실패 다시 보내기.
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Cpu, MessageSquare, RefreshCw, RotateCcw, Unlock, UserPlus, X } from "lucide-react";
import { fmtKst } from "@/lib/ops2/time";
import { logLine } from "./chk/text";
import type { Bundle } from "./chk/types";

type Device = {
  equipment: string; label: string | null; enabled: boolean; hasToken: boolean;
  holderInstance: string | null; holderSeenAt: string | null;
  sse: { instance: string; connectedAt: string }[];
  conflictInstance: string | null; conflictAt: string | null;
  runMode: string | null; writesAllowed: boolean | null; program: string | null; version: string | null;
  configVersion: number | null; webConfigVersion: number | null; webSchemaHash: string | null; hasWebSchema: boolean;
  clockSkewMs: number | null; lastHelloAt: string | null; lastSeenAt: string | null;
};
type StateBrief = {
  instance: string; ts: string; receivedAt: string; procState: string | null; runId: string | null;
  step: { no?: number; total?: number; type?: string; label?: string; remainS?: number } | null;
  alarmCount: number; stopping: string | null; configVersion: number | null;
  uplink: { connected: boolean | null; queued: number | null; dropped: number | null; lastError: string | null };
};
type Ev = { msgId: string; ts: string; level: string; code: string; message: string; source: string | null;
            runId: string | null; ruleId?: string | null; context?: unknown };
type Run = { runId: string; instance: string; name: string | null; recipeName: string | null; startedBy: string | null;
             stepNo: number | null; startedAt: string | null; endedAt: string | null; result: string | null;
             reasonCode: string | null };
type Cmd = { id: string; origin: string; kind: string; status: string; reasonCode: string | null; detail: string | null;
             requestedBy: string; requestedAt: string; resultAt: string | null; resultReceivedAt: string | null;
             targetInstance: string | null;
             sentVia: string | null; sentAt: string | null; lastSentAt: string | null; sendCount: number;
             expiresAtServer: string | null };
type Operator = { equipment: string; employeeId: number; name: string | null; active: boolean; createdBy: string };
type Employee = { id: number; name: string; email: string | null; processOwner: boolean };
type Bad = { id: string; instance: string | null; receivedAt: string; reason: string };
type Outbox = { id: number; kind: string; msgId: string; title: string; channel: string | null; status: string; tries: number;
                lastError: string | null; nextAt: string | null; createdAt: string; sentAt: string | null };
type Chat = { process: boolean; alert: boolean; envNames: { process: string; alert: string }; runMode: string | null;
              sends: boolean; treatAsProd: boolean; outbox: Outbox[] };
type Overview = {
  devices: Device[]; leaseSec: number;
  state?: StateBrief | null; events?: Ev[]; runs?: Run[]; commands?: Cmd[]; bad?: Bad[]; summaryCount?: number; chat?: Chat;
};

const CHAT_KIND: Record<string, string> = {
  run_start: "공정 시작", run_end: "공정 끝", run_fail: "실패 이유", alert: "이상", plc_link: "PLC 끊김·복구", device_link: "장비 연결",
};
const CHAT_STATUS: Record<string, [string, string]> = {
  queued: ["보낼 것", "text-amber-600"], sent: ["보냄", "text-emerald-600"], failed: ["실패", "font-semibold text-rose-600"],
  skipped: ["안 보냄", "text-gray-400"],
};

const SKEW_WARN_MS = 3_000;
const UNKNOWN_AFTER_MS = 60_000;     // sent 인데 만료 + 이만큼 지나도 결과가 없으면 "결과 모름"
const LEVEL_TONE: Record<string, string> = { error: "text-rose-600", warn: "text-amber-600", info: "text-gray-500" };

const short = (s?: string | null, n = 8) => (s ? s.slice(0, n) : "-");
function agoSec(iso: string | null, now: number): string {
  if (!iso) return "-";
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  return s < 120 ? `${s}초 전` : s < 7200 ? `${Math.round(s / 60)}분 전` : fmtKst(iso);
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-3 sm:p-4">
      <h3 className="mb-2 text-xs font-bold text-gray-700">{title}</h3>
      {children}
    </section>
  );
}

export default function Ops2AdminPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState("");
  const [bundle, setBundle] = useState<Bundle | null>(null);       // 고른 장비의 장비 정의(사건 이름용)
  useEffect(() => {
    if (!sel) return;
    let off = false;
    void fetch(`/api/ops2/${encodeURIComponent(sel)}/v1/schema`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null)).then((b) => { if (!off) setBundle(b); }).catch(() => { if (!off) setBundle(null); });
    return () => { off = true; };
  }, [sel]);
  const [now, setNow] = useState(0);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const qs = sel ? `?equipment=${encodeURIComponent(sel)}` : "";
      const res = await fetch(`/api/ops2/admin/overview${qs}`, { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
      setData(j as Overview);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "불러오지 못했습니다.");
    } finally {
      setNow(Date.now());
    }
  }, [sel]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = setInterval(load, 3_000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [load]);

  // 담당자 — 바뀔 때만 다시 읽는다
  const [ops, setOps] = useState<{ equipments: string[]; operators: Operator[] } | null>(null);
  const [people, setPeople] = useState<Employee[]>([]);
  const [pick, setPick] = useState<Record<string, string>>({});
  const loadOps = useCallback(async () => {
    try {
      const [o, e] = await Promise.all([
        fetch("/api/ops2/admin/operators", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/ops2/admin/employees", { cache: "no-store" }).then((r) => r.json()),
      ]);
      if (Array.isArray(o?.operators)) setOps(o);
      if (Array.isArray(e?.employees)) setPeople(e.employees);
    } catch {
      setMsg("담당자 목록을 불러오지 못했습니다.");
    }
  }, []);
  useEffect(() => {
    const first = setTimeout(loadOps, 0);
    return () => clearTimeout(first);
  }, [loadOps]);

  const changeOperator = async (method: "POST" | "DELETE", equipment: string, employeeId: number) => {
    setBusy(true);
    setMsg(null);
    try {
      const res = method === "POST"
        ? await fetch("/api/ops2/admin/operators", {
            method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ equipment, employeeId }),
          })
        : await fetch(`/api/ops2/admin/operators?equipment=${encodeURIComponent(equipment)}&employeeId=${employeeId}`, { method });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) setMsg(j?.error ?? "실패했습니다.");
    } catch {
      setMsg("실패했습니다.");
    } finally {
      setBusy(false);
      loadOps();
    }
  };

  const release = async (equipment: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/ops2/admin/devices/${encodeURIComponent(equipment)}/release`, { method: "POST" });
      const j = await res.json().catch(() => ({}));
      setMsg(res.ok ? `${equipment} 연결된 실행을 비웠습니다(${short(j?.released)}).` : j?.error ?? "실패했습니다.");
    } catch {
      setMsg("실패했습니다.");
    } finally {
      setBusy(false);
      setConfirm(null);
      load();
    }
  };

  const retryChat = async (equipment: string, id: number) => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/ops2/admin/devices/${encodeURIComponent(equipment)}/chat`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "retry", id }),
      });
      const j = await res.json().catch(() => ({}));
      setMsg(res.ok ? `알림 #${id} 을 다시 보냅니다.` : j?.error ?? "실패했습니다.");
    } catch {
      setMsg("실패했습니다.");
    } finally {
      setBusy(false);
      load();
    }
  };

  const st = data?.state;
  const chat = data?.chat;

  return (
    <div className="space-y-3 p-3 sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-base font-bold text-gray-900">
          <Cpu className="h-4 w-4" /> 장비 관리(v2)
        </h2>
        <button onClick={load} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-gray-500 hover:bg-gray-100">
          <RefreshCw className="h-3 w-3" /> 3초마다 갱신
        </button>
      </div>
      {error && <p className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}
      {msg && <p className="rounded-2xl border border-gray-100 bg-white p-3 text-xs text-gray-600">{msg}</p>}

      <Card title={`장비 (연결된 실행이 ${data?.leaseSec ?? 30}초 넘게 조용하면 다른 실행이 넘겨받습니다)`}>
        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap text-left text-xs">
            <thead className="text-[11px] text-gray-400">
              <tr>
                <th className="py-1 pr-3">장비</th><th className="pr-3">모드</th><th className="pr-3">버전</th>
                <th className="pr-3">연결된 실행</th><th className="pr-3">마지막 연락</th><th className="pr-3">시계 차</th>
                <th className="pr-3">쓰기</th><th className="pr-3">설정(장비/웹)</th><th className="pr-3">장비 정의</th>
                <th className="pr-3">중복 연결 거절</th><th className="pr-3">명령 통로</th><th>토큰</th>
              </tr>
            </thead>
            <tbody>
              {(data?.devices ?? []).map((d) => {
                const online = !!d.lastSeenAt && now - new Date(d.lastSeenAt).getTime() < 30_000;
                const skewBad = d.clockSkewMs !== null && Math.abs(d.clockSkewMs) > SKEW_WARN_MS;
                return (
                  <tr
                    key={d.equipment}
                    onClick={() => setSel(d.equipment)}
                    className={`cursor-pointer border-t border-gray-50 hover:bg-gray-50 ${sel === d.equipment ? "bg-gray-50" : ""}`}
                  >
                    <td className="py-1.5 pr-3">
                      <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${online ? "bg-emerald-500" : "bg-gray-300"}`} />
                      <span className="font-semibold">{d.label ?? d.equipment}</span>
                      <span className="ml-1 text-gray-400">{d.equipment}</span>
                      {!d.enabled && <span className="ml-1 text-rose-500">(꺼짐)</span>}
                    </td>
                    <td className="pr-3">
                      {d.runMode === "sim"
                        ? <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-600">sim</span>
                        : d.runMode ?? "-"}
                    </td>
                    <td className="pr-3 font-mono">{d.version ?? "-"}</td>
                    <td className="pr-3 font-mono">{short(d.holderInstance)}</td>
                    <td className="pr-3">{agoSec(d.lastSeenAt, now)}</td>
                    <td className={`pr-3 ${skewBad ? "font-semibold text-amber-600" : ""}`}>
                      {d.clockSkewMs === null ? "-" : `${d.clockSkewMs >= 0 ? "+" : ""}${(d.clockSkewMs / 1000).toFixed(1)}초`}
                      {skewBad && <AlertTriangle className="ml-1 inline h-3 w-3" />}
                    </td>
                    <td className="pr-3">{d.writesAllowed === null ? "-" : d.writesAllowed ? "허용" : "읽기 전용"}</td>
                    <td className="pr-3">{d.configVersion ?? "-"} / {d.webConfigVersion ?? "-"}</td>
                    <td className="pr-3">{d.hasWebSchema ? "받음" : d.webSchemaHash ? "없음" : "-"}</td>
                    <td className="pr-3">
                      {d.conflictAt
                        ? <span className="text-amber-600"><span className="font-mono">{short(d.conflictInstance)}</span> · {agoSec(d.conflictAt, now)}</span>
                        : "-"}
                    </td>
                    <td className="pr-3">
                      {d.sse.length
                        ? d.sse.map((s) => (
                            <span key={s.instance} className="mr-2">
                              <span className="font-mono">{short(s.instance)}</span> · {agoSec(s.connectedAt, now)}부터
                            </span>
                          ))
                        : <span className="text-gray-400">없음</span>}
                    </td>
                    <td>{d.hasToken ? "있음" : <span className="text-rose-500">없음</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-gray-400">줄을 누르면 그 장비의 최근 기록이 아래에 나옵니다.</p>
      </Card>

      <Card title="장비 담당자 (기준 장비 ID — CHK2 담당자는 CHK2-SIM 도 조작. 관리자는 모든 장비)">
        <div className="space-y-2">
          {(ops?.equipments ?? []).map((eq) => {
            const list = (ops?.operators ?? []).filter((o) => o.equipment === eq);
            const taken = new Set(list.map((o) => o.employeeId));
            return (
              <div key={eq} className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="w-16 shrink-0 font-semibold text-gray-700">{eq}</span>
                {list.map((o) => (
                  <span key={o.employeeId} className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5">
                    {o.name ?? `#${o.employeeId}`}{!o.active && <span className="text-rose-500">(퇴사)</span>}
                    <button
                      onClick={() => changeOperator("DELETE", eq, o.employeeId)}
                      disabled={busy}
                      title="담당자에서 빼기"
                      className="text-gray-400 hover:text-rose-600 disabled:opacity-40"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                {!list.length && <span className="text-gray-400">없음</span>}
                <select
                  value={pick[eq] ?? ""}
                  onChange={(e) => setPick((p) => ({ ...p, [eq]: e.target.value }))}
                  className="ml-1 rounded-lg border border-gray-200 px-1.5 py-1 text-xs"
                >
                  <option value="">직원 고르기</option>
                  {people.filter((p) => !taken.has(p.id)).map((p) => (
                    <option key={p.id} value={p.id}>{p.processOwner ? "★ " : ""}{p.name}</option>
                  ))}
                </select>
                <button
                  onClick={() => { changeOperator("POST", eq, Number(pick[eq])); setPick((p) => ({ ...p, [eq]: "" })); }}
                  disabled={busy || !pick[eq]}
                  className="flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                >
                  <UserPlus className="h-3 w-3" /> 추가
                </button>
              </div>
            );
          })}
          {!ops?.equipments.length && <p className="text-xs text-gray-400">등록된 장비가 없습니다.</p>}
          <p className="text-[11px] text-gray-400">★ 공정 담당자. 목록은 재직 중 직원만.</p>
        </div>
      </Card>

      {sel && data?.devices.some((d) => d.equipment === sel) && (
        <>
          <Card title={`최신 상태 — ${sel}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              {st ? (
                <div className="space-y-1 text-xs text-gray-700">
                  <p>
                    실행 <span className="font-mono">{short(st.instance)}</span> · 장비 시각 {fmtKst(st.ts)} · 받음 {agoSec(st.receivedAt, now)}
                  </p>
                  <p>
                    공정 상태 <b>{st.procState ?? "-"}</b> · runId <span className="font-mono">{st.runId ?? "-"}</span>
                    {st.step && ` · 블록 ${st.step.no}/${st.step.total} ${st.step.label || st.step.type || ""}`}
                    {st.stopping && ` · 정지 중 ${st.stopping}`}
                  </p>
                  <p>
                    알람 <b className={st.alarmCount ? "text-rose-600" : ""}>{st.alarmCount}</b> ·
                    웹 연결(장비가 본 것) 명령 받기 {st.uplink.connected ? "연결" : "끊김"} · 보관함 {st.uplink.queued ?? "-"}건 ·
                    버림 {st.uplink.dropped ?? "-"}{st.uplink.lastError ? ` · 마지막 오류 ${st.uplink.lastError}` : ""}
                  </p>
                  <p className="text-gray-400">1분 요약(공정 중) {data.summaryCount ?? 0}건</p>
                </div>
              ) : <p className="text-xs text-gray-400">아직 받은 state 가 없습니다.</p>}
              <button
                onClick={() => setConfirm(sel)}
                className="flex items-center gap-1 rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                <Unlock className="h-3.5 w-3.5" /> 연결 비우기(다른 실행이 넘겨받게)
              </button>
            </div>
          </Card>

          {chat && (
            <Card title={`구글챗 알림 — ${sel}`}>
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <MessageSquare className="h-3.5 w-3.5 text-gray-500" />
                <span className={`rounded px-1.5 py-0.5 font-semibold ${chat.sends ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                  {chat.sends ? `보냄 — 모드 ${chat.runMode ?? "?"}${chat.treatAsProd ? "(개발 시험: prod 로 봄)" : ""}` : `안 보냄 — 모드 ${chat.runMode ?? "?"}(prod 만 보냄)`}
                </span>
                {([["공정", chat.process, chat.envNames.process], ["이상·끊김", chat.alert, chat.envNames.alert]] as const).map(([t, has, env]) => (
                  <span key={t} title={env} className={`rounded px-1.5 py-0.5 font-semibold ${has ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700"}`}>
                    {t} 주소 {has ? "있음" : t === "이상·끊김" && chat.process ? "없음 → 공정 주소로" : "없음"}
                  </span>
                ))}
                <span className="text-gray-400">주소는 서버 환경변수({chat.envNames.process}·{chat.envNames.alert}) — 여기에는 보이지 않습니다</span>
              </div>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-left text-[11px]">
                  <thead className="text-gray-400">
                    <tr><th className="py-1 pr-2">#</th><th className="pr-2">넣음</th><th className="pr-2">종류</th><th className="pr-2">상태</th>
                      <th className="pr-2">횟수</th><th className="pr-2">내용</th><th className="pr-2">까닭·다음</th><th /></tr>
                  </thead>
                  <tbody>
                    {chat.outbox.map((o) => {
                      const [label, tone] = CHAT_STATUS[o.status] ?? [o.status, ""];
                      return (
                        <tr key={o.id} className="border-t border-gray-50 align-top">
                          <td className="py-1 pr-2 font-mono text-gray-400">{o.id}</td>
                          <td className="whitespace-nowrap pr-2 font-mono text-gray-400">{fmtKst(o.createdAt)}</td>
                          <td className="whitespace-nowrap pr-2">{CHAT_KIND[o.kind] ?? o.kind}</td>
                          <td className={`whitespace-nowrap pr-2 ${tone}`}>{label}{o.sentAt ? ` ${fmtKst(o.sentAt)}` : ""}</td>
                          <td className="pr-2 tabular-nums">{o.tries}</td>
                          <td className="min-w-0 max-w-md break-words pr-2 text-gray-600">{o.title}</td>
                          <td className="pr-2 text-gray-500">
                            {o.lastError ?? ""}
                            {o.status === "queued" && o.nextAt && <span className="text-amber-600"> · 다음 {fmtKst(o.nextAt)}</span>}
                          </td>
                          <td>
                            {o.status === "failed" && (
                              <button onClick={() => retryChat(sel, o.id)} disabled={busy}
                                className="flex items-center gap-1 whitespace-nowrap rounded-lg border border-gray-200 px-2 py-0.5 font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40">
                                <RotateCcw className="h-3 w-3" /> 다시 보내기
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {!chat.outbox.length && <tr><td colSpan={8} className="py-2 text-gray-400">없음</td></tr>}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            <Card title="최근 로그 30">
              <ul className="max-h-[28rem] space-y-1 overflow-auto text-[11px]">
                {(data.events ?? []).map((e) => {
                  const l = logLine(bundle, { type: "event", data: { level: e.level, code: e.code, ruleId: e.ruleId, message: e.message,
                                                                    context: e.context ?? { source: e.source } } });
                  return (
                    <li key={e.msgId} className="flex gap-2" title={`${l.raw}${e.runId ? ` · run ${e.runId}` : ""}`}>
                      <span className="shrink-0 font-mono text-gray-400">{fmtKst(e.ts)}</span>
                      <span className={`shrink-0 font-semibold ${LEVEL_TONE[e.level] ?? ""}`}>{l.kind}</span>
                      <span className="min-w-0 break-words text-gray-600">
                        {l.text}<span className="ml-1 font-mono text-[10px] text-gray-300">{e.code}</span>
                      </span>
                    </li>
                  );
                })}
                {!data.events?.length && <li className="text-gray-400">없음</li>}
              </ul>
            </Card>
            <div className="space-y-3">
              <Card title="공정 run 10">
                <ul className="space-y-1 text-[11px] text-gray-600">
                  {(data.runs ?? []).map((r) => (
                    <li key={r.runId}>
                      <span className="font-mono">{r.runId}</span> · {r.name ?? r.recipeName ?? "-"}
                      {r.stepNo !== null && ` · 행 ${r.stepNo}`} · {r.startedAt ? fmtKst(r.startedAt) : "시작 기록 없음"} →{" "}
                      {r.endedAt
                        ? `${fmtKst(r.endedAt)} ${r.result ?? ""}${r.reasonCode ? ` (${r.reasonCode})` : ""}`
                        : <span className="text-amber-600">끝 기록 없음</span>}
                      {r.startedBy && ` · ${r.startedBy}`}
                    </li>
                  ))}
                  {!data.runs?.length && <li className="text-gray-400">없음</li>}
                </ul>
              </Card>
              <Card title="명령 20 (웹 명령: 보낸 길 × 횟수 · 만들기 → 결과)">
                <ul className="space-y-1 text-[11px] text-gray-600">
                  {(data.commands ?? []).map((c) => {
                    const unknown = c.status === "sent" && !!c.expiresAtServer
                      && now - new Date(c.expiresAtServer).getTime() > UNKNOWN_AFTER_MS;
                    // 둘 다 웹 시계(result_at 은 장비 시계라 쓰지 않는다)
                    const took = c.resultReceivedAt
                      ? new Date(c.resultReceivedAt).getTime() - new Date(c.requestedAt).getTime() : null;
                    return (
                      <li key={c.id}>
                        <span className="font-mono text-gray-400">{fmtKst(c.requestedAt)}</span> {c.kind} ·{" "}
                        <span className={c.status === "rejected" || unknown ? "font-semibold text-rose-600"
                          : c.status === "expired" ? "text-amber-600" : c.status === "accepted" ? "text-emerald-600" : ""}>
                          {unknown ? "결과 모름" : c.status}
                        </span>
                        {c.reasonCode && ` (${c.reasonCode})`}
                        {c.origin === "web" && (
                          <>
                            {" · "}{c.sentVia ? `${c.sentVia} × ${c.sendCount}` : "안 보냄"}
                            {took !== null && ` · ${took.toLocaleString()} ms`}
                          </>
                        )}
                        {" · "}{c.origin} · {c.requestedBy}
                        {c.detail && <span className="text-gray-400"> · {c.detail}</span>}
                      </li>
                    );
                  })}
                  {!data.commands?.length && <li className="text-gray-400">없음</li>}
                </ul>
              </Card>
              <Card title="받지 못한 데이터 10">
                <ul className="space-y-1 text-[11px]">
                  {(data.bad ?? []).map((b) => (
                    <li key={b.id} className="text-rose-600">
                      <span className="font-mono text-gray-400">{fmtKst(b.receivedAt)}</span>{" "}
                      <span className="font-mono">{short(b.id, 12)}</span> {b.reason}
                    </li>
                  ))}
                  {!data.bad?.length && <li className="text-gray-400">없음</li>}
                </ul>
              </Card>
            </div>
          </div>
        </>
      )}

      {confirm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-4">
            <p className="text-sm font-bold text-gray-900">연결 비우기(다른 실행이 넘겨받게)</p>
            <p className="mt-2 text-sm text-gray-700">
              <b>{confirm}</b> 의 연결된 실행을 비웁니다. 다음에 먼저 연결한 실행이 넘겨받습니다 —
              지금 연결된 실행이 살아 있으면 곧바로 다시 잡습니다.
            </p>
            <p className="mt-3 text-[11px] text-gray-400">로그에 실행자와 함께 기록됩니다(INSTANCE_RELEASED).</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setConfirm(null)} className="rounded-xl px-3 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-50">
                취소
              </button>
              <button
                onClick={() => release(confirm)}
                disabled={busy}
                className="rounded-xl bg-gray-800 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
              >
                비우기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
