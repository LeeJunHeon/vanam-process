"use client";

// 챔버K v2 공정 중 값 수정(PROCESS_ADJUST, W-5) — 장비 담당자·관리자(perms.kinds), 공정 진행 중(묶음 states kind active)에만.
// 항목은 묶음 adjust.items(device·item·key·param — 형식·단위·범위 paramMin·paramMax·paramScale·minExclusive).
// 계약(챔버K process_engine.adjust): 공정 밖·정지 순서·딜레이 행이면 PROCESS_NOT_RUNNING, 이번 공정이 안 쓰는 장비는
// ADJUST_NOT_USED, 범위 밖 ADJUST_OUT_OF_RANGE. 지금 쓰는 중이면 바로(applied — 드라이버 되읽기 뒤 confirmed/failed),
// 아직 안 온 블록이 쓰면 그 블록부터(scheduled). 결과는 사건 PROCESS_ADJUST(누가·전→후·결과).
// 지금 값: 장비는 공정 값(cur_vals·overrides)을 state 에 싣지 않는다 — 1초 스냅샷의 목표 값(mfc.ar_set·dc.set_w …)과
// 이번 run 의 마지막 수정 사건으로 보여 준다. 쓰는 곳(지금 블록·앞으로·쓰는 중)은 run 블록 기록으로 화면이 판단(마지막은 장비).
// 연결·잠금은 W-3 규칙(정지 쪽 아님), 같은 항목은 결과를 기다리는 동안 다시 못 보낸다(Ask.key).
import { useEffect, useMemo, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Card, type Ask } from "./kit";
import { paramValue, rangeText, type Range } from "./logic";
import type { AdjustItemDef, Bundle, StateData } from "./types";
import type { FeedItem } from "./useChk2";

// 항목 이름(묶음에 라벨이 없어 코드에 둔다)
const LABEL: Record<string, string> = {
  "mfc.ar_flow": "Ar 유량", "mfc.o2_flow": "O₂ 유량", "mfc.wp": "작업 압력(SP1)", "dc.power": "DC 파워", "rf.power": "RF 파워",
  "rfpulse.power": "RF Pulse 파워", "rfpulse.freq_hz": "RF Pulse 주파수", "rfpulse.duty": "RF Pulse 듀티",
  "heater.target": "히터 목표 온도", "heater.ramp": "히터 램프 속도", "process.main_remaining": "메인 남은 시간",
  "process.skip_wait": "지금 대기 끝내기",
};

type Snap = Record<string, unknown>;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
/** 지금 값(장비가 기준으로 쓰는 목표) — 1초 스냅샷 열 */
const NOW: Record<string, (s: Snap, st: StateData) => number | null> = {
  "mfc.ar_flow": (s) => num(s["mfc.ar_set"]), "mfc.o2_flow": (s) => num(s["mfc.o2_set"]),
  "mfc.wp": (s) => (s["mfc.sp_active"] === 1 ? num(s["mfc.sp_mtorr"]) : null),
  "dc.power": (s) => num(s["dc.set_w"]), "rf.power": (s) => num(s["rf.set_w"]), "rfpulse.power": (s) => num(s["rfp.set_w"]),
  "rfpulse.freq_hz": (s) => (num(s["rfp.freq_hz"]) === null ? null : (s["rfp.freq_hz"] as number) / 1000),
  "rfpulse.duty": (s) => num(s["rfp.duty_pct"]), "heater.target": (s) => num(s["heater.sv"]),
  "process.main_remaining": (_s, st) => (st.step?.type === "main" ? num(st.remainS ?? st.step?.remainS) : null),
};
const NOW_SRC: Record<string, string> = {
  "mfc.ar_flow": "mfc.ar_set", "mfc.o2_flow": "mfc.o2_set", "mfc.wp": "mfc.sp_mtorr(SP1 선택 중)", "dc.power": "dc.set_w",
  "rf.power": "rf.set_w", "rfpulse.power": "rfp.set_w", "rfpulse.freq_hz": "rfp.freq_hz ÷ 1000", "rfpulse.duty": "rfp.duty_pct",
  "heater.target": "heater.sv", "process.main_remaining": "state.remainS(메인 블록)",
};

type Inst = { no: string; type: string; params: Record<string, unknown> };
const pos = (v: unknown) => typeof v === "number" && v > 0;
/** 이 블록이 그 항목을 쓰는가(블록 값으로) */
function usesItem(key: string, b: Inst): boolean {
  const p = b.params;
  switch (key) {
    case "mfc.ar_flow": return b.type === "gas_intro" && p.ar === true;
    case "mfc.o2_flow": return b.type === "gas_intro" && p.o2 === true;
    case "mfc.wp": return b.type === "pressure" && Number(p.sp) === 1;
    case "dc.power": return b.type === "power_on" && pos(p.dc_power);
    case "rf.power": return b.type === "power_on" && pos(p.rf_power);
    case "rfpulse.power": case "rfpulse.freq_hz": case "rfpulse.duty": return b.type === "power_on" && pos(p.rfp_power);
    case "heater.target": return b.type === "heater_ramp" || b.type === "heater_wait";
    case "heater.ramp": return b.type === "heater_ramp";
    case "process.main_remaining": return b.type === "main";
    case "process.skip_wait": return b.type === "wait" || b.type === "cond_wait";
  }
  return false;
}
/** 이 블록이 그 장비를 끄는가(쓰는 중 판단) */
function stopsItem(key: string, b: Inst): boolean {
  const p = b.params;
  if (key.startsWith("mfc.") && key !== "mfc.wp") return b.type === "gas_off" && p[key === "mfc.ar_flow" ? "ar" : "o2"] === true;
  if (key === "dc.power") return b.type === "power_off" && p.dc === true;
  if (key === "rf.power") return b.type === "power_off" && p.rf === true;
  if (key.startsWith("rfpulse.")) return b.type === "power_off" && p.rfpulse === true;
  if (key.startsWith("heater.")) return b.type === "heater_off";
  return false;
}

type Where = { tone: "now" | "on" | "later" | "none"; text: string };
function whereOf(key: string, insts: Inst[], cur: number): Where {
  const here = insts[cur];
  if (here && usesItem(key, here)) return { tone: "now", text: "지금 블록이 씀 — 바로 적용" };
  let on = false;
  for (let i = 0; i < cur && i < insts.length; i++) {
    if (usesItem(key, insts[i])) on = true;
    if (stopsItem(key, insts[i])) on = false;
  }
  const later = insts.slice(cur + 1).find((b) => usesItem(key, b));
  if (on && !key.startsWith("process.")) return { tone: "on", text: `쓰는 중 — 바로 적용${later ? `(블록 ${later.no} 도 새 값)` : ""}` };
  if (later) return { tone: "later", text: `아직 안 옴 — 블록 ${later.no} 부터 새 값` };
  return { tone: "none", text: "이번 공정에서 안 씀(장비가 ADJUST_NOT_USED 로 거부)" };
}

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

/** 이번 run 의 마지막 수정(받은 것) — 항목 키 → {new, result} */
function lastAdjusts(feed: FeedItem[], runId: string | null | undefined) {
  const m = new Map<string, { value: unknown; result: string; by: string | null }>();
  for (const e of feed) {
    const d = e.data;
    if (e.type !== "event" || d.code !== "PROCESS_ADJUST") continue;
    const c = (d.context as { data?: Record<string, unknown> } | null)?.data;
    if (!c || (runId && c.run_id && c.run_id !== runId)) continue;
    if (c.result === "rejected" || c.result === "failed") continue;
    m.set(`${String(c.device)}.${String(c.item)}`, { value: c.new, result: String(c.result), by: (c.by as string) ?? null });
  }
  return m;
}

function Row({ it, bundle, st, where, last, canSend, onSend }: {
  it: AdjustItemDef; bundle: Bundle | null; st: StateData; where: Where; last?: { value: unknown; result: string; by: string | null };
  canSend: boolean; onSend: (v: number | boolean, now: number | null) => void;
}) {
  const [text, setText] = useState("");
  const r = itemRange(bundle, it.param);
  const now = NOW[it.key]?.(st.snapshot ?? {}, st) ?? null;
  const chk = checkText(text, it.param, r);
  const tone = { now: "bg-emerald-50 text-emerald-700", on: "bg-blue-50 text-blue-700", later: "bg-amber-50 text-amber-700",
                 none: "bg-gray-100 text-gray-400" }[where.tone];
  const isBool = it.param.type === "bool";
  return (
    <tr className="border-t border-gray-100 align-top">
      <td className="px-2 py-1.5">
        <p className="text-xs font-semibold text-gray-900">{LABEL[it.key] ?? it.key}</p>
        <p className="font-mono text-[10px] text-gray-400">{it.device}.{it.item}</p>
      </td>
      <td className="px-2 py-1.5"><span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${tone}`}>{where.text}</span></td>
      <td className="px-2 py-1.5 text-xs tabular-nums text-gray-800" title={NOW_SRC[it.key] ? `지금 값 출처: ${NOW_SRC[it.key]}` : "스냅샷에 없는 값"}>
        {isBool ? "—" : <>{fmt(now)} <span className="text-[10px] text-gray-400">{it.param.unit}</span></>}
        {last && !isBool && (
          <p className="text-[10px] text-gray-500">수정 {String(last.value)}{last.result === "scheduled" ? "(다음 블록부터)" : ""}{last.by ? ` · ${last.by}` : ""}</p>
        )}
      </td>
      <td className="px-2 py-1.5">
        {isBool ? (
          <button disabled={!canSend || where.tone === "none"} onClick={() => onSend(true, null)}
            className="rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40">
            지금 대기 끝내기
          </button>
        ) : (
          <span className="flex items-center gap-1.5">
            <input value={text} onChange={(e) => setText(e.target.value)} inputMode="decimal" placeholder={r ? rangeText(r) : "새 값"}
              className={`w-28 rounded-md border px-1.5 py-0.5 text-[11px] tabular-nums placeholder:text-gray-300 ${chk.err ? "border-rose-400 bg-rose-50" : "border-gray-200"}`} />
            <button disabled={!canSend || chk.v === null || !!chk.err} onClick={() => chk.v !== null && onSend(chk.v, now)}
              className="rounded-lg bg-blue-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-blue-700 disabled:opacity-40">
              보내기
            </button>
          </span>
        )}
        {chk.err && <p className="mt-0.5 text-[10px] text-rose-600">{chk.err}</p>}
        {it.whenLive && <p className="mt-0.5 text-[10px] text-gray-400">바로 적용: {it.whenLive}</p>}
      </td>
    </tr>
  );
}

export default function Chk2Adjust({ equipment, bundle, st, feed, canKey, onAsk }: {
  equipment: string; bundle: Bundle | null; st: StateData | null; feed: FeedItem[];
  canKey: (kind: string, key: string) => boolean; onAsk: (a: Ask) => void;
}) {
  const runId = st?.runId ?? null;
  const [insts, setInsts] = useState<Inst[]>([]);
  useEffect(() => {
    if (!runId) return;
    let off = false;
    void (async () => {
      const r = await fetch(`/api/ops2/${encodeURIComponent(equipment)}/runs/${encodeURIComponent(runId)}`, { cache: "no-store" }).catch(() => null);
      if (!r?.ok || off) return;
      const b = await r.json();
      setInsts(Array.isArray(b.run?.blocks) ? b.run.blocks : []);
    })();
    return () => { off = true; };
  }, [equipment, runId]);
  const last = useMemo(() => lastAdjusts(feed, runId), [feed, runId]);
  const items = bundle?.adjust?.items ?? [];
  const kind = bundle?.states?.find((s) => s.name === st?.procState)?.kind;
  const active = kind === "active";
  if (!items.length || !st || !active) return null;
  const cur = Math.max(0, (st.step?.no ?? 1) - 1);
  const blocks = runId ? insts : [];

  return (
    <Card title={<><SlidersHorizontal size={15} /> 공정 중 값 수정</>}
      right={<span className="text-[11px] text-gray-400">이번 공정에만 · 레시피·설정은 그대로 · 블록 {st.step?.no ?? "-"}/{st.step?.total ?? "-"}</span>}>
      {st.procState === "CSV_DELAY" && (
        <p className="mb-2 rounded-lg bg-amber-50 px-2 py-1 text-[11px] text-amber-800">레시피 딜레이 행 중 — 장비가 PROCESS_NOT_RUNNING 으로 거부합니다.</p>
      )}
      <div className="overflow-x-auto rounded-xl border border-gray-100">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-50 text-[11px] text-gray-500">
            <tr>{["항목", "쓰는 곳", "지금 값", "새 값"].map((h) => <th key={h} className="px-2 py-1.5 text-left font-semibold">{h}</th>)}</tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const key = `PROCESS_ADJUST:${it.key}`;
              const where = blocks.length ? whereOf(it.key, blocks, cur) : { tone: "on" as const, text: "블록 기록을 읽는 중" };
              return (
                <Row key={it.key} it={it} bundle={bundle} st={st} where={where} last={last.get(`${it.device}.${it.item}`)}
                  canSend={canKey("PROCESS_ADJUST", key)}
                  onSend={(v, now) => onAsk({
                    kind: "PROCESS_ADJUST", key, label: `공정 중 수정 · ${LABEL[it.key] ?? it.key}`,
                    detail: typeof v === "boolean" ? "" : `${fmt(now)} → ${fmt(v)} ${it.param.unit ?? ""}`,
                    args: { device: it.device, item: it.item, value: v }, red: true,
                    lines: [`이번 공정(run ${runId ?? "-"})의 값만 바뀝니다 — 레시피·설정은 그대로`, where.text,
                            ...(it.whenLive ? [`바로 적용 조건: ${it.whenLive}`] : [])],
                    note: it.apply ? `장비 동작: ${it.apply}` : undefined,
                  })} />
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-[10px] text-gray-400">지금 값은 1초 스냅샷의 목표 값(장비가 공정 값을 따로 싣지 않음). 쓰는 곳은 블록 기록으로 화면이 판단 — 마지막 판단은 장비.</p>
    </Card>
  );
}
