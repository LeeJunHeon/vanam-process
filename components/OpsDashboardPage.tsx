"use client";

import { useMemo } from "react";
import { Info } from "lucide-react";
import { EventFeed, useOpsStatus } from "@/components/ops/OpsKit";
import { RUN_LABEL, fmtDateTime } from "@/lib/ops";

type EquipState = "가동" | "대기" | "경고" | "오류" | "미연결";
type EquipPage =
  | "equipCh12" | "equipChk" | "equipRayvac" | "equipNcd" | "equipEvap" | "equipInline";

type Unit = {
  key: string;
  name: string;
  state: EquipState;
  summary: string;
  page?: EquipPage;
};

// 연동 전 장비는 상태를 지어내지 않는다. 리포터가 붙는 대로 실데이터로 교체된다.
const PENDING = "리포터 연동 예정";

const CH12: Unit[] = [
  { key: "ch1", name: "CH1", state: "미연결", summary: PENDING, page: "equipCh12" },
  { key: "ch2", name: "CH2", state: "미연결", summary: PENDING, page: "equipCh12" },
];
const LOADLOCK: Unit = {
  key: "ll", name: "LoadLock", state: "미연결", summary: PENDING, page: "equipCh12",
};
const STANDALONE: Unit[] = [
  { key: "chk", name: "CHK", state: "미연결", summary: PENDING, page: "equipChk" },
  { key: "rayvac", name: "Rayvac ALD", state: "미연결", summary: PENDING, page: "equipRayvac" },
  { key: "ncd", name: "NCD ALD", state: "미연결", summary: PENDING, page: "equipNcd" },
  { key: "evap", name: "Evaporator", state: "미연결", summary: PENDING, page: "equipEvap" },
  { key: "inline", name: "In-Line Sputter", state: "미연결", summary: PENDING, page: "equipInline" },
];

const STATE_BADGE: Record<EquipState, string> = {
  가동: "bg-gray-800 text-white",
  대기: "bg-gray-100 text-gray-500",
  경고: "bg-amber-50 text-amber-600",
  오류: "bg-rose-50 text-rose-600",
  미연결: "bg-gray-100 text-gray-400",
};

function UnitCard({ u, onNavigate }: { u: Unit; onNavigate?: (p: EquipPage) => void }) {
  const clickable = !!u.page && !!onNavigate;
  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={() => u.page && onNavigate?.(u.page)}
      className={`w-full rounded-2xl border border-gray-100 bg-white p-3 text-left sm:p-4 ${
        clickable ? "transition-colors hover:border-gray-200 hover:bg-gray-50/50" : "cursor-default"
      }`}
    >
      <span className="mb-1.5 flex items-center justify-between gap-2">
        <span className="truncate text-sm font-bold text-gray-900">{u.name}</span>
        <span className={`shrink-0 rounded-lg px-2 py-0.5 text-[11px] font-semibold ${STATE_BADGE[u.state]}`}>
          {u.state}
        </span>
      </span>
      <span
        className={`block truncate text-[11px] ${u.state === "미연결" ? "text-gray-300" : "text-gray-500"}`}
      >
        {u.summary}
      </span>
    </button>
  );
}

export default function OpsDashboardPage({
  onNavigate,
}: { onNavigate?: (p: EquipPage) => void }) {
  // 연동된 장비만 실데이터로 대체한다. 장비가 늘면 여기에 한 줄씩 추가.
  const chk = useOpsStatus("CHK");

  const chkUnit: Unit = useMemo(() => {
    const base = { key: "chk", name: "CHK", page: "equipChk" as EquipPage };
    if (!chk.online) return { ...base, state: "미연결", summary: "리포터 미연결" };
    const p = chk.data?.state?.payload ?? {};
    const last = chk.data?.runs?.find((r) => r.status !== "running") ?? null;
    if (p.status === "running" || chk.data?.run) {
      return {
        ...base,
        state: "가동",
        summary:
          `${chk.data?.run?.processName ?? "공정 진행"}${p.stage ? ` · ${p.stage}` : ""}`.trim(),
      };
    }
    return {
      ...base,
      state: "대기",
      summary: last
        ? `마지막 공정 ${fmtDateTime(last.startedAt)} · ${RUN_LABEL[last.status] ?? last.status}`
        : "대기 중",
    };
  }, [chk.online, chk.data]);

  const standalone = useMemo(
    () => STANDALONE.map((u) => (u.key === "chk" ? chkUnit : u)),
    [chkUnit],
  );
  const allUnits = useMemo(
    () => [...CH12, LOADLOCK, ...standalone],
    [standalone],
  );

  const counts = useMemo(() => {
    const c = { 가동: 0, 대기: 0, 경고: 0, 오류: 0, 미연결: 0 };
    for (const u of allUnits) c[u.state] += 1;
    return c;
  }, [allUnits]);

  const linked = 1;          // 리포터가 연결된 장비 수(현재 CHK만)
  const linkedOnline = chk.online ? 1 : 0;

  return (
    <div className="space-y-3 p-3 sm:space-y-4 sm:p-6">
      {/* 상단 요약 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs sm:text-sm">
        <span className="text-gray-600">
          가동 {counts.가동} · 대기 {counts.대기} ·{" "}
          <span className={counts.경고 > 0 ? "font-semibold text-amber-600" : ""}>
            경고 {counts.경고}
          </span>{" "}
          ·{" "}
          <span className={counts.오류 > 0 ? "font-semibold text-rose-600" : ""}>
            오류 {counts.오류}
          </span>
        </span>
        <span className="ml-auto flex items-center gap-1.5 text-[11px] text-gray-400">
          <span
            className={`h-2 w-2 rounded-full ${linkedOnline > 0 ? "bg-emerald-500" : "bg-gray-300"}`}
          />
          리포터 {linkedOnline}/{linked} 연결
        </span>
      </div>

      {counts.미연결 > 0 && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-gray-100 bg-white p-3 text-xs leading-relaxed text-gray-500 sm:p-4">
          <Info size={15} className="mt-0.5 shrink-0 text-gray-400" />
          <p>
            아직 {counts.미연결}개 장비가 연동 전입니다. 각 장비 프로그램에 리포터가 추가되면
            이 화면에 실시간 상태가 표시됩니다.
          </p>
        </div>
      )}

      {/* CH1&2 시스템 */}
      <section className="rounded-2xl border border-gray-100 bg-white p-3 sm:p-4">
        <h2 className="mb-2.5 text-sm font-bold text-gray-900">CH1&2 Sputter</h2>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {CH12.map((u) => (
            <UnitCard key={u.key} u={u} onNavigate={onNavigate} />
          ))}
        </div>
        <div className="mt-2.5">
          <UnitCard u={LOADLOCK} onNavigate={onNavigate} />
        </div>
      </section>

      {/* 단독 장비 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {standalone.map((u) => (
          <UnitCard key={u.key} u={u} onNavigate={onNavigate} />
        ))}
      </div>

      {/* 최근 이벤트 — 연동된 장비의 실데이터 */}
      <EventFeed events={chk.data?.events} equipment="CHK" />
    </div>
  );
}
