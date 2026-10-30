"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Search, Trash2, ImageOff, Pencil } from "lucide-react";
import SubstrateFormModal from "@/components/SubstrateFormModal";
import type { EditTarget } from "@/components/SubstrateFormModal";
import { errorMessage, fetchJson } from "@/lib/fetchError";
import { photoUrl } from "@/lib/photoUrl";

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
  orderProcess: {
    id: number;
    sequence: number;
    processCode: { code: string };
    order: { orderNo: string };
  } | null;
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

  // 목록 조회. state 는 응답 콜백에서만 바꾼다.
  const fetchList = useCallback(
    () =>
      fetchJson<Receipt[]>(`/api/receipts?q=${encodeURIComponent(q)}`)
        .then(
          (rows) => setItems(rows),
          (e) => setError(errorMessage(e, "목록을 불러오지 못했습니다.")),
        )
        .finally(() => setLoading(false)),
    [q],
  );

  // 검색어를 바꾸면 바로 로딩 표시를 켜고 이전 오류를 지운다(조회는 아래 effect 가 한다)
  const changeQ = (v: string) => {
    setQ(v);
    setLoading(true);
    setError(null);
  };

  // 다시 불러오기(저장·삭제 뒤, 다시 시도) — 로딩 표시를 켜고 이전 오류를 지운 뒤 조회한다
  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    return fetchList();
  }, [fetchList]);

  // 첫 조회·검색어 변경. 이때의 로딩 표시·오류 지움은 초기값과 changeQ 가 맡는다
  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const remove = async (id: number) => {
    if (!confirm("이 기록을 삭제할까요?")) return;
    try {
      const res = await fetch(`/api/receipts/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? "삭제에 실패했습니다.");
      }
      load();
    } catch (e) {
      alert(errorMessage(e, "삭제에 실패했습니다."));
    }
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
            onChange={(e) => changeQ(e.target.value)}
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
                    {r.orderProcess && (
                      <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600">
                        {r.orderProcess.order.orderNo} #{r.orderProcess.sequence} {r.orderProcess.processCode.code}
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
                        manager: r.manager,
                        processRef: r.orderProcess
                          ? `${r.orderProcess.order.orderNo} #${r.orderProcess.sequence} ${r.orderProcess.processCode.code}`
                          : null,
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
                        src={photoUrl(p.id, "thumb")}
                        width={72}
                        height={72}
                        loading="lazy"
                        decoding="async"
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
            src={photoUrl(preview, "medium")}
            alt="기판 사진"
            decoding="async"
            className="max-h-full max-w-full object-contain"
          />
          <a
            href={photoUrl(preview)}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-4 right-4 rounded-lg bg-white/90 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-white"
          >
            원본 보기
          </a>
        </div>
      )}
    </div>
  );
}
