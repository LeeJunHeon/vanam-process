// 챔버K 컨트롤러 값(MFC GPC3000) 코드 → 화면 말(W-23 G1). 원래 코드(J1·N0·M006·H3 1.00·범위 코드)는 상세 보기에서만.
// 장비 v2/chk/dev_params.py 의 VALVE_TYPE·DIRECTION·status_text 와 같은 표 — 묶음 22·23 장비(값만 보냄)도 이 표로 말을 만든다.
export const VALVE_TYPE: Record<number, string> = { 1: "Standard 253", 2: "Fast 253", 3: "653", 4: "Custom" };
export const DIRECTION: Record<number, string> = { 0: "Direct", 1: "Reverse" };

/** 시스템 상태 MXYZ — X 0 Local·1 Remote, Z 밸브 0 열림·1 닫힘·2 정지·3 이상 SP(Z−2). 형식이 다르면 null. */
export function statusText(raw: string | null | undefined): string | null {
  const m = /^M?(\d)(\d)(\d)$/.exec((raw ?? "").trim());
  if (!m) return null;
  const x = Number(m[1]), z = Number(m[3]);
  const where = x === 0 ? "Local" : x === 1 ? "Remote" : null;
  const valve = z === 0 ? "밸브 열림" : z === 1 ? "밸브 닫힘" : z === 2 ? "밸브 정지" : `SP${z - 2} 제어`;
  return where ? `${where} · ${valve}` : valve;
}

/** 소프트웨어 버전 — 숫자만('H3 1.00' → '1.00', 'H1.00' → '1.00'). 숫자가 없으면 null. */
export function versionText(raw: string | null | undefined): string | null {
  const all = (raw ?? "").match(/\d+(?:\.\d+)+|\d+/g);
  if (!all) return null;
  return all.find((x) => x.includes(".")) ?? all[all.length - 1];
}
