"use client";

// 챔버K v2 장비 카드 — 값·라벨·단위·자릿수는 묶음 snapshot 정의 그대로. 블록마다 품질 배지(state.links).
// 히터(SV·ON(값·가스 선택)·OFF·히터 정지·RESET·가스 해제 — 입력 칸은 묶음 인자 범위로 미리 막음)와 이온 게이지(필라멘트 ON·OFF)는 조작 버튼을 함께.
import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { BigValue, Card, FieldValue, QBadge, type Ask } from "./kit";
import { argRange, capRange, checkInput, rangeText, type Range } from "./logic";
import { GAS_STATE, HEATER_OWNER, type BlockDef, type Bundle, type Link, type StateData } from "./types";
import { useChk2Mode } from "./mode";

type Common = { def?: BlockDef; snap?: Record<string, unknown>; link?: Link };

/** 블록 하나 — big 은 위 줄에 크게, 나머지 숫자·문자 필드는 목록, bool 은 점 */
export function BlockCard({ def, snap, link, big = [], foldable, hide = [], children }: Common & {
  big?: string[]; foldable?: boolean; hide?: string[]; children?: ReactNode;
}) {
  const [manual, setManual] = useState<boolean | null>(null);   // 누르기 전에는 품질대로(off 면 접음)
  const { detail } = useChk2Mode();
  if (!def) return null;
  const off = link?.q === "off";
  const open = manual ?? (!foldable || !off);
  const dimOf = (column: string, own?: boolean) =>
    off || (own && snap?.[`${column}.q`] !== undefined && snap?.[`${column}.q`] !== "ok");
  const bigs = big.map((n) => def.fields.find((f) => f.name === n)).filter((f) => !!f);
  // detail 필드(레지스터·내부 값)는 '상세'에서만, hide 는 카드가 따로 보여 주는 것
  const rest = def.fields.filter((f) => !big.includes(f.name) && (detail || (!f.detail && !hide.includes(f.name))));
  const bools = rest.filter((f) => f.type === "bool");
  const others = rest.filter((f) => f.type !== "bool");

  const title = <>{def.label}{def.desc && <span className="text-[11px] font-normal text-gray-400">{def.desc}</span>}</>;
  return (
    <Card
      title={
        foldable ? (
          <button onClick={() => setManual(!open)} className="flex items-center gap-1">
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {title}
          </button>
        ) : title
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

/** 노트북 로컬 화면에서 숨긴 조작 — 한 줄 안내 */
function WebOnlyNote({ what }: { what: string }) {
  return <p className="mt-2 rounded-lg bg-gray-50 px-2 py-1 text-[10px] text-gray-500">{what}은 웹에서만</p>;
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
  const m = useChk2Mode();
  const full = !m.webOnly("HEATER_ON");                       // 노트북 화면은 히터 정지만

  // 출력 — v1 결정대로 퍼센트 없이 DAC 값과 추정 전류, 꺼져 있으면 "정지 (DAC n)"
  const mv = typeof snap?.["heater.mv"] === "number" ? (snap["heater.mv"] as number) : null;
  const mvMax = typeof snap?.["heater.mv_limit"] === "number" ? (snap["heater.mv_limit"] as number) : null;
  const amp = typeof snap?.["heater.current_est"] === "number" ? (snap["heater.current_est"] as number) : null;
  const running = snap?.["heater.run"] === true;
  const outText = mv === null ? "—" : running
    ? `DAC ${Math.round(mv)}${mvMax ? `/${Math.round(mvMax)}` : ""}${amp !== null ? ` · ≈${amp.toFixed(1)} A` : ""}`
    : `정지 (DAC ${Math.round(mv)})`;

  return (
    <BlockCard def={def} snap={snap} link={link} big={["pv", "pv2", "sv"]} hide={["mv", "current_est"]}>
      <p className="mt-2 text-xs text-gray-600">출력 <b className="tabular-nums text-gray-900">{outText}</b></p>
      {(owner || (gas && gas !== "IDLE")) && (
        <p className="mt-1 text-[11px] text-gray-500">
          {owner && `히터: ${HEATER_OWNER[owner] ?? owner} 소유`}
          {st?.heater?.handedOver && " · 공정에서 넘겨받음"}
          {gas && gas !== "IDLE" && `${owner ? " · " : ""}${GAS_STATE[gas] ?? gas}`}
        </p>
      )}
      <div className="mt-2 rounded-xl bg-gray-50 p-3">
        {full && <div className="grid grid-cols-[auto_1fr] items-start gap-x-3 gap-y-2 text-[11px]">
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
        </div>}
        <div className={`flex flex-wrap items-center gap-2 ${full ? "mt-3 border-t border-gray-200/70 pt-3" : ""}`}>
          {full && <button disabled={!ok("HEATER_ON") || onValue === null || !!tOn.error || gasBad}
            onClick={() => onAsk({ kind: "HEATER_ON", label: "히터 켜기", args: onArgs(),
                                   detail: `→ ${onValue} ℃${gasText ? ` · ${gasText}` : ""}` })}
            className={`${btn} border-green-600 bg-green-500 text-green-950`}>
            ON
          </button>}
          {full && <button disabled={!ok("HEATER_OFF")}
            onClick={() => onAsk({ kind: "HEATER_OFF", label: "히터 끄기" })}
            className={`${btn} border-gray-300 bg-white text-gray-700`}>
            OFF
          </button>}
          <button disabled={!can("HEATER_STOP")}
            onClick={() => onAsk({ kind: "HEATER_STOP", label: "히터 정지", stop: true,
                                   note: "히터 레시피를 멈추고 RUN 을 끕니다. 공정이 히터를 쓰는 중이면 공정도 멈춥니다." })}
            className={`${btn} border-rose-300 bg-white text-rose-600`}>
            히터 정지
          </button>
          {fault && full && (
            <button disabled={!ok("HEATER_RESET")}
              onClick={() => onAsk({ kind: "HEATER_RESET", label: "히터 이상 리셋", detail: "(원인을 먼저 확인)", danger: true })}
              className={`${btn} border-rose-300 bg-white text-rose-600`}>
              이상 리셋
            </button>
          )}
          {gas && gas !== "IDLE" && !m.webOnly("HEATER_GAS_RELEASE") && (
            <button disabled={!can("HEATER_GAS_RELEASE")}
              onClick={() => onAsk({ kind: "HEATER_GAS_RELEASE", label: "히터 가스 해제" })}
              className={`${btn} border-blue-300 bg-white text-blue-700`}>
              가스 해제
            </button>
          )}
          <span className="ml-auto text-[10px] text-gray-400">
            {full ? "목표 칸을 비우고 ON 하면 지금 목표 온도로 켭니다. " : ""}히터 정지는 공정·레시피가 쓰는 중이어도 멈춥니다.
          </span>
        </div>
        {!full && <WebOnlyNote what="목표 온도·ON·OFF·이상 리셋·가스 해제" />}
      </div>
    </BlockCard>
  );
}

export function IgCard({ def, snap, link, can, onAsk }: Common & { can: (kind: string) => boolean; onAsk: (a: Ask) => void }) {
  const on = snap?.["ig.filament"] === true;
  const m = useChk2Mode();
  return (
    <BlockCard def={def} snap={snap} link={link} big={["ion_torr", "a_torr", "b_torr"]}>
      {m.webOnly("IG_FILAMENT") ? <WebOnlyNote what={`필라멘트 ${on ? "ON" : "OFF"} — 조작`} /> : <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-gray-50 pt-2">
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
        <span className="ml-auto text-[10px] text-gray-400">공정 중에는 공정이 필라멘트를 다룹니다(공정이 없을 때만 조작)</span>
      </div>}
    </BlockCard>
  );
}
