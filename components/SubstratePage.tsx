"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Search, Trash2, ImageOff, Pencil } from "lucide-react";
import SubstrateFormModal from "@/components/SubstrateFormModal";
import type { EditTarget } from "@/components/SubstrateFormModal";
import { assetPath } from "@/lib/assetPath";

type Photo = { id: number; originalName: string; mimeType: string | null };
type Receipt = {
  id: number;
  receivedAt: string;
  manager: string;
  source: string | null;
  clientName: string | null;
  memo: string | null;
  createdByEmail: string;
  photos: Photo[];
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function SubstratePage() {
  const [items, setItems] = useState<Receipt[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [preview, setPreview] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/receipts?q=${encodeURIComponent(q)}`);
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? `조회 실패 (${res.status})`);
      }
      setItems(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (id: number) => {
    if (!confirm("이 기록을 삭제할까요? 첨부된 사진도 함께 삭제됩니다.")) return;
    const res = await fetch(`/api/receipts/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      alert(d?.error ?? "삭제에 실패했습니다.");
      return;
    }
    load();
  };

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="담당자·출처·요청처·메모 검색"
            className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-400"
          />
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 rounded-xl bg-blue-500 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-blue-600"
        >
          <Plus size={16} />
          등록
        </button>
      </div>

      {error && (
        <div className="mb-3 flex items-center justify-between rounded-xl border border-rose-100 bg-rose-50 px-4 py-3">
          <span className="text-sm text-rose-600">{error}</span>
          <button
            onClick={load}
            className="rounded-lg bg-white px-3 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-100"
          >
            다시 시도
          </button>
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center text-sm text-gray-400">
          불러오는 중...
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center text-sm text-gray-400">
          등록된 기록이 없습니다.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((r) => (
            <div
              key={r.id}
              className="rounded-2xl border border-gray-100 bg-white p-4"
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-gray-900">
                      {r.manager}
                    </span>
                    {r.source && (
                      <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                        {r.source}
                      </span>
                    )}
                    {r.clientName && (
                      <span className="rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">
                        {r.clientName}
                      </span>
                    )}
                    {r.photos.length === 0 && (
                      <span className="flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">
                        <ImageOff size={10} />
                        사진 없음
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] text-gray-400">
                    {formatDate(r.receivedAt)} · {r.createdByEmail}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() =>
                      setEditing({
                        id: r.id,
                        receivedAt: r.receivedAt,
                        source: r.source,
                        clientName: r.clientName,
                        memo: r.memo,
                        photos: r.photos.map((p) => ({
                          id: p.id,
                          originalName: p.originalName,
                        })),
                      })
                    }
                    className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-blue-50 hover:text-blue-500"
                    title="수정"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => remove(r.id)}
                    className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-rose-50 hover:text-rose-500"
                    title="삭제"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {r.memo && (
                <p className="mb-3 whitespace-pre-wrap text-sm text-gray-600">
                  {r.memo}
                </p>
              )}

              {r.photos.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {r.photos.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setPreview(p.id)}
                      className="overflow-hidden rounded-lg bg-gray-100"
                      style={{ width: 72, height: 72 }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={assetPath(`/api/photos/${p.id}/file`)}
                        alt={p.originalName}
                        className="h-full w-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <SubstrateFormModal onClose={() => setShowForm(false)} onSaved={load} />
      )}

      {editing && (
        <SubstrateFormModal
          target={editing}
          onClose={() => setEditing(null)}
          onSaved={load}
        />
      )}

      {preview !== null && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.8)" }}
          onClick={() => setPreview(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={assetPath(`/api/photos/${preview}/file`)}
            alt="기판 사진"
            className="max-h-full max-w-full object-contain"
          />
        </div>
      )}
    </div>
  );
}
