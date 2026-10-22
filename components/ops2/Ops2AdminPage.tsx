"use client";

// 챔버K v2 연결 확인용(admin) — 장비 목록·주인 실행·마지막 연락·시계 차와 최근 state·사건·run.
// v2 장비 화면은 W-3 에서 따로 만든다.
import { useCallback, useEffect, useState } from "react";
import { fmtAgo, fmtLogTime } from "@/lib/ops";

type Device = {
  equipment: string; label: string | null; enabled: boolean; holderInstance: string | null;
  holderSeenAt: string | null; runMode: string | null; writesAllowed: boolean | null; program: string | null;
  version: string | null; webSchemaHash: string | null; configVersion: number | null; clockSkewMs: number | null;
  lastSeenAt: string | null; online: boolean;
};
type Ev = { msgId: string; ts: string; level: string; code: string; message: string; source: string | null;
            runId: string | null; instance: string };
type Run = { runId: string; name: string | null; recipeName: string | null; startedBy: string | null;
             startedAt: string | null; endedAt: string | null; result: string | null; reasonCode: string | null;
             stepNo: number | null };
type Res = { msgId: string; ts: string; cmdId: string | null; kind: string; status: string; reasonCode: string | null;
             source: string | null; requestedBy: string | null };
type Detail = {
  devices: Device[]; leaseSec: number;
  state?: { instance: string; ts: string; receivedAt: string; data: Record<string, unknown> } | null;
  events?: Ev[]; runs?: Run[]; results?: Res[];
  instances?: { instance: string; version: string | null; runMode: string | null; firstSeenAt: string; lastSeenAt: string }[];
  bad?: { id: string; receivedAt: string; error: string }[];
  schemas?: { hash: string; version: number | null; receivedAt: string }[];
  summaryCount?: number;
};

const LEVEL_TONE: Record<string, string> = {
  error: "text-rose-600", warn: "text-amber-600", info: "text-gray-500",
};

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-3">
      <h3 className="mb-2 text-xs font-bold text-gray-700">{title}</h3>
      {children}
    </section>
  );
}

const short = (s?: string | null, n = 8) => (s ? s.slice(0, n) : "-");
const skewText = (ms: number | null) => (ms === null ? "-" : `${ms >= 0 ? "+" : ""}${(ms / 1000).toFixed(1)} s`);

export default function Ops2AdminPage() {
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<string>("");

  const load = useCallback(async () => {
    try {
      const qs = sel ? `?equipment=${encodeURIComponent(sel)}` : "";
      const res = await fetch(`/api/ops2/admin${qs}`, { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error ?? String(res.status));
      setData(j as Detail);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "불러오지 못했습니다.");
    }
  }, [sel]);

  // 바로 한 번(다음 틱) + 2 s 마다
  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = setInterval(load, 2_000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [load]);

  const st = data?.state;
  const sd = (st?.data ?? {}) as Record<string, unknown>;
  const uplink = sd.uplink as Record<string, unknown> | undefined;
  const alarms = (sd.alarms as unknown[] | undefined) ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-3 p-3 sm:p-6">
      <h2 className="text-base font-bold text-gray-900">챔버K v2 연결 확인</h2>
      {error && <p className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}

      <Card title={`장비 (lease ${data?.leaseSec ?? "-"} s)`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[11px] text-gray-400">
              <tr>
                <th className="py-1 pr-3">장비</th><th className="pr-3">연결</th><th className="pr-3">주인 실행</th>
                <th className="pr-3">마지막 연락</th><th className="pr-3">시계 차</th><th className="pr-3">runMode</th>
                <th className="pr-3">버전</th><th className="pr-3">설정</th><th>webSchema</th>
              </tr>
            </thead>
            <tbody>
              {(data?.devices ?? []).map((d) => (
                <tr
                  key={d.equipment}
                  onClick={() => setSel(d.equipment)}
                  className={`cursor-pointer border-t border-gray-50 hover:bg-gray-50 ${sel === d.equipment ? "bg-gray-50" : ""}`}
                >
                  <td className="py-1.5 pr-3 font-semibold">{d.equipment}{!d.enabled && " (꺼짐)"}</td>
                  <td className="pr-3">
                    <span className={d.online ? "text-emerald-600" : "text-gray-400"}>{d.online ? "연결" : "끊김"}</span>
                  </td>
                  <td className="pr-3 font-mono">{short(d.holderInstance)}</td>
                  <td className="pr-3">{d.lastSeenAt ? `${fmtLogTime(d.lastSeenAt)} (${fmtAgo(d.lastSeenAt)})` : "-"}</td>
                  <td className={`pr-3 ${d.clockSkewMs !== null && Math.abs(d.clockSkewMs) > 3000 ? "text-amber-600" : ""}`}>
                    {skewText(d.clockSkewMs)}
                  </td>
                  <td className="pr-3">
                    {d.runMode ?? "-"}{d.writesAllowed === false && " · 읽기 전용"}
                  </td>
                  <td className="pr-3 font-mono">{d.version ?? "-"}</td>
                  <td className="pr-3">{d.configVersion ?? "-"}</td>
                  <td className="font-mono">{short(d.webSchemaHash, 12)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-gray-400">줄을 누르면 아래에 그 장비의 최근 기록이 나옵니다.</p>
      </Card>

      {sel && data && (
        <>
          <Card title={`최근 state — ${sel}`}>
            {st ? (
              <div className="space-y-1 text-xs text-gray-700">
                <p>
                  <span className="font-mono">{short(st.instance)}</span> · 장비 {fmtLogTime(st.ts)} · 받음 {fmtLogTime(st.receivedAt)}
                </p>
                <p>
                  procState <b>{String(sd.procState ?? "-")}</b> · runId {String(sd.runId ?? "-")} · 설정 {String(sd.configVersion ?? "-")}
                  {sd.stopping ? ` · 정지 중 ${String(sd.stopping)}` : ""}
                </p>
                <p>알람 {alarms.length ? JSON.stringify(alarms) : "없음"}</p>
                <p>
                  uplink: SSE {uplink?.connected ? "연결" : "끊김"} · queued {String(uplink?.queued ?? "-")} ·
                  dropped {String(uplink?.dropped ?? "-")} · lastError {String(uplink?.lastError ?? "-")}
                </p>
                <details>
                  <summary className="cursor-pointer text-[11px] text-gray-400">state 전체</summary>
                  <pre className="mt-1 max-h-80 overflow-auto rounded-lg bg-gray-50 p-2 text-[10px]">
                    {JSON.stringify(sd, null, 2)}
                  </pre>
                </details>
              </div>
            ) : <p className="text-xs text-gray-400">아직 없음</p>}
          </Card>

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            <Card title="사건(최근 50)">
              <ul className="max-h-96 space-y-1 overflow-auto text-[11px]">
                {(data.events ?? []).map((e) => (
                  <li key={e.msgId} className="flex gap-2">
                    <span className="shrink-0 font-mono text-gray-400">{fmtLogTime(e.ts)}</span>
                    <span className={`shrink-0 font-semibold ${LEVEL_TONE[e.level] ?? ""}`}>{e.code}</span>
                    <span className="min-w-0 text-gray-600">
                      {e.message}{e.runId ? ` [run ${e.runId}]` : ""}{e.source ? ` (${e.source})` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
            <div className="space-y-3">
              <Card title="공정 run(최근 20)">
                <ul className="space-y-1 text-[11px] text-gray-600">
                  {(data.runs ?? []).map((r) => (
                    <li key={r.runId}>
                      <span className="font-mono">{r.runId}</span> · {r.name ?? r.recipeName ?? "-"} · 행 {r.stepNo ?? "-"} ·
                      {" "}{r.startedAt ? fmtLogTime(r.startedAt) : "시작 기록 없음"} → {r.endedAt ? fmtLogTime(r.endedAt) : "진행/끝 기록 없음"}
                      {r.result && ` · ${r.result}`}{r.reasonCode && ` (${r.reasonCode})`}{r.startedBy && ` · ${r.startedBy}`}
                    </li>
                  ))}
                  {!data.runs?.length && <li className="text-gray-400">없음</li>}
                </ul>
              </Card>
              <Card title="명령 결과(cmd_result, 최근 20)">
                <ul className="space-y-1 text-[11px] text-gray-600">
                  {(data.results ?? []).map((r) => (
                    <li key={r.msgId}>
                      <span className="font-mono text-gray-400">{fmtLogTime(r.ts)}</span> {r.kind} · {r.status}
                      {r.reasonCode && ` (${r.reasonCode})`} · {r.source ?? "-"} · {r.requestedBy ?? "-"}
                    </li>
                  ))}
                  {!data.results?.length && <li className="text-gray-400">없음</li>}
                </ul>
              </Card>
              <Card title="실행·묶음·형식 오류">
                <div className="space-y-2 text-[11px] text-gray-600">
                  <div>
                    {(data.instances ?? []).map((i) => (
                      <p key={i.instance}>
                        <span className="font-mono">{short(i.instance)}</span> · {i.version ?? "-"} · {i.runMode ?? "-"} ·
                        {" "}{fmtLogTime(i.firstSeenAt)} ~ {fmtLogTime(i.lastSeenAt)}
                      </p>
                    ))}
                  </div>
                  <div>
                    {(data.schemas ?? []).map((s) => (
                      <p key={s.hash}>webSchema <span className="font-mono">{short(s.hash, 12)}</span> v{s.version ?? "-"} · {fmtLogTime(s.receivedAt)}</p>
                    ))}
                    <p>1분 요약 {data.summaryCount ?? 0}건</p>
                  </div>
                  <div>
                    {(data.bad ?? []).map((b) => (
                      <p key={b.id} className="text-rose-600">
                        {fmtLogTime(b.receivedAt)} <span className="font-mono">{short(b.id, 12)}</span> {b.error}
                      </p>
                    ))}
                    {!data.bad?.length && <p className="text-gray-400">형식 오류 없음</p>}
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
