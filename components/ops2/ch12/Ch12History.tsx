"use client";

// 챔버12 공정 기록(이력) — 챔버별(CH1·CH2·플라즈마 클리닝·TSP). 목록 /api/ops2/[equipment]/runs(날짜·결과·chamber 로 거르기, 더 보기 —
// 웹 서버가 chamber 를 모르면 받은 행의 chamber 로 화면에서 거른다), 상세 /runs/[runId]: 시작·끝·결과·사유·설정 버전, 레시피 블록
// (블록 이름·값 요약), 그 run 의 사건(로그와 같은 규칙 — 챔버K text.logLine), 1분 요약 그래프(챔버K Chk2SummaryChart — 필드는 그 챔버
// 블록에서 고른다). 챔버K Chk2History 와 같은 API·모양(블록 펼침은 챔버12 블록이 평평해 목록으로).
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, History, RefreshCw } from "lucide-react";
import { useChk2Mode } from "../chk/mode";
import { logLine, runTitle } from "../chk/text";
import { Card } from "../chk/kit";
import Chk2SummaryChart, { type PickField, type SummaryRow } from "../chk/Chk2SummaryChart";
import { RUN_RESULT, reasonLabel } from "../chk/types";
import { fmtKst } from "@/lib/ops2/time";
import { blockSummary } from "./Ch12BlockEditor";
import { blockDefOf, blockLabel, clockOrDash } from "./logic";
import { asChk, type Ch12Bundle } from "./types";
import { blockName, fieldName, placeName } from "@/lib/ops2/ch12/terms";

type RunItem = {
  runId: string; name: string | null; recipeName: string | null; startedBy: string | null; stepNo: number | null;
  startedAt: string | null; endedAt: string | null; result: string | null; reasonCode: string | null;
  configVersion: number | null; durationS: number | null; chamber?: string | null;
};
type EventRow = { msgId: string; ts: string; level: string; code: string; ruleId: string | null; message: string; context: unknown };
type Detail = {
  fetchedAt: number; run: RunItem & { instance?: string; params: Record<string, unknown> | null; blocks: unknown; summary: unknown };
  events: EventRow[]; summaries: SummaryRow[]; truncated?: { events?: boolean; summaries?: boolean };
};

const CHAMBER_KEYS = ["ch1", "ch2", "pc", "tsp"] as const;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const kstDay = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(ms));
const LEVEL_TONE: Record<string, string> = {
  error: "bg-[#FEE4E2] text-[#B42318]", critical: "bg-[#FEE4E2] text-[#B42318]", warn: "bg-[#FFFAEB] text-[#B54708]", info: "bg-[#EEF0F3] text-[#5B6470]",
};

function ResultBadge({ r }: { r: Pick<RunItem, "endedAt" | "result"> }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-[12px] font-semibold ${!r.endedAt ? "bg-[#3A424D] text-white" : r.result === "done"
      ? "bg-[#EEF0F3] text-[#3A424D]" : r.result === "error" ? "bg-[#FEE4E2] text-[#B42318]" : "bg-[#FFFAEB] text-[#B54708]"}`}>
      {!r.endedAt ? "진행 중" : RUN_RESULT[r.result ?? ""] ?? r.result ?? "-"}
    </span>
  );
}

/** 그래프에 쓸 숫자 필드 — 그 챔버 블록(+공유 PLC 제외)만 */
function fieldsFor(b: Ch12Bundle | null, ch: string): (PickField & { blockLabel: string })[] {
  const names = b?.chambers?.find((c) => c.id === ch)?.blocks ?? [];
  return (b?.snapshot?.blocks ?? []).filter((bl) => names.includes(bl.name) || bl.name.startsWith(`${ch}.`))
    .flatMap((bl) => bl.fields.filter((f) => (f.type === "float" || f.type === "int") && f.summary !== "any" && !f.detail)
      .map((f) => {
        const t = placeName(b, ch), bn = blockName(b, bl.name, t), fn = fieldName(b, f.column, t);
        return { ...f, block: bl.name, blockLabel: bn, label: fn.startsWith(bn) || bl.name.endsWith(".mfc") ? fn : `${bn} ${fn}` };
      }));
}

function RunDetail({ equipment, runId, bundle, onBack }: { equipment: string; runId: string; bundle: Ch12Bundle | null; onBack: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [cols, setCols] = useState<string[] | null>(null);
  const { detail } = useChk2Mode();
  const load = useCallback(async () => {
    const r = await fetch(`/api/ops2/${encodeURIComponent(equipment)}/runs/${encodeURIComponent(runId)}`, { cache: "no-store" }).catch(() => null);
    if (!r?.ok) return setErr(r ? `공정 기록을 읽지 못했습니다(${r.status})` : "웹 서버에 닿지 않습니다");
    setErr(null);
    setD({ ...(await r.json()), fetchedAt: Date.now() });
  }, [equipment, runId]);
  useEffect(() => { const t = setTimeout(() => void load(), 0); return () => clearTimeout(t); }, [load]);
  const ch = d?.run.chamber ?? "ch1";
  const all = useMemo(() => fieldsFor(bundle, ch), [bundle, ch]);
  const back = (
    <button onClick={onBack} className="flex items-center gap-1 rounded-lg px-1.5 py-1 text-[12px] font-semibold text-[#5B6470] hover:bg-[#EEF0F3]">
      <ArrowLeft size={14} /> 목록
    </button>
  );
  if (err) return <div className="space-y-2">{back}<p className="text-[12px] text-[#B42318]">{err}</p></div>;
  if (!d) return <div className="space-y-2">{back}<p className="text-[12px] text-[#8A929D]">읽는 중…</p></div>;
  const r = d.run;
  const picked = cols ?? all.filter((f) => /pressure|_sccm$|p_w$|fwd_w|dc1_p|thickness_nm|pv$/.test(f.name)).slice(0, 5).map((f) => f.column);
  const fields = all.filter((f) => picked.includes(f.column));
  const blocks = Array.isArray(r.blocks) ? r.blocks.filter(isObj) : [];
  const lines = d.events.map((e) => ({ e, ...logLine(asChk(bundle), { type: "event", data: { level: e.level, code: e.code, ruleId: e.ruleId, message: e.message, context: e.context } }) }))
    .filter((x) => detail || x.main);
  const t0 = r.startedAt ? Date.parse(r.startedAt) : d.fetchedAt;
  const t1 = r.endedAt ? Date.parse(r.endedAt) : d.fetchedAt;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {back}
        <span className="rounded bg-[#3A424D] px-1.5 py-0.5 text-[12px] font-semibold text-white">{placeName(bundle, ch)}</span>
        <b className="text-[14px] text-[#1B1F24]">{runTitle(r)}</b>
        <ResultBadge r={r} />
        {r.reasonCode && <span className="text-[12px] text-[#5B6470]">{reasonLabel(asChk(bundle), r.reasonCode)}</span>}
        <button onClick={() => void load()} className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] text-[#5B6470] hover:bg-[#F5F6F8]"><RefreshCw size={12} /> 다시 읽기</button>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] sm:grid-cols-4">
        {[["시작", fmtKst(r.startedAt)], ["끝", fmtKst(r.endedAt)], ["소요", r.durationS !== null ? clockOrDash(r.durationS) : "-"],
          ["누가", r.startedBy ?? "-"], ["설정 버전", r.configVersion ?? "-"], ...(detail ? [["run id", r.runId]] : [])].map(([k, v]) => (
          <div key={String(k)}><dt className="text-[#8A929D]">{k}</dt><dd className="truncate font-semibold text-[#1B1F24]">{String(v)}</dd></div>
        ))}
      </dl>
      <section>
        <div className="mb-1 flex flex-wrap items-center gap-1">
          <h4 className="mr-2 text-[12px] font-bold text-[#1B1F24]">1분 요약 그래프</h4>
          {all.map((f) => {
            const on = picked.includes(f.column);
            return (
              <button key={f.column} onClick={() => setCols(on ? picked.filter((c) => c !== f.column) : [...picked, f.column])}
                className={`rounded-md border px-1.5 py-0.5 text-[12px] ${on ? "border-[#C7D5FB] bg-[#E8EEFC] font-semibold text-[#1D4ED8]" : "border-[#D9DDE3] text-[#5B6470]"}`}>
                {f.label}{f.unit && ` ${f.unit}`}
              </button>
            );
          })}
        </div>
        <Chk2SummaryChart rows={d.summaries} fields={fields} t0={t0} t1={t1} />
      </section>
      <div className="grid gap-3 xl:grid-cols-2">
        <section>
          <h4 className="mb-1 text-[12px] font-bold text-[#1B1F24]">블록 기록({blocks.length})</h4>
          <ol className="max-h-96 space-y-0.5 overflow-y-auto rounded-[10px] bg-[#F5F6F8] p-2 text-[12px]">
            {blocks.map((b, i) => (
              <li key={i} className="flex gap-1.5">
                <span className="w-6 shrink-0 text-right font-mono text-[#8A929D]">{i + 1}</span>
                <b className="shrink-0 text-[#1B1F24]">{blockLabel(bundle, String(b.type))}</b>
                {typeof b.label === "string" && b.label && <span className="text-[#5B6470]">({b.label})</span>}
                <span className="truncate text-[#5B6470]">{blockSummary(blockDefOf(bundle, String(b.type)), isObj(b.params) ? b.params : {})}</span>
              </li>
            ))}
            {!blocks.length && <li className="text-[#8A929D]">블록 기록 없음</li>}
          </ol>
        </section>
        <section>
          <h4 className="mb-1 text-[12px] font-bold text-[#1B1F24]">로그 {lines.length}</h4>
          <div className="max-h-96 overflow-y-auto rounded-[10px] border border-[#E3E6EA]">
            <table className="w-full text-[12px]"><tbody>
              {lines.map(({ e, kind, text, raw, level }) => (
                <tr key={e.msgId} className="border-t border-[#E3E6EA] align-top" title={raw}>
                  <td className="whitespace-nowrap px-1.5 py-1 tabular-nums text-[#8A929D]">{fmtKst(e.ts).slice(6)}</td>
                  <td className="px-1 py-1"><span className={`whitespace-nowrap rounded px-1 text-[12px] font-semibold ${LEVEL_TONE[level] ?? LEVEL_TONE.info}`}>{kind}</span></td>
                  <td className="px-1.5 py-1 text-[#1B1F24]">{text}</td>
                </tr>
              ))}
              {!lines.length && <tr><td className="p-3 text-center text-[#8A929D]">로그 없음</td></tr>}
            </tbody></table>
          </div>
        </section>
      </div>
    </div>
  );
}

export default memo(function Ch12History({ equipment, bundle, refreshKey }: { equipment: string; bundle: Ch12Bundle | null; refreshKey: string }) {
  const { detail } = useChk2Mode();
  const [from, setFrom] = useState(() => kstDay(Date.now() - 6 * 86_400_000));
  const [to, setTo] = useState(() => kstDay(Date.now()));
  const [chamber, setChamber] = useState("");
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
    if (chamber) q.set("chamber", chamber);
    if (cursor) q.set("cursor", cursor);
    const r = await fetch(`/api/ops2/${encodeURIComponent(equipment)}/runs?${q}`, { cache: "no-store" }).catch(() => null);
    if (!r?.ok) return setErr(r ? `공정 기록을 읽지 못했습니다(${r.status})` : "웹 서버에 닿지 않습니다");
    const b = await r.json();
    setErr(null);
    setList((l) => (cursor ? [...(l ?? []), ...b.runs] : b.runs));
    setNext(b.next ?? null);
  }, [equipment, from, to, result, chamber]);
  useEffect(() => { const t = setTimeout(() => void fetchPage(null), 0); return () => clearTimeout(t); }, [fetchPage, refreshKey]);

  const shown = (list ?? []).filter((r) => !chamber || !r.chamber || r.chamber === chamber);
  return (
    <Card title={<><History size={15} /> 공정 기록(챔버별)</>}>
      {open ? <RunDetail equipment={equipment} runId={open} bundle={bundle} onBack={() => setOpen(null)} /> : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-[#5B6470]">
            <span className="flex overflow-hidden rounded-lg border border-[#D9DDE3]">
              {[["", "전체"], ...CHAMBER_KEYS.map((k) => [k, placeName(bundle, k)])].map(([k, l]) => (
                <button key={k} onClick={() => setChamber(k)} className={`px-2 py-0.5 ${chamber === k ? "bg-[#3A424D] font-semibold text-white" : "hover:bg-[#F5F6F8]"}`}>{l}</button>
              ))}
            </span>
            <label className="flex items-center gap-1">시작일(KST)
              <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-[#D9DDE3] px-1.5 py-0.5 text-[12px]" />
            </label>
            <label className="flex items-center gap-1">~
              <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-[#D9DDE3] px-1.5 py-0.5 text-[12px]" />
            </label>
            <select value={result} onChange={(e) => setResult(e.target.value)} className="rounded-md border border-[#D9DDE3] px-1 py-0.5 text-[12px]">
              <option value="">결과 전체</option><option value="done">정상</option><option value="aborted">중단</option>
              <option value="error">오류</option><option value="running">진행 중</option>
            </select>
            <button onClick={() => void fetchPage(null)} className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-[#F5F6F8]"><RefreshCw size={12} /> 다시 읽기</button>
          </div>
          {err && <p className="text-[12px] text-[#B42318]">{err}</p>}
          <div className="overflow-x-auto rounded-[10px] border border-[#E3E6EA]">
            <table className="min-w-full text-[12px]">
              <thead className="bg-[#F5F6F8] text-[12px] text-[#5B6470]"><tr>
                {["챔버", "시작", "끝", "이름 / 레시피", "누가", "결과", "사유", "소요"].map((h) => <th key={h} className="px-2 py-1.5 text-left font-semibold">{h}</th>)}
              </tr></thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.runId} onClick={() => setOpen(r.runId)} className="cursor-pointer border-t border-[#E3E6EA] hover:bg-[#E8EEFC]">
                    <td className="px-2 py-1.5"><span className="rounded bg-[#EEF0F3] px-1 text-[12px] font-semibold text-[#1B1F24]">{r.chamber ? placeName(bundle, r.chamber) : "?"}</span></td>
                    <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-[#5B6470]">{fmtKst(r.startedAt)}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-[#5B6470]">{fmtKst(r.endedAt)}</td>
                    <td className="px-2 py-1.5"><span className="font-semibold text-[#1B1F24]">{runTitle(r)}</span>
                      {detail && <span className="block font-mono text-[12px] text-[#8A929D]">{r.runId}</span>}</td>
                    <td className="px-2 py-1.5 text-[#5B6470]">{r.startedBy ?? "-"}</td>
                    <td className="px-2 py-1.5"><ResultBadge r={r} /></td>
                    <td className="px-2 py-1.5 text-[12px] text-[#5B6470]">{r.reasonCode ? reasonLabel(asChk(bundle), r.reasonCode) : ""}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-[#5B6470]">{r.durationS !== null ? clockOrDash(r.durationS) : "-"}</td>
                  </tr>
                ))}
                {list !== null && !shown.length && <tr><td colSpan={8} className="p-3 text-center text-[#8A929D]">이 기간·조건의 공정 기록이 없습니다</td></tr>}
                {list === null && !err && <tr><td colSpan={8} className="p-3 text-center text-[#8A929D]">읽는 중…</td></tr>}
              </tbody>
            </table>
          </div>
          {next && <button onClick={() => void fetchPage(next)} className="w-full rounded-[10px] border border-[#D9DDE3] py-1.5 text-[12px] font-semibold text-[#5B6470] hover:bg-[#F5F6F8]">더 보기</button>}
        </div>
      )}
    </Card>
  );
});
