"use client";

// 챔버K v2 블록 편집기 — 공정 레시피 안의 "블록 행"({process_name, blocks}) 하나를 고친다.
// 왼쪽: 블록 목록(추가는 묶음 defs 종류, 복사·삭제·위아래), 블록마다 값 폼(묶음 정의의 형식·enum·단위·범위 — paramScale 반영,
// 비운 값은 기본값을 회색으로), label·stage, 반복은 안쪽 목록(중첩 한도 limits.maxDepth), 조건 대기는 condFields·condOps,
// 대기·메인·조건 대기는 감시(watchItems). 블록마다 웹 검사 결과(오류·경고 — "블록 3(...)" 문구를 그 블록에 붙인다).
// 오른쪽: 펼친 단계 미리보기(blocks.ts expandBlocks — 번호·종류·단계 문구·시간, 반복은 회차로 묶어 접기).
// 블록 JSON 은 장비가 받는 그대로(모르는 키도 지우지 않는다 — 장비와 같은 검사). 편집 중 칸 글은 블록마다 uid 로 붙든다.
import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, ChevronDown, ChevronRight, Copy, Play, Plus, Repeat, Trash2 } from "lucide-react";
import type { Row, RowCheck } from "@/lib/ops2/chk/recipe";
import { expectedTime, type BParamDef, type BlockDef, type BlockEnv, type ExpBlock, type Uses } from "@/lib/ops2/chk/blocks";
import { stateLabel, type Bundle } from "./types";

// ───────────── 편집 모델 ─────────────
export type EBlock = { uid: string; data: unknown; kids: EBlock[] | null };
let seq = 0;
const uid = () => `b${(seq += 1)}`;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export function fromJson(b: unknown): EBlock {
  if (isObj(b) && Array.isArray(b.blocks)) {
    const { blocks, ...rest } = b;
    return { uid: uid(), data: rest, kids: (blocks as unknown[]).map(fromJson) };
  }
  return { uid: uid(), data: isObj(b) ? { ...b } : b, kids: null };
}
export function toJson(e: EBlock): unknown {
  return e.kids && isObj(e.data) ? { ...e.data, blocks: e.kids.map(toJson) } : e.data;
}
const cloneE = (e: EBlock): EBlock => fromJson(JSON.parse(JSON.stringify(toJson(e))));

/** 목록 안 uid 의 블록을 바꾼다(반복 안쪽까지) */
function mapTree(list: EBlock[], id: string, f: (l: EBlock[], i: number) => EBlock[]): EBlock[] {
  const i = list.findIndex((x) => x.uid === id);
  if (i >= 0) return f(list, i);
  return list.map((x) => (x.kids ? { ...x, kids: mapTree(x.kids, id, f) } : x));
}

// ───────────── 표시 도움 ─────────────
const USE_LABEL: [keyof Uses, string][] = [
  ["dc", "DC"], ["rf", "RF"], ["rfp", "RF Pulse"], ["heater", "히터"], ["ig", "이온 게이지"], ["ar", "Ar"], ["o2", "O₂"],
];
export const usesText = (u: Uses | null) => (u ? USE_LABEL.filter(([k]) => u[k]).map(([, l]) => l).join("·") || "없음" : "-");

/** 3725 → "1시간 2분 5초" */
export function fmtSec(s: number): string {
  const t = Math.round(s);
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), x = t % 60;
  return [h && `${h}시간`, m && `${m}분`, (x || (!h && !m)) && `${x}초`].filter(Boolean).join(" ");
}

const countBlocks = (bs: unknown): number =>
  Array.isArray(bs) ? bs.reduce((n: number, b) => n + 1 + (isObj(b) ? countBlocks(b.blocks) : 0), 0) : 0;
const stepCount = (exp: ExpBlock[] | null) => (exp ? exp.reduce((n, b) => n + b.steps.filter((s) => !s.internal).length, 0) : 0);

/** 확인창·표에 쓰는 블록 행 요약 */
export function blockRowLines(row: Row, rc: RowCheck | null): string[] {
  const n = countBlocks(row.blocks);
  const t = rc?.expanded ? expectedTime(rc.expanded) : null;
  return [
    `블록 행 '${String(row.process_name || "") || "이름 없음"}' · 블록 ${n}개 · 펼친 단계 ${stepCount(rc?.expanded ?? null)}개`,
    `쓰는 장비: ${usesText(rc?.uses ?? null)}`,
    t ? `예상 시간: 대기·메인 합 ${fmtSec(t.sec)}${t.open ? ` + 끝을 모르는 대기 ${t.open}개(압력·파워·히터·조건)` : ""}` : "예상 시간: -",
  ];
}

export function BlockRowSummary({ row, rc, onEdit }: { row: Row; rc: RowCheck | null; onEdit: () => void }) {
  const errs = rc?.errors.length ?? 0, warns = rc?.warnings.length ?? 0;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <Repeat size={12} className="text-indigo-500" />
      <b className="text-indigo-700">블록 행</b>
      <span className="text-gray-500">블록 {countBlocks(row.blocks)}개 · 펼친 단계 {rc?.expanded ? stepCount(rc.expanded) : "-"}개</span>
      <span className={`rounded px-1 text-[10px] font-semibold ${errs ? "bg-rose-50 text-rose-700" : warns ? "bg-amber-50 text-amber-700"
        : rc?.expanded ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
        {errs ? `오류 ${errs}` : warns ? `경고 ${warns}` : rc?.expanded ? "통과" : "검사 없음"}
      </span>
      <button onClick={onEdit} className="rounded-lg border border-indigo-200 px-1.5 py-0.5 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-50">
        블록 편집
      </button>
    </span>
  );
}

const NUM_RE = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
const toText = (v: unknown) => (v === undefined || v === null ? "" : typeof v === "number"
  ? (v !== 0 && Math.abs(v) < 1e-3 ? v.toExponential() : String(v)) : typeof v === "string" ? v : JSON.stringify(v));
const parseNum = (t: string): unknown => (t.trim() === "" ? undefined : NUM_RE.test(t.trim()) ? Number(t.trim()) : t);

/** 범위(paramScale 반영) — 장비 BParam.bounds 와 같게 */
function bounds(p: BParamDef, cfg: Record<string, unknown>): [number | null, number | null] {
  const side = (k: string | null, v: number | null) => (k ? (typeof cfg[k] === "number" ? (cfg[k] as number) * p.paramScale : null) : v);
  return [side(p.paramMin, p.min), side(p.paramMax, p.max)];
}
const g = (x: number) => String(Number(x.toPrecision(6)));

function defaultText(p: BParamDef, cfg: Record<string, unknown>): string {
  const d = p.default;
  if (typeof d === "string" && d.startsWith("cfg:")) return `기본 ${toText(cfg[d.slice(4)])}(설정 ${d.slice(4)})`;
  if (d === null || d === undefined) return p.required ? "필수" : "비움";
  if (typeof d === "boolean") return d ? "기본 켬" : "기본 끔";
  return `기본 ${toText(d)}`;
}

// ───────────── 값 칸 ─────────────
function NumField({ p, value, cfg, unit, error, readOnly, onChange }: {
  p: BParamDef; value: unknown; cfg: Record<string, unknown>; unit: string; error?: string; readOnly: boolean;
  onChange: (v: unknown) => void;
}) {
  const [text, setText] = useState(() => toText(value));
  const [lo, hi] = bounds(p, cfg);
  const range = lo !== null || hi !== null
    ? `${lo !== null ? `${g(lo)}${p.minExclusive ? " 초과" : ""}` : ""}~${hi !== null ? g(hi) : ""}` : "";
  return (
    <span className="flex items-center gap-1">
      <input value={text} disabled={readOnly} inputMode="decimal" placeholder={defaultText(p, cfg)}
        title={error ?? (p.desc || undefined)}
        onChange={(e) => { setText(e.target.value); onChange(parseNum(e.target.value)); }}
        className={`w-36 rounded-md border bg-white px-1.5 py-0.5 text-[11px] tabular-nums placeholder:text-gray-300 disabled:bg-gray-50
          ${error ? "border-rose-400 bg-rose-50" : "border-gray-200"}`} />
      <span className="whitespace-nowrap text-[10px] text-gray-400">{unit}{range && ` · ${range}`}{p.type === "int" && " · 정수"}</span>
    </span>
  );
}

function Choice({ value, options, placeholder, error, readOnly, onChange, title }: {
  value: unknown; options: { v: string; label: string }[]; placeholder: string; error?: string; readOnly: boolean;
  onChange: (v: unknown) => void; title?: string;
}) {
  const known = value === undefined || value === null || value === "" || (typeof value === "string" && options.some((o) => o.v === value));
  return (
    <select value={known ? (value as string | undefined) ?? "" : "__raw"} disabled={readOnly} title={error ?? title}
      onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value === "__raw" ? value : e.target.value)}
      className={`rounded-md border bg-white px-1 py-0.5 text-[11px] disabled:bg-gray-50 ${value === undefined || value === null ? "text-gray-400" : "text-gray-800"}
        ${error ? "border-rose-400 bg-rose-50" : "border-gray-200"}`}>
      <option value="">{placeholder}</option>
      {!known && <option value="__raw">{`그대로: ${JSON.stringify(value)}`}</option>}
      {options.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
    </select>
  );
}

const BOOL_OPTS = [{ v: "true", label: "켬" }, { v: "false", label: "끔" }];
const ENUM_LABEL: Record<string, string> = {
  open: "open 열기", close: "close 닫기", hold: "hold 그 자리 정지", continue: "continue 경고 뒤 다음", abort: "abort 중단",
};

function ParamField({ p, d, params, env, bundle, error, readOnly, set }: {
  p: BParamDef; d: BlockDef; params: Record<string, unknown>; env: BlockEnv; bundle: Bundle | null; error?: string;
  readOnly: boolean; set: (name: string, v: unknown) => void;
}) {
  const value = params[p.name];
  const cfg = env.cfg as Record<string, unknown>;
  const defs = env.defs;
  switch (p.type) {
    case "bool":
      return (
        <Choice value={typeof value === "boolean" ? String(value) : value} options={BOOL_OPTS} placeholder={defaultText(p, cfg)}
          error={error} readOnly={readOnly} title={p.desc}
          onChange={(v) => set(p.name, v === "true" ? true : v === "false" ? false : v)} />
      );
    case "enum": {
      const opts = d.type === "cond_wait" && p.name === "field"
        ? defs.condFields.map((f) => ({ v: f.field, label: `${f.label}(${f.unit}) · ${f.field}` }))
        : d.type === "cond_wait" && p.name === "op" ? defs.condOps.map((o) => ({ v: o.op, label: `${o.label} · ${o.op}` }))
        : (p.enum ?? []).map((e) => ({ v: String(e), label: ENUM_LABEL[String(e)] ?? String(e) }));
      return <Choice value={value} options={opts} placeholder={defaultText(p, cfg)} error={error} readOnly={readOnly} title={p.desc}
        onChange={(v) => set(p.name, v)} />;
    }
    case "list": {
      const cur = Array.isArray(value) ? value : [];
      const label = (t: string) => defs.shutters.find((s) => s.target === t)?.label ?? t;
      return (
        <span className={`flex flex-wrap gap-2 rounded px-1 ${error ? "bg-rose-50 outline outline-1 outline-rose-300" : ""}`} title={error ?? p.desc}>
          {(p.enum ?? []).map((e) => (
            <label key={String(e)} className="flex items-center gap-1 text-[11px] text-gray-700">
              <input type="checkbox" disabled={readOnly} checked={cur.includes(e)}
                onChange={(ev) => {
                  const next = (p.enum ?? []).filter((x) => (x === e ? ev.target.checked : cur.includes(x)));
                  set(p.name, next.length ? next : undefined);
                }} />
              {label(String(e))}
            </label>
          ))}
        </span>
      );
    }
    case "steps": {
      const cur = Array.isArray(value) ? value : [];
      const steps = bundle?.stopSequence?.steps ?? env.stopNos.map((no) => ({ no, desc: "" }));
      return (
        <span className={`flex flex-wrap gap-x-2 gap-y-0.5 rounded px-1 ${error ? "bg-rose-50 outline outline-1 outline-rose-300" : ""}`}>
          {steps.map((s) => {
            const keep = env.mustKeep.includes(s.no);
            return (
              <label key={s.no} title={`${s.desc ?? ""}${keep ? " — 파워 끄기 단계는 뺄 수 없음" : ""}`}
                className={`flex items-center gap-0.5 text-[11px] ${keep ? "text-gray-300" : "text-gray-700"}`}>
                <input type="checkbox" disabled={readOnly || (keep && !cur.includes(s.no))} checked={cur.includes(s.no)}
                  onChange={(ev) => {
                    const next = env.stopNos.filter((n) => (n === s.no ? ev.target.checked : cur.includes(n)));
                    set(p.name, next.length ? next : undefined);
                  }} />
                {s.no}
              </label>
            );
          })}
          <span className="text-[10px] text-gray-400">뺄 정지 단계(회색 = 파워 끄기, 뺄 수 없음)</span>
        </span>
      );
    }
    case "watch": {
      const cur = isObj(value) ? value : {};
      const base = d.watch ?? defs.watchDefault;
      return (
        <span className={`flex flex-wrap gap-1.5 rounded px-1 ${error ? "bg-rose-50 outline outline-1 outline-rose-300" : ""}`} title={error ?? p.desc}>
          {defs.watchItems.map((w) => (
            <label key={w.item} className="flex items-center gap-0.5 text-[11px] text-gray-600" title={w.rule}>
              {w.label}
              <Choice value={typeof cur[w.item] === "boolean" ? String(cur[w.item]) : cur[w.item]} options={BOOL_OPTS}
                placeholder={base[w.item] ? "기본 켬" : "기본 끔"} readOnly={readOnly}
                onChange={(v) => {
                  const next = { ...cur };
                  if (v === undefined) delete next[w.item];
                  else next[w.item] = v === "true" ? true : v === "false" ? false : v;
                  set(p.name, Object.keys(next).length ? next : undefined);
                }} />
            </label>
          ))}
        </span>
      );
    }
  }
  const unit = d.type === "cond_wait" && (p.name === "value" || p.name === "tol")
    ? defs.condFields.find((f) => f.field === params.field)?.unit ?? "" : p.unit;
  return <NumField p={p} value={value} cfg={cfg} unit={unit} error={error} readOnly={readOnly} onChange={(v) => set(p.name, v)} />;
}

// ───────────── 블록 카드 ─────────────
type Ctx = {
  env: BlockEnv; bundle: Bundle | null; readOnly: boolean; errors: string[]; warnings: string[];
  update: (id: string, data: unknown) => void; act: (id: string, a: "up" | "down" | "copy" | "delete") => void;
  add: (parent: string | null, type: string) => void;
};

const msgsAt = (list: string[], path: string) => list.filter((m) => m.startsWith(`블록 ${path}(`) || m.startsWith(`블록 ${path}:`));

function AddBlock({ ctx, parent, depth }: { ctx: Ctx; parent: string | null; depth: number }) {
  const [type, setType] = useState("");
  const defs = ctx.env.defs.defs.filter((d) => !(d.container && depth + 1 > ctx.env.defs.limits.maxDepth));
  if (ctx.readOnly) return null;
  return (
    <span className="flex items-center gap-1">
      <select value={type} onChange={(e) => setType(e.target.value)} aria-label="추가할 블록 종류"
        className="rounded-md border border-gray-200 bg-white px-1 py-0.5 text-[11px]">
        <option value="">블록 종류…</option>
        {defs.map((d) => <option key={d.type} value={d.type}>{d.label} · {d.type}</option>)}
      </select>
      <button disabled={!type} onClick={() => { ctx.add(parent, type); setType(""); }}
        className="flex items-center gap-0.5 rounded-md border border-gray-200 px-1.5 py-0.5 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40">
        <Plus size={12} /> 추가{parent ? "(안쪽)" : ""}
      </button>
    </span>
  );
}

function BlockList({ list, prefix, depth, parent, ctx }: { list: EBlock[]; prefix: string; depth: number; parent: string | null; ctx: Ctx }) {
  return (
    <div className="space-y-1.5">
      {list.map((e, i) => (
        <BlockCard key={e.uid} e={e} path={`${prefix}${i + 1}`} depth={depth} first={i === 0} last={i === list.length - 1} ctx={ctx} />
      ))}
      {!list.length && <p className="text-[11px] text-gray-400">블록이 없습니다</p>}
      <AddBlock ctx={ctx} parent={parent} depth={depth} />
    </div>
  );
}

function BlockCard({ e, path, depth, first, last, ctx }: { e: EBlock; path: string; depth: number; first: boolean; last: boolean; ctx: Ctx }) {
  const [open, setOpen] = useState(true);
  const errs = msgsAt(ctx.errors, path), warns = msgsAt(ctx.warnings, path);
  const data = isObj(e.data) ? e.data : null;
  const d = data && typeof data.type === "string" ? ctx.env.byType.get(data.type) : undefined;
  const params = data && isObj(data.params) ? data.params : {};
  const pre = d ? `블록 ${path}(${d.type}): ` : "";
  const fieldErr = (name: string) => errs.find((m) => m.startsWith(`${pre}${name}: `))?.slice(pre.length);
  const set = (name: string, v: unknown) => {
    const np = { ...params };
    if (v === undefined) delete np[name];
    else np[name] = v;
    ctx.update(e.uid, { ...data, params: np });
  };
  const setKey = (k: string, v: unknown) => {
    const nd = { ...data };
    if (v === undefined) delete nd[k];
    else nd[k] = v;
    ctx.update(e.uid, nd);
  };
  const stageDefault = d?.type === "pressure" ? `PRESSURE_SP${typeof params.sp === "number" ? params.sp : "n"}` : d?.stage ?? "";
  const tone = errs.length ? "border-rose-200 bg-rose-50/30" : warns.length ? "border-amber-200" : "border-gray-100";
  return (
    <div className={`rounded-xl border ${tone} ${depth ? "bg-white" : "bg-white"} p-2`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <button onClick={() => setOpen((o) => !o)} className="text-gray-400" aria-label="펼치기">
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
        <span className="rounded bg-gray-100 px-1 font-mono text-[11px] text-gray-600">{path}</span>
        <b className="text-xs text-gray-900">{d ? d.label : "알 수 없는 블록"}</b>
        <span className="font-mono text-[10px] text-gray-400">{d?.type ?? JSON.stringify(data?.type ?? e.data)}</span>
        {data && typeof data.label === "string" && data.label && <span className="text-[11px] text-gray-500">· {data.label}</span>}
        {errs.length > 0 && <span className="rounded bg-rose-100 px-1 text-[10px] font-semibold text-rose-700">오류 {errs.length}</span>}
        {!errs.length && warns.length > 0 && <span className="rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-700">경고 {warns.length}</span>}
        {!ctx.readOnly && (
          <span className="ml-auto flex gap-0.5 text-gray-400">
            <Icon label="위로" disabled={first} onClick={() => ctx.act(e.uid, "up")}><ArrowUp size={13} /></Icon>
            <Icon label="아래로" disabled={last} onClick={() => ctx.act(e.uid, "down")}><ArrowDown size={13} /></Icon>
            <Icon label="복사(아래에)" onClick={() => ctx.act(e.uid, "copy")}><Copy size={13} /></Icon>
            <Icon label="삭제" onClick={() => ctx.act(e.uid, "delete")}><Trash2 size={13} /></Icon>
          </span>
        )}
      </div>
      {open && d && (
        <div className="mt-1.5 space-y-1 pl-5">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
            <label className="flex items-center gap-1">라벨
              <input defaultValue={typeof data?.label === "string" ? data.label : ""} disabled={ctx.readOnly}
                maxLength={ctx.env.defs.limits.labelMax} placeholder={d.label}
                onChange={(ev) => setKey("label", ev.target.value === "" ? undefined : ev.target.value)}
                className="w-40 rounded-md border border-gray-200 px-1.5 py-0.5 text-[11px] placeholder:text-gray-300" />
            </label>
            {(d.stages.length > 0 || d.type === "pressure") && (
              <label className="flex items-center gap-1">공정 상태
                <Choice value={data?.stage} readOnly={ctx.readOnly} placeholder={`기본 ${stateLabel(ctx.bundle, stageDefault)}`}
                  options={[d.stage, ...d.stages].filter(Boolean).map((s) => ({ v: s, label: `${stateLabel(ctx.bundle, s)} · ${s}` }))}
                  error={errs.find((m) => m.startsWith(`${pre}stage `))} onChange={(v) => setKey("stage", v)} />
              </label>
            )}
          </div>
          {d.params.length > 0 && (
            <div className="grid justify-items-start gap-x-3 gap-y-1 sm:grid-cols-[max-content_1fr]">
              {d.params.map((p) => (
                <div key={p.name} className="contents">
                  <span className="pt-0.5 text-[11px] text-gray-500" title={p.desc}>
                    {p.name}{p.required && <span className="text-rose-500">*</span>}
                  </span>
                  <ParamField p={p} d={d} params={params} env={ctx.env} bundle={ctx.bundle} error={fieldErr(p.name)}
                    readOnly={ctx.readOnly} set={set} />
                </div>
              ))}
            </div>
          )}
          {d.desc && <p className="text-[10px] text-gray-400">{d.desc}</p>}
          <Msgs errors={errs} warnings={warns} />
          {d.container && (
            <div className="mt-1 border-l-2 border-indigo-100 pl-2">
              <p className="mb-1 text-[10px] font-semibold text-indigo-600">안쪽 블록(count 번 되풀이)</p>
              <BlockList list={e.kids ?? []} prefix={`${path}.`} depth={depth + 1} parent={e.uid} ctx={ctx} />
            </div>
          )}
        </div>
      )}
      {open && !d && <div className="mt-1 pl-5"><Msgs errors={errs} warnings={warns} /></div>}
    </div>
  );
}

function Msgs({ errors, warnings }: { errors: string[]; warnings: string[] }) {
  if (!errors.length && !warnings.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {errors.map((m, i) => <span key={`e${i}`} className="rounded bg-rose-50 px-1.5 py-0.5 text-[11px] font-semibold text-rose-700">{m}</span>)}
      {warnings.map((m, i) => <span key={`w${i}`} className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-800">{m}</span>)}
    </div>
  );
}

function Icon({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-label={label} title={label}
      className="rounded p-0.5 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30">{children}</button>
  );
}

// ───────────── 펼친 단계 ─────────────
function stepTime(s: ExpBlock["steps"][number]): string {
  if (typeof s.sec === "number") return fmtSec(s.sec);
  const a = Array.isArray(s.params) ? s.params[1] : s.params;
  if (Array.isArray(s.params) && s.params[0] === "WAIT_PRESSURE" && isObj(a)) return `최대 ${fmtSec(Number(a.timeout_sec))}`;
  if (s.action === "COND_WAIT" && isObj(a)) return `최대 ${fmtSec(Number(a.timeout_sec))}`;
  if (s.action === "POWER_WAIT" && isObj(s.spec)) return s.spec.timeout ? `최대 ${fmtSec(Number(s.spec.timeout))}` : "도달까지";
  if (s.action === "HEATER_WAIT" || s.action === "IG_BASE_WAIT") return "도달까지";
  return "";
}

/** 펼친 블록 목록 — 반복 안은 (반복 번호, 첫 회차)로 묶어 접는다(첫 회차만 펼침) */
export function ExpandedView({ exp, bundle, showParams }: { exp: ExpBlock[]; bundle: Bundle | null; showParams?: boolean }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const groups: { key: string; head: string | null; items: ExpBlock[] }[] = [];
  for (const b of exp) {
    const key = b.iter ? `${b.no.split(".")[0]}#${b.iter.split(".")[0]}` : `-${b.no}`;
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(b);
    else groups.push({ key, head: b.iter ? `반복 블록 ${b.no.split(".")[0]} · ${b.iter.split(".")[0]}회째` : null, items: [b] });
  }
  const label = (t: string) => bundle?.blocks?.defs?.find((d) => d.type === t)?.label ?? t;
  const item = (b: ExpBlock) => (
    <li key={b.no} className="rounded-lg bg-white px-2 py-1">
      <div className="flex flex-wrap items-baseline gap-1.5">
        <span className="font-mono text-[10px] text-gray-400">{b.no}</span>
        <b className="text-[11px] text-gray-800">{label(b.type)}</b>
        {b.label && <span className="text-[11px] text-gray-500">· {b.label}</span>}
        {b.auto && <span className="rounded bg-indigo-50 px-1 text-[10px] font-semibold text-indigo-700">자동(목록 끝이 정상 끝 정지가 아님)</span>}
        <span className="ml-auto text-[10px] text-gray-400">{stateLabel(bundle, b.stage)}</span>
      </div>
      {showParams && (
        <p className="text-[10px] text-gray-400">
          {Object.entries(b.params).filter(([, v]) => v !== null && v !== undefined && v !== false)
            .map(([k, v]) => `${k} ${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join(" · ")}
        </p>
      )}
      <ol className="mt-0.5 space-y-px">
        {b.steps.map((s, i) => (
          <li key={i} className={`flex gap-2 text-[11px] ${s.internal ? "italic text-gray-400" : "text-gray-600"}`}>
            <span className="min-w-0 flex-1">
              {s.message}
              {s.action === "END_STOP" && isObj(s.spec) && Array.isArray(s.spec.skip) && s.spec.skip.length > 0
                && <span className="text-gray-400"> — 뺀 단계 {s.spec.skip.join("·")}</span>}
            </span>
            <span className="shrink-0 tabular-nums text-gray-400">{stepTime(s)}</span>
          </li>
        ))}
      </ol>
    </li>
  );
  return (
    <ol className="space-y-1">
      {groups.map((gr) => {
        if (!gr.head) return gr.items.map(item);
        const isOpen = open[gr.key] ?? gr.key.endsWith("#1");
        return (
          <li key={gr.key} className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-1">
            <button onClick={() => setOpen((o) => ({ ...o, [gr.key]: !isOpen }))}
              className="flex w-full items-center gap-1 text-[11px] font-semibold text-indigo-700">
              {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />} {gr.head}
              <span className="font-normal text-indigo-500">· 블록 {gr.items.length}개 · 단계 {stepCount(gr.items)}개</span>
            </button>
            {isOpen && <ol className="mt-1 space-y-1">{gr.items.map(item)}</ol>}
          </li>
        );
      })}
    </ol>
  );
}

// ───────────── 편집기 ─────────────
export default function Chk2BlockEditor({ row, rc, env, bundle, readOnly, onRow, onClose, startWhy, onStart, rowNo }: {
  row: Row; rc: RowCheck | null; env: BlockEnv | null; bundle: Bundle | null; readOnly: boolean;
  onRow: (r: Row) => void; onClose: () => void; startWhy: string | null; onStart: () => void; rowNo: number;
}) {
  const [tree, setTree] = useState<EBlock[]>(() => (Array.isArray(row.blocks) ? row.blocks.map(fromJson) : []));
  const commit = (next: EBlock[]) => {
    setTree(next);
    onRow({ ...row, blocks: next.map(toJson) });
  };
  const errors = useMemo(() => rc?.errors ?? [], [rc]);
  const warnings = rc?.warnings ?? [];
  const top = errors.filter((m) => !/^블록 [\d.]+[(:]/.test(m));

  if (!env) {
    return (
      <div className="space-y-2">
        <button onClick={onClose} className="flex items-center gap-1 text-xs font-semibold text-gray-600"><ArrowLeft size={14} /> 레시피 표로</button>
        <p className="rounded-lg bg-gray-50 p-2 text-[11px] text-gray-500">이 장비 묶음에는 블록 정의·규칙 표가 없어(묶음 7 이하) 블록 편집기를 쓸 수 없습니다.</p>
      </div>
    );
  }
  const ctx: Ctx = {
    env, bundle, readOnly, errors, warnings,
    update: (id, data) => commit(mapTree(tree, id, (l, i) => l.map((x, j) => (j === i ? { ...x, data } : x)))),
    act: (id, a) => commit(mapTree(tree, id, (l, i) => {
      const n = [...l];
      if (a === "up" && i > 0) [n[i - 1], n[i]] = [n[i], n[i - 1]];
      if (a === "down" && i < n.length - 1) [n[i + 1], n[i]] = [n[i], n[i + 1]];
      if (a === "copy") n.splice(i + 1, 0, cloneE(n[i]));
      if (a === "delete") n.splice(i, 1);
      return n;
    })),
    add: (parent, type) => {
      const d = env.byType.get(type);
      const nb: EBlock = { uid: uid(), data: { type, params: d?.container ? { count: 2 } : {} }, kids: d?.container ? [] : null };
      if (!parent) return commit([...tree, nb]);
      const put = (l: EBlock[]): EBlock[] => l.map((x) => (x.uid === parent ? { ...x, kids: [...(x.kids ?? []), nb] }
        : x.kids ? { ...x, kids: put(x.kids) } : x));
      commit(put(tree));
    },
  };
  const t = rc?.expanded ? expectedTime(rc.expanded) : null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={onClose} className="flex items-center gap-1 rounded-lg px-1.5 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-100">
          <ArrowLeft size={14} /> 레시피 표로
        </button>
        <span className="text-xs font-bold text-indigo-700">{rowNo}행 블록 행</span>
        <label className="flex items-center gap-1 text-[11px] text-gray-500">이름(process_name)
          <input defaultValue={typeof row.process_name === "string" ? row.process_name : ""} disabled={readOnly} placeholder="비우면 장비가 정함"
            onChange={(e) => {
              const n: Row = { ...row, blocks: tree.map(toJson) };
              if (e.target.value === "") delete n.process_name;
              else n.process_name = e.target.value;
              onRow(n);
            }}
            className="w-44 rounded-md border border-gray-200 px-1.5 py-0.5 text-xs" />
        </label>
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${errors.length ? "bg-rose-50 text-rose-700"
          : warnings.length ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
          웹 검사 오류 {errors.length} · 경고 {warnings.length}
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          {startWhy && <span className="text-[11px] text-gray-400">{startWhy}</span>}
          <button onClick={onStart} disabled={!!startWhy}
            className="flex items-center gap-1 rounded-xl bg-rose-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-40">
            <Play size={13} /> 이 블록 행 바로 시작
          </button>
        </span>
      </div>
      <p className="text-[11px] text-gray-500">
        블록 {countBlocks(row.blocks)}개 · 펼친 단계 {rc?.expanded ? stepCount(rc.expanded) : "-"}개 · 쓰는 장비 {usesText(rc?.uses ?? null)}
        {t && ` · 대기·메인 합 ${fmtSec(t.sec)}${t.open ? ` + 끝을 모르는 대기 ${t.open}개` : ""}`}
        <span className="text-gray-400"> · 순서·조합은 자유(장비는 값 범위·꺼진 장비만 본다), 끝이 정상 끝 정지가 아니면 자동으로 덧붙음</span>
      </p>
      {top.length > 0 && <Msgs errors={top} warnings={[]} />}
      <div className="grid gap-3 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <BlockList list={tree} prefix="" depth={0} parent={null} ctx={ctx} />
        <div className="rounded-xl bg-gray-50 p-2 xl:sticky xl:top-2 xl:max-h-[80vh] xl:overflow-y-auto">
          <p className="mb-1.5 text-[11px] font-semibold text-gray-500">펼친 단계 미리보기(장비와 같은 계산)</p>
          {rc?.expanded ? <ExpandedView exp={rc.expanded} bundle={bundle} />
            : <p className="text-[11px] text-gray-400">{errors.length ? "오류를 고치면 펼친 단계가 보입니다" : "블록을 넣으세요"}</p>}
        </div>
      </div>
      {!readOnly && tree.length > 0 && (
        <p className="text-[10px] text-gray-400">고친 내용은 레시피에 바로 들어갑니다 — 레시피 &apos;저장&apos;으로 저장하세요.</p>
      )}
    </div>
  );
}
