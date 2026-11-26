"use client";

// 챔버K v2 장비 화면이 어디서 도는지(W-7) — web(웹 화면) / local(노트북 로컬 화면, 챔버K v2 hmi).
// local 은 hello.commandKinds(HMI 경로에서 받는 명령 — 정지 쪽·공정 중 수정)만 보낸다. 그 밖 조작 버튼은 숨기고 "웹에서만".
// detail(W-9) — '상세' 토글: 켜면 원시 코드·키·run id·장비 스텝 문구 등 개발용 정보까지, 끄면(기본) 한글 이름·요약만.
// 보는 사람 브라우저에 기억(localStorage — 막혀 있어도 동작).
import { createContext, useCallback, useContext, useState } from "react";

export type ModeInfo = { local: boolean; hmiKinds: readonly string[]; detail: boolean;
  lockPrefix?: string;
  chkWords?: boolean;
  chkColors?: boolean;
  lineIcons?: boolean };     // W-23 챔버K — 띠(Issue) 아이콘을 첫 글자 줄 가운데에(같이 쓰는 kit). CH1&2 는 넘기지 않아 그대로     // W-21 챔버K — 확인창 실행 버튼 빨강은 정지·끄기·끝내기만(같이 쓰는 kit). CH1&2 는 넘기지 않아 그대로      // W-21 챔버K — 출처 LOCAL·WEB, 사람 이름은 이메일 @ 앞(같이 쓰는 기록 부품). CH1&2 는 넘기지 않아 그대로      // W-19 CH1&2 — 잠긴 버튼 마우스 설명 앞말(없으면 kit 기본 '잠김 — ' — 챔버K 그대로)

export const Chk2ModeContext = createContext<ModeInfo>({ local: false, hmiKinds: [], detail: false });

export function useChk2Mode(): ModeInfo & { webOnly: (kind: string) => boolean } {
  const m = useContext(Chk2ModeContext);
  return { ...m, webOnly: (kind) => m.local && !m.hmiKinds.includes(kind) };
}

/** '상세' 보기 상태 — 처음 값은 브라우저에 기억한 것 */
const DETAIL_KEY = "vanam-process:chk2-detail";
export function useDetailPref(): [boolean, (v: boolean) => void] {
  const [detail, setDetail] = useState(() => {
    try { return typeof window !== "undefined" && window.localStorage.getItem(DETAIL_KEY) === "1"; } catch { return false; }
  });
  const set = useCallback((v: boolean) => {
    setDetail(v);
    try { window.localStorage.setItem(DETAIL_KEY, v ? "1" : "0"); } catch { /* 저장 실패는 무시 */ }
  }, []);
  return [detail, set];
}
