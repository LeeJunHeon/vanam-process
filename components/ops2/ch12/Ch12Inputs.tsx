"use client";

// 챔버12 입력 칸(2026-11-18) — 명령 인자를 그대로 그리지 않고 작업자 말로: 이름·단위·범위를 늘 보이고(범위는 묶음 — 장비 D11 과 같은 값),
// 범위 밖·숫자 아님이면 칸 아래 빨간 글 + 보내기 버튼을 막는다(마지막 판단은 장비). 시각은 시·분 고르기(HH:MM).
// 글자 크기·색은 챔버K kit(FS·#D9DDE3·오류 #B42318).
import { FS, ErrText } from "../chk/kit";
import { checkNum, type NumRange } from "./logic";

const BOX = `h-10 rounded-[10px] border bg-white px-2 ${FS.body} tabular-nums text-[#1B1F24] disabled:bg-[#F5F6F8] disabled:text-[#8A929D]`;

export const rangeWord = (r: NumRange | null) =>
  !r || (r.min === null && r.max === null) ? "" : `${r.min ?? ""}~${r.max ?? ""}${r.unit ? ` ${r.unit}` : ""}`;

/** 숫자 칸 — 이름(위)·칸·단위(옆)·범위(아래 보조색), 오류면 빨간 테두리 + 글 */
export function NumField({ label, value, onChange, range, unit, required, disabled, width = "w-28", placeholder, hint }: {
  label: string; value: string; onChange: (v: string) => void; range: NumRange | null; unit?: string; required?: boolean;
  disabled?: boolean; width?: string; placeholder?: string; hint?: string;
}) {
  const c = checkNum(value, range, false);
  const err = value.trim() ? c.error : null;
  const u = unit ?? range?.unit ?? "";
  const rw = rangeWord(range);
  return (
    <label className={`flex min-w-0 flex-col gap-1 ${FS.small} text-[#5B6470]`}>
      <span className="font-semibold text-[#1B1F24]">{label}{required ? " *" : ""}</span>
      <span className="flex items-center gap-1.5">
        <input value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} inputMode="decimal" aria-label={label}
          placeholder={placeholder ?? rw} aria-invalid={!!err}
          className={`${BOX} ${width} ${err ? "border-[#B42318] bg-[#FEE4E2]" : "border-[#D9DDE3]"}`} />
        {u && <span className={`${FS.small} text-[#5B6470]`}>{u}</span>}
      </span>
      {err ? <ErrText>{err}</ErrText> : <span>{hint ?? (rw ? `범위 ${rw}` : "")}</span>}
    </label>
  );
}

const HH = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MM = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

/** 시각 고르기(HH:MM) — 시·분 두 목록 */
export function TimeField({ label, value, onChange, disabled }: {
  label: string; value: string; onChange: (v: string) => void; disabled?: boolean;
}) {
  const [h, m] = /^\d{2}:\d{2}$/.test(value) ? value.split(":") : ["06", "00"];
  const sel = `${BOX} border-[#D9DDE3] w-[4.5rem]`;
  return (
    <span className={`flex flex-col gap-1 ${FS.small} text-[#5B6470]`}>
      <span className="font-semibold text-[#1B1F24]">{label}</span>
      <span className="flex items-center gap-1">
        <select aria-label={`${label} 시`} value={h} disabled={disabled} onChange={(e) => onChange(`${e.target.value}:${m}`)} className={sel}>
          {HH.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <span className={`${FS.body} text-[#5B6470]`}>:</span>
        <select aria-label={`${label} 분`} value={m} disabled={disabled} onChange={(e) => onChange(`${h}:${e.target.value}`)} className={sel}>
          {MM.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
      </span>
      <span>매일 이 시각(장비 노트북 시계)</span>
    </span>
  );
}

/** 글 칸(사유 등 — 선택) */
export function TextField({ label, value, onChange, placeholder, disabled, width = "w-56" }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean; width?: string;
}) {
  return (
    <label className={`flex min-w-0 flex-col gap-1 ${FS.small} text-[#5B6470]`}>
      <span className="font-semibold text-[#1B1F24]">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} aria-label={label}
        maxLength={120} className={`${BOX} ${width} border-[#D9DDE3]`} />
    </label>
  );
}
