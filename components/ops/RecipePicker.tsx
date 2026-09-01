"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { fmtLogTime } from "@/lib/ops";

export type RecipeItem = {
  id: number;
  kind: string;
  name: string;
  rows: Record<string, string>[];
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
};

function summarize(r: RecipeItem): string {
  const n = r.rows?.length ?? 0;
  if (r.kind === "heater") {
    const max = Math.max(0, ...r.rows.map((x) => Number(x.target_c) || 0));
    return `${n}단계 · 최고 ${max}℃`;
  }
  const first = r.rows?.[0]?.Process_name ?? "";
  return `${n}스텝${first ? ` · ${first}` : ""}`;
}

export default function RecipePicker({
  equipment, kind, onPick, onClose,
}: {
  equipment: string;
  kind: "process" | "heater";
  onPick: (r: RecipeItem) => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<RecipeItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = () => {
    fetch(`/api/ops/recipe?equipment=${equipment}&kind=${kind}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setItems(j.items ?? []))
      .catch(() => setErr("목록을 불러오지 못했습니다."));
  };
  useEffect(load, [equipment, kind]);

  const remove = async (id: number, name: string) => {
    if (!window.confirm(`"${name}" 레시피를 삭제할까요?`)) return;
    await fetch(`/api/ops/recipe?id=${id}`, { method: "DELETE" });
    load();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-bold text-gray-900">
            {kind === "heater" ? "히터" : "공정"} 레시피 불러오기
          </p>
          <button onClick={onClose} className="text-xs font-semibold text-gray-400 hover:text-gray-600">
            닫기
          </button>
        </div>

        {err && <p className="text-xs text-rose-600">{err}</p>}
        {!items && !err && <p className="py-8 text-center text-xs text-gray-300">불러오는 중…</p>}
        {items?.length === 0 && (
          <p className="py-8 text-center text-xs text-gray-300">저장된 레시피가 없습니다</p>
        )}

        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
          {items?.map((r) => (
            <div key={r.id}
              className="flex items-center gap-2 rounded-xl border border-gray-100 px-3 py-2 hover:border-gray-200">
              <button onClick={() => onPick(r)} className="min-w-0 flex-1 text-left">
                <span className="block truncate text-xs font-semibold text-gray-900">{r.name}</span>
                <span className="block text-[11px] text-gray-500">{summarize(r)}</span>
                <span className="block text-[10px] text-gray-400">
                  최종 수정 {r.updatedBy} · {fmtLogTime(r.updatedAt)}
                  {r.createdBy !== r.updatedBy && ` · 생성 ${r.createdBy}`}
                </span>
              </button>
              <button onClick={() => remove(r.id, r.name)}
                className="shrink-0 rounded p-1 text-gray-300 hover:text-rose-500">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
