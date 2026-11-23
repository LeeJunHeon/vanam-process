"use client";

// 챔버K 장비 상태 표시(W-15) — 이름 + 점이 붙은 배지("켜짐"·"꺼짐", "열림"·"닫힘", "감지"·"없음"). 체크박스처럼 생긴 네모(kit StateBox)는
// 사람이 고르는 곳에만 쓰고, 장비 상태는 이 부품으로 보인다(화면 원칙 3). kit 의 StateBox 는 CH1&2 가 그대로 쓴다.
// 켜짐·열림 = 진회색 배지(흰 글자), 꺼짐·닫힘 = 옅은 회색 배지, 모름 = 점선 테두리 "모름", alert(켜지면 이상) = 주의색 + 같은 글자.
import type { ReactNode } from "react";
import { FS } from "./kit";

export type StateWords = "onoff" | "open" | "detect";
const WORDS: Record<StateWords, [string, string]> = { onoff: ["켜짐", "꺼짐"], open: ["열림", "닫힘"], detect: ["감지", "없음"] };

/** 상태 배지만(이름 없이) */
export function StateBadge({ on, words = "onoff", alert, unknown }: {
  on: boolean | null | undefined; words?: StateWords; alert?: boolean; unknown?: boolean;
}) {
  const u = unknown || on === null || on === undefined;
  const [w1, w0] = WORDS[words];
  const cls = u ? "border border-dashed border-[#C9CED6] bg-white text-[#8A929D]"
    : on && alert ? "border border-[#F5D9A8] bg-[#FFFAEB] text-[#B54708]"
    : on ? "border border-[#3A424D] bg-[#3A424D] text-white" : "border border-[#E3E6EA] bg-[#F5F6F8] text-[#5B6470]";
  const dot = u ? "bg-[#C9CED6]" : on && alert ? "bg-[#B54708]" : on ? "bg-white" : "bg-[#8A929D]";
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-px font-semibold leading-tight ${FS.small} ${cls}`}>
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />{u ? "모름" : on ? w1 : w0}
    </span>
  );
}

/** 이름 + 상태 배지 한 줄(이름 왼쪽, 배지 오른쪽). title 은 새 정보(뜻·주소)가 있을 때만 */
export function StateTag({ on, label, words = "onoff", alert, unknown, title }: {
  on: boolean | null | undefined; label: ReactNode; words?: StateWords; alert?: boolean; unknown?: boolean; title?: string;
}) {
  return (
    <span className={`flex min-w-0 items-center justify-between gap-2 ${FS.body}`} title={title}>
      <span className="min-w-0 truncate text-[#1B1F24]">{label}</span>
      <StateBadge on={on} words={words} alert={alert} unknown={unknown} />
    </span>
  );
}

/** PLC 값 이름 → 상태 말(밸브·셔터 열림/닫힘, 센서 감지/없음, 그 밖 켜짐/꺼짐) */
export function wordsOf(name: string): StateWords {
  if (/^(mv|rv|fv|vent|ar_valve|o2_valve|ms|s1|s2)$/.test(name)) return "open";
  if (/^(atm|water|air|g1|g2)$/.test(name)) return "detect";
  return "onoff";
}
