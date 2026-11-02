// 챔버K v2 레시피 요약 글(W-10 — 레시피 탭과 운전 탭 '다음 공정'이 같이 쓴다): 공정 행 한 줄·확인창 요약.
import { delaySeconds, pyTruthy, rowHasContent, type RecipeCheck, type Row } from "@/lib/ops2/chk/recipe";
import { blockRowLines } from "./Chk2BlockEditor";

export const isBlockRow = (r: Row) => "blocks" in r;
export const v = (x: unknown) => (x === undefined || x === null || x === "" ? "?" : String(x));

/** 공정 행 한 줄 요약(가스·파워·압력·시간) */
export function rowLine(r: Row): string {
  const gas = [r.ar === true && `Ar ${v(r.ar_flow)} sccm`, r.o2 === true && `O₂ ${v(r.o2_flow)} sccm`].filter(Boolean).join(" + ") || "가스 없음";
  const pw = [r.use_dc === true && `DC ${v(r.dc_power)} W`, r.use_rf === true && `RF ${v(r.rf_power)} W`,
              r.use_rf_pulse === true && `RF Pulse ${v(r.rf_pulse_power)} W`].filter(Boolean).join(" + ") || "파워 없음";
  const time = `공정 ${v(r.process_time)}분${pyTruthy(r.shutter_delay) ? ` · 셔터 딜레이 ${v(r.shutter_delay)}분` : ""}`;
  return `${gas} · ${pw} · 압력 ${v(r.working_pressure)} mTorr · ${time}`;
}
export const heaterLine = (r: Row) => (r.use_heater === true ? `히터 목표 ${v(r.heater_temp)} °C` : "히터 안 씀");

/** 레시피 시작 확인창 요약 — 이름·행 수(v1·블록·딜레이)·첫 공정 행(v1 행은 가스·파워·시간·히터, 블록 행은 블록 수·장비·시간) */
export function processLines(name: string, rows: Row[], check: RecipeCheck | null): string[] {
  const content = rows.filter(rowHasContent);
  const isDelay = (r: Row) => !isBlockRow(r) && delaySeconds(r.process_name) !== null;
  const delays = content.filter(isDelay).length;
  const blocks = content.filter(isBlockRow).length;
  const procs = content.filter((r) => !isDelay(r) && !isBlockRow(r));
  const i = rows.findIndex((r) => rowHasContent(r) && !isDelay(r));
  const heat = procs.filter((r) => r.use_heater === true).length;
  const first = i < 0 ? [] : isBlockRow(rows[i])
    ? blockRowLines(rows[i], check?.rows[i] ?? null).map((l, k) => (k ? l : `첫 공정 행(${i + 1}행): ${l}`))
    : [`첫 공정 행(${i + 1}행): ${rowLine(rows[i])}`, `첫 공정 행 ${heaterLine(rows[i])}${heat ? ` · 히터 쓰는 행 ${heat}개` : ""}`];
  return [`레시피 '${name}' · ${content.length}행(일반 행 ${procs.length} · 블록 행 ${blocks} · 딜레이 행 ${delays})`, ...first];
}

export function heaterLines(name: string, steps: Row[], gas: Row | null): string[] {
  const g = gas && (gas.use_ar === true || gas.use_o2 === true)
    ? `가스 ${[gas.use_ar === true && `Ar ${v(gas.ar_flow)} sccm`, gas.use_o2 === true && `O₂ ${v(gas.o2_flow)} sccm`]
        .filter(Boolean).join(" + ")} · 압력 ${v(gas.wp_mtorr)} mTorr`
    : "가스 없이";
  return [`히터 레시피 '${name}' · 스텝 ${steps.length}개`, `히터 목표 ${steps.map((s) => `${v(s.target_c)}°C`).join(" → ")}`, g];
}

