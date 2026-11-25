// 챔버K 화면 용어(W-17, 장비 5-23 용어표) — 이름은 장비 묶음(스냅샷 필드 label·plcButtons·commands·states·eventSources)에서 읽고,
// 묶음에 없는 이름(카드 제목·묶음 이름·상태 낱말)과 묶음이 옛것(묶음 20 이하)일 때 쓸 이름만 이 파일 한 곳에 둔다.
// 화면 파일은 이름 글자를 따로 적지 않고 여기서 가져온다. CH1&2 화면은 이 파일을 쓰지 않는다.

type FieldLike = { column?: string; label?: string; help?: string; desc?: string };
type BundleLike = {
  snapshot?: { blocks?: { name: string; label?: string; desc?: string; fields: FieldLike[] }[]; process?: FieldLike[] };
  plcButtons?: { target: string; addr: string; label: string }[];
  reasons?: { code: string; label: string; help?: string }[];
  eventSources?: { source: string; label: string }[];
  blocks?: { defs?: { type: string; label: string }[] };
} | null | undefined;

/** 카드 제목·묶음 이름(묶음에 없는 이름) */
export const CARD = {
  vacuum: "진공", gas: "가스·압력", shutter: "셔터·인터락", heater: "히터", ig: "Ion Gauge", power: "파워",
  interlock: "인터락", gasValves: "가스 밸브", shutters: "셔터", manual: "수동 조작", door: "Door",
} as const;

/** 상태 낱말 */
export const WORD = {
  on: "켜짐", off: "꺼짐", open: "열림", closed: "닫힘", detect: "감지", none: "없음", ok: "정상", bad: "이상",
  current: "현재", target: "목표", unknown: "모름", notUsed: "사용하지 않음",
} as const;

/** 묶음이 옛것이라 이름이 없거나 옛 이름일 때 쓸 이름(용어표) — 스냅샷 열 → 이름 */
export const FALLBACK: Record<string, string> = {
  "plc.rotary": "Rotary", "plc.turbo": "Turbo", "plc.mv": "MV", "plc.rv": "RV", "plc.fv": "FV", "plc.vent": "Vent",
  "plc.door_up": "Door 올림", "plc.door_down": "Door 내림", "plc.ar_valve": "Ar 밸브", "plc.o2_valve": "O₂ 밸브",
  "plc.ms": "Main 셔터", "plc.s1": "Gun1 셔터", "plc.s2": "Gun2 셔터", "plc.buzz_stop": "부저 정지", "plc.mv_interlock": "MV 인터락",
  "plc.air": "Air", "plc.g1": "G1", "plc.g2": "G2", "plc.atm": "ATM", "plc.water": "Water",
  "plc.ion_remote_on": "Ionizer", "plc.ion_run": "Ionizer 구동", "plc.ion_lamp": "Ionizer 점등", "plc.ion_ot": "Ionizer 수명 초과",
  "heater.itl": "히터 인터락", "heater.run": "운전", "rf.fwd_w": "Forward", "rf.ref_w": "Reflected", "rfp.fwd_w": "Forward",
  "rfp.ref_w": "Reflected", "rfp.itl_open": "RF Pulse 인터락", "mfc.valve_pct": "MFC 밸브 위치", "mfc.sp_active": "사용 중 SP",
  "mfc.sp_sel_mtorr": "압력 목표", "mfc.sp_mtorr": "작업 압력(SP1)", "mfc.ar_set": "Ar 목표", "mfc.o2_set": "O₂ 목표",
  "ig.ion_torr": "Ion Gauge 압력", "ig.a_torr": "Gauge A", "ig.b_torr": "Gauge B", "ig.filament": "Filament", "ig.emission": "Emission",
  "ig.degas": "Degas",
};
/** 옛 묶음의 옛 이름 — 이 글이면 FALLBACK 을 쓴다 */
const OLD_NAME = /인터록|이온 게이지|이오나이저|필라멘트|디개스|방출|냉각수|도어|차단밸브|메인 밸브|Main 밸브|Gun 1|Gun 2|순방향|반사|설정점|실제|설정$/;

/** 묶음 장비 이름(eventSources) — 옛 묶음이면 용어표 이름 */
export const SOURCE_NAME: Record<string, string> = {
  uplink: "웹 연결", heater: "히터", plc: "PLC", mfc: "MFC", dc: "DC Power", rfp: "RF Pulse", rfpulse: "RF Pulse", ig: "Ion Gauge",
  process: "공정", safety: "안전",
};

const fieldsOf = (b: BundleLike) => [...(b?.snapshot?.blocks ?? []).flatMap((x) => x.fields), ...(b?.snapshot?.process ?? [])];

/** 스냅샷 필드 이름 — 묶음 label(옛 이름이면 용어표 이름) */
export function fieldName(b: BundleLike, column: string): string {
  const f = fieldsOf(b).find((x) => x.column === column);
  const l = f?.label ?? "";
  if (l && !OLD_NAME.test(l)) return l;
  return FALLBACK[column] ?? l ?? column;
}

/** PLC 버튼 이름 = 그 주소의 스냅샷 필드 이름 */
export function buttonName(b: BundleLike, target: string): string {
  const btn = b?.plcButtons?.find((x) => x.target === target);
  return fieldName(b, `plc.${btn?.addr ?? target}`);
}

/** 출처(장비) 이름 */
export function sourceName(b: BundleLike, src: string): string {
  const l = b?.eventSources?.find((x) => x.source === src)?.label;
  return l && !OLD_NAME.test(l) && l !== "안전 규칙" ? l : SOURCE_NAME[src] ?? l ?? src;
}

/** 필드 마우스 설명 — 평소 보기는 help(묶음 20 이하는 desc), 상세 보기는 desc + 열 이름 */
export function fieldTip(f: FieldLike | undefined, detail: boolean): string | undefined {
  if (!f) return undefined;
  if (detail) return [f.desc, f.column].filter(Boolean).join(" · ") || undefined;
  return f.help || f.desc || undefined;
}

/** 열 이름으로 필드 마우스 설명 */
export function fieldTipOf(b: BundleLike, column: string, detail: boolean): string | undefined {
  return fieldTip(fieldsOf(b).find((x) => x.column === column), detail);
}

/** 사유 마우스 설명 — help(묶음 21), 상세 보기면 코드를 끝에 */
export function reasonTip(b: BundleLike, code: string | null | undefined, detail = false): string | undefined {
  if (!code) return undefined;
  const h = b?.reasons?.find((r) => r.code === code)?.help;
  return [h, detail ? code : ""].filter(Boolean).join(" · ") || undefined;
}

/** 장비 카드 부제(모델 — 블록 desc)는 상세 보기에서만 */
export function blockSub(b: BundleLike, name: string, detail: boolean): string | undefined {
  return detail ? b?.snapshot?.blocks?.find((x) => x.name === name)?.desc || undefined : undefined;
}

/** 모드 이름(평소 보기에 bench·SIM 같은 영문 모드 이름을 쓰지 않는다) */
export const MODE_NAME = { run: "실제 운전", bench: "읽기 전용", sim: "모의 장비" } as const;

/** 단계 이름(W-18) — 공정 순서 목록·알림·기록 줄·수동 조작 줄·건너뛰기/일시정지 확인창·상태 카드가 모두 이 함수를 쓴다.
 *  이름표가 없으면 종류 이름, 이름표가 종류 이름을 담고 있으면 이름표만("압력 안정화 대기(60초)", "Gun 셔터 열기"),
 *  기본 템플릿 이름표는 화면 이름으로("압력 1단계(SP3)", "Shutter Delay 30초" — LABEL_SHOW), 아니면 "종류 · 이름표". 괄호로 감싸지 않는다. 딜레이 행은 "딜레이 행" */
export function stepName(b: BundleLike, x: { type?: string | null; label?: string | null }): string {
  const type = x.type ?? "";
  if (type === "delay") return "딜레이 행";
  const name0 = b?.blocks?.defs?.find((d) => d.type === type)?.label ?? type;
  const name = OLD_BLOCK_NAME[name0] ?? name0;
  const tag = (x.label ?? "").trim();
  const shown = showLabel(tag);
  if (shown) return shown;
  if (!tag || /^[\d.#]+$/.test(tag) || tag === name) return name;
  if (name && tag.includes(name)) return tag;
  return name ? `${name} · ${tag}` : tag;
}

/** 옛 묶음(21 이하)의 블록 이름 → 지금 이름(W-21) */
const OLD_BLOCK_NAME: Record<string, string> = { "가스 도입": "가스 주입", "메인": "증착", "정상 끝 정지": "공정 끝" };
/** 기본 템플릿이 붙이는 이름표(장비 스텝 문구 — v1 대조라 장비는 그대로) → 화면 이름(W-21). 이 이름은 종류 이름 없이 그대로 쓴다 */
const LABEL_SHOW: [RegExp, string][] = [
  [/^SP([1-5])$/, "압력 설정 SP$1"], [/^Stage0\(SP5\)$/, "압력 설정 SP5"], [/^Stage([12])\(SP(\d)\)$/, "압력 $1단계(SP$2)"],
  [/^Stage3\(SP1=[^)]*\)$/, "작업 압력(SP1)"], [/^Stage0\(SP5\): 압력 안정화 대기\((\d+)초\)$/, "SP5 압력 안정화 $1초"],
  [/^압력 안정화 대기\((\d+)초\)$/, "압력 안정화 $1초"], [/^Shutter Delay (\d+)s$/, "Shutter Delay $1초"],
  [/^DC Power 안정화 대기 (\d+)s$/, "DC Power 안정화 $1초"],
];
export function showLabel(tag: string): string {
  for (const [re, to] of LABEL_SHOW) if (re.test(tag)) return tag.replace(re, to);
  return "";
}

/** 장비 문장을 대체 글로 쓸 때 옛 말 → 용어표 말(W-18) — 장비가 보내는 글은 그대로 두고 보일 때만 바꾼다 */
export const OLD_TO_NEW: [RegExp, string][] = [
  [/이온 게이지/g, "Ion Gauge"], [/이오나이저/g, "Ionizer"], [/필라멘트/g, "Filament"], [/디개스/g, "Degas"], [/방출/g, "Emission"],
  [/냉각수/g, "Water"], [/도어/g, "Door"], [/(Ar|O₂|O2) 차단밸브/g, "$1 밸브"], [/차단밸브/g, "밸브"], [/메인 밸브|Main 밸브/g, "MV"],
  [/인터록/g, "인터락"], [/건 셔터/g, "Gun 셔터"], [/Gun (\d)/g, "Gun$1"], [/순방향/g, "Forward"], [/반사파?/g, "Reflected"],
  [/설정점/g, "SP"], [/끄기 순서/g, "정지 순서"], [/끄기 단계/g, "정지 단계"], [/감시 신호/g, "워치독"], [/스텝/g, "단계"],
  [/블록/g, "단계"], [/가스 도입/g, "가스 주입"], [/정상 끝 정지/g, "공정 끝"], [/셔터 딜레이/g, "Shutter Delay"], [/메인 셔터/g, "Main 셔터"],
  [/램프다운/g, "천천히 내리기"], [/램프업/g, "천천히 올리기"], [/램프/g, "승온"], [/로컬/g, "노트북"],
];
export const toTerms = (t: string) => OLD_TO_NEW.reduce((x, [re, to]) => x.replace(re, to), t);
