// 챔버12 상태 낱말·라벨 도우미(W-20 — 장비 카드 BlockCard 는 챔버K DevCard 틀 박스(Ch12Devices)로 바뀌어 없앰).
import type { StateWords } from "../chk/StateTag";

/** 켜짐·꺼짐 / 열림·닫힘 / 감지·없음 — 필드 이름으로(밸브·셔터 = 열림/닫힘, 센서 = 감지/없음, 나머지 켜짐/꺼짐) */
export const words12 = (name: string): StateWords =>
  /valve|shutter|_gas_sw$|^(m|r|f)_v_|vent/.test(name) ? "open" : /sensor|water_ok|atm|_detect/.test(name) ? "detect" : "onoff";
/** 켜지면 이상인 상태(인터락 열림·이상·과온·센서 이상·워치독 이상) — 켜짐 배지를 주의색으로 */
export const alert12 = (name: string) => /itl_open|fault|^ot$|_err$|_alarm$/.test(name);

/** 라벨 끝의 PLC 레지스터·코일 주소 '(D119)'·'(D148/D149)'·'(D128×6)'·'(M00401)' — 개발용, '상세'에서만 */
export const plainLabel = (label: string) => label.replace(/\s*\((?:[DM]\d+)[^)]*\)/g, "").trim() || label;
