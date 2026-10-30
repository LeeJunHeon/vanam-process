"use client";

// 챔버K v2 공정 중 값 수정(PROCESS_ADJUST, W-5) — 장비 담당자·관리자(perms.kinds), 공정 진행 중(묶음 states kind active)에만.
// 항목은 묶음 adjust.items(device·item·key·param — 형식·단위·범위 paramMin·paramMax·paramScale·minExclusive).
// 계약(챔버K process_engine.adjust): 공정 밖·정지 순서·딜레이 행이면 PROCESS_NOT_RUNNING, 이번 공정이 안 쓰는 장비는
// ADJUST_NOT_USED, 범위 밖 ADJUST_OUT_OF_RANGE, RF Pulse START 중 ADJUST_BUSY. 지금 쓰는 중이면 바로(applied — 드라이버
// 되읽기 뒤 confirmed/failed), 아직 안 온 블록이 쓰면 그 블록부터(scheduled). 결과는 사건 PROCESS_ADJUST(누가·전→후·결과).
// 지금 값·쓰는 곳은 장비 state.adjust(5-12 — 항목마다 value·recipe·adjusted{by,t,source}·scope·busy) 그대로.
// scope done(쓰던 블록이 지남)·unused(안 씀)·busy 는 보내기를 막는다. adjusted.t 는 장비 시계 epoch 초 — 시계 차를 빼서 KST.
// 연결·잠금은 W-3 규칙(정지 쪽 아님), 같은 항목은 결과를 기다리는 동안 다시 못 보낸다(Ask.key).
import { useState } from "react";
import { ChevronDown, ChevronRight, SlidersHorizontal } from "lucide-react";
import { useChk2Mode } from "./mode";
import { fmtDur } from "./text";
import { Card, type Ask } from "./kit";
import { paramValue, rangeText, type Range } from "./logic";
import type { AdjustItemDef, AdjustState, Bundle, StateData } from "./types";
import { fmtKst } from "@/lib/ops2/time";

// W-9: 기본 접힘("바꿀 수 있는 항목 n개"), 펼치면 이번 공정에서 쓰는 항목(live·future)만, 안 쓰는·지난 항목은 접어서.
// 이름·도움말은 묶음 adjust.items label·help(v11). 아래 표는 묶음에 label 이 없는 옛 장비(v10 이하)에서만 대신 쓴다.
// 키(mfc.ar_flow)·장비 동작 문구(whenLive)·각주는 '상세'에서만.
// 항목 이름(옛 묶음용)
const LABEL: Record<string, string> = {
  "mfc.ar_flow": "Ar 유량", "mfc.o2_flow": "O₂ 유량", "mfc.wp": "작업 압력(SP1)", "dc.power": "DC 파워", "rf.power": "RF 파워",
  "rfpulse.power": "RF Pulse 파워", "rfpulse.freq_hz": "RF Pulse 주파수", "rfpulse.duty": "RF Pulse 듀티",
  "heater.target": "히터 목표 온도", "heater.ramp": "히터 램프 속도", "process.main_remaining": "메인 남은 시간",
  "process.skip_wait": "지금 대기 끝내기",
};

const nameOf = (it: AdjustItemDef) => it.label || LABEL[it.key] || it.key;

const SCOPE: Record<AdjustState["scope"], { text: string; tone: string; send: boolean }> = {
  live: { text: "지금 쓰는 중 — 바로 적용", tone: "bg-emerald-50 text-emerald-700", send: true },
  future: { text: "앞으로 — 그 블록부터", tone: "bg-amber-50 text-amber-700", send: true },
  done: { text: "이미 지남 — 남은 블록이 안 씀", tone: "bg-gray-100 text-gray-500", send: false },
  unused: { text: "안 씀 — 이번 공정에서 안 씀", tone: "bg-gray-100 text-gray-400", send: false },
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** 항목 범위 — 묶음 param 의 min·max·paramMin·paramMax(× paramScale) */
function itemRange(b: Bundle | null, p: AdjustItemDef["param"]): (Range & { minEx: boolean }) | null {
  if (p.type !== "float" && p.type !== "int") return null;
  const scale = p.paramScale ?? 1;
  const side = (k: string | null | undefined, v: number | null | undefined) => {
    if (k) { const c = num(paramValue(b, k)); return c === null ? null : c * scale; }
    return v ?? null;
  };
  return { min: side(p.paramMin, p.min), max: side(p.paramMax, p.max), unit: p.unit ?? "", minEx: !!p.minExclusive };
}
const fmt = (v: number | null | undefined) => (v === null || v === undefined ? "—" : String(Number(v.toPrecision(6))));

function checkText(text: string, p: AdjustItemDef["param"], r: ReturnType<typeof itemRange>): { v: number | null; err: string | null } {
  const t = text.trim();
  if (!t) return { v: null, err: null };
  const v = Number(t);
  if (!Number.isFinite(v)) return { v: null, err: "숫자가 아닙니다" };
  if (p.type === "int" && !Number.isInteger(v)) return { v, err: "정수여야 합니다" };
  if (r?.min != null && (r.minEx ? v <= r.min : v < r.min)) return { v, err: `${rangeText(r)}${r.minEx ? "(최소 초과)" : ""} 밖입니다` };
  if (r?.max != null && v > r.max) return { v, err: `${rangeText(r)} 밖입니다` };
  return { v, err: null };
}

/** 장비 시계 epoch 초 → KST(시계 차 = 장비 − 웹) */
function deviceTime(t: number | null | undefined, skewMs: number): string {
  if (typeof t !== "number" || !Number.isFinite(t)) return "-";
  return fmtKst(new Date(t * 1000 - skewMs).toISOString());
}

/** 화면에 보일 쓰는 곳 — 장비 값이 없으면(5-12 이전 장비) 모름, 보내기는 장비가 판단 */
function whereOf(a: AdjustState | undefined): { text: string; tone: string; send: boolean } {
  if (!a) return { text: "장비가 지금 값을 보내지 않음", tone: "bg-gray-50 text-gray-500", send: true };
  if (a.busy) return { text: "RF Pulse 시작 중 — 끝난 뒤", tone: "bg-sky-50 text-sky-700", send: false };
  return SCOPE[a.scope] ?? { text: a.scope, tone: "bg-gray-50 text-gray-500", send: true };
}

function Row({ it, bundle, a, skewMs, canSend, onSend }: {
  it: AdjustItemDef; bundle: Bundle | null; a: AdjustState | undefined; skewMs: number;
  canSend: boolean; onSend: (v: number | boolean, now: number | null) => void;
}) {
  const [text, setText] = useState("");
  const { detail } = useChk2Mode();
  const r = itemRange(bundle, it.param);
  const chk = checkText(text, it.param, r);
  const where = whereOf(a);
  const isBool = it.param.type === "bool";
  const now = a ? num(a.value) : null;
  const changed = !!a?.adjusted && !isBool && a.value !== a.recipe;
  const send = canSend && where.send && (!isBool || !a || a.scope === "live");   // 대기 끝내기는 지금 대기 블록일 때만
  return (
    <tr className="border-t border-gray-100 align-top">
      <td className="px-2 py-1.5">
        <p className="text-xs font-semibold text-gray-900">{nameOf(it)}</p>
        {it.help && <p className="max-w-xs text-[10px] text-gray-400">{it.help}</p>}
        {detail && <p className="font-mono text-[10px] text-gray-400">{it.device}.{it.item}</p>}
      </td>
      <td className="px-2 py-1.5"><span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${where.tone}`}>{where.text}</span></td>
      <td className="px-2 py-1.5 text-xs tabular-nums text-gray-800">
        {isBool ? "—" : <>{fmt(now)} <span className="text-[10px] text-gray-400">{it.param.unit}</span></>}
        {a && !isBool && <p className="text-[10px] text-gray-400">레시피 {fmt(num(a.recipe))}</p>}
        {changed && (
          <p className="text-[10px] font-semibold text-blue-700">
            수정됨 · {a!.adjusted!.by ?? "?"} · {deviceTime(a!.adjusted!.t, skewMs)}
          </p>
        )}
      </td>
      <td className="px-2 py-1.5">
        {isBool ? (
          <button disabled={!send} onClick={() => onSend(true, null)}
            className="rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40">
            지금 대기 끝내기
          </button>
        ) : (
          <span className="flex items-center gap-1.5">
            <input value={text} onChange={(e) => setText(e.target.value)} inputMode="decimal" placeholder={r ? rangeText(r) : "새 값"}
              disabled={!where.send}
              className={`w-28 rounded-md border px-1.5 py-0.5 text-[11px] tabular-nums placeholder:text-gray-300 disabled:bg-gray-50 ${chk.err ? "border-rose-400 bg-rose-50" : "border-gray-200"}`} />
            <button disabled={!send || chk.v === null || !!chk.err} onClick={() => chk.v !== null && onSend(chk.v, now)}
              className="rounded-lg bg-blue-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-blue-700 disabled:opacity-40">
              보내기
            </button>
          </span>
        )}
        {it.key === "process.main_remaining" && chk.v !== null && !chk.err && (
          <p className="mt-0.5 text-[10px] text-gray-500">{chk.v} s = {fmtDur(chk.v)}</p>
        )}
        {chk.err && <p className="mt-0.5 text-[10px] text-rose-600">{chk.err}</p>}
        {detail && it.whenLive && <p className="mt-0.5 text-[10px] text-gray-400">바로 적용: {it.whenLive}</p>}
      </td>
    </tr>
  );
}

export default function Chk2Adjust({ bundle, st, skewMs, canKey, onAsk }: {
  bundle: Bundle | null; st: StateData | null; skewMs: number;
  canKey: (kind: string, key: string) => boolean; onAsk: (a: Ask) => void;
}) {
  const [open, setOpen] = useState(false);
  const [openUnused, setOpenUnused] = useState(false);
  const { detail } = useChk2Mode();
  const items = bundle?.adjust?.items ?? [];
  const kind = bundle?.states?.find((s) => s.name === st?.procState)?.kind;
  if (!items.length || !st || kind !== "active") return null;
  const runId = st.runId ?? null;
  const list = Array.isArray(st.adjust) ? st.adjust : null;
  const of = (it: AdjustItemDef) => list?.find((a) => a.device === it.device && a.item === it.item);
  // 장비 지금 값이 없으면(옛 장비) 모두 쓰는 쪽으로
  const using = items.filter((it) => { const a = of(it); return !a || a.scope === "live" || a.scope === "future"; });
  const unused = items.filter((it) => !using.includes(it));

  const head = ["항목", "쓰는 곳", "지금 값", "새 값"];
  const table = (rows: AdjustItemDef[]) => (
    <div className="overflow-x-auto rounded-xl border border-gray-100">
      <table className="min-w-full text-xs">
        <thead className="bg-gray-50 text-[11px] text-gray-500">
          <tr>{head.map((h) => <th key={h} className="px-2 py-1.5 text-left font-semibold">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((it) => {
              const key = `PROCESS_ADJUST:${it.key}`;
              const a = of(it);
              return (
                <Row key={it.key} it={it} bundle={bundle} a={a} skewMs={skewMs}
                  canSend={canKey("PROCESS_ADJUST", key)}
                  onSend={(v, now) => onAsk({
                    kind: "PROCESS_ADJUST", key, label: `공정 중 수정 · ${nameOf(it)}`,
                    detail: typeof v === "boolean" ? "" : `${fmt(now)} → ${fmt(v)} ${it.param.unit ?? ""}`,
                    args: { device: it.device, item: it.item, value: v }, red: true,
                    lines: [`이번 공정${detail && runId ? `(run ${runId})` : ""}의 값만 바뀝니다 — 레시피·설정은 그대로`, whereOf(a).text,
                            ...(it.help ? [it.help] : []), ...(detail && it.whenLive ? [`바로 적용 조건: ${it.whenLive}`] : [])],
                    note: detail && it.apply ? `장비 동작: ${it.apply}` : undefined,
                  })} />
              );
            })}
        </tbody>
      </table>
    </div>
  );

  return (
    <Card title={
      <button onClick={() => setOpen((o) => !o)} className="flex min-w-0 items-center gap-1.5" aria-expanded={open}>
        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}<SlidersHorizontal size={15} /> 공정 중 값 바꾸기
        <span className="min-w-0 truncate text-left text-xs font-normal text-[#5B6470]">— {using.length ? using.map(nameOf).join(" · ") : "지금 바꿀 수 있는 항목 없음"}</span>
      </button>}
      right={<span className="text-[11px] text-gray-400">이번 공정에만 · 레시피·설정은 그대로</span>}>
      {open && (
        <div className="space-y-2">
          {st.procState === "CSV_DELAY" && (
            <p className="rounded-lg bg-amber-50 px-2 py-1 text-[11px] text-amber-800">딜레이 행 중에는 수정할 수 없습니다.</p>
          )}
          {!list && (
            <p className="rounded-lg bg-gray-50 px-2 py-1 text-[11px] text-gray-600">장비가 지금 값을 보내지 않습니다 — 받을지는 장비가 판단합니다.</p>
          )}
          {using.length ? table(using) : <p className="text-[11px] text-gray-400">지금 바꿀 수 있는 항목이 없습니다</p>}
          {unused.length > 0 && (
            <div>
              <button onClick={() => setOpenUnused((o) => !o)} className="flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-gray-700">
                {openUnused ? <ChevronDown size={12} /> : <ChevronRight size={12} />} 안 쓰는 항목 {unused.length}개
              </button>
              {openUnused && <div className="mt-1">{table(unused)}</div>}
            </div>
          )}
          {detail && <p className="text-[10px] text-gray-400">지금 값·쓰는 곳은 장비 state.adjust. 수정 시각은 장비 시계를 웹 시계로 맞춘 KST.</p>}
        </div>
      )}
    </Card>
  );
}
