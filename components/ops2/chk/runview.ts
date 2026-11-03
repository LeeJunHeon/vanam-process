// 챔버K v2 운전 화면 판단(순수 함수, W-10) — 상태 띠·공정 순서·주요 값이 같이 쓴다.
// 남은 시간·예상 끝(정해진 시간만 더하고 도달 대기처럼 끝을 모르는 블록이 남으면 '이상'), 지금 블록 글(이름·목표·진행),
// 이번 공정이 쓰는 장비, 값 막대의 허용 범위(장비 판정과 같은 식 — 설정 desc 의 식만, 모르면 null).
import { paramValue } from "./logic";
import { blockName } from "./text";
import { stateLabel, type Bundle, type RunBlock, type StateData } from "./types";

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** 끝을 모르는 블록(도달·조건 대기) — 펼친 블록 종류. 압력·파워는 wait 가 켜진 것만이지만 목록에는 값이 없어 종류로 */
export const OPEN_TYPES = new Set(["pressure", "power_on", "heater_wait", "heater_settle", "base_wait", "cond_wait"]);
export const DONE_STATUS = new Set(["done", "skipped", "aborted", "error", "failed"]);

export type StateKind = "idle" | "active" | "stopping" | "end" | undefined;
export const kindOf = (b: Bundle | null, st: StateData | null): StateKind =>
  b?.states?.find((s) => s.name === st?.procState)?.kind as StateKind;

/** 장비 run.blocks 의 맨 위 번호("5.2#2" → 4) */
export const topOf = (no: string) => Math.max(0, Number(String(no).split(/[.#]/)[0]) - 1);

/** 남은 시간(정해진 것만)·끝을 모르는 블록 수 — 지금 블록의 remainS + 아직 안 온 블록의 durationS */
export function remainOf(st: StateData | null, blocks: RunBlock[] | null): { sec: number | null; open: number } {
  const cur = num(st?.step?.remainS ?? st?.remainS ?? st?.run?.delay?.remainS);
  if (!blocks?.length) return { sec: cur, open: 0 };
  let sec = cur ?? 0, open = 0;
  for (const b of blocks) {
    if (b.status === "waiting") {
      if (num(b.durationS) !== null) sec += b.durationS as number;
      else if (OPEN_TYPES.has(b.type)) open += 1;
    } else if ((b.status === "running" || b.status === "paused") && cur === null && OPEN_TYPES.has(b.type)) open += 1;
  }
  return { sec, open };
}

/** 지금 블록 이름 — v1 행 템플릿 블록이면 공정 상태 이름('작업 압력(SP1=WP)'), 아니면 묶음 블록 이름 + 이름표 */
export function blockTitle(b: Bundle | null, st: StateData | null, v1Row: boolean): string {
  if (!st) return "";
  if (st.procState === "CSV_DELAY" || st.run?.current === "delay") return "딜레이 행";
  const step = st.step;
  if (v1Row || !step?.type) return stateLabel(b, st.procState);
  const tag = step.label && !/^[\d.#]+$/.test(step.label) ? step.label : "";
  const name = blockName(b, step.type);
  return tag && tag !== name ? `${name} · ${tag}` : name;
}

const fmtN = (v: number | null, unit: string) => (v === null ? "" : `${Number(v.toPrecision(5))} ${unit}`);

/** 지금 블록의 목표(스냅샷 설정값) — 블록 종류별 */
export function blockTarget(type: string | null | undefined, snap: Record<string, unknown> | undefined): string {
  const g = (c: string) => num(snap?.[c]);
  switch (type) {
    case "pressure": return g("mfc.sp_mtorr") !== null ? `목표 ${fmtN(g("mfc.sp_mtorr"), "mTorr")}` : "";
    case "gas_intro": case "gas_prep":
      return [g("mfc.ar_set") ? `Ar ${fmtN(g("mfc.ar_set"), "sccm")}` : "", g("mfc.o2_set") ? `O₂ ${fmtN(g("mfc.o2_set"), "sccm")}` : ""]
        .filter(Boolean).join(" · ");
    case "power_on":
      return [g("dc.set_w") ? `DC ${fmtN(g("dc.set_w"), "W")}` : "", g("rf.set_w") ? `RF ${fmtN(g("rf.set_w"), "W")}` : "",
              g("rfp.set_w") ? `RF Pulse ${fmtN(g("rfp.set_w"), "W")}` : ""].filter(Boolean).join(" · ");
    case "heater_ramp": case "heater_wait": case "heater_settle":
      return g("heater.sv") !== null ? `목표 ${fmtN(g("heater.sv"), "°C")}` : "";
    default: return "";
  }
}

/** 이번 공정이 쓰는 장비 — 장비 state.adjust(scope live·future·done) 우선, 없으면 설정값 > 0 */
export type DevUse = { mfc: boolean; ar: boolean; o2: boolean; dc: boolean; rf: boolean; rfp: boolean; heater: boolean; ig: boolean };
export function usesNow(st: StateData | null, blocks: RunBlock[] | null): DevUse {
  const snap = st?.snapshot ?? {};
  const pos = (c: string) => (num(snap[c]) ?? 0) > 0;
  const adj = Array.isArray(st?.adjust) ? st!.adjust! : null;
  const by = (device: string, item?: string) => !!adj?.some((a) => a.device === device && (!item || a.item === item) && a.scope !== "unused");
  const types = new Set((blocks ?? []).map((b) => b.type));
  const u = adj ? {
    ar: by("mfc", "ar_flow"), o2: by("mfc", "o2_flow"), dc: by("dc"), rf: by("rf"), rfp: by("rfpulse"), heater: by("heater"),
  } : {
    ar: pos("mfc.ar_set"), o2: pos("mfc.o2_set"), dc: pos("dc.set_w"), rf: pos("rf.set_w"), rfp: pos("rfp.set_w"), heater: snap["heater.run"] === true,
  };
  return { ...u, mfc: u.ar || u.o2 || types.has("pressure"), ig: types.has("base_wait") || snap["ig.filament"] === true };
}

/** 값 막대의 허용 범위 — 장비 판정과 같은 식(설정 desc). 모르면 null */
export function bandOf(b: Bundle | null, what: string, target: number | null): [number, number] | null {
  if (target === null || target <= 0) return null;
  const p = (k: string) => num(paramValue(b, k));
  const ratio = (r: number | null) => (r === null ? null : [target * (1 - r), target * (1 + r)] as [number, number]);
  switch (what) {
    case "pressure": return ratio(p("PRESSURE_WAIT_TOL_RATIO"));
    case "ar": case "o2": return ratio(p("FLOW_ERROR_TOLERANCE"));
    case "dc": {   // 판정 폭 = max(DC_TOLERANCE_W, 목표×DC_POWER_ERROR_RATIO)
      const w = p("DC_TOLERANCE_W"), r = p("DC_POWER_ERROR_RATIO");
      if (w === null && r === null) return null;
      const d = Math.max(w ?? 0, target * (r ?? 0));
      return [target - d, target + d];
    }
    case "rf": { const w = p("RF_TOLERANCE_W"); return w === null ? null : [target - w, target + w]; }
    case "rfp": { const pc = p("RFPULSE_FORP_TOLERANCE_PERCENT"); return pc === null ? null : ratio(pc / 100); }
    case "heater": { const t = p("HEATER_SOAK_TOLERANCE"); return t === null ? null : [target - t, target + t]; }
    default: return null;
  }
}

/** 눈금 끝 — 목표의 2배 정도(지금 값이 더 크면 그만큼), 장비 한도가 있으면 그 안 */
export function scaleMax(target: number | null, value: number | null, limit: number | null): number {
  const base = Math.max(target ?? 0, 0) * 2 || Math.max(value ?? 0, 0) * 1.5 || 1;
  const m = Math.max(base, (value ?? 0) * 1.1);
  return limit !== null && limit > 0 ? Math.min(m, limit) : m;
}
