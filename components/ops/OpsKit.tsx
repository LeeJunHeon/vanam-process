"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import {
  CMD_STATUS_LABEL, ONLINE_WINDOW_MS, RUN_LABEL, fmtAgo, fmtDateTime, fmtDuration,
  fmtLogTime, fmtTime, secBetween,
  type MetricGroup, type MetricItem, type OpsCommand, type OpsEvent, type OpsRun,
  type OpsStatus,
} from "@/lib/ops";
import RecipePicker, { type RecipeItem } from "@/components/ops/RecipePicker";

// ── 데이터 훅 ────────────────────────────────────────────────
// 기본 2.5초 폴링. 명령을 보낸 직후에는 boost()로 0.6초 간격 고속 조회로 전환한다.
export function useOpsStatus(equipment: string) {
  const [data, setData] = useState<OpsStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [nowMs, setNowMs] = useState(0);
  const [fastUntil, setFastUntil] = useState(0);
  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/ops/status?equipment=${encodeURIComponent(equipment)}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(String(res.status));
      const j = (await res.json()) as OpsStatus;
      if (alive.current) { setData(j); setFailed(false); }
    } catch {
      if (alive.current) setFailed(true);
    } finally {
      if (alive.current) setNowMs(Date.now());
    }
  }, [equipment]);

  useEffect(() => {
    alive.current = true;
    load();
    return () => { alive.current = false; };
  }, [load]);

  // 응답을 받을 때마다 다음 조회를 예약한다.
  // 명령 직후(고속) > 장비가 움직이는 중(1초) > 대기 중(3초) 순으로 주기를 정한다.
  const payload = data?.state?.payload as
    | { status?: string; heater?: { on?: boolean; recipeRunning?: boolean } }
    | undefined;
  const active =
    payload?.status === "running" ||
    Boolean(payload?.heater?.on) ||
    Boolean(payload?.heater?.recipeRunning) ||
    Boolean(data?.run);

  useEffect(() => {
    const wait = Date.now() < fastUntil ? 600 : active ? 1000 : 3000;
    const t = setTimeout(() => { if (!document.hidden) load(); }, wait);
    return () => clearTimeout(t);
  }, [load, nowMs, fastUntil, active]);

  const boost = useCallback(() => {
    setFastUntil(Date.now() + 12_000);
    load();
  }, [load]);

  const updatedMs = data?.state?.updatedAt ? new Date(data.state.updatedAt).getTime() : 0;
  const online = updatedMs > 0 && nowMs - updatedMs < ONLINE_WINDOW_MS;
  return { data, failed, online, updatedAt: data?.state?.updatedAt ?? null, boost };
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
    <section className={`rounded-2xl border border-gray-100 bg-white p-3 ${className}`}>
      {(title || right) && (
        <div className="mb-2 flex items-center justify-between gap-2">
          {title && <h3 className="text-sm font-bold text-gray-900">{title}</h3>}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

// 모바일 스크롤 길이를 줄이기 위한 접이식 섹션
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
        <p className="text-lg font-bold tracking-tight text-gray-900 sm:text-xl">대기 중</p>
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
  heater, online, running, onRequest,
}: {
  heater?: { pv?: string; sv?: string; status?: string; output?: string;
             on?: boolean; recipeRunning?: boolean };
  online: boolean;
  running: boolean;
  onRequest: (c: PendingCmd) => void;
}) {
  const [target, setTarget] = useState("");
  const [picker, setPicker] = useState(false);
  const [recipe, setRecipe] = useState<RecipeItem | null>(null);
  const pv = norm(heater?.pv);
  const sv = norm(heater?.sv);
  const st = norm(heater?.status);
  const tone = HEATER_FAULT.includes(st) ? "text-rose-600"
    : st === "인터락" ? "text-amber-600" : "text-gray-500";

  return (
    <OpsCard
      title="히터"
      right={
        <button onClick={() => setPicker(true)}
          className="rounded-lg border border-gray-200 px-2.5 py-1 text-[11px] font-semibold text-gray-700">
          레시피 불러오기
        </button>
      }
    >
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p className={`text-xl font-bold tabular-nums ${pv ? "text-gray-900" : "text-gray-300"}`}>
          {pv || "-"}
          {pv && <span className="ml-0.5 text-xs font-normal text-gray-400">℃</span>}
        </p>
        <p className="text-[11px] text-gray-400">
          목표 <span className={sv ? "text-gray-600" : "text-gray-300"}>{sv ? `${sv} ℃` : "-"}</span>
        </p>
        {st && <p className={`text-[11px] font-semibold ${tone}`}>{st}</p>}
        {norm(heater?.output) && <p className="text-[10px] text-gray-400">{heater?.output}</p>}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-50 pt-2.5">
        <input
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          inputMode="decimal"
          placeholder="목표 ℃"
          className="w-24 rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
        />
        <button
          disabled={!online || !target.trim()}
          onClick={() =>
            onRequest({
              command: "HEATER_SV",
              label: "히터 목표온도",
              detail: `${target}℃`,
              args: { value: target },
            })
          }
          className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-semibold text-gray-700 disabled:opacity-40"
        >
          설정
        </button>
        <span className="flex gap-1.5">
          {([true, false] as const).map((want) => {
            const active = Boolean(heater?.on) === want;
            return (
              <button
                key={String(want)}
                disabled={!online || (want && !target.trim() && !sv)}
                onClick={() =>
                  onRequest({
                    command: "HEATER_ONOFF",
                    label: "히터 운전",
                    detail: want
                      ? `→ ON${(target.trim() || sv) ? ` (${target.trim() || sv}℃)` : ""}`
                      : "→ OFF",
                    args: want
                      ? { on: true, value: target.trim() || sv || "" }
                      : { on: false },
                  })
                }
                className={`rounded-lg border px-3 py-1.5 text-[11px] font-semibold disabled:opacity-40 ${
                  active
                    ? want
                      ? "border-green-600 bg-green-500 text-green-950"
                      : "border-gray-400 bg-gray-200 text-gray-700"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                운전 {want ? "ON" : "OFF"}
              </button>
            );
          })}
        </span>
        {!sv && !target.trim() && (
          <span className="w-full text-[10px] text-gray-400">
            목표 온도를 입력해야 운전을 켤 수 있습니다
          </span>
        )}
        {heater?.recipeRunning && (
          <span className="text-[10px] font-semibold text-blue-600">히터 레시피 실행 중</span>
        )}
        {running && <span className="text-[10px] text-amber-600">공정 중 변경 주의</span>}
      </div>

      {recipe && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-gray-50 px-3 py-2">
          <span className="text-[11px] font-semibold text-gray-700">
            레시피 · {recipe.name} ({recipe.rows.length}단계)
          </span>
          <button disabled={!online}
            onClick={() => onRequest({
              command: "RECIPE_HEATER_RUN", label: "히터 레시피 실행",
              detail: recipe.name, args: { rows: recipe.rows },
            })}
            className="rounded-lg bg-gray-800 px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-40">
            실행
          </button>
          <button disabled={!online}
            onClick={() => onRequest({ command: "RECIPE_HEATER_STOP", label: "히터 레시피 중단" })}
            className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-700 disabled:opacity-40">
            중단
          </button>
          <button onClick={() => setRecipe(null)}
            className="ml-auto text-[11px] text-gray-400 hover:text-gray-600">해제</button>
        </div>
      )}
      {picker && (
        <RecipePicker equipment="CHK" kind="heater"
          onPick={(r) => { setRecipe(r); setPicker(false); }}
          onClose={() => setPicker(false)} />
      )}
    </OpsCard>
  );
}

// ── 이오나이저 ───────────────────────────────────────────────
export function IonizerCard({
  ion, on, online, onRequest,
}: {
  ion?: { run?: boolean; lamp?: boolean; overtime?: boolean };
  on: boolean;
  online: boolean;
  onRequest: (c: PendingCmd) => void;
}) {
  const dot = (v?: boolean, alert?: boolean) =>
    `h-3 w-3 rounded-full border ${
      v ? (alert ? "border-rose-600 bg-rose-500" : "border-green-600 bg-green-500") : "border-gray-300 bg-white"
    }`;

  return (
    <OpsCard title="이오나이저">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <span className="flex items-center gap-1.5 text-xs text-gray-600">
          <span className={dot(ion?.run)} /> 구동
        </span>
        <span className="flex items-center gap-1.5 text-xs text-gray-600">
          <span className={dot(ion?.lamp)} /> 점등
        </span>
        <span className={`flex items-center gap-1.5 text-xs ${ion?.overtime ? "font-semibold text-rose-600" : "text-gray-600"}`}>
          <span className={dot(ion?.overtime, true)} /> 램프 수명 초과
        </span>
        <span className="ml-auto flex gap-1.5">
          {([true, false] as const).map((want) => {
            const active = on === want;
            return (
              <button
                key={String(want)}
                disabled={!online}
                onClick={() =>
                  onRequest({
                    command: "ION_button",
                    label: "이오나이저",
                    detail: want ? "→ ON" : "→ OFF",
                    stateKey: "ION",
                    args: { on: want },
                  })
                }
                className={`rounded-lg border px-3 py-1.5 text-[11px] font-semibold disabled:opacity-40 ${
                  active
                    ? want
                      ? "border-green-600 bg-green-500 text-green-950"
                      : "border-gray-400 bg-gray-200 text-gray-700"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                운전 {want ? "ON" : "OFF"}
              </button>
            );
          })}
        </span>
      </div>
    </OpsCard>
  );
}

// ── 계측 ─────────────────────────────────────────────────────
function MetricRow({ item }: { item: MetricItem }) {
  const pv = norm(item.value);
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5 text-xs">
      <span className="shrink-0 truncate text-gray-400">{item.label}</span>
      <span className="truncate text-right">
        <span className={`font-semibold tabular-nums ${pv ? "text-gray-900" : "text-gray-300"}`}>
          {pv || "—"}
        </span>
        {pv && item.unit && <span className="ml-0.5 text-[10px] text-gray-400">{item.unit}</span>}
      </span>
    </div>
  );
}

export function MetricSections({ groups }: { groups?: MetricGroup[] }) {
  if (!groups?.length) {
    return (
      <OpsCard title="현재 값" className="h-full">
        <p className="py-4 text-center text-xs text-gray-300">수신된 값이 없습니다</p>
      </OpsCard>
    );
  }
  return (
    <OpsCard title="현재 값" className="h-full">
      <div className="@container">
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 @md:grid-cols-2">
          {groups.map((g) => (
            <div key={g.label}>
              <p className="mb-1 border-b border-gray-100 pb-1 text-[11px] font-semibold text-gray-400">
                {g.label}
              </p>
              {g.items.map((it) => (
                <MetricRow key={it.label} item={it} />
              ))}
            </div>
          ))}
        </div>
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

// ── 이벤트 ───────────────────────────────────────────────────
const EVENT_PAGE = 10;

export function EventFeed({ events }: { events?: OpsEvent[] }) {
  const [onlyIssue, setOnlyIssue] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const all = events ?? [];
  const filtered = onlyIssue ? all.filter((e) => e.level !== "info") : all;
  const asc = filtered.slice().reverse(); // 위=과거, 아래=최신
  const shown = showAll ? asc : asc.slice(-EVENT_PAGE);
  const hidden = asc.length - shown.length;
  const issueCount = all.filter((e) => e.level !== "info").length;
  const newestId = all[0]?.id;

  useEffect(() => {
    const el = boxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [newestId, showAll, onlyIssue]);

  return (
    <OpsCard
      title="최근 이벤트"
      right={
        <span className="flex items-center gap-2">
          {all[0] && <span className="text-[10px] text-gray-300">최근 {fmtAgo(all[0].ts)}</span>}
          <button
            onClick={() => setOnlyIssue((v) => !v)}
            className={`rounded-lg px-2 py-1 text-[11px] font-semibold ${
              onlyIssue ? "bg-rose-50 text-rose-600" : "text-gray-400 hover:bg-gray-50"
            }`}
          >
            경고·오류{issueCount > 0 && ` ${issueCount}`}
          </button>
        </span>
      }
    >
      {!shown.length ? (
        <p className="py-6 text-center text-xs text-gray-300">
          {onlyIssue ? "경고·오류가 없습니다" : "수신된 이벤트가 없습니다"}
        </p>
      ) : (
        <>
          {hidden > 0 && !showAll && (
            <button
              onClick={() => setShowAll(true)}
              className="mb-1 w-full rounded-lg py-1.5 text-[11px] font-semibold text-gray-400 hover:bg-gray-50"
            >
              이전 {hidden}건 더 보기 ↑
            </button>
          )}
          <div ref={boxRef} className={showAll ? "max-h-80 space-y-1 overflow-y-auto" : "space-y-1"}>
            {shown.map((e) => (
              <p key={e.id} className="flex gap-2 text-[11px] leading-snug">
                <span className="shrink-0 font-mono text-gray-300">{fmtLogTime(e.ts)}</span>
                <span
                  className={
                    e.level === "error" ? "text-rose-600"
                    : e.level === "warn" ? "text-amber-600" : "text-gray-600"
                  }
                >
                  {e.message}
                </span>
              </p>
            ))}
          </div>
          {showAll && (
            <button
              onClick={() => setShowAll(false)}
              className="mt-1 w-full rounded-lg py-1.5 text-[11px] font-semibold text-gray-400 hover:bg-gray-50"
            >
              최근 {EVENT_PAGE}건만 보기
            </button>
          )}
        </>
      )}
    </OpsCard>
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

// ── 조작 감사 로그 ───────────────────────────────────────────
export function CommandLog({ commands }: { commands?: OpsCommand[] }) {
  const actionText = (c: OpsCommand) => {
    const a = c.args as { on?: boolean; value?: unknown } | null;
    if (a && typeof a.on === "boolean") return a.on ? "ON" : "OFF";
    if (a && a.value !== undefined && a.value !== null) return `${a.value}`;
    return "";
  };
  if (!commands?.length) {
    return (
      <OpsCard title="조작 기록">
        <p className="py-5 text-center text-xs text-gray-300">원격 조작 기록이 없습니다</p>
      </OpsCard>
    );
  }
  return (
    <OpsCard title="조작 기록">
      <div className="space-y-1">
        {commands.slice().reverse().map((c) => {
          const act = actionText(c);
          return (
            <p key={c.id} className="flex flex-wrap items-baseline gap-x-2 text-[11px] leading-snug">
              <span className="shrink-0 font-mono text-gray-300">{fmtLogTime(c.requestedAt)}</span>
              <span className="font-medium text-gray-800">{c.label ?? c.command}</span>
              {act && (
                <span className={`font-bold ${act === "ON" ? "text-green-600" : act === "OFF" ? "text-gray-500" : "text-gray-700"}`}>
                  {act}
                </span>
              )}
              <span className="text-gray-400">{c.requestedBy}</span>
              <span
                className={`ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                  c.status === "done" ? "bg-gray-100 text-gray-500"
                  : c.status === "failed" ? "bg-rose-50 text-rose-600"
                  : c.status === "expired" ? "bg-amber-50 text-amber-600"
                  : "bg-gray-800 text-white"
                }`}
              >
                {CMD_STATUS_LABEL[c.status] ?? c.status}
              </span>
            </p>
          );
        })}
      </div>
    </OpsCard>
  );
}

// ── 명령 전송 훅 (확인창 필수) ───────────────────────
export type PendingCmd = {
  command: string;
  label: string;
  detail?: string;
  danger?: boolean;
  stateKey?: string;                 // 낙관적 표시에 사용할 상태 키
  args?: Record<string, unknown>;
};

export function useCommandSender(
  equipment: string,
  onSent?: (c: PendingCmd) => void,
) {
  const [pending, setPending] = useState<PendingCmd | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const request = (c: PendingCmd) => setPending(c);

  const confirmSend = async () => {
    if (!pending) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/ops/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ equipment, command: pending.command, args: pending.args ?? {} }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        setMsg(`${pending.label} 명령을 전송했습니다.`);
        onSent?.(pending);
      } else {
        setMsg(j?.error ?? "전송에 실패했습니다.");
      }
    } catch {
      setMsg("전송에 실패했습니다.");
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  const dialog = pending ? (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-4">
        <p className="text-sm font-bold text-gray-900">조작 확인</p>
        <p className="mt-2 text-sm text-gray-700">
          <span className="font-semibold">{pending.label}</span>
          {pending.detail && <span> {pending.detail}</span>} 명령을 실제 장비에 보냅니다.
        </p>
        {pending.danger && (
          <p className="mt-2 rounded-lg bg-rose-50 p-2 text-[11px] leading-relaxed text-rose-600">
            물리적 위험이 있는 조작입니다. 장비 주변에 사람이 없는지 반드시 확인하세요.
          </p>
        )}
        <p className="mt-3 text-[11px] text-gray-400">이 조작은 실행자 계정과 함께 기록됩니다.</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={() => setPending(null)}
            className="rounded-xl px-3 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-50"
          >
            취소
          </button>
          <button
            onClick={confirmSend}
            disabled={busy}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40 ${
              pending.danger ? "bg-rose-600" : "bg-gray-800"
            }`}
          >
            실행
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { request, dialog, msg, busy };
}
