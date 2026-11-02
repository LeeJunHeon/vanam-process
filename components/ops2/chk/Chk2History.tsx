"use client";

// 챔버K v2 공정 기록 — 목록(/api/ops2/[equipment]/runs: 날짜 범위·결과로 거르기, 더 보기)과 상세(/runs/[runId]):
// 시작·끝·결과·사유·설정 버전, 레시피 params·블록(ops2_run.blocks — 펼친 단계 미리보기 모양, 스텝은 사건 표에),
// 그 run 의 사건(수준 색·사유 라벨·시각, 경고·오류만 보기), 그 시간대 명령, 1분 요약 그래프(필드 고르기 — 묶음 snapshot 정의).
// W-9: 이름은 text.runTitle("UI 검토 1 · 1/2행 · Ti 증착"), 레시피 값은 열 label·단위, 그래프 값은 장비별로 묶어 접기(detail 필드는
// '상세'), 사건은 로그와 같은 규칙(text.logLine), run id·instance·원래 이름·원시 코드는 '상세'에서만.
// W-10: 원래 순서(run_start 블록 — 판 1)와 실제 실행된 순서(run_end summary.executed — 건너뜀·멈춘 시간·판)를 나란히,
//   판 목록(시작 + 순서 고침 사건 — 누가·언제·무엇을).
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronRight, History, RefreshCw } from "lucide-react";
import { useChk2Mode } from "./mode";
import { colLabel, logLine, runTitle } from "./text";
import { fmtKst } from "@/lib/ops2/time";
import type { ExpBlock } from "@/lib/ops2/chk/blocks";
import { Card } from "./kit";
import { ExpandedView, fmtSec } from "./Chk2BlockEditor";
import Chk2SummaryChart, { type PickField, type SummaryRow } from "./Chk2SummaryChart";
import { CMD_STATUS, RUN_RESULT, commandLabel, reasonLabel, type Bundle, type RunSummary } from "./types";
import { blockName, fmtDur } from "./text";
import { Chip } from "./kit";

type RunItem = {
  runId: string; name: string | null; recipeName: string | null; startedBy: string | null; stepNo: number | null;
  startedAt: string | null; endedAt: string | null; result: string | null; reasonCode: string | null;
  configVersion: number | null; durationS: number | null;
  noStart?: boolean;                             // run_start 가 오지 않은 run(끝 시각으로 정렬)
};
type RunFull = RunItem & { instance: string; params: Record<string, unknown> | null; blocks: unknown; summary: unknown };
type EventRow = {
  msgId: string; ts: string; level: string; code: string; ruleId: string | null; message: string; kind: string | null;
  source: string | null; context: unknown;
};
type CmdRow = {
  id: string; origin: string; kind: string; label: string | null; requestedBy: string; requestedAt: string; status: string;
  sentVia: string | null; resultReceivedAt: string | null; reasonCode: string | null; detail: string | null;
};
type Detail = {
  fetchedAt: number;                             // 읽은 시각 — 진행 중 공정의 그래프 끝
  run: RunFull; events: EventRow[]; summaries: SummaryRow[]; commands: CmdRow[];
  truncated: { events: boolean; summaries: boolean; commands: boolean }; limits: { events: number; summaries: number; commands: number };
};

const LEVEL_TONE: Record<string, string> = {
  error: "bg-[#FEE4E2] text-[#B42318]", critical: "bg-[#FEE4E2] text-[#B42318]", warn: "bg-[#FFFAEB] text-[#B54708]", info: "bg-[#EEF0F3] text-[#5B6470]",
};
const RESULT_TEXT: Record<string, string> = { done: "끝", skipped: "건너뜀", aborted: "중단", error: "오류", failed: "실패" };
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const kstToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());

function ResultBadge({ r }: { r: Pick<RunItem, "endedAt" | "result"> }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
      !r.endedAt ? "bg-[#3A424D] text-white" : r.result === "done" ? "bg-[#F5F6F8] text-[#5B6470]"
      : r.result === "error" ? "bg-[#FEE4E2] text-[#B42318]" : "bg-[#FFFAEB] text-[#B54708]"}`}>
      {!r.endedAt ? "진행 중" : RUN_RESULT[r.result ?? ""] ?? r.result ?? "-"}
    </span>
  );
}

/** 묶음 snapshot 정의 → 그래프에 쓸 수 있는 숫자 필드(이름은 "MFC · 챔버 압력") */
function numericFields(b: Bundle | null): (PickField & { detail?: boolean; blockLabel: string })[] {
  return (b?.snapshot?.blocks ?? []).flatMap((bl) => bl.fields
    .filter((f) => (f.type === "float" || f.type === "int") && f.summary !== "any")
    .map((f) => ({ ...f, block: bl.name, blockLabel: bl.label, label: `${bl.label} · ${f.label}` })));
}

/** 레시피 값(params) — 열 label·단위로, 값 없는·0 인 것은 숨김 */
function paramsText(b: Bundle | null, params: Record<string, unknown>): string[] {
  const cols = b?.recipe?.processColumns ?? [];
  return Object.entries(params)
    .filter(([k, v]) => v !== null && v !== "" && v !== false && v !== 0 && k !== "process_name" && typeof v !== "object")
    .map(([k, v]) => {
      const c = cols.find((x) => x.name === k);
      if (v === true) return c ? colLabel(c) : k;
      return `${c ? colLabel(c) : k} ${String(v)}${c?.unit ? ` ${c.unit}` : ""}`;
    });
}

/** 기본 필드 — 그 공정이 쓴 장비의 주요 값(params·블록에서) */
function defaultColumns(run: RunFull): string[] {
  const p = run.params ?? {};
  const types = Array.isArray(run.blocks) ? run.blocks.map((b) => (isObj(b) ? b.type : null)) : [];
  const pos = (k: string) => typeof p[k] === "number" && (p[k] as number) > 0;
  return [
    "mfc.pressure_mtorr",
    p.use_ar_gas === true && "mfc.ar_sccm", p.use_o2_gas === true && "mfc.o2_sccm",
    pos("dc_power") && "dc.p", pos("rf_power") && "rf.fwd_w", p.use_rf_pulse === true && "rfp.fwd_w",
    (p.use_heater === true || types.includes("heater_ramp")) && "heater.pv",
    types.includes("base_wait") && "ig.ion_torr",
  ].filter((c): c is string => !!c);
}

function RunDetail({ equipment, runId, bundle, onBack }: { equipment: string; runId: string; bundle: Bundle | null; onBack: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [onlyIssue, setOnlyIssue] = useState(false);
  const [cols, setCols] = useState<string[] | null>(null);
  const [openBlk, setOpenBlk] = useState<Record<string, boolean>>({});
  const { detail } = useChk2Mode();
  const load = useCallback(async () => {
    const r = await fetch(`/api/ops2/${encodeURIComponent(equipment)}/runs/${encodeURIComponent(runId)}`, { cache: "no-store" }).catch(() => null);
    if (!r?.ok) return setErr(r ? `공정 기록을 읽지 못했습니다(${r.status})` : "웹 서버에 닿지 않습니다");
    setErr(null);
    setD({ ...(await r.json()), fetchedAt: Date.now() });
  }, [equipment, runId]);
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const all = useMemo(() => numericFields(bundle), [bundle]);
  const picked = cols ?? (d ? defaultColumns(d.run) : []);
  const fields: PickField[] = picked.flatMap((c) => { const f = all.find((x) => x.column === c); return f ? [f] : []; });
  const exp: ExpBlock[] = useMemo(() => (Array.isArray(d?.run.blocks) ? d.run.blocks.filter(isObj).map((b) => ({
    no: String(b.no ?? ""), type: String(b.type ?? ""), label: String(b.label ?? ""), stage: String(b.stage ?? ""),
    iter: String(b.no ?? "").includes("#") ? String(b.no).slice(String(b.no).indexOf("#") + 1) : null, auto: b.auto === true,
    params: isObj(b.params) ? b.params : {}, steps: [],
  })) : []), [d]);

  if (err) return <div className="space-y-2"><Back onBack={onBack} /><p className="text-xs text-[#B42318]">{err}</p></div>;
  if (!d) return <div className="space-y-2"><Back onBack={onBack} /><p className="text-xs text-[#5B6470]">읽는 중…</p></div>;
  const r = d.run;
  const summary = isObj(r.summary) ? r.summary as RunSummary : null;
  const executed = Array.isArray(summary?.executed) ? summary.executed : [];
  const edits = d.events.flatMap((e) => {
    const c = isObj(e.context) ? e.context : null;
    const x = c && isObj(c.data) ? c.data : null;
    if (c?.kind !== "edit" || !x) return [];
    return [{ id: e.msgId, ts: e.ts, rev: typeof x.revision === "number" ? x.revision : "?", by: String(x.by ?? x.source ?? "-"),
              what: String(x.summary ?? "순서 고침") }];
  });
  const lines = d.events.map((e) => ({ e, ...logLine(bundle, { type: "event", data: { level: e.level, code: e.code, ruleId: e.ruleId, message: e.message, context: e.context } }) }));
  const seenEv = detail ? lines : lines.filter((x) => x.main);
  const events = onlyIssue ? seenEv.filter((x) => x.level !== "info") : seenEv;
  const issues = lines.filter((x) => x.level !== "info").length;
  const t0 = r.startedAt ? Date.parse(r.startedAt) : d.summaries[0] ? Date.parse(d.summaries[0].fromTs) : d.fetchedAt;
  const t1 = r.endedAt ? Date.parse(r.endedAt) : d.fetchedAt;
  const params = Object.entries(r.params ?? {}).filter(([, v]) => v !== null && v !== "" && v !== false);
  const pText = paramsText(bundle, r.params ?? {});
  const pickable = all.filter((f) => detail || !f.detail);
  const byBlock = [...new Set(pickable.map((f) => f.block))].map((blk) => ({ blk, label: pickable.find((f) => f.block === blk)?.blockLabel ?? blk,
    fields: pickable.filter((f) => f.block === blk) }));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Back onBack={onBack} />
        <b className="text-sm text-[#1B1F24]">{runTitle(r)}</b>
        {detail && <span className="font-mono text-[10px] text-[#5B6470]">{r.name}</span>}
        <ResultBadge r={r} />
        {r.reasonCode && <span className="text-xs text-[#5B6470]">{reasonLabel(bundle, r.reasonCode)}{detail && <span className="ml-1 font-mono text-[10px] text-[#5B6470]">{r.reasonCode}</span>}</span>}
        <button onClick={() => void load()} className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-[#5B6470] hover:bg-[#F5F6F8]">
          <RefreshCw size={12} /> 다시 읽기
        </button>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] sm:grid-cols-4">
        {[["시작", r.startedAt ? fmtKst(r.startedAt) : "시작 기록 없음"], ["끝", fmtKst(r.endedAt)], ["소요", r.startedAt && r.endedAt ? fmtSec((Date.parse(r.endedAt) - Date.parse(r.startedAt)) / 1000) : "-"],
          ["누가", r.startedBy ?? "-"], ["행 번호", r.stepNo ?? "-"], ["설정 버전", r.configVersion ?? "-"],
          ...(detail ? [["run id", r.runId], ["실행(instance)", r.instance]] : [])].map(([k, v]) => (
          <div key={String(k)} className="min-w-0"><dt className="text-[#5B6470]">{k}</dt><dd className="truncate font-semibold text-[#1B1F24]" title={String(v)}>{String(v)}</dd></div>
        ))}
      </dl>

      <section>
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <h4 className="text-xs font-bold text-[#1B1F24]">1분 요약 그래프</h4>
          <span className="text-[11px] text-[#5B6470]">1분 요약 그래프(평균·최대) — 옅은 구간은 값 품질이 낮을 때</span>
          {cols && <button onClick={() => setCols(null)} className="ml-auto px-1.5 text-[10px] text-[#5B6470] underline">기본으로</button>}
        </div>
        <div className="mb-1.5 flex flex-wrap items-start gap-1.5">
          {byBlock.map((g) => {
            const on = g.fields.filter((f) => picked.includes(f.column)).length;
            const o = openBlk[g.blk] ?? false;
            return (
              <div key={g.blk} className={`rounded-lg border ${o ? "w-full border-[#D9DDE3] p-1.5" : "border-[#E3E6EA]"}`}>
                <button onClick={() => setOpenBlk((m) => ({ ...m, [g.blk]: !o }))}
                  className={`flex items-center gap-0.5 px-1.5 py-0.5 text-[11px] font-semibold ${on ? "text-[#1D4ED8]" : "text-[#5B6470]"}`}>
                  {o ? <ChevronDown size={12} /> : <ChevronRight size={12} />} {g.label}{on > 0 && ` (${on})`}
                </button>
                {o && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {g.fields.map((f) => {
                      const sel = picked.includes(f.column);
                      return (
                        <button key={f.column} onClick={() => setCols(sel ? picked.filter((c) => c !== f.column) : [...picked, f.column])}
                          title={detail ? `${f.column} · ${f.summary ?? "mean"}` : f.desc || undefined}
                          className={`rounded-md border px-1.5 py-0.5 text-[10px] ${sel ? "border-[#C7D5FB] bg-[#E8EEFC] font-semibold text-[#1D4ED8]" : "border-[#D9DDE3] text-[#5B6470] hover:bg-[#F5F6F8]"}`}>
                          {f.label.split(" · ").pop()}{f.unit && ` ${f.unit}`}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <Chk2SummaryChart rows={d.summaries} fields={fields} t0={t0} t1={t1} />
        {d.truncated.summaries && <p className="text-[10px] text-[#B54708]">요약은 앞에서부터 {d.limits.summaries}개(24시간분)까지만</p>}
      </section>

      <div className="grid gap-3 xl:grid-cols-2">
        <section>
          <h4 className="mb-1 text-xs font-bold text-[#1B1F24]">레시피 값</h4>
          {pText.length ? <p className="text-[11px] leading-relaxed text-[#1B1F24]">{pText.join(" · ")}</p>
            : <p className="text-[11px] text-[#5B6470]">{exp.length ? "블록 행 — 아래 블록 기록" : "없음"}</p>}
          {detail && params.length > 0 && (
            <p className="mt-1 text-[10px] leading-relaxed text-[#5B6470]">
              {params.map(([k, v]) => <span key={k} className="mr-2 inline-block font-mono">{k} {typeof v === "object" ? JSON.stringify(v) : String(v)}</span>)}
            </p>
          )}
          <div className="mt-2 grid gap-3 2xl:grid-cols-2">
            <div className="min-w-0">
              <h4 className="mb-1 text-xs font-bold text-[#1B1F24]">원래 순서(판 1 · {exp.length}개)</h4>
              {exp.length ? <div className="max-h-96 overflow-y-auto rounded-[10px] bg-[#F5F6F8] p-2"><ExpandedView exp={exp} bundle={bundle} showParams /></div>
                : <p className="text-[11px] text-[#5B6470]">블록 기록 없음</p>}
            </div>
            <div className="min-w-0">
              <h4 className="mb-1 text-xs font-bold text-[#1B1F24]">실제 실행{executed.length ? `(${executed.length}개)` : ""}</h4>
              {executed.length ? (
                <ol className="max-h-96 space-y-1 overflow-y-auto rounded-[10px] bg-[#F5F6F8] p-2">
                  {executed.map((x, i) => (
                    <li key={`${x.no}-${i}`} className="flex flex-wrap items-baseline gap-1.5 rounded-[8px] bg-white px-2 py-1 text-[11px]">
                      <span className="font-mono text-[10px] text-[#5B6470]">{x.no}</span>
                      <b className="text-[#1B1F24]">{x.type === "delay" ? "딜레이 행" : blockName(bundle, x.type)}{x.label && x.label !== blockName(bundle, x.type) ? ` · ${x.label}` : ""}</b>
                      {x.result === "skipped" ? <Chip tone="warn">건너뜀</Chip> : x.result !== "done" ? <Chip tone="alarm">{RESULT_TEXT[x.result] ?? x.result}</Chip> : null}
                      {(x.pausedSec ?? 0) > 0 && <Chip tone="warn">멈춤 {fmtDur(x.pausedSec ?? 0)}</Chip>}
                      {(x.revision ?? 1) > 1 && <Chip>판 {x.revision}</Chip>}
                      <span className="ml-auto tabular-nums text-[#5B6470]">{typeof x.start === "number" && typeof x.end === "number" ? fmtDur(x.end - x.start) : ""}</span>
                    </li>
                  ))}
                </ol>
              ) : <p className="text-[11px] text-[#5B6470]">{r.endedAt ? "실행 기록 없음(장비 정의 13 이전 공정)" : "공정이 끝나면 실행된 순서가 남습니다"}</p>}
              {summary && (
                <p className="mt-1 text-[11px] text-[#5B6470]">
                  마지막 판 {summary.revision ?? 1} · 건너뜀 {summary.skips ?? 0}번 · 일시정지 {summary.pauses ?? 0}번
                  {(summary.pausedSec ?? 0) > 0 && ` · 멈춘 시간 ${fmtDur(summary.pausedSec ?? 0)}`}
                </p>
              )}
            </div>
          </div>
          <h4 className="mb-1 mt-3 text-xs font-bold text-[#1B1F24]">판 목록</h4>
          <ol className="space-y-0.5 text-[11px] text-[#1B1F24]">
            <li><Chip>판 1</Chip> <span className="text-[#5B6470]">{r.startedAt ? fmtKst(r.startedAt) : "-"}</span> · 시작 · {r.startedBy ?? "-"}</li>
            {edits.map((e) => (
              <li key={e.id}><Chip>판 {e.rev}</Chip> <span className="text-[#5B6470]">{fmtKst(e.ts)}</span> · 순서 고침 · {e.by} — {e.what}</li>
            ))}
          </ol>
        </section>
        <section>
          <div className="mb-1 flex items-center gap-2">
            <h4 className="text-xs font-bold text-[#1B1F24]">로그 {seenEv.length}{d.truncated.events && `(앞 ${d.limits.events}개까지)`}</h4>
            <button onClick={() => setOnlyIssue((v) => !v)}
              className={`rounded-lg px-2 py-0.5 text-[11px] font-semibold ${onlyIssue ? "bg-[#FEE4E2] text-[#B42318]" : "text-[#5B6470] hover:bg-[#F5F6F8]"}`}>
              경고·오류만 {issues}
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto rounded-[10px] border border-[#E3E6EA]">
            <table className="w-full text-[11px]">
              <tbody>
                {events.map(({ e, kind, text, raw, level }) => (
                  <tr key={e.msgId} className="border-t border-[#E3E6EA] align-top" title={raw}>
                    <td className="whitespace-nowrap px-1.5 py-1 tabular-nums text-[#5B6470]">{fmtKst(e.ts).slice(6)}</td>
                    <td className="px-1 py-1"><span className={`whitespace-nowrap rounded px-1 text-[10px] font-semibold ${LEVEL_TONE[level] ?? LEVEL_TONE.info}`}>{kind}</span></td>
                    <td className="px-1.5 py-1 text-[#1B1F24]">
                      {text}
                      {detail && <span className="ml-1 font-mono text-[10px] text-[#8A929D]">{raw}</span>}
                    </td>
                  </tr>
                ))}
                {!events.length && <tr><td className="p-3 text-center text-[#5B6470]">로그 없음</td></tr>}
              </tbody>
            </table>
          </div>
          <h4 className="mb-1 mt-2 text-xs font-bold text-[#1B1F24]">그 시간대 명령 {d.commands.length}{d.truncated.commands && `(앞 ${d.limits.commands}개까지)`}</h4>
          <div className="max-h-60 overflow-y-auto rounded-[10px] border border-[#E3E6EA]">
            <table className="w-full text-[11px]">
              <tbody>
                {d.commands.map((c) => (
                  <tr key={c.id} className="border-t border-[#E3E6EA] align-top">
                    <td className="whitespace-nowrap px-1.5 py-1 tabular-nums text-[#5B6470]">{fmtKst(c.requestedAt).slice(6)}</td>
                    <td className="px-1.5 py-1 text-[#1B1F24]">{c.label ?? commandLabel(bundle, c.kind)} <span className="text-[#5B6470]">({c.requestedBy}{detail ? `, ${c.origin}` : ""})</span></td>
                    <td className="whitespace-nowrap px-1.5 py-1">
                      <span className={c.status === "accepted" ? "text-[#5B6470]" : c.status === "rejected" ? "text-[#B42318]" : "text-[#5B6470]"}>
                        {CMD_STATUS[c.status] ?? c.status}
                      </span>
                      {c.reasonCode && <span className="block text-[10px] text-[#5B6470]">{reasonLabel(bundle, c.reasonCode)}{c.detail ? ` — ${c.detail}` : ""}</span>}
                    </td>
                  </tr>
                ))}
                {!d.commands.length && <tr><td className="p-3 text-center text-[#5B6470]">명령 없음</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

const Back = ({ onBack }: { onBack: () => void }) => (
  <button onClick={onBack} className="flex items-center gap-1 rounded-lg px-1.5 py-1 text-xs font-semibold text-[#5B6470] hover:bg-[#EEF0F3]">
    <ArrowLeft size={14} /> 목록
  </button>
);

/** 장비 화면이 1초마다 다시 그려도(시계·state) 이 부분은 props(장비·묶음·마지막 공정)가 바뀔 때만 */
export default memo(function Chk2History({ equipment, bundle, refreshKey }: { equipment: string; bundle: Bundle | null; refreshKey: string }) {
  const { detail } = useChk2Mode();
  const [from, setFrom] = useState(() => {
    const t = new Date(Date.parse(`${kstToday()}T00:00:00+09:00`) - 6 * 86_400_000);
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(t);
  });
  const [to, setTo] = useState(kstToday);
  const [result, setResult] = useState("");
  const [list, setList] = useState<RunItem[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const fetchPage = useCallback(async (cursor: string | null) => {
    const q = new URLSearchParams({ limit: "20" });
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    if (result) q.set("result", result);
    if (cursor) q.set("cursor", cursor);
    const r = await fetch(`/api/ops2/${encodeURIComponent(equipment)}/runs?${q}`, { cache: "no-store" }).catch(() => null);
    if (!r?.ok) {
      setErr(r ? `공정 기록을 읽지 못했습니다(${r.status})` : "웹 서버에 닿지 않습니다");
      return;
    }
    const b = await r.json();
    setErr(null);
    setList((l) => (cursor ? [...(l ?? []), ...b.runs] : b.runs));
    setNext(b.next);
  }, [equipment, from, to, result]);

  useEffect(() => {
    const t = setTimeout(() => void fetchPage(null), 0);
    return () => clearTimeout(t);
  }, [fetchPage, refreshKey]);

  return (
    <Card title={<><History size={15} /> 공정 기록</>}>
      {open ? <RunDetail equipment={equipment} runId={open} bundle={bundle} onBack={() => setOpen(null)} /> : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#5B6470]">
            <label className="flex items-center gap-1">시작일(KST)
              <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)}
                className="rounded-md border border-[#D9DDE3] px-1.5 py-0.5 text-[11px]" />
            </label>
            <label className="flex items-center gap-1">~
              <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)}
                className="rounded-md border border-[#D9DDE3] px-1.5 py-0.5 text-[11px]" />
            </label>
            <label className="flex items-center gap-1">결과
              <select value={result} onChange={(e) => setResult(e.target.value)} className="rounded-md border border-[#D9DDE3] px-1 py-0.5 text-[11px]">
                <option value="">전체</option>
                <option value="done">정상</option>
                <option value="aborted">중단</option>
                <option value="error">오류</option>
                <option value="running">진행 중</option>
              </select>
            </label>
            <span className="text-[#5B6470]">장비 {equipment}</span>
            <button onClick={() => void fetchPage(null)} className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-[#F5F6F8]">
              <RefreshCw size={12} /> 다시 읽기
            </button>
          </div>
          {err && <p className="text-xs text-[#B42318]">{err}</p>}
          <div className="overflow-x-auto rounded-[10px] border border-[#E3E6EA]">
            <table className="min-w-full text-xs">
              <thead className="bg-[#F5F6F8] text-[11px] text-[#5B6470]">
                <tr>
                  {["시작", "끝", "이름 / 레시피", "누가", "결과", "사유", "소요"].map((h) => (
                    <th key={h} className={`px-2 py-1.5 font-semibold ${h === "소요" ? "text-right" : "text-left"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(list ?? []).map((r) => (
                  <tr key={r.runId} onClick={() => setOpen(r.runId)} className="cursor-pointer border-t border-[#E3E6EA] hover:bg-[#E8EEFC]/40">
                    <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-[#5B6470]">
                      {r.startedAt ? fmtKst(r.startedAt) : <span className="rounded bg-[#EEF0F3] px-1 text-[10px] text-[#5B6470]">시작 기록 없음</span>}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-[#5B6470]">{fmtKst(r.endedAt)}</td>
                    <td className="px-2 py-1.5">
                      <span className="font-semibold text-[#1B1F24]">{runTitle(r)}</span>
                      {detail && <span className="block font-mono text-[10px] text-[#5B6470]">{r.name} · {r.runId}</span>}
                    </td>
                    <td className="px-2 py-1.5 text-[#5B6470]">{r.startedBy ?? "-"}</td>
                    <td className="px-2 py-1.5"><ResultBadge r={r} /></td>
                    <td className="px-2 py-1.5 text-[11px] text-[#5B6470]">{r.reasonCode ? reasonLabel(bundle, r.reasonCode) : ""}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-[#5B6470]">{r.durationS !== null ? fmtSec(r.durationS) : "-"}</td>
                  </tr>
                ))}
                {list !== null && !list.length && <tr><td colSpan={7} className="p-3 text-center text-[#5B6470]">이 기간·조건의 공정 기록이 없습니다</td></tr>}
                {list === null && <tr><td colSpan={7} className="p-3 text-center text-[#5B6470]">읽는 중…</td></tr>}
              </tbody>
            </table>
          </div>
          {next && (
            <button onClick={() => void fetchPage(next)} className="w-full rounded-[10px] border border-[#D9DDE3] py-1.5 text-xs font-semibold text-[#5B6470] hover:bg-[#F5F6F8]">
              더 보기
            </button>
          )}
        </div>
      )}
    </Card>
  );
});
