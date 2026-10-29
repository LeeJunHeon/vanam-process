"use client";

// 챔버K v2 블록 편집기 — 공정 레시피 안의 "블록 행"({process_name, blocks}) 하나를 고친다(W-9: 2단).
// 왼쪽(약 40 %): 블록 목록 — 한 줄에 번호·이름·요약(묶음 summary 값)·상태 점, 끌어서 순서 바꾸기(같은 목록 안)·↑↓·복사·삭제,
//   반복은 안쪽 블록을 들여쓰기로. 아래 블록 추가 — 묶음 blocks.groups 순서대로 묶음 이름 아래 버튼(고른 블록 뒤, 없으면 끝).
//   반복 블록을 고르면 "안에 넣기"를 고를 수 있다(중첩 한도 limits.maxDepth).
// 오른쪽: 고른 블록 설정 — 이름·도움말(help), 값마다 label(필수 *)·칸·단위·범위·도움말·오류(칸 바로 아래).
//   advanced 값과 블록 이름표(label)·공정 상태(stage)는 "고급 설정" 안에. 비운 값의 기본값은 칸 안 회색 글.
// 아래: 실행 순서 미리보기(blocks.ts expandBlocks — 평소 블록별 한 줄, 장비 스텝 문구는 '상세'에서).
// 블록 JSON 은 장비가 받는 그대로(모르는 키도 지우지 않는다 — 장비와 같은 검사). 편집 모델(EBlock·toJson·fromJson) 그대로.
import { Fragment, useMemo, useState, type DragEvent, type ReactNode } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, ChevronDown, ChevronRight, Copy, GripVertical, Play, Repeat, Trash2 } from "lucide-react";
import type { Row, RowCheck } from "@/lib/ops2/chk/recipe";
import { expectedTime, type BParamDef, type BlockDef, type BlockEnv, type ExpBlock, type Uses } from "@/lib/ops2/chk/blocks";
import { useChk2Mode } from "./mode";
import { blockNames, blockSummary, humanize, paramLabel } from "./text";
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
/** uid → {블록, 경로("3.2"), 부모 uid, 깊이} */
type Place = { e: EBlock; path: string; parent: string | null; depth: number };
function index(list: EBlock[], prefix = "", parent: string | null = null, depth = 0, out = new Map<string, Place>()) {
  list.forEach((e, i) => {
    const path = `${prefix}${i + 1}`;
    out.set(e.uid, { e, path, parent, depth });
    if (e.kids) index(e.kids, `${path}.`, e.uid, depth + 1, out);
  });
  return out;
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
const timeText = (t: { sec: number; open: number } | null) =>
  t ? `예상 ${fmtSec(t.sec)}${t.open ? ` + 끝을 모르는 대기 ${t.open}개` : ""}` : "예상 시간 -";

/** 확인창·표에 쓰는 블록 행 요약 */
export function blockRowLines(row: Row, rc: RowCheck | null): string[] {
  const n = countBlocks(row.blocks);
  const t = rc?.expanded ? expectedTime(rc.expanded) : null;
  return [
    `블록 행 '${String(row.process_name || "") || "이름 없음"}' · 블록 ${n}개`,
    `쓰는 장비: ${usesText(rc?.uses ?? null)}`,
    t ? `예상 시간: 대기·메인 합 ${fmtSec(t.sec)}${t.open ? ` + 끝을 모르는 대기 ${t.open}개(압력·파워·히터·조건)` : ""}` : "예상 시간: -",
  ];
}

export function BlockRowSummary({ row, rc, onEdit }: { row: Row; rc: RowCheck | null; onEdit: () => void }) {
  const { detail } = useChk2Mode();
  const errs = rc?.errors.length ?? 0, warns = rc?.warnings.length ?? 0;
  const t = rc?.expanded ? expectedTime(rc.expanded) : null;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <Repeat size={12} className="text-indigo-500" />
      <b className="text-indigo-700">블록 행</b>
      <span className="text-gray-500">블록 {countBlocks(row.blocks)}개 · {timeText(t)}
        {detail && rc?.expanded && ` · 펼친 단계 ${stepCount(rc.expanded)}개`}</span>
      <span className={`rounded px-1 text-[10px] font-semibold ${errs ? "bg-rose-50 text-rose-700" : warns ? "bg-amber-50 text-amber-700"
        : rc?.expanded ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
        {errs ? `오류 ${errs}` : warns ? `경고 ${warns}` : rc?.expanded ? "검사 통과" : "블록 없음"}
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

/** 비운 값의 기본값 — 칸 안 회색 글("기본 1 s") */
function defaultText(p: BParamDef, cfg: Record<string, unknown>, unit: string, detail: boolean): string {
  const d = p.default;
  const u = unit ? ` ${unit}` : "";
  if (typeof d === "string" && d.startsWith("cfg:")) return `기본 ${toText(cfg[d.slice(4)])}${u}${detail ? `(설정 ${d.slice(4)})` : "(설정값)"}`;
  if (d === null || d === undefined) return p.required ? "필수" : "비움";
  if (typeof d === "boolean") return d ? "기본(켬)" : "기본(끔)";
  const el = p.enumLabels?.[String(d)];
  return `기본 ${el ?? toText(d)}${el ? "" : u}`;
}

// ───────────── 값 칸 ─────────────
function NumField({ p, value, cfg, unit, error, readOnly, onChange }: {
  p: BParamDef; value: unknown; cfg: Record<string, unknown>; unit: string; error?: string; readOnly: boolean;
  onChange: (v: unknown) => void;
}) {
  const { detail } = useChk2Mode();
  const [text, setText] = useState(() => toText(value));
  const [lo, hi] = bounds(p, cfg);
  const range = lo !== null || hi !== null
    ? `${lo !== null ? `${g(lo)}${p.minExclusive ? " 초과" : ""}` : ""}~${hi !== null ? g(hi) : ""}` : "";
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <input value={text} disabled={readOnly} inputMode="decimal" placeholder={defaultText(p, cfg, unit, detail)}
        aria-label={paramLabel(p)}
        onChange={(e) => { setText(e.target.value); onChange(parseNum(e.target.value)); }}
        className={`w-40 rounded-lg border bg-white px-2 py-1 text-xs tabular-nums placeholder:text-gray-300 disabled:bg-gray-50
          ${error ? "border-rose-400 bg-rose-50" : "border-gray-200"}`} />
      <span className="whitespace-nowrap text-[11px] text-gray-500">{unit}</span>
      {(range || p.type === "int") && (
        <span className="whitespace-nowrap text-[10px] text-gray-400">{range}{p.type === "int" && `${range ? " · " : ""}정수`}</span>
      )}
    </span>
  );
}

function Choice({ value, options, placeholder, error, readOnly, onChange, label }: {
  value: unknown; options: { v: string; label: string }[]; placeholder: string; error?: string; readOnly: boolean;
  onChange: (v: unknown) => void; label?: string;
}) {
  const known = value === undefined || value === null || value === "" || (typeof value === "string" && options.some((o) => o.v === value));
  return (
    <select value={known ? (value as string | undefined) ?? "" : "__raw"} disabled={readOnly} aria-label={label}
      onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value === "__raw" ? value : e.target.value)}
      className={`rounded-lg border bg-white px-1.5 py-1 text-xs disabled:bg-gray-50 ${value === undefined || value === null ? "text-gray-400" : "text-gray-800"}
        ${error ? "border-rose-400 bg-rose-50" : "border-gray-200"}`}>
      <option value="">{placeholder}</option>
      {!known && <option value="__raw">{`그대로: ${JSON.stringify(value)}`}</option>}
      {options.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
    </select>
  );
}

const BOOL_OPTS = [{ v: "true", label: "켬" }, { v: "false", label: "끔" }];
const ENUM_LABEL: Record<string, string> = {   // 묶음 enumLabels 가 없을 때(옛 장비)
  open: "열기", close: "닫기", hold: "지금 위치에서 멈춤", continue: "경고 남기고 다음으로", abort: "공정 중단",
};

function ParamField({ p, d, params, env, bundle, error, readOnly, set }: {
  p: BParamDef; d: BlockDef; params: Record<string, unknown>; env: BlockEnv; bundle: Bundle | null; error?: string;
  readOnly: boolean; set: (name: string, v: unknown) => void;
}) {
  const { detail } = useChk2Mode();
  const value = params[p.name];
  const cfg = env.cfg as Record<string, unknown>;
  const defs = env.defs;
  const raw = (v: string, label: string) => (detail && label !== v ? `${label} · ${v}` : label);
  switch (p.type) {
    case "bool":
      return (
        <Choice value={typeof value === "boolean" ? String(value) : value} options={BOOL_OPTS} label={paramLabel(p)}
          placeholder={defaultText(p, cfg, "", detail)} error={error} readOnly={readOnly}
          onChange={(v) => set(p.name, v === "true" ? true : v === "false" ? false : v)} />
      );
    case "enum": {
      const opts = d.type === "cond_wait" && p.name === "field"
        ? defs.condFields.map((f) => ({ v: f.field, label: raw(f.field, `${p.enumLabels?.[f.field] ?? f.label}${f.unit ? `(${f.unit})` : ""}`) }))
        : d.type === "cond_wait" && p.name === "op" ? defs.condOps.map((o) => ({ v: o.op, label: raw(o.op, p.enumLabels?.[o.op] ?? o.label) }))
        : (p.enum ?? []).map((e) => ({ v: String(e), label: raw(String(e), p.enumLabels?.[String(e)] ?? ENUM_LABEL[String(e)] ?? String(e)) }));
      return <Choice value={value} options={opts} placeholder={defaultText(p, cfg, "", detail)} error={error} readOnly={readOnly}
        label={paramLabel(p)} onChange={(v) => set(p.name, v)} />;
    }
    case "list": {
      const cur = Array.isArray(value) ? value : [];
      const label = (t: string) => p.enumLabels?.[t] ?? defs.shutters.find((s) => s.target === t)?.label ?? t;
      return (
        <span className={`flex flex-wrap gap-3 rounded px-1 ${error ? "bg-rose-50 outline outline-1 outline-rose-300" : ""}`}>
          {(p.enum ?? []).map((e) => (
            <label key={String(e)} className="flex items-center gap-1 text-xs text-gray-700">
              <input type="checkbox" disabled={readOnly} checked={cur.includes(e)}
                onChange={(ev) => {
                  const next = (p.enum ?? []).filter((x) => (x === e ? ev.target.checked : cur.includes(x)));
                  set(p.name, next.length ? next : undefined);
                }} />
              {raw(String(e), label(String(e)))}
            </label>
          ))}
        </span>
      );
    }
    case "steps": {
      const cur = Array.isArray(value) ? value : [];
      const steps = bundle?.stopSequence?.steps ?? env.stopNos.map((no) => ({ no, desc: "", label: "" }));
      return (
        <span className={`grid gap-x-3 gap-y-0.5 rounded px-1 sm:grid-cols-2 ${error ? "bg-rose-50 outline outline-1 outline-rose-300" : ""}`}>
          {steps.map((s) => {
            const keep = env.mustKeep.includes(s.no);
            return (
              <label key={s.no} title={`${s.desc ?? ""}${keep ? " — 파워 끄기 단계는 뺄 수 없음" : ""}`}
                className={`flex items-center gap-1 text-xs ${keep ? "text-gray-300" : "text-gray-700"}`}>
                <input type="checkbox" disabled={readOnly || (keep && !cur.includes(s.no))} checked={cur.includes(s.no)}
                  onChange={(ev) => {
                    const next = env.stopNos.filter((n) => (n === s.no ? ev.target.checked : cur.includes(n)));
                    set(p.name, next.length ? next : undefined);
                  }} />
                {s.no}. {s.label || s.desc || ""}{keep && " (못 뺌)"}
              </label>
            );
          })}
        </span>
      );
    }
    case "watch": {
      const cur = isObj(value) ? value : {};
      const base = d.watch ?? defs.watchDefault;
      return (
        <span className={`grid gap-x-3 gap-y-1 rounded px-1 sm:grid-cols-2 ${error ? "bg-rose-50 outline outline-1 outline-rose-300" : ""}`}>
          {defs.watchItems.map((w) => (
            <label key={w.item} className="flex items-center justify-between gap-1 text-xs text-gray-600" title={detail ? w.rule : undefined}>
              {w.label}
              <Choice value={typeof cur[w.item] === "boolean" ? String(cur[w.item]) : cur[w.item]} options={BOOL_OPTS}
                placeholder={base[w.item] ? "기본(켬)" : "기본(끔)"} readOnly={readOnly} label={w.label}
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

const msgsAt = (list: string[], path: string) => list.filter((m) => m.startsWith(`블록 ${path}(`) || m.startsWith(`블록 ${path}:`));

/** 검사 문구 — 평소 사람 말(열·값 이름을 label 로), 원문은 title·'상세' */
function Msg({ m, tone, names, strip }: { m: string; tone: "error" | "warn"; names: Record<string, string>; strip?: string }) {
  const { detail } = useChk2Mode();
  const body = strip && m.startsWith(strip) ? m.slice(strip.length) : m;
  return (
    <p title={m} className={`text-[11px] ${tone === "error" ? "font-semibold text-rose-600" : "text-amber-700"}`}>
      {humanize(body, names)}{detail && <span className="ml-1 font-mono font-normal opacity-70">{m}</span>}
    </p>
  );
}

// ───────────── 오른쪽: 고른 블록 설정 ─────────────
function BlockForm({ place, env, bundle, readOnly, errors, warnings, names, update }: {
  place: Place; env: BlockEnv; bundle: Bundle | null; readOnly: boolean; errors: string[]; warnings: string[];
  names: Record<string, string>; update: (id: string, data: unknown) => void;
}) {
  const { detail } = useChk2Mode();
  const [adv, setAdv] = useState(false);
  const { e, path } = place;
  const data = isObj(e.data) ? e.data : null;
  const d = data && typeof data.type === "string" ? env.byType.get(data.type) : undefined;
  const params = data && isObj(data.params) ? data.params : {};
  const errs = msgsAt(errors, path), warns = msgsAt(warnings, path);
  const pre = d ? `블록 ${path}(${d.type}): ` : "";
  const fieldErr = (name: string) => errs.find((m) => m.startsWith(`${pre}${name}: `));
  const blockErrs = errs.filter((m) => !(d?.params ?? []).some((p) => m.startsWith(`${pre}${p.name}: `)) && !m.startsWith(`${pre}stage `));
  const set = (name: string, v: unknown) => {
    const np = { ...params };
    if (v === undefined) delete np[name];
    else np[name] = v;
    update(e.uid, { ...data, params: np });
  };
  const setKey = (k: string, v: unknown) => {
    const nd = { ...data };
    if (v === undefined) delete nd[k];
    else nd[k] = v;
    update(e.uid, nd);
  };
  if (!d) {
    return (
      <div className="space-y-1">
        <p className="text-sm font-bold text-gray-700">알 수 없는 블록 <span className="font-mono text-xs text-gray-400">{JSON.stringify(data?.type ?? e.data)}</span></p>
        {errs.map((m, i) => <Msg key={i} m={m} tone="error" names={names} />)}
      </div>
    );
  }
  const stageDefault = d.type === "pressure" ? `PRESSURE_SP${typeof params.sp === "number" ? params.sp : "n"}` : d.stage ?? "";
  const field = (p: BParamDef) => {
    const err = fieldErr(p.name);
    return (
      <div key={p.name} className="grid gap-x-3 gap-y-0.5 py-1.5 sm:grid-cols-[9rem_minmax(0,1fr)]">
        <span className="pt-1 text-xs font-medium text-gray-700" title={detail ? p.desc : undefined}>
          {paramLabel(p)}{p.required && <span className="text-rose-500">*</span>}
          {detail && <span className="block font-mono text-[10px] font-normal text-gray-400">{p.name}</span>}
        </span>
        <span className="min-w-0">
          <ParamField p={p} d={d} params={params} env={env} bundle={bundle} error={err} readOnly={readOnly} set={set} />
          {p.help && <span className="mt-0.5 block text-[10px] leading-snug text-gray-400">{p.help}</span>}
          {detail && p.desc && <span className="block text-[10px] text-gray-300">{p.desc}</span>}
          {err && <Msg m={err} tone="error" names={names} strip={`${pre}${p.name}: `} />}
        </span>
      </div>
    );
  };
  const basic = d.params.filter((p) => !p.advanced);
  const advanced = d.params.filter((p) => p.advanced);
  const advErr = advanced.some((p) => fieldErr(p.name)) || errs.some((m) => m.startsWith(`${pre}stage `));
  const advOpen = adv || advErr;
  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-bold text-gray-900">
          <span className="mr-1.5 rounded bg-gray-100 px-1.5 font-mono text-[11px] text-gray-500">{path}</span>{d.label}
          {typeof data?.label === "string" && data.label && <span className="ml-1.5 text-xs font-normal text-gray-500">· {data.label}</span>}
          {detail && <span className="ml-1.5 font-mono text-[10px] font-normal text-gray-400">{d.type}</span>}
        </p>
        {d.help && <p className="mt-0.5 text-[11px] text-gray-500">{d.help}</p>}
        {detail && d.desc && <p className="text-[10px] text-gray-400">{d.desc}</p>}
      </div>
      {blockErrs.map((m, i) => <Msg key={`e${i}`} m={m} tone="error" names={names} strip={pre} />)}
      {warns.map((m, i) => <Msg key={`w${i}`} m={m} tone="warn" names={names} strip={pre} />)}
      {basic.length > 0 ? <div className="divide-y divide-gray-50">{basic.map(field)}</div>
        : <p className="text-[11px] text-gray-400">설정할 값이 없는 블록입니다.</p>}
      {d.container && <p className="rounded-lg bg-indigo-50 px-2 py-1 text-[11px] text-indigo-700">안쪽 블록은 왼쪽 목록에서 고칩니다. 블록 추가에서 &apos;반복 안에 넣기&apos;를 고르세요.</p>}
      <div className="rounded-xl border border-gray-100">
        <button onClick={() => setAdv((o) => !o)} className="flex w-full items-center gap-1 px-2 py-1.5 text-[11px] font-semibold text-gray-500 hover:text-gray-700">
          {advOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />} 고급 설정
          <span className="font-normal text-gray-400">— {advanced.length ? `${advanced.map(paramLabel).join("·")} · ` : ""}이름표·공정 상태</span>
        </button>
        {advOpen && (
          <div className="border-t border-gray-50 px-2 pb-2">
            {advanced.map(field)}
            <div className="grid gap-x-3 py-1.5 sm:grid-cols-[9rem_minmax(0,1fr)]">
              <span className="pt-1 text-xs font-medium text-gray-700">이름표</span>
              <span>
                <input defaultValue={typeof data?.label === "string" ? data.label : ""} disabled={readOnly}
                  maxLength={env.defs.limits.labelMax} placeholder={d.label} aria-label="이름표"
                  onChange={(ev) => setKey("label", ev.target.value === "" ? undefined : ev.target.value)}
                  className="w-48 rounded-lg border border-gray-200 px-2 py-1 text-xs placeholder:text-gray-300" />
                <span className="mt-0.5 block text-[10px] text-gray-400">목록·로그에 보일 이름(비우면 블록 이름)</span>
              </span>
            </div>
            {(d.stages.length > 0 || d.type === "pressure") && (
              <div className="grid gap-x-3 py-1.5 sm:grid-cols-[9rem_minmax(0,1fr)]">
                <span className="pt-1 text-xs font-medium text-gray-700">공정 상태</span>
                <span>
                  <Choice value={data?.stage} readOnly={readOnly} placeholder={`기본 ${stateLabel(bundle, stageDefault)}`} label="공정 상태"
                    options={[d.stage, ...d.stages].filter(Boolean).map((s) => ({ v: s, label: detail ? `${stateLabel(bundle, s)} · ${s}` : stateLabel(bundle, s) }))}
                    error={errs.find((m) => m.startsWith(`${pre}stage `))} onChange={(v) => setKey("stage", v)} />
                  <span className="mt-0.5 block text-[10px] text-gray-400">상태 카드·기록에 보일 공정 상태</span>
                  {errs.filter((m) => m.startsWith(`${pre}stage `)).map((m, i) => <Msg key={i} m={m} tone="error" names={names} strip={pre} />)}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────── 실행 순서 ─────────────
function stepTime(s: ExpBlock["steps"][number]): string {
  if (typeof s.sec === "number") return fmtSec(s.sec);
  const a = Array.isArray(s.params) ? s.params[1] : s.params;
  if (Array.isArray(s.params) && s.params[0] === "WAIT_PRESSURE" && isObj(a)) return `최대 ${fmtSec(Number(a.timeout_sec))}`;
  if (s.action === "COND_WAIT" && isObj(a)) return `최대 ${fmtSec(Number(a.timeout_sec))}`;
  if (s.action === "POWER_WAIT" && isObj(s.spec)) return s.spec.timeout ? `최대 ${fmtSec(Number(s.spec.timeout))}` : "도달까지";
  if (s.action === "HEATER_WAIT" || s.action === "IG_BASE_WAIT") return "도달까지";
  return "";
}
/** 블록 하나의 예상 시간 — 정한 시간(DELAY) 합, 끝을 모르는 대기가 있으면 "+ 도달까지" */
function blockTime(b: ExpBlock): string {
  const t = expectedTime([b]);
  if (!t.sec && !t.open) return "";
  return `${t.sec ? fmtSec(t.sec) : ""}${t.open ? `${t.sec ? " + " : ""}도달까지` : ""}`;
}

/** 실행 순서 — 반복 안은 (반복 번호, 회차)로 묶어 접는다(첫 회차만 펼침). 평소 블록별 한 줄, 장비 스텝 문구는 '상세' */
export function ExpandedView({ exp, bundle, showParams }: { exp: ExpBlock[]; bundle: Bundle | null; showParams?: boolean }) {
  const { detail } = useChk2Mode();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const groups: { key: string; head: string | null; items: ExpBlock[] }[] = [];
  for (const b of exp) {
    const key = b.iter ? `${b.no.split(".")[0]}#${b.iter.split(".")[0]}` : `-${b.no}`;
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(b);
    else groups.push({ key, head: b.iter ? `반복 블록 ${b.no.split(".")[0]} · ${b.iter.split(".")[0]}회째` : null, items: [b] });
  }
  const label = (t: string) => bundle?.blocks?.defs?.find((d) => d.type === t)?.label ?? t;
  const item = (b: ExpBlock) => {
    const sum = blockSummary(bundle, b.type, b.params);
    const t = b.steps.length ? blockTime(b) : "";
    return (
      <li key={b.no} className="rounded-lg bg-white px-2 py-1">
        <div className="flex flex-wrap items-baseline gap-1.5">
          <span className="font-mono text-[10px] text-gray-400">{b.no}</span>
          <b className="text-[11px] text-gray-800">{b.label || label(b.type)}</b>
          {sum && <span className="text-[11px] text-gray-500">{sum}</span>}
          {b.auto && <span className="rounded bg-indigo-50 px-1 text-[10px] font-semibold text-indigo-700">자동으로 붙음</span>}
          <span className="ml-auto text-[10px] tabular-nums text-gray-400">{t}{detail && ` · ${stateLabel(bundle, b.stage)}`}</span>
        </div>
        {detail && showParams && (
          <p className="text-[10px] text-gray-400">
            {Object.entries(b.params).filter(([, v]) => v !== null && v !== undefined && v !== false)
              .map(([k, v]) => `${k} ${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join(" · ")}
          </p>
        )}
        {detail && b.steps.length > 0 && (
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
        )}
      </li>
    );
  };
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
              <span className="font-normal text-indigo-500">· 블록 {gr.items.length}개{detail && ` · 단계 ${stepCount(gr.items)}개`}</span>
            </button>
            {isOpen && <ol className="mt-1 space-y-1">{gr.items.map(item)}</ol>}
          </li>
        );
      })}
    </ol>
  );
}

function Icon({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onClick(); }} disabled={disabled} aria-label={label} title={label}
      className="rounded p-0.5 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30">{children}</button>
  );
}

// ───────────── 편집기 ─────────────
export default function Chk2BlockEditor({ row, rc, env, bundle, readOnly, onRow, onClose, startWhy, onStart, rowNo, dirty }: {
  row: Row; rc: RowCheck | null; env: BlockEnv | null; bundle: Bundle | null; readOnly: boolean;
  onRow: (r: Row) => void; onClose: () => void; startWhy: string | null; onStart: () => void; rowNo: number;
  dirty?: boolean;                                 // 레시피에 저장 안 한 변경
}) {
  const { detail } = useChk2Mode();
  const [tree, setTree] = useState<EBlock[]>(() => (Array.isArray(row.blocks) ? row.blocks.map(fromJson) : []));
  const [sel, setSel] = useState<string | null>(() => tree[0]?.uid ?? null);
  const [into, setInto] = useState(false);         // 고른 반복 블록 "안에" 넣기
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const commit = (next: EBlock[]) => {
    setTree(next);
    onRow({ ...row, blocks: next.map(toJson) });
  };
  const errors = useMemo(() => rc?.errors ?? [], [rc]);
  const warnings = rc?.warnings ?? [];
  const top = errors.filter((m) => !/^블록 [\d.]+[(:]/.test(m));
  const places = useMemo(() => index(tree), [tree]);
  const names = useMemo(() => blockNames(bundle), [bundle]);

  if (!env) {
    return (
      <div className="space-y-2">
        <button onClick={onClose} className="flex items-center gap-1 text-xs font-semibold text-gray-600"><ArrowLeft size={14} /> 레시피 표로</button>
        <p className="rounded-lg bg-gray-50 p-2 text-[11px] text-gray-500">이 장비 정의에는 블록 정의가 없어(옛 장비) 블록 편집기를 쓸 수 없습니다.</p>
      </div>
    );
  }
  const selPlace = sel ? places.get(sel) ?? null : null;
  const selDef = selPlace && isObj(selPlace.e.data) && typeof selPlace.e.data.type === "string" ? env.byType.get(selPlace.e.data.type) : undefined;
  const canInto = !!selDef?.container;

  const act = (id: string, a: "up" | "down" | "copy" | "delete") => {
    let nextSel: string | null = sel;
    const next = mapTree(tree, id, (l, i) => {
      const n = [...l];
      if (a === "up" && i > 0) [n[i - 1], n[i]] = [n[i], n[i - 1]];
      if (a === "down" && i < n.length - 1) [n[i + 1], n[i]] = [n[i], n[i + 1]];
      if (a === "copy") { const c = cloneE(n[i]); n.splice(i + 1, 0, c); nextSel = c.uid; }
      if (a === "delete") { n.splice(i, 1); if (sel === id) nextSel = n[Math.min(i, n.length - 1)]?.uid ?? null; }
      return n;
    });
    commit(next);
    setSel(nextSel);
  };
  const update = (id: string, data: unknown) => commit(mapTree(tree, id, (l, i) => l.map((x, j) => (j === i ? { ...x, data } : x))));
  const add = (type: string) => {
    const d = env.byType.get(type);
    const nb: EBlock = { uid: uid(), data: { type, params: d?.container ? { count: 2 } : {} }, kids: d?.container ? [] : null };
    if (sel && into && canInto) {
      const put = (l: EBlock[]): EBlock[] => l.map((x) => (x.uid === sel ? { ...x, kids: [...(x.kids ?? []), nb] }
        : x.kids ? { ...x, kids: put(x.kids) } : x));
      commit(put(tree));
    } else if (sel && places.has(sel)) {
      commit(mapTree(tree, sel, (l, i) => [...l.slice(0, i + 1), nb, ...l.slice(i + 1)]));
    } else commit([...tree, nb]);
    setSel(nb.uid);
    setInto(false);
  };
  // 끌어서 순서 바꾸기 — 같은 목록(같은 부모) 안에서만
  const onDrop = (target: string) => {
    const a = drag ? places.get(drag) : null, b = places.get(target);
    setDrag(null);
    setOver(null);
    if (!a || !b || a.e.uid === b.e.uid || a.parent !== b.parent) return;
    const move = (l: EBlock[]): EBlock[] => {
      const from = l.findIndex((x) => x.uid === a.e.uid), to = l.findIndex((x) => x.uid === b.e.uid);
      if (from < 0 || to < 0) return l.map((x) => (x.kids ? { ...x, kids: move(x.kids) } : x));
      const n = [...l];
      const [m] = n.splice(from, 1);
      n.splice(to, 0, m);
      return n;
    };
    commit(move(tree));
  };

  const t = rc?.expanded ? expectedTime(rc.expanded) : null;
  const maxDepth = env.defs.limits.maxDepth;
  const depthOk = (d: BlockDef) => !(d.container && (into && canInto ? (selPlace?.depth ?? 0) + 2 : (selPlace?.depth ?? 0) + 1) > maxDepth);
  const groups = env.defs.groups?.length ? env.defs.groups : [{ key: "", label: "블록" }];

  const rowsOf = (list: EBlock[]): ReactNode => list.map((e) => {
    const p = places.get(e.uid)!;
    const data = isObj(e.data) ? e.data : null;
    const type = data && typeof data.type === "string" ? data.type : "";
    const d = env.byType.get(type);
    const params = data && isObj(data.params) ? data.params : {};
    const errs = msgsAt(errors, p.path).length, warns = msgsAt(warnings, p.path).length;
    const sum = d ? blockSummary(bundle, type, params) : "";
    const siblings = p.parent ? places.get(p.parent)?.e.kids ?? [] : tree;
    const idx = siblings.findIndex((x) => x.uid === e.uid);
    return (
      <Fragment key={e.uid}>
        <li draggable={!readOnly}
          onDragStart={(ev: DragEvent) => { setDrag(e.uid); ev.dataTransfer.effectAllowed = "move"; }}
          onDragOver={(ev: DragEvent) => { if (drag && places.get(drag)?.parent === p.parent) { ev.preventDefault(); setOver(e.uid); } }}
          onDragLeave={() => setOver((o) => (o === e.uid ? null : o))}
          onDrop={(ev: DragEvent) => { ev.preventDefault(); onDrop(e.uid); }}
          onDragEnd={() => { setDrag(null); setOver(null); }}
          onClick={() => setSel(e.uid)}
          style={{ marginLeft: p.depth * 18 }}
          className={`group flex cursor-pointer items-center gap-1.5 rounded-xl border px-2 py-1.5 ${
            sel === e.uid ? "border-blue-500 bg-blue-50/50 ring-1 ring-blue-500" : over === e.uid ? "border-blue-300 border-dashed" : "border-gray-100 bg-white hover:border-gray-200"}
            ${drag === e.uid ? "opacity-40" : ""}`}>
          {!readOnly && <GripVertical size={13} className="shrink-0 cursor-grab text-gray-300" />}
          <span className="shrink-0 font-mono text-[10px] text-gray-400">{p.path}</span>
          <span className={`h-2 w-2 shrink-0 rounded-full ${errs ? "bg-rose-500" : warns ? "bg-amber-400" : "bg-transparent"}`}
            title={errs ? `오류 ${errs}` : warns ? `경고 ${warns}` : undefined} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold text-gray-900">
              {d ? d.label : "알 수 없는 블록"}
              {typeof data?.label === "string" && data.label && <span className="ml-1 font-normal text-gray-500">· {data.label}</span>}
              {d?.container && <span className="ml-1 font-normal text-indigo-600">· {e.kids?.length ?? 0}개를 {String(params.count ?? "?")}번</span>}
            </span>
            {sum && <span className="block truncate text-[11px] text-gray-500">{sum}</span>}
          </span>
          {!readOnly && (
            <span className="flex shrink-0 gap-0.5 text-gray-400 opacity-60 group-hover:opacity-100">
              <Icon label="위로" disabled={idx <= 0} onClick={() => act(e.uid, "up")}><ArrowUp size={13} /></Icon>
              <Icon label="아래로" disabled={idx >= siblings.length - 1} onClick={() => act(e.uid, "down")}><ArrowDown size={13} /></Icon>
              <Icon label="복사(아래에)" onClick={() => act(e.uid, "copy")}><Copy size={13} /></Icon>
              <Icon label="삭제" onClick={() => act(e.uid, "delete")}><Trash2 size={13} /></Icon>
            </span>
          )}
        </li>
        {e.kids && (e.kids.length ? rowsOf(e.kids) : (
          <li style={{ marginLeft: (p.depth + 1) * 18 }} className="rounded-lg border border-dashed border-indigo-200 px-2 py-1 text-[11px] text-indigo-500">
            빈 반복 — 이 반복을 고르고 &apos;반복 안에 넣기&apos;로 블록을 넣으세요
          </li>
        ))}
      </Fragment>
    );
  });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={onClose} className="flex items-center gap-1 rounded-lg px-1.5 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-100">
          <ArrowLeft size={14} /> 레시피 표로
        </button>
        <span className="text-xs font-bold text-indigo-700">{rowNo}행 블록 행</span>
        <label className="flex items-center gap-1 text-[11px] text-gray-500">이름
          <input defaultValue={typeof row.process_name === "string" ? row.process_name : ""} disabled={readOnly} placeholder="비우면 장비가 정함"
            onChange={(e) => {
              const n: Row = { ...row, blocks: tree.map(toJson) };
              if (e.target.value === "") delete n.process_name;
              else n.process_name = e.target.value;
              onRow(n);
            }}
            className="w-44 rounded-md border border-gray-200 px-1.5 py-0.5 text-xs" />
        </label>
        <span className="text-[11px] text-gray-500">블록 {countBlocks(row.blocks)}개 · {timeText(t)}</span>
        {dirty && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">저장 안 됨</span>}
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${errors.length ? "bg-rose-50 text-rose-700"
          : warnings.length ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
          {errors.length ? `오류 ${errors.length}` : warnings.length ? `경고 ${warnings.length}` : "검사 통과"}
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
        블록 순서는 자유롭게 바꿀 수 있습니다. 끝에 &apos;정상 끝 정지&apos;가 없으면 자동으로 붙습니다.
        {detail && <span className="text-gray-400"> · 쓰는 장비 {usesText(rc?.uses ?? null)} · 펼친 단계 {rc?.expanded ? stepCount(rc.expanded) : "-"}개</span>}
      </p>
      {top.map((m, i) => <Msg key={i} m={m} tone="error" names={names} />)}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="space-y-2">
          <ol className="space-y-1">
            {rowsOf(tree)}
            {!tree.length && <li className="rounded-xl border border-dashed border-gray-200 p-3 text-center text-[11px] text-gray-400">블록이 없습니다 — 아래에서 블록을 넣으세요</li>}
          </ol>
          {!readOnly && (
            <div className="rounded-xl bg-gray-50 p-2">
              <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-gray-600">
                블록 추가
                <span className="font-normal text-gray-400">{selPlace ? `— ${selPlace.path} 뒤에` : "— 끝에"}</span>
                {canInto && (
                  <label className="flex items-center gap-1 font-normal text-indigo-700">
                    <input type="checkbox" checked={into} onChange={(e) => setInto(e.target.checked)} /> 반복 안에 넣기
                  </label>
                )}
              </div>
              <div className="space-y-1">
                {groups.map((gr) => {
                  const defs = env.defs.defs.filter((d) => (gr.key ? d.group === gr.key : true));
                  if (!defs.length) return null;
                  return (
                    <div key={gr.key} className="flex flex-wrap items-center gap-1">
                      <span className="w-16 shrink-0 text-[10px] text-gray-400">{gr.label}</span>
                      {defs.map((d) => (
                        <button key={d.type} onClick={() => add(d.type)} disabled={!depthOk(d)} title={d.help || d.label}
                          className="rounded-lg border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-gray-700 hover:border-blue-300 hover:bg-blue-50 disabled:opacity-40">
                          {d.label}
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-3 lg:sticky lg:top-12 lg:self-start">
          {selPlace ? (
            <BlockForm key={selPlace.e.uid} place={selPlace} env={env} bundle={bundle} readOnly={readOnly}
              errors={errors} warnings={warnings} names={names} update={update} />
          ) : <p className="text-[11px] text-gray-400">왼쪽에서 블록을 고르면 설정이 여기에 보입니다.</p>}
        </div>
      </div>

      <div className="rounded-xl bg-gray-50 p-2">
        <button onClick={() => setPreview((o) => !o)} className="flex items-center gap-1 text-[11px] font-semibold text-gray-600">
          {preview ? <ChevronDown size={12} /> : <ChevronRight size={12} />} 실행 순서 미리보기
          <span className="font-normal text-gray-400">— 장비와 같은 계산</span>
        </button>
        {preview && (
          <div className="mt-1.5">
            {rc?.expanded ? <ExpandedView exp={rc.expanded} bundle={bundle} />
              : <p className="text-[11px] text-gray-400">{errors.length ? "오류를 고치면 실행 순서가 보입니다" : "블록을 넣으세요"}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
