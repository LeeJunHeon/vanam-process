"use client";

import { useEffect, useState } from "react";
import { X, ImageOff } from "lucide-react";
import { assetPath } from "@/lib/assetPath";
import { errorMessage } from "@/lib/fetchError";

type Photo = { id: number; originalName: string };
type Receipt = {
  id: number;
  receivedAt: string;
  manager: string;
  memo: string | null;
  photos: Photo[];
};

function fmt(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ReceiptListModal({
  orderProcessId,
  title,
  onClose,
}: {
  orderProcessId: number;
  title: string;
  onClose: () => void;
}) {
  const [items, setItems] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/receipts?orderProcessId=${orderProcessId}`);
        if (!res.ok) {
          const d = await res.json().catch(() => null);
          throw new Error(d?.error ?? `조회 실패 (${res.status})`);
        }
        setItems(await res.json());
      } catch (e) {
        setError(errorMessage(e, "기록을 불러오지 못했습니다."));
      } finally {
        setLoading(false);
      }
    })();
  }, [orderProcessId]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-gray-900">기판 사진 기록</h3>
            <p className="mt-0.5 text-[11px] text-gray-400">{title}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-6 text-center text-sm text-gray-400">
            불러오는 중...
          </div>
        ) : error ? (
          <div className="rounded-xl border border-rose-100 bg-rose-50 p-6 text-center text-sm text-rose-600">
            {error}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 p-6 text-sm text-gray-400">
            <ImageOff size={18} />
            이 공정에 기록된 기판 사진이 없습니다.
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((r) => (
              <div key={r.id} className="rounded-xl border border-gray-100 p-3">
                <p className="text-sm font-semibold text-gray-800">{r.manager}</p>
                <p className="mt-0.5 text-[11px] text-gray-400">{fmt(r.receivedAt)}</p>
                {r.memo && (
                  <p className="mt-1.5 whitespace-pre-wrap text-sm text-gray-600">{r.memo}</p>
                )}
                {r.photos.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {r.photos.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setPreview(p.id)}
                        className="overflow-hidden rounded-lg bg-gray-100"
                        style={{ width: 64, height: 64 }}
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
      </div>

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
