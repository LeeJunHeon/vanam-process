"use client";

// 챔버K v2 공정 기록 — 목록(/api/ops2/[equipment]/runs: 날짜 범위·결과로 거르기, 더 보기)과 상세(/runs/[runId]):
// 시작·끝·결과·사유·설정 버전, 레시피 params·블록(ops2_run.blocks — 펼친 단계 미리보기 모양, 스텝은 사건 표에),
// 그 run 의 사건(수준 색·사유 라벨·시각, 경고·오류만 보기), 그 시간대 명령, 1분 요약 그래프(필드 고르기 — 묶음 snapshot 정의).
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, History, RefreshCw } from "lucide-react";
import { fmtKst } from "@/lib/ops2/time";
import type { ExpBlock } from "@/lib/ops2/chk/blocks";
import { Card } from "./kit";
import { ExpandedView, fmtSec } from "./Chk2BlockEditor";
import Chk2SummaryChart, { type PickField, type SummaryRow } from "./Chk2SummaryChart";
import { CMD_STATUS, RUN_RESULT, adjustText, commandLabel, reasonLabel, type Bundle } from "./types";

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
  error: "bg-rose-50 text-rose-700", critical: "bg-rose-100 text-rose-800", warn: "bg-amber-50 text-amber-700", info: "bg-gray-100 text-gray-500",
};
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const kstToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());

function ResultBadge({ r }: { r: Pick<RunItem, "endedAt" | "result"> }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
      !r.endedAt ? "bg-gray-800 text-white" : r.result === "done" ? "bg-emerald-50 text-emerald-700"
      : r.result === "error" ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-700"}`}>
      {!r.endedAt ? "진행 중" : RUN_RESULT[r.result ?? ""] ?? r.result ?? "-"}
    </span>
  );
}

/** 묶음 snapshot 정의 → 그래프에 쓸 수 있는 숫자 필드 */
function numericFields(b: Bundle | null): PickField[] {
  return (b?.snapshot?.blocks ?? []).flatMap((bl) => bl.fields
    .filter((f) => (f.type === "float" || f.type === "int") && f.summary !== "any")
    .map((f) => ({ ...f, block: bl.name, label: `${bl.label} ${f.label}` })));
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
  const fields = picked.map((c) => all.find((f) => f.column === c)).filter((f): f is PickField => !!f);
  const exp: ExpBlock[] = useMemo(() => (Array.isArray(d?.run.blocks) ? d.run.blocks.filter(isObj).map((b) => ({
    no: String(b.no ?? ""), type: String(b.type ?? ""), label: String(b.label ?? ""), stage: String(b.stage ?? ""),
    iter: String(b.no ?? "").includes("#") ? String(b.no).slice(String(b.no).indexOf("#") + 1) : null, auto: b.auto === true,
    params: isObj(b.params) ? b.params : {}, steps: [],
  })) : []), [d]);

  if (err) return <div className="space-y-2"><Back onBack={onBack} /><p className="text-xs text-rose-600">{err}</p></div>;
  if (!d) return <div className="space-y-2"><Back onBack={onBack} /><p className="text-xs text-gray-400">읽는 중…</p></div>;
  const r = d.run;
  const events = onlyIssue ? d.events.filter((e) => e.level !== "info") : d.events;
  const issues = d.events.filter((e) => e.level !== "info").length;
  const t0 = r.startedAt ? Date.parse(r.startedAt) : d.summaries[0] ? Date.parse(d.summaries[0].fromTs) : d.fetchedAt;
  const t1 = r.endedAt ? Date.parse(r.endedAt) : d.fetchedAt;
  const params = Object.entries(r.params ?? {}).filter(([, v]) => v !== null && v !== "" && v !== false);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Back onBack={onBack} />
        <b className="text-sm text-gray-900">{r.name ?? r.recipeName ?? "-"}</b>
        {r.recipeName && r.name !== r.recipeName && <span className="text-xs text-gray-500">레시피 &apos;{r.recipeName}&apos;</span>}
        {typeof r.params?.process_name === "string" && r.params.process_name && r.params.process_name !== r.name
          && <span className="text-xs text-gray-500">행 이름 &apos;{r.params.process_name}&apos;</span>}
        <ResultBadge r={r} />
        {r.reasonCode && <span className="text-xs text-gray-600">{reasonLabel(bundle, r.reasonCode)} <span className="font-mono text-[10px] text-gray-400">{r.reasonCode}</span></span>}
        <button onClick={() => void load()} className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-gray-500 hover:bg-gray-50">
          <RefreshCw size={12} /> 다시 읽기
        </button>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] sm:grid-cols-4">
        {[["시작", r.startedAt ? fmtKst(r.startedAt) : "시작 기록 없음"], ["끝", fmtKst(r.endedAt)], ["소요", r.startedAt && r.endedAt ? fmtSec((Date.parse(r.endedAt) - Date.parse(r.startedAt)) / 1000) : "-"],
          ["누가", r.startedBy ?? "-"], ["행 번호", r.stepNo ?? "-"], ["설정 버전", r.configVersion ?? "-"],
          ["run id", r.runId], ["실행(instance)", r.instance]].map(([k, v]) => (
          <div key={String(k)} className="min-w-0"><dt className="text-gray-400">{k}</dt><dd className="truncate font-semibold text-gray-700" title={String(v)}>{String(v)}</dd></div>
        ))}
      </dl>

      <section>
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <h4 className="text-xs font-bold text-gray-800">1분 요약 그래프</h4>
          <span className="text-[11px] text-gray-400">1분 요약(평균·최대 등)이라 거친 그래프입니다 — 1초 그래프는 나중 단계. 옅은 점선·회색 구간 = 품질 ok 아님.</span>
        </div>
        <div className="mb-1.5 flex flex-wrap gap-1">
          {all.map((f) => {
            const on = picked.includes(f.column);
            return (
              <button key={f.column} onClick={() => setCols(on ? picked.filter((c) => c !== f.column) : [...picked, f.column])}
                title={`${f.column} · ${f.summary ?? "mean"}`}
                className={`rounded-md border px-1.5 py-0.5 text-[10px] ${on ? "border-blue-300 bg-blue-50 font-semibold text-blue-700" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                {f.label}{f.unit && ` ${f.unit}`}
              </button>
            );
          })}
          {cols && <button onClick={() => setCols(null)} className="px-1.5 text-[10px] text-gray-400 underline">기본으로</button>}
        </div>
        <Chk2SummaryChart rows={d.summaries} fields={fields} t0={t0} t1={t1} />
        {d.truncated.summaries && <p className="text-[10px] text-amber-700">요약은 앞에서부터 {d.limits.summaries}개(24시간분)까지만</p>}
      </section>

      <div className="grid gap-3 xl:grid-cols-2">
        <section>
          <h4 className="mb-1 text-xs font-bold text-gray-800">레시피 값(params)</h4>
          {params.length ? (
            <p className="text-[11px] leading-relaxed text-gray-600">
              {params.map(([k, v]) => <span key={k} className="mr-2 inline-block"><span className="text-gray-400">{k}</span> {typeof v === "object" ? JSON.stringify(v) : String(v)}</span>)}
            </p>
          ) : <p className="text-[11px] text-gray-400">없음</p>}
          <h4 className="mb-1 mt-2 text-xs font-bold text-gray-800">블록({exp.length}) — 펼친 블록 기록</h4>
          {exp.length ? <div className="max-h-96 overflow-y-auto rounded-xl bg-gray-50 p-2"><ExpandedView exp={exp} bundle={bundle} showParams /></div>
            : <p className="text-[11px] text-gray-400">블록 기록 없음</p>}
        </section>
        <section>
          <div className="mb-1 flex items-center gap-2">
            <h4 className="text-xs font-bold text-gray-800">사건 {d.events.length}{d.truncated.events && `(앞 ${d.limits.events}개까지)`}</h4>
            <button onClick={() => setOnlyIssue((v) => !v)}
              className={`rounded-lg px-2 py-0.5 text-[11px] font-semibold ${onlyIssue ? "bg-rose-50 text-rose-600" : "text-gray-400 hover:bg-gray-50"}`}>
              경고·오류만 {issues}
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto rounded-xl border border-gray-100">
            <table className="w-full text-[11px]">
              <tbody>
                {events.map((e) => {
                  const label = reasonLabel(bundle, e.code);
                  const adj = adjustText(bundle, e.code, e.context);
                  return (
                    <tr key={e.msgId} className="border-t border-gray-50 align-top">
                      <td className="whitespace-nowrap px-1.5 py-1 tabular-nums text-gray-400">{fmtKst(e.ts).slice(6)}</td>
                      <td className="px-1 py-1"><span className={`rounded px-1 text-[10px] font-semibold ${LEVEL_TONE[e.level] ?? LEVEL_TONE.info}`}>{e.level}</span></td>
                      <td className="px-1.5 py-1 text-gray-700">
                        {e.ruleId && <span className="font-mono text-[10px] text-gray-400">[{e.ruleId}] </span>}
                        {adj ? <b className="font-semibold text-blue-700">{adj}</b> : <>
                          {label !== e.code && <b className="font-semibold">{label} </b>}
                          {e.message}</>}
                        <span className="ml-1 font-mono text-[10px] text-gray-300">{e.code}</span>
                      </td>
                    </tr>
                  );
                })}
                {!events.length && <tr><td className="p-3 text-center text-gray-400">사건 없음</td></tr>}
              </tbody>
            </table>
          </div>
          <h4 className="mb-1 mt-2 text-xs font-bold text-gray-800">그 시간대 명령 {d.commands.length}{d.truncated.commands && `(앞 ${d.limits.commands}개까지)`}</h4>
          <div className="max-h-60 overflow-y-auto rounded-xl border border-gray-100">
            <table className="w-full text-[11px]">
              <tbody>
                {d.commands.map((c) => (
                  <tr key={c.id} className="border-t border-gray-50 align-top">
                    <td className="whitespace-nowrap px-1.5 py-1 tabular-nums text-gray-400">{fmtKst(c.requestedAt).slice(6)}</td>
                    <td className="px-1.5 py-1 text-gray-700">{c.label ?? commandLabel(bundle, c.kind)} <span className="text-gray-400">({c.origin}, {c.requestedBy})</span></td>
                    <td className="whitespace-nowrap px-1.5 py-1">
                      <span className={c.status === "accepted" ? "text-emerald-700" : c.status === "rejected" ? "text-rose-600" : "text-gray-500"}>
                        {CMD_STATUS[c.status] ?? c.status}
                      </span>
                      {c.reasonCode && <span className="block text-[10px] text-gray-500">{reasonLabel(bundle, c.reasonCode)}{c.detail ? ` — ${c.detail}` : ""}</span>}
                    </td>
                  </tr>
                ))}
                {!d.commands.length && <tr><td className="p-3 text-center text-gray-400">명령 없음</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

const Back = ({ onBack }: { onBack: () => void }) => (
  <button onClick={onBack} className="flex items-center gap-1 rounded-lg px-1.5 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-100">
    <ArrowLeft size={14} /> 목록
  </button>
);

/** 장비 화면이 1초마다 다시 그려도(시계·state) 이 부분은 props(장비·묶음·마지막 공정)가 바뀔 때만 */
export default memo(function Chk2History({ equipment, bundle, refreshKey }: { equipment: string; bundle: Bundle | null; refreshKey: string }) {
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
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
            <label className="flex items-center gap-1">시작일(KST)
              <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)}
                className="rounded-md border border-gray-200 px-1.5 py-0.5 text-[11px]" />
            </label>
            <label className="flex items-center gap-1">~
              <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)}
                className="rounded-md border border-gray-200 px-1.5 py-0.5 text-[11px]" />
            </label>
            <label className="flex items-center gap-1">결과
              <select value={result} onChange={(e) => setResult(e.target.value)} className="rounded-md border border-gray-200 px-1 py-0.5 text-[11px]">
                <option value="">전체</option>
                <option value="done">정상</option>
                <option value="aborted">중단</option>
                <option value="error">오류</option>
                <option value="running">진행 중</option>
              </select>
            </label>
            <span className="text-gray-400">장비 {equipment}</span>
            <button onClick={() => void fetchPage(null)} className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-gray-50">
              <RefreshCw size={12} /> 다시 읽기
            </button>
          </div>
          {err && <p className="text-xs text-rose-600">{err}</p>}
          <div className="overflow-x-auto rounded-xl border border-gray-100">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50 text-[11px] text-gray-500">
                <tr>
                  {["시작", "끝", "이름 / 레시피", "누가", "결과", "사유", "소요"].map((h) => (
                    <th key={h} className={`px-2 py-1.5 font-semibold ${h === "소요" ? "text-right" : "text-left"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(list ?? []).map((r) => (
                  <tr key={r.runId} onClick={() => setOpen(r.runId)} className="cursor-pointer border-t border-gray-100 hover:bg-blue-50/40">
                    <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-gray-600">
                      {r.startedAt ? fmtKst(r.startedAt) : <span className="rounded bg-gray-100 px-1 text-[10px] text-gray-500">시작 기록 없음</span>}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-gray-500">{fmtKst(r.endedAt)}</td>
                    <td className="px-2 py-1.5">
                      <span className="font-semibold text-gray-900">{r.name ?? "-"}</span>
                      {r.recipeName && <span className="block text-[10px] text-gray-400">레시피 {r.recipeName}</span>}
                    </td>
                    <td className="px-2 py-1.5 text-gray-500">{r.startedBy ?? "-"}</td>
                    <td className="px-2 py-1.5"><ResultBadge r={r} /></td>
                    <td className="px-2 py-1.5 text-[11px] text-gray-600">{r.reasonCode ? reasonLabel(bundle, r.reasonCode) : ""}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-gray-600">{r.durationS !== null ? fmtSec(r.durationS) : "-"}</td>
                  </tr>
                ))}
                {list !== null && !list.length && <tr><td colSpan={7} className="p-3 text-center text-gray-400">이 조건의 공정이 없습니다</td></tr>}
                {list === null && <tr><td colSpan={7} className="p-3 text-center text-gray-400">읽는 중…</td></tr>}
              </tbody>
            </table>
          </div>
          {next && (
            <button onClick={() => void fetchPage(next)} className="w-full rounded-xl border border-gray-200 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50">
              더 보기
            </button>
          )}
        </div>
      )}
    </Card>
  );
});
