"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { CodeOption, EmployeeOption } from "@/components/OrderFormModal";
import { errorMessage } from "@/lib/fetchError";
import { PROCESS_STATUSES } from "@/lib/status";

export type ProcessItem = {
  id: number;
  sequence: number;
  processCode: { id: number; code: string };
  detail: string | null;
  qty: number | null;
  plannedStart: string | null;
  durationHours: number | null;
  status: string;
  location: string | null;
  owner: { id: number; name: string } | null;
  memo: string | null;
  syncStatus: string | null;
};

// ── 공정 단건 수정 모달 (전 직원) ──
export default function ProcessEditModal({
  proc, codes, employees, onClose, onSaved,
}: {
  proc: ProcessItem;
  codes: CodeOption[];
  employees: EmployeeOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [processCodeId, setProcessCodeId] = useState(String(proc.processCode.id));
  const [detail, setDetail] = useState(proc.detail ?? "");
  const [qty, setQty] = useState(proc.qty === null ? "" : String(proc.qty));
  const [plannedStart, setPlannedStart] = useState(proc.plannedStart?.slice(0, 10) ?? "");
  const [durationHours, setDurationHours] = useState(proc.durationHours === null ? "" : String(proc.durationHours));
  const [status, setStatus] = useState(proc.status);
  const [location, setLocation] = useState(proc.location ?? "");
  const [ownerEmployeeId, setOwnerEmployeeId] = useState(proc.owner ? String(proc.owner.id) : "");
  const [memo, setMemo] = useState(proc.memo ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const inputClass =
    "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400";
  const labelClass = "mb-1.5 block text-[11px] font-semibold text-gray-500";

  const submit = async () => {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/processes/${proc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          processCodeId: Number(processCodeId),
          detail,
          qty: qty === "" ? null : Number(qty),
          plannedStart: plannedStart || null,
          durationHours: durationHours === "" ? null : Number(durationHours),
          status,
          location,
          ownerEmployeeId: ownerEmployeeId === "" ? null : Number(ownerEmployeeId),
          memo,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? "수정에 실패했습니다.");
      }
      onSaved();
      onClose();
    } catch (e) {
      setErr(errorMessage(e, "수정에 실패했습니다."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900">공정 수정 · #{proc.sequence}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>공정</label>
            <select value={processCodeId} onChange={(e) => setProcessCodeId(e.target.value)} className={inputClass}>
              {codes.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>상태</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
              {PROCESS_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className={labelClass}>공정상세</label>
            <input value={detail} onChange={(e) => setDetail(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>횟수</label>
            <input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>작업시작예정</label>
            <input type="date" value={plannedStart} onChange={(e) => setPlannedStart(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>소요시간(h)</label>
            <input type="number" min={0} step={0.5} value={durationHours} onChange={(e) => setDurationHours(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>담당자</label>
            <select value={ownerEmployeeId} onChange={(e) => setOwnerEmployeeId(e.target.value)} className={inputClass}>
              <option value="">미지정</option>
              {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>현위치</label>
            <input value={location} onChange={(e) => setLocation(e.target.value)} className={inputClass} />
          </div>
          <div className="col-span-2">
            <label className={labelClass}>공정메모</label>
            <textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={2} className={`${inputClass} resize-none`} />
          </div>
        </div>
        {err && <p className="mt-3 text-[12px] text-rose-500">{err}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} disabled={busy} className="rounded-xl bg-gray-100 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 disabled:opacity-50">취소</button>
          <button onClick={submit} disabled={busy} className="rounded-xl bg-blue-500 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-blue-600 disabled:opacity-50">
            {busy ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
