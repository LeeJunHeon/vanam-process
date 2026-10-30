// 챔버12(CH1&2) 장비 ID — 운영 CH12, 시뮬레이터 CH12-SIM(장비 v2/ch12/uplink.py). 순수(DB 없음) — 화면·스크립트도 쓴다.
export const CH12_BASE = "CH12";

/** 챔버12 장비인가(CH12·CH12-SIM) */
export function isCh12(equipment: string | null | undefined): boolean {
  const e = String(equipment ?? "");
  return e === CH12_BASE || e === `${CH12_BASE}-SIM`;
}

/** 챔버12 공정 맥락(장비 hub.CONTEXTS) — run_*·event context.chamber·state.chambers 의 키 */
export const CH12_CHAMBERS = ["ch1", "ch2", "pc", "tsp"] as const;
export type Ch12Chamber = (typeof CH12_CHAMBERS)[number];
export const isCh12Chamber = (v: unknown): v is Ch12Chamber => typeof v === "string" && (CH12_CHAMBERS as readonly string[]).includes(v);

/** 레시피 저장 kind — 챔버별 블록 레시피(ch1·ch2). 행은 v1 행 또는 블록 행({name?, blocks}) */
export const CH12_RECIPE_KINDS = ["ch1", "ch2"] as const;
export type Ch12RecipeKind = (typeof CH12_RECIPE_KINDS)[number];
