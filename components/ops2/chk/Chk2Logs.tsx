"use client";

// 챔버K v2 아래 줄 — 로그(stream: 수준별 색), 조작 기록(commands), 런 이력(runs). v1 CHK 화면과 같은 이름(W-9).
// 로그 기본 보기 = 묶음 eventKinds 의 main + 경고·오류 전부 + 공정 시작·끝·명령 결과·설정 결과, '상세'를 켜면 전부와 원시 코드·문구.
// 한 줄 = 시각 · 종류 이름 · 한글 내용(text.logLine — 상태 바뀜·블록·공정 중 수정·명령 결과는 묶음 이름으로).
import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "./kit";
import { fmtKst } from "@/lib/ops2/time";
import { useChk2Mode } from "./mode";
import { logLine, runTitle } from "./text";
import { CMD_STATUS, RUN_RESULT, commandLabel, reasonLabel, type Bundle, type CmdRow, type RunRow } from "./types";
import type { FeedItem } from "./useChk2";

const LEVEL_TONE: Record<string, string> = {
  error: "text-rose-600", critical: "text-rose-700", warn: "text-amber-600", info: "text-gray-600",
};

export function EventFeed({ bundle, feed }: { bundle: Bundle | null; feed: FeedItem[] }) {
  const [onlyIssue, setOnlyIssue] = useState(false);
  const { detail } = useChk2Mode();
  const box = useRef<HTMLDivElement | null>(null);
  const stick = useRef(true);
  const rows = useMemo(() => feed.map((e) => ({ e, ...logLine(bundle, e) })), [bundle, feed]);   // state 마다 다시 그리지 않게
  const seen = detail ? rows : rows.filter((r) => r.main);
  const shown = onlyIssue ? seen.filter((r) => r.level !== "info") : seen;
  const issues = rows.filter((r) => r.level !== "info").length;
  const newest = feed[feed.length - 1]?.id;

  useEffect(() => {
    const el = box.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [newest, onlyIssue]);

  return (
    <Card title="로그" right={
      <button onClick={() => setOnlyIssue((v) => !v)}
        className={`rounded-lg px-2 py-1 text-[11px] font-semibold ${onlyIssue ? "bg-rose-50 text-rose-600" : "text-gray-400 hover:bg-gray-50"}`}>
        경고·오류{issues > 0 && ` ${issues}`}
      </button>
    }>
      {!shown.length ? (
        <p className="py-6 text-center text-xs text-gray-300">{onlyIssue ? "경고·오류가 없습니다" : "로그가 없습니다 — 장비가 연결되면 쌓입니다"}</p>
      ) : (
        <div ref={box}
          onScroll={() => { const el = box.current; if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24; }}
          className="h-64 space-y-1 overflow-y-auto rounded-lg bg-gray-50/60 p-2 font-mono [overflow-anchor:none]">
          {shown.map((r) => (
            <p key={r.e.id} className="flex gap-2 text-[11px] leading-snug" title={r.raw}>
              <span className="shrink-0 text-gray-300">{fmtKst(r.e.ts)}</span>
              <span className={`shrink-0 font-semibold ${LEVEL_TONE[r.level] ?? LEVEL_TONE.info}`}>{r.kind}</span>
              <span className={LEVEL_TONE[r.level] ?? LEVEL_TONE.info}>
                {r.text}
                {detail && <span className="ml-1.5 text-gray-400">{r.raw}</span>}
              </span>
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
  const { detail } = useChk2Mode();
  return (
    <Card title="조작 기록">
      {!commands.length ? (
        <p className="py-5 text-center text-xs text-gray-300">조작 기록이 없습니다</p>
      ) : (
        <div className="space-y-1">
          {commands.map((c) => (
            <div key={c.id}>
              <p className="flex flex-wrap items-baseline gap-x-2 text-[11px] leading-snug">
                <span className="shrink-0 font-mono text-gray-300">{fmtKst(c.requestedAt)}</span>
                <span className="font-medium text-gray-800">{c.label ?? commandLabel(bundle, c.kind)}</span>
                {argText(c.args) && <span className="font-bold text-gray-700">{argText(c.args)}</span>}
                <span className="text-gray-400">{c.requestedBy}</span>
                {detail && <span className="text-gray-300">{c.origin === "web" ? (c.sentVia ? `${c.sentVia} × ${c.sendCount}` : "") : c.origin}</span>}
                {!detail && c.origin !== "web" && <span className="text-gray-300">노트북</span>}
                <span className={`ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_TONE[c.status] ?? "bg-gray-100 text-gray-500"}`}>
                  {CMD_STATUS[c.status] ?? c.status}
                </span>
              </p>
              {c.reasonCode && (
                <p className={`truncate pl-1 text-[10px] ${c.status === "rejected" ? "text-rose-500" : "text-amber-600"}`}
                  title={c.detail ?? undefined}>
                  {reasonLabel(bundle, c.reasonCode)}{detail && ` (${c.reasonCode})`}
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
  const { detail } = useChk2Mode();
  return (
    <Card title="런 이력">
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
                  <span className="block max-w-[260px] truncate" title={`${r.name ?? ""} · ${r.runId}`}>{runTitle(r)}</span>
                  {r.startedBy && <span className="text-[10px] text-gray-400">{r.startedBy}</span>}
                  {detail && <span className="block font-mono text-[10px] text-gray-300">{r.name} · {r.runId}</span>}
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
