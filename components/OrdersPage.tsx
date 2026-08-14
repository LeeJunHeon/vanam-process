"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Plus, Search, Pencil, Trash2, ChevronDown, ChevronRight, CalendarDays, X,
} from "lucide-react";
import OrderFormModal from "@/components/OrderFormModal";
import type { OrderEditTarget, CodeOption, EmployeeOption } from "@/components/OrderFormModal";
import { errorMessage } from "@/lib/fetchError";
import { PROCESS_STATUSES, STATUS_STYLE, ROW_STYLE, SYNC_STYLE } from "@/lib/status";

type ProcessItem = {
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

type Order = OrderEditTarget & {
  orderNo: string;
  createdByEmail: string;
  processes: ProcessItem[];
};

function fmt(d: string | null): string {
  return d ? d.slice(0, 10) : "-";
}

export default function OrdersPage() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string })?.role;
  const isAdmin = role === "admin" || role === "ceo";

  const [items, setItems] = useState<Order[]>([]);
  const [codes, setCodes] = useState<CodeOption[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [sortKey, setSortKey] = useState<"receivedDesc" | "receivedAsc" | "dueAsc">("receivedDesc");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<OrderEditTarget | null>(null);
  const [editingProc, setEditingProc] = useState<ProcessItem | null>(null);
  const [addingTo, setAddingTo] = useState<Order | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders?q=${encodeURIComponent(q)}`);
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? `조회 실패 (${res.status})`);
      }
      setItems(await res.json());
    } catch (e) {
      setError(errorMessage(e, "목록을 불러오지 못했습니다."));
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    (async () => {
      try {
        const [c, e] = await Promise.all([fetch("/api/process-codes"), fetch("/api/employees")]);
        if (c.ok) setCodes(await c.json());
        if (e.ok) setEmployees(await e.json());
      } catch {
        // 드롭다운 실패는 치명적이지 않음 — 등록 시도 시 서버 검증이 걸러줌
      }
    })();
  }, []);

  // 검색은 서버, 필터·정렬은 클라이언트(최대 200건이라 즉각 반응)
  const view = useMemo(() => {
    let list = items;
    if (statusFilter)
      list = list.filter((o) => o.processes.some((p) => p.status === statusFilter));
    if (ownerFilter)
      list = list.filter((o) =>
        o.processes.some((p) => p.owner?.id === Number(ownerFilter)),
      );
    if (sortKey === "receivedDesc") return list; // 서버 기본 정렬 유지
    const sorted = [...list];
    if (sortKey === "receivedAsc") {
      sorted.sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
    } else {
      // 납기 임박순 — 납기 없는 발주는 뒤로
      sorted.sort((a, b) => {
        if (!a.dueAt) return 1;
        if (!b.dueAt) return -1;
        return a.dueAt.localeCompare(b.dueAt);
      });
    }
    return sorted;
  }, [items, statusFilter, ownerFilter, sortKey]);

  const toggle = (id: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const removeOrder = async (o: Order) => {
    if (!confirm(`${o.orderNo} 발주를 삭제할까요?`)) return;
    try {
      const res = await fetch(`/api/orders/${o.id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? "삭제에 실패했습니다.");
      }
      load();
    } catch (e) {
      alert(errorMessage(e, "삭제에 실패했습니다."));
    }
  };

  const removeProc = async (o: Order, p: ProcessItem) => {
    if (!confirm(`${o.orderNo} #${p.sequence} ${p.processCode.code} 공정을 삭제할까요?`)) return;
    try {
      const res = await fetch(`/api/processes/${p.id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? "삭제에 실패했습니다.");
      }
      load();
    } catch (e) {
      alert(errorMessage(e, "삭제에 실패했습니다."));
    }
  };

  const changeStatus = async (p: ProcessItem, status: string) => {
    try {
      const res = await fetch(`/api/processes/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? "상태 변경에 실패했습니다.");
      }
      load();
    } catch (e) {
      alert(errorMessage(e, "상태 변경에 실패했습니다."));
    }
  };

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="발주번호·고객사·고객명·작업명 검색"
            className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-400"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-gray-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-blue-400"
        >
          <option value="">상태 전체</option>
          {PROCESS_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={ownerFilter}
          onChange={(e) => setOwnerFilter(e.target.value)}
          className="rounded-xl border border-gray-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-blue-400"
        >
          <option value="">담당자 전체</option>
          {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
        </select>
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as typeof sortKey)}
          className="rounded-xl border border-gray-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-blue-400"
        >
          <option value="receivedDesc">접수 최신순</option>
          <option value="receivedAsc">접수 오래된순</option>
          <option value="dueAsc">납기 임박순</option>
        </select>
        {isAdmin && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 rounded-xl bg-blue-500 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-blue-600"
          >
            <Plus size={16} /> 발주 등록
          </button>
        )}
      </div>

      {error && (
        <div className="mb-3 flex items-center justify-between rounded-xl border border-rose-100 bg-rose-50 px-4 py-3">
          <span className="text-sm text-rose-600">{error}</span>
          <button onClick={load} className="rounded-lg bg-white px-3 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-100">
            다시 시도
          </button>
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center text-sm text-gray-400">불러오는 중...</div>
      ) : view.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center text-sm text-gray-400">
          {items.length === 0 ? "등록된 발주가 없습니다." : "조건에 맞는 발주가 없습니다."}
        </div>
      ) : (
        <div className="space-y-3">
          {view.map((o) => {
            const expanded = open.has(o.id);
            const chips = PROCESS_STATUSES
              .map((s) => [s, o.processes.filter((p) => p.status === s).length] as const)
              .filter(([, n]) => n > 0);
            return (
              <div key={o.id} className="rounded-2xl border border-gray-100 bg-white">
                <div className="flex items-start justify-between gap-3 p-4">
                  <button onClick={() => toggle(o.id)} className="flex min-w-0 flex-1 items-start gap-2 text-left">
                    {expanded
                      ? <ChevronDown size={16} className="mt-0.5 shrink-0 text-gray-400" />
                      : <ChevronRight size={16} className="mt-0.5 shrink-0 text-gray-400" />}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-gray-900">{o.orderNo}</span>
                        {o.company && <span className="rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">{o.company}</span>}
                        {o.jobName && <span className="text-sm text-gray-600">{o.jobName}</span>}
                        {chips.map(([s, n]) => (
                          <span
                            key={s}
                            className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[s]}`}
                          >
                            {s} {n}
                          </span>
                        ))}
                        {chips.length === 0 && (
                          <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                            공정 없음
                          </span>
                        )}
                      </div>
                      <p className="mt-1 flex items-center gap-1 text-[11px] text-gray-400">
                        <CalendarDays size={11} /> 접수 {fmt(o.receivedAt)} · 납기 {fmt(o.dueAt)} · {o.paymentStatus} · {o.precheckStatus}
                      </p>
                    </div>
                  </button>

                  {isAdmin && (
                    <div className="flex shrink-0 items-center gap-1">
                      <button onClick={() => setEditing(o)} className="rounded-lg p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-500" title="발주 수정">
                        <Pencil size={16} />
                      </button>
                      <button onClick={() => removeOrder(o)} className="rounded-lg p-1.5 text-gray-400 hover:bg-rose-50 hover:text-rose-500" title="발주 삭제">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  )}
                </div>

                {expanded && (
                  <div className="border-t border-gray-50 px-4 pb-4">
                    <div className="overflow-x-auto">
                      <table className="mt-3 w-full text-sm">
                        <thead>
                          <tr className="text-left text-[11px] font-semibold text-gray-400">
                            <th className="py-1.5 pr-3">#</th>
                            <th className="py-1.5 pr-3">공정</th>
                            <th className="py-1.5 pr-3">공정상세</th>
                            <th className="py-1.5 pr-3">횟수</th>
                            <th className="py-1.5 pr-3">시작예정</th>
                            <th className="py-1.5 pr-3">소요(h)</th>
                            <th className="py-1.5 pr-3">상태</th>
                            <th className="py-1.5 pr-3">담당자</th>
                            <th className="py-1.5 pr-3">현위치</th>
                            <th className="py-1.5 pr-3">연동</th>
                            <th className="py-1.5"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {o.processes.map((p) => (
                            <tr key={p.id} className={`border-t border-gray-50 ${ROW_STYLE[p.status] ?? ""}`}>
                              <td className="py-2 pr-3 text-[11px] font-bold text-gray-400">{p.sequence}</td>
                              <td className="py-2 pr-3 font-semibold text-gray-800">{p.processCode.code}</td>
                              <td className="py-2 pr-3 text-gray-600">{p.detail ?? "-"}</td>
                              <td className="py-2 pr-3 text-gray-600">{p.qty ?? "-"}</td>
                              <td className="py-2 pr-3 text-gray-600">{fmt(p.plannedStart)}</td>
                              <td className="py-2 pr-3 text-gray-600">{p.durationHours ?? "-"}</td>
                              <td className="py-2 pr-3">
                                <select
                                  value={p.status}
                                  onChange={(e) => changeStatus(p, e.target.value)}
                                  className={`rounded-md border-0 px-1.5 py-0.5 text-[11px] font-semibold outline-none ${STATUS_STYLE[p.status] ?? "bg-gray-100 text-gray-600"}`}
                                >
                                  {PROCESS_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                                </select>
                              </td>
                              <td className="py-2 pr-3 text-gray-600">{p.owner?.name ?? "-"}</td>
                              <td className="py-2 pr-3 text-gray-600">{p.location ?? "-"}</td>
                              <td className="py-2 pr-3">
                                {p.syncStatus ? (
                                  <span
                                    className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${SYNC_STYLE[p.syncStatus] ?? "bg-gray-100 text-gray-500"}`}
                                  >
                                    {p.syncStatus}
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-gray-300">-</span>
                                )}
                              </td>
                              <td className="py-2 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <button onClick={() => setEditingProc(p)} className="rounded-lg p-1 text-gray-400 hover:bg-blue-50 hover:text-blue-500" title="공정 수정">
                                    <Pencil size={13} />
                                  </button>
                                  {isAdmin && (
                                    <button onClick={() => removeProc(o, p)} className="rounded-lg p-1 text-gray-400 hover:bg-rose-50 hover:text-rose-500" title="공정 삭제">
                                      <Trash2 size={13} />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {isAdmin && (
                      <button
                        onClick={() => setAddingTo(o)}
                        className="mt-2 flex items-center gap-1 rounded-lg bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-200"
                      >
                        <Plus size={12} /> 공정 추가
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <OrderFormModal codes={codes} employees={employees} onClose={() => setShowForm(false)} onSaved={load} />
      )}
      {editing && (
        <OrderFormModal target={editing} codes={codes} employees={employees} onClose={() => setEditing(null)} onSaved={load} />
      )}
      {editingProc && (
        <ProcessEditModal
          proc={editingProc}
          codes={codes}
          employees={employees}
          onClose={() => setEditingProc(null)}
          onSaved={load}
        />
      )}
      {addingTo && (
        <ProcessAddModal
          order={addingTo}
          codes={codes}
          employees={employees}
          onClose={() => setAddingTo(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}

// ── 공정 단건 수정 모달 (전 직원) ──
function ProcessEditModal({
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

// ── 기존 발주에 공정 추가 모달 (관리자) ──
function ProcessAddModal({
  order, codes, employees, onClose, onSaved,
}: {
  order: Order;
  codes: CodeOption[];
  employees: EmployeeOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [rows, setRows] = useState([
    { processCodeId: "", detail: "", qty: "", plannedStart: "", durationHours: "", ownerEmployeeId: "", memo: "" },
  ]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const inputClass =
    "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400";

  const setRow = (i: number, patch: Partial<(typeof rows)[number]>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const submit = async () => {
    setErr(null);
    const valid = rows.filter((r) => r.processCodeId !== "");
    if (valid.length === 0) return setErr("공정을 1개 이상 입력해주세요.");
    setBusy(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/processes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          processes: valid.map((r) => ({
            processCodeId: Number(r.processCodeId),
            detail: r.detail,
            qty: r.qty === "" ? null : Number(r.qty),
            plannedStart: r.plannedStart || null,
            durationHours: r.durationHours === "" ? null : Number(r.durationHours),
            ownerEmployeeId: r.ownerEmployeeId === "" ? null : Number(r.ownerEmployeeId),
            memo: r.memo,
          })),
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? "공정 추가에 실패했습니다.");
      }
      onSaved();
      onClose();
    } catch (e) {
      setErr(errorMessage(e, "공정 추가에 실패했습니다."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900">공정 추가 · {order.orderNo}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-bold text-gray-400">추가 #{i + 1}</span>
                {rows.length > 1 && (
                  <button type="button" onClick={() => setRows((p) => p.filter((_, idx) => idx !== i))} className="rounded-lg p-1 text-gray-400 hover:bg-rose-50 hover:text-rose-500">
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <select value={r.processCodeId} onChange={(e) => setRow(i, { processCodeId: e.target.value })} className={inputClass}>
                  <option value="">공정 선택</option>
                  {codes.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
                </select>
                <input placeholder="공정상세" value={r.detail} onChange={(e) => setRow(i, { detail: e.target.value })} className={inputClass} />
                <input type="number" min={1} placeholder="횟수" value={r.qty} onChange={(e) => setRow(i, { qty: e.target.value })} className={inputClass} />
                <input type="date" value={r.plannedStart} onChange={(e) => setRow(i, { plannedStart: e.target.value })} className={inputClass} title="작업시작예정" />
                <input type="number" min={0} step={0.5} placeholder="소요시간(h)" value={r.durationHours} onChange={(e) => setRow(i, { durationHours: e.target.value })} className={inputClass} />
                <select value={r.ownerEmployeeId} onChange={(e) => setRow(i, { ownerEmployeeId: e.target.value })} className={inputClass}>
                  <option value="">담당자 선택</option>
                  {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                </select>
                <input placeholder="공정메모" value={r.memo} onChange={(e) => setRow(i, { memo: e.target.value })} className={`${inputClass} col-span-2`} />
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setRows((p) => [...p, { processCodeId: "", detail: "", qty: "", plannedStart: "", durationHours: "", ownerEmployeeId: "", memo: "" }])}
          className="mt-2 flex items-center gap-1 rounded-lg bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-200"
        >
          <Plus size={12} /> 줄 추가
        </button>
        {err && <p className="mt-3 text-[12px] text-rose-500">{err}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} disabled={busy} className="rounded-xl bg-gray-100 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 disabled:opacity-50">취소</button>
          <button onClick={submit} disabled={busy} className="rounded-xl bg-blue-500 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-blue-600 disabled:opacity-50">
            {busy ? "저장 중..." : "추가"}
          </button>
        </div>
      </div>
    </div>
  );
}
