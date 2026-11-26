// 챔버K RF 표시 규칙(W-22, 묶음 23 — 장비 rf.cmd_on·rf.uncommanded). 웹·노트북·대시보드·주요 값·추세가 같은 규칙.
// - 명령 출력(rf.cmd_on = M00200 켜짐 ∧ D00040 > 0): 읽은 Forward·Reflected 그대로.
// - 명령 없음 ∧ 명령 없는 출력 아님: Forward·Reflected 0 · '꺼짐'(읽은 값은 rf.fwd_w_raw·rf.ref_w_raw 로 남겨 상세 보기에, 기록(DB)은 읽은 값).
// - 명령 없는 출력(rf.uncommanded — 명령 없음 ∧ Forward ≥ RF_UNCOMMANDED_FWD_W): 읽은 값 + 경고 칩 '명령 없이 출력 중'.
// 묶음 22 장비(rf.cmd_on 없음)는 바꾸지 않는다(state "unknown").
export type RfState = "cmd" | "off" | "uncommanded" | "unknown";
type Snap = Record<string, unknown> | undefined | null;

export function rfState(snap: Snap): RfState {
  if (!snap || (snap["rf.cmd_on"] === undefined && snap["rf.uncommanded"] === undefined)) return "unknown";
  if (snap["rf.cmd_on"] === true) return "cmd";
  if (snap["rf.uncommanded"] === true) return "uncommanded";
  if (snap["rf.cmd_on"] === false) return "off";
  return "unknown";                               // 명령 여부를 모름(PLC 값 없음) — 읽은 값 그대로
}

/** 화면에 쓰는 스냅샷 — '꺼짐'이면 Forward·Reflected 를 0 으로(읽은 값은 *_raw). 바뀌지 않으면 같은 객체 */
export function rfDisplaySnap<T extends Record<string, unknown> | undefined>(snap: T): T {
  if (!snap || rfState(snap) !== "off") return snap;
  const out: Record<string, unknown> = { ...snap, "rf.fwd_w_raw": snap["rf.fwd_w"], "rf.ref_w_raw": snap["rf.ref_w"] };
  for (const k of ["rf.fwd_w", "rf.ref_w"]) if (typeof snap[k] === "number") out[k] = 0;
  return out as T;
}

/** RF 출력 칩 말 — 묶음 22 는 null(부르는 쪽이 예전 규칙) */
export function rfChip(snap: Snap): { text: string; tone: "dark" | "neutral" | "warn" } | null {
  const s = rfState(snap);
  if (s === "cmd") return { text: "출력 켜짐", tone: "dark" };
  if (s === "uncommanded") return { text: "명령 없이 출력 중", tone: "warn" };
  if (s === "off") return { text: "출력 꺼짐", tone: "neutral" };
  return null;
}

/** 버튼 이름("켜기"/"목표 적용")용 — 명령으로 켜져 있나. 묶음 22 는 rf.out_on, 그 전은 Forward 5 W 이상 */
export function rfCommanded(snap: Snap): boolean {
  if (snap && snap["rf.cmd_on"] !== undefined) return snap["rf.cmd_on"] === true;
  if (snap && snap["rf.out_on"] !== undefined) return snap["rf.out_on"] === true;
  const f = snap?.["rf.fwd_w"];
  return typeof f === "number" && f >= 5;
}
