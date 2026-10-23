"use client";

// 챔버K v2 장비 화면 공통 조각 — v1 OpsKit(OpsCard·확인창) 모양을 v2 쪽에 새로(v1 은 전환 뒤 지운다).
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { Q_TONE, fmtValue, type FieldDef, type Link } from "./types";

export function Card({
  title, right, children, className = "",
}: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-gray-100 bg-white p-3 ${className}`}>
      {(title || right) && (
        <div className="mb-2 flex items-center justify-between gap-2">
          {title && <h3 className="flex items-center gap-1.5 text-sm font-bold text-gray-900">{title}</h3>}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

/** 장비 블록 품질 배지(state.links — q·age 초) */
export function QBadge({ link }: { link?: Link }) {
  const q = link?.q ?? "—";
  const age = typeof link?.age === "number" ? link.age : null;
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${Q_TONE[q] ?? "bg-gray-100 text-gray-400"}`}
      title={age !== null ? `마지막 값 ${age.toFixed(1)} s 전` : undefined}>
      {q}{age !== null && q !== "ok" && q !== "off" ? ` ${age.toFixed(0)}s` : ""}
    </span>
  );
}

export function Dot({ on, alert, dim }: { on?: boolean | null; alert?: boolean; dim?: boolean }) {
  const c = dim ? "border-gray-300 bg-gray-200"
    : on ? (alert ? "border-rose-600 bg-rose-500" : "border-green-600 bg-green-500") : "border-gray-300 bg-white";
  return <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full border ${c}`} />;
}

/** 묶음 snapshot 정의 그대로 값 하나 — 숫자는 fmt·단위, bool 은 점 */
export function FieldValue({ f, v, dim }: { f: FieldDef; v: unknown; dim?: boolean }) {
  if (f.type === "bool") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-gray-600">
        <Dot on={v === true} dim={dim || v === null || v === undefined} />
        <span className={v === true && !dim ? "font-semibold text-gray-800" : ""}>{f.label}</span>
      </span>
    );
  }
  const s = fmtValue(v, f.fmt);
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5 text-xs" title={f.column}>
      <span className="shrink-0 truncate text-gray-400">{f.label}</span>
      <span className="truncate text-right">
        <span className={`font-semibold tabular-nums ${s && !dim ? "text-gray-900" : "text-gray-300"}`}>{s || "—"}</span>
        {s && f.unit && <span className="ml-0.5 text-[10px] text-gray-400">{f.unit}</span>}
      </span>
    </div>
  );
}

/** 크게 보이는 값(카드 위 줄) */
export function BigValue({ f, v, dim }: { f?: FieldDef; v: unknown; dim?: boolean }) {
  if (!f) return null;
  const s = fmtValue(v, f.fmt);
  return (
    <div className="min-w-0 px-3 py-2">
      <p className="truncate text-[10px] text-gray-400">{f.label}</p>
      <p className={`text-xl font-bold leading-tight tabular-nums ${s && !dim ? "text-gray-900" : "text-gray-300"}`}>
        {s || "—"}
        {s && f.unit && <span className="ml-0.5 text-xs font-normal text-gray-400">{f.unit}</span>}
      </p>
    </div>
  );
}

export type Ask = {
  kind: string;
  label: string;          // 무엇을
  detail?: string;        // 어떻게(→ ON 등)
  args?: Record<string, unknown>;
  danger?: boolean;        // 도어·벤트 — 사람 확인 문구
  stop?: boolean;          // 정지 쪽 — 정지 문구(note), 열리면 실행에 포커스
  note?: string;           // 정지가 하는 일
  plc?: { target: string; want: boolean };   // PLC 버튼 — "전환 중" 표시
};

/** 확인창 한 번 — 실행하면 onOk. Esc 취소, 정지 쪽은 열리면 실행 버튼에 포커스(Enter 실행) */
export function ConfirmDialog({ ask, onOk, onCancel }: { ask: Ask | null; onOk: () => void; onCancel: () => void }) {
  const okRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!ask) return;
    if (ask.stop) okRef.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [ask, onCancel]);
  if (!ask) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-4">
        <p className="text-sm font-bold text-gray-900">조작 확인</p>
        <p className="mt-2 text-sm text-gray-700">
          <span className="font-semibold">{ask.label}</span>
          {ask.detail && <span> {ask.detail}</span>} — 명령을 장비에 보냅니다.
        </p>
        {ask.note && (
          <p className={`mt-2 rounded-lg p-2 text-[11px] leading-relaxed ${ask.stop ? "bg-amber-50 text-amber-800" : "bg-gray-50 text-gray-600"}`}>
            {ask.note}
          </p>
        )}
        {ask.danger && (
          <p className="mt-2 rounded-lg bg-rose-50 p-2 text-[11px] leading-relaxed text-rose-600">
            물리적 위험이 있는 조작입니다. 장비 주변에 사람이 없는지 반드시 확인하세요.
          </p>
        )}
        <p className="mt-3 text-[11px] text-gray-400">이 조작은 실행자 계정과 함께 기록됩니다.</p>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel}
            className="rounded-xl px-3 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-50">
            취소
          </button>
          <button ref={okRef} onClick={onOk}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold text-white outline-offset-2 focus:outline-2 focus:outline-blue-500 ${
              ask.danger || ask.stop ? "bg-rose-600" : "bg-blue-600"}`}>
            실행
          </button>
        </div>
      </div>
    </div>
  );
}

export type Notice = { id: string; tone: "ok" | "bad" | "warn"; title: string; text?: string; at: number };

export function Notices({ list, onClose }: { list: Notice[]; onClose: (id: string) => void }) {
  if (!list.length) return null;
  const TONE = {
    ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
    bad: "border-rose-200 bg-rose-50 text-rose-700",
    warn: "border-amber-200 bg-amber-50 text-amber-700",
  };
  return (
    <div className="space-y-2">
      {list.map((n) => (
        <div key={n.id} className={`flex items-start gap-2 rounded-2xl border p-3 text-xs ${TONE[n.tone]}`}>
          <div className="min-w-0 flex-1 leading-relaxed">
            <p className="font-bold">{n.title}</p>
            {n.text && <p className="mt-0.5">{n.text}</p>}
          </div>
          <button onClick={() => onClose(n.id)} aria-label="알림 닫기"
            className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
