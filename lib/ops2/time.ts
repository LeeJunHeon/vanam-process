// ops2 화면의 시각 표시(한국 시간). v1 lib/ops.ts 에 기대지 않는다(v1 은 전환 뒤 지운다).
const KST = "Asia/Seoul";

const fmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: KST, hour12: false, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
});

/** "10-22 13:05:07" (KST) */
export function fmtKst(iso?: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "-";
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.month}-${p.day} ${p.hour === "24" ? "00" : p.hour}:${p.minute}:${p.second}`;
}
