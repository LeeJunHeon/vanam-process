"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, Circle } from "lucide-react";
import {
  ONLINE_WINDOW_MS, RUN_LABEL, fmtDateTime, fmtDuration, fmtTime, secBetween,
  type MetricGroup, type OpsStatus,
} from "@/lib/ops";

// ── 데이터 훅 ────────────────────────────────────────────────
// 장비 상태를 3초 주기로 폴링한다. 탭이 백그라운드면 쉰다.
export function useOpsStatus(equipment: string) {
  const [data, setData] = useState<OpsStatus | null>(null);
  const [failed, setFailed] = useState(false);
  // 온라인 판정은 '지금'에 의존하므로 렌더 중 Date.now()를 부르지 않고 폴링 시각을 상태로 둔다
  const [nowMs, setNowMs] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch(`/api/ops/status?equipment=${encodeURIComponent(equipment)}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(String(res.status));
        const j = (await res.json()) as OpsStatus;
        if (alive) { setData(j); setFailed(false); }
      } catch {
        if (alive) setFailed(true);
      } finally {
        if (alive) setNowMs(Date.now());
      }
    };
    load();
    const t = setInterval(load, 3000);
    return () => { alive = false; clearInterval(t); };
  }, [equipment]);

  const updatedMs = data?.state?.updatedAt ? new Date(data.state.updatedAt).getTime() : 0;
  const online = updatedMs > 0 && nowMs - updatedMs < ONLINE_WINDOW_MS;
  return { data, failed, online, updatedAt: data?.state?.updatedAt ?? null };
}

// 가동 중 경과 시간 갱신용 1초 틱
export function useTick(active: boolean) {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setN((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, [active]);
}

// ── 껍데기 ───────────────────────────────────────────────────
export function OpsCard({
  title, right, children, className = "",
}: { title?: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-gray-100 bg-white p-4 ${className}`}>
      {(title || right) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h3 className="text-sm font-bold text-gray-900">{title}</h3>}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function ConnBadge({ online, updatedAt }: { online: boolean; updatedAt: string | null }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-gray-400">
      <span className={`h-2 w-2 rounded-full ${online ? "bg-emerald-500" : "bg-gray-300"}`} />
      {online ? "온라인" : "미연결"}
      {updatedAt && <span className="text-gray-300">· {fmtTime(updatedAt)}</span>}
    </span>
  );
}

// ── 상태 히어로 ──────────────────────────────────────────────
export function StatusHero({
  online, status, stage, runStartedAt, runName, totalSec, lastRun,
}: {
  online: boolean;
  status?: string;
  stage?: string;
  runStartedAt?: string | null;
  runName?: string | null;
  totalSec?: number;
  lastRun?: { startedAt: string; endedAt: string | null; status: string; processName: string | null } | null;
}) {
  const running = online && (status === "running" || !!runStartedAt);
  useTick(running);

  if (!online) {
    return (
      <OpsCard>
        <p className="text-2xl font-bold tracking-tight text-gray-300">미연결</p>
        <p className="mt-1 text-xs text-gray-400">
          장비 프로그램의 리포터가 연결되면 실시간 상태가 표시됩니다
        </p>
      </OpsCard>
    );
  }

  if (!running) {
    return (
      <OpsCard>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-2xl font-bold tracking-tight text-gray-900">대기 중</p>
            <p className="mt-1 text-xs text-gray-400">
              {lastRun
                ? `마지막 공정 ${fmtDateTime(lastRun.startedAt)} · ${lastRun.processName ?? "이름 없음"} · ${RUN_LABEL[lastRun.status] ?? lastRun.status}`
                : "기록된 공정이 없습니다"}
            </p>
          </div>
          {stage && <p className="text-xs text-gray-500">{stage}</p>}
        </div>
      </OpsCard>
    );
  }

  const elapsed = secBetween(runStartedAt);
  const total = totalSec && totalSec > 0 ? totalSec : 0;
  const remain = total > 0 ? Math.max(0, total - elapsed) : 0;
  const pct = total > 0 ? Math.min(100, Math.round((elapsed / total) * 100)) : 0;

  return (
    <OpsCard>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-gray-500">가동 중</p>
          <p className="mt-0.5 truncate text-lg font-bold text-gray-900">{stage || "공정 진행"}</p>
          <p className="mt-1 truncate text-xs text-gray-400">
            {runName ?? "이름 없는 공정"} · 시작 {fmtTime(runStartedAt)} · 경과 {fmtDuration(elapsed)}
          </p>
        </div>
        {total > 0 && (
          <div className="text-right">
            <p className="text-[11px] text-gray-400">남은 시간</p>
            <p className="text-3xl font-bold tracking-tight text-gray-900 tabular-nums">
              {fmtDuration(remain)}
            </p>
          </div>
        )}
      </div>
      {total > 0 && (
        <>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-100">
            <div className="h-full rounded-full bg-gray-700 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1 text-right text-[11px] text-gray-400">{pct}%</p>
        </>
      )}
    </OpsCard>
  );
}

// ── 인디케이터 / 밸브 ────────────────────────────────────────
export function IndicatorBar({ items }: { items?: Record<string, boolean> }) {
  const keys = Object.keys(items ?? {});
  if (!keys.length) return null;
  return (
    <OpsCard title="유틸리티">
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {keys.map((k) => (
          <span key={k} className="flex items-center gap-1.5 text-xs text-gray-600">
            <Circle
              size={9}
              className={items![k] ? "fill-gray-700 text-gray-700" : "fill-rose-500 text-rose-500"}
            />
            {k}
          </span>
        ))}
      </div>
    </OpsCard>
  );
}

export function ValveGrid({ items }: { items?: Record<string, boolean> }) {
  const keys = Object.keys(items ?? {});
  if (!keys.length) return null;
  return (
    <OpsCard title="밸브 · 펌프">
      <div className="flex flex-wrap gap-1.5">
        {keys.map((k) => (
          <span
            key={k}
            className={`rounded-lg px-2 py-1 text-[11px] font-medium ${
              items![k] ? "bg-gray-800 text-white" : "border border-gray-200 text-gray-400"
            }`}
          >
            {k}
          </span>
        ))}
      </div>
    </OpsCard>
  );
}

// ── 계측 그룹 ────────────────────────────────────────────────
function val(v: unknown): string {
  if (v === null || v === undefined) return "-";
  const s = String(v).trim();
  return s === "" ? "-" : s;
}

export function MetricGroups({ groups }: { groups?: MetricGroup[] }) {
  if (!groups?.length) return null;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {groups.map((g) => (
        <OpsCard key={g.label} title={g.label}>
          <div className="space-y-2.5">
            {g.items.map((it) => {
              const pv = val(it.value);
              const sv = val(it.setpoint);
              const main = pv !== "-" ? pv : sv;
              const isSvOnly = pv === "-" && sv !== "-";
              return (
                <div key={it.label}>
                  <p className="text-[11px] text-gray-400">
                    {it.label}
                    {isSvOnly && <span className="ml-1 text-gray-300">설정</span>}
                  </p>
                  <p className="text-base font-semibold tabular-nums text-gray-900">
                    {main}
                    {main !== "-" && it.unit && (
                      <span className="ml-1 text-xs font-normal text-gray-400">{it.unit}</span>
                    )}
                  </p>
                  {!isSvOnly && sv !== "-" && (
                    <p className="text-[11px] text-gray-300">설정 {sv}</p>
                  )}
                  {it.sub && <p className="text-[11px] text-gray-400">{it.sub}</p>}
                </div>
              );
            })}
          </div>
        </OpsCard>
      ))}
    </div>
  );
}

// 구버전 평면 metrics 대비 폴백
export function FlatMetrics({ metrics }: { metrics?: Record<string, string | number> }) {
  const keys = Object.keys(metrics ?? {});
  if (!keys.length) return null;
  return (
    <OpsCard title="계측값">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
        {keys.map((k) => (
          <span key={k} className="text-xs text-gray-600">
            <span className="text-gray-400">{k}</span> {val(metrics![k])}
          </span>
        ))}
      </div>
    </OpsCard>
  );
}

// ── 이벤트 피드 ──────────────────────────────────────────────
export function EventFeed({ events }: { events?: { id: number; ts: string; level: string; message: string }[] }) {
  const [onlyIssue, setOnlyIssue] = useState(false);
  const list = (events ?? []).filter((e) => (onlyIssue ? e.level !== "info" : true));
  const issueCount = (events ?? []).filter((e) => e.level !== "info").length;

  return (
    <OpsCard
      title="최근 이벤트"
      right={
        <button
          onClick={() => setOnlyIssue((v) => !v)}
          className={`rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors ${
            onlyIssue ? "bg-rose-50 text-rose-600" : "text-gray-400 hover:bg-gray-50"
          }`}
        >
          경고·오류만{issueCount > 0 && ` (${issueCount})`}
        </button>
      }
    >
      {!list.length ? (
        <p className="py-6 text-center text-xs text-gray-300">
          {onlyIssue ? "경고·오류가 없습니다" : "수신된 이벤트가 없습니다"}
        </p>
      ) : (
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {list.map((e) => (
            <p key={e.id} className="flex gap-2 font-mono text-[11px]">
              <span className="shrink-0 text-gray-300">{fmtTime(e.ts)}</span>
              <span
                className={
                  e.level === "error"
                    ? "text-rose-600"
                    : e.level === "warn"
                      ? "text-amber-600"
                      : "text-gray-600"
                }
              >
                {e.message}
              </span>
            </p>
          ))}
        </div>
      )}
    </OpsCard>
  );
}

// ── 런 이력 ──────────────────────────────────────────────────
export function RunHistory({
  runs,
}: {
  runs?: { id: number; status: string; processName: string | null; startedAt: string; endedAt: string | null; errorMsg: string | null }[];
}) {
  const badge: Record<string, string> = {
    running: "bg-gray-800 text-white",
    done: "bg-gray-100 text-gray-500",
    error: "bg-rose-50 text-rose-600",
    aborted: "bg-amber-50 text-amber-600",
  };
  return (
    <OpsCard title="런 이력">
      {!runs?.length ? (
        <p className="py-6 text-center text-xs text-gray-300">기록된 런이 없습니다</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-xs">
            <thead>
              <tr className="text-left text-gray-400">
                <th className="py-1.5 font-medium">시작</th>
                <th className="py-1.5 font-medium">공정명</th>
                <th className="py-1.5 font-medium">결과</th>
                <th className="py-1.5 font-medium">소요</th>
                <th className="py-1.5 font-medium">비고</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-t border-gray-50 text-gray-600">
                  <td className="py-2 whitespace-nowrap">{fmtDateTime(r.startedAt)}</td>
                  <td className="py-2">{r.processName ?? "-"}</td>
                  <td className="py-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${badge[r.status] ?? "bg-gray-100 text-gray-500"}`}>
                      {RUN_LABEL[r.status] ?? r.status}
                    </span>
                  </td>
                  <td className="py-2 tabular-nums">
                    {r.endedAt ? fmtDuration(secBetween(r.startedAt, r.endedAt)) : "진행 중"}
                  </td>
                  <td className="py-2 text-rose-600">{r.errorMsg ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </OpsCard>
  );
}

export function ReadOnlyNote() {
  return (
    <p className="flex items-start gap-1.5 text-[11px] text-gray-400">
      <AlertTriangle size={12} className="mt-0.5 shrink-0" />
      읽기 전용 모니터링입니다. 원격 제어는 다음 단계에서 추가되며, 비상정지는 항상 현장
      E-Stop이 우선입니다.
    </p>
  );
}
