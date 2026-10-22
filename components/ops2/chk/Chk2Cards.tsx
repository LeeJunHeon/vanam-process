"use client";

// 챔버K v2 장비 카드 — 값·라벨·단위·자릿수는 묶음 snapshot 정의 그대로. 블록마다 품질 배지(state.links).
// 히터(SV·ON(값·가스 선택)·OFF·RESET·가스 해제)와 이온 게이지(필라멘트 ON·OFF)는 조작 버튼을 함께.
import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { BigValue, Card, FieldValue, QBadge, type Ask } from "./kit";
import { GAS_STATE, HEATER_OWNER, type BlockDef, type Link, type StateData } from "./types";

type Common = { def?: BlockDef; snap?: Record<string, unknown>; link?: Link };

/** 블록 하나 — big 은 위 줄에 크게, 나머지 숫자·문자 필드는 목록, bool 은 점 */
export function BlockCard({ def, snap, link, big = [], foldable, children }: Common & {
  big?: string[]; foldable?: boolean; children?: ReactNode;
}) {
  const [manual, setManual] = useState<boolean | null>(null);   // 누르기 전에는 품질대로(off 면 접음)
  if (!def) return null;
  const off = link?.q === "off";
  const open = manual ?? (!foldable || !off);
  const dimOf = (column: string, own?: boolean) =>
    off || (own && snap?.[`${column}.q`] !== undefined && snap?.[`${column}.q`] !== "ok");
  const bigs = big.map((n) => def.fields.find((f) => f.name === n)).filter((f) => !!f);
  const rest = def.fields.filter((f) => !big.includes(f.name));
  const bools = rest.filter((f) => f.type === "bool");
  const others = rest.filter((f) => f.type !== "bool");

  return (
    <Card
      title={
        foldable ? (
          <button onClick={() => setManual(!open)} className="flex items-center gap-1">
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {def.label}
          </button>
        ) : def.label
      }
      right={<span className="flex items-center gap-1.5">{foldable && !open && off && <span className="text-[10px] text-gray-400">꺼져 있음 — 접어 둠</span>}<QBadge link={link} /></span>}
    >
      {open && (
        <>
          {bigs.length > 0 && (
            <div className={`grid divide-x divide-gray-100 rounded-xl border border-gray-100`}
              style={{ gridTemplateColumns: `repeat(${bigs.length}, minmax(0, 1fr))` }}>
              {bigs.map((f) => <BigValue key={f.column} f={f} v={snap?.[f.column]} dim={dimOf(f.column, f.ownQuality)} />)}
            </div>
          )}
          {bools.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
              {bools.map((f) => <FieldValue key={f.column} f={f} v={snap?.[f.column]} dim={dimOf(f.column, f.ownQuality)} />)}
            </div>
          )}
          {others.length > 0 && (
            <div className="mt-2 grid grid-cols-1 gap-x-5 sm:grid-cols-2">
              {others.map((f) => <FieldValue key={f.column} f={f} v={snap?.[f.column]} dim={dimOf(f.column, f.ownQuality)} />)}
            </div>
          )}
          {children}
        </>
      )}
    </Card>
  );
}

const num = (s: string) => (s.trim() === "" ? null : Number(s));

export function HeaterCard({ def, snap, link, st, can, locked, onAsk }: Common & {
  st: StateData | null; can: (kind: string) => boolean; locked: boolean; onAsk: (a: Ask) => void;
}) {
  const [target, setTarget] = useState("");
  const [useAr, setUseAr] = useState(false);
  const [arFlow, setArFlow] = useState("");
  const [useO2, setUseO2] = useState(false);
  const [o2Flow, setO2Flow] = useState("");
  const [wp, setWp] = useState("");
  const ok = (kind: string) => can(kind) && !locked;        // 히터 명령은 PLC 가 필요 — PLC 품질이 ok 가 아니면 잠금
  const t = num(target);
  const tOk = t !== null && Number.isFinite(t);
  const sv = typeof snap?.["heater.sv"] === "number" ? (snap["heater.sv"] as number) : null;
  const onValue = tOk ? t : sv;
  const fault = snap?.["heater.fault"] === true;
  const gas = st?.heater?.gas ?? null;
  const owner = st?.heater?.owner;

  const onArgs = () => {
    const a: Record<string, unknown> = { value: onValue };
    if (useAr) { a.use_ar = true; if (num(arFlow) !== null) a.ar_flow = num(arFlow); }
    if (useO2) { a.use_o2 = true; if (num(o2Flow) !== null) a.o2_flow = num(o2Flow); }
    if ((useAr || useO2) && num(wp) !== null) a.wp_mtorr = num(wp);
    return a;
  };
  const gasText = [useAr && `Ar ${arFlow || "?"} sccm`, useO2 && `O₂ ${o2Flow || "?"} sccm`, (useAr || useO2) && wp && `WP ${wp} mTorr`]
    .filter(Boolean).join(" · ");
  const input = "rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs disabled:bg-gray-100 disabled:text-gray-400";
  const btn = "rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold disabled:opacity-40";

  return (
    <BlockCard def={def} snap={snap} link={link} big={["pv", "pv2", "sv"]}>
      <p className="mt-2 text-[11px] text-gray-500">
        {owner ? `${HEATER_OWNER[owner] ?? owner} 소유` : "소유 없음"}
        {st?.heater?.handedOver && " · 공정에서 넘겨받음"}
        {gas && ` · ${GAS_STATE[gas] ?? gas}`}
      </p>
      <div className="mt-2 rounded-xl bg-gray-50 p-3">
        <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 text-[11px]">
          <span className="text-gray-500">목표 온도</span>
          <span className="flex items-center gap-1.5">
            <input value={target} onChange={(e) => setTarget(e.target.value)} inputMode="decimal" placeholder="℃"
              className={`w-24 ${input}`} />
            <button disabled={!ok("HEATER_SV") || !tOk}
              onClick={() => onAsk({ kind: "HEATER_SV", label: "히터 목표 온도", detail: `→ ${target} ℃`, args: { value: t } })}
              className={`${btn} border-gray-200 bg-white text-gray-700`}>
              목표 적용
            </button>
          </span>
          <span className="text-gray-500">가스(선택)</span>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-gray-600">
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={useAr} onChange={(e) => setUseAr(e.target.checked)} className="h-3 w-3" /> Ar
            </label>
            <input value={arFlow} onChange={(e) => setArFlow(e.target.value)} disabled={!useAr} placeholder="sccm"
              inputMode="decimal" className={`w-16 ${input}`} />
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={useO2} onChange={(e) => setUseO2(e.target.checked)} className="h-3 w-3" /> O₂
            </label>
            <input value={o2Flow} onChange={(e) => setO2Flow(e.target.value)} disabled={!useO2} placeholder="sccm"
              inputMode="decimal" className={`w-16 ${input}`} />
            <span className="text-gray-400">압력</span>
            <input value={wp} onChange={(e) => setWp(e.target.value)} disabled={!useAr && !useO2} placeholder="mTorr"
              inputMode="decimal" className={`w-16 ${input}`} />
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-200/70 pt-3">
          <button disabled={!ok("HEATER_ON") || onValue === null}
            onClick={() => onAsk({ kind: "HEATER_ON", label: "히터 켜기", args: onArgs(),
                                   detail: `→ ${onValue} ℃${gasText ? ` · ${gasText}` : ""}` })}
            className={`${btn} border-green-600 bg-green-500 text-green-950`}>
            ON
          </button>
          <button disabled={!ok("HEATER_OFF")}
            onClick={() => onAsk({ kind: "HEATER_OFF", label: "히터 끄기" })}
            className={`${btn} border-gray-300 bg-white text-gray-700`}>
            OFF
          </button>
          {fault && (
            <button disabled={!ok("HEATER_RESET")}
              onClick={() => onAsk({ kind: "HEATER_RESET", label: "히터 이상 리셋", detail: "(원인을 먼저 확인)", danger: true })}
              className={`${btn} border-rose-300 bg-white text-rose-600`}>
              이상 리셋
            </button>
          )}
          {gas && gas !== "IDLE" && (
            <button disabled={!can("HEATER_GAS_RELEASE")}
              onClick={() => onAsk({ kind: "HEATER_GAS_RELEASE", label: "히터 가스 해제" })}
              className={`${btn} border-blue-300 bg-white text-blue-700`}>
              가스 해제
            </button>
          )}
          <span className="ml-auto text-[10px] text-gray-400">ON 은 목표 칸이 비면 지금 목표(sv)로</span>
        </div>
      </div>
    </BlockCard>
  );
}

export function IgCard({ def, snap, link, can, onAsk }: Common & { can: (kind: string) => boolean; onAsk: (a: Ask) => void }) {
  const on = snap?.["ig.filament"] === true;
  return (
    <BlockCard def={def} snap={snap} link={link} big={["ion_torr", "a_torr", "b_torr"]}>
      <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-gray-50 pt-2">
        <span className="text-[11px] text-gray-500">필라멘트</span>
        {([true, false] as const).map((want) => (
          <button key={String(want)} disabled={!can("IG_FILAMENT")}
            onClick={() => onAsk({ kind: "IG_FILAMENT", label: "이온 게이지 필라멘트", detail: want ? "→ ON" : "→ OFF",
                                   args: { on: want } })}
            className={`rounded-lg border px-3 py-1.5 text-[11px] font-semibold disabled:opacity-40 ${
              on === want ? (want ? "border-green-600 bg-green-500 text-green-950" : "border-gray-400 bg-gray-200 text-gray-700")
              : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
            {want ? "ON" : "OFF"}
          </button>
        ))}
        <span className="ml-auto text-[10px] text-gray-400">공정 중에는 공정이 다룬다(유휴에서만)</span>
      </div>
    </BlockCard>
  );
}
