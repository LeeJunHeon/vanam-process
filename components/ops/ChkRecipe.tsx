"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import RecipePicker, { type RecipeItem } from "@/components/ops/RecipePicker";
import { fmtLogTime } from "@/lib/ops";

type ProcRow = Record<string, string>;
type HeatRow = Record<string, string>;

const newProc = (n: number): ProcRow => ({
  Process_name: `STEP${n}`, Ar: "1", Ar_flow: "5", O2: "0", O2_flow: "",
  working_pressure: "2", process_time: "10", shutter_delay: "5",
  use_rf_power: "1", rf_power: "200", use_dc_power: "0", dc_power: "",
  use_dc_delay: "0", use_heater: "0", heater_temp: "", heater_ramp: "",
  gun1: "1", gun2: "0", "G1 Target": "", "G2 Target": "",
});
const newHeat = (): HeatRow => ({ target_c: "120", ramp_c_per_min: "12", ramp_min: "", soak_min: "30" });

const IN = "w-full rounded border border-gray-200 px-1.5 py-1 text-[11px]";
const on1 = (v?: string) => v === "1";

// 공정 레시피 입력 항목 정의 (CSV 컬럼명과 1:1)
const PROC_FIELDS: { col: string; label: string; use?: string; unit?: string }[] = [
  { col: "Ar_flow", label: "Ar 유량", use: "Ar", unit: "sccm" },
  { col: "O2_flow", label: "O₂ 유량", use: "O2", unit: "sccm" },
  { col: "working_pressure", label: "공정 압력", unit: "mTorr" },
  { col: "process_time", label: "공정 시간", unit: "분" },
  { col: "shutter_delay", label: "셔터 딜레이", unit: "분" },
  { col: "rf_power", label: "RF 파워", use: "use_rf_power", unit: "W" },
  { col: "dc_power", label: "DC 파워", use: "use_dc_power", unit: "W" },
  { col: "heater_temp", label: "히터 온도", use: "use_heater", unit: "℃" },
  { col: "heater_ramp", label: "승온 속도(6배수)", unit: "℃/분" },
  { col: "G1 Target", label: "G1 타겟명" },
  { col: "G2 Target", label: "G2 타겟명" },
];
const PROC_FLAGS: { col: string; label: string }[] = [
  { col: "gun1", label: "Gun 1" },
  { col: "gun2", label: "Gun 2" },
  { col: "use_dc_delay", label: "DC 안정화 대기" },
];

export default function ChkRecipe() {
  const [tab, setTab] = useState<"process" | "heater">("process");
  const [picker, setPicker] = useState<null | "process" | "heater">(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [pName, setPName] = useState("");
  const [pId, setPId] = useState<number | null>(null);
  const [pMeta, setPMeta] = useState<string | null>(null);
  const [procs, setProcs] = useState<ProcRow[]>([newProc(1)]);

  const [hName, setHName] = useState("");
  const [hId, setHId] = useState<number | null>(null);
  const [hMeta, setHMeta] = useState<string | null>(null);
  const [hRepeat, setHRepeat] = useState("1");
  const [heats, setHeats] = useState<HeatRow[]>([newHeat()]);

  const pset = (i: number, col: string, v: string) =>
    setProcs((s) => s.map((r, k) => (k === i ? { ...r, [col]: v } : r)));
  const hset = (i: number, col: string, v: string) =>
    setHeats((s) => s.map((r, k) => (k === i ? { ...r, [col]: v } : r)));

  const save = async () => {
    const kind = tab;
    const name = (kind === "process" ? pName : hName).trim();
    if (!name) { setMsg("레시피 이름을 입력하세요."); return; }
    const payload = {
      equipment: "CHK", kind, name,
      rows: kind === "process"
        ? procs
        : heats.map((r, i) => ({
            ...r,
            step: String(i + 1),
            ...(i === 0 ? { repeat: hRepeat.trim() || "1" } : {}),
          })),
      id: (kind === "process" ? pId : hId) ?? undefined,
    };
    const res = await fetch("/api/ops/recipe", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { setMsg(j?.error ?? "저장에 실패했습니다."); return; }
    const item = j.item as RecipeItem;
    if (kind === "process") { setPId(item.id); setPMeta(`최종 수정 ${item.updatedBy} · ${fmtLogTime(item.updatedAt)}`); }
    else { setHId(item.id); setHMeta(`최종 수정 ${item.updatedBy} · ${fmtLogTime(item.updatedAt)}`); }
    setMsg(`"${name}" 저장했습니다.`);
  };

  const pick = (r: RecipeItem) => {
    if (r.kind === "process") {
      setPId(r.id); setPName(r.name); setProcs(r.rows.length ? r.rows : [newProc(1)]);
      setPMeta(`최종 수정 ${r.updatedBy} · ${fmtLogTime(r.updatedAt)}`);
    } else {
      setHId(r.id); setHName(r.name); setHeats(r.rows.length ? r.rows : [newHeat()]);
      setHRepeat(String(r.rows?.[0]?.repeat ?? "1"));
      setHMeta(`최종 수정 ${r.updatedBy} · ${fmtLogTime(r.updatedAt)}`);
    }
    setPicker(null);
    setMsg(`"${r.name}" 불러왔습니다.`);
  };

  const Flag = ({ i, col, label }: { i: number; col: string; label: string }) => (
    <label className="flex items-center gap-1 text-[10px] text-gray-500">
      <input type="checkbox" checked={on1(procs[i][col])}
        onChange={(e) => pset(i, col, e.target.checked ? "1" : "0")}
        className="h-3 w-3 rounded border-gray-300" />
      {label}
    </label>
  );

  const name = tab === "process" ? pName : hName;
  const setName = tab === "process" ? setPName : setHName;
  const meta = tab === "process" ? pMeta : hMeta;
  const isEdit = (tab === "process" ? pId : hId) !== null;

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

      {/* 이름 + 저장/불러오기 */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)}
          placeholder="레시피 이름"
          className="min-w-0 flex-1 rounded-lg border border-gray-200 px-2 py-1.5 text-xs" />
        <button onClick={save}
          className="rounded-lg bg-gray-800 px-3 py-1.5 text-[11px] font-semibold text-white">
          {isEdit ? "덮어쓰기 저장" : "레시피 저장"}
        </button>
        <button onClick={() => setPicker(tab)}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-[11px] font-semibold text-gray-700">
          레시피 불러오기
        </button>
      </div>
      {meta && <p className="mb-2 text-[10px] text-gray-400">{meta}</p>}
      {msg && <p className="mb-2 text-[11px] text-gray-600">{msg}</p>}

      {tab === "process" ? (
        <>
          <div className="space-y-2">
            {procs.map((r, i) => (
              <div key={i} className="rounded-xl border border-gray-100 p-2.5">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-[10px] font-bold text-gray-400">{i + 1}</span>
                  <input className={`${IN} flex-1`} value={r.Process_name ?? ""}
                    onChange={(e) => pset(i, "Process_name", e.target.value)}
                    placeholder="공정 이름 (Process_name)" />
                  <button onClick={() => setProcs((s) => s.filter((_, k) => k !== i))}
                    disabled={procs.length === 1}
                    className="rounded p-1 text-gray-300 hover:text-gray-500 disabled:opacity-30">
                    <Trash2 size={13} />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">
                  {PROC_FIELDS.map((f) => (
                    <div key={f.col}>
                      <label className="mb-0.5 flex items-center gap-1 text-[10px] text-gray-500">
                        {f.use && (
                          <input type="checkbox" checked={on1(r[f.use])}
                            onChange={(e) => pset(i, f.use!, e.target.checked ? "1" : "0")}
                            className="h-3 w-3 rounded border-gray-300" />
                        )}
                        <span className="truncate">{f.label}</span>
                        {f.unit && <span className="text-gray-300">{f.unit}</span>}
                      </label>
                      <input className={IN} value={r[f.col] ?? ""}
                        onChange={(e) => pset(i, f.col, e.target.value)} />
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap gap-3">
                  {PROC_FLAGS.map((f) => <Flag key={f.col} i={i} col={f.col} label={f.label} />)}
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => setProcs((s) => [...s, newProc(s.length + 1)])}
            className="mt-2 inline-flex items-center gap-1 rounded-lg bg-gray-100 px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 hover:bg-gray-200">
            <Plus size={12} /> 공정 스텝 추가
          </button>
          <p className="mt-2 text-[10px] text-gray-400">
            저장한 레시피는 공정 설정 카드에서 불러와 실행합니다.
          </p>
        </>
      ) : (
        <>
          <div className="space-y-1.5">
            <div className="grid grid-cols-[22px_1fr_1fr_1fr_1fr_26px] gap-2 text-[10px] text-gray-400">
              <span /><span>목표 온도 ℃</span><span>승온 ℃/분 (6배수)</span>
              <span>승온 시간 분(선택)</span><span>유지 시간 분</span><span />
            </div>
            {heats.map((r, i) => (
              <div key={i} className="grid grid-cols-[22px_1fr_1fr_1fr_1fr_26px] items-center gap-2">
                <span className="text-[10px] font-bold text-gray-400">{i + 1}</span>
                <input className={IN} value={r.target_c ?? ""} onChange={(e) => hset(i, "target_c", e.target.value)} />
                <input className={IN} value={r.ramp_c_per_min ?? ""} onChange={(e) => hset(i, "ramp_c_per_min", e.target.value)} />
                <input className={IN} value={r.ramp_min ?? ""} onChange={(e) => hset(i, "ramp_min", e.target.value)}
                  placeholder="6℃/분↓" />
                <input className={IN} value={r.soak_min ?? ""} onChange={(e) => hset(i, "soak_min", e.target.value)} />
                <button onClick={() => setHeats((s) => s.filter((_, k) => k !== i))}
                  disabled={heats.length === 1}
                  className="rounded p-1 text-gray-300 hover:text-gray-500 disabled:opacity-30">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button onClick={() => setHeats((s) => [...s, newHeat()])}
              className="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 hover:bg-gray-200">
              <Plus size={12} /> 단계 추가
            </button>
            <label className="ml-auto flex items-center gap-1.5 text-[11px] text-gray-500">
              전체 반복
              <input value={hRepeat} onChange={(e) => setHRepeat(e.target.value)}
                inputMode="numeric"
                className="w-14 rounded border border-gray-200 px-1.5 py-1 text-center text-[11px]" />
              회
            </label>
          </div>
          <p className="mt-2 text-[10px] text-gray-400">
            승온은 속도(6℃/분 단위) 또는 시간(분) 중 하나로 지정합니다. 승온 시간을
            입력하면 속도 대신 그 시간에 맞춰 올립니다(6℃/분보다 느린 승온 가능).
            저장한 레시피는 히터 카드에서 불러와 실행합니다.
          </p>
        </>
      )}

      {picker && (
        <RecipePicker equipment="CHK" kind={picker} onPick={pick} onClose={() => setPicker(null)} />
      )}
    </section>
  );
}
