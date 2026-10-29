"use client";

// 챔버K v2 레시피 편집 표 — 열은 묶음 recipe 열 정의 순서. 머리 = 열 label(v11, 없으면 v1Name·name) + 단위, 그 위 한 줄에 열 group 묶음.
// 필수는 별표(*), 조건부는 "Ar 사용 시 필수"(기준 열 label). v1Name(CSV 이름)·desc 는 머리에 마우스를 올리면·'상세'에서.
// 행 종류 셋: 일반 행·딜레이 행·블록 행({process_name, blocks} — 한 줄 요약, 누르면 블록 편집기 Chk2BlockEditor).
// 가로 스크롤은 표 안에서만, 행 번호·공정 이름 칸은 왼쪽에 고정. 행 끝 ▶ = 이 행만 바로 시작(막힌 이유는 마우스 올리면),
// ⋮ 메뉴는 표에 잘리지 않게 화면 기준(portal·fixed)으로.
// 웹 검사(장비와 같은 계산·문구)는 칸을 건드린 뒤 또는 저장·적재를 누른 뒤부터(reveal) 그 칸 아래 빨간 글씨 —
// 문구 안의 열·블록 값 이름은 label 로 바꿔 보이고 원문은 마우스를 올리면·'상세'에서.
// 값은 칸에서 바로 행 객체로: 빈 칸·체크 해제는 키를 지우고, 숫자 모양이면 숫자, 아니면 글 그대로(검사가 "숫자여야 함").
import { Fragment, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Copy, MoreVertical, Play, Plus, Repeat, Timer, Trash2 } from "lucide-react";
import { delaySeconds, type Block, type ColDef, type RecipeCheck, type Row } from "@/lib/ops2/chk/recipe";
import { BlockRowSummary, ExpandedView } from "./Chk2BlockEditor";
import { colRange, rangeText } from "./logic";
import { useChk2Mode } from "./mode";
import { blockNames, blockSummary, colLabel, colNames, humanize, requiredText } from "./text";
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

/** 칸 아래 오류 한 줄(사람 말, 원문은 title) */
function CellError({ raw, names }: { raw?: string; names: Record<string, string> }) {
  const { detail } = useChk2Mode();
  if (!raw) return null;
  const body = raw.replace(/^[a-z0-9_]+: /, "");
  return (
    <span className="mt-0.5 block max-w-[14rem] whitespace-normal text-left text-[10px] font-semibold leading-tight text-rose-600" title={raw}>
      {humanize(body, names)}{detail && <span className="block font-mono font-normal text-rose-400">{raw}</span>}
    </span>
  );
}

/** 칸 하나 — 글은 칸이 들고(입력 중 "1e-" 등), 바뀔 때마다 값으로 */
function Cell({ col, value, onChange, error, bundle, readOnly, wide, names }: {
  col: ColDef; value: unknown; onChange: (v: unknown) => void; error?: string; bundle: Bundle | null;
  readOnly: boolean; wide?: boolean; names: Record<string, string>;
}) {
  const [text, setText] = useState(() => toText(value));
  if (col.type === "bool") {
    return (
      <span className="inline-flex flex-col items-center">
        <input type="checkbox" checked={value === true} disabled={readOnly} title={error ?? col.help ?? undefined}
          aria-label={colLabel(col)}
          onChange={(e) => onChange(e.target.checked ? true : undefined)}
          className={`h-3.5 w-3.5 ${error ? "outline outline-2 outline-rose-400" : ""}`} />
        <CellError raw={error} names={names} />
      </span>
    );
  }
  const range = colRange(bundle, col);
  const zero = col.zeroIsEmpty && value === 0;
  return (
    <span className="inline-flex flex-col">
      <input value={text} disabled={readOnly} inputMode={col.type === "str" ? "text" : "decimal"} aria-label={colLabel(col)}
        placeholder={range ? rangeText(range) : ""}
        title={zero ? "0 은 빈 값과 같음 — 베이스 대기 안 함" : col.help || (range ? `범위 ${rangeText(range)}` : undefined)}
        onChange={(e) => {
          setText(e.target.value);
          onChange(col.type === "str" ? (e.target.value === "" ? undefined : e.target.value) : parseCell(e.target.value));
        }}
        className={`${wide ? "w-40" : "w-20"} rounded-md border bg-white px-1.5 py-0.5 text-[11px] tabular-nums placeholder:text-gray-300
          disabled:bg-gray-50 disabled:text-gray-500 ${error ? "border-rose-400 bg-rose-50" : "border-gray-200"} ${zero ? "italic text-gray-400" : ""}`} />
      <CellError raw={error} names={names} />
    </span>
  );
}

function ColHead({ col, cols, sticky }: { col: ColDef; cols: ColDef[]; sticky?: string }) {
  const { detail } = useChk2Mode();
  const req = requiredText(col, cols);
  const tip = [col.help, col.v1Name && `CSV 이름 ${col.v1Name}`, col.desc].filter(Boolean).join(" · ");
  return (
    <th className={`whitespace-nowrap px-1.5 py-1 text-left align-bottom font-semibold text-gray-600 ${sticky ?? ""}`} title={tip || col.name}>
      {colLabel(col)}{col.required === "always" && <span className="text-rose-500">*</span>}
      {(col.unit || col.zeroIsEmpty || (req && col.required !== "always")) && (
        <span className="block text-[9px] font-normal text-gray-400">
          {col.unit}{req && col.required !== "always" ? `${col.unit ? " · " : ""}${req}` : ""}
          {col.zeroIsEmpty ? " · 0 = 빈 값" : ""}
        </span>
      )}
      {detail && <span className="block font-mono text-[9px] font-normal text-gray-300">{col.v1Name || col.name}</span>}
    </th>
  );
}

/** 열 group 머리 줄(이어진 같은 group 을 하나로) */
function GroupHead({ cols, lead, tail }: { cols: ColDef[]; lead: ReactNode; tail?: boolean }) {
  if (!cols.some((c) => c.group)) return null;
  const spans: { g: string; n: number }[] = [];
  for (const c of cols) {
    const g = c.group ?? "";
    const last = spans[spans.length - 1];
    if (last && last.g === g) last.n += 1;
    else spans.push({ g, n: 1 });
  }
  return (
    <tr>
      {lead}
      {spans.map((sp, i) => (
        <th key={i} colSpan={sp.n} className="border-b border-l border-gray-100 px-1.5 pt-1 text-left text-[10px] font-semibold text-gray-400 first:border-l-0">
          {sp.g}
        </th>
      ))}
      {tail && <th />}
    </tr>
  );
}

export function BlockPreview({ blocks, bundle }: { blocks: Block[]; bundle: Bundle | null }) {
  return (
    <ol className="space-y-0.5 text-[11px] text-gray-700">
      {blocks.map((b, i) => {
        const def = bundle?.blocks?.defs?.find((d) => d.type === b.type);
        const pt = blockSummary(bundle, b.type, b.params);
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

/** 행 단위 검사 문구(칸에 붙지 않는 것) */
function Messages({ errors, warnings, names }: { errors: string[]; warnings: string[]; names: Record<string, string> }) {
  const { detail } = useChk2Mode();
  if (!errors.length && !warnings.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {errors.map((e, i) => (
        <span key={`e${i}`} title={e} className="rounded bg-rose-50 px-1.5 py-0.5 text-[11px] font-semibold text-rose-700">
          {humanize(e, names)}{detail && <span className="ml-1 font-mono font-normal">{e}</span>}
        </span>
      ))}
      {warnings.map((w, i) => (
        <span key={`w${i}`} title={w} className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-800">
          {humanize(w, names)}{detail && <span className="ml-1 font-mono">{w}</span>}
        </span>
      ))}
    </div>
  );
}

const colError = (errors: string[], name: string, prefix = "") => errors.find((e) => e.startsWith(`${prefix}${name}: `));

export type RowAction = "up" | "down" | "copy" | "delete" | "delay" | "start" | "toBlocks";

export const isBlockRow = (r: Row) => "blocks" in r;

/** ⋮ 메뉴 — 표의 overflow 에 잘리지 않게 화면 기준(portal·fixed). 버튼 아래(넘치면 위)에 */
function RowMenu({ anchor, onClose, children }: { anchor: HTMLElement; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const place = () => {
      const a = anchor.getBoundingClientRect();
      const h = ref.current?.offsetHeight ?? 220, w = ref.current?.offsetWidth ?? 192;
      const top = a.bottom + 4 + h > window.innerHeight ? Math.max(8, a.top - h - 4) : a.bottom + 4;
      setPos({ left: Math.max(8, Math.min(a.right - w, window.innerWidth - w - 8)), top });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", onClose, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", onClose, true); };
  }, [anchor, onClose]);
  return createPortal(
    <>
      <div className="fixed inset-0 z-[85]" onClick={onClose} />
      <div ref={ref} style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
        className="fixed z-[86] w-48 rounded-xl border border-gray-100 bg-white p-1 text-xs shadow-lg">
        {children}
      </div>
    </>,
    document.body,
  );
}

const DELAY_UNITS = [{ u: "s", label: "초" }, { u: "m", label: "분" }, { u: "h", label: "시간" }, { u: "d", label: "일" }];

/** 공정 레시피 표 — 행(일반 행·딜레이 행·블록 행) 목록 */
export function ProcessTable({ cols, rows, check, bundle, readOnly, reveal, canStart, onRows, onStart, onEditBlocks, onToBlocks }: {
  cols: ColDef[]; rows: ERow[]; check: RecipeCheck | null; bundle: Bundle | null; readOnly: boolean;
  reveal: boolean;                                   // 저장·적재를 누른 뒤(또는 저장된 레시피) — 모든 검사 문구를 보인다
  canStart: (i: number) => string | null;            // 이 행만 바로 시작 — 막는 이유(없으면 null)
  onRows: (f: (rows: ERow[]) => ERow[]) => void; onStart: (i: number) => void;
  onEditBlocks: (uid: string) => void;               // 블록 행 → 블록 편집기
  onToBlocks: (i: number) => void;                   // 일반 행 → 그 기본 템플릿으로 새 블록 행(확인창은 부르는 쪽)
}) {
  const { detail } = useChk2Mode();
  const [steps, setSteps] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [menu, setMenu] = useState<{ uid: string; el: HTMLElement } | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});   // "uid:열" — 건드린 칸(그 칸 오류만 먼저 보인다)
  const [delayN, setDelayN] = useState("30");
  const [delayU, setDelayU] = useState("s");
  const delayText = `delay ${delayN.trim()}${delayU}`;
  const delayOk = delaySeconds(delayText) !== null;
  const names = { ...blockNames(bundle), ...colNames(cols) };

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
  const setCell = (uid: string, k: string, v: unknown) => {
    setTouched((t) => (t[`${uid}:${k}`] ? t : { ...t, [`${uid}:${k}`]: true }));
    onRows((l) => l.map((r) => (r.uid === uid ? { ...r, data: setKey(r.data, k, v) } : r)));
  };
  const nameCol = cols.find((c) => c.name === "process_name");
  const rest = cols.filter((c) => c.name !== "process_name");
  const menuRow = menu ? rows.findIndex((r) => r.uid === menu.uid) : -1;

  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-gray-100">
        <table className="min-w-full border-separate border-spacing-0 text-[11px]">
          <thead className="bg-gray-50">
            <GroupHead cols={rest} tail
              lead={<><th className="sticky left-0 z-20 bg-gray-50" />{nameCol && <th className="sticky left-10 z-20 bg-gray-50" />}</>} />
            <tr>
              <th className="sticky left-0 z-20 w-10 min-w-[2.5rem] bg-gray-50 px-1.5 py-1 text-left font-semibold text-gray-400">행</th>
              {nameCol && <ColHead col={nameCol} cols={cols} sticky="sticky left-10 z-20 bg-gray-50 shadow-[1px_0_0_#f3f4f6]" />}
              {rest.map((c) => <ColHead key={c.name} col={c} cols={cols} />)}
              <th className="sticky right-0 z-20 bg-gray-50 px-1.5 py-1" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const rc = check?.rows[i];
              const allErrs = rc?.errors ?? [], warns = rc?.warnings ?? [];
              const isDelay = delaySeconds(r.data.process_name) !== null && rc?.kind === "delay";
              const isBlocks = isBlockRow(r.data);
              const blocks = isBlocks ? null : rc?.blocks ?? null;
              const seen = (col: string) => reveal || !!touched[`${r.uid}:${col}`];
              // 칸 오류는 건드린 칸(또는 reveal), 칸에 붙지 않는 행 문구는 reveal 뒤에만
              const cellErr = (col: string) => (seen(col) ? colError(allErrs, col) : undefined);
              const cellNames = new Set([...(nameCol ? [nameCol.name] : []), ...rest.map((c) => c.name)]);
              const rowErrs = reveal ? allErrs.filter((e) => isBlocks || ![...cellNames].some((n) => e.startsWith(`${n}: `))) : [];
              const shownErrs = isBlocks && rowErrs.length > 1 ? [...rowErrs.slice(0, 1), `외 ${rowErrs.length - 1}개 — 블록 편집에서`] : rowErrs;
              const shownWarns = reveal ? warns : [];
              const why = canStart(i);
              const dot = allErrs.length && (reveal || Object.keys(touched).some((k) => k.startsWith(`${r.uid}:`)))
                ? <span className="h-1.5 w-1.5 rounded-full bg-rose-500" title={`오류 ${allErrs.length}`} />
                : warns.length && reveal ? <span className="h-1.5 w-1.5 rounded-full bg-amber-400" title={`경고 ${warns.length}`} />
                : rc && rc.kind !== "empty" && !allErrs.length ? <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" title="검사 통과" /> : null;
              return (
                <Fragment key={r.uid}>
                  <tr className={`${shownErrs.length ? "bg-rose-50/40" : ""}`}>
                    <td className="sticky left-0 z-10 w-10 border-t border-gray-100 bg-white px-1.5 py-1 text-right tabular-nums text-gray-400">
                      <span className="flex items-center justify-end gap-0.5">{dot}{i + 1}</span>
                    </td>
                    {nameCol && (
                      <td className="sticky left-10 z-10 border-t border-gray-100 bg-white px-1 py-1 shadow-[1px_0_0_#f3f4f6]">
                        <Cell col={nameCol} value={r.data.process_name} wide bundle={bundle} readOnly={readOnly} names={names}
                          error={cellErr("process_name")} onChange={(v) => setCell(r.uid, "process_name", v)} />
                      </td>
                    )}
                    {isBlocks ? (
                      <td colSpan={rest.length} className="border-t border-gray-100 px-2 py-1">
                        <BlockRowSummary row={r.data} rc={rc ?? null} onEdit={() => onEditBlocks(r.uid)} />
                      </td>
                    ) : isDelay ? (
                      <td colSpan={rest.length} className="border-t border-gray-100 px-2 py-1 text-gray-500">
                        <span className="flex items-center gap-1"><Timer size={12} /> 딜레이 행 · {rc?.clean?.delay_s as number} s — 다음 행까지 기다림</span>
                      </td>
                    ) : rest.map((c) => (
                      <td key={c.name} className="border-t border-gray-100 px-1 py-1 text-center align-top">
                        <Cell col={c} value={r.data[c.name]} bundle={bundle} readOnly={readOnly} error={cellErr(c.name)} names={names}
                          onChange={(v) => setCell(r.uid, c.name, v)} />
                      </td>
                    ))}
                    <td className="sticky right-0 z-10 border-t border-gray-100 bg-white px-1 py-1">
                      <span className="flex items-center gap-0.5">
                        {!isDelay && (
                          <button onClick={() => act(i, "start")} disabled={!!why} aria-label={`${i + 1}행만 바로 시작`}
                            title={why ? `바로 시작 못 함 — ${why}` : "이 행만 바로 시작"}
                            className="rounded p-0.5 text-rose-600 hover:bg-rose-50 disabled:text-gray-300 disabled:hover:bg-transparent">
                            <Play size={14} />
                          </button>
                        )}
                        <button onClick={(e) => setMenu(menu?.uid === r.uid ? null : { uid: r.uid, el: e.currentTarget })}
                          aria-label={`${i + 1}행 메뉴`}
                          className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                          <MoreVertical size={14} />
                        </button>
                      </span>
                    </td>
                  </tr>
                  {(shownErrs.length > 0 || shownWarns.length > 0 || blocks) && (
                    <tr>
                      <td className="sticky left-0 bg-white" />
                      <td colSpan={rest.length + 2} className="px-1 pb-1.5">
                        <Messages errors={shownErrs} warnings={shownWarns} names={names} />
                        {blocks && (
                          <div className="mt-0.5 flex flex-wrap items-start gap-x-4">
                            <div>
                              <button onClick={() => setOpen((o) => ({ ...o, [r.uid]: !o[r.uid] }))}
                                className="flex items-center gap-0.5 text-[11px] font-semibold text-blue-600 hover:underline">
                                {open[r.uid] ? <ChevronDown size={12} /> : <ChevronRight size={12} />} 블록 {blocks.length}개 보기
                              </button>
                              {open[r.uid] && <div className="mt-1 rounded-lg bg-gray-50 p-2"><BlockPreview blocks={blocks} bundle={bundle} /></div>}
                            </div>
                            {rc?.expanded && (
                              <div>
                                <button onClick={() => setSteps((o) => ({ ...o, [r.uid]: !o[r.uid] }))}
                                  className="flex items-center gap-0.5 text-[11px] font-semibold text-blue-600 hover:underline">
                                  {steps[r.uid] ? <ChevronDown size={12} /> : <ChevronRight size={12} />} 실행 순서 미리보기
                                </button>
                                {steps[r.uid] && <div className="mt-1 rounded-lg bg-gray-50 p-2"><ExpandedView exp={rc.expanded} bundle={bundle} /></div>}
                              </div>
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
              <tr><td colSpan={cols.length + 2} className="p-3 text-center text-gray-400">행이 없습니다 — 아래 &apos;행 추가&apos;로 시작하세요</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {menu && menuRow >= 0 && (() => {
        const i = menuRow, r = rows[i], rc = check?.rows[i];
        const isBlocks = isBlockRow(r.data);
        const isDelay = delaySeconds(r.data.process_name) !== null && rc?.kind === "delay";
        const why = canStart(i);
        return (
          <RowMenu anchor={menu.el} onClose={() => setMenu(null)}>
            {!isDelay && <MenuItem icon={<Play size={13} />} label="이 행만 바로 시작" disabled={!!why} title={why ?? undefined}
              tone="rose" onClick={() => act(i, "start")} />}
            {isBlocks && <MenuItem icon={<Repeat size={13} />} label="블록 편집" onClick={() => { setMenu(null); onEditBlocks(r.uid); }} />}
            {!readOnly && !isBlocks && !isDelay && (
              <MenuItem icon={<Repeat size={13} />} label="블록 행으로 만들기(아래에)" disabled={!rc?.blocks}
                title={rc?.blocks ? "이 행과 같은 순서의 블록으로 새 블록 행 — 원래 행은 그대로" : "검사 오류를 고친 뒤"}
                onClick={() => act(i, "toBlocks")} />
            )}
            {!readOnly && (
              <>
                <MenuItem icon={<ArrowUp size={13} />} label="위로" disabled={i === 0} onClick={() => act(i, "up")} />
                <MenuItem icon={<ArrowDown size={13} />} label="아래로" disabled={i === rows.length - 1} onClick={() => act(i, "down")} />
                <MenuItem icon={<Copy size={13} />} label="복사(아래에)" onClick={() => act(i, "copy")} />
                <MenuItem icon={<Timer size={13} />} label={`아래에 딜레이 행(${delayN}${DELAY_UNITS.find((x) => x.u === delayU)?.label})`}
                  disabled={!delayOk} onClick={() => act(i, "delay")} />
                <MenuItem icon={<Trash2 size={13} />} label="행 삭제" tone="rose" onClick={() => act(i, "delete")} />
              </>
            )}
          </RowMenu>
        );
      })()}
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
            <input value={delayN} onChange={(e) => setDelayN(e.target.value)} inputMode="numeric" aria-label="딜레이 시간"
              className={`w-14 rounded-lg border px-2 py-1 text-xs tabular-nums ${delayOk ? "border-gray-200" : "border-rose-400"}`} />
            <select value={delayU} onChange={(e) => setDelayU(e.target.value)} aria-label="딜레이 단위"
              className="rounded-lg border border-gray-200 px-1 py-1 text-xs">
              {DELAY_UNITS.map((x) => <option key={x.u} value={x.u}>{x.label}</option>)}
            </select>
            <button onClick={() => onRows((l) => [...l, { uid: newUid(), data: { process_name: delayText } }])} disabled={!delayOk}
              className="flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40">
              <Timer size={13} /> 딜레이 행 넣기
            </button>
            {detail && <span className="font-mono text-[10px] text-gray-400">{delayText}</span>}
          </span>
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

/** 히터 레시피 — 스텝 표 + 가스(선택) */
export function HeaterTable({ stepCols, gasCols, steps, gas, errors, warnings, bundle, readOnly, reveal, onSteps, onGas }: {
  stepCols: ColDef[]; gasCols: ColDef[]; steps: ERow[]; gas: Row; errors: string[]; warnings: string[];
  bundle: Bundle | null; readOnly: boolean; reveal: boolean; onSteps: (f: (rows: ERow[]) => ERow[]) => void; onGas: (g: Row) => void;
}) {
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const names = colNames([...stepCols, ...gasCols]);
  const touch = (k: string) => setTouched((t) => (t[k] ? t : { ...t, [k]: true }));
  const stepMsgs = (i: number) => ({
    errors: errors.filter((e) => e.startsWith(`스텝 ${i}: `)), warnings: warnings.filter((w) => w.startsWith(`스텝 ${i}: `)),
  });
  const other = {
    errors: reveal ? errors.filter((e) => !/^스텝 \d+: /.test(e) && !gasCols.some((c) => e.startsWith(`가스: ${c.name}: `))) : [],
    warnings: reveal ? warnings.filter((w) => !/^스텝 \d+: /.test(w)) : [],
  };
  const move = (i: number, d: number) => onSteps((l) => {
    const n = [...l];
    const j = i + d;
    if (j < 0 || j >= n.length) return n;
    [n[i], n[j]] = [n[j], n[i]];
    return n;
  });
  const all = [...stepCols, ...gasCols];
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-xl border border-gray-100">
        <table className="min-w-full text-[11px]">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-1.5 py-1 text-left font-semibold text-gray-400">스텝</th>
              {stepCols.map((c) => <ColHead key={c.name} col={c} cols={all} />)}
              <th />
            </tr>
          </thead>
          <tbody>
            {steps.map((s, j) => {
              const m = stepMsgs(j + 1);
              const pre = `스텝 ${j + 1}: `;
              const cellErr = (c: string) => (reveal || touched[`${s.uid}:${c}`] ? colError(m.errors, c, pre)?.slice(pre.length) : undefined);
              const rowMsgs = {
                errors: reveal ? m.errors.filter((e) => !stepCols.some((c) => e.startsWith(`${pre}${c.name}: `))) : [],
                warnings: reveal ? m.warnings : [],
              };
              return (
                <Fragment key={s.uid}>
                  <tr className="border-t border-gray-100 align-top">
                    <td className="px-1.5 py-1 text-right tabular-nums text-gray-400">{j + 1}</td>
                    {stepCols.map((c) => (
                      <td key={c.name} className="px-1 py-1">
                        <Cell col={c} value={s.data[c.name]} bundle={bundle} readOnly={readOnly} names={names} error={cellErr(c.name)}
                          onChange={(v) => { touch(`${s.uid}:${c.name}`); onSteps((l) => l.map((x) => (x.uid === s.uid ? { ...x, data: setKey(x.data, c.name, v) } : x))); }} />
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
                  {(rowMsgs.errors.length > 0 || rowMsgs.warnings.length > 0) && (
                    <tr><td /><td colSpan={stepCols.length + 1} className="px-1 pb-1.5"><Messages {...rowMsgs} names={names} /></td></tr>
                  )}
                </Fragment>
              );
            })}
            {!steps.length && <tr><td colSpan={stepCols.length + 2} className="p-3 text-center text-gray-400">스텝이 없습니다 — 아래 &apos;스텝 추가&apos;로 시작하세요</td></tr>}
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
        <p className="mb-1.5 text-[11px] font-semibold text-gray-500">가스(선택 — 비우면 가스 없이 승온)</p>
        <div className="flex flex-wrap items-start gap-3">
          {gasCols.map((c) => (
            <label key={c.name} className="flex flex-col gap-0.5 text-[11px] text-gray-500" title={c.help || undefined}>
              <span>{colLabel(c)}{c.required === "always" && <span className="text-rose-500">*</span>}
                {c.unit && <span className="text-gray-400"> {c.unit}</span>}
                {c.required?.startsWith("if:") && <span className="text-[9px] text-gray-400"> · {requiredText(c, all)}</span>}</span>
              <Cell col={c} value={gas[c.name]} bundle={bundle} readOnly={readOnly} names={names}
                error={reveal || touched[`gas:${c.name}`] ? colError(errors, c.name, "가스: ")?.slice(4) : undefined}
                onChange={(v) => { touch(`gas:${c.name}`); onGas(setKey(gas, c.name, v)); }} />
            </label>
          ))}
        </div>
      </div>
      <Messages {...other} names={names} />
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
