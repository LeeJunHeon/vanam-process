"use client";

// 챔버K v2 레시피 편집 표 — 열은 묶음 recipe 열 정의 순서·라벨(v1Name)·단위 그대로. bool 은 체크, 숫자 칸은 범위를 칸에.
// 행 종류 셋: v1 행·딜레이 행·블록 행({process_name, blocks} — 한 줄 요약, 누르면 블록 편집기 Chk2BlockEditor).
// 행마다 웹 검사 결과(오류 빨강·경고 노랑, 장비와 같은 문구)와 기본 템플릿 블록·펼친 단계 미리보기(읽기 전용, 펼치기).
// 값은 칸에서 바로 행 객체로: 빈 칸·체크 해제는 키를 지우고, 숫자 모양이면 숫자, 아니면 글 그대로(검사가 "숫자여야 함").
import { Fragment, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Copy, MoreVertical, Play, Plus, Repeat, Timer, Trash2 } from "lucide-react";
import { delaySeconds, type Block, type ColDef, type RecipeCheck, type Row } from "@/lib/ops2/chk/recipe";
import { BlockRowSummary, ExpandedView } from "./Chk2BlockEditor";
import { colRange, rangeText } from "./logic";
import type { Bundle } from "./types";

export type ERow = { uid: string; data: Row };
let seq = 0;
export const newUid = () => `r${(seq += 1)}`;
export const toERows = (rows: Row[]): ERow[] => rows.map((data) => ({ uid: newUid(), data: { ...data } }));

const NUM_RE = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

function toText(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "number") return v !== 0 && Math.abs(v) < 1e-3 ? v.toExponential() : String(v);
  return String(v);
}

/** 칸 글 → 값(undefined = 키 지움) */
function parseCell(text: string): unknown {
  const t = text.trim();
  if (!t) return undefined;
  return NUM_RE.test(t) ? Number(t) : t;
}

export function setKey(r: Row, k: string, v: unknown): Row {
  const n = { ...r };
  if (v === undefined) delete n[k];
  else n[k] = v;
  return n;
}

/** 칸 하나 — 글은 칸이 들고(입력 중 "1e-" 등), 바뀔 때마다 값으로 */
function Cell({ col, value, onChange, error, bundle, readOnly, wide }: {
  col: ColDef; value: unknown; onChange: (v: unknown) => void; error?: string; bundle: Bundle | null;
  readOnly: boolean; wide?: boolean;
}) {
  const [text, setText] = useState(() => toText(value));
  if (col.type === "bool") {
    return (
      <input type="checkbox" checked={value === true} disabled={readOnly} title={error ?? col.desc ?? undefined}
        onChange={(e) => onChange(e.target.checked ? true : undefined)}
        className={`h-3.5 w-3.5 ${error ? "outline outline-2 outline-rose-400" : ""}`} />
    );
  }
  const range = colRange(bundle, col);
  const zero = col.zeroIsEmpty && value === 0;
  return (
    <input value={text} disabled={readOnly} inputMode={col.type === "str" ? "text" : "decimal"}
      placeholder={range ? rangeText(range) : ""}
      title={error ?? (zero ? "0 은 빈 값과 같음 — 베이스 대기 안 함" : col.desc || (range ? `범위 ${rangeText(range)}` : undefined))}
      onChange={(e) => {
        setText(e.target.value);
        onChange(col.type === "str" ? (e.target.value === "" ? undefined : e.target.value) : parseCell(e.target.value));
      }}
      className={`${wide ? "w-36" : "w-20"} rounded-md border bg-white px-1.5 py-0.5 text-[11px] tabular-nums placeholder:text-gray-300
        disabled:bg-gray-50 disabled:text-gray-500 ${error ? "border-rose-400 bg-rose-50" : "border-gray-200"} ${zero ? "italic text-gray-400" : ""}`} />
  );
}

function ColHead({ col }: { col: ColDef }) {
  return (
    <th className="whitespace-nowrap px-1.5 py-1 text-left align-bottom font-semibold text-gray-500" title={col.desc || col.name}>
      {col.v1Name || col.name}
      {(col.unit || col.zeroIsEmpty || col.required !== "optional") && (
        <span className="block text-[9px] font-normal text-gray-400">
          {col.unit}{col.required === "always" ? " 필수" : col.required.startsWith("if:") ? ` ${col.required.slice(3)} 이면 필수` : ""}
          {col.zeroIsEmpty ? " · 0=빈 값" : ""}
        </span>
      )}
    </th>
  );
}

/** 블록 값 한 줄 — null·false 는 빼고, true 는 이름만 */
function paramText(params: Record<string, unknown>, units: Record<string, string>): string {
  return Object.entries(params)
    .filter(([, v]) => v !== null && v !== undefined && v !== false)
    .map(([k, v]) => {
      if (v === true) return k;
      if (Array.isArray(v)) return `${k} ${v.join("·")}`;
      if (typeof v === "object") return `${k} {${Object.entries(v as object).filter(([, x]) => x).map(([x]) => x).join(",")}}`;
      return `${k} ${String(v)}${units[k] ? ` ${units[k]}` : ""}`;
    })
    .join(" · ");
}

export function BlockPreview({ blocks, bundle }: { blocks: Block[]; bundle: Bundle | null }) {
  return (
    <ol className="space-y-0.5 text-[11px] text-gray-700">
      {blocks.map((b, i) => {
        const def = bundle?.blocks?.defs?.find((d) => d.type === b.type);
        const units = Object.fromEntries((def?.params ?? []).filter((p) => p.unit).map((p) => [p.name, p.unit as string]));
        const pt = paramText(b.params, units);
        return (
          <li key={i} className="flex gap-1.5">
            <span className="w-5 shrink-0 text-right tabular-nums text-gray-400">{i + 1}.</span>
            <span>
              <b className="font-semibold">{def?.label ?? b.type}</b>
              {b.label && <span className="text-gray-500"> · {b.label}</span>}
              {pt && <span className="text-gray-400"> — {pt}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Messages({ errors, warnings }: { errors: string[]; warnings: string[] }) {
  if (!errors.length && !warnings.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {errors.map((e, i) => <span key={`e${i}`} className="rounded bg-rose-50 px-1.5 py-0.5 text-[11px] font-semibold text-rose-700">{e}</span>)}
      {warnings.map((w, i) => <span key={`w${i}`} className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-800">{w}</span>)}
    </div>
  );
}

const colError = (errors: string[], name: string, prefix = "") => errors.find((e) => e.startsWith(`${prefix}${name}: `));

export type RowAction = "up" | "down" | "copy" | "delete" | "delay" | "start" | "toBlocks";

export const isBlockRow = (r: Row) => "blocks" in r;

/** 공정 레시피 표 — 행(v1 행·딜레이 행·블록 행) 목록 */
export function ProcessTable({ cols, rows, check, bundle, readOnly, canStart, onRows, onStart, onEditBlocks, onToBlocks }: {
  cols: ColDef[]; rows: ERow[]; check: RecipeCheck | null; bundle: Bundle | null; readOnly: boolean;
  canStart: (i: number) => string | null;            // 이 행만 바로 시작 — 막는 이유(없으면 null)
  onRows: (f: (rows: ERow[]) => ERow[]) => void; onStart: (i: number) => void;
  onEditBlocks: (uid: string) => void;               // 블록 행 → 블록 편집기
  onToBlocks: (i: number) => void;                   // v1 행 → 그 기본 템플릿으로 새 블록 행(확인창은 부르는 쪽)
}) {
  const [steps, setSteps] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [menu, setMenu] = useState<string | null>(null);
  const [delayText, setDelayText] = useState("delay 30s");

  const act = (i: number, a: RowAction) => {
    setMenu(null);
    if (a === "start") return onStart(i);
    if (a === "toBlocks") return onToBlocks(i);
    onRows((l) => {
      const n = [...l];
      if (a === "up" && i > 0) [n[i - 1], n[i]] = [n[i], n[i - 1]];
      if (a === "down" && i < n.length - 1) [n[i + 1], n[i]] = [n[i], n[i + 1]];
      if (a === "copy") n.splice(i + 1, 0, { uid: newUid(), data: { ...n[i].data } });
      if (a === "delete") n.splice(i, 1);
      if (a === "delay") n.splice(i + 1, 0, { uid: newUid(), data: { process_name: delayText } });
      return n;
    });
  };
  const setCell = (uid: string, k: string, v: unknown) =>
    onRows((l) => l.map((r) => (r.uid === uid ? { ...r, data: setKey(r.data, k, v) } : r)));
  const nameCol = cols.find((c) => c.name === "process_name");
  const rest = cols.filter((c) => c.name !== "process_name");

  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-gray-100">
        <table className="min-w-full text-[11px]">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-1.5 py-1 text-left font-semibold text-gray-400">행</th>
              {nameCol && <ColHead col={nameCol} />}
              {rest.map((c) => <ColHead key={c.name} col={c} />)}
              <th className="sticky right-0 bg-gray-50 px-1.5 py-1" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const rc = check?.rows[i];
              const errs = rc?.errors ?? [], warns = rc?.warnings ?? [];
              const isDelay = delaySeconds(r.data.process_name) !== null && rc?.kind === "delay";
              const isBlocks = isBlockRow(r.data);
              const blocks = isBlocks ? null : rc?.blocks ?? null;
              const shownErrs = isBlocks && errs.length > 1 ? [...errs.slice(0, 1), `외 ${errs.length - 1}개 — 블록 편집에서`] : errs;
              const why = canStart(i);
              return (
                <Fragment key={r.uid}>
                  <tr className={`border-t border-gray-100 ${errs.length ? "bg-rose-50/40" : ""}`}>
                    <td className="px-1.5 py-1 text-right tabular-nums text-gray-400">
                      <span className="flex items-center justify-end gap-0.5">
                        {errs.length ? <span className="h-1.5 w-1.5 rounded-full bg-rose-500" title={`오류 ${errs.length}`} />
                          : warns.length ? <span className="h-1.5 w-1.5 rounded-full bg-amber-400" title={`경고 ${warns.length}`} />
                          : rc && rc.kind !== "empty" ? <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" title="통과" /> : null}
                        {i + 1}
                      </span>
                    </td>
                    {nameCol && (
                      <td className="px-1 py-1">
                        <Cell col={nameCol} value={r.data.process_name} wide bundle={bundle} readOnly={readOnly}
                          error={colError(errs, "process_name")} onChange={(v) => setCell(r.uid, "process_name", v)} />
                      </td>
                    )}
                    {isBlocks ? (
                      <td colSpan={rest.length} className="px-2 py-1">
                        <BlockRowSummary row={r.data} rc={rc ?? null} onEdit={() => onEditBlocks(r.uid)} />
                      </td>
                    ) : isDelay ? (
                      <td colSpan={rest.length} className="px-2 py-1 text-gray-500">
                        <span className="flex items-center gap-1"><Timer size={12} /> 딜레이 {rc?.clean?.delay_s as number} s — 다음 행까지 기다림</span>
                      </td>
                    ) : rest.map((c) => (
                      <td key={c.name} className="px-1 py-1 text-center">
                        <Cell col={c} value={r.data[c.name]} bundle={bundle} readOnly={readOnly} error={colError(errs, c.name)}
                          onChange={(v) => setCell(r.uid, c.name, v)} />
                      </td>
                    ))}
                    <td className="sticky right-0 bg-white px-1 py-1">
                      <div className="relative">
                        <button onClick={() => setMenu(menu === r.uid ? null : r.uid)} aria-label={`${i + 1}행 메뉴`}
                          className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                          <MoreVertical size={14} />
                        </button>
                        {menu === r.uid && (
                          <>
                            <div className="fixed inset-0 z-[55]" onClick={() => setMenu(null)} />
                            <div className="absolute right-0 top-6 z-[56] w-44 rounded-xl border border-gray-100 bg-white p-1 text-xs shadow-lg">
                              <MenuItem icon={<Play size={13} />} label="이 행만 바로 시작" disabled={!!why} title={why ?? undefined}
                                tone="rose" onClick={() => act(i, "start")} />
                              {isBlocks && <MenuItem icon={<Repeat size={13} />} label="블록 편집" onClick={() => { setMenu(null); onEditBlocks(r.uid); }} />}
                              {!readOnly && !isBlocks && !isDelay && (
                                <MenuItem icon={<Repeat size={13} />} label="블록 행으로 만들기(아래에)" disabled={!rc?.blocks}
                                  title={rc?.blocks ? "이 행의 기본 템플릿 블록으로 새 블록 행 — 원래 행은 그대로" : "웹 검사 오류를 고친 뒤"}
                                  onClick={() => act(i, "toBlocks")} />
                              )}
                              {!readOnly && (
                                <>
                                  <MenuItem icon={<ArrowUp size={13} />} label="위로" disabled={i === 0} onClick={() => act(i, "up")} />
                                  <MenuItem icon={<ArrowDown size={13} />} label="아래로" disabled={i === rows.length - 1}
                                    onClick={() => act(i, "down")} />
                                  <MenuItem icon={<Copy size={13} />} label="복사(아래에)" onClick={() => act(i, "copy")} />
                                  <MenuItem icon={<Timer size={13} />} label={`아래에 딜레이(${delayText})`} onClick={() => act(i, "delay")} />
                                  <MenuItem icon={<Trash2 size={13} />} label="행 삭제" tone="rose" onClick={() => act(i, "delete")} />
                                </>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                  {(errs.length > 0 || warns.length > 0 || blocks) && (
                    <tr>
                      <td />
                      <td colSpan={rest.length + 2} className="px-1 pb-1.5">
                        <Messages errors={shownErrs} warnings={warns} />
                        {blocks && (
                          <div className="mt-0.5">
                            <button onClick={() => setOpen((o) => ({ ...o, [r.uid]: !o[r.uid] }))}
                              className="flex items-center gap-0.5 text-[11px] font-semibold text-blue-600 hover:underline">
                              {open[r.uid] ? <ChevronDown size={12} /> : <ChevronRight size={12} />} 블록 {blocks.length}개 미리보기
                            </button>
                            {open[r.uid] && (
                              <div className="mt-1 rounded-lg bg-gray-50 p-2"><BlockPreview blocks={blocks} bundle={bundle} /></div>
                            )}
                            {rc?.expanded && (
                              <>
                                <button onClick={() => setSteps((o) => ({ ...o, [r.uid]: !o[r.uid] }))}
                                  className="mt-0.5 flex items-center gap-0.5 text-[11px] font-semibold text-blue-600 hover:underline">
                                  {steps[r.uid] ? <ChevronDown size={12} /> : <ChevronRight size={12} />} 펼친 단계 미리보기
                                </button>
                                {steps[r.uid] && <div className="mt-1 rounded-lg bg-gray-50 p-2"><ExpandedView exp={rc.expanded} bundle={bundle} /></div>}
                              </>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {!rows.length && (
              <tr><td colSpan={cols.length + 2} className="p-3 text-center text-gray-400">행이 없습니다</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {!readOnly && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button onClick={() => onRows((l) => [...l, { uid: newUid(), data: {} }])}
            className="flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50">
            <Plus size={13} /> 행 추가
          </button>
          <button onClick={() => {
            const n = { uid: newUid(), data: { blocks: [] } as Row };
            onRows((l) => [...l, n]);
            onEditBlocks(n.uid);
          }}
            className="flex items-center gap-1 rounded-lg border border-indigo-200 px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-50">
            <Repeat size={13} /> 블록 행 추가
          </button>
          <span className="flex items-center gap-1">
            <input value={delayText} onChange={(e) => setDelayText(e.target.value)} aria-label="딜레이 행 글"
              className="w-28 rounded-lg border border-gray-200 px-2 py-1 text-xs" />
            <button onClick={() => onRows((l) => [...l, { uid: newUid(), data: { process_name: delayText } }])}
              disabled={delaySeconds(delayText) === null}
              className="flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40">
              <Timer size={13} /> 딜레이 행 넣기
            </button>
          </span>
          <span className="text-[11px] text-gray-400">딜레이 행: &quot;delay 30s&quot;·&quot;delay 5m&quot;(s·m·h·d)</span>
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon, label, onClick, disabled, title, tone }: {
  icon: ReactNode; label: string; onClick: () => void; disabled?: boolean; title?: string; tone?: "rose";
}) {
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-gray-50 disabled:opacity-40 ${
        tone === "rose" ? "text-rose-600" : "text-gray-700"}`}>
      {icon} {label}
    </button>
  );
}

/** 히터 레시피 — 스텝 표 + 첫 행 가스 */
export function HeaterTable({ stepCols, gasCols, steps, gas, errors, warnings, bundle, readOnly, onSteps, onGas }: {
  stepCols: ColDef[]; gasCols: ColDef[]; steps: ERow[]; gas: Row; errors: string[]; warnings: string[];
  bundle: Bundle | null; readOnly: boolean; onSteps: (f: (rows: ERow[]) => ERow[]) => void; onGas: (g: Row) => void;
}) {
  const stepMsgs = (i: number) => ({
    errors: errors.filter((e) => e.startsWith(`스텝 ${i}: `)), warnings: warnings.filter((w) => w.startsWith(`스텝 ${i}: `)),
  });
  const other = {
    errors: errors.filter((e) => !/^스텝 \d+: /.test(e)), warnings: warnings.filter((w) => !/^스텝 \d+: /.test(w)),
  };
  const move = (i: number, d: number) => onSteps((l) => {
    const n = [...l];
    const j = i + d;
    if (j < 0 || j >= n.length) return n;
    [n[i], n[j]] = [n[j], n[i]];
    return n;
  });
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-xl border border-gray-100">
        <table className="min-w-full text-[11px]">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-1.5 py-1 text-left font-semibold text-gray-400">스텝</th>
              {stepCols.map((c) => <ColHead key={c.name} col={c} />)}
              <th />
            </tr>
          </thead>
          <tbody>
            {steps.map((s, j) => {
              const m = stepMsgs(j + 1);
              return (
                <Fragment key={s.uid}>
                  <tr className={`border-t border-gray-100 ${m.errors.length ? "bg-rose-50/40" : ""}`}>
                    <td className="px-1.5 py-1 text-right tabular-nums text-gray-400">{j + 1}</td>
                    {stepCols.map((c) => (
                      <td key={c.name} className="px-1 py-1">
                        <Cell col={c} value={s.data[c.name]} bundle={bundle} readOnly={readOnly}
                          error={colError(m.errors, c.name, `스텝 ${j + 1}: `)}
                          onChange={(v) => onSteps((l) => l.map((x) => (x.uid === s.uid ? { ...x, data: setKey(x.data, c.name, v) } : x)))} />
                      </td>
                    ))}
                    <td className="whitespace-nowrap px-1 py-1">
                      {!readOnly && (
                        <span className="flex gap-0.5 text-gray-400">
                          <IconBtn label="위로" onClick={() => move(j, -1)}><ArrowUp size={13} /></IconBtn>
                          <IconBtn label="아래로" onClick={() => move(j, 1)}><ArrowDown size={13} /></IconBtn>
                          <IconBtn label="복사" onClick={() => onSteps((l) => {
                            const n = [...l];
                            n.splice(j + 1, 0, { uid: newUid(), data: { ...s.data } });
                            return n;
                          })}><Copy size={13} /></IconBtn>
                          <IconBtn label="삭제" onClick={() => onSteps((l) => l.filter((x) => x.uid !== s.uid))}><Trash2 size={13} /></IconBtn>
                        </span>
                      )}
                    </td>
                  </tr>
                  {(m.errors.length > 0 || m.warnings.length > 0) && (
                    <tr><td /><td colSpan={stepCols.length + 1} className="px-1 pb-1.5"><Messages {...m} /></td></tr>
                  )}
                </Fragment>
              );
            })}
            {!steps.length && <tr><td colSpan={stepCols.length + 2} className="p-3 text-center text-gray-400">스텝이 없습니다</td></tr>}
          </tbody>
        </table>
      </div>
      {!readOnly && (
        <button onClick={() => onSteps((l) => [...l, { uid: newUid(), data: {} }])}
          className="flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50">
          <Plus size={13} /> 스텝 추가
        </button>
      )}
      <div className="rounded-xl border border-gray-100 p-2">
        <p className="mb-1.5 text-[11px] font-semibold text-gray-500">첫 행 가스(비우면 가스 없이)</p>
        <div className="flex flex-wrap items-end gap-3">
          {gasCols.map((c) => (
            <label key={c.name} className="flex flex-col gap-0.5 text-[11px] text-gray-500">
              <span>{c.v1Name || c.name}{c.unit && <span className="text-gray-400"> {c.unit}</span>}</span>
              <Cell col={c} value={gas[c.name]} bundle={bundle} readOnly={readOnly} error={colError(errors, c.name, "가스: ")}
                onChange={(v) => onGas(setKey(gas, c.name, v))} />
            </label>
          ))}
        </div>
      </div>
      <Messages {...other} />
    </div>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className="rounded p-0.5 hover:bg-gray-100 hover:text-gray-700">
      {children}
    </button>
  );
}
