// 화면에 보이는 장비 ID(W-23 E1, 사용자 결정 2026-11-26) — 챔버K 는 CHK2 → CHK, CHK2-SIM → CHK-SIM 으로 보인다(표시만).
// 내부 ID·DB·토큰·주소·노트북 설정값은 그대로 CHK2. 그 밖의 장비(챔버12 등)는 바꾸지 않는다. 상세 보기는 원래 ID 를 같이 보여도 된다.
export function showEquipment(id: string | null | undefined): string {
  if (!id) return "";
  return id.replace(/^CHK2(?=$|-)/, "CHK");
}

// ───────────── 챔버K 장비 고르기(W-24 A) ─────────────
/** 챔버K 기준 장비 ID — 이 ID 와 그 시뮬레이터(-SIM)만 CHK Sputter 페이지에서 고른다 */
export const CHK_BASE_ID = "CHK2";

/** 챔버K 장비인가 — 기준 ID 가 CHK2 인 것(CHK2·CHK2-SIM). 챔버12(CH12) 등은 아니다 */
export function isChkEquipment(id: string | null | undefined): boolean {
  if (!id) return false;
  return (id.endsWith("-SIM") ? id.slice(0, -4) : id) === CHK_BASE_ID;
}

/** CHK Sputter 페이지 장비 목록·처음 고를 장비 — 켜진 장비(/api/ops2/devices) 중 챔버K 만, 저장된 선택이 그 안에 없으면 CHK2
 *  (CHK2 도 꺼져 있으면 목록의 첫 장비). showPicker = 고를 장비가 둘 이상일 때만 고르기 상자 */
export function chkDeviceChoice<T extends { equipment: string }>(all: T[], saved: string | null | undefined) {
  const list = all.filter((d) => isChkEquipment(d.equipment));
  const has = (e: string | null | undefined) => !!e && list.some((d) => d.equipment === e);
  const picked = has(saved) ? (saved as string) : has(CHK_BASE_ID) ? CHK_BASE_ID : list[0]?.equipment ?? null;
  return { list, picked, showPicker: list.length > 1 };
}
