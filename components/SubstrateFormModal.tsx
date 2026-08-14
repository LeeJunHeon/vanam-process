"use client";

import { useEffect, useState } from "react";
import { X, Trash2 } from "lucide-react";
import { useSession } from "next-auth/react";
import PhotoUploader from "@/components/ui/PhotoUploader";
import { errorMessage } from "@/lib/fetchError";
import { assetPath } from "@/lib/assetPath";

type Photo = { id: number; originalName: string };
export type EditTarget = {
  id: number;
  receivedAt: string;
  manager: string;
  processRef: string | null;
  source: string | null;
  clientName: string | null;
  memo: string | null;
  photos: Photo[];
};

interface Props {
  target?: EditTarget | null; // 없으면 신규 등록
  // 공정 관리 화면에서 열릴 때: 이 공정에 고정 연결 (선택 UI 없음)
  lockedProcess?: { id: number; label: string } | null;
  onClose: () => void;
  onSaved: () => void;
}

// datetime-local 입력용 문자열 (로컬 시각 기준)
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const inputClass =
  "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400";
const labelClass = "mb-1.5 block text-[11px] font-semibold text-gray-500";

export default function SubstrateFormModal({ target, lockedProcess, onClose, onSaved }: Props) {
  const { data: session } = useSession();
  const isEdit = !!target;

  const [receivedAt, setReceivedAt] = useState(
    target ? toLocalInput(new Date(target.receivedAt)) : toLocalInput(new Date()),
  );
  const [source, setSource] = useState(target?.source ?? "");
  const [clientName, setClientName] = useState(target?.clientName ?? "");
  const [memo, setMemo] = useState(target?.memo ?? "");
  const [photos, setPhotos] = useState<File[]>([]);
  const [existing, setExisting] = useState<Photo[]>(target?.photos ?? []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setExisting(target?.photos ?? []);
  }, [target]);

  // 담당자는 서버가 세션에서 결정한다. 화면에는 확인용으로만 보여준다.
  const managerLabel = session?.user?.name || session?.user?.email || "-";

  // 기존 사진 떼어내기 (파일은 보존되고 목록에서만 제외된다)
  const detachPhoto = async (photoId: number) => {
    if (!confirm("이 사진을 기록에서 제외할까요?")) return;
    try {
      const res = await fetch(`/api/photos/${photoId}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? "사진 제외에 실패했습니다.");
      }
      setExisting((prev) => prev.filter((p) => p.id !== photoId));
    } catch (e) {
      alert(errorMessage(e, "사진 제외에 실패했습니다."));
    }
  };

  const submit = async () => {
    setErr(null);
    if (!isEdit && photos.length === 0)
      return setErr("기판 사진을 최소 1장 첨부해주세요.");

    setBusy(true);
    try {
      if (isEdit) {
        // 1) 본문 수정
        const res = await fetch(`/api/receipts/${target!.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            receivedAt: new Date(receivedAt).toISOString(),
            source,
            clientName,
            memo,
          }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => null);
          throw new Error(d?.error ?? "수정에 실패했습니다.");
        }

        // 2) 새로 추가한 사진이 있으면 별도 전송
        if (photos.length > 0) {
          const form = new FormData();
          photos.forEach((f) => form.append("photos", f));
          const r2 = await fetch(`/api/receipts/${target!.id}/photos`, {
            method: "POST",
            body: form,
          });
          if (!r2.ok) {
            const d = await r2.json().catch(() => null);
            throw new Error(d?.error ?? "사진 추가에 실패했습니다.");
          }
        }
      } else {
        const form = new FormData();
        form.append("receivedAt", new Date(receivedAt).toISOString());
        form.append("source", source);
        form.append("clientName", clientName);
        form.append("memo", memo);
        if (lockedProcess) form.append("orderProcessId", String(lockedProcess.id));
        photos.forEach((f) => form.append("photos", f));

        const res = await fetch("/api/receipts", { method: "POST", body: form });
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

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900">
            {isEdit ? "기판 반입 기록 수정" : "기판 반입 기록"}
          </h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className={labelClass}>
              반입 일시 <span className="text-rose-500">*</span>
            </label>
            <input
              type="datetime-local"
              value={receivedAt}
              onChange={(e) => setReceivedAt(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>담당자</label>
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-600">
              {isEdit ? target!.manager : managerLabel}
            </div>
            {!isEdit && (
              <p className="mt-1 text-[10px] text-gray-400">
                로그인한 사용자로 자동 기록됩니다.
              </p>
            )}
          </div>

          {(lockedProcess || (isEdit && target?.processRef)) && (
            <div>
              <label className={labelClass}>연결 공정</label>
              <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700">
                {lockedProcess?.label ?? target?.processRef}
              </div>
            </div>
          )}

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

          {isEdit && existing.length > 0 && (
            <div>
              <label className={labelClass}>기존 사진 ({existing.length}장)</label>
              <div className="flex flex-wrap gap-2">
                {existing.map((p) => (
                  <div
                    key={p.id}
                    className="relative overflow-hidden rounded-lg bg-gray-100"
                    style={{ width: 72, height: 72 }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={assetPath(`/api/photos/${p.id}/file`)}
                      alt={p.originalName}
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => detachPhoto(p.id)}
                      className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white shadow"
                      title="기록에서 제외"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

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
