"use client";

// 챔버K v2 입력 칸(W-10) — 시간은 분·초 두 칸(1시간 넘으면 시·분·초), 저장은 열·값의 단위 그대로(s 는 초, min 은 분).
// 분 단위 저장은 장비가 ceil(분 × 60) 으로 초를 만든다 — 넣은 초가 그대로 나오도록 분 값을 고른다(minutesFor).
import { useState } from "react";

/** 초 → 분(장비 ceil(분×60) 이 정확히 그 초가 되게 — 부동소수 오차로 1 초 늘지 않게 한 칸씩 내린다) */
export function minutesFor(sec: number): number {
  let v = sec / 60;
  for (let i = 0; i < 4 && Math.ceil(v * 60) > sec; i++) v -= Math.max(Number.EPSILON * Math.abs(v), Number.MIN_VALUE);
  return v;
}

const parts = (sec: number | null, long: boolean) => {
  if (sec === null) return { h: "", m: "", s: "" };
  const t = Math.max(0, sec);
  const h = long ? Math.floor(t / 3600) : 0;
  const m = Math.floor((t - h * 3600) / 60);
  const s = Number((t - h * 3600 - m * 60).toFixed(3));
  return { h: long ? String(h) : "", m: String(m), s: String(s) };
};
const NUM = /^\d*(\.\d*)?$/;

/** 시간 입력 — 값은 초(null = 빈 칸). 1시간 이상이면 시 칸이 생긴다 */
export function DurationInput({ sec, onChange, disabled, error, label, intOnly }: {
  sec: number | null; onChange: (sec: number | null) => void; disabled?: boolean; error?: boolean; label: string; intOnly?: boolean;
}) {
  const [long, setLong] = useState(() => (sec ?? 0) >= 3600);
  const [txt, setTxt] = useState(() => parts(sec, (sec ?? 0) >= 3600));
  const emit = (n: { h: string; m: string; s: string }) => {
    setTxt(n);
    if (n.h === "" && n.m === "" && n.s === "") return onChange(null);
    const v = (Number(n.h || 0) * 3600) + (Number(n.m || 0) * 60) + Number(n.s || 0);
    if (!Number.isFinite(v)) return;
    onChange(intOnly ? Math.round(v) : v);
  };
  const box = (k: "h" | "m" | "s", unit: string) => (
    <span className="flex items-center gap-1">
      <input value={txt[k]} disabled={disabled} inputMode="decimal" aria-label={`${label} ${unit}`}
        onChange={(e) => { if (NUM.test(e.target.value)) emit({ ...txt, [k]: e.target.value }); }}
        className={`h-9 w-14 rounded-[8px] border bg-white px-2 text-right text-xs tabular-nums disabled:bg-[#F5F6F8] disabled:text-[#8A929D] ${
          error ? "border-[#B42318] bg-[#FEE4E2]" : "border-[#D9DDE3]"}`} />
      <span className="text-[11px] text-[#5B6470]">{unit}</span>
    </span>
  );
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {long && box("h", "시간")}
      {box("m", "분")}
      {box("s", "초")}
      {!long && !disabled && (
        <button type="button" onClick={() => { setLong(true); setTxt(parts(sec, true)); }}
          className="text-[10px] text-[#5B6470] underline">시간 칸</button>
      )}
    </span>
  );
}
