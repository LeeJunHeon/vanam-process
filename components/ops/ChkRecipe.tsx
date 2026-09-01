"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { PendingCmd } from "@/components/ops/OpsKit";

type ProcRow = {
  Process_name: string; Ar: boolean; Ar_flow: string; O2: boolean; O2_flow: string;
  working_pressure: string; process_time: string; shutter_delay: string;
  use_rf_power: boolean; rf_power: string; use_dc_power: boolean; dc_power: string;
  use_dc_delay: boolean; use_heater: boolean; heater_temp: string;
  gun1: boolean; gun2: boolean;
};
type HeatRow = { target_c: string; ramp_c_per_min: string; soak_min: string };

const newProc = (n: number): ProcRow => ({
  Process_name: `STEP${n}`, Ar: true, Ar_flow: "5", O2: false, O2_flow: "",
  working_pressure: "2", process_time: "10", shutter_delay: "5",
  use_rf_power: true, rf_power: "200", use_dc_power: false, dc_power: "",
  use_dc_delay: false, use_heater: false, heater_temp: "",
  gun1: true, gun2: false,
});
const newHeat = (): HeatRow => ({ target_c: "120", ramp_c_per_min: "10", soak_min: "30" });

const IN = "w-full rounded border border-gray-200 px-1.5 py-1 text-[11px]";

export default function ChkRecipe({
  online, onRequest,
}: { online: boolean; onRequest: (c: PendingCmd) => void }) {
  const [tab, setTab] = useState<"process" | "heater">("process");
  const [procs, setProcs] = useState<ProcRow[]>([newProc(1)]);
  const [heats, setHeats] = useState<HeatRow[]>([newHeat()]);

  const pset = (i: number, p: Partial<ProcRow>) =>
    setProcs((s) => s.map((r, k) => (k === i ? { ...r, ...p } : r)));
  const hset = (i: number, p: Partial<HeatRow>) =>
    setHeats((s) => s.map((r, k) => (k === i ? { ...r, ...p } : r)));

  const runProcess = () =>
    onRequest({
      command: "RECIPE_PROCESS_RUN",
      label: "공정 레시피 실행",
      detail: `(${procs.length}스텝)`,
      danger: true,
      args: {
        rows: procs.map((r) => ({
          Process_name: r.Process_name,
          Ar: r.Ar ? "1" : "0", Ar_flow: r.Ar_flow,
          O2: r.O2 ? "1" : "0", O2_flow: r.O2_flow,
          working_pressure: r.working_pressure,
          process_time: r.process_time,
          shutter_delay: r.shutter_delay,
          use_rf_power: r.use_rf_power ? "1" : "0", rf_power: r.rf_power,
          use_dc_power: r.use_dc_power ? "1" : "0", dc_power: r.dc_power,
          use_dc_delay: r.use_dc_delay ? "1" : "0",
          use_heater: r.use_heater ? "1" : "0", heater_temp: r.heater_temp,
          gun1: r.gun1 ? "1" : "0", gun2: r.gun2 ? "1" : "0",
        })),
      },
    });

  const runHeater = () =>
    onRequest({
      command: "RECIPE_HEATER_RUN",
      label: "히터 레시피 실행",
      detail: `(${heats.length}단계)`,
      args: {
        rows: heats.map((r, i) => ({
          step: String(i + 1),
          target_c: r.target_c,
          ramp_c_per_min: r.ramp_c_per_min,
          soak_min: r.soak_min,
        })),
      },
    });

  const Chk = ({ on, set, label }: { on: boolean; set: (v: boolean) => void; label: string }) => (
    <label className="flex items-center gap-1 text-[10px] text-gray-500">
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)}
        className="h-3 w-3 rounded border-gray-300" />
      {label}
    </label>
  );

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-gray-900">레시피</h3>
        <div className="flex gap-1 rounded-lg bg-gray-100 p-0.5 text-[11px]">
          {(["process", "heater"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`rounded px-2.5 py-1 font-semibold ${
                tab === t ? "bg-white text-blue-600 shadow-sm" : "text-gray-500"
              }`}>
              {t === "process" ? "공정" : "히터"}
            </button>
          ))}
        </div>
      </div>

      {tab === "process" ? (
        <>
          <div className="space-y-2">
            {procs.map((r, i) => (
              <div key={i} className="rounded-xl border border-gray-100 p-2">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="text-[10px] font-bold text-gray-400">{i + 1}</span>
                  <input className={`${IN} flex-1`} value={r.Process_name}
                    onChange={(e) => pset(i, { Process_name: e.target.value })}
                    placeholder="스텝 이름" />
                  <button onClick={() => setProcs((s) => s.filter((_, k) => k !== i))}
                    disabled={procs.length === 1}
                    className="rounded p-1 text-gray-300 hover:text-gray-500 disabled:opacity-30">
                    <Trash2 size={13} />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                  <div><Chk on={r.Ar} set={(v) => pset(i, { Ar: v })} label="Ar" />
                    <input className={IN} value={r.Ar_flow} onChange={(e) => pset(i, { Ar_flow: e.target.value })} /></div>
                  <div><Chk on={r.O2} set={(v) => pset(i, { O2: v })} label="O₂" />
                    <input className={IN} value={r.O2_flow} onChange={(e) => pset(i, { O2_flow: e.target.value })} /></div>
                  <div><p className="text-[10px] text-gray-500">W.P</p>
                    <input className={IN} value={r.working_pressure} onChange={(e) => pset(i, { working_pressure: e.target.value })} /></div>
                  <div><p className="text-[10px] text-gray-500">시간(분)</p>
                    <input className={IN} value={r.process_time} onChange={(e) => pset(i, { process_time: e.target.value })} /></div>
                  <div><p className="text-[10px] text-gray-500">셔터딜레이</p>
                    <input className={IN} value={r.shutter_delay} onChange={(e) => pset(i, { shutter_delay: e.target.value })} /></div>
                  <div><Chk on={r.use_rf_power} set={(v) => pset(i, { use_rf_power: v })} label="RF" />
                    <input className={IN} value={r.rf_power} onChange={(e) => pset(i, { rf_power: e.target.value })} /></div>
                  <div><Chk on={r.use_dc_power} set={(v) => pset(i, { use_dc_power: v })} label="DC" />
                    <input className={IN} value={r.dc_power} onChange={(e) => pset(i, { dc_power: e.target.value })} /></div>
                  <div><Chk on={r.use_heater} set={(v) => pset(i, { use_heater: v })} label="히터" />
                    <input className={IN} value={r.heater_temp} onChange={(e) => pset(i, { heater_temp: e.target.value })} /></div>
                </div>
                <div className="mt-1.5 flex gap-3">
                  <Chk on={r.gun1} set={(v) => pset(i, { gun1: v })} label="Gun1" />
                  <Chk on={r.gun2} set={(v) => pset(i, { gun2: v })} label="Gun2" />
                  <Chk on={r.use_dc_delay} set={(v) => pset(i, { use_dc_delay: v })} label="DC stabilize" />
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => setProcs((s) => [...s, newProc(s.length + 1)])}
            className="mt-2 inline-flex items-center gap-1 rounded-lg bg-gray-100 px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 hover:bg-gray-200">
            <Plus size={12} /> 스텝 추가
          </button>
          <div className="mt-3 border-t border-gray-50 pt-2.5">
            <button onClick={runProcess} disabled={!online}
              className="rounded-xl bg-gray-800 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">
              공정 레시피 실행 ({procs.length}스텝)
            </button>
            <p className="mt-1.5 text-[10px] text-gray-400">
              스텝이 순서대로 연속 실행됩니다. 각 항목은 장비 CSV 형식 그대로 전달됩니다.
            </p>
          </div>
        </>
      ) : (
        <>
          <div className="space-y-1.5">
            <div className="grid grid-cols-[24px_1fr_1fr_1fr_28px] gap-1.5 text-[10px] text-gray-400">
              <span /><span>목표 ℃</span><span>승온 ℃/분</span><span>유지 분</span><span />
            </div>
            {heats.map((r, i) => (
              <div key={i} className="grid grid-cols-[24px_1fr_1fr_1fr_28px] items-center gap-1.5">
                <span className="text-[10px] font-bold text-gray-400">{i + 1}</span>
                <input className={IN} value={r.target_c} onChange={(e) => hset(i, { target_c: e.target.value })} />
                <input className={IN} value={r.ramp_c_per_min} onChange={(e) => hset(i, { ramp_c_per_min: e.target.value })} />
                <input className={IN} value={r.soak_min} onChange={(e) => hset(i, { soak_min: e.target.value })} />
                <button onClick={() => setHeats((s) => s.filter((_, k) => k !== i))}
                  disabled={heats.length === 1}
                  className="rounded p-1 text-gray-300 hover:text-gray-500 disabled:opacity-30">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
          <button onClick={() => setHeats((s) => [...s, newHeat()])}
            className="mt-2 inline-flex items-center gap-1 rounded-lg bg-gray-100 px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 hover:bg-gray-200">
            <Plus size={12} /> 단계 추가
          </button>
          <div className="mt-3 flex gap-2 border-t border-gray-50 pt-2.5">
            <button onClick={runHeater} disabled={!online}
              className="rounded-xl bg-gray-800 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">
              히터 레시피 실행
            </button>
            <button
              onClick={() => onRequest({ command: "RECIPE_HEATER_STOP", label: "히터 레시피 중단" })}
              disabled={!online}
              className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-700 disabled:opacity-40">
              중단
            </button>
          </div>
          <p className="mt-1.5 text-[10px] text-gray-400">
            승온 속도는 최소 6 ℃/분입니다. 그보다 낮게 넣으면 장비가 6으로 보정합니다.
          </p>
        </>
      )}
    </section>
  );
}
