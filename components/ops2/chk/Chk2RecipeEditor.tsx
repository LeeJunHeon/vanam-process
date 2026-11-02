"use client";

// 챔버K v2 레시피 편집(W-10 — 레시피 탭 안 넓은 편집 화면).
// 공정 레시피 3단: 왼쪽 행 목록(번호·이름·종류·단계 수·예상 시간·오류 수 — 끌기·↑↓·복제·삭제, 행 추가: 공정 행 / 대기 행 / 블록 공정)
//   · 가운데: 공정 행 = '공정 조건' 폼(묶음 recipe 열을 group 순서로 — label·단위·필수 *·조건부 칸(if:)은 체크하면 열림·범위·도움말·
//     오류는 칸 아래, 설정에서 꺼진 장비 열은 회색 + '장비 설정에서 꺼짐'), 대기 행 = 시간 하나, 블록 행 = 블록 목록(BlockTree)
//   · 오른쪽: 공정 행 = '공정 순서(자동)'(웹 검사의 기본 템플릿 펼침 — 블록별 한 줄·정해진 시간·예상 시간·정지 순서) + [직접 편집]
//     (그 행의 기본 템플릿으로 블록 행 — 확인창 '이 행 바꾸기(기본)' / '아래에 복사본'), 블록 행 = 고른 블록 설정(BlockPane) + 위로·아래로·복제·삭제.
// 히터 레시피도 같은 틀: 왼쪽 스텝 목록 · 가운데 스텝 설정 · 오른쪽 첫 행 가스·검사 문구.
// 시간 열(단위 min)은 분·초 칸(저장은 분 그대로 — inputs.minutesFor). 검사 문구는 칸을 건드린 뒤 또는 저장·적재를 누른 뒤(reveal)부터.
// 값은 칸에서 바로 행 객체로: 빈 칸·체크 해제는 키를 지우고, 숫자 모양이면 숫자, 아니면 글 그대로(검사가 "숫자여야 함").
import { useMemo, useState, type DragEvent, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Copy, GripVertical, Play, Plus, Repeat, Timer, Trash2, Wand2 } from "lucide-react";
import { delaySeconds, type ColDef, type RecipeCheck, type Row, type RowCheck } from "@/lib/ops2/chk/recipe";
import { expectedTime, type BlockEnv } from "@/lib/ops2/chk/blocks";
import { Btn, Chip, Empty, SimpleConfirm, Tile } from "./kit";
import { BlockPane, BlockTree, ExpandedView, TopMessages, countBlocks, fmtSec, fromJson, toJson, treeAct, type EBlock } from "./Chk2BlockEditor";
import { DurationInput, minutesFor } from "./inputs";
import { colRange, paramValue, rangeText } from "./logic";
import { useChk2Mode } from "./mode";
import { blockNames, colLabel, colNames, humanize, requiredText } from "./text";
import { isBlockRow } from "./recipeText";
import type { Bundle } from "./types";

export type ERow = { uid: string; data: Row };
let seq = 0;
export const newUid = () => `r${(seq += 1)}`;
export const toERows = (rows: Row[]): ERow[] => rows.map((data) => ({ uid: newUid(), data: { ...data } }));
export { isBlockRow };

const NUM_RE = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
const toText = (v: unknown) => (v === undefined || v === null ? "" : typeof v === "number" ? (v !== 0 && Math.abs(v) < 1e-3 ? v.toExponential() : String(v)) : String(v));
const parseCell = (t: string): unknown => (t.trim() === "" ? undefined : NUM_RE.test(t.trim()) ? Number(t.trim()) : t);

export function setKey(r: Row, k: string, v: unknown): Row {
  const n = { ...r };
  if (v === undefined) delete n[k];
  else n[k] = v;
  return n;
}

export type RowKind = "process" | "delay" | "blocks" | "empty";
export const rowKind = (r: Row): RowKind =>
  isBlockRow(r) ? "blocks" : delaySeconds(r.process_name) !== null && Object.keys(r).length === 1 ? "delay"
    : Object.keys(r).length ? "process" : "empty";
const KIND_LABEL: Record<RowKind, string> = { process: "공정 행", delay: "대기 행", blocks: "블록 공정", empty: "빈 행" };

/** 설정에서 꺼진 장비의 열(묶음에 열-장비 짝이 없어 이름으로) */
const DEVICE_COL: [RegExp, string][] = [[/rf_pulse/, "RFPULSE_ENABLED"], [/^base_pressure$/, "IG_ENABLED"], [/heater/, "HEATER_ENABLED"]];
const offCol = (b: Bundle | null, c: ColDef) => DEVICE_COL.some(([re, k]) => re.test(c.name) && paramValue(b, k) === false);

/** 검사 문구 한 줄(사람 말, 원문은 title·'상세') */
function Msg({ m, names, tone = "error" }: { m: string; names: Record<string, string>; tone?: "error" | "warn" }) {
  const { detail } = useChk2Mode();
  return (
    <p title={m} className={`text-[11px] leading-snug ${tone === "error" ? "font-semibold text-[#B42318]" : "text-[#B54708]"}`}>
      {humanize(m.replace(/^[a-z0-9_]+: /, ""), names)}{detail && <span className="ml-1 font-mono font-normal opacity-70">{m}</span>}
    </p>
  );
}

/** 레시피 열 칸 하나 — 라벨·필수 표시·칸(단위)·범위·도움말·오류 */
export function ColField({ col, cols, value, onChange, error, bundle, readOnly, names }: {
  col: ColDef; cols: ColDef[]; value: unknown; onChange: (v: unknown) => void; error?: string; bundle: Bundle | null;
  readOnly: boolean; names: Record<string, string>;
}) {
  const { detail } = useChk2Mode();
  const [text, setText] = useState(() => toText(value));
  const off = offCol(bundle, col);
  const ro = readOnly || off;
  const range = colRange(bundle, col);
  const req = requiredText(col, cols);
  const head = (
    <span className="text-xs font-medium text-[#1B1F24]">
      {colLabel(col)}{col.required === "always" && <span className="text-[#B42318]">*</span>}
      {req && col.required !== "always" && <span className="ml-1 text-[10px] font-normal text-[#5B6470]">{req}</span>}
      {detail && <span className="ml-1 font-mono text-[10px] font-normal text-[#8A929D]">{col.v1Name || col.name}</span>}
    </span>
  );
  let input: ReactNode;
  if (col.type === "bool") {
    input = (
      <label className="inline-flex h-9 items-center gap-2 text-xs">
        <input type="checkbox" checked={value === true} disabled={ro} aria-label={colLabel(col)}
          onChange={(e) => onChange(e.target.checked ? true : undefined)} className="h-4 w-4" />
        {value === true ? "사용" : "안 씀"}
      </label>
    );
  } else if (col.unit === "min" && (value === undefined || typeof value === "number")) {
    input = <DurationInput sec={typeof value === "number" ? Math.round(value * 60 * 1000) / 1000 : null} disabled={ro} error={!!error}
      label={colLabel(col)} onChange={(s) => onChange(s === null ? undefined : minutesFor(s))} />;
  } else {
    input = (
      <span className="inline-flex items-center gap-1.5">
        <input value={text} disabled={ro} inputMode={col.type === "str" ? "text" : "decimal"} aria-label={colLabel(col)}
          placeholder={range ? rangeText(range) : ""}
          onChange={(e) => { setText(e.target.value); onChange(col.type === "str" ? (e.target.value === "" ? undefined : e.target.value) : parseCell(e.target.value)); }}
          className={`h-9 ${col.type === "str" ? "w-56" : "w-32"} rounded-[8px] border bg-white px-2 text-xs tabular-nums placeholder:text-[#8A929D]
            disabled:bg-[#F5F6F8] disabled:text-[#8A929D] ${error ? "border-[#B42318] bg-[#FEE4E2]" : "border-[#D9DDE3]"}`} />
        {col.unit && <span className="text-[11px] text-[#5B6470]">{col.unit}</span>}
      </span>
    );
  }
  return (
    <div className={`grid gap-x-3 gap-y-0.5 py-1.5 sm:grid-cols-[9rem_minmax(0,1fr)] ${off ? "opacity-60" : ""}`}>
      <span className="pt-2">{head}</span>
      <span className="min-w-0">
        {input}
        {off && <span className="ml-2 text-[11px] text-[#5B6470]">장비 설정에서 꺼짐</span>}
        {range && col.type !== "bool" && col.unit !== "min" && <span className="ml-2 text-[10px] text-[#8A929D]">{rangeText(range)}</span>}
        {col.zeroIsEmpty && <span className="ml-2 text-[10px] text-[#8A929D]">0 = 빈 값</span>}
        {col.help && <span className="mt-0.5 block text-[10px] leading-snug text-[#5B6470]">{col.help}</span>}
        {error && <Msg m={error} names={names} />}
      </span>
    </div>
  );
}

const colError = (errors: string[], name: string, prefix = "") => errors.find((e) => e.startsWith(`${prefix}${name}: `));

// ───────────── 왼쪽: 행 목록 ─────────────
function RowList<T extends { uid: string }>({ items, sel, onSel, onMove, readOnly, render, onAct, addMenu }: {
  items: T[]; sel: string | null; onSel: (uid: string) => void; onMove: (from: number, to: number) => void; readOnly: boolean;
  render: (it: T, i: number) => ReactNode; onAct: (i: number, a: "up" | "down" | "copy" | "delete") => void; addMenu: ReactNode;
}) {
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  return (
    <div className="space-y-2">
      <ol className="space-y-1">
        {items.map((it, i) => (
          <li key={it.uid} draggable={!readOnly}
            onDragStart={(e: DragEvent) => { setDrag(i); e.dataTransfer.effectAllowed = "move"; }}
            onDragOver={(e: DragEvent) => { if (drag !== null) { e.preventDefault(); setOver(i); } }}
            onDragLeave={() => setOver((o) => (o === i ? null : o))}
            onDrop={(e: DragEvent) => { e.preventDefault(); if (drag !== null && drag !== i) onMove(drag, i); setDrag(null); setOver(null); }}
            onDragEnd={() => { setDrag(null); setOver(null); }}
            onClick={() => onSel(it.uid)}
            className={`group flex cursor-pointer items-start gap-1.5 rounded-[10px] border px-2 py-2 ${
              sel === it.uid ? "border-[#1D4ED8] bg-[#E8EEFC] ring-1 ring-[#1D4ED8]" : over === i ? "border-dashed border-[#1D4ED8]" : "border-[#E3E6EA] bg-white hover:border-[#C9CED6]"}
              ${drag === i ? "opacity-40" : ""}`}>
            {!readOnly && <GripVertical size={13} className="mt-0.5 shrink-0 cursor-grab text-[#8A929D]" />}
            <span className="mt-px w-5 shrink-0 text-right font-mono text-[11px] text-[#5B6470]">{i + 1}</span>
            <span className="min-w-0 flex-1">{render(it, i)}</span>
            {!readOnly && (
              <span className="flex shrink-0 gap-0.5 text-[#5B6470] opacity-70 group-hover:opacity-100">
                <IconB label="위로" disabled={i === 0} onClick={() => onAct(i, "up")}><ArrowUp size={13} /></IconB>
                <IconB label="아래로" disabled={i === items.length - 1} onClick={() => onAct(i, "down")}><ArrowDown size={13} /></IconB>
                <IconB label="복제" onClick={() => onAct(i, "copy")}><Copy size={13} /></IconB>
                <IconB label="삭제" onClick={() => onAct(i, "delete")}><Trash2 size={13} /></IconB>
              </span>
            )}
          </li>
        ))}
        {!items.length && <li className="rounded-[10px] border border-dashed border-[#D9DDE3] p-3 text-center text-[11px] text-[#5B6470]">비어 있습니다 — 아래에서 추가하세요</li>}
      </ol>
      {!readOnly && addMenu}
    </div>
  );
}

function IconB({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onClick(); }} disabled={disabled} aria-label={label} title={label}
      className="rounded p-0.5 hover:bg-[#F5F6F8] hover:text-[#1B1F24] disabled:opacity-30">{children}</button>
  );
}

const moveIn = <T,>(l: T[], from: number, to: number) => { const n = [...l]; const [m] = n.splice(from, 1); n.splice(to, 0, m); return n; };
function actIn<T>(l: T[], i: number, a: "up" | "down" | "copy" | "delete", copy: (x: T) => T): T[] {
  const n = [...l];
  if (a === "up" && i > 0) [n[i - 1], n[i]] = [n[i], n[i - 1]];
  if (a === "down" && i < n.length - 1) [n[i + 1], n[i]] = [n[i], n[i + 1]];
  if (a === "copy") n.splice(i + 1, 0, copy(n[i]));
  if (a === "delete") n.splice(i, 1);
  return n;
}

// ───────────── 공정 행: 가운데 폼 ─────────────
function ProcessForm({ row, cols, rc, bundle, readOnly, seen, onCell }: {
  row: ERow; cols: ColDef[]; rc: RowCheck | null; bundle: Bundle | null; readOnly: boolean; seen: (col: string) => boolean;
  onCell: (k: string, v: unknown) => void;
}) {
  const names = useMemo(() => ({ ...blockNames(bundle), ...colNames(cols) }), [bundle, cols]);
  const errs = rc?.errors ?? [], warns = rc?.warnings ?? [];
  const groups = [...new Set(cols.map((c) => c.group ?? ""))];
  // 조건부 칸(required "if:X")은 X 를 체크했거나 값이 있을 때만
  const shown = (c: ColDef) => {
    if (!c.required?.startsWith("if:")) return true;
    return row.data[c.required.slice(3)] === true || (row.data[c.name] !== undefined && row.data[c.name] !== null);
  };
  const rowLevel = errs.filter((e) => !cols.some((c) => e.startsWith(`${c.name}: `)));
  return (
    <div className="space-y-3">
      {seen("*") && rowLevel.map((m, i) => <Msg key={i} m={m} names={names} />)}
      {groups.map((g) => {
        const gc = cols.filter((c) => (c.group ?? "") === g && shown(c));
        if (!gc.length) return null;
        return (
          <Tile key={g || "-"} className="px-3 py-2">
            {g && <p className="mb-1 text-[11px] font-semibold text-[#5B6470]">{g}</p>}
            <div className="divide-y divide-[#F0F2F4]">
              {gc.map((c) => (
                <ColField key={`${row.uid}:${c.name}`} col={c} cols={cols} value={row.data[c.name]} bundle={bundle} readOnly={readOnly} names={names}
                  error={seen(c.name) ? colError(errs, c.name) : undefined} onChange={(v) => onCell(c.name, v)} />
              ))}
            </div>
          </Tile>
        );
      })}
      {seen("*") && warns.map((m, i) => <Msg key={`w${i}`} m={m} names={names} tone="warn" />)}
    </div>
  );
}

/** 오른쪽 — 공정 순서(자동) 미리보기 */
function AutoPreview({ rc, bundle, onDirect, startWhy, onStart, readOnly }: {
  rc: RowCheck | null; bundle: Bundle | null; onDirect: () => void; startWhy: string | null; onStart: () => void; readOnly: boolean;
}) {
  const [stop, setStop] = useState(false);
  const t = rc?.expanded ? expectedTime(rc.expanded) : null;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-bold text-[#1B1F24]">공정 순서(자동)</p>
        {t && <Chip>예상 {fmtSec(t.sec)}{t.open ? " 이상" : ""}</Chip>}
        <span className="ml-auto flex gap-2">
          {!readOnly && <Btn size="sm" lock={rc?.blocks ? null : "검사 오류를 고친 뒤"} onClick={onDirect}><Wand2 size={13} /> 직접 편집</Btn>}
          <Btn size="sm" kind="danger" lock={startWhy} onClick={onStart}><Play size={13} /> 이 행만 바로 시작</Btn>
        </span>
      </div>
      {rc?.expanded ? <div className="max-h-[32rem] overflow-y-auto rounded-[10px] bg-[#F5F6F8] p-2"><ExpandedView exp={rc.expanded} bundle={bundle} /></div>
        : <Empty>값을 채우고 오류를 고치면 장비가 할 순서가 여기에 보입니다</Empty>}
      {t && t.open > 0 && <p className="text-[11px] text-[#5B6470]">끝을 모르는 대기(압력·파워·히터 도달 등) {t.open}개 — 예상 시간은 그만큼 더 걸립니다</p>}
      <div>
        <button onClick={() => setStop((o) => !o)} className="flex items-center gap-1 text-[11px] font-semibold text-[#5B6470]">
          {stop ? <ChevronDown size={12} /> : <ChevronRight size={12} />} 정지 순서 보기
        </button>
        {stop && <ol className="mt-1 space-y-0.5 text-[11px] text-[#5B6470]">{(bundle?.stopSequence?.steps ?? []).map((s) => <li key={s.no}>{s.no}. {s.label || s.desc || s.act}</li>)}</ol>}
      </div>
    </div>
  );
}

/** 블록 행 — 가운데 목록 · 오른쪽 설정(그리드 두 칸을 차지) */
function BlockRowPanes({ row, rc, env, bundle, readOnly, onRow, startWhy, onStart }: {
  row: ERow; rc: RowCheck | null; env: BlockEnv | null; bundle: Bundle | null; readOnly: boolean; onRow: (r: Row) => void;
  startWhy: string | null; onStart: () => void;
}) {
  const [tree, setTree] = useState<EBlock[]>(() => (Array.isArray(row.data.blocks) ? row.data.blocks.map(fromJson) : []));
  const [sel, setSel] = useState<string | null>(() => tree[0]?.uid ?? null);
  const [preview, setPreview] = useState(false);
  const errors = rc?.errors ?? [], warnings = rc?.warnings ?? [];
  if (!env) return <div className="lg:col-span-2"><Empty>이 장비 정의에는 블록 정의가 없어(옛 장비) 블록 공정을 고칠 수 없습니다.</Empty></div>;
  const commit = (next: EBlock[]) => { setTree(next); onRow({ ...row.data, blocks: next.map(toJson) }); };
  const act = (a: "up" | "down" | "copy" | "delete") => { if (!sel) return; const r = treeAct(tree, sel, a, sel); commit(r.tree); setSel(r.sel); };
  const t = rc?.expanded ? expectedTime(rc.expanded) : null;
  return (
    <>
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-bold text-[#1B1F24]">블록 공정</p>
          <Chip>블록 {countBlocks(row.data.blocks)}개</Chip>
          {t && <Chip>예상 {fmtSec(t.sec)}{t.open ? " 이상" : ""}</Chip>}
        </div>
        <label className="block text-xs text-[#5B6470]">행 이름
          <input defaultValue={typeof row.data.process_name === "string" ? row.data.process_name : ""} disabled={readOnly} placeholder="비우면 장비가 정함"
            onChange={(e) => onRow(setKey({ ...row.data, blocks: tree.map(toJson) }, "process_name", e.target.value === "" ? undefined : e.target.value))}
            className="mt-0.5 h-9 w-full rounded-[8px] border border-[#D9DDE3] px-2 text-xs text-[#1B1F24] disabled:bg-[#F5F6F8]" />
        </label>
        <TopMessages errors={errors} bundle={bundle} />
        <BlockTree tree={tree} onTree={commit} sel={sel} onSel={setSel} env={env} bundle={bundle} readOnly={readOnly} errors={errors} warnings={warnings} />
        <p className="text-[11px] text-[#5B6470]">끝에 &apos;정상 끝 정지&apos;가 없으면 장비가 자동으로 붙입니다.</p>
      </div>
      <div className="min-w-0 space-y-3">
        <div className="rounded-[12px] border border-[#D9DDE3] bg-white p-3">
          {!readOnly && sel && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              <Btn size="sm" onClick={() => act("up")}><ArrowUp size={13} /> 위로</Btn>
              <Btn size="sm" onClick={() => act("down")}><ArrowDown size={13} /> 아래로</Btn>
              <Btn size="sm" onClick={() => act("copy")}><Copy size={13} /> 복제</Btn>
              <Btn size="sm" kind="danger" onClick={() => act("delete")}><Trash2 size={13} /> 삭제</Btn>
            </div>
          )}
          <BlockPane tree={tree} sel={sel} env={env} bundle={bundle} readOnly={readOnly} errors={errors} warnings={warnings} onTree={commit} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setPreview((o) => !o)} className="flex items-center gap-1 text-[11px] font-semibold text-[#5B6470]">
            {preview ? <ChevronDown size={12} /> : <ChevronRight size={12} />} 실행 순서 미리보기
          </button>
          <span className="ml-auto"><Btn size="sm" kind="danger" lock={startWhy} onClick={onStart}><Play size={13} /> 이 행만 바로 시작</Btn></span>
        </div>
        {preview && (rc?.expanded ? <div className="max-h-96 overflow-y-auto rounded-[10px] bg-[#F5F6F8] p-2"><ExpandedView exp={rc.expanded} bundle={bundle} /></div>
          : <Empty>{errors.length ? "오류를 고치면 실행 순서가 보입니다" : "블록을 넣으세요"}</Empty>)}
      </div>
    </>
  );
}

/** 공정 레시피 편집 — 3단 */
export function ProcessEditor({ cols, rows, check, env, bundle, readOnly, reveal, sel, onSel, onRows, rowStartWhy, onStartRow }: {
  cols: ColDef[]; rows: ERow[]; check: RecipeCheck | null; env: BlockEnv | null; bundle: Bundle | null; readOnly: boolean;
  reveal: boolean; sel: string | null; onSel: (uid: string | null) => void; onRows: (f: (rows: ERow[]) => ERow[]) => void;
  rowStartWhy: (i: number) => string | null; onStartRow: (i: number) => void;
}) {
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [direct, setDirect] = useState<number | null>(null);
  const [add, setAdd] = useState(false);
  const i = sel ? rows.findIndex((r) => r.uid === sel) : -1;
  const row = i >= 0 ? rows[i] : null;
  const rc = i >= 0 ? check?.rows[i] ?? null : null;
  const seen = (uid: string) => (c: string) => reveal || (c === "*" ? Object.keys(touched).some((k) => k.startsWith(`${uid}:`)) : !!touched[`${uid}:${c}`]);
  const setCell = (uid: string, k: string, v: unknown) => {
    setTouched((t) => (t[`${uid}:${k}`] ? t : { ...t, [`${uid}:${k}`]: true }));
    onRows((l) => l.map((r) => (r.uid === uid ? { ...r, data: setKey(r.data, k, v) } : r)));
  };
  const addRow = (data: Row) => {
    const n = { uid: newUid(), data };
    onRows((l) => (i >= 0 ? [...l.slice(0, i + 1), n, ...l.slice(i + 1)] : [...l, n]));
    onSel(n.uid);
    setAdd(false);
  };
  const doDirect = (copy: boolean) => {
    const k = direct;
    setDirect(null);
    const c = k === null ? null : check?.rows[k];
    if (k === null || !c?.blocks) return;
    const src = rows[k].data;
    const name = typeof src.process_name === "string" && src.process_name ? `${src.process_name}${copy ? " (블록)" : ""}` : "";
    const data: Row = { ...(name ? { process_name: name } : {}), blocks: JSON.parse(JSON.stringify(c.blocks)) };
    if (copy) {
      const n = { uid: newUid(), data };
      onRows((l) => [...l.slice(0, k + 1), n, ...l.slice(k + 1)]);
      onSel(n.uid);
    } else {
      const uid = newUid();
      onRows((l) => l.map((r, j) => (j === k ? { uid, data } : r)));
      onSel(uid);
    }
  };
  const names = useMemo(() => ({ ...blockNames(bundle), ...colNames(cols) }), [bundle, cols]);
  return (
    <div className="grid items-start gap-3 lg:grid-cols-[minmax(240px,300px)_minmax(0,1fr)] 2xl:grid-cols-[minmax(260px,320px)_minmax(0,1.1fr)_minmax(0,1fr)]">
      <RowList items={rows} sel={sel} onSel={onSel} readOnly={readOnly}
        onMove={(a, b) => onRows((l) => moveIn(l, a, b))}
        onAct={(k, a) => onRows((l) => actIn(l, k, a, (x) => ({ uid: newUid(), data: JSON.parse(JSON.stringify(x.data)) })))}
        render={(r, k) => {
          const c = check?.rows[k];
          const kind = rowKind(r.data);
          const n = c?.expanded ? c.expanded.reduce((s, b) => s + b.steps.filter((x) => !x.internal).length, 0) : 0;
          const t = kind === "delay" ? { sec: delaySeconds(r.data.process_name) ?? 0, open: 0 } : c?.expanded ? expectedTime(c.expanded) : null;
          const errs = c?.errors.length ?? 0;
          const show = errs && (reveal || Object.keys(touched).some((x) => x.startsWith(`${r.uid}:`)));
          return (
            <>
              <span className="flex items-center gap-1.5">
                <span className="truncate text-xs font-semibold text-[#1B1F24]">
                  {kind === "delay" ? `대기 ${fmtSec(delaySeconds(r.data.process_name) ?? 0)}` : typeof r.data.process_name === "string" && r.data.process_name ? r.data.process_name : "(이름 없음)"}
                </span>
                {show ? <Chip tone="alarm">오류 {errs}</Chip> : null}
              </span>
              <span className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-[#5B6470]">
                <span>{KIND_LABEL[kind]}</span>
                {n > 0 && <span>단계 {n}</span>}
                {t && (t.sec > 0 || t.open > 0) && <span>{fmtSec(t.sec)}{t.open ? " 이상" : ""}</span>}
              </span>
            </>
          );
        }}
        addMenu={
          <div className="relative">
            <Btn onClick={() => setAdd((o) => !o)}><Plus size={14} /> 행 추가</Btn>
            {add && (
              <div className="absolute left-0 z-20 mt-1 w-48 rounded-[10px] border border-[#D9DDE3] bg-white p-1 text-xs shadow-lg">
                <button onClick={() => addRow({})} className="flex w-full items-center gap-2 rounded-[8px] px-2 py-2 hover:bg-[#F5F6F8]"><Plus size={13} /> 공정 행</button>
                <button onClick={() => addRow({ process_name: "delay 60s" })} className="flex w-full items-center gap-2 rounded-[8px] px-2 py-2 hover:bg-[#F5F6F8]"><Timer size={13} /> 대기 행(60초)</button>
                <button onClick={() => addRow({ blocks: [] })} className="flex w-full items-center gap-2 rounded-[8px] px-2 py-2 hover:bg-[#F5F6F8]"><Repeat size={13} /> 블록 공정</button>
              </div>
            )}
          </div>
        } />

      {!row ? (
        <div className="2xl:col-span-2"><Empty>왼쪽에서 행을 고르거나 &apos;행 추가&apos;로 시작하세요</Empty></div>
      ) : rowKind(row.data) === "blocks" ? (
        <BlockRowPanes key={row.uid} row={row} rc={rc} env={env} bundle={bundle} readOnly={readOnly}
          onRow={(data) => onRows((l) => l.map((r) => (r.uid === row.uid ? { ...r, data } : r)))}
          startWhy={rowStartWhy(i)} onStart={() => onStartRow(i)} />
      ) : rowKind(row.data) === "delay" ? (
        <div className="space-y-2 2xl:col-span-2">
          <p className="text-sm font-bold text-[#1B1F24]">대기 행</p>
          <Tile className="p-3">
            <div className="grid gap-x-3 sm:grid-cols-[9rem_minmax(0,1fr)]">
              <span className="pt-2 text-xs font-medium text-[#1B1F24]">대기 시간<span className="text-[#B42318]">*</span></span>
              <span>
                <DurationInput key={row.uid} sec={delaySeconds(row.data.process_name)} label="대기 시간" disabled={readOnly}
                  onChange={(s) => setCell(row.uid, "process_name", `delay ${s ?? 0}s`)} />
                <span className="mt-0.5 block text-[10px] text-[#5B6470]">앞 행이 끝난 뒤 다음 행까지 기다립니다</span>
                {(rc?.errors ?? []).map((m, k) => <Msg key={k} m={m} names={names} />)}
              </span>
            </div>
          </Tile>
        </div>
      ) : (
        <>
          <div className="min-w-0 space-y-2">
            <p className="text-sm font-bold text-[#1B1F24]">공정 조건</p>
            <ProcessForm key={row.uid} row={row} cols={cols} rc={rc} bundle={bundle} readOnly={readOnly} seen={seen(row.uid)}
              onCell={(k, v) => setCell(row.uid, k, v)} />
          </div>
          <div className="min-w-0 lg:col-span-2 2xl:col-span-1">
            <AutoPreview rc={rc} bundle={bundle} readOnly={readOnly} onDirect={() => setDirect(i)} startWhy={rowStartWhy(i)} onStart={() => onStartRow(i)} />
          </div>
        </>
      )}

      {direct !== null && (
        <SimpleConfirm title="직접 편집(블록 공정으로)" ok="이 행 바꾸기(기본)"
          text={<>{direct + 1}행을 같은 순서의 블록 {check?.rows[direct]?.blocks?.length ?? "-"}개로 된 블록 공정으로 바꿉니다.
            블록 공정은 자동으로 되돌리지 않습니다(저장 전에는 &apos;취소&apos;로). 원래 행을 남기려면 &apos;아래에 복사본&apos;.</>}
          alt={{ label: "아래에 복사본", onClick: () => doDirect(true) }}
          onCancel={() => setDirect(null)} onOk={() => doDirect(false)} />
      )}
    </div>
  );
}

// ───────────── 히터 레시피 ─────────────
export function HeaterEditor({ stepCols, gasCols, steps, gas, errors, warnings, bundle, readOnly, reveal, sel, onSel, onSteps, onGas }: {
  stepCols: ColDef[]; gasCols: ColDef[]; steps: ERow[]; gas: Row; errors: string[]; warnings: string[]; bundle: Bundle | null;
  readOnly: boolean; reveal: boolean; sel: string | null; onSel: (uid: string | null) => void;
  onSteps: (f: (rows: ERow[]) => ERow[]) => void; onGas: (g: Row) => void;
}) {
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const names = useMemo(() => colNames([...stepCols, ...gasCols]), [stepCols, gasCols]);
  const all = [...stepCols, ...gasCols];
  const i = sel ? steps.findIndex((s) => s.uid === sel) : -1;
  const step = i >= 0 ? steps[i] : null;
  const pre = (k: number) => `스텝 ${k + 1}: `;
  const stepErr = (k: number) => errors.filter((e) => e.startsWith(pre(k)));
  const other = errors.filter((e) => !/^스텝 \d+: /.test(e) && !gasCols.some((c) => e.startsWith(`가스: ${c.name}: `)));
  const v = (x: unknown) => (x === undefined || x === null || x === "" ? "?" : String(x));
  return (
    <div className="grid items-start gap-3 lg:grid-cols-[minmax(240px,300px)_minmax(0,1fr)] 2xl:grid-cols-[minmax(260px,320px)_minmax(0,1.1fr)_minmax(0,1fr)]">
      <RowList items={steps} sel={sel} onSel={onSel} readOnly={readOnly}
        onMove={(a, b) => onSteps((l) => moveIn(l, a, b))}
        onAct={(k, a) => onSteps((l) => actIn(l, k, a, (x) => ({ uid: newUid(), data: { ...x.data } })))}
        render={(s, k) => {
          const n = stepErr(k).length;
          const show = n && (reveal || Object.keys(touched).some((x) => x.startsWith(`${s.uid}:`)));
          return (
            <>
              <span className="flex items-center gap-1.5">
                <span className="truncate text-xs font-semibold text-[#1B1F24]">목표 {v(s.data.target_c)} °C</span>
                {show ? <Chip tone="alarm">오류 {n}</Chip> : null}
              </span>
              <span className="text-[11px] text-[#5B6470]">
                {s.data.ramp_c_per_min !== undefined ? `승온 ${v(s.data.ramp_c_per_min)} °C/min` : s.data.ramp_min !== undefined ? `승온 ${v(s.data.ramp_min)}분` : "승온 기본"}
                {s.data.soak_min !== undefined && ` · 유지 ${v(s.data.soak_min)}분`}{s.data.repeat !== undefined && ` · 반복 ${v(s.data.repeat)}회`}
              </span>
            </>
          );
        }}
        addMenu={<Btn onClick={() => { const n = { uid: newUid(), data: {} }; onSteps((l) => [...l, n]); onSel(n.uid); }}><Plus size={14} /> 스텝 추가</Btn>} />
      <div className="min-w-0 space-y-2">
        <p className="text-sm font-bold text-[#1B1F24]">{step ? `스텝 ${i + 1} 설정` : "스텝 설정"}</p>
        {step ? (
          <Tile key={step.uid} className="px-3 py-2">
            <div className="divide-y divide-[#F0F2F4]">
              {stepCols.map((c) => (
                <ColField key={`${step.uid}:${c.name}`} col={c} cols={all} value={step.data[c.name]} bundle={bundle} readOnly={readOnly} names={names}
                  error={reveal || touched[`${step.uid}:${c.name}`] ? colError(stepErr(i), c.name, pre(i))?.slice(pre(i).length) : undefined}
                  onChange={(x) => {
                    setTouched((t) => ({ ...t, [`${step.uid}:${c.name}`]: true }));
                    onSteps((l) => l.map((s) => (s.uid === step.uid ? { ...s, data: setKey(s.data, c.name, x) } : s)));
                  }} />
              ))}
            </div>
            {reveal && stepErr(i).filter((e) => !stepCols.some((c) => e.startsWith(`${pre(i)}${c.name}: `))).map((m, k) => <Msg key={k} m={m.slice(pre(i).length)} names={names} />)}
          </Tile>
        ) : <Empty>왼쪽에서 스텝을 고르세요</Empty>}
      </div>
      <div className="min-w-0 space-y-2 lg:col-span-2 2xl:col-span-1">
        <p className="text-sm font-bold text-[#1B1F24]">가스(선택 — 비우면 가스 없이 승온)</p>
        <Tile className="px-3 py-2">
          <div className="divide-y divide-[#F0F2F4]">
            {gasCols.filter((c) => !c.required?.startsWith("if:") || gas[c.required.slice(3)] === true || gas[c.name] !== undefined).map((c) => (
              <ColField key={c.name} col={c} cols={all} value={gas[c.name]} bundle={bundle} readOnly={readOnly} names={names}
                error={reveal || touched[`gas:${c.name}`] ? colError(errors, c.name, "가스: ")?.slice(4) : undefined}
                onChange={(x) => { setTouched((t) => ({ ...t, [`gas:${c.name}`]: true })); onGas(setKey(gas, c.name, x)); }} />
            ))}
          </div>
        </Tile>
        {reveal && other.map((m, k) => <Msg key={k} m={m} names={names} />)}
        {reveal && warnings.map((m, k) => <Msg key={`w${k}`} m={m} names={names} tone="warn" />)}
      </div>
    </div>
  );
}
