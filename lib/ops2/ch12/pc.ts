// 챔버12 플라즈마 클리닝 레시피(2026-11-18 — 웹 저장 kind "pc") — v1 PC CSV 첫 데이터 행과 같은 열(장비 v2/ch12/pc_recipe.py UI_KEYS + use_ch).
// 장비는 행을 그대로 받아(PC_START·PC_RECIPE_LOAD rows) 화면 값으로 쓴다(빈 칸·숫자 아님은 장비 규칙 — v1 그대로). 웹은 저장 전·보내기 전에
// 이름·형식·범위를 본다 — 범위는 장비 묶음 파라미터 PC_DEFAULT_*(설정 화면과 같은 값, D11). 순수(DB·React 없음) — 저장 검사·화면이 같이 쓴다.
type Obj = Record<string, unknown>;

export type PcField = { key: string; label: string; unit: string; param: string | null; kind: "ch" | "text" | "num" };
/** 열 순서 = v1 PC 화면 칸 순서(process_name·base_pressure·gas_flow·working_pressure·rf_power·process_time) + 채널(use_ch) */
export const PC_FIELDS: readonly PcField[] = [
  { key: "use_ch", label: "채널", unit: "", param: null, kind: "ch" },
  { key: "process_name", label: "공정 이름", unit: "", param: null, kind: "text" },
  { key: "base_pressure", label: "베이스 압력", unit: "Torr", param: "PC_DEFAULT_TARGET_PRESSURE_TORR", kind: "num" },
  { key: "gas_flow", label: "가스 유량", unit: "sccm", param: "PC_DEFAULT_GAS_FLOW_SCCM", kind: "num" },
  { key: "working_pressure", label: "작업 압력", unit: "mTorr", param: "PC_DEFAULT_SP4_SETPOINT_MTORR", kind: "num" },
  { key: "rf_power", label: "RF 파워", unit: "W", param: "PC_DEFAULT_RF_POWER_W", kind: "num" },
  { key: "process_time", label: "공정 시간", unit: "min", param: "PC_DEFAULT_PROCESS_TIME_MIN", kind: "num" },
];

/** 묶음 파라미터 min·max(없으면 null) — 화면·저장 검사가 같은 범위 */
export function pcRanges(bundle: unknown): Record<string, { min: number | null; max: number | null }> {
  const params = bundle && typeof bundle === "object" && Array.isArray((bundle as Obj).params) ? (bundle as { params: Obj[] }).params : [];
  const out: Record<string, { min: number | null; max: number | null }> = {};
  for (const f of PC_FIELDS) {
    const p = f.param ? params.find((x) => x.key === f.param) : undefined;
    out[f.key] = { min: typeof p?.min === "number" ? p.min : null, max: typeof p?.max === "number" ? p.max : null };
  }
  // RF Power 위 한도 = Plasma Cleaning RF 운전 상한(장비 R·D432 — PC_RF_OPERATING_MAX_W, RF_MAX_POWER 보다 크지 않게). 장비도 넘으면 시작 거부
  const val = (k: string) => {
    const p = params.find((x) => x.key === k);
    const v = typeof p?.current === "number" ? p.current : p?.default;
    return typeof v === "number" ? v : null;
  };
  const op = val("PC_RF_OPERATING_MAX_W"), rated = val("RF_MAX_POWER");
  if (op !== null && out.rf_power) out.rf_power = { ...out.rf_power, max: rated !== null ? Math.min(op, rated) : op };
  return out;
}

/** 행 하나 검사 — 오류 문구 목록(빈 목록 = 통과). 숫자 칸은 모두 넣어야 한다(빈 칸이면 장비가 0 으로 쓰므로) */
export function checkPcRow(row: unknown, ranges: Record<string, { min: number | null; max: number | null }>): string[] {
  if (!row || typeof row !== "object" || Array.isArray(row)) return ["행 형식이 아님"];
  const r = row as Obj, errs: string[] = [];
  for (const f of PC_FIELDS) {
    const raw = String(r[f.key] ?? "").trim();
    if (f.kind === "ch") { if (raw !== "1" && raw !== "2") errs.push(`${f.label}: CH1 또는 CH2`); continue; }
    if (f.kind === "text") continue;
    if (!raw) { errs.push(`${f.label}: 값을 넣으세요`); continue; }
    const v = Number(raw);
    if (!Number.isFinite(v)) { errs.push(`${f.label}: 숫자가 아닙니다`); continue; }
    const g = ranges[f.key];
    if ((g?.min !== null && g?.min !== undefined && v < g.min) || (g?.max !== null && g?.max !== undefined && v > g.max)) {
      errs.push(`${f.label}: ${g?.min ?? ""}~${g?.max ?? ""} ${f.unit} 밖입니다`);
    }
  }
  return errs;
}

/** 레시피 전체 검사 — PC 레시피는 행 하나(v1 은 첫 비어 있지 않은 행만 썼다) */
export function checkPcRecipe(rows: unknown, bundle: unknown): { errors: number; warnings: number; first: string | null } {
  const list = Array.isArray(rows) ? rows : [];
  const errs = list.length !== 1 ? ["PC 레시피는 행 하나"] : checkPcRow(list[0], pcRanges(bundle));
  return { errors: errs.length, warnings: 0, first: errs[0] ?? null };
}

/** 한 줄 요약 — 'CH1 · PC-1 · 베이스 5e-6 Torr · 가스 20 sccm · 작업 2 mTorr · RF 100 W · 1 min' */
export function pcRowLine(row: Obj): string {
  const v = (k: string) => String(row[k] ?? "").trim() || "—";
  return [`CH${v("use_ch")}`, v("process_name"), `베이스 ${v("base_pressure")} Torr`, `가스 ${v("gas_flow")} sccm`,
    `작업 ${v("working_pressure")} mTorr`, `RF ${v("rf_power")} W`, `${v("process_time")} min`].join(" · ");
}
