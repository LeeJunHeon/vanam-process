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
};

/** state.chambers[c] — hub.chamber_state(1초 행 <c>.proc.*) */
export type ChamberState = {
  procState: string | null; runId: string | null; owner: string | null; recipeRev: number | null;
  step: { no: number | null; total: number | null; type: string | null; label: string | null;
          elapsedS: number | null; remainS: number | null } | null;
  remainS: number | null; etaRemainingS: number | null; minTotalS: number | null; paused: boolean | null; alarms: string[];
};

/** 엔진 web_state(아직 장비가 보내지 않을 수 있다 — 있으면 쓴다). 공정 엔진 state_dict 와 같은 키를 기대한다 */
export type EngineState = {
  chamber?: string; state?: string; text?: string; running?: boolean; run_id?: string | null; owner?: string | null;
  paused?: boolean; block_no?: number | null; block_count?: number | null; recipe_rev?: number | null;
  queue?: { index?: number; total?: number; mode?: string } | null; error?: string | null;
  adjust?: unknown; last_result?: unknown;
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

/** 소유자(owner) 이름 — 1초 행 enumLabels 와 같게 */
export const OWNER_LABEL: Record<string, string> = { robot: "로봇", web: "웹", local: "로컬" };

/** 공정 상태 이름 — 묶음 states 가 비었을 때(장비 4단계 전) 대신 쓰는 이름. 장비 process_engine·pc_view·tsp_engine 의 이름 */
export const STATE_FALLBACK: Record<string, { label: string; kind: "idle" | "active" | "stopping" }> = {
  IDLE: { label: "대기", kind: "idle" }, idle: { label: "대기", kind: "idle" },
  PREFLIGHT: { label: "시작 전 점검", kind: "active" }, preflight: { label: "시작 전 점검", kind: "active" },
  RUNNING: { label: "공정 진행", kind: "active" }, run: { label: "진행", kind: "active" },
  COOLDOWN: { label: "행 사이 대기", kind: "active" }, test: { label: "TEST", kind: "active" },
  CLEANUP: { label: "정리 중", kind: "stopping" }, STOPPING: { label: "정지 순서", kind: "stopping" },
  stopping: { label: "정지 중", kind: "stopping" },
};
