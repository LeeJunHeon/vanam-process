// 챔버K v2 장비 화면의 판단(순수 함수) — React·DB 없이 node 로 바로 시험할 수 있게 타입만 가져온다.
// state 순서, PLC 잠금, 명령 인자 범위(W-4·W-5 입력 칸도 쓴다), 정지 쪽 명령.
import type { Bundle, Envelope, Link } from "./types";

/** 정지 쪽 명령 — 다른 명령의 결과를 기다리는 중에도 막지 않고, 화면 stream 이 끊겨도 웹이 장비와 이어져 있으면 보낸다 */
export const STOP_KINDS: readonly string[] = ["PROCESS_STOP", "ALL_STOP", "BUZZ_STOP", "HEATER_STOP"];

/** 새 state 를 받을지 — 같은 실행이면 seq 가 큰 것만(장비 시계가 뒤로 맞춰져도 멈추지 않게), 실행이 다르면 새것 */
export function newerState<T>(cur: Envelope<T> | null, next: Envelope<T>): boolean {
  if (!cur) return true;
  if (cur.instance !== next.instance) return true;
  return next.seq > cur.seq;
}

/** 묶음 파라미터 값 — params[].current, 없으면 default */
export function paramValue(b: Bundle | null, key: string): unknown {
  const p = b?.params?.find((x) => x.key === key);
  return p ? p.current ?? p.default ?? null : null;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export const STALE_SEC_DEFAULT = 5;           // HEATER_STALE_SEC 를 묶음에서 못 찾을 때

/** PLC 값을 믿을 수 있는가(장비 화면 규칙과 같게) — 나이(links.plc.age)가 HEATER_STALE_SEC 이상이거나 나이가 없거나
 *  q 가 off 면 아님. 한 tick 의 late·stale 로는 잠그지 않는다. 마지막 판단은 장비(PLC_LINK_UP) */
export function plcFresh(link: Link | undefined, staleSec: number): boolean {
  if (!link || link.q === "off") return false;
  const age = num(link.age);
  return age !== null && age < staleSec;
}

export type Range = { min: number | null; max: number | null; unit: string };

/** 명령 인자 범위 — 묶음 commands[].args 의 min·max·paramMin·paramMax(값은 params current, 없으면 default).
 *  unit 은 paramMax(없으면 paramMin) 파라미터의 단위. 정의가 없으면 null */
export function argRange(b: Bundle | null, kind: string, name: string): Range | null {
  const a = b?.commands?.find((c) => c.kind === kind)?.args?.find((x) => x.name === name);
  if (!a) return null;
  const pmin = a.paramMin ? num(paramValue(b, a.paramMin)) : null;
  const pmax = a.paramMax ? num(paramValue(b, a.paramMax)) : null;
  const lo = [num(a.min), pmin].filter((v): v is number => v !== null);
  const hi = [num(a.max), pmax].filter((v): v is number => v !== null);
  const unitKey = a.paramMax ?? a.paramMin;
  return {
    min: lo.length ? Math.max(...lo) : null,
    max: hi.length ? Math.min(...hi) : null,
    unit: (unitKey && b?.params?.find((p) => p.key === unitKey)?.unit) || "",
  };
}

/** 상한을 더 낮춘 범위(예: PLC 가 보고한 목표 상한) — cap 이 0 보다 클 때만 */
export function capRange(r: Range | null, cap: unknown): Range | null {
  const c = num(cap);
  if (!r || c === null || c <= 0) return r;
  return { ...r, max: r.max === null ? c : Math.min(r.max, c) };
}

/** 입력 칸 글 → 값·오류. 빈 칸은 { value: null } */
export function checkInput(text: string, r: Range | null): { value: number | null; error: string | null } {
  const t = text.trim();
  if (t === "") return { value: null, error: null };
  const v = Number(t);
  if (!Number.isFinite(v)) return { value: null, error: "숫자가 아닙니다" };
  if (r?.min !== null && r?.min !== undefined && v < r.min) return { value: v, error: `${rangeText(r)} 밖입니다` };
  if (r?.max !== null && r?.max !== undefined && v > r.max) return { value: v, error: `${rangeText(r)} 밖입니다` };
  return { value: v, error: null };
}

/** "0~700 °C" */
export function rangeText(r: Range | null): string {
  if (!r) return "";
  const lo = r.min ?? "", hi = r.max ?? "";
  return `${lo}~${hi}${r.unit ? ` ${r.unit}` : ""}`;
}
