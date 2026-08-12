"use client";

import { useState } from "react";
import { X } from "lucide-react";
import PhotoUploader from "@/components/ui/PhotoUploader";

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

// datetime-local 입력용 현재 시각 문자열
function nowLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const inputClass =
  "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400";
const labelClass = "mb-1.5 block text-[11px] font-semibold text-gray-500";

export default function SubstrateFormModal({ onClose, onSaved }: Props) {
  const [receivedAt, setReceivedAt] = useState(nowLocal());
  const [manager, setManager] = useState("");
  const [source, setSource] = useState("");
  const [clientName, setClientName] = useState("");
  const [memo, setMemo] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    if (!manager.trim()) return setErr("담당자를 입력해주세요.");
    if (photos.length === 0) return setErr("기판 사진을 최소 1장 첨부해주세요.");

    setBusy(true);
    try {
      const form = new FormData();
      form.append("receivedAt", new Date(receivedAt).toISOString());
      form.append("manager", manager);
      form.append("source", source);
      form.append("clientName", clientName);
      form.append("memo", memo);
      photos.forEach((f) => form.append("photos", f));

      const res = await fetch("/api/receipts", { method: "POST", body: form });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? "등록에 실패했습니다.");
      }
      onSaved();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "등록에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900">기판 반입 기록</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className={labelClass}>반입 일시 <span className="text-rose-500">*</span></label>
            <input
              type="datetime-local"
              value={receivedAt}
              onChange={(e) => setReceivedAt(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>담당자 <span className="text-rose-500">*</span></label>
            <input
              value={manager}
              onChange={(e) => setManager(e.target.value)}
              placeholder="기판을 받은 사람"
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>출처</label>
              <input
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="자사 / 외부 등"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>요청처</label>
              <input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="회사명 (선택)"
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>메모</label>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              rows={3}
              placeholder="기판 상태, 특이사항 등"
              className={`${inputClass} resize-none`}
            />
          </div>

          <PhotoUploader onFilesChange={setPhotos} disabled={busy} />

          {err && <p className="text-[12px] text-rose-500">{err}</p>}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-xl bg-gray-100 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 disabled:opacity-50"
          >
            취소
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="rounded-xl bg-blue-500 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
          >
            {busy ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
