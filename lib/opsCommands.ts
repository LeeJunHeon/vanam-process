// 원격 제어 명령 정의. 서버 검증과 UI 렌더링이 이 목록을 공유한다.
// danger: 물리적 위험이 큰 조작(도어·벤트·비상정지) — 확인창에서 강조 표시.

export type CmdDef = {
  key: string;
  label: string;
  stateKey?: string;   // payload.valves 의 현재 상태 키
  danger?: boolean;
};

// 계통도에서 클릭 가능한 조작 (PLC 코일 및 도어)
export const CHK_NODE_COMMANDS: Record<string, CmdDef> = {
  Ar_Button:      { key: "Ar_Button", label: "Ar 밸브", stateKey: "Ar" },
  O2_Button:      { key: "O2_Button", label: "O₂ 밸브", stateKey: "O2" },
  Rotary_button:  { key: "Rotary_button", label: "Rotary 펌프", stateKey: "Rotary" },
  Turbo_button:   { key: "Turbo_button", label: "Turbo 펌프", stateKey: "Turbo" },
  RV_button:      { key: "RV_button", label: "R.V.", stateKey: "RV" },
  FV_button:      { key: "FV_button", label: "F.V.", stateKey: "FV" },
  MV_button:      { key: "MV_button", label: "M.V.", stateKey: "MV" },
  Vent_button:    { key: "Vent_button", label: "Vent", stateKey: "Vent", danger: true },
  MS_button:      { key: "MS_button", label: "메인 셔터", stateKey: "MS" },
  S1_button:      { key: "S1_button", label: "S1 셔터", stateKey: "S1" },
  S2_button:      { key: "S2_button", label: "S2 셔터", stateKey: "S2" },
  Door_Button:    { key: "Door_Button", label: "도어", stateKey: "Door", danger: true },
  ION_button:     { key: "ION_button", label: "이오나이저", stateKey: "ION" },
  BuzzStop_Button:{ key: "BuzzStop_Button", label: "부저 정지", stateKey: "BuzzStop" },
};

// 공정·히터 등 상태 토글이 아닌 명령
export const CHK_ACTION_COMMANDS: Record<string, CmdDef> = {
  PROCESS_START: { key: "PROCESS_START", label: "공정 시작", danger: true },
  PROCESS_STOP:  { key: "PROCESS_STOP", label: "공정 정지" },
  ALL_STOP:      { key: "ALL_STOP", label: "비상 정지(ALL STOP)", danger: true },
  HEATER_SV:     { key: "HEATER_SV", label: "히터 목표온도 설정" },
  HEATER_ONOFF:  { key: "HEATER_ONOFF", label: "히터 운전" },
  RECIPE_PROCESS_RUN: { key: "RECIPE_PROCESS_RUN", label: "레시피 적재" },
  RECIPE_PROCESS_START: { key: "RECIPE_PROCESS_START", label: "레시피 공정 시작", danger: true },
  RECIPE_HEATER_RUN:  { key: "RECIPE_HEATER_RUN", label: "히터 레시피 실행" },
  RECIPE_HEATER_STOP: { key: "RECIPE_HEATER_STOP", label: "히터 레시피 중단" },
  HEATER_RECIPE_HOLD: { key: "HEATER_RECIPE_HOLD", label: "히터 레시피 일시정지" },
  HEATER_RECIPE_STEP: { key: "HEATER_RECIPE_STEP", label: "히터 레시피 스텝 건너뛰기" },
};

export const CHK_COMMANDS: CmdDef[] = [
  ...Object.values(CHK_NODE_COMMANDS),
  ...Object.values(CHK_ACTION_COMMANDS),
];

export const COMMAND_MAP: Record<string, CmdDef[]> = { CHK: CHK_COMMANDS };

export const CMD_TTL_SEC = 30; // 명령 유효기간
