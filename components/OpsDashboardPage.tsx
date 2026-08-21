"use client";

import { useMemo } from "react";
import { AlertTriangle, Info } from "lucide-react";

// ─────────────────────────────────────────────────────────────
// Phase 0: 웹 골격만 구현. erp-agent 연결 전이므로 기본은 '미연결' 상태.
// 화면 디자인을 미리 보려면 PREVIEW를 true로 바꾼다. (배포 시 반드시 false)
// ─────────────────────────────────────────────────────────────
const PREVIEW = false;

type EquipState = "가동" | "대기" | "경고" | "오류" | "미연결";

type Equip = {
  key: string;
  name: string;
  state: EquipState;
  summary: string; // 발주·현재 스텝 / 마지막 종료 / 경고 사유 등 요약 한 줄
  progress?: number; // 가동 중일 때만
  metrics?: [string, string, string][]; // [라벨, 값, 정상범위]
};

type EventLine = { time: string; text: string; level: "info" | "warn" | "error" };

const PREVIEW_EQUIPS: Equip[] = [
  {
    key: "ch1",
    name: "Chamber 1",
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
  { key: "ch2", name: "Chamber 2", state: "대기", summary: "09:12 정상 종료 · 게이트 닫힘 · 진공 유지" },
  { key: "ll", name: "로드락", state: "경고", summary: "진공 목표 도달 대기 12분 경과 (정상 < 8분)" },
  { key: "robot", name: "로봇 셀", state: "대기", summary: "마지막 동작 14:02 · CHUCK_UP CH2" },
];

const PREVIEW_EVENTS: EventLine[] = [
  { time: "14:31", text: "로드락 진공 대기 시간 초과", level: "warn" },
  { time: "14:02", text: "로봇: CH2 척 상승 완료", level: "info" },
  { time: "13:50", text: "CH1 공정 시작 (발주 0821-03 · 원격)", level: "info" },
];

const OFFLINE_EQUIPS: Equip[] = [
  { key: "ch1", name: "Chamber 1", state: "미연결", summary: "에이전트 연결 후 표시됩니다" },
  { key: "ch2", name: "Chamber 2", state: "미연결", summary: "에이전트 연결 후 표시됩니다" },
  { key: "ll", name: "로드락", state: "미연결", summary: "에이전트 연결 후 표시됩니다" },
  { key: "robot", name: "로봇 셀", state: "미연결", summary: "에이전트 연결 후 표시됩니다" },
];

// HMI 원칙: 정상은 무채색, 색은 이상 상태에만
const STATE_BADGE: Record<EquipState, string> = {
  가동: "bg-gray-800 text-white",
  대기: "bg-gray-100 text-gray-500",
  경고: "bg-amber-50 text-amber-600",
  오류: "bg-rose-50 text-rose-600",
  미연결: "bg-gray-100 text-gray-400",
};

export default function OpsDashboardPage() {
  const equips = PREVIEW ? PREVIEW_EQUIPS : OFFLINE_EQUIPS;
  const events: EventLine[] = PREVIEW ? PREVIEW_EVENTS : [];
  const agentOnline = PREVIEW;

  const counts = useMemo(() => {
    const c = { 가동: 0, 대기: 0, 경고: 0, 오류: 0 };
    for (const e of equips) {
      if (e.state in c) c[e.state as keyof typeof c] += 1;
    }
    return c;
  }, [equips]);

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
          <span className={`h-2 w-2 rounded-full ${agentOnline ? "bg-emerald-500" : "bg-gray-300"}`} />
          {agentOnline ? "ch12-agent 온라인" : "에이전트 미연결"}
        </span>
      </div>

      {/* 준비 중 안내 (에이전트 미연결일 때만) */}
      {!agentOnline && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-gray-100 bg-white p-4 text-sm text-gray-500">
          <Info size={16} className="mt-0.5 shrink-0 text-gray-400" />
          <p>
            장비 운전 워크스페이스가 준비 중입니다. 공정 노트북의 에이전트(erp-agent)가
            연결되면 챔버 상태·진행률·이벤트가 실시간으로 표시됩니다.
          </p>
        </div>
      )}

      {/* 장비 카드 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {equips.map((eq) => (
          <div key={eq.key} className="rounded-2xl border border-gray-100 bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-900">{eq.name}</h2>
              <span className={`rounded-lg px-2 py-0.5 text-[11px] font-semibold ${STATE_BADGE[eq.state]}`}>
                {eq.state === "경고" && (
                  <AlertTriangle size={11} className="mr-1 inline -translate-y-px" />
                )}
                {eq.state}
              </span>
            </div>

            {typeof eq.progress === "number" && (
              <div className="mb-2">
                <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-gray-700"
                    style={{ width: `${eq.progress}%` }}
                  />
                </div>
                <p className="mt-1 text-right text-[11px] text-gray-400">{eq.progress}%</p>
              </div>
            )}

            <p className={`text-xs ${eq.state === "미연결" ? "text-gray-300" : "text-gray-500"}`}>
              {eq.summary}
            </p>

            {eq.metrics && (
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-gray-50 pt-3 text-xs text-gray-600">
                {eq.metrics.map(([label, value, range]) => (
                  <span key={label}>
                    <span className="text-gray-400">{label}</span> {value}{" "}
                    <span className="text-gray-300">({range})</span>
                  </span>
                ))}
              </div>
            )}
          </div>
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
