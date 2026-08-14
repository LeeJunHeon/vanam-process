"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import ProcessEditModal from "@/components/ProcessEditModal";
import type { ProcessItem } from "@/components/ProcessEditModal";
import type { CodeOption, EmployeeOption } from "@/components/OrderFormModal";
import { STATUS_STYLE } from "@/lib/status";
import { errorMessage } from "@/lib/fetchError";

type Row = ProcessItem & {
  order: { orderNo: string; company: string | null };
  mine: boolean;
};

const DAY = 86400000;
const DOW = ["월", "화", "수", "목", "금", "토", "일"];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function toStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
// 이번 주 월요일 (로컬 기준)
function mondayOf(base: Date): Date {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

export default function WeeklyBoard() {
  const [weekStart, setWeekStart] = useState<Date>(() => mondayOf(new Date()));
  const [items, setItems] = useState<Row[]>([]);
  const [codes, setCodes] = useState<CodeOption[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Row | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/processes");
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? `조회 실패 (${res.status})`);
      }
      setItems(await res.json());
    } catch (e) {
      setError(errorMessage(e, "공정을 불러오지 못했습니다."));
    }
  }, []);

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

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * DAY)),
    [weekStart],
  );
  const todayStr = toStr(new Date());
  const rangeLabel = `${toStr(days[0]).slice(5)} ~ ${toStr(days[6]).slice(5)}`;

  // (코드id|날짜) → 공정 칩 목록. 취소는 캘린더와 동일하게 제외한다.
  const cells = useMemo(() => {
    const map = new Map<string, Row[]>();
    const from = toStr(days[0]);
    const to = toStr(days[6]);
    for (const p of items) {
      if (p.status === "취소" || !p.plannedStart) continue;
      const d = (p.plannedStart as string).slice(0, 10);
      if (d < from || d > to) continue;
      const key = `${p.processCode.id}|${d}`;
      const arr = map.get(key) ?? [];
      arr.push(p);
      map.set(key, arr);
    }
    return map;
  }, [items, days]);

  const weekHasChips = cells.size > 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-50 px-4 py-3">
        <span className="text-sm font-bold text-gray-800">주간 장비 일정</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold text-gray-500">{rangeLabel}</span>
          <button
            onClick={() => setWeekStart(new Date(weekStart.getTime() - 7 * DAY))}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"
          >
            <ChevronLeft size={15} />
          </button>
          <button
            onClick={() => setWeekStart(mondayOf(new Date()))}
            className="rounded-lg bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600 hover:bg-gray-200"
          >
            이번 주
          </button>
          <button
            onClick={() => setWeekStart(new Date(weekStart.getTime() + 7 * DAY))}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      {error ? (
        <div className="px-4 py-6 text-center text-sm text-rose-600">{error}</div>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[820px]">
            {/* 요일 헤더 */}
            <div className="grid grid-cols-[84px_repeat(7,1fr)] border-b border-gray-50">
              <div />
              {days.map((d, i) => {
                const isToday = toStr(d) === todayStr;
                return (
                  <div
                    key={i}
                    className={`px-1 py-1.5 text-center text-[11px] font-semibold ${
                      isToday ? "bg-blue-50/60 text-blue-600" : "text-gray-400"
                    }`}
                  >
                    {DOW[i]} {d.getMonth() + 1}/{d.getDate()}
                  </div>
                );
              })}
            </div>

            {/* 장비(공정 코드) 레인 */}
            {codes.map((c) => (
              <div
                key={c.id}
                className="grid grid-cols-[84px_repeat(7,1fr)] border-b border-gray-50 last:border-b-0"
              >
                <div className="flex items-center px-3 py-1 text-xs font-bold text-gray-700">
                  {c.code}
                </div>
                {days.map((d, i) => {
                  const ds = toStr(d);
                  const chips = cells.get(`${c.id}|${ds}`) ?? [];
                  const isToday = ds === todayStr;
                  return (
                    <div
                      key={i}
                      className={`min-h-[40px] space-y-1 border-l border-gray-50 p-1 ${
                        isToday ? "bg-blue-50/40" : ""
                      }`}
                    >
                      {chips.map((p) => {
                        const delayed =
                          ds < todayStr && (p.status === "대기" || p.status === "예약");
                        const over24 =
                          p.durationHours !== null && (p.durationHours as number) > 24;
                        return (
                          <button
                            key={p.id}
                            onClick={() => setEditing(p)}
                            title={`${p.order.orderNo} #${p.sequence} · ${p.detail ?? ""} · ${p.status}`}
                            className={`block w-full truncate rounded px-1.5 py-0.5 text-left text-[10px] font-semibold ${
                              STATUS_STYLE[p.status] ?? "bg-gray-100 text-gray-600"
                            } ${delayed ? "ring-1 ring-rose-400" : ""}`}
                          >
                            {p.detail || p.order.orderNo}
                            {over24 ? ` ~${Math.ceil((p.durationHours as number) / 24)}일` : ""}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            ))}

            {!weekHasChips && (
              <div className="px-4 py-3 text-center text-[11px] text-gray-300">
                이번 주에 예정된 공정이 없습니다.
              </div>
            )}
          </div>
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
    </div>
  );
}
