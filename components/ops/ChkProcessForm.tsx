"use client";

import { useState } from "react";
import type { PendingCmd } from "@/components/ops/OpsKit";
import RecipePicker, { type RecipeItem } from "@/components/ops/RecipePicker";

type Props = {
  online: boolean;
  running: boolean;
  onRequest: (c: PendingCmd) => void;
};

const F =
  "w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-gray-800 focus:border-blue-300 focus:outline-none";

function Chk({ label, on, set }: { label: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-1.5 text-[11px] font-medium text-gray-600">
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)}
        className="h-3.5 w-3.5 rounded border-gray-300" />
      {label}
    </label>
  );
}

export default function ChkProcessForm({ online, running, onRequest }: Props) {
  const [picker, setPicker] = useState(false);
  const [recipe, setRecipe] = useState<RecipeItem | null>(null);
  const [useG1, setUseG1] = useState(false);
  const [g1, setG1] = useState("");
  const [useG2, setUseG2] = useState(false);
  const [g2, setG2] = useState("");
  const [useAr, setUseAr] = useState(true);
  const [ar, setAr] = useState("5");
  const [useO2, setUseO2] = useState(false);
  const [o2, setO2] = useState("");
  const [wp, setWp] = useState("2");
  const [useRf, setUseRf] = useState(true);
  const [rf, setRf] = useState("200");
  const [useDc, setUseDc] = useState(false);
  const [dc, setDc] = useState("");
  const [dcDelay, setDcDelay] = useState(false);
  const [shutter, setShutter] = useState("5");
  const [ptime, setPtime] = useState("10");
  const [offset, setOffset] = useState("6.79");
  const [param, setParam] = useState("1.0395");

  const pickRecipe = (r: RecipeItem) => {
    setRecipe(r);
    setPicker(false);
    const s = r.rows?.[0];
    if (!s) return;
    const b = (v?: string) => v === "1";
    setUseG1(b(s.gun1)); setUseG2(b(s.gun2));
    setUseAr(b(s.Ar)); setAr(s.Ar_flow ?? "");
    setUseO2(b(s.O2)); setO2(s.O2_flow ?? "");
    setWp(s.working_pressure ?? "");
    setUseRf(b(s.use_rf_power)); setRf(s.rf_power ?? "");
    setUseDc(b(s.use_dc_power)); setDc(s.dc_power ?? "");
    setDcDelay(b(s.use_dc_delay));
    setShutter(s.shutter_delay ?? "");
    setPtime(s.process_time ?? "");
  };

  const start = () =>
    onRequest({
      command: "PROCESS_START",
      label: "공정 시작",
      detail: `(${ptime}분)`,
      danger: true,
      args: {
        useG1, g1, useG2, g2,
        useAr, arFlow: ar, useO2, o2Flow: o2,
        workingPressure: wp,
        useRf, rfPower: rf, useDc, dcPower: dc, dcDelay,
        shutterDelay: shutter, processTime: ptime,
        offset, param,
      },
    });

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-gray-900">공정 설정</h3>
        <span className="flex items-center gap-2">
          <button onClick={() => setPicker(true)}
            className="rounded-lg border border-gray-200 px-2.5 py-1 text-[11px] font-semibold text-gray-700">
            레시피 불러오기
          </button>
          <span className="text-[11px] text-gray-400">
            {running ? "공정 진행 중" : online ? "시작 가능" : "장비 미연결"}
          </span>
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3 lg:grid-cols-4">
        <div className="space-y-1"><Chk label="G1 Target" on={useG1} set={setUseG1} />
          <input className={F} value={g1} onChange={(e) => setG1(e.target.value)} /></div>
        <div className="space-y-1"><Chk label="G2 Target" on={useG2} set={setUseG2} />
          <input className={F} value={g2} onChange={(e) => setG2(e.target.value)} /></div>
        <div className="space-y-1"><Chk label="Ar flow [sccm]" on={useAr} set={setUseAr} />
          <input className={F} value={ar} onChange={(e) => setAr(e.target.value)} inputMode="decimal" /></div>
        <div className="space-y-1"><Chk label="O₂ flow [sccm]" on={useO2} set={setUseO2} />
          <input className={F} value={o2} onChange={(e) => setO2(e.target.value)} inputMode="decimal" /></div>

        <div className="space-y-1"><p className="text-[11px] font-medium text-gray-600">working pressure [mTorr]</p>
          <input className={F} value={wp} onChange={(e) => setWp(e.target.value)} inputMode="decimal" /></div>
        <div className="space-y-1"><Chk label="RF power [W]" on={useRf} set={setUseRf} />
          <input className={F} value={rf} onChange={(e) => setRf(e.target.value)} inputMode="decimal" /></div>
        <div className="space-y-1"><Chk label="DC power [W]" on={useDc} set={setUseDc} />
          <input className={F} value={dc} onChange={(e) => setDc(e.target.value)} inputMode="decimal" /></div>
        <div className="space-y-1"><p className="text-[11px] font-medium text-gray-600">Shutter delay [min]</p>
          <input className={F} value={shutter} onChange={(e) => setShutter(e.target.value)} inputMode="decimal" /></div>

        <div className="space-y-1"><p className="text-[11px] font-medium text-gray-600">process time [min]</p>
          <input className={F} value={ptime} onChange={(e) => setPtime(e.target.value)} inputMode="decimal" /></div>
        <div className="space-y-1"><p className="text-[11px] font-medium text-gray-600">offset</p>
          <input className={F} value={offset} onChange={(e) => setOffset(e.target.value)} inputMode="decimal" /></div>
        <div className="space-y-1"><p className="text-[11px] font-medium text-gray-600">param</p>
          <input className={F} value={param} onChange={(e) => setParam(e.target.value)} inputMode="decimal" /></div>
        <div className="flex items-end pb-1"><Chk label="DC stabilize" on={dcDelay} set={setDcDelay} /></div>
      </div>

      {recipe && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-gray-50 px-3 py-2">
          <span className="text-[11px] font-semibold text-gray-700">
            레시피 · {recipe.name} ({recipe.rows.length}스텝)
          </span>
          <button disabled={!online}
            onClick={() => onRequest({
              command: "RECIPE_PROCESS_RUN", label: "레시피 적재",
              detail: `${recipe.name} (${recipe.rows.length}스텝)`,
              args: { rows: recipe.rows },
            })}
            className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-700 disabled:opacity-40">
            1. 적재
          </button>
          <button disabled={!online}
            onClick={() => onRequest({
              command: "RECIPE_PROCESS_START", label: "레시피 공정 시작",
              detail: recipe.name, danger: true,
            })}
            className="rounded-lg bg-gray-800 px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-40">
            2. 레시피로 시작
          </button>
          <button onClick={() => setRecipe(null)}
            className="ml-auto text-[11px] text-gray-400 hover:text-gray-600">해제</button>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-gray-50 pt-3">
        <button
          onClick={start}
          disabled={!online || running}
          className="rounded-xl bg-gray-800 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"
        >
          공정 시작
        </button>
        <button
          onClick={() => onRequest({ command: "PROCESS_STOP", label: "공정 정지" })}
          disabled={!online}
          className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-700 disabled:opacity-40"
        >
          공정 정지
        </button>
        <button
          onClick={() => onRequest({ command: "ALL_STOP", label: "비상 정지(ALL STOP)", danger: true })}
          disabled={!online}
          className="ml-auto rounded-xl border border-rose-200 px-4 py-2 text-xs font-semibold text-rose-600 disabled:opacity-40"
        >
          ALL STOP
        </button>
      </div>
      <p className="mt-2 text-[10px] text-gray-400">
        시작하면 이 값들이 장비 프로그램의 입력란에 그대로 적용된 뒤 공정이 시작됩니다.
      </p>

      {picker && (
        <RecipePicker equipment="CHK" kind="process" onPick={pickRecipe} onClose={() => setPicker(false)} />
      )}
    </section>
  );
}
