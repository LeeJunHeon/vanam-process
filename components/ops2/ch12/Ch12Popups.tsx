"use client";

// 챔버12 알림창 — v1 경고·오류창(runtime/chamber_runtime.py:8432-8525 _popup_should_show·_post_warning·_post_critical, util/timed_popup.py,
// 플라즈마 클리닝 같은 규칙 PC-085·086, 호스트(로봇) 명령 알림창 UI-092)을 같은 규칙으로 화면에 띄운다. 새 판정·새 알림은 없다 —
// 장비가 이미 내는 사건만: popup(공정 엔진 ProcEvent·플라즈마 클리닝 PcEvent·TSP — data.title·text·kind·clear_on_close·auto_close_ms),
// error_event(robot·robot_server — title·message, v1 호스트 알림창).
// 규칙(v1 그대로):
//  - 경고(warning, level warn): 5 s(data.auto_close_ms) 뒤 저절로 닫힘. 오류(critical, level error): 자동 닫힘 없음. 호스트 알림: 15 s.
//  - 같은 (제목, 본문) 창이 떠 있으면 다시 띄우지 않음(중복 억제) — 단, 닫으면 오류 해제를 하는 창(clear_on_close)은 떠 있는 같은 창이
//    해제 책임이 없을 때 새로 띄움. 동시에 5개를 넘으면 띄우지 않음(상한) — clear_on_close 창은 상한을 넘어도 띄움.
//  - clear_on_close(v1 clear_status_to_idle) 창이 닫히면(확인·X·ESC 무관) 오류 표시 해제 명령(CHAMBER_ERROR_CLEAR·PC_ERROR_CLEAR).
//  - 화면을 연 뒤에 온 사건만(지난 사건 목록으로 창을 다시 띄우지 않음).
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, OctagonAlert } from "lucide-react";
import type { FeedItem } from "../chk/useChk2";

export const POPUP_MAX_OPEN = 5;
export const WARNING_AUTO_CLOSE_MS = 5000;
export const HOST_AUTO_CLOSE_MS = 15000;

export type Popup = {
  id: string; title: string; text: string; kind: "warning" | "critical" | "host"; autoMs: number | null;
  clearOnClose: boolean; chamber: string; clear: { kind: string; args: Record<string, unknown> } | null; ts: string;
};

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v : v === null || v === undefined ? "" : String(v));

/** 사건 → 알림창(아니면 null) */
export function popupOf(e: FeedItem): Popup | null {
  if (e.type !== "event") return null;
  const d = e.data as Obj;
  const c = isObj(d.context) ? d.context : null;
  if (!c) return null;
  const ch = str(c.chamber) || "shared";
  if (c.kind === "popup") {
    const x = isObj(c.data) ? c.data : c;
    const critical = x.kind === "critical" || (x.kind !== "warning" && d.level === "error");
    const clearOnClose = critical && x.clear_on_close === true;
    let clear: Popup["clear"] = null;
    if (clearOnClose && (ch === "ch1" || ch === "ch2")) clear = { kind: "CHAMBER_ERROR_CLEAR", args: { ch: ch === "ch1" ? 1 : 2 } };
    else if (clearOnClose && ch === "pc") clear = { kind: "PC_ERROR_CLEAR", args: typeof x.ch === "number" ? { ch: x.ch } : {} };
    const auto = typeof x.auto_close_ms === "number" ? x.auto_close_ms : WARNING_AUTO_CLOSE_MS;
    return { id: e.id, title: str(x.title) || "알림", text: str(x.text) || str(d.message), kind: critical ? "critical" : "warning",
             autoMs: critical ? null : auto > 0 ? auto : null, clearOnClose, chamber: ch, clear, ts: e.ts };
  }
  if (c.kind === "error_event" && (c.source === "robot" || c.source === "robot_server")) {
    return { id: e.id, title: str(c.title) || "HOST", text: str(c.message) || str(d.message), kind: "host", autoMs: HOST_AUTO_CLOSE_MS,
             clearOnClose: false, chamber: ch, clear: null, ts: e.ts };
  }
  return null;
}

/** v1 _popup_should_show — 띄우나(false 면 이유) */
export function admit(open: Popup[], p: Popup, max = POPUP_MAX_OPEN): { show: boolean; why?: "dup" | "cap" } {
  for (const b of open) {
    if (b.title === p.title && b.text === p.text) {
      if (p.clearOnClose && !b.clearOnClose) break;          // 해제 책임이 없는 같은 창 — 새로 띄워 해제 경로를 보장
      return { show: false, why: "dup" };
    }
  }
  if (!p.clearOnClose && open.length >= max) return { show: false, why: "cap" };
  return { show: true };
}

/** 새로 온 사건으로 띄울 창 — 처음 본 사건만, 화면을 연 시각(장비 시계 기준) 뒤 것만 */
export function usePopups(feed: FeedItem[], openedDeviceMs: number, onClear: (c: NonNullable<Popup["clear"]>) => void) {
  const [open, setOpen] = useState<Popup[]>([]);
  const seen = useRef<Set<string>>(new Set());
  const openRef = useRef<Popup[]>([]);

  const close = useCallback((id: string) => {
    const p = openRef.current.find((x) => x.id === id);
    if (!p) return;
    openRef.current = openRef.current.filter((x) => x.id !== id);
    setOpen(openRef.current);
    if (p.clear) onClear(p.clear);
  }, [onClear]);

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useEffect(() => {
    const add: Popup[] = [];
    let cur = [...openRef.current];
    for (const e of feed) {
      if (seen.current.has(e.id)) continue;
      seen.current.add(e.id);
      const p = popupOf(e);
      if (!p || !(Date.parse(e.ts) >= openedDeviceMs)) continue;
      if (!admit(cur, p).show) continue;
      cur = [...cur, p];
      add.push(p);
    }
    if (!add.length) return;
    openRef.current = cur;
    setOpen(cur);
    for (const p of add) if (p.autoMs) timers.current.push(setTimeout(() => close(p.id), p.autoMs));   // v1 attach_autoclose
  }, [feed, openedDeviceMs, close]);

  return { open, close };
}

export function PopupStack({ list, onClose }: { list: Popup[]; onClose: (id: string) => void }) {
  useEffect(() => {
    if (!list.length) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(list[list.length - 1].id); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [list, onClose]);
  if (!list.length) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-16 z-[75] flex flex-col items-center gap-2 px-4">
      {list.map((p) => (
        <div key={p.id} role="alertdialog" aria-label={p.title} data-popup={p.kind}
          className={`pointer-events-auto w-full max-w-md rounded-2xl border bg-white p-3 shadow-xl ${p.kind === "warning" ? "border-amber-300" : "border-rose-300"}`}>
          <p className="flex items-center gap-2 text-sm font-bold text-gray-900">
            {p.kind === "warning" ? <AlertTriangle size={16} className="text-amber-500" /> : <OctagonAlert size={16} className="text-rose-600" />}
            {p.title}
            {p.chamber !== "shared" && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">{p.chamber.toUpperCase()}</span>}
          </p>
          <p className="mt-1.5 whitespace-pre-wrap text-xs text-gray-700">{p.text}</p>
          <div className="mt-2 flex items-center gap-2">
            {p.autoMs && <span className="text-[10px] text-gray-400">{Math.round(p.autoMs / 1000)}초 뒤 닫힘</span>}
            {p.clear && <span className="text-[10px] text-gray-400">확인하면 오류 표시가 해제됩니다</span>}
            <button onClick={() => onClose(p.id)} className="ml-auto rounded-lg bg-gray-900 px-3 py-1 text-xs font-semibold text-white hover:bg-gray-700">OK</button>
          </div>
        </div>
      ))}
    </div>
  );
}
