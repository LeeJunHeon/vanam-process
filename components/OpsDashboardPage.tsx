"use client";

import { useMemo } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { useOpsStatus } from "@/components/ops/OpsKit";
import { fmtDateTime, RUN_LABEL } from "@/lib/ops";

// ─────────────────────────────────────────────────────────────
// Phase 0: 웹 골격만 구현. erp-agent 연결 전이므로 기본은 '미연결' 상태.
// 화면 디자인을 미리 보려면 PREVIEW를 true로 바꾼다. (배포 시 반드시 false)
// ─────────────────────────────────────────────────────────────
const PREVIEW = false;

type EquipState = "가동" | "대기" | "경고" | "오류" | "미연결";

type Unit = {
  key: string;
  name: string;
  state: EquipState;
  summary: string; // 발주·현재 스텝 / 마지막 종료 / 경고 사유 등 요약 한 줄
  progress?: number; // 가동 중일 때만
  metrics?: [string, string, string][]; // [라벨, 값, 정상범위]
};

type OpsData = {
  agentOnline: boolean;
  ch12: Unit[]; // CH1&2 Sputter — 챔버 2기, 각각 독립 운전
  loadlock: Unit; // CH1·CH2가 공유하는 로드락
  standalone: Unit[]; // 단독 장비
};

type EventLine = { time: string; text: string; level: "info" | "warn" | "error" };

const OFFLINE_DATA: OpsData = {
  agentOnline: false,
  ch12: [
    { key: "ch1", name: "CH1", state: "미연결", summary: "에이전트 연결 후 표시됩니다" },
    { key: "ch2", name: "CH2", state: "미연결", summary: "에이전트 연결 후 표시됩니다" },
  ],
  loadlock: { key: "ll", name: "LoadLock", state: "미연결", summary: "에이전트 연결 후 표시됩니다" },
  standalone: [
    { key: "chk", name: "CHK", state: "미연결", summary: "에이전트 연동 예정" },
    { key: "rayvac", name: "Rayvac ALD", state: "미연결", summary: "에이전트 연동 예정" },
    { key: "ncd", name: "NCD ALD", state: "미연결", summary: "에이전트 연동 예정" },
    { key: "evap", name: "Evaporator", state: "미연결", summary: "에이전트 연동 예정" },
    { key: "inline", name: "In-Line Sputter", state: "미연결", summary: "에이전트 연동 예정" },
  ],
};

const PREVIEW_DATA: OpsData = {
  agentOnline: true,
  ch12: [
    {
      key: "ch1",
      name: "CH1",
      state: "가동",
      progress: 62,
      summary: "발주 0821-03 · ITO 증착 · 메인 셔터 열림 · 잔여 25:00",
      metrics: [
        ["W.P", "3.0 mTorr", "2.5–3.5"],
        ["DC", "300 W", "설정 300"],
        ["Ar", "20.0 sccm", "설정 20"],
        ["Base P", "2.1e-6 Torr", "< 5e-6"],
      ],
    },
    { key: "ch2", name: "CH2", state: "대기", summary: "09:12 정상 종료 · 게이트 닫힘 · 진공 유지" },
  ],
  loadlock: { key: "ll", name: "LoadLock", state: "경고", summary: "진공 목표 도달 대기 12분 경과 (정상 < 8분)" },
  standalone: [
    { key: "chk", name: "CHK", state: "가동", progress: 38, summary: "SiO₂ 증착 · 잔여 41:00" },
    { key: "rayvac", name: "Rayvac ALD", state: "대기", summary: "마지막 공정 08-20 16:40 종료" },
    { key: "ncd", name: "NCD ALD", state: "가동", progress: 51, summary: "TiN 증착 · 152/300 cycle" },
    { key: "evap", name: "Evaporator", state: "대기", summary: "챔버 벤트 상태" },
    { key: "inline", name: "In-Line Sputter", state: "대기", summary: "대기 중" },
  ],
};

const PREVIEW_EVENTS: EventLine[] = [
  { time: "14:31", text: "LoadLock 진공 대기 시간 초과", level: "warn" },
  { time: "13:50", text: "CH1 공정 시작 (발주 0821-03 · 원격)", level: "info" },
  { time: "13:12", text: "NCD ALD TiN 공정 시작 (300 cycle)", level: "info" },
];

// HMI 원칙: 정상은 무채색, 색은 이상 상태에만
const STATE_BADGE: Record<EquipState, string> = {
  가동: "bg-gray-800 text-white",
  대기: "bg-gray-100 text-gray-500",
  경고: "bg-amber-50 text-amber-600",
  오류: "bg-rose-50 text-rose-600",
  미연결: "bg-gray-100 text-gray-400",
};

function StateBadge({ state }: { state: EquipState }) {
  return (
    <span className={`shrink-0 rounded-lg px-2 py-0.5 text-[11px] font-semibold ${STATE_BADGE[state]}`}>
      {state === "경고" && <AlertTriangle size={11} className="mr-1 inline -translate-y-px" />}
      {state}
    </span>
  );
}

// inner=true: 시스템 카드 내부의 서브 유닛(CH1/CH2), false: 단독 장비 카드
function UnitCard({ u, inner = false }: { u: Unit; inner?: boolean }) {
  return (
    <div
      className={
        inner
          ? "rounded-xl border border-gray-100 p-3"
          : "rounded-2xl border border-gray-100 bg-white p-4"
      }
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-gray-900">{u.name}</h3>
        <StateBadge state={u.state} />
      </div>

      {typeof u.progress === "number" && (
        <div className="mb-2">
          <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
            <div className="h-full rounded-full bg-gray-700" style={{ width: `${u.progress}%` }} />
          </div>
          <p className="mt-1 text-right text-[11px] text-gray-400">{u.progress}%</p>
        </div>
      )}

      <p className={`text-xs ${u.state === "미연결" ? "text-gray-300" : "text-gray-500"}`}>
        {u.summary}
      </p>

      {u.metrics && (
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-gray-50 pt-3 text-xs text-gray-600">
          {u.metrics.map(([label, value, range]) => (
            <span key={label}>
              <span className="text-gray-400">{label}</span> {value}{" "}
              <span className="text-gray-300">({range})</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function OpsDashboardPage() {
  const data = PREVIEW ? PREVIEW_DATA : OFFLINE_DATA;
  const events: EventLine[] = PREVIEW ? PREVIEW_EVENTS : [];

  // CHK만 실데이터로 대체 (나머지 장비는 리포터 연동 후 동일 방식으로 추가)
  const chk = useOpsStatus("CHK");
  const chkPayload = chk.data?.state?.payload ?? {};
  const chkLast = chk.data?.runs?.find((r) => r.status !== "running") ?? null;

  const chkUnit: Unit = !chk.online
    ? { key: "chk", name: "CHK", state: "미연결", summary: "리포터 미연결" }
    : chkPayload.status === "running" || chk.data?.run
      ? {
          key: "chk",
          name: "CHK",
          state: "가동",
          summary: `${chk.data?.run?.processName ?? "공정 진행"} · ${chkPayload.stage ?? ""}`.trim(),
        }
      : {
          key: "chk",
          name: "CHK",
          state: "대기",
          summary: chkLast
            ? `마지막 공정 ${fmtDateTime(chkLast.startedAt)} · ${RUN_LABEL[chkLast.status] ?? chkLast.status}`
            : "대기 중",
        };

  const mergedStandalone = data.standalone.map((u) => (u.key === "chk" ? chkUnit : u));

  const allUnits = useMemo(
    () => [...data.ch12, data.loadlock, ...mergedStandalone],
    [data, mergedStandalone],
  );

  const counts = useMemo(() => {
    const c = { 가동: 0, 대기: 0, 경고: 0, 오류: 0 };
    for (const u of allUnits) {
      if (u.state in c) c[u.state as keyof typeof c] += 1;
    }
    return c;
  }, [allUnits]);

  return (
    <div className="space-y-4 p-4 sm:p-6">
      {/* 상단 요약 줄 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span className="text-gray-600">
          가동 {counts.가동} · 대기 {counts.대기} ·{" "}
          <span className={counts.경고 > 0 ? "font-semibold text-amber-600" : ""}>경고 {counts.경고}</span> ·{" "}
          <span className={counts.오류 > 0 ? "font-semibold text-rose-600" : ""}>오류 {counts.오류}</span>
        </span>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-gray-400">
          <span className={`h-2 w-2 rounded-full ${data.agentOnline ? "bg-emerald-500" : "bg-gray-300"}`} />
          {data.agentOnline ? "ch12-agent 온라인" : "에이전트 미연결"}
        </span>
      </div>

      {/* 준비 중 안내 (에이전트 미연결일 때만) */}
      {!data.agentOnline && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-gray-100 bg-white p-4 text-sm text-gray-500">
          <Info size={16} className="mt-0.5 shrink-0 text-gray-400" />
          <p>
            장비 운전 워크스페이스가 준비 중입니다. 공정 노트북의 에이전트(erp-agent)가
            연결되면 장비 상태·진행률·이벤트가 실시간으로 표시됩니다.
          </p>
        </div>
      )}

      {/* CH1&2 Sputter — 하나의 장비, 챔버 2기 독립 운전, LoadLock 공유 */}
      <div className="rounded-2xl border border-gray-100 bg-white p-4">
        <div className="mb-3">
          <h2 className="text-sm font-bold text-gray-900">CH1&2 Sputter</h2>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {data.ch12.map((u) => (
            <UnitCard key={u.key} u={u} inner />
          ))}
        </div>

        {/* 공유 LoadLock */}
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50/60 px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 text-xs font-bold text-gray-700">{data.loadlock.name}</span>
            <span
              className={`truncate text-xs ${data.loadlock.state === "미연결" ? "text-gray-300" : "text-gray-500"}`}
            >
              {data.loadlock.summary}
            </span>
          </div>
          <StateBadge state={data.loadlock.state} />
        </div>
      </div>

      {/* 단독 장비 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {mergedStandalone.map((u) => (
          <UnitCard key={u.key} u={u} />
        ))}
      </div>

      {/* 최근 이벤트 */}
      <div className="rounded-2xl border border-gray-100 bg-white p-4">
        <h2 className="mb-2 text-sm font-bold text-gray-900">최근 이벤트</h2>
        {events.length === 0 ? (
          <p className="py-4 text-center text-xs text-gray-300">
            에이전트 연결 후 장비 이벤트가 이곳에 표시됩니다
          </p>
        ) : (
          <div className="space-y-1.5 text-xs">
            {events.map((ev, i) => (
              <p
                key={i}
                className={
                  ev.level === "warn"
                    ? "text-amber-600"
                    : ev.level === "error"
                      ? "text-rose-600"
                      : "text-gray-600"
                }
              >
                <span className="mr-2 text-gray-400">{ev.time}</span>
                {ev.text}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
