"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, ChevronRight } from "lucide-react";
import ActivityDetailModal from "@/components/ActivityDetailModal";
import type { ActivityDetail } from "@/components/ActivityDetailModal";
import { errorMessage } from "@/lib/fetchError";

type Log = ActivityDetail & { summary: string | null };

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const ACTION_META: Record<
  string,
  { label: string; icon: typeof Plus; color: string; bg: string }
> = {
  create: { label: "등록", icon: Plus, color: "text-emerald-600", bg: "bg-emerald-50" },
  update: { label: "수정", icon: Pencil, color: "text-blue-600", bg: "bg-blue-50" },
  delete: { label: "삭제", icon: Trash2, color: "text-rose-600", bg: "bg-rose-50" },
};

export default function ActivityPage() {
  const [items, setItems] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Log | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/activity");
        if (!res.ok) {
          const d = await res.json().catch(() => null);
          throw new Error(d?.error ?? `조회 실패 (${res.status})`);
        }
        setItems(await res.json());
      } catch (e) {
        setError(errorMessage(e, "이력을 불러오지 못했습니다."));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="p-4 sm:p-6">
        <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center text-sm text-gray-400">
          불러오는 중...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 sm:p-6">
        <div className="rounded-2xl border border-rose-100 bg-rose-50 p-8 text-center text-sm text-rose-600">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      {items.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center text-sm text-gray-400">
          이력이 없습니다.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
          {items.map((log, i) => {
            const meta = ACTION_META[log.action] ?? {
              label: log.action,
              icon: Pencil,
              color: "text-gray-600",
              bg: "bg-gray-50",
            };
            const Icon = meta.icon;
            return (
              <button
                key={log.id}
                onClick={() => setSelected(log)}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 ${
                  i > 0 ? "border-t border-gray-50" : ""
                }`}
              >
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${meta.bg}`}
                >
                  <Icon size={14} className={meta.color} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-gray-700">
                    <span className={`font-semibold ${meta.color}`}>
                      {meta.label}
                    </span>
                    {log.summary ? ` · ${log.summary}` : ""}
                  </p>
                  <p className="text-[11px] text-gray-400">
                    {log.actorName ?? log.actorEmail}
                  </p>
                </div>
                <span className="shrink-0 text-[11px] text-gray-400">
                  {formatDateTime(log.createdAt)}
                </span>
                <ChevronRight size={14} className="shrink-0 text-gray-300" />
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <ActivityDetailModal log={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
