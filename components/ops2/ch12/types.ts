// 챔버12(CH1&2) v2 장비 화면 — 묶음·state 중 챔버12 에만 있는 모양(챔버K 모양 components/ops2/chk/types.ts 위에 더한 것).
// 계약: Chamber.Total_program rewrite/v2 의 v2/common/messages.py(envelope·state), v2/ch12/web_schema.py(묶음 — chambers·
// blocks(+version·cfg)·recipe), v2/ch12/hub.py(state.chambers{ch1,ch2,pc,tsp}·engines·heater). 화면은 묶음 정의만 보고 그린다.
// 챔버K 부품(kit·Chk2Cards·Chk2Logs·Chk2Config·Chk2Adjust)은 챔버K Bundle 타입을 받으므로, 같은 객체를 asChk 로 넘긴다
// (공통 필드 — params·commands·reasons·plcButtons·states·snapshot·eventKinds·adjust·paramGroups — 의 뜻은 같다).
import type { BlockDef as Ch12BlockDef, Ch12Defs } from "@/lib/ops2/ch12/blocks";
import type { Bundle, CommandDef, Envelope, StateData } from "../chk/types";

export type ChamberId = "ch1" | "ch2" | "pc" | "tsp";
export const CHAMBERS: readonly ChamberId[] = ["ch1", "ch2", "pc", "tsp"];
export const PROCESS_CHAMBERS: readonly ("ch1" | "ch2")[] = ["ch1", "ch2"];

/** 묶음 chambers[] 한 항목 */
export type ChamberDef = {
  id: ChamberId; label: string; kind: string; channel: number | null; gases: string[]; blocks: string[]; shared: string[];
  heater: boolean; note: string; procPrefix: string; targets: string[];
  supportKeys: Record<string, string[]>; supports: Record<string, boolean> | null;
};

/** 묶음 commands[].args — 챔버K ArgDef 에 enum 을 더해 읽는다 */
export type ArgDef12 = {
  name: string; type?: string; required?: boolean; min?: number | null; max?: number | null;
  paramMin?: string | null; paramMax?: string | null; enum?: unknown[] | null; desc?: string; default?: unknown;
};
export type CommandDef12 = Omit<CommandDef, "args"> & { args?: ArgDef12[]; desc?: string; states?: string[] };

/** 챔버12 묶음 — 챔버K 묶음 필드 + chambers, blocks(챔버12 블록 정의 + version·cfg), recipe(v1 행 열·E230 표) */
export type Ch12Bundle = Omit<Bundle, "blocks" | "recipe" | "commands"> & {
  commands?: CommandDef12[];
  blocks?: Ch12Defs["blocks"] & { version?: number; cfg?: Ch12Defs["cfg"] };
  recipe?: Ch12Defs["recipe"];
  chambers?: ChamberDef[];
  overriddenKeys?: string[];
  /** 확인창 위험 문구(장비 commands.HAZARD_TEXT — 2026-11-20 D425): person(사람)·equipment(장비)·rf_select_dcp(RF 전용 릴레이) */
  plcHazardText?: Partial<Record<"person" | "equipment" | "rf_select_dcp", string>>;
};

/** 묶음 plcButtons[] 한 항목(챔버12 — D425 에 short·procChamber·hazard 더함) */
export type PlcButtonDef12 = {
  target: string; label: string; name?: string; addr?: string; chamber?: string; coil?: number;
  short?: string; procChamber?: "ch1" | "ch2" | null; hazard?: { on?: string | null; off?: string | null };
  desc?: string;                                                                  // 묶음 16 — 래더 이름·코일(상세 보기에서만)
};

/** state.chambers[c] — hub.chamber_state(1초 행 <c>.proc.*) */
export type ChamberState = {
  procState: string | null; runId: string | null; owner: string | null; recipeRev: number | null;
  step: { no: number | null; total: number | null; type: string | null; label: string | null;
          elapsedS: number | null; remainS: number | null } | null;
  remainS: number | null; etaRemainingS: number | null; minTotalS: number | null; paused: boolean | null; alarms: string[];
  stepLabel?: string | null;                                                      // 묶음 16 — 진행 중 동작의 화면 이름(step_labels)
  waitText?: string | null;                                                       // 묶음 20(Z) — 단계 안의 기다림 이름('영점 대기 n s', 챔버K state.run.waitText)
};

/** 엔진 web_state(아직 장비가 보내지 않을 수 있다 — 있으면 쓴다). 공정 엔진 state_dict 와 같은 키를 기대한다 */
export type EngineState = {
  chamber?: string; state?: string; text?: string; running?: boolean; run_id?: string | null; owner?: string | null;
  paused?: boolean; block_no?: number | null; block_count?: number | null; recipe_rev?: number | null;
  queue?: { index?: number; total?: number; mode?: string } | null; error?: string | null;
  adjust?: unknown; last_result?: unknown;
  process_name?: string | null;                                                  // 지금 공정 이름(공정 중일 때만 — D425)
  step_label?: string | null;                                                    // 묶음 16 — 진행 중 동작의 화면 이름(text 는 v1 스텝 문구)
  blocks?: unknown[]; started_upto?: number; startedUpto?: number;                  // 시퀀스 편집용(있으면)
  recipe?: { name?: string; rows?: number; row?: number | null; listActive?: boolean; loaded?: boolean } | null;
  [k: string]: unknown;
};

export type RobotState = {
  connected?: boolean; peer?: string | null; lastCmd?: string | null; lastAt?: string | null; clients?: number;
  serverUp?: boolean; lastError?: string | null; [k: string]: unknown;
};

/** 챔버12 state — 챔버K state 필드 + chambers·engines·heater(엔진 web_state) */
export type Ch12State = Omit<StateData, "heater" | "alarms"> & {
  chambers?: Partial<Record<ChamberId, ChamberState>>;
  engines?: Record<string, EngineState | undefined>;
  heater?: Record<string, unknown>;
  alarms?: { ruleId: string; code?: string; since?: string; chamber?: string }[];
  robot?: RobotState | null;
};

export type Ch12Envelope = Envelope<Ch12State>;
export type { Ch12BlockDef };

/** 챔버K 부품에 넘길 때 — 같은 객체, 타입만 */
export const asChk = (b: Ch12Bundle | null): Bundle | null => b as unknown as Bundle | null;
export const asCh12 = (b: Bundle | null): Ch12Bundle | null => b as unknown as Ch12Bundle | null;

// 조작 주체·공정 상태의 대신 쓰는 이름은 lib/ops2/ch12/terms.ts(OWNER·STATE_FALLBACK) 한 곳에(W-19)
