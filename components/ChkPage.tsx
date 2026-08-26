"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Info } from "lucide-react";

type OpsStatus = {
  state: { equipment: string; payload: Record<string, unknown>; updatedAt: string } | null;
  run: { id: number; processName: string | null; startedAt: string } | null;
  events: { id: number; ts: string; level: string; message: string }[];
  runs: {
    id: number;
    status: string;
    processName: string | null;
    startedAt: string;
    endedAt: string | null;
    errorMsg: string | null;
  }[];
};

const RUN_BADGE: Record<string, string> = {
  running: "bg-gray-800 text-white",
  done: "bg-gray-100 text-gray-500",
  error: "bg-rose-50 text-rose-600",
  aborted: "bg-amber-50 text-amber-600",
};

function fmt(d: string | null | undefined) {
  if (!d) return "-";
  const t = new Date(d);
  return `${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")} ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
}

function dur(a: string, b: string | null) {
  if (!b) return "-";
  const s = Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 1000));
  return `${Math.floor(s / 60)}분 ${s % 60}초`;
}

export default function ChkPage() {
  const [data, setData] = useState<OpsStatus | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/ops/status?equipment=CHK", { cache: "no-store" });
        if (!res.ok) throw new Error();
        const j = (await res.json()) as OpsStatus;
        if (alive) {
          setData(j);
          setError(false);
        }
      } catch {
        if (alive) setError(true);
      }
    };
    load();
    const t = setInterval(load, 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const payload = (data?.state?.payload ?? {}) as {
    status?: string;
    stage?: string;
    metrics?: Record<string, string | number>;
    heater?: { pv?: number | string; sv?: number | string; on?: boolean };
  };
  const updatedAt = data?.state?.updatedAt ? new Date(data.state.updatedAt).getTime() : 0;
  const online = updatedAt > 0 && Date.now() - updatedAt < 30_000;
  const running = online && (payload.status === "running" || !!data?.run);
  const metrics = payload.metrics ?? {};

  const METRIC_LABELS: [string, string][] = [
    ["dc_p", "DC Power (W)"],
    ["dc_v", "DC Voltage (V)"],
    ["dc_i", "DC Current (A)"],
    ["rf_for", "RF for.P (W)"],
    ["rf_ref", "RF ref.P (W)"],
    ["ar_flow", "Ar (sccm)"],
    ["o2_flow", "O₂ (sccm)"],
  ];

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-bold text-gray-900">CHK</h2>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-gray-400">
          <span className={`h-2 w-2 rounded-full ${online ? "bg-emerald-500" : "bg-gray-300"}`} />
          {online ? "리포터 온라인" : "리포터 미연결"}
        </span>
      </div>

      {!online && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-gray-100 bg-white p-4 text-sm text-gray-500">
          <Info size={16} className="mt-0.5 shrink-0 text-gray-400" />
          <p>
            CHK 프로그램의 리포터가 아직 연결되지 않았습니다. 프로그램이 켜지고 최근 30초 내
            상태가 수신되면 이 화면이 실시간으로 바뀝니다.
            {error && " (상태 API 호출 실패 — 로그인 상태를 확인하세요)"}
          </p>
        </div>
      )}

      <div className="rounded-2xl border border-gray-100 bg-white p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-gray-900">공정 현황</h3>
          <span
            className={`rounded-lg px-2 py-0.5 text-[11px] font-semibold ${
              running ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-500"
            }`}
          >
            {online ? (running ? "가동" : "대기") : "미연결"}
          </span>
        </div>
        {running && data?.run && (
          <p className="text-xs text-gray-500">
            {data.run.processName ?? "이름 없는 공정"} · 시작 {fmt(data.run.startedAt)}
          </p>
        )}
        <p className="mt-1 text-xs text-gray-500">{payload.stage ?? (online ? "대기 중" : "-")}</p>

        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-gray-50 pt-3 sm:grid-cols-4">
          {METRIC_LABELS.map(([k, label]) => (
            <span key={k} className="text-xs text-gray-600">
              <span className="text-gray-400">{label}</span>{" "}
              {metrics[k] !== undefined && metrics[k] !== "" ? String(metrics[k]) : "-"}
            </span>
          ))}
          <span className="text-xs text-gray-600">
            <span className="text-gray-400">Heater PV/SV (℃)</span>{" "}
            {payload.heater ? `${payload.heater.pv ?? "-"} / ${payload.heater.sv ?? "-"}` : "-"}
          </span>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-4">
        <h3 className="mb-2 text-sm font-bold text-gray-900">최근 이벤트</h3>
        {!data?.events?.length ? (
          <p className="py-4 text-center text-xs text-gray-300">수신된 이벤트가 없습니다</p>
        ) : (
          <div className="max-h-56 space-y-1 overflow-y-auto font-mono text-[11px]">
            {data.events.map((ev) => (
              <p
                key={ev.id}
                className={
                  ev.level === "error"
                    ? "text-rose-600"
                    : ev.level === "warn"
                      ? "text-amber-600"
                      : "text-gray-600"
                }
              >
                <span className="mr-2 text-gray-400">{fmt(ev.ts)}</span>
                {ev.message}
              </p>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-4">
        <h3 className="mb-2 text-sm font-bold text-gray-900">런 이력</h3>
        {!data?.runs?.length ? (
          <p className="py-4 text-center text-xs text-gray-300">기록된 런이 없습니다</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-xs">
              <thead>
                <tr className="text-left text-gray-400">
                  <th className="py-1.5 font-medium">시작</th>
                  <th className="py-1.5 font-medium">공정명</th>
                  <th className="py-1.5 font-medium">상태</th>
                  <th className="py-1.5 font-medium">소요</th>
                  <th className="py-1.5 font-medium">비고</th>
                </tr>
              </thead>
              <tbody>
                {data.runs.map((r) => (
                  <tr key={r.id} className="border-t border-gray-50 text-gray-600">
                    <td className="py-2 whitespace-nowrap">{fmt(r.startedAt)}</td>
                    <td className="py-2">{r.processName ?? "-"}</td>
                    <td className="py-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${RUN_BADGE[r.status] ?? "bg-gray-100 text-gray-500"}`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="py-2">{dur(r.startedAt, r.endedAt)}</td>
                    <td className="py-2">{r.errorMsg ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="flex items-start gap-1.5 text-[11px] text-gray-400">
        <AlertTriangle size={12} className="mt-0.5 shrink-0" />
        읽기 전용 모니터링입니다. 원격 제어는 다음 단계에서 추가되며, 비상정지는 항상 현장
        E-Stop이 우선입니다.
      </p>
    </div>
  );
}
