"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Search, Pencil, Camera, Images, CalendarDays } from "lucide-react";
import ProcessEditModal from "@/components/ProcessEditModal";
import type { ProcessItem } from "@/components/ProcessEditModal";
import ReceiptListModal from "@/components/ReceiptListModal";
import SubstrateFormModal from "@/components/SubstrateFormModal";
import type { CodeOption, EmployeeOption } from "@/components/OrderFormModal";
import { PROCESS_STATUSES, STATUS_STYLE, ROW_STYLE } from "@/lib/status";
import { errorMessage } from "@/lib/fetchError";

type Row = ProcessItem & {
  order: { id: number; orderNo: string; company: string | null; jobName: string | null; dueAt: string | null };
  mine: boolean;
  receiptCount: number;
};

function fmtDate(d: string | null): string {
  return d ? d.slice(0, 10) : "미정";
}

function dday(target: string | null): string | null {
  if (!target) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const now = new Date();
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const diff = Math.round(
    (new Date(target.slice(0, 10)).getTime() - new Date(today).getTime()) / 86400000,
  );
  if (diff === 0) return "오늘";
  return diff > 0 ? `D-${diff}` : `D+${-diff}`;
}

const ACTIVE_STATUSES = ["대기", "예약", "진행", "보류"];

export default function ProcessesPage() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string })?.role;
  const isAdmin = role === "admin" || role === "ceo";

  const [items, setItems] = useState<Row[]>([]);
  const [codes, setCodes] = useState<CodeOption[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("active"); // active=진행중 묶음
  const [ownerFilter, setOwnerFilter] = useState("");
  const [sortKey, setSortKey] = useState<"plannedAsc" | "plannedDesc" | "createdDesc">("plannedAsc");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Row | null>(null);
  const [viewing, setViewing] = useState<Row | null>(null);
  const [recording, setRecording] = useState<Row | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/processes?q=${encodeURIComponent(q)}`);
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? `조회 실패 (${res.status})`);
      }
      setItems(await res.json());
    } catch (e) {
      setError(errorMessage(e, "공정 목록을 불러오지 못했습니다."));
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
        // 드롭다운 실패는 치명적이지 않음
      }
    })();
  }, []);

  const changeStatus = async (p: Row, status: string) => {
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

  const view = useMemo(() => {
    let list = items;
    if (statusFilter === "active") list = list.filter((p) => ACTIVE_STATUSES.includes(p.status));
    else if (statusFilter) list = list.filter((p) => p.status === statusFilter);
    if (isAdmin && ownerFilter)
      list = list.filter((p) => p.owner?.id === Number(ownerFilter));
    if (sortKey === "plannedAsc") return list; // 서버 기본 정렬 (미정은 뒤)
    const sorted = [...list];
    if (sortKey === "plannedDesc") {
      sorted.sort((a, b) => {
        if (!a.plannedStart) return 1;
        if (!b.plannedStart) return -1;
        return (b.plannedStart as string).localeCompare(a.plannedStart as string);
      });
    } else {
      sorted.sort((a, b) => b.id - a.id);
    }
    return sorted;
  }, [items, statusFilter, ownerFilter, sortKey, isAdmin]);

  const rowLabel = (p: Row) =>
    `${p.order.orderNo} #${p.sequence} ${p.processCode.code}${p.detail ? ` · ${p.detail}` : ""}`;

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="발주번호·고객사·작업명·공정상세 검색"
            className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-400"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-gray-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-blue-400"
        >
          <option value="active">진행중 전체</option>
          {PROCESS_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          <option value="">모든 상태</option>
        </select>
        {isAdmin && (
          <select
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
            className="rounded-xl border border-gray-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-blue-400"
          >
            <option value="">담당자 전체</option>
            {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
          </select>
        )}
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as typeof sortKey)}
          className="rounded-xl border border-gray-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-blue-400"
        >
          <option value="plannedAsc">시작 빠른순</option>
          <option value="plannedDesc">시작 늦은순</option>
          <option value="createdDesc">최근 등록순</option>
        </select>
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
          {items.length === 0
            ? isAdmin ? "등록된 공정이 없습니다." : "배정받은 공정이 없습니다."
            : "조건에 맞는 공정이 없습니다."}
        </div>
      ) : (
        <div className="space-y-2">
          {view.map((p) => {
            const dd = dday(p.plannedStart as string | null);
            return (
              <div
                key={p.id}
                className={`rounded-2xl border border-gray-100 bg-white p-4 ${ROW_STYLE[p.status] ?? ""}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[p.status] ?? "bg-gray-100 text-gray-600"}`}>
                        {p.status}
                      </span>
                      <span className="text-sm font-bold text-gray-900">{p.processCode.code}</span>
                      {p.detail && <span className="text-sm text-gray-700">{p.detail}</span>}
                      {dd && (
                        <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600">
                          {dd}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-gray-400">
                      <span className="font-semibold text-gray-500">{p.order.orderNo} #{p.sequence}</span>
                      {p.order.company && <span>{p.order.company}</span>}
                      {p.order.jobName && <span>{p.order.jobName}</span>}
                      <span className="flex items-center gap-1">
                        <CalendarDays size={11} /> 시작 {fmtDate(p.plannedStart as string | null)}
                      </span>
                      {p.durationHours !== null && <span>소요 {p.durationHours}h</span>}
                      {isAdmin && <span>담당 {p.owner?.name ?? "-"}</span>}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <select
                      value={p.status}
                      onChange={(e) => changeStatus(p, e.target.value)}
                      className={`rounded-md border-0 px-1.5 py-1 text-[11px] font-semibold outline-none ${STATUS_STYLE[p.status] ?? "bg-gray-100 text-gray-600"}`}
                    >
                      {PROCESS_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <button
                      onClick={() => setViewing(p)}
                      className="flex items-center gap-1 rounded-lg bg-gray-100 px-2 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-200"
                      title="기판 사진 기록 보기"
                    >
                      <Images size={12} /> {p.receiptCount}
                    </button>
                    {p.mine && (
                      <button
                        onClick={() => setRecording(p)}
                        className="flex items-center gap-1 rounded-lg bg-blue-500 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-blue-600"
                      >
                        <Camera size={12} /> 기판 사진
                      </button>
                    )}
                    <button
                      onClick={() => setEditing(p)}
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-500"
                      title="공정 수정"
                    >
                      <Pencil size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <ProcessEditModal
          proc={editing}
          codes={codes}
          employees={employees}
          onClose={() => setEditing(null)}
          onSaved={load}
        />
      )}
      {viewing && (
        <ReceiptListModal
          orderProcessId={viewing.id}
          title={rowLabel(viewing)}
          onClose={() => setViewing(null)}
        />
      )}
      {recording && (
        <SubstrateFormModal
          lockedProcess={{ id: recording.id, label: rowLabel(recording) }}
          onClose={() => setRecording(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
