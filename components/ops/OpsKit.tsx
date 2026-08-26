"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, ChevronDown } from "lucide-react";
import {
  ONLINE_WINDOW_MS, RUN_LABEL, fmtDateTime, fmtDuration, fmtTime, secBetween,
  type MetricGroup, type MetricItem, type OpsEvent, type OpsRun, type OpsStatus,
} from "@/lib/ops";

// ── 데이터 훅 ────────────────────────────────────────────────
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

export function useTick(active: boolean) {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setN((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, [active]);
}

// ── 값 정규화 ────────────────────────────────────────────────
function norm(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v).trim();
  return s === "-" ? "" : s;
}

// ── 카드 / 섹션 ──────────────────────────────────────────────
export function OpsCard({
  title, right, children, className = "",
}: { title?: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-gray-100 bg-white p-3 sm:p-4 ${className}`}>
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

// 모바일 스크롤 길이를 줄이기 위한 접이식 섹션
export function Collapsible({
  title, right, defaultOpen = true, children,
}: { title: string; right?: ReactNode; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-2xl border border-gray-100 bg-white">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-3 text-left sm:px-4"
      >
        <span className="text-sm font-bold text-gray-900">{title}</span>
        <span className="flex items-center gap-2">
          {right}
          <ChevronDown
            size={15}
            className={`shrink-0 text-gray-300 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </span>
      </button>
      {open && <div className="px-3 pb-3 sm:px-4 sm:pb-4">{children}</div>}
    </section>
  );
}

export function ConnBadge({ online, updatedAt }: { online: boolean; updatedAt: string | null }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-gray-400 sm:text-xs">
      <span className={`h-2 w-2 rounded-full ${online ? "bg-emerald-500" : "bg-gray-300"}`} />
      {online ? "온라인" : "미연결"}
      {updatedAt && <span className="hidden text-gray-300 sm:inline">· {fmtTime(updatedAt)}</span>}
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
  lastRun?: OpsRun | null;
}) {
  const running = online && (status === "running" || !!runStartedAt);
  useTick(running);

  if (!online) {
    return (
      <OpsCard>
        <p className="text-xl font-bold tracking-tight text-gray-300 sm:text-2xl">미연결</p>
        <p className="mt-1 text-xs text-gray-400">
          장비 프로그램의 리포터가 연결되면 실시간 상태가 표시됩니다
        </p>
      </OpsCard>
    );
  }

  if (!running) {
    return (
      <OpsCard>
        <p className="text-xl font-bold tracking-tight text-gray-900 sm:text-2xl">대기 중</p>
        <p className="mt-1 text-xs text-gray-400">
          {lastRun
            ? `마지막 공정 ${fmtDateTime(lastRun.startedAt)} · ${lastRun.processName ?? "이름 없음"} · ${RUN_LABEL[lastRun.status] ?? lastRun.status}`
            : "기록된 공정이 없습니다"}
        </p>
        {stage && <p className="mt-2 text-xs text-gray-500">{stage}</p>}
      </OpsCard>
    );
  }

  const elapsed = secBetween(runStartedAt);
  const total = totalSec && totalSec > 0 ? totalSec : 0;
  const remain = total > 0 ? Math.max(0, total - elapsed) : 0;
  const pct = total > 0 ? Math.min(100, Math.round((elapsed / total) * 100)) : 0;

  return (
    <OpsCard>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-gray-500">가동 중</p>
          <p className="mt-0.5 truncate text-base font-bold text-gray-900 sm:text-lg">
            {stage || "공정 진행"}
          </p>
          <p className="mt-1 truncate text-[11px] text-gray-400">
            {runName ?? "이름 없는 공정"} · 시작 {fmtTime(runStartedAt)} · 경과 {fmtDuration(elapsed)}
          </p>
        </div>
        {total > 0 && (
          <div className="shrink-0">
            <p className="text-[11px] text-gray-400">남은 시간</p>
            <p className="text-2xl font-bold tracking-tight tabular-nums text-gray-900 sm:text-3xl">
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
          <p className="mt-1 text-right text-[10px] text-gray-400">{pct}%</p>
        </>
      )}
    </OpsCard>
  );
}

// ── 히터 ─────────────────────────────────────────────────────
const HEATER_FAULT = ["과온 트립", "센서 이상", "통신 두절", "이상 발생"];

export function HeaterCard({
  heater,
}: { heater?: { pv?: string; sv?: string; status?: string; output?: string } }) {
  if (!heater) return null;
  const pv = norm(heater.pv);
  const sv = norm(heater.sv);
  const st = norm(heater.status);
  const tone = HEATER_FAULT.includes(st)
    ? "text-rose-600"
    : st === "인터락"
      ? "text-amber-600"
      : "text-gray-500";

  return (
    <OpsCard title="기판 히터">
      <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
        <div>
          <p className="text-[11px] text-gray-400">현재</p>
          <p className={`text-2xl font-bold tabular-nums ${pv ? "text-gray-900" : "text-gray-300"}`}>
            {pv || "—"}
            {pv && <span className="ml-1 text-xs font-normal text-gray-400">℃</span>}
          </p>
        </div>
        <div className="pb-1">
          <p className="text-[11px] text-gray-400">목표</p>
          <p className={`text-sm font-semibold tabular-nums ${sv ? "text-gray-600" : "text-gray-300"}`}>
            {sv ? `${sv} ℃` : "—"}
          </p>
        </div>
        <div className="ml-auto pb-1 text-right">
          {st && <p className={`text-xs font-semibold ${tone}`}>{st}</p>}
          {norm(heater.output) && (
            <p className="text-[10px] text-gray-400">{heater.output}</p>
          )}
        </div>
      </div>
    </OpsCard>
  );
}

// ── 계측 ─────────────────────────────────────────────────────
function Tile({ item }: { item: MetricItem }) {
  const pv = norm(item.value);
  const sv = norm(item.setpoint);
  const svOnly = !pv && !!sv;
  const main = pv || sv;

  return (
    <div className="rounded-xl bg-gray-50 px-2.5 py-2">
      <p className="flex items-center gap-1 text-[10px] text-gray-400">
        <span className="truncate">{item.label}</span>
        {svOnly && (
          <span className="shrink-0 rounded bg-gray-200 px-1 text-[9px] font-semibold text-gray-500">
            설정
          </span>
        )}
      </p>
      <p className={`truncate text-base font-semibold tabular-nums ${main ? "text-gray-900" : "text-gray-300"}`}>
        {main || "—"}
        {main && item.unit && (
          <span className="ml-0.5 text-[11px] font-normal text-gray-400">{item.unit}</span>
        )}
      </p>
      <p className="h-3.5 truncate text-[10px] text-gray-300">
        {!svOnly && sv ? `설정 ${sv}` : (item.sub ?? "")}
      </p>
    </div>
  );
}

export function MetricSections({ groups }: { groups?: MetricGroup[] }) {
  if (!groups?.length) return null;
  return (
    <OpsCard title="계측">
      <div className="space-y-4">
        {groups.map((g) => (
          <div key={g.label}>
            <p className="mb-1.5 text-[11px] font-semibold text-gray-400">{g.label}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {g.items.map((it) => (
                <Tile key={it.label} item={it} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </OpsCard>
  );
}

// 구버전 평면 metrics 폴백
export function FlatMetrics({ metrics }: { metrics?: Record<string, string | number> }) {
  const keys = Object.keys(metrics ?? {});
  if (!keys.length) return null;
  return (
    <MetricSections
      groups={[{ label: "계측값", items: keys.map((k) => ({ label: k, value: metrics![k] })) }]}
    />
  );
}

// ── 장비 상태(램프 + 밸브) ───────────────────────────────────
// 램프의 on/off 의미는 장비마다 다르므로 색으로 정상/이상을 단정하지 않는다.
// 채움 = ON, 빈 원 = OFF 로만 표현한다.
export function StateChips({
  indicators, valves,
}: { indicators?: Record<string, boolean>; valves?: Record<string, boolean> }) {
  const ind = Object.entries(indicators ?? {});
  const val = Object.entries(valves ?? {});
  if (!ind.length && !val.length) return null;

  const onCount = [...ind, ...val].filter(([, v]) => v).length;

  return (
    <Collapsible
      title="장비 상태"
      right={<span className="text-[11px] text-gray-400">{onCount}개 ON</span>}
    >
      {ind.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-x-4 gap-y-2">
          {ind.map(([k, on]) => (
            <span key={k} className="flex items-center gap-1.5 text-xs text-gray-600">
              <span
                className={`h-2.5 w-2.5 rounded-full ${on ? "bg-gray-700" : "border border-gray-300"}`}
              />
              {k}
            </span>
          ))}
        </div>
      )}
      {val.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {val.map(([k, on]) => (
            <span
              key={k}
              className={`rounded-lg px-2 py-1 text-[11px] font-medium ${
                on ? "bg-gray-800 text-white" : "border border-gray-200 text-gray-400"
              }`}
            >
              {k}
            </span>
          ))}
        </div>
      )}
    </Collapsible>
  );
}

// ── 이벤트 ───────────────────────────────────────────────────
const EVENT_PAGE = 8;

export function EventFeed({ events }: { events?: OpsEvent[] }) {
  const [onlyIssue, setOnlyIssue] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const all = events ?? [];
  const filtered = onlyIssue ? all.filter((e) => e.level !== "info") : all;
  const shown = expanded ? filtered : filtered.slice(0, EVENT_PAGE);
  const issueCount = all.filter((e) => e.level !== "info").length;

  return (
    <Collapsible
      title="최근 이벤트"
      right={
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => { e.stopPropagation(); setOnlyIssue((v) => !v); }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); setOnlyIssue((v) => !v); }
          }}
          className={`rounded-lg px-2 py-1 text-[11px] font-semibold ${
            onlyIssue ? "bg-rose-50 text-rose-600" : "text-gray-400"
          }`}
        >
          경고·오류{issueCount > 0 && ` ${issueCount}`}
        </span>
      }
    >
      {!shown.length ? (
        <p className="py-6 text-center text-xs text-gray-300">
          {onlyIssue ? "경고·오류가 없습니다" : "수신된 이벤트가 없습니다"}
        </p>
      ) : (
        <>
          <div className="space-y-1">
            {shown.map((e) => (
              <p key={e.id} className="flex gap-2 text-[11px] leading-relaxed">
                <span className="shrink-0 font-mono text-gray-300">{fmtTime(e.ts)}</span>
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
          {filtered.length > EVENT_PAGE && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="mt-2 w-full rounded-lg py-1.5 text-[11px] font-semibold text-gray-400 hover:bg-gray-50"
            >
              {expanded ? "접기" : `${filtered.length - EVENT_PAGE}개 더 보기`}
            </button>
          )}
        </>
      )}
    </Collapsible>
  );
}

// ── 런 이력 ──────────────────────────────────────────────────
const RUN_BADGE: Record<string, string> = {
  running: "bg-gray-800 text-white",
  done: "bg-gray-100 text-gray-500",
  error: "bg-rose-50 text-rose-600",
  aborted: "bg-amber-50 text-amber-600",
};

function RunBadge({ status }: { status: string }) {
  return (
    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${RUN_BADGE[status] ?? "bg-gray-100 text-gray-500"}`}>
      {RUN_LABEL[status] ?? status}
    </span>
  );
}

export function RunHistory({ runs }: { runs?: OpsRun[] }) {
  if (!runs?.length) {
    return (
      <OpsCard title="런 이력">
        <p className="py-6 text-center text-xs text-gray-300">기록된 런이 없습니다</p>
      </OpsCard>
    );
  }
  return (
    <OpsCard title="런 이력">
      {/* 모바일: 카드 리스트 (가로 스크롤 방지) */}
      <div className="divide-y divide-gray-50 sm:hidden">
        {runs.map((r) => (
          <div key={r.id} className="py-2.5 first:pt-0 last:pb-0">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-xs font-medium text-gray-800">
                {r.processName ?? "이름 없음"}
              </span>
              <RunBadge status={r.status} />
            </div>
            <p className="mt-0.5 text-[11px] text-gray-400">
              {fmtDateTime(r.startedAt)} ·{" "}
              {r.endedAt ? fmtDuration(secBetween(r.startedAt, r.endedAt)) : "진행 중"}
            </p>
            {r.errorMsg && <p className="mt-0.5 text-[11px] text-rose-600">{r.errorMsg}</p>}
          </div>
        ))}
      </div>

      {/* 데스크톱: 표 */}
      <table className="hidden w-full text-xs sm:table">
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
              <td className="py-2"><RunBadge status={r.status} /></td>
              <td className="py-2 tabular-nums">
                {r.endedAt ? fmtDuration(secBetween(r.startedAt, r.endedAt)) : "진행 중"}
              </td>
              <td className="py-2 text-rose-600">{r.errorMsg ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </OpsCard>
  );
}

export function ReadOnlyNote() {
  return (
    <p className="flex items-start gap-1.5 px-1 text-[11px] leading-relaxed text-gray-400">
      <AlertTriangle size={12} className="mt-0.5 shrink-0" />
      읽기 전용 모니터링입니다. 원격 제어는 다음 단계에서 추가되며, 비상정지는 항상 현장
      E-Stop이 우선입니다.
    </p>
  );
}
