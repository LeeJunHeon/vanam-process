"use client";

// 챔버K v2 아래 줄 — 로그(stream: 수준별 색), 조작 기록(commands), 런 이력(runs). v1 CHK 화면과 같은 이름(W-9).
// 로그 기본 보기 = 묶음 eventKinds 의 main + 경고·오류 전부 + 공정 시작·끝·명령 결과·설정 결과, '상세'를 켜면 전부와 원시 코드·문구.
// 한 줄 = 시각 · 종류 이름(주의·오류는 아이콘 + 색) · 한글 내용(text.logLine — 상태 바뀜·블록·공정 중 수정·명령 결과는 묶음 이름으로).
// W-10a: 명령 상태·런 결과 배지와 사유 줄도 아이콘 + 글자(kit Tag) — 색만으로 뜻을 전하지 않는다. '경고·오류만' 단추는 켜짐 표시(체크).
// W-15(챔버K 로그 — EventFeed 는 챔버K 만 쓴다): 한 줄 = 시각 · 장비 이름 · 종류 · 내용(한 번만), 상세 보기면 끝에 코드만 작게.
//   마우스 설명은 종류의 뜻(묶음 19 eventKinds desc)이 있을 때만. 로그 칸은 화면 높이에 맞추고(fill), 맨 아래 따라가기는 그대로.
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertOctagon, AlertTriangle, CheckSquare, Hourglass, Send, Square } from "lucide-react";
import { FS, Card, Tag, type TagKind } from "./kit";
import { fmtKst } from "@/lib/ops2/time";
import { useChk2Mode } from "./mode";
import { logLine, runTitle, blockName } from "./text";
import { chkLines } from "./logView";
import { byWord, isCode } from "@/lib/ops2/chk/plain";
import { reasonTip } from "@/lib/ops2/chk/terms";
import { CMD_STATUS, RUN_RESULT, commandLabel, reasonLabel, type Bundle, type CmdRow, type RunRow } from "./types";
import type { FeedItem } from "./useChk2";

const LEVEL_TONE: Record<string, string> = {
  error: "text-[#B42318]", critical: "text-[#B42318]", warn: "text-[#B54708]", info: "text-[#5B6470]",
};

export function EventFeed({ bundle, feed, fill = false, plain = false, commands }: {
  bundle: Bundle | null; feed: FeedItem[]; fill?: boolean;
  plain?: boolean;          // W-16 챔버K — 평소 보기 글(코드·local 없음, 수동 조작 명령 결과에 조작 이름). 기본은 지금 동작
  commands?: CmdRow[];      // plain 일 때 수동 조작 명령의 조작 이름을 찾는 웹 조작 기록
}) {
  const [onlyIssue, setOnlyIssue] = useState(false);
  const { detail } = useChk2Mode();
  const box = useRef<HTMLDivElement | null>(null);
  const stick = useRef(true);
  const rows = useMemo(() => (plain ? chkLines(bundle, feed, commands) : feed.map((e) => ({ e, ...logLine(bundle, e) }))), [bundle, feed, plain, commands]);   // state 마다 다시 그리지 않게
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
      <button onClick={() => setOnlyIssue((v) => !v)} aria-pressed={onlyIssue}
        className={`flex items-center gap-1 rounded-lg px-2 py-1 ${FS.small} font-semibold ${onlyIssue ? "bg-[#FEE4E2] text-[#B42318]" : "text-[#5B6470] hover:bg-[#F5F6F8]"}`}>
        {onlyIssue ? <CheckSquare size={12} aria-hidden /> : <Square size={12} aria-hidden />} 경고·오류만{issues > 0 && ` ${issues}`}
      </button>
    }>
      {!shown.length ? (
        <p className={`py-6 text-center ${FS.body} text-[#8A929D]`}>{onlyIssue ? "경고·오류가 없습니다" : "로그가 없습니다. 장비가 연결되면 쌓입니다"}</p>
      ) : (
        <div ref={box}
          onScroll={() => { const el = box.current; if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24; }}
          className={`${fill ? "h-[calc(100vh-260px)] min-h-[320px]" : "h-64"} space-y-1 overflow-y-auto rounded-lg bg-[#F5F6F8] p-2 [overflow-anchor:none]`}>
          {shown.map((r) => (
            <p key={r.e.id} className={`flex gap-2 ${FS.small} leading-snug`} title={r.desc}>
              <span className="shrink-0 font-mono tabular-nums text-[#8A929D]">{fmtKst(r.e.ts)}</span>
              {(r.source || plain) && <span className="w-24 shrink-0 truncate text-[#5B6470]">{r.source ?? ""}</span>}
              <span className={`flex shrink-0 items-center gap-1 font-semibold ${LEVEL_TONE[r.level] ?? LEVEL_TONE.info}`}>
                {r.level === "warn" ? <AlertTriangle size={11} /> : r.level === "error" || r.level === "critical" ? <AlertOctagon size={11} /> : null}{r.kind}
              </span>
              <span className={`min-w-0 ${r.level === "info" ? "text-[#1B1F24]" : LEVEL_TONE[r.level] ?? LEVEL_TONE.info}`}>
                {r.text}
                {detail && <span className="ml-1.5 font-mono text-[11px] text-[#8A929D]">{r.code ?? r.raw}</span>}
              </span>
            </p>
          ))}
        </div>
      )}
    </Card>
  );
}

/** 명령 상태 → 배지(아이콘 + 글자) */
export function CmdStatusTag({ status, className }: { status: string; className?: string }) {
  const k: Record<string, [TagKind, typeof Send | undefined]> = {
    accepted: ["ok", undefined], rejected: ["alarm", undefined], expired: ["warn", Hourglass], pending: ["wait", undefined],
    sent: ["info", Send],
  };
  const [kind, icon] = k[status] ?? ["unknown", undefined];
  return <Tag kind={kind} icon={icon} className={className}>{CMD_STATUS[status] ?? status}</Tag>;
}

/** 런 결과 → 배지(진행 중·정상·중단·오류) */
export function RunResultTag({ endedAt, result }: { endedAt: string | null; result: string | null }) {
  const kind: TagKind = !endedAt ? "run" : result === "done" ? "ok" : result === "error" ? "alarm" : "warn";
  return <Tag kind={kind}>{!endedAt ? "진행 중" : RUN_RESULT[result ?? ""] ?? result ?? "-"}</Tag>;
}

function argText(a: Record<string, unknown> | null): string {
  if (!a) return "";
  if (typeof a.target === "string" && typeof a.on === "boolean") return `${a.target} ${a.on ? "ON" : "OFF"}`;
  if (typeof a.on === "boolean") return a.on ? "ON" : "OFF";
  if (a.value !== undefined && a.value !== null) return `${String(a.value)}`;
  return "";
}

/** 조작 인자 — 평소 보기 글(W-16 plain): PLC 버튼 이름·켜기/끄기, 수동 조작은 조작 이름 */
function argPlain(bundle: Bundle | null, kind: string, a: Record<string, unknown> | null): string {
  if (!a) return "";
  const on = typeof a.on === "boolean" ? (a.on ? "켜기" : "끄기") : "";
  if (typeof a.target === "string") {
    const b = bundle?.plcButtons?.find((x) => x.target === a.target);
    return `${b?.label ?? ""} ${on}`.trim();
  }
  if (kind === "MANUAL_BLOCK" && a.block && typeof a.block === "object" && typeof (a.block as Record<string, unknown>).type === "string") {
    const n = blockName(bundle, (a.block as Record<string, string>).type);
    return isCode(n) ? "" : n;
  }
  if (on) return on;
  if (a.value !== undefined && a.value !== null) return `${String(a.value)}`;
  return "";
}

export function CommandLog({ bundle, commands, plain = false }: {
  bundle: Bundle | null; commands: CmdRow[];
  plain?: boolean;          // W-16 챔버K — 코드·영문(ON/OFF·local) 없이. 기본은 지금 동작
}) {
  const { detail } = useChk2Mode();
  return (
    <Card title="조작 기록">
      {!commands.length ? (
        <p className={`py-5 text-center ${FS.body} text-[#8A929D]`}>조작 기록이 없습니다</p>
      ) : (
        <div className="space-y-1">
          {commands.map((c) => (
            <div key={c.id}>
              <p className={`flex flex-wrap items-baseline gap-x-2 ${FS.small} leading-snug`}>
                <span className="shrink-0 font-mono text-[#8A929D]">{fmtKst(c.requestedAt)}</span>
                <span className="font-medium text-[#1B1F24]">{plain && isCode(c.label ?? commandLabel(bundle, c.kind)) ? "명령" : c.label ?? commandLabel(bundle, c.kind)}</span>
                {(plain ? argPlain(bundle, c.kind, c.args) : argText(c.args)) && <span className="font-bold text-[#1B1F24]">{plain ? argPlain(bundle, c.kind, c.args) : argText(c.args)}</span>}
                <span className="text-[#5B6470]">{plain ? byWord(c.requestedBy) : c.requestedBy}</span>
                {detail && <span className="text-[#8A929D]">{c.origin === "web" ? (c.sentVia ? `${c.sentVia} × ${c.sendCount}` : "") : c.origin}</span>}
                {!detail && c.origin !== "web" && !(plain && byWord(c.requestedBy) === "노트북") && <span className="text-[#8A929D]">노트북</span>}
                <CmdStatusTag status={c.status} className="ml-auto shrink-0" />
              </p>
              {c.reasonCode && (
                <p className={`flex items-center gap-1 truncate pl-1 ${FS.small} ${c.status === "rejected" ? "text-[#B42318]" : "text-[#B54708]"}`}
                  title={plain ? reasonTip(bundle, c.reasonCode, detail) ?? (detail ? c.detail ?? undefined : undefined) : c.detail ?? undefined}>
                  {c.status === "rejected" ? <AlertOctagon size={10} className="shrink-0" aria-label="거부" /> : <AlertTriangle size={10} className="shrink-0" aria-label="주의" />}
                  <span className="truncate">{plain && reasonLabel(bundle, c.reasonCode) === c.reasonCode ? "장비가 받지 않음" : reasonLabel(bundle, c.reasonCode)}{detail && ` (${c.reasonCode})`}</span>
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

export function RunList({ bundle, runs, plain = false }: {
  bundle: Bundle | null; runs: RunRow[];
  plain?: boolean;          // W-16 챔버K — 시작한 사람 local → 노트북, 이름 없는 사유 코드는 숨김(상세에서만). 기본은 지금 동작
}) {
  const { detail } = useChk2Mode();
  return (
    <Card title={plain ? "공정 이력" : "런 이력"}>
      {!runs.length ? (
        <p className={`py-5 text-center ${FS.body} text-[#8A929D]`}>기록된 공정이 없습니다</p>
      ) : (
        <table className={`w-full ${FS.body}`}>
          <thead>
            <tr className="text-left text-[#5B6470]">
              <th className="py-1.5 pr-3 font-medium whitespace-nowrap">시작</th>
              <th className="py-1.5 pr-3 font-medium">이름</th>
              <th className="py-1.5 pr-3 font-medium whitespace-nowrap">결과</th>
              <th className="py-1.5 font-medium whitespace-nowrap text-right">소요</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.runId} className="border-t border-[#E3E6EA] align-top text-[#5B6470]">
                <td className="py-2 pr-3 whitespace-nowrap tabular-nums">{fmtKst(r.startedAt)}</td>
                <td className="py-2 pr-3">
                  <span className="block max-w-[260px] truncate" title={`${r.name ?? ""} · ${r.runId}`}>{runTitle(r)}</span>
                  {r.startedBy && <span className={`${FS.small} text-[#5B6470]`}>{plain ? byWord(r.startedBy) : r.startedBy}</span>}
                  {detail && <span className={`block font-mono ${FS.small} text-[#8A929D]`}>{r.name} · {r.runId}</span>}
                </td>
                <td className="py-2 pr-3">
                  <RunResultTag endedAt={r.endedAt} result={r.result} />
                  {r.reasonCode && !(plain && !detail && reasonLabel(bundle, r.reasonCode) === r.reasonCode) && (
                    <p className={`mt-0.5 ${FS.small} text-[#5B6470]`} title={plain ? reasonTip(bundle, r.reasonCode, detail) : undefined}>{reasonLabel(bundle, r.reasonCode)}</p>
                  )}
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
