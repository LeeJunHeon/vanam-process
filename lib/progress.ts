// 납기 진행률: 접수일→납기예정 구간에서 오늘이 어디쯤인지 (시간 경과율).
// 발주 관리 / 공정 관리 / 대시보드가 공통으로 사용한다.
export type DueProgress = {
  pct: number; // 0~100
  label: string; // "납기 D-3" | "납기 오늘" | "납기 D+2 초과"
  state: "ok" | "warn" | "over";
};

const DAY = 86400000;

function todayMidnight(): number {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return new Date(
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
  ).getTime();
}

export function dueProgress(
  receivedAt: string | null | undefined,
  dueAt: string | null | undefined,
): DueProgress | null {
  if (!receivedAt || !dueAt) return null;
  const start = new Date(receivedAt.slice(0, 10)).getTime();
  const end = new Date(dueAt.slice(0, 10)).getTime();
  if (isNaN(start) || isNaN(end) || end < start) return null;

  const today = todayMidnight();
  const total = Math.max(end - start, DAY);
  const pct = Math.min(100, Math.max(0, Math.round(((today - start) / total) * 100)));
  const dd = Math.round((end - today) / DAY);

  if (dd < 0) return { pct: 100, label: `납기 D+${-dd} 초과`, state: "over" };
  const label = dd === 0 ? "납기 오늘" : `납기 D-${dd}`;
  return { pct, label, state: dd <= 2 || pct >= 80 ? "warn" : "ok" };
}

export const PROGRESS_BAR: Record<DueProgress["state"], string> = {
  ok: "bg-blue-400",
  warn: "bg-amber-400",
  over: "bg-rose-500",
};

export const PROGRESS_TEXT: Record<DueProgress["state"], string> = {
  ok: "text-gray-400",
  warn: "text-amber-600",
  over: "text-rose-500",
};
