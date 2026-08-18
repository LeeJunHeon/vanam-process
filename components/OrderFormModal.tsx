"use client";

import { useState } from "react";
import { X, Plus, Trash2 } from "lucide-react";
import { errorMessage } from "@/lib/fetchError";
import { PAYMENT_STATUSES, PRECHECK_STATUSES, PROCESS_STATUSES } from "@/lib/status";

export type CodeOption = { id: number; code: string };
export type EmployeeOption = { id: number; name: string };

export type OrderEditTarget = {
  id: number;
  receivedAt: string;
  company: string | null;
  customerName: string | null;
  jobName: string | null;
  sampleReceivedAt: string | null;
  dueAt: string | null;
  paymentStatus: string;
  precheckStatus: string;
  memo: string | null;
};

type ProcessRow = {
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

const emptyRow = (): ProcessRow => ({
  processCodeId: "",
  detail: "",
  qty: "",
  plannedStart: "",
  durationHours: "",
  status: "대기",
  location: "",
  ownerEmployeeId: "",
  memo: "",
});

function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const inputClass =
  "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400";
const labelClass = "mb-1.5 block text-[11px] font-semibold text-gray-500";
const rowLabelClass = "mb-1 block text-[10px] font-semibold text-gray-400";

export default function OrderFormModal({
  target,
  codes,
  employees,
  onClose,
  onSaved,
}: {
  target?: OrderEditTarget | null;
  codes: CodeOption[];
  employees: EmployeeOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!target;

  const [receivedAt, setReceivedAt] = useState(target?.receivedAt?.slice(0, 10) ?? today());
  const [company, setCompany] = useState(target?.company ?? "");
  const [customerName, setCustomerName] = useState(target?.customerName ?? "");
  const [jobName, setJobName] = useState(target?.jobName ?? "");
  const [sampleReceivedAt, setSampleReceivedAt] = useState(target?.sampleReceivedAt?.slice(0, 10) ?? "");
  const [dueAt, setDueAt] = useState(target?.dueAt?.slice(0, 10) ?? "");
  const [paymentStatus, setPaymentStatus] = useState(target?.paymentStatus ?? "미결제");
  const [precheckStatus, setPrecheckStatus] = useState(target?.precheckStatus ?? "미완료");
  const [memo, setMemo] = useState(target?.memo ?? "");
  const [rows, setRows] = useState<ProcessRow[]>([emptyRow()]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const setRow = (i: number, patch: Partial<ProcessRow>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const submit = async () => {
    setErr(null);
    if (!receivedAt) return setErr("접수일을 입력해주세요.");

    setBusy(true);
    try {
      if (isEdit) {
        const res = await fetch(`/api/orders/${target!.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            receivedAt,
            company,
            customerName,
            jobName,
            sampleReceivedAt: sampleReceivedAt || null,
            dueAt: dueAt || null,
            paymentStatus,
            precheckStatus,
            memo,
          }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => null);
          throw new Error(d?.error ?? "수정에 실패했습니다.");
        }
      } else {
        const valid = rows.filter((r) => r.processCodeId !== "");
        if (valid.length === 0) return setErr("공정을 1개 이상 입력해주세요.");

        const res = await fetch("/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            receivedAt,
            company,
            customerName,
            jobName,
            sampleReceivedAt: sampleReceivedAt || null,
            dueAt: dueAt || null,
            paymentStatus,
            precheckStatus,
            memo,
            processes: valid.map((r) => ({
              processCodeId: Number(r.processCodeId),
              detail: r.detail,
              qty: r.qty === "" ? null : Number(r.qty),
              plannedStart: r.plannedStart || null,
              durationHours: r.durationHours === "" ? null : Number(r.durationHours),
              status: r.status,
              location: r.location,
              ownerEmployeeId: r.ownerEmployeeId === "" ? null : Number(r.ownerEmployeeId),
              memo: r.memo,
            })),
          }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => null);
          throw new Error(d?.error ?? "등록에 실패했습니다.");
        }
      }
      onSaved();
      onClose();
    } catch (e) {
      setErr(errorMessage(e, "저장에 실패했습니다."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
    >
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900">
            {isEdit ? `발주 수정` : "발주 등록"}
          </h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <label className={labelClass}>접수일 <span className="text-rose-500">*</span></label>
              <input type="date" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>샘플수령</label>
              <input type="date" value={sampleReceivedAt} onChange={(e) => setSampleReceivedAt(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>납기예정</label>
              <input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className={inputClass} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <label className={labelClass}>고객사</label>
              <input value={company} onChange={(e) => setCompany(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>고객명</label>
              <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>작업명</label>
              <input value={jobName} onChange={(e) => setJobName(e.target.value)} className={inputClass} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>결제상태</label>
              <select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)} className={inputClass}>
                {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>사전검수</label>
              <select value={precheckStatus} onChange={(e) => setPrecheckStatus(e.target.value)} className={inputClass}>
                {PRECHECK_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className={labelClass}>발주메모</label>
            <textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={2} className={`${inputClass} resize-none`} />
          </div>

          {!isEdit && (
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-[11px] font-semibold text-gray-500">
                  공정 <span className="text-rose-500">*</span> ({rows.length}건)
                </label>
                <button
                  type="button"
                  onClick={() => setRows((p) => [...p, emptyRow()])}
                  className="flex items-center gap-1 rounded-lg bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-200"
                >
                  <Plus size={12} /> 공정 추가
                </button>
              </div>

              <div className="space-y-2">
                {rows.map((r, i) => (
                  <div key={i} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[11px] font-bold text-gray-400">#{i + 1}</span>
                      {rows.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setRows((p) => p.filter((_, idx) => idx !== i))}
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
              <p className="mt-1 text-[10px] text-gray-400">
                발주관리번호는 접수일 기준으로 자동 부여됩니다 (예: 20260813-001).
              </p>
            </div>
          )}

          {err && <p className="text-[12px] text-rose-500">{err}</p>}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} disabled={busy} className="rounded-xl bg-gray-100 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 disabled:opacity-50">
            취소
          </button>
          <button onClick={submit} disabled={busy} className="rounded-xl bg-blue-500 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-blue-600 disabled:opacity-50">
            {busy ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
