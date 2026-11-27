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

/** ageMs = 마지막 값 뒤 지난 시간(장비 시계 차를 고친 값), nowMs = 화면 시계.
 *  lostNow(W-24 B1) = 시간과 상관없이 끊김(노트북 화면은 프로그램과의 stream 이 끊기면 바로) — 초는 실제로 지난 시간 */
export function connOf(ageMs: number | null, nowMs: number, lateMs = 3_000, lostMs = 10_000, lostNow = false): Conn {
  if (ageMs === null) return { kind: "none", sec: null, since: null, tone: "neutral" };
  const sec = Math.max(0, Math.round(ageMs / 1000));
  if (!lostNow && ageMs <= lateMs) return { kind: "ok", sec, since: null, tone: "neutral" };
  if (!lostNow && ageMs <= lostMs) return { kind: "late", sec, since: null, tone: "warn" };
  return { kind: "lost", sec, since: sec >= 60 ? sinceText(nowMs - ageMs, nowMs) : null, tone: "alarm" };
}

/** 칩 글(숫자 따로) — [앞말, 숫자 또는 null, 뒷말] */
export function connParts(c: Conn): [string, number | null, string] {
  if (c.kind === "ok") return ["연결됨", null, ""];
  if (c.kind === "late") return ["늦음 ", c.sec, "초"];
  if (c.kind === "lost") return c.since ? [`끊김 · ${c.since}부터`, null, ""] : ["끊김 ", c.sec, "초"];
  return ["상태 없음", null, ""];
}

// ───────────── 끊기면 지금 값을 그리지 않는다(W-26, 사용자 결정 2026-11-27) ─────────────
/** 지금 값을 보여도 되는가 — 운전 대시보드 CHK 박스와 CHK Sputter 화면(웹·노트북)이 이 함수 하나로 정한다.
 *  끊김(마지막 값의 나이 > lostMs, 노트북 화면은 노트북 프로그램 stream 이 끊긴 경우도)이면 아니다 — 값 자리는 "—", 상태는 '모름'.
 *  늦음(lateMs ~ lostMs)은 지금처럼 보인다. 판정 시간은 각 화면의 끊김 판정 그대로(기본 10 s) */
export function showsNow(ageMs: number | null, lostMs = 10_000, streamUp = true): boolean {
  return ageMs !== null && ageMs <= lostMs && streamUp;
}

/** 끊겼을 때 화면에 넘기는 state — 지금 값은 비운다: 1초 스냅숏(값·켜짐/꺼짐·열림/닫힘 전부)·장치별 연결 상태('설정에서 꺼짐'만 남김)·
 *  히터 엔진 값·활성 알람·공정 중 값 바꾸기의 지금 값(항목 줄은 남김)·켜 둔 출력·웹 연결 상태. 공정 상태·단계·레시피·설정 버전·컨트롤러 값(읽은 시각과 함께)·장착 타겟·
 *  레시피 사본은 마지막으로 받은 것 그대로(진행 줄은 부르는 쪽이 '마지막으로 받은 단계'로 그린다). 추세·기록·사건은 state 밖이라 그대로 */
/** 칸 모양을 정하는 제어 구조(히터 제어 방식) — 끊겨도 마지막 값으로 줄 구성만 정한다(화면 글은 "—") */
const SHAPE_KEYS = ["heater.ctrl_mode", "heater.casc_state"];

export function blindState<T extends object>(st: T | null): T | null {
  if (!st) return st;
  // 칸 모양은 마지막으로 받은 모양 그대로 — 값이 있던 열(had)·제어 구조(shape). 값 자체는 그리지 않는다
  const last = (st as { snapshot?: Record<string, unknown> }).snapshot ?? {};
  const had = Object.keys(last).filter((k) => last[k] !== null && last[k] !== undefined);
  const shape = Object.fromEntries(SHAPE_KEYS.filter((k) => k in last).map((k) => [k, last[k]]));
  // 장치별 연결 상태는 '설정에서 꺼짐'(off)만 남긴다 — 설정이지 지금 읽은 값이 아니고, 꺼진 장치 카드 모양이 끊김 때 바뀌지 않게
  const links = (st as { links?: Record<string, { q?: string } | undefined> }).links ?? {};
  const off = Object.fromEntries(Object.entries(links).filter(([, l]) => l?.q === "off"));
  // 공정 중 값 바꾸기 항목은 줄(무엇을·어디서 쓰는지·레시피 값·마지막 수정)을 남기고 지금 값만 비운다 — 주요 값 칸·값 바꾸기 표가 그대로
  const adj = (st as { adjust?: Record<string, unknown>[] | null }).adjust;
  const adjust = Array.isArray(adj) ? adj.map((a) => ({ ...a, value: null, busy: false })) : adj ?? null;
  return { ...st, snapshot: {}, links: off, heater: undefined, alarms: [], adjust, left: {}, uplink: undefined, blind: true, had, shape } as T;
}
