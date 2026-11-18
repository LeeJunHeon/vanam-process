"use client";

// 챔버12 레시피 — 웹 저장(/api/ops2/[equipment]/recipes — 챔버K useRecipes 그대로)·편집·검사·장비로 보내기.
// 레시피는 챔버별(kind ch1·ch2 — 장비 지원·가스 라인이 다르다). 행 두 종류: v1 행(Recipe_Template 열 — 묶음 recipe.templateColumns,
// 값은 CSV 처럼 글), 블록 행 {name, blocks}(블록 편집기). 검사는 웹 서버 저장 검사와 같은 함수 lib/ops2/ch12/recipes.ts ch12CheckRecipe
// (블록 행 checkBlocks, v1 행 E230 checkRawRows·기본 템플릿 templateFromRow·시작 전 값 checkNormParams — 장비 골든과 같음). 마지막 판단은 장비.
// 조작: 적재 RECIPE_LOAD {ch, name, rows(v1 행 — 큐) | blocks(블록 행 — 여럿이면 이어 붙임)}(웹 검사 오류·저장 안 한 변경이 있으면 막음),
// 이 행만 적재. 시작(PROCESS_START {ch})·해제는 챔버 칸. "블록 행으로 만들기" = 그 행의 기본 템플릿(원래 행은 그대로).
import { useCallback, useEffect, useMemo, useState, type MutableRefObject } from "react";
import { ArrowDown, ArrowUp, BookOpen, ChevronDown, ChevronRight, Copy, FilePlus2, Layers, Save, Trash2, Upload } from "lucide-react";
import { WEB_BLOCKS_VERSION } from "@/lib/ops2/ch12/blocks";
import { templateFromRow, type Row } from "@/lib/ops2/ch12/recipe";
import { ch12CheckRecipe, ch12RecipeEnvOf } from "@/lib/ops2/ch12/recipes";
import { fmtKst } from "@/lib/ops2/time";
import { Card, SimpleConfirm, type Ask, type Notice } from "../chk/kit";
import { useChk2Mode } from "../chk/mode";
import { RECIPE_ERROR, type RecipeFull, type RecipeKind, type useRecipes } from "../chk/useRecipes";
import Ch12BlockEditor, { type Blk } from "./Ch12BlockEditor";
import { Btn as KBtn, FS } from "../chk/kit";
import { PC_FIELDS, checkPcRow, pcRanges, pcRowLine } from "@/lib/ops2/ch12/pc";
import { NumField } from "./Ch12Inputs";
import { KINDS, cfgOf, chArgs, defsOf, envFor, hasKind, pickKind } from "./logic";
import type { Ch12Bundle } from "./types";

type Kind = "ch1" | "ch2" | "pc";

/** 옛 작은 버튼 자리 — 챔버K kit 버튼으로(tone → kind, small → sm) */
const Btn = ({ onClick, disabled, title, tone, small, children }: {
  onClick: () => void; disabled?: boolean; title?: string; tone?: "blue" | "rose" | "roseSolid"; small?: boolean; children: React.ReactNode;
}) => (
  <KBtn onClick={onClick} disabled={disabled} title={title} size={small ? "sm" : "md"}
    kind={tone === "blue" ? "primary" : tone === "rose" ? "danger" : tone === "roseSolid" ? "dangerSolid" : "neutral"}>{children}</KBtn>
);
const KIND_LABEL: Record<Kind, string> = { ch1: "CH1", ch2: "CH2", pc: "플라즈마 클리닝" };
type Draft = { id: string | null; kind: Kind; name: string; rows: Row[]; updatedAt: string | null; base: string };
const snapOf = (d: Pick<Draft, "name" | "rows" | "kind">) => JSON.stringify([d.kind, d.name.trim(), d.rows]);
export const isBlockRow = (r: Row) => Array.isArray(r.blocks);
const rowName = (r: Row, i: number) => String((isBlockRow(r) ? r.name : r.Process_name) ?? "").trim() || `${i + 1}행`;
const hasContent = (r: Row) => isBlockRow(r) || Object.values(r).some((v) => v !== null && v !== undefined && String(v).trim() !== "");
const isKind = (k: unknown): k is Kind => k === "ch1" || k === "ch2" || k === "pc";

/** 장비 RECIPE_LOAD 인자 — rows(v1 행 목록 — 큐) 또는 blocks(블록 목록 하나) 중 하나, 블록 행 여럿은 이어 붙인다(row = 행 번호).
 *  운전 탭 '다음 공정' 도 같은 함수(빈 행은 부르는 쪽이 hasRowContent 로 뺀다) */
export function loadPayload(rows: Row[], name: string): { args: Record<string, unknown>; why: string } {
  const blk = rows.filter(isBlockRow);
  if (!blk.length) return { args: { name, rows }, why: "" };
  if (blk.length !== rows.length) return { args: {}, why: "v1 행과 블록 행을 함께 적재할 수 없음 — 한 종류만 남기세요" };
  const blocks = blk.flatMap((r, k) => (r.blocks as Blk[]).map((x) => (blk.length > 1 ? { ...x, row: k + 1 } : x)));
  return { args: { name, blocks }, why: "" };
}
export const hasRowContent = (r: Row) => isBlockRow(r) || Object.values(r).some((v) => v !== null && v !== undefined && String(v).trim() !== "");

/** v1 행 한 줄 요약 */
export function rowLine(r: Row): string {
  const t = (k: string) => String(r[k] ?? "").trim();
  const on = (k: string) => /^(t|true|1|y|yes)$/i.test(t(k));
  const gas = ["Ar", "O2", "N2"].filter(on).map((g) => `${g} ${t(`${g}_flow`) || "0"}`).join(" + ") || "가스 없음";
  const pw = [on("use_dc_power") && `DC ${t("dc_power")} W`, on("use_rf_power") && `RF ${t("rf_power")} W`,
              on("use_dc_pulse") && `DC Pulse ${t("dc_pulse_power")} W`, on("use_rf_pulse") && `RF Pulse ${t("rf_pulse_power")} W`]
    .filter(Boolean).join(" + ") || "파워 없음";
  const time = t("thickness") ? `두께 ${t("thickness")} nm` : `공정 ${t("process_time") || "0"}분`;
  return `${gas} · ${pw} · 압력 ${t("working_pressure") || "-"} mTorr · ${time}${on("use_heater") ? ` · 히터 ${t("heater_temp")} °C` : ""}`;
}

function V1RowForm({ b, row, onRow, readOnly }: { b: Ch12Bundle | null; row: Row; onRow: (r: Row) => void; readOnly: boolean }) {
  const cols = b?.recipe?.templateColumns ?? [];
  const doc = b?.recipe?.columnDoc ?? {};
  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2 xl:grid-cols-3">
      {cols.map((c) => {
        const d = doc[c];
        const tf = d?.unit === "T/F";
        return (
          <label key={c} className="flex items-center gap-1.5 text-[12px]" title={d?.desc}>
            <span className="w-28 shrink-0 truncate text-[#5B6470]">{c}</span>
            {tf ? (
              <select disabled={readOnly} value={String(row[c] ?? "")} onChange={(e) => onRow({ ...row, [c]: e.target.value })}
                className="rounded-md border border-[#D9DDE3] px-1 py-0.5 text-[12px]">
                <option value="">(비움)</option><option value="T">T</option><option value="F">F</option>
              </select>
            ) : (
              <input disabled={readOnly} value={String(row[c] ?? "")} onChange={(e) => onRow({ ...row, [c]: e.target.value })}
                placeholder={d?.blank ? `비면 ${d.blank}` : ""} className="w-28 rounded-md border border-[#D9DDE3] px-1.5 py-0.5 text-[12px]" />
            )}
            <span className="truncate text-[12px] text-[#8A929D]">{d?.unit !== "T/F" ? d?.unit : ""}</span>
          </label>
        );
      })}
    </div>
  );
}

export default function Ch12Recipes({ bundle, recipes, can, onAsk, notify, dirtyRef }: {
  bundle: Ch12Bundle | null; recipes: ReturnType<typeof useRecipes>; can: (kind: string) => boolean;
  onAsk: (a: Ask) => void; notify: (n: Omit<Notice, "id" | "at">) => void; dirtyRef: MutableRefObject<boolean>;
}) {
  const { detail } = useChk2Mode();
  const [d, setD] = useState<Draft | null>(null);
  const [newKind, setNewKind] = useState<Kind>("ch1");
  const [openRow, setOpenRow] = useState<number | null>(null);
  const [askDel, setAskDel] = useState<string | null>(null);
  const [askLeave, setAskLeave] = useState<(() => void) | null>(null);
  const chamber: Kind = d?.kind ?? newKind;
  const isPc = chamber === "pc";
  const ch: 1 | 2 = chamber === "ch1" ? 1 : 2;
  const env = envFor(bundle, ch);
  const renv = useMemo(() => ch12RecipeEnvOf(bundle), [bundle]);
  const outdated = (bundle?.blocks?.version ?? null) !== WEB_BLOCKS_VERSION;
  const dirty = !!d && snapOf(d) !== d.base;
  useEffect(() => { dirtyRef.current = dirty; }, [dirty, dirtyRef]);

  // 웹 저장 때 서버가 내는 검사와 같은 함수(lib/ops2/ch12/recipes.ts ch12CheckRecipe — 장비와 같은 골든 계산)
  const res = useMemo(() => (d && renv && d.kind !== "pc" ? ch12CheckRecipe(d.kind, d.rows, renv) : null), [d, renv]);
  // 플라즈마 클리닝 레시피 — 행 하나(v1 PC CSV 첫 행), 열 형식·범위(묶음 PC_DEFAULT_* — 저장 검사와 같은 lib/ops2/ch12/pc.ts)
  const pcErrs = useMemo(() => (d?.kind === "pc" ? (d.rows.length !== 1 ? ["PC 레시피는 행 하나"] : checkPcRow(d.rows[0], pcRanges(bundle))) : []), [d, bundle]);
  const checks = res?.rows ?? [];
  const listErrors = d?.kind === "pc" ? pcErrs : res?.listErrors ?? [];
  const nErr = listErrors.length + checks.reduce((s, c) => s + c.errors.length, 0);
  const nWarn = checks.reduce((s, c) => s + c.warnings.length, 0);

  const guard = (go: () => void) => (dirty ? setAskLeave(() => go) : go());
  const open = useCallback(async (id: string) => {
    const r = await recipes.get(id);
    if (!r.ok) return notify({ tone: "bad", title: "레시피를 열지 못함", text: RECIPE_ERROR[r.error] ?? r.error });
    const f: RecipeFull = r.data.recipe;
    const nd = { id: f.id, kind: isKind(f.kind) ? f.kind : "ch1" as Kind, name: f.name, rows: f.rows.map((x) => ({ ...x })), updatedAt: f.updatedAt };
    setD({ ...nd, base: snapOf(nd) });
    setOpenRow(null);
  }, [recipes, notify]);
  const fresh = () => {
    const nd = { id: null, kind: newKind, name: "", updatedAt: null,
      rows: newKind === "pc" ? [{ use_ch: "1", process_name: "", base_pressure: "", gas_flow: "", working_pressure: "", rf_power: "", process_time: "" } as Row]
        : [{ name: "", blocks: [] } as Row] };
    setD({ ...nd, base: snapOf(nd) });
    setOpenRow(0);
  };
  const save = async () => {
    if (!d) return;
    // 챔버12 레시피 kind 는 챔버(ch1·ch2 — 웹 서버 lib/ops2/ch12/ids CH12_RECIPE_KINDS). 챔버K 타입에 없어 바꿔 넘긴다
    const r = await recipes.save({ kind: d.kind as unknown as RecipeKind, name: d.name.trim(), rows: d.rows, gas: null }, d.id, d.updatedAt);
    if (!r.ok) return notify({ tone: "bad", title: "저장 못 함", text: `${RECIPE_ERROR[r.error] ?? r.error}${r.detail ? ` · ${r.detail}` : ""}` });
    const f = r.data.recipe;
    const nd = { id: f.id, kind: isKind(f.kind) ? f.kind : d.kind, name: f.name, rows: f.rows.map((x) => ({ ...x })), updatedAt: f.updatedAt };
    setD({ ...nd, base: snapOf(nd) });
    notify({ tone: "ok", title: `레시피 '${f.name}' 저장` });
  };
  const setRows = (rows: Row[]) => d && setD({ ...d, rows });
  const setRow = (i: number, r: Row) => d && setRows(d.rows.map((x, k) => (k === i ? r : x)));
  const rowAct = (i: number, a: "up" | "down" | "copy" | "delete" | "toBlocks") => {
    if (!d) return;
    const rows = [...d.rows];
    if (a === "up" && i > 0) [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]];
    else if (a === "down" && i < rows.length - 1) [rows[i + 1], rows[i]] = [rows[i], rows[i + 1]];
    else if (a === "copy") rows.splice(i + 1, 0, JSON.parse(JSON.stringify(rows[i])));
    else if (a === "delete") rows.splice(i, 1);
    else if (a === "toBlocks") {
      const defs = defsOf(bundle);
      if (!defs) return;
      try {
        const t = templateFromRow({ ...rows[i] }, ch, cfgOf(bundle), defs, i + 1);
        if (t.kind === "error") return notify({ tone: "bad", title: "블록 행으로 만들 수 없음", text: t.error });
        const blocks = t.blocks.map((b) => ({ type: b.type, params: b.params, label: b.label }));
        rows.splice(i + 1, 0, { name: `${rowName(rows[i], i)} (블록)`, blocks });
      } catch (e) {
        return notify({ tone: "bad", title: "블록 행으로 만들 수 없음", text: e instanceof Error ? e.message : String(e) });
      }
    }
    setRows(rows);
    setOpenRow(null);
  };

  const kLoad = pickKind(bundle, KINDS.load);
  const content = d ? d.rows.filter(hasContent) : [];
  const payload = loadPayload;
  const all = d ? payload(content, d.name.trim()) : { args: {}, why: "" };
  const loadWhy = !d ? "" : dirty ? "저장 안 한 변경" : nErr ? `웹 검사 오류 ${nErr}` : !content.length ? "행 없음"
    : !d.name.trim() ? "이름 없음" : all.why;
  const send = (args: Record<string, unknown>, what: string, lines: string[]) => onAsk({
    kind: kLoad, label: `CH${ch} 레시피 적재`, detail: what, key: `${kLoad}@ch${ch}`, args: chArgs(bundle, kLoad, ch === 1 ? "ch1" : "ch2", args),
    lines: [...lines, `CH${ch} 에 적재 — 시작은 운전 탭 CH${ch} 칸의 '공정 시작'`],
  });
  const load = () => d && send(all.args, `'${d.name}'`, [`레시피 '${d.name}' · ${content.length}행(블록 행 ${content.filter(isBlockRow).length})`]);
  const loadRow = (i: number) => {
    if (!d) return;
    const r = d.rows[i];
    const p = payload([r], `${d.name.trim() || "레시피"} · ${rowName(r, i)}`);
    send(p.args, `${rowName(r, i)} 한 행`, [isBlockRow(r) ? `블록 ${(r.blocks as unknown[]).length}개` : rowLine(r), "이 행만 적재합니다"]);
  };

  const list = (recipes.list ?? []).filter((r) => isKind(r.kind));
  return (
    <Card title={<><BookOpen size={15} /> 레시피</>}
      right={<span className={`flex items-center gap-2 ${FS.small} text-[#5B6470]`} title="챔버마다 장비 지원·가스 라인이 달라 레시피는 챔버별(저장한 뒤에는 바꿀 수 없음). 플라즈마 클리닝은 v1 PC CSV 첫 행과 같은 열">
        종류
        <select value={chamber} disabled={!!d?.id} aria-label="레시피 종류"
          onChange={(e) => { const k = e.target.value as Kind; if (d && !d.id && (k === "pc") !== (d.kind === "pc")) return; if (d) setD({ ...d, kind: k }); else setNewKind(k); }}
          className={`h-8 rounded-[8px] border border-[#D9DDE3] bg-white px-1.5 ${FS.small} disabled:bg-[#F5F6F8]`}>
          <option value="ch1">CH1</option><option value="ch2">CH2</option><option value="pc">플라즈마 클리닝</option>
        </select>
      </span>}>
      {outdated && <p className="mb-2 rounded-lg bg-[#FFFAEB] p-2 text-[12px] text-[#B54708]">장비 블록 정의 판({bundle?.blocks?.version ?? "-"})이 웹 검사 판({WEB_BLOCKS_VERSION})과 다릅니다 — 웹 검사 없이 장비가 검사합니다.</p>}
      {recipes.error && <p className="mb-2 text-[12px] text-[#B42318]">{recipes.error}</p>}
      {!d ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Btn onClick={fresh} disabled={!recipes.canEdit} tone="blue" small><FilePlus2 size={12} /> 새 레시피</Btn>
            {!recipes.canEdit && <span className="text-[12px] text-[#8A929D]">레시피 저장은 장비 담당자·관리자만</span>}
          </div>
          <div className="overflow-x-auto rounded-[10px] border border-[#E3E6EA]">
            <table className="min-w-full text-[12px]">
              <thead className="bg-[#F5F6F8] text-[12px] text-[#5B6470]"><tr>
                {["종류", "이름", "행", "검사", "고친 사람", "고친 때", ""].map((h) => <th key={h} className="px-2 py-1.5 text-left font-semibold">{h}</th>)}
              </tr></thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id} className="cursor-pointer border-t border-[#E3E6EA] hover:bg-[#E8EEFC]" onClick={() => void open(r.id)}>
                    <td className="px-2 py-1.5"><span className="rounded bg-[#EEF0F3] px-1 text-[12px] font-semibold text-[#1B1F24]">{KIND_LABEL[r.kind as Kind] ?? String(r.kind)}</span></td>
                    <td className="px-2 py-1.5 font-semibold text-[#1B1F24]">{r.name}</td>
                    <td className="px-2 py-1.5 tabular-nums">{r.rowCount}</td>
                    <td className="px-2 py-1.5 text-[12px]">{r.check ? (r.check.errors ? <span className="text-[#B42318]">오류 {r.check.errors}</span>
                      : r.check.warnings ? <span className="text-[#B54708]">경고 {r.check.warnings}</span> : <span className="text-[#3A424D]">통과</span>) : "—"}</td>
                    <td className="px-2 py-1.5 text-[#5B6470]">{r.updatedBy}</td>
                    <td className="px-2 py-1.5 text-[#5B6470]">{fmtKst(r.updatedAt)}</td>
                    <td className="px-2 py-1.5 text-right">
                      {recipes.canEdit && <button onClick={(e) => { e.stopPropagation(); setAskDel(r.id); }} className="rounded p-1 text-[#B42318] hover:bg-[#FEE4E2]" aria-label="지우기"><Trash2 size={12} /></button>}
                    </td>
                  </tr>
                ))}
                {recipes.list !== null && !list.length && <tr><td colSpan={7} className="p-3 text-center text-[#8A929D]">저장된 레시피가 없습니다</td></tr>}
                {recipes.list === null && <tr><td colSpan={7} className="p-3 text-center text-[#8A929D]">읽는 중…</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => guard(() => setD(null))} className="rounded-lg px-1.5 py-1 text-[12px] font-semibold text-[#5B6470] hover:bg-[#EEF0F3]">← 목록</button>
            <input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="레시피 이름"
              readOnly={!recipes.canEdit} className="w-56 rounded-lg border border-[#D9DDE3] px-2 py-1 text-[12px] font-semibold" />
            <span className={`rounded px-1.5 py-0.5 text-[12px] font-semibold ${nErr ? "bg-[#FEE4E2] text-[#B42318]" : nWarn ? "bg-[#FFFAEB] text-[#B54708]" : "bg-[#EEF0F3] text-[#3A424D]"}`}>
              {!env && !isPc ? "웹 검사 안 함" : nErr ? `오류 ${nErr}` : nWarn ? `경고 ${nWarn}` : "검사 통과"} · {KIND_LABEL[chamber]}
            </span>
            {dirty && <span className="text-[12px] font-semibold text-[#B54708]">저장 안 함</span>}
            <span className="ml-auto flex flex-wrap gap-1.5">
              {recipes.canEdit && <Btn onClick={() => void save()} disabled={!dirty || !d.name.trim()} tone="blue" small><Save size={12} /> 저장</Btn>}
              {hasKind(bundle, KINDS.load) && !isPc && <Btn onClick={load} disabled={!!loadWhy || !can(kLoad)} title={loadWhy || undefined} small><Upload size={12} /> CH{ch} 적재</Btn>}
            </span>
          </div>
          {listErrors.length > 0 && (
            <ul className="space-y-0.5 rounded-lg bg-[#FEE4E2] p-2">
              {listErrors.map((m, k) => <li key={k} className="whitespace-pre-wrap text-[12px] text-[#B42318]">{m}</li>)}
            </ul>
          )}
          {isPc ? <PcRowForm b={bundle} row={d.rows[0] ?? {}} readOnly={!recipes.canEdit} onRow={(nr) => setRow(0, nr)} /> : null}
          {!isPc && <ol className="space-y-1.5">
            {d.rows.map((r, i) => {
              const c = checks[i];
              const blk = isBlockRow(r);
              const o = openRow === i;
              return (
                <li key={i} className={`rounded-[10px] border ${c?.errors.length ? "border-[#F7C1BB]" : "border-[#E3E6EA]"} p-2`}>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button onClick={() => setOpenRow(o ? null : i)} className="flex min-w-0 flex-1 items-center gap-1 text-left">
                      {o ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      <span className="w-6 text-right font-mono text-[12px] text-[#8A929D]">{i + 1}</span>
                      <span className={`rounded px-1 text-[12px] font-semibold ${blk ? "bg-[#E8EEFC] text-[#1D4ED8]" : "bg-[#EEF0F3] text-[#5B6470]"}`}>
                        {blk ? "블록 행" : c?.kind === "delay" ? "대기 행" : c?.kind === "test" ? "TEST 행" : "v1 행"}</span>
                      <b className="shrink-0 text-[12px] text-[#1B1F24]">{rowName(r, i)}</b>
                      <span className="truncate text-[12px] text-[#5B6470]">{blk ? `블록 ${(r.blocks as unknown[]).length}개` : rowLine(r)}</span>
                    </button>
                    {c && (c.errors.length ? <span className="text-[12px] font-semibold text-[#B42318]">오류 {c.errors.length}</span>
                      : c.warnings.length ? <span className="text-[12px] text-[#B54708]">경고 {c.warnings.length}</span> : <span className="text-[12px] text-[#3A424D]">통과</span>)}
                    {recipes.canEdit && (
                      <span className="flex gap-0.5">
                        <button onClick={() => rowAct(i, "up")} className="rounded p-0.5 text-[#8A929D] hover:bg-[#EEF0F3]" aria-label="위로"><ArrowUp size={12} /></button>
                        <button onClick={() => rowAct(i, "down")} className="rounded p-0.5 text-[#8A929D] hover:bg-[#EEF0F3]" aria-label="아래로"><ArrowDown size={12} /></button>
                        <button onClick={() => rowAct(i, "copy")} className="rounded p-0.5 text-[#8A929D] hover:bg-[#EEF0F3]" aria-label="복사"><Copy size={12} /></button>
                        {!blk && <button onClick={() => rowAct(i, "toBlocks")} title="이 행의 기본 템플릿을 블록 행으로(원래 행은 그대로)" className="rounded p-0.5 text-[#1D4ED8] hover:bg-[#E8EEFC]"><Layers size={12} /></button>}
                        <button onClick={() => rowAct(i, "delete")} className="rounded p-0.5 text-[#B42318] hover:bg-[#FEE4E2]" aria-label="지우기"><Trash2 size={12} /></button>
                      </span>
                    )}
                    {hasKind(bundle, KINDS.load) && (
                      <Btn small onClick={() => loadRow(i)} disabled={!can(kLoad) || !!c?.errors.length || dirty}
                        title={dirty ? "저장 안 한 변경" : c?.errors.length ? "웹 검사 오류" : `CH${ch} 에 이 행만 적재`}><Upload size={11} /> 이 행만 적재</Btn>
                    )}
                  </div>
                  {c && (c.errors.length > 0 || (o && c.warnings.length > 0)) && (
                    <ul className="mt-1 space-y-0.5 pl-8">
                      {c.errors.slice(0, o ? 50 : 3).map((m, k) => <li key={k} className="text-[12px] text-[#B42318]">{m}</li>)}
                      {o && c.warnings.map((m, k) => <li key={`w${k}`} className="text-[12px] text-[#B54708]">{m}</li>)}
                    </ul>
                  )}
                  {o && (
                    <div className="mt-2 border-t border-[#E3E6EA] pt-2">
                      {blk && (
                        <label className="mb-1.5 flex items-center gap-2 text-[12px] text-[#5B6470]">행 이름
                          <input value={String(r.name ?? "")} readOnly={!recipes.canEdit} onChange={(e) => setRow(i, { ...r, name: e.target.value })}
                            className="w-56 rounded-md border border-[#D9DDE3] px-1.5 py-0.5 text-[12px]" placeholder="비면 번호" />
                        </label>
                      )}
                      {blk ? (
                        <Ch12BlockEditor blocks={r.blocks as Blk[]} env={env}
                          onChange={recipes.canEdit ? (b) => setRow(i, { ...r, blocks: b }) : undefined} />
                      ) : (
                        <V1RowForm b={bundle} row={r} readOnly={!recipes.canEdit} onRow={(nr) => setRow(i, nr)} />
                      )}
                      {detail && <pre className="mt-1 max-h-40 overflow-auto rounded bg-[#F5F6F8] p-1 text-[12px] text-[#5B6470]">{JSON.stringify(r)}</pre>}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>}
          {recipes.canEdit && !isPc && (
            <div className="flex flex-wrap gap-1.5">
              <Btn small onClick={() => { setRows([...d.rows, { name: "", blocks: [] }]); setOpenRow(d.rows.length); }}><Layers size={12} /> 블록 행 넣기</Btn>
              <Btn small onClick={() => { setRows([...d.rows, {}]); setOpenRow(d.rows.length); }}><FilePlus2 size={12} /> v1 행 넣기</Btn>
              <Btn small onClick={() => setRows([...d.rows, { Process_name: "delay 10m" }])}>대기 행 넣기</Btn>
            </div>
          )}
        </div>
      )}
      {askDel && (
        <SimpleConfirm title="레시피 지우기" ok="지우기" danger text="이 레시피를 지울까요? 되돌릴 수 없습니다."
          onCancel={() => setAskDel(null)}
          onOk={async () => { const id = askDel; setAskDel(null); const r = await recipes.remove(id);
            if (!r.ok) notify({ tone: "bad", title: "지우지 못함", text: RECIPE_ERROR[r.error] ?? r.error }); }} />
      )}
      {askLeave && (
        <SimpleConfirm title="저장 안 함" ok="버리고 나가기" danger text="저장하지 않은 변경이 있습니다. 버릴까요?"
          onCancel={() => setAskLeave(null)} onOk={() => { const go = askLeave; setAskLeave(null); go(); }} />
      )}
    </Card>
  );
}

/** 플라즈마 클리닝 레시피 칸(v1 PC 화면 칸 순서) — 채널·이름·숫자 5칸(이름·단위·범위, 범위는 묶음 PC_DEFAULT_*) */
function PcRowForm({ b, row, readOnly, onRow }: { b: Ch12Bundle | null; row: Row; readOnly: boolean; onRow: (r: Row) => void }) {
  const rg = pcRanges(b);
  const set = (k: string, v: string) => onRow({ ...row, [k]: v });
  return (
    <div className="space-y-2 rounded-[10px] border border-[#E3E6EA] p-3">
      <div className="flex flex-wrap items-end gap-3">
        {PC_FIELDS.map((f) => f.kind === "ch" ? (
          <label key={f.key} className={`flex flex-col gap-1 ${FS.small} text-[#5B6470]`}>
            <span className="font-semibold text-[#1B1F24]">{f.label}</span>
            <select value={String(row[f.key] ?? "1")} disabled={readOnly} onChange={(e) => set(f.key, e.target.value)} aria-label={f.label}
              className={`h-10 rounded-[10px] border border-[#D9DDE3] bg-white px-2 ${FS.body}`}>
              <option value="1">CH1</option><option value="2">CH2</option>
            </select>
          </label>
        ) : f.kind === "text" ? (
          <label key={f.key} className={`flex flex-col gap-1 ${FS.small} text-[#5B6470]`}>
            <span className="font-semibold text-[#1B1F24]">{f.label}</span>
            <input value={String(row[f.key] ?? "")} readOnly={readOnly} onChange={(e) => set(f.key, e.target.value)} aria-label={f.label}
              className={`h-10 w-44 rounded-[10px] border border-[#D9DDE3] bg-white px-2 ${FS.body}`} />
          </label>
        ) : (
          <NumField key={f.key} label={f.label} value={String(row[f.key] ?? "")} onChange={(v) => set(f.key, v)} disabled={readOnly}
            range={{ min: rg[f.key]?.min ?? null, max: rg[f.key]?.max ?? null, unit: f.unit }} />
        ))}
      </div>
      <p className={`${FS.small} text-[#5B6470]`}>{pcRowLine(row)} — 운전 탭 플라즈마 클리닝 칸에서 골라 불러오기·시작</p>
    </div>
  );
}
