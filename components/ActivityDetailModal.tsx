"use client";

import { X } from "lucide-react";
import { assetPath } from "@/lib/assetPath";

export type ReceiptState = {
  receivedAt: string;
  manager: string;
  source: string | null;
  clientName: string | null;
  memo: string | null;
  photoIds: number[];
};

export type ActivityDetail = {
  id: number;
  action: string;
  targetType: string;
  targetId: number;
  actorEmail: string;
  actorName: string | null;
  createdAt: string;
  snapshot: { state: unknown; before: unknown | null } | null;
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const ACTION_LABEL: Record<string, string> = {
  create: "등록",
  update: "수정",
  delete: "삭제",
};

// 발주/공정 스냅샷의 필드 한글 라벨. 표시 순서도 이 순서를 따른다.
const FIELD_LABEL: Record<string, string> = {
  orderNo: "발주번호",
  receivedAt: "접수일",
  company: "고객사",
  customerName: "고객명",
  jobName: "작업명",
  sampleReceivedAt: "샘플수령",
  dueAt: "납기예정",
  paymentStatus: "결제상태",
  precheckStatus: "사전검수",
  sequence: "순번",
  code: "공정",
  detail: "공정상세",
  qty: "횟수",
  plannedStart: "시작예정",
  durationHours: "소요시간",
  status: "상태",
  location: "현위치",
  owner: "담당자",
  memo: "메모",
  processes: "공정 목록",
};

const labelClass = "mb-1.5 block text-[11px] font-semibold text-gray-500";
const boxClass =
  "rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-700 min-h-[38px]";

// 변경 전 값과 다르면 강조한다
function changed(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) !== JSON.stringify(b ?? null);
}

// 스칼라 값을 화면 문자열로
function displayValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "예" : "아니오";
  return String(v);
}

// 발주 스냅샷의 processes 배열 한 줄: "#순번 코드 · 상세 · 상태"
function processLine(p: unknown): string {
  const r = (p ?? {}) as Record<string, unknown>;
  const parts = [displayValue(r.code) || "-"];
  if (displayValue(r.detail)) parts.push(displayValue(r.detail));
  parts.push(displayValue(r.status) || "-");
  return `#${displayValue(r.sequence) || "-"} ${parts.join(" · ")}`;
}

export default function ActivityDetailModal({
  log,
  onClose,
}: {
  log: ActivityDetail;
  onClose: () => void;
}) {
  const rawState = log.snapshot?.state ?? null;
  const rawBefore = log.snapshot?.before ?? null;
  const isSubstrate = log.targetType === "substrate_receipt";

  const s = isSubstrate ? (rawState as ReceiptState | null) : null;
  const before = isSubstrate ? (rawBefore as ReceiptState | null) : null;

  const row = (
    label: string,
    value: string | null,
    prev: string | null,
    showPrev: boolean,
  ) => (
    <div>
      <label className={labelClass}>{label}</label>
      <div
        className={`${boxClass} ${
          showPrev && changed(value, prev) ? "border-amber-200 bg-amber-50" : ""
        }`}
      >
        {value || <span className="text-gray-300">-</span>}
      </div>
      {showPrev && changed(value, prev) && (
        <p className="mt-1 text-[10px] text-gray-400">
          이전: {prev || "-"}
        </p>
      )}
    </div>
  );

  // 발주/공정 스냅샷 범용 렌더러
  const renderGeneric = () => {
    const state = (rawState ?? {}) as Record<string, unknown>;
    const prevState = (rawBefore ?? null) as Record<string, unknown> | null;
    const hasPrev = prevState !== null;

    // 라벨 정의 순서대로, 스냅샷에 존재하는 키만 표시
    const keys = Object.keys(FIELD_LABEL).filter((k) => k in state);

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {keys
            .filter((k) => k !== "processes" && k !== "memo")
            .map((k) =>
              <div key={k}>
                {row(
                  FIELD_LABEL[k],
                  displayValue(state[k]),
                  hasPrev ? displayValue(prevState![k]) : null,
                  hasPrev,
                )}
              </div>,
            )}
        </div>

        {"memo" in state && (
          <div>
            {row(
              FIELD_LABEL.memo,
              displayValue(state.memo),
              hasPrev ? displayValue(prevState!.memo) : null,
              hasPrev,
            )}
          </div>
        )}

        {Array.isArray(state.processes) && (
          <div>
            <label className={labelClass}>
              {FIELD_LABEL.processes} ({(state.processes as unknown[]).length}건)
            </label>
            {(state.processes as unknown[]).length === 0 ? (
              <div className={boxClass}>
                <span className="text-gray-300">없음</span>
              </div>
            ) : (
              <div
                className={`${boxClass} space-y-1 ${
                  hasPrev && changed(state.processes, prevState!.processes)
                    ? "border-amber-200 bg-amber-50"
                    : ""
                }`}
              >
                {(state.processes as unknown[]).map((p, i) => (
                  <p key={i} className="text-[13px]">
                    {processLine(p)}
                  </p>
                ))}
              </div>
            )}
            {hasPrev &&
              changed(state.processes, prevState!.processes) &&
              Array.isArray(prevState!.processes) && (
                <div className="mt-1 space-y-0.5">
                  <p className="text-[10px] text-gray-400">이전:</p>
                  {(prevState!.processes as unknown[]).length === 0 ? (
                    <p className="text-[10px] text-gray-400">없음</p>
                  ) : (
                    (prevState!.processes as unknown[]).map((p, i) => (
                      <p key={i} className="text-[10px] text-gray-400">
                        {processLine(p)}
                      </p>
                    ))
                  )}
                </div>
              )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-gray-900">
              {ACTION_LABEL[log.action] ?? log.action} 시점 기록
            </h3>
            <p className="mt-0.5 text-[11px] text-gray-400">
              {formatDateTime(log.createdAt)} · {log.actorName ?? log.actorEmail}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"
          >
            <X size={18} />
          </button>
        </div>

        {!rawState ? (
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-6 text-center text-sm text-gray-400">
            이 이력에는 저장된 상세 값이 없습니다.
          </div>
        ) : !isSubstrate ? (
          renderGeneric()
        ) : (
          <div className="space-y-4">
            {row("반입 일시", formatDateTime(s!.receivedAt),
                 before ? formatDateTime(before.receivedAt) : null, !!before)}
            {row("담당자", s!.manager, before?.manager ?? null, !!before)}
            <div className="grid grid-cols-2 gap-3">
              {row("출처", s!.source, before?.source ?? null, !!before)}
              {row("요청처", s!.clientName, before?.clientName ?? null, !!before)}
            </div>
            {row("메모", s!.memo, before?.memo ?? null, !!before)}

            <div>
              <label className={labelClass}>
                이 시점의 사진 ({s!.photoIds.length}장)
              </label>
              {s!.photoIds.length === 0 ? (
                <div className={boxClass}>
                  <span className="text-gray-300">없음</span>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {s!.photoIds.map((pid) => (
                    <a
                      key={pid}
                      href={assetPath(`/api/photos/${pid}/file`)}
                      target="_blank"
                      rel="noreferrer"
                      className="overflow-hidden rounded-lg bg-gray-100"
                      style={{ width: 72, height: 72 }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={assetPath(`/api/photos/${pid}/file`)}
                        alt={`사진 ${pid}`}
                        className="h-full w-full object-cover"
                      />
                    </a>
                  ))}
                </div>
              )}
              {before && changed(s!.photoIds, before.photoIds) && (
                <p className="mt-1 text-[10px] text-gray-400">
                  이전 사진: {before.photoIds.length}장
                  {before.photoIds.length > 0 && ` (${before.photoIds.join(", ")})`}
                </p>
              )}
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-xl bg-gray-100 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
