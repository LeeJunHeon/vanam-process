"use client";

// 챔버K v2 장비 화면이 어디서 도는지(W-7) — web(웹 화면) / local(노트북 로컬 화면, 챔버K v2 hmi).
// local 은 hello.commandKinds(HMI 경로에서 받는 명령 — 정지 쪽·공정 중 수정)만 보낸다. 그 밖 조작 버튼은 숨기고 "웹에서만".
import { createContext, useContext } from "react";

export type ModeInfo = { local: boolean; hmiKinds: readonly string[] };

export const Chk2ModeContext = createContext<ModeInfo>({ local: false, hmiKinds: [] });

export function useChk2Mode(): ModeInfo & { webOnly: (kind: string) => boolean } {
  const m = useContext(Chk2ModeContext);
  return { ...m, webOnly: (kind) => m.local && !m.hmiKinds.includes(kind) };
}
