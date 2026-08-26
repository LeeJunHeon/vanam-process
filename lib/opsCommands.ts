// 원격 제어 명령 정의. 서버 검증과 UI 렌더링이 이 목록을 공유한다.
// danger: 물리적 위험이 큰 조작(도어·벤트·비상정지) — 확인창에서 강조 표시.

export type CmdDef = {
  key: string;
  label: string;
  group: "공정" | "가스" | "펌프·밸브" | "셔터" | "도어" | "히터" | "기타";
  toggle?: boolean;      // on/off 상태를 갖는 조작
  stateKey?: string;     // payload.valves 에서 현재 상태를 읽을 키
  danger?: boolean;
  needsValue?: "number"; // 값 입력이 필요한 명령(히터 목표온도)
};

export const CHK_COMMANDS: CmdDef[] = [
  { key: "PROCESS_START", label: "공정 시작", group: "공정", danger: true },
  { key: "PROCESS_STOP", label: "공정 정지", group: "공정" },
  { key: "ALL_STOP", label: "비상 정지(ALL STOP)", group: "공정", danger: true },

  { key: "Ar_Button", label: "Ar 밸브", group: "가스", toggle: true, stateKey: "Ar" },
  { key: "O2_Button", label: "O₂ 밸브", group: "가스", toggle: true, stateKey: "O2" },

  { key: "Rotary_button", label: "Rotary 펌프", group: "펌프·밸브", toggle: true, stateKey: "Rotary" },
  { key: "Turbo_button", label: "Turbo 펌프", group: "펌프·밸브", toggle: true, stateKey: "Turbo" },
  { key: "RV_button", label: "R.V.", group: "펌프·밸브", toggle: true, stateKey: "RV" },
  { key: "FV_button", label: "F.V.", group: "펌프·밸브", toggle: true, stateKey: "FV" },
  { key: "MV_button", label: "M.V.", group: "펌프·밸브", toggle: true, stateKey: "MV" },
  { key: "Vent_button", label: "Vent", group: "펌프·밸브", toggle: true, stateKey: "Vent", danger: true },

  { key: "MS_button", label: "메인 셔터", group: "셔터", toggle: true, stateKey: "MS" },
  { key: "S1_button", label: "S1 셔터", group: "셔터", toggle: true, stateKey: "S1" },
  { key: "S2_button", label: "S2 셔터", group: "셔터", toggle: true, stateKey: "S2" },

  { key: "Doorup_button", label: "도어 상승", group: "도어", toggle: true, stateKey: "Doorup", danger: true },
  { key: "Doordn_button", label: "도어 하강", group: "도어", toggle: true, stateKey: "Doordn", danger: true },

  { key: "HEATER_SV", label: "히터 목표온도 설정", group: "히터", needsValue: "number" },
  { key: "HEATER_ONOFF", label: "히터 운전", group: "히터", toggle: true },

  { key: "BuzzStop_Button", label: "부저 정지", group: "기타", toggle: true, stateKey: "BuzzStop" },
];

export const COMMAND_MAP: Record<string, CmdDef[]> = { CHK: CHK_COMMANDS };

export const CMD_TTL_SEC = 30; // 명령 유효기간
