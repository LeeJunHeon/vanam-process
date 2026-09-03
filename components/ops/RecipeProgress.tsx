"use client";

import { fmtDuration } from "@/lib/ops";

type Props = {
  title: string;
  stepNo: number;        // 1-based, 0이면 미실행
  total: number;
  labels: string[];      // 각 단계 표시 문자열
  stateText?: string;
  remainSec?: number;
  percent?: number;      // 전체 진행률(장비 계산값). 없으면 스텝 기준으로 계산
  footer?: string;       // 진행바 아래 보조 정보 한 줄
};

// 실행 중인 레시피의 단계 진행을 한 줄로 보여준다.
export default function RecipeProgress({
  title, stepNo, total, labels, stateText, remainSec, percent, footer,
}: Props) {
  if (!total) return null;
  const cur = Math.max(0, Math.min(stepNo, total));
  const pct = typeof percent === "number"
    ? Math.max(0, Math.min(100, Math.round(percent)))
    : total > 0 ? Math.round((Math.max(0, cur - 1) / total) * 100) : 0;

  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 p-2.5">
      <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2">
        <span className="text-[11px] font-bold text-gray-700">{title}</span>
        <span className="text-[11px] text-gray-500">
          {cur > 0 ? `${cur} / ${total} 단계` : `${total} 단계 대기`}
        </span>
        {stateText && (
          <span className="rounded bg-gray-800 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            {stateText}
          </span>
        )}
        {typeof remainSec === "number" && remainSec > 0 && (
          <span className="ml-auto text-[11px] tabular-nums text-gray-600">
            유지 잔여 {fmtDuration(remainSec)}
          </span>
        )}
      </div>

      <div className="mb-1.5 h-1.5 overflow-hidden rounded-full bg-gray-200">
        <div className="h-full rounded-full bg-gray-700 transition-all" style={{ width: `${pct}%` }} />
      </div>

      <div className="flex flex-wrap gap-1">
        {labels.map((l, i) => {
          const no = i + 1;
          const done = cur > 0 && no < cur;
          const now = no === cur;
          return (
            <span
              key={no}
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                now ? "bg-gray-800 text-white"
                : done ? "bg-gray-200 text-gray-500"
                : "border border-gray-200 text-gray-400"
              }`}
            >
              {no}. {l}
            </span>
          );
        })}
      </div>

      {footer && <p className="mt-1.5 text-[10px] text-gray-400">{footer}</p>}
    </div>
  );
}
