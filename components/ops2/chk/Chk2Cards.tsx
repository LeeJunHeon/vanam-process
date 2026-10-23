"use client";

// 챔버K v2 장비 카드 — 값·라벨·단위·자릿수는 묶음 snapshot 정의 그대로. 블록마다 품질 배지(state.links).
// 히터(SV·ON(값·가스 선택)·OFF·히터 정지·RESET·가스 해제 — 입력 칸은 묶음 인자 범위로 미리 막음)와 이온 게이지(필라멘트 ON·OFF)는 조작 버튼을 함께.
import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { BigValue, Card, FieldValue, QBadge, type Ask } from "./kit";
import { argRange, capRange, checkInput, rangeText, type Range } from "./logic";
import { GAS_STATE, HEATER_OWNER, type BlockDef, type Bundle, type Link, type StateData } from "./types";

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

/** 숫자 입력 칸 + 범위(칸에 "0~700 °C", 밖이면 칸 아래 빨간 글씨) */
function NumInput({ value, onChange, range, placeholder, disabled, width = "w-24" }: {
  value: string; onChange: (v: string) => void; range: Range | null; placeholder: string; disabled?: boolean; width?: string;
}) {
  const { error } = checkInput(value, range);
  return (
    <span className="inline-flex flex-col">
      <input value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} inputMode="decimal"
        placeholder={range ? rangeText(range) : placeholder} title={range ? `범위 ${rangeText(range)}` : undefined}
        className={`${width} rounded-lg border bg-white px-2 py-1 text-xs disabled:bg-gray-100 disabled:text-gray-400 ${
          error && !disabled ? "border-rose-400" : "border-gray-200"}`} />
      {error && !disabled && <span className="mt-0.5 text-[10px] font-semibold text-rose-600">{error}</span>}
    </span>
  );
}

export function HeaterCard({ bundle, def, snap, link, st, can, locked, onAsk }: Common & {
  bundle: Bundle | null; st: StateData | null; can: (kind: string) => boolean; locked: boolean; onAsk: (a: Ask) => void;
}) {
  const [target, setTarget] = useState("");
  const [useAr, setUseAr] = useState(false);
  const [arFlow, setArFlow] = useState("");
  const [useO2, setUseO2] = useState(false);
  const [o2Flow, setO2Flow] = useState("");
  const [wp, setWp] = useState("");
  const ok = (kind: string) => can(kind) && !locked;        // 히터 명령은 PLC 가 필요 — PLC 값이 오래되면 잠금
  // 범위: 묶음 commands[].args(HEATER_MAX_TEMP·MFC 풀스케일), 목표는 PLC 가 보고한 상한(sv_limit)이 더 낮으면 그것까지
  const svRange = capRange(argRange(bundle, "HEATER_SV", "value"), snap?.["heater.sv_limit"]);
  const onRange = capRange(argRange(bundle, "HEATER_ON", "value"), snap?.["heater.sv_limit"]);
  const arRange = argRange(bundle, "HEATER_ON", "ar_flow");
  const o2Range = argRange(bundle, "HEATER_ON", "o2_flow");
  const wpRange = argRange(bundle, "HEATER_ON", "wp_mtorr");
  const tIn = checkInput(target, svRange);
  const tOn = checkInput(target, onRange);
  const ar = checkInput(arFlow, arRange);
  const o2 = checkInput(o2Flow, o2Range);
  const wpIn = checkInput(wp, wpRange);
  const sv = typeof snap?.["heater.sv"] === "number" ? (snap["heater.sv"] as number) : null;
  const onValue = tOn.value ?? sv;
  const gasBad = (useAr && !!ar.error) || (useO2 && !!o2.error) || ((useAr || useO2) && !!wpIn.error);
  const fault = snap?.["heater.fault"] === true;
  const gas = st?.heater?.gas ?? null;
  const owner = st?.heater?.owner;

  const onArgs = () => {
    const a: Record<string, unknown> = { value: onValue };
    if (useAr) { a.use_ar = true; if (ar.value !== null) a.ar_flow = ar.value; }
    if (useO2) { a.use_o2 = true; if (o2.value !== null) a.o2_flow = o2.value; }
    if ((useAr || useO2) && wpIn.value !== null) a.wp_mtorr = wpIn.value;
    return a;
  };
  const gasText = [useAr && `Ar ${arFlow || "?"} sccm`, useO2 && `O₂ ${o2Flow || "?"} sccm`, (useAr || useO2) && wp && `WP ${wp} mTorr`]
    .filter(Boolean).join(" · ");
  const btn = "rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold disabled:opacity-40";

  return (
    <BlockCard def={def} snap={snap} link={link} big={["pv", "pv2", "sv"]}>
      <p className="mt-2 text-[11px] text-gray-500">
        {owner ? `${HEATER_OWNER[owner] ?? owner} 소유` : "소유 없음"}
        {st?.heater?.handedOver && " · 공정에서 넘겨받음"}
        {gas && ` · ${GAS_STATE[gas] ?? gas}`}
      </p>
      <div className="mt-2 rounded-xl bg-gray-50 p-3">
        <div className="grid grid-cols-[auto_1fr] items-start gap-x-3 gap-y-2 text-[11px]">
          <span className="pt-1.5 text-gray-500">목표 온도</span>
          <span className="flex items-start gap-1.5">
            <NumInput value={target} onChange={setTarget} range={svRange} placeholder="℃" width="w-28" />
            <button disabled={!ok("HEATER_SV") || tIn.value === null || !!tIn.error}
              onClick={() => onAsk({ kind: "HEATER_SV", label: "히터 목표 온도", detail: `→ ${target} ℃`, args: { value: tIn.value } })}
              className={`${btn} border-gray-200 bg-white text-gray-700`}>
              목표 적용
            </button>
          </span>
          <span className="pt-1.5 text-gray-500">가스(선택)</span>
          <span className="flex flex-wrap items-start gap-x-3 gap-y-1.5 text-gray-600">
            <label className="flex items-center gap-1 pt-1.5">
              <input type="checkbox" checked={useAr} onChange={(e) => setUseAr(e.target.checked)} className="h-3 w-3" /> Ar
            </label>
            <NumInput value={arFlow} onChange={setArFlow} range={arRange} placeholder="sccm" disabled={!useAr} width="w-20" />
            <label className="flex items-center gap-1 pt-1.5">
              <input type="checkbox" checked={useO2} onChange={(e) => setUseO2(e.target.checked)} className="h-3 w-3" /> O₂
            </label>
            <NumInput value={o2Flow} onChange={setO2Flow} range={o2Range} placeholder="sccm" disabled={!useO2} width="w-20" />
            <span className="pt-1.5 text-gray-400">압력</span>
            <NumInput value={wp} onChange={setWp} range={wpRange ? { ...wpRange, unit: wpRange.unit || "mTorr" } : null}
              placeholder="mTorr" disabled={!useAr && !useO2} width="w-20" />
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-200/70 pt-3">
          <button disabled={!ok("HEATER_ON") || onValue === null || !!tOn.error || gasBad}
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
          <button disabled={!can("HEATER_STOP")}
            onClick={() => onAsk({ kind: "HEATER_STOP", label: "히터 정지", stop: true,
                                   note: "히터 레시피를 멈추고 RUN 을 끕니다. 공정이 히터를 쓰는 중이면 공정도 멈춥니다." })}
            className={`${btn} border-rose-300 bg-white text-rose-600`}>
            히터 정지
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
          <span className="ml-auto text-[10px] text-gray-400">ON 은 목표 칸이 비면 지금 목표(sv)로 · 히터 정지는 공정·레시피 소유여도 멈춤</span>
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
