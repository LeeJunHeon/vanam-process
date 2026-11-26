// 화면에 보이는 장비 ID(W-23 E1, 사용자 결정 2026-11-26) — 챔버K 는 CHK2 → CHK, CHK2-SIM → CHK-SIM 으로 보인다(표시만).
// 내부 ID·DB·토큰·주소·노트북 설정값은 그대로 CHK2. 그 밖의 장비(챔버12 등)는 바꾸지 않는다. 상세 보기는 원래 ID 를 같이 보여도 된다.
export function showEquipment(id: string | null | undefined): string {
  if (!id) return "";
  return id.replace(/^CHK2(?=$|-)/, "CHK");
}
