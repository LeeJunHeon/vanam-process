// 챔버K 장비 연결 표시(W-23 B) — 상태 띠의 연결 칩·끊김 띠, 운전 대시보드 카드가 같이 쓴다.
// 연결됨(초를 쓰지 않음) / 늦음 N초 / 끊김 N초(60초 미만) / 60초 이상은 "끊김 · 18:05부터"(오늘이 아니면 "11-25 18:05부터") —
// 마지막으로 값을 받은 시각이라 매초 바뀌지 않는다. 숫자는 부르는 쪽이 tabular-nums·고정 폭으로 그린다.
export type ConnKind = "ok" | "late" | "lost" | "none";
export type Conn = { kind: ConnKind; sec: number | null; since: string | null; tone: "neutral" | "warn" | "alarm" };

const KST = (ms: number, withDate: boolean) => {
  const f = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour12: false, month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(ms));
  const g = (t: string) => f.find((p) => p.type === t)?.value ?? "";
  return withDate ? `${g("month")}-${g("day")} ${g("hour")}:${g("minute")}` : `${g("hour")}:${g("minute")}`;
};
const dayKey = (ms: number) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));

/** 마지막으로 값을 받은 시각 글 — 오늘이면 "18:05", 아니면 "11-25 18:05" */
export function sinceText(lastMs: number, nowMs: number): string {
  return KST(lastMs, dayKey(lastMs) !== dayKey(nowMs));
}

/** ageMs = 마지막 값 뒤 지난 시간(장비 시계 차를 고친 값), nowMs = 화면 시계 */
export function connOf(ageMs: number | null, nowMs: number, lateMs = 3_000, lostMs = 10_000): Conn {
  if (ageMs === null) return { kind: "none", sec: null, since: null, tone: "neutral" };
  const sec = Math.max(0, Math.round(ageMs / 1000));
  if (ageMs <= lateMs) return { kind: "ok", sec, since: null, tone: "neutral" };
  if (ageMs <= lostMs) return { kind: "late", sec, since: null, tone: "warn" };
  return { kind: "lost", sec, since: sec >= 60 ? sinceText(nowMs - ageMs, nowMs) : null, tone: "alarm" };
}

/** 칩 글(숫자 따로) — [앞말, 숫자 또는 null, 뒷말] */
export function connParts(c: Conn): [string, number | null, string] {
  if (c.kind === "ok") return ["연결됨", null, ""];
  if (c.kind === "late") return ["늦음 ", c.sec, "초"];
  if (c.kind === "lost") return c.since ? [`끊김 · ${c.since}부터`, null, ""] : ["끊김 ", c.sec, "초"];
  return ["상태 없음", null, ""];
}
