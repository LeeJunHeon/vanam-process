"use client";

import { Trash2 } from "lucide-react";
import { PROCESS_STATUSES } from "@/lib/status";
import type { CodeOption, EmployeeOption } from "@/components/OrderFormModal";

// 발주 등록·공정 추가 모달이 함께 쓰는 공정 행 편집기.
// 행 state 와 "공정 추가"/"줄 추가" 버튼은 부모 모달이 가진다.

export type ProcessRow = {
  processCodeId: string;
  detail: string;
  qty: string;
  plannedStart: string;
  durationHours: string;
  status: string;
  location: string;
  ownerEmployeeId: string;
  memo: string;
};

export const emptyProcessRow = (init?: Partial<ProcessRow>): ProcessRow => ({
  processCodeId: "",
  detail: "",
  qty: "",
  plannedStart: "",
  durationHours: "",
  status: "대기",
  location: "",
  ownerEmployeeId: "",
  memo: "",
  ...init,
});

/** 공정이 선택된 행만 골라 API 전송 형식으로 바꾼다. */
export function toProcessPayload(rows: ProcessRow[]) {
  return rows
    .filter((r) => r.processCodeId !== "")
    .map((r) => ({
      processCodeId: Number(r.processCodeId),
      detail: r.detail,
      qty: r.qty === "" ? null : Number(r.qty),
      plannedStart: r.plannedStart || null,
      durationHours: r.durationHours === "" ? null : Number(r.durationHours),
      status: r.status,
      location: r.location,
      ownerEmployeeId: r.ownerEmployeeId === "" ? null : Number(r.ownerEmployeeId),
      memo: r.memo,
    }));
}

const inputClass =
  "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400";
const rowLabelClass = "mb-1 block text-[10px] font-semibold text-gray-400";

export default function ProcessRowsEditor({
  rows,
  onChange,
  codes,
  employees,
  rowPrefix = "#",
  hideOwner = false,
}: {
  rows: ProcessRow[];
  onChange: (rows: ProcessRow[]) => void;
  codes: CodeOption[];
  employees: EmployeeOption[];
  rowPrefix?: string;
  hideOwner?: boolean;  // true 면 담당자 칸을 그리지 않는다(사내작업: 등록자 본인 고정)
}) {
  const setRow = (i: number, patch: Partial<ProcessRow>) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-bold text-gray-400">{rowPrefix}{i + 1}</span>
            {rows.length > 1 && (
              <button
                type="button"
                onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
                className="rounded-lg p-1 text-gray-400 hover:bg-rose-50 hover:text-rose-500"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div>
              <label className={rowLabelClass}>공정 <span className="text-rose-500">*</span></label>
              <select
                value={r.processCodeId}
                onChange={(e) => setRow(i, { processCodeId: e.target.value })}
                className={inputClass}
              >
                <option value="">공정 선택</option>
                {codes.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
              </select>
            </div>
            <div>
              <label className={rowLabelClass}>공정상세</label>
              <input value={r.detail} onChange={(e) => setRow(i, { detail: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className={rowLabelClass}>횟수</label>
              <input type="number" min={1} value={r.qty} onChange={(e) => setRow(i, { qty: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className={rowLabelClass}>작업시작예정</label>
              <input type="date" value={r.plannedStart} onChange={(e) => setRow(i, { plannedStart: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className={rowLabelClass}>소요시간(h)</label>
              <input type="number" min={0} step={0.5} value={r.durationHours} onChange={(e) => setRow(i, { durationHours: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className={rowLabelClass}>상태</label>
              <select value={r.status} onChange={(e) => setRow(i, { status: e.target.value })} className={inputClass}>
                {PROCESS_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {!hideOwner && (
              <div>
                <label className={rowLabelClass}>담당자</label>
                <select
                  value={r.ownerEmployeeId}
                  onChange={(e) => setRow(i, { ownerEmployeeId: e.target.value })}
                  className={inputClass}
                >
                  <option value="">담당자 선택</option>
                  {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className={rowLabelClass}>현위치</label>
              <input value={r.location} onChange={(e) => setRow(i, { location: e.target.value })} className={inputClass} />
            </div>
            <div className="col-span-2 sm:col-span-4">
              <label className={rowLabelClass}>공정메모</label>
              <input value={r.memo} onChange={(e) => setRow(i, { memo: e.target.value })} className={inputClass} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
