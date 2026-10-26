"use client";

// 챔버K v2 아래 줄 — 사건(stream: 수준별 색·사유 라벨), 명령 기록(commands), 최근 공정(runs).
import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "./kit";
import { fmtKst } from "@/lib/ops2/time";
import {
  CMD_STATUS, RUN_RESULT, adjustText, commandLabel, reasonLabel, type Bundle, type CmdRow, type RunRow,
} from "./types";
import type { FeedItem } from "./useChk2";

const LEVEL_TONE: Record<string, string> = { error: "text-rose-600", warn: "text-amber-600", info: "text-gray-600" };
const s = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

function line(b: Bundle | null, e: FeedItem): { level: string; code: string; text: string } {
  const d = e.data;
  if (e.type === "event") {
    const code = s(d.code);
    const adj = adjustText(b, d.code, d.context);
    if (adj) return { level: s(d.level) || "info", code, text: adj };
    const label = reasonLabel(b, code);
    const msg = s(d.message);
    return { level: s(d.level) || "info", code, text: [d.ruleId && `[${s(d.ruleId)}]`, label !== code && label, msg].filter(Boolean).join(" ") };
  }
  if (e.type === "run_start") {
    return { level: "info", code: "RUN_START", text: `공정 시작 ${s(d.name) || s(d.recipeName) || ""} (행 ${s(d.stepNo)}${d.by ? `, ${s(d.by)}` : ""})` };
  }
  if (e.type === "run_end") {
    const r = s(d.result);
    return { level: r === "done" ? "info" : "warn", code: "RUN_END",
             text: `공정 끝 — ${RUN_RESULT[r] ?? r}${d.reasonCode ? ` · ${reasonLabel(b, s(d.reasonCode))}` : ""}` };
  }
  if (e.type === "cmd_result") {
    const ok = d.status === "accepted";
    return { level: ok ? "info" : "warn", code: s(d.reasonCode) || (ok ? "ACCEPTED" : "REJECTED"),
             text: `명령 ${commandLabel(b, s(d.kind))} ${CMD_STATUS[s(d.status)] ?? s(d.status)}${
               d.reasonCode ? ` — ${reasonLabel(b, s(d.reasonCode))}` : ""} (${s(d.source)}${d.by ? `, ${s(d.by)}` : ""})` };
  }
  return { level: d.status === "rejected" ? "warn" : "info", code: "CONFIG_ACK",
           text: `설정 버전 ${s(d.version)} ${s(d.status)}${d.reasonCode ? ` — ${reasonLabel(b, s(d.reasonCode))}` : ""}` };
}

export function EventFeed({ bundle, feed }: { bundle: Bundle | null; feed: FeedItem[] }) {
  const [onlyIssue, setOnlyIssue] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);
  const stick = useRef(true);
  const rows = useMemo(() => feed.map((e) => ({ e, ...line(bundle, e) })), [bundle, feed]);   // state 마다 다시 그리지 않게
  const shown = onlyIssue ? rows.filter((r) => r.level !== "info") : rows;
  const issues = rows.filter((r) => r.level !== "info").length;
  const newest = feed[feed.length - 1]?.id;

  useEffect(() => {
    const el = box.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [newest, onlyIssue]);

  return (
    <Card title="사건" right={
      <button onClick={() => setOnlyIssue((v) => !v)}
        className={`rounded-lg px-2 py-1 text-[11px] font-semibold ${onlyIssue ? "bg-rose-50 text-rose-600" : "text-gray-400 hover:bg-gray-50"}`}>
        경고·오류{issues > 0 && ` ${issues}`}
      </button>
    }>
      {!shown.length ? (
        <p className="py-6 text-center text-xs text-gray-300">{onlyIssue ? "경고·오류가 없습니다" : "받은 사건이 없습니다"}</p>
      ) : (
        <div ref={box}
          onScroll={() => { const el = box.current; if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24; }}
          className="h-64 space-y-1 overflow-y-auto rounded-lg bg-gray-50/60 p-2 font-mono [overflow-anchor:none]">
          {shown.map((r) => (
            <p key={r.e.id} className="flex gap-2 text-[11px] leading-snug">
              <span className="shrink-0 text-gray-300">{fmtKst(r.e.ts)}</span>
              <span className={`shrink-0 font-semibold ${LEVEL_TONE[r.level] ?? LEVEL_TONE.info}`}>{r.code}</span>
              <span className={LEVEL_TONE[r.level] ?? LEVEL_TONE.info}>{r.text}</span>
            </p>
          ))}
        </div>
      )}
    </Card>
  );
}

const STATUS_TONE: Record<string, string> = {
  accepted: "bg-gray-100 text-gray-600", rejected: "bg-rose-50 text-rose-600", expired: "bg-amber-50 text-amber-600",
  pending: "bg-gray-800 text-white", sent: "bg-blue-50 text-blue-700",
};

function argText(a: Record<string, unknown> | null): string {
  if (!a) return "";
  if (typeof a.target === "string" && typeof a.on === "boolean") return `${a.target} ${a.on ? "ON" : "OFF"}`;
  if (typeof a.on === "boolean") return a.on ? "ON" : "OFF";
  if (a.value !== undefined && a.value !== null) return `${String(a.value)}`;
  return "";
}

export function CommandLog({ bundle, commands }: { bundle: Bundle | null; commands: CmdRow[] }) {
  return (
    <Card title="명령 기록">
      {!commands.length ? (
        <p className="py-5 text-center text-xs text-gray-300">명령 기록이 없습니다</p>
      ) : (
        <div className="space-y-1">
          {commands.map((c) => (
            <div key={c.id}>
              <p className="flex flex-wrap items-baseline gap-x-2 text-[11px] leading-snug">
                <span className="shrink-0 font-mono text-gray-300">{fmtKst(c.requestedAt)}</span>
                <span className="font-medium text-gray-800">{c.label ?? commandLabel(bundle, c.kind)}</span>
                {argText(c.args) && <span className="font-bold text-gray-700">{argText(c.args)}</span>}
                <span className="text-gray-400">{c.requestedBy}</span>
                <span className="text-gray-300">{c.origin === "web" ? (c.sentVia ? `${c.sentVia} × ${c.sendCount}` : "") : c.origin}</span>
                <span className={`ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_TONE[c.status] ?? "bg-gray-100 text-gray-500"}`}>
                  {CMD_STATUS[c.status] ?? c.status}
                </span>
              </p>
              {c.reasonCode && (
                <p className={`truncate pl-1 text-[10px] ${c.status === "rejected" ? "text-rose-500" : "text-amber-600"}`}
                  title={c.detail ?? undefined}>
                  {reasonLabel(bundle, c.reasonCode)} ({c.reasonCode})
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function dur(a: string | null, b: string | null): string {
  if (!a || !b) return "";
  const sec = Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 1000));
  return sec < 3600 ? `${Math.floor(sec / 60)}분 ${sec % 60}초` : `${Math.floor(sec / 3600)}시간 ${Math.floor((sec % 3600) / 60)}분`;
}

export function RunList({ bundle, runs }: { bundle: Bundle | null; runs: RunRow[] }) {
  return (
    <Card title="최근 공정">
      {!runs.length ? (
        <p className="py-5 text-center text-xs text-gray-300">기록된 공정이 없습니다</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-gray-400">
              <th className="py-1.5 pr-3 font-medium whitespace-nowrap">시작</th>
              <th className="py-1.5 pr-3 font-medium">이름</th>
              <th className="py-1.5 pr-3 font-medium whitespace-nowrap">결과</th>
              <th className="py-1.5 font-medium whitespace-nowrap text-right">소요</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.runId} className="border-t border-gray-50 align-top text-gray-600">
                <td className="py-2 pr-3 whitespace-nowrap tabular-nums">{fmtKst(r.startedAt)}</td>
                <td className="py-2 pr-3">
                  <span className="block max-w-[220px] truncate" title={r.runId}>{r.name ?? r.recipeName ?? "-"}</span>
                  {r.startedBy && <span className="text-[10px] text-gray-400">{r.startedBy}</span>}
                </td>
                <td className="py-2 pr-3">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                    !r.endedAt ? "bg-gray-800 text-white" : r.result === "done" ? "bg-gray-100 text-gray-500"
                    : r.result === "error" ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-600"}`}>
                    {!r.endedAt ? "진행 중" : RUN_RESULT[r.result ?? ""] ?? r.result ?? "-"}
                  </span>
                  {r.reasonCode && <p className="mt-0.5 text-[10px] text-gray-500">{reasonLabel(bundle, r.reasonCode)}</p>}
                </td>
                <td className="py-2 whitespace-nowrap text-right tabular-nums">{dur(r.startedAt, r.endedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
