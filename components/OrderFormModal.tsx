"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { X, Plus } from "lucide-react";
import { errorMessage } from "@/lib/fetchError";
import { PAYMENT_STATUSES, PRECHECK_STATUSES } from "@/lib/status";
import ProcessRowsEditor, {
  emptyProcessRow, toProcessPayload, type ProcessRow,
} from "@/components/ProcessRowsEditor";

export type CodeOption = { id: number; code: string };
export type EmployeeOption = { id: number; name: string };

export type OrderEditTarget = {
  id: number;
  kind: string;
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

function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const inputClass =
  "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400";
const labelClass = "mb-1.5 block text-[11px] font-semibold text-gray-500";

const OWNER_HINT =
  "담당자가 본인이 아닌 공정은 내 공정 목록에 표시되지 않습니다 (관리자와 해당 담당자에게만 보입니다).";

// 발주 관리 탭 [발주 등록] → kind '발주', 공정 관리 탭 [공정 등록] → kind '사내작업'.
// 수정 시에는 target.kind 를 따른다(구분은 등록 후 바꿀 수 없다).
export default function OrderFormModal({
  kind = "발주",
  target,
  codes,
  employees,
  onClose,
  onSaved,
}: {
  kind?: "발주" | "사내작업";
  target?: OrderEditTarget | null;
  codes: CodeOption[];
  employees: EmployeeOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!target;
  const internal = (target ? target.kind : kind) === "사내작업";
  const { data: session } = useSession();

  // 사내작업 등록: 첫 공정 행의 담당자 기본값 = 본인(직원 목록에 있을 때만)
  const myId = session?.user?.employeeId;
  const myOwner =
    internal && !isEdit && myId != null && employees.some((e) => e.id === myId) ? String(myId) : "";

  const [receivedAt, setReceivedAt] = useState(target?.receivedAt?.slice(0, 10) ?? today());
  const [company, setCompany] = useState(target?.company ?? "");
  const [customerName, setCustomerName] = useState(target?.customerName ?? "");
  const [jobName, setJobName] = useState(target?.jobName ?? "");
  const [sampleReceivedAt, setSampleReceivedAt] = useState(target?.sampleReceivedAt?.slice(0, 10) ?? "");
  const [dueAt, setDueAt] = useState(target?.dueAt?.slice(0, 10) ?? "");
  const [paymentStatus, setPaymentStatus] = useState(target?.paymentStatus ?? "미결제");
  const [precheckStatus, setPrecheckStatus] = useState(target?.precheckStatus ?? "미완료");
  const [memo, setMemo] = useState(target?.memo ?? "");
  const [rows, setRows] = useState<ProcessRow[]>(() => [emptyProcessRow({ ownerEmployeeId: myOwner })]);
  // 담당자 기본값을 이미 넣었거나 사용자가 첫 행 담당자를 직접 바꿨으면 true
  const [ownerSettled, setOwnerSettled] = useState(myOwner !== "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 세션·직원 목록이 늦게 오면 그때 한 번 반영한다(렌더 중 상태 보정).
  if (!ownerSettled && myOwner) {
    setOwnerSettled(true);
    setRows((prev) => prev.map((r, i) => (i === 0 && r.ownerEmployeeId === "" ? { ...r, ownerEmployeeId: myOwner } : r)));
  }

  const changeRows = (next: ProcessRow[]) => {
    if (next[0]?.ownerEmployeeId !== rows[0]?.ownerEmployeeId) setOwnerSettled(true);
    setRows(next);
  };

  const submit = async () => {
    setErr(null);
    if (internal) {
      if (!jobName.trim()) return setErr("공정 이름(작업명)을 입력해주세요.");
    } else {
      if (!receivedAt) return setErr("접수일을 입력해주세요.");
      if (!jobName.trim()) return setErr("작업명을 입력해주세요.");
    }

    setBusy(true);
    try {
      if (isEdit) {
        const res = await fetch(`/api/orders/${target!.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            internal
              ? { jobName }
              : {
                  receivedAt,
                  company,
                  customerName,
                  jobName,
                  sampleReceivedAt: sampleReceivedAt || null,
                  dueAt: dueAt || null,
                  paymentStatus,
                  precheckStatus,
                  memo,
                },
          ),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => null);
          throw new Error(d?.error ?? "수정에 실패했습니다.");
        }
      } else {
        const valid = toProcessPayload(rows);
        if (valid.length === 0) return setErr("공정을 1개 이상 입력해주세요.");

        const res = await fetch("/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            internal
              ? { kind: "사내작업", receivedAt: today(), jobName, processes: valid }
              : {
                  kind: "발주",
                  receivedAt,
                  company,
                  customerName,
                  jobName,
                  sampleReceivedAt: sampleReceivedAt || null,
                  dueAt: dueAt || null,
                  paymentStatus,
                  precheckStatus,
                  memo,
                  processes: valid,
                },
          ),
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

  const title = internal
    ? (isEdit ? "사내작업 수정" : "공정 등록")
    : (isEdit ? "발주 수정" : "발주 등록");

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
    >
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          {internal ? (
            <div>
              <label className={labelClass}>공정 이름 (작업명) <span className="text-rose-500">*</span></label>
              <input value={jobName} onChange={(e) => setJobName(e.target.value)} maxLength={200} className={inputClass} />
              {!isEdit && (
                <p className="mt-1 text-[10px] text-gray-400">
                  공정 이름은 발주 관리의 작업명으로 저장되고 캘린더 일정 제목에도 쓰입니다. 발주번호는 오늘 날짜 기준으로 자동 부여됩니다.
                </p>
              )}
            </div>
          ) : (
            <>
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
                  <label className={labelClass}>작업명 <span className="text-rose-500">*</span></label>
                  <input value={jobName} onChange={(e) => setJobName(e.target.value)} maxLength={200} className={inputClass} />
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
            </>
          )}

          {!isEdit && (
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-[11px] font-semibold text-gray-500">
                  공정 <span className="text-rose-500">*</span> ({rows.length}건)
                </label>
                <button
                  type="button"
                  onClick={() => setRows((p) => [...p, emptyProcessRow()])}
                  className="flex items-center gap-1 rounded-lg bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-200"
                >
                  <Plus size={12} /> 공정 추가
                </button>
              </div>

              <ProcessRowsEditor
                rows={rows}
                onChange={changeRows}
                codes={codes}
                employees={employees}
                ownerHint={internal ? OWNER_HINT : undefined}
              />
              {!internal && (
                <p className="mt-1 text-[10px] text-gray-400">
                  발주관리번호는 접수일 기준으로 자동 부여됩니다 (예: 20260813-001).
                </p>
              )}
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
