"use client";

// 챔버12 블록 편집기 — 레시피 블록 행(블록 목록)을 고치는 칸. 챔버K Chk2BlockEditor 의 모양(블록 줄 · 펼쳐 값 고치기 · 위/아래/지우기 ·
// 종류 골라 넣기 · 검사 배지)을 따르되 챔버12 블록은 평평한 목록(반복·자식 없음)이라 따로 썼다.
// 검사는 장비와 같은 계산 lib/ops2/ch12/blocks.ts checkBlocks(값 범위·형식·장비 지원·같은 블록 안 값의 짝 — 순서 규칙 없음)·
// autoEndStop(끝 정지가 저절로 붙는가). 정의(값 형식·단위·범위·enum·필수·챔버 전용·필요 지원)는 묶음 blocks.defs.
// lockUpto 가 있으면(공정 중 시퀀스 편집) 앞 lockUpto 개 블록은 시작한 블록 — 고치기·옮기기·지우기 없음.
// 값 칸: float·int = 숫자 글(숫자면 숫자, 아니면 글 그대로 — 검사 오류로 보인다), bool = 체크, enum = 고르기, list·parts = 여러 개 체크,
// off = 숫자(µs) 또는 DC, str = 글. 빈 칸 = null(정의 default — "cfg:키" 는 공정 시작 때 설정 값).
import { useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Lock, Plus, Trash2 } from "lucide-react";
import { autoEndStop, checkBlocks, type BParamDef, type BlockDef, type Ch12Env } from "@/lib/ops2/ch12/blocks";
import { useChk2Mode } from "../chk/mode";
import { short } from "./logic";

export type Blk = { type: string; params: Record<string, unknown>; label?: string; row?: number };

/** 검사 문구 → 블록 번호(1부터). "블록 3(gas_intro): …" */
export const msgBlock = (m: string): number | null => {
  const x = /^블록 (\d+)[(:]/.exec(m);
  return x ? Number(x[1]) : null;
};

/** 새 블록 — 정의 default(문자열 "cfg:" 는 비움) */
export function newBlock(def: BlockDef): Blk {
  const params: Record<string, unknown> = {};
  for (const p of def.params) params[p.name] = typeof p.default === "string" && p.default.startsWith("cfg:") ? null : p.default ?? null;
  return { type: def.type, params, label: "" };
}

/** 블록 한 줄 요약 — 값이 있는 것만 "이름 값 단위" */
export function blockSummary(def: BlockDef | undefined, params: Record<string, unknown>): string {
  if (!def) return "";
  return def.params.map((p) => {
    const v = params?.[p.name];
    if (v === null || v === undefined || v === "" || v === false || (Array.isArray(v) && !v.length)) return null;
    const n = p.label || p.name;
    if (v === true) return n;
    if (Array.isArray(v)) return `${n} ${v.join("·")}`;
    return `${n} ${short(v)}${p.unit ? ` ${p.unit}` : ""}`;
  }).filter(Boolean).join(" · ");
}

function ParamInput({ p, value, onChange, disabled }: { p: BParamDef; value: unknown; onChange: (v: unknown) => void; disabled?: boolean }) {
  const [text, setText] = useState<string | null>(null);         // 고치는 중인 글(숫자 칸)
  const cls = "rounded-md border border-gray-200 px-1.5 py-0.5 text-[11px] disabled:bg-gray-50";
  const en = (p.enum ?? []).map(String);
  if (p.type === "bool") {
    return <input type="checkbox" disabled={disabled} checked={value === true} onChange={(e) => onChange(e.target.checked)} />;
  }
  if (p.type === "enum") {
    return (
      <select disabled={disabled} value={value === null || value === undefined ? "" : String(value)} className={cls}
        onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}>
        <option value="">(비움)</option>
        {en.map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
    );
  }
  if (p.type === "list" || p.type === "parts") {
    const cur = Array.isArray(value) ? value.map(String) : [];
    return (
      <span className="flex flex-wrap gap-x-2 gap-y-0.5">
        {en.map((x) => (
          <label key={x} className="flex items-center gap-1 text-[11px] text-gray-600">
            <input type="checkbox" disabled={disabled} checked={cur.includes(x)}
              onChange={(e) => onChange(e.target.checked ? en.filter((y) => y === x || cur.includes(y)) : cur.filter((y) => y !== x))} />
            {x}
          </label>
        ))}
      </span>
    );
  }
  const shown = text ?? (value === null || value === undefined ? "" : String(value));
  const commit = (t: string) => {
    const s = t.trim();
    if (s === "") return onChange(null);
    if (p.type === "str") return onChange(t);
    if (p.type === "off" && s.toUpperCase() === "DC") return onChange("DC");
    const n = Number(s);
    onChange(Number.isFinite(n) ? n : t);
  };
  return (
    <input disabled={disabled} value={shown} inputMode={p.type === "str" ? "text" : "decimal"}
      placeholder={p.default !== null && p.default !== undefined ? `기본 ${String(p.default)}` : p.required ? "필수" : ""}
      onChange={(e) => { setText(e.target.value); commit(e.target.value); }} onBlur={() => setText(null)}
      className={`${cls} ${p.type === "str" ? "w-40" : "w-24 tabular-nums"}`} />
  );
}

/** 블록 하나의 값 칸들 */
export function BlockParams({ def, b, onChange, disabled }: { def: BlockDef; b: Blk; onChange: (b: Blk) => void; disabled?: boolean }) {
  const { detail } = useChk2Mode();
  return (
    <div className="space-y-1">
      {def.params.map((p) => (
        <div key={p.name} className="flex flex-wrap items-center gap-2 text-[11px]" title={p.desc || undefined}>
          <span className="w-36 shrink-0 text-gray-500">{p.label || p.name}{p.required && <b className="text-rose-500"> *</b>}
            {detail && <span className="block font-mono text-[10px] text-gray-300">{p.name}</span>}</span>
          <ParamInput p={p} value={b.params?.[p.name]} disabled={disabled}
            onChange={(v) => onChange({ ...b, params: { ...b.params, [p.name]: v } })} />
          <span className="text-[10px] text-gray-400">{p.unit}{p.min !== null || p.max !== null ? ` ${p.min ?? ""}~${p.max ?? ""}` : ""}</span>
          {p.desc && <span className="text-[10px] text-gray-400">{p.desc}</span>}
        </div>
      ))}
      <div className="flex items-center gap-2 text-[11px]">
        <span className="w-36 shrink-0 text-gray-500">이름표</span>
        <input disabled={disabled} value={b.label ?? ""} onChange={(e) => onChange({ ...b, label: e.target.value })}
          className="w-56 rounded-md border border-gray-200 px-1.5 py-0.5 text-[11px]" placeholder="(비움 — 정의 이름)" />
      </div>
      {!def.params.length && <p className="text-[10px] text-gray-400">값 없음</p>}
    </div>
  );
}

/** 블록 종류 고르기 + 넣기 */
export function AddBlock({ env, onAdd, label = "블록 넣기" }: { env: Ch12Env; onAdd: (b: Blk) => void; label?: string }) {
  const [t, setT] = useState("");
  const defs = env.defs.blocks.defs.filter((d) => (d.chamber === null || d.chamber === env.chamber) && (!d.needs || env.caps[d.needs as keyof typeof env.caps]));
  return (
    <span className="flex items-center gap-1.5">
      <select value={t} onChange={(e) => setT(e.target.value)} className="rounded-md border border-gray-200 px-1.5 py-1 text-[11px]">
        <option value="">종류 고르기…</option>
        {defs.map((d) => <option key={d.type} value={d.type}>{d.label}</option>)}
      </select>
      <button disabled={!t} onClick={() => { const d = env.byType.get(t); if (d) onAdd(newBlock(d)); setT(""); }}
        className="flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40">
        <Plus size={12} /> {label}
      </button>
    </span>
  );
}

/** 블록 목록 편집기. onChange 가 없으면 읽기만 */
export default function Ch12BlockEditor({ blocks, env, onChange, lockUpto = 0, current }: {
  blocks: Blk[]; env: Ch12Env | null; onChange?: (b: Blk[]) => void; lockUpto?: number; current?: number | null;
}) {
  const { detail } = useChk2Mode();
  const [open, setOpen] = useState<number | null>(null);
  if (!env) {
    return <p className="rounded-lg bg-amber-50 p-2 text-[11px] text-amber-800">장비 블록 정의 판이 이 웹과 달라 웹 검사·편집을 하지 않습니다 — 장비가 검사합니다.</p>;
  }
  const r = checkBlocks(blocks, env);
  const errOf = (i: number) => r.errors.filter((m) => msgBlock(m) === i + 1);
  const warnOf = (i: number) => r.warnings.filter((m) => msgBlock(m) === i + 1);
  const other = r.errors.filter((m) => msgBlock(m) === null);
  const set = (i: number, b: Blk) => onChange?.(blocks.map((x, k) => (k === i ? b : x)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (!onChange || j < lockUpto || j >= blocks.length) return;
    const n = [...blocks];
    [n[i], n[j]] = [n[j], n[i]];
    onChange(n);
    setOpen(null);
  };
  const auto = r.clean ? autoEndStop(r.clean, env) : false;
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className={`rounded px-1.5 py-0.5 font-semibold ${r.errors.length ? "bg-rose-50 text-rose-700" : r.warnings.length ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
          {r.errors.length ? `오류 ${r.errors.length}` : r.warnings.length ? `경고 ${r.warnings.length}` : "검사 통과"}
        </span>
        <span className="text-gray-500">블록 {blocks.length}개 · CH{env.chamber} 기준</span>
        {auto && <span className="text-gray-500">· 끝에 「{env.defs.blocks.autoEndStopLabel}」이 붙습니다(파워 끄기 포함)</span>}
      </div>
      {other.map((m, i) => <p key={i} className="text-[11px] text-rose-600">{m}</p>)}
      <ol className="space-y-1">
        {blocks.map((b, i) => {
          const def = env.byType.get(b.type);
          const locked = i < lockUpto;
          const errs = errOf(i), warns = warnOf(i);
          const o = open === i;
          return (
            <li key={i} className={`rounded-xl border ${current === i ? "border-blue-300 bg-blue-50/40" : locked ? "border-gray-100 bg-gray-50" : errs.length ? "border-rose-200" : "border-gray-100"} px-2 py-1.5`}>
              <div className="flex items-center gap-1.5">
                <button onClick={() => setOpen(o ? null : i)} className="flex min-w-0 flex-1 items-center gap-1 text-left">
                  {o ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  <span className="w-6 shrink-0 text-right font-mono text-[10px] text-gray-400">{i + 1}</span>
                  <b className="shrink-0 text-xs text-gray-900">{def?.label ?? b.type}</b>
                  {b.label && <span className="shrink-0 text-[11px] text-gray-500">({b.label})</span>}
                  <span className="truncate text-[11px] text-gray-500">{blockSummary(def, b.params)}</span>
                  {detail && <span className="shrink-0 font-mono text-[10px] text-gray-300">{b.type}</span>}
                </button>
                {locked && <span className="flex items-center gap-0.5 text-[10px] text-gray-400"><Lock size={10} />{current === i ? "지금" : "지남"}</span>}
                {def?.skippable && <span className="text-[9px] text-gray-400" title="공정 중 건너뛸 수 있음">건너뛰기</span>}
                {def?.pausable && <span className="text-[9px] text-gray-400" title={def.pause}>일시정지</span>}
                {onChange && !locked && (
                  <>
                    <button onClick={() => move(i, -1)} disabled={i - 1 < lockUpto} className="rounded p-0.5 text-gray-400 hover:bg-gray-100 disabled:opacity-30" aria-label="위로"><ArrowUp size={12} /></button>
                    <button onClick={() => move(i, 1)} disabled={i + 1 >= blocks.length} className="rounded p-0.5 text-gray-400 hover:bg-gray-100 disabled:opacity-30" aria-label="아래로"><ArrowDown size={12} /></button>
                    <button onClick={() => { onChange(blocks.filter((_, k) => k !== i)); setOpen(null); }} className="rounded p-0.5 text-rose-400 hover:bg-rose-50" aria-label="지우기"><Trash2 size={12} /></button>
                  </>
                )}
              </div>
              {errs.map((m, k) => <p key={k} className="pl-8 text-[10px] text-rose-600">{m.replace(/^블록 \d+(\([^)]*\))?: /, "")}</p>)}
              {warns.map((m, k) => <p key={k} className="pl-8 text-[10px] text-amber-700">{m.replace(/^블록 \d+(\([^)]*\))?: /, "")}</p>)}
              {o && def && (
                <div className="mt-1.5 border-t border-gray-100 pl-8 pt-1.5">
                  {def.desc && <p className="mb-1 text-[10px] text-gray-400">{def.desc}</p>}
                  <BlockParams def={def} b={b} disabled={!onChange || locked} onChange={(nb) => set(i, nb)} />
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {onChange && <AddBlock env={env} onAdd={(b) => { onChange([...blocks, b]); setOpen(blocks.length); }} />}
    </div>
  );
}
