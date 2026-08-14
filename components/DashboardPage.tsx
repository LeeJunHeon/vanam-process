"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CalendarDays, Clock } from "lucide-react";
import WeeklyBoard from "@/components/WeeklyBoard";
import { PROCESS_STATUSES, STATUS_STYLE } from "@/lib/status";
import { errorMessage } from "@/lib/fetchError";

type ProcItem = {
  id: number;
  orderNo: string;
  company: string | null;
  jobName: string | null;
  sequence: number;
  code: string;
  detail: string | null;
  plannedStart: string | null;
  status: string;
  owner: string | null;
};
type DueItem = {
  id: number;
  orderNo: string;
  company: string | null;
  jobName: string | null;
  dueAt: string;
  done: number;
  total: number;
};
type Data = {
  scope: "all" | "mine";
  today: string;
  statusCounts: Record<string, number>;
  overdue: ProcItem[];
  upcoming: ProcItem[];
  dueSoon: DueItem[];
};

function dday(base: string, target: string): string {
  const diff = Math.round(
    (new Date(target).getTime() - new Date(base).getTime()) / 86400000,
  );
  if (diff === 0) return "오늘";
  return diff > 0 ? `D-${diff}` : `D+${-diff}`;
}

export default function DashboardPage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/dashboard");
        if (!res.ok) {
          const d = await res.json().catch(() => null);
          throw new Error(d?.error ?? `조회 실패 (${res.status})`);
        }
        setData(await res.json());
      } catch (e) {
        setError(errorMessage(e, "현황을 불러오지 못했습니다."));
      }
    })();
  }, []);

  if (error) {
    return (
      <div className="p-4 sm:p-6">
        <div className="rounded-2xl border border-rose-100 bg-rose-50 p-8 text-center text-sm text-rose-600">
          {error}
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="p-4 sm:p-6">
        <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center text-sm text-gray-400">
          불러오는 중...
        </div>
      </div>
    );
  }

  // 지연/예정 공정 한 항목 — 2줄 구조 (윗줄: 상태·공정·D-day, 아랫줄: 발주·담당·날짜)
  const procLine = (p: ProcItem) => (
    <div key={p.id} className="px-3 py-2">
      <div className="flex items-center gap-1.5">
        <span
          className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold ${STATUS_STYLE[p.status] ?? "bg-gray-100 text-gray-600"}`}
        >
          {p.status}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-gray-800">
          {p.code}
          {p.detail ? ` · ${p.detail}` : ""}
        </span>
        {p.plannedStart && (
          <span className="shrink-0 text-[11px] font-bold text-gray-500">
            {dday(data.today, p.plannedStart)}
          </span>
        )}
      </div>
      <p className="mt-0.5 truncate text-[11px] text-gray-400">
        {p.orderNo}
        {p.company ? ` · ${p.company}` : ""}
        {p.owner ? ` · ${p.owner}` : ""}
        {p.plannedStart ? ` · ${p.plannedStart.slice(5)}` : ""}
      </p>
    </div>
  );

  const dueLine = (o: DueItem) => (
    <div key={o.id} className="px-3 py-2">
      <div className="flex items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-gray-800">
          {o.orderNo}
          {o.jobName ? ` · ${o.jobName}` : ""}
        </span>
        <span className="shrink-0 text-[11px] font-bold text-gray-500">
          {dday(data.today, o.dueAt)}
        </span>
      </div>
      <p className="mt-0.5 truncate text-[11px] text-gray-400">
        {o.company ? `${o.company} · ` : ""}공정 {o.done}/{o.total} · 납기 {o.dueAt.slice(5)}
      </p>
    </div>
  );

  const Section = ({
    icon,
    title,
    accent,
    children,
    empty,
    count,
  }: {
    icon: React.ReactNode;
    title: string;
    accent: string;
    children: React.ReactNode;
    empty: string;
    count: number;
  }) => (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white">
      <div className={`flex items-center gap-1.5 border-b border-gray-50 px-3 py-2.5 ${accent}`}>
        {icon}
        <span className="text-[13px] font-bold">{title}</span>
        <span className="text-[11px] font-semibold opacity-60">{count}</span>
      </div>
      {count === 0 ? (
        <div className="px-3 py-5 text-center text-[12px] text-gray-300">{empty}</div>
      ) : (
        <div className="max-h-60 divide-y divide-gray-50 overflow-y-auto">{children}</div>
      )}
    </div>
  );

  return (
    <div className="space-y-4 p-4 sm:p-6">
      {data.scope === "mine" && (
        <p className="text-[11px] font-medium text-gray-400">내가 담당한 공정 기준입니다.</p>
      )}

      {/* 상태별 공정 수 */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {PROCESS_STATUSES.map((s) => (
          <div key={s} className="rounded-2xl border border-gray-100 bg-white p-3 text-center">
            <p className="text-xl font-bold text-gray-900">{data.statusCounts[s] ?? 0}</p>
            <span
              className={`mt-1 inline-block rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[s]}`}
            >
              {s}
            </span>
          </div>
        ))}
      </div>

      {/* 지연 / 예정 / 납기 — 1행 3열 (일반 직원은 2열) */}
      <div
        className={
          data.scope === "all"
            ? "grid grid-cols-1 gap-4 lg:grid-cols-3"
            : "grid grid-cols-1 gap-4 lg:grid-cols-2"
        }
      >
        <Section
          icon={<AlertTriangle size={14} className="text-rose-500" />}
          title="시작 지연"
          accent="text-rose-600"
          empty="지연된 공정이 없습니다."
          count={data.overdue.length}
        >
          {data.overdue.map(procLine)}
        </Section>

        <Section
          icon={<Clock size={14} className="text-blue-500" />}
          title="7일 내 시작 예정"
          accent="text-blue-600"
          empty="예정된 공정이 없습니다."
          count={data.upcoming.length}
        >
          {data.upcoming.map(procLine)}
        </Section>

        {data.scope === "all" && (
          <Section
            icon={<CalendarDays size={14} className="text-amber-500" />}
            title="납기 임박·초과 발주"
            accent="text-amber-600"
            empty="임박한 납기가 없습니다."
            count={data.dueSoon.length}
          >
            {data.dueSoon.map(dueLine)}
          </Section>
        )}
      </div>

      {/* 주간 장비 보드 */}
      <WeeklyBoard />
    </div>
  );
}
