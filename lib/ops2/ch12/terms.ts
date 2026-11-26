// 챔버12 화면 용어(W-19, 장비 묶음 16 — 챔버K W-17 용어표와 같은 말).
// 이름은 장비 묶음(스냅샷 필드 label·plcButtons·commands·states·eventSources·chambers)에서 읽고, 묶음에 없는 이름(카드 제목·Loadlock·
// 묶음 이름)과 묶음이 옛것(15 이하)일 때 쓸 이름만 이 파일 한 곳에 둔다. 화면 파일은 이름 글자를 따로 적지 않고 여기서 가져온다.
// 상태 낱말(켜짐·꺼짐·열림·닫힘)·모드 이름·마우스 설명 함수(label·help·desc 3단)는 챔버K terms 것을 그대로 쓴다.
import { OLD_TO_NEW } from "@/lib/ops2/chk/terms";

export { WORD, MODE_NAME, reasonTip, stepName } from "@/lib/ops2/chk/terms";

type FieldLike = { column?: string; label?: string; help?: string; desc?: string; enumLabels?: Record<string, string> | null };
type BlockLike = { name: string; label?: string; desc?: string; fields: FieldLike[] };
type BundleLike = {
  snapshot?: { blocks?: BlockLike[]; process?: FieldLike[] };
  plcButtons?: { target: string; label?: string | null; short?: string | null }[];
  commands?: { kind: string; label?: string }[];
  states?: { name: string; label: string; kind: string }[];
  eventSources?: { source: string; label: string }[];
  chambers?: { id: string; label: string }[];
} | null | undefined;

/** 장소 이름(묶음 chambers 에 없는 Loadlock·공통 포함) — 묶음이 옛것이면 이 이름 */
export const PLACE: Record<string, string> = {
  ch1: "CH1", ch2: "CH2", pc: "Plasma Cleaning", tsp: "TSP", loadlock: "Loadlock", shared: "공통",
};

/** 카드 제목(묶음에 없는 이름) */
export const CARD = {
  map: "계통도", otherButtons: "그 밖의 PLC 버튼", seq: "공정 순서", keyValues: "주요 값", targets: "공정 목표",
  log: "알림·로그", feed: "로그", trend: "추세", heater: "히터", thickness: "두께", presputter: "프리스퍼터 예약", robot: "로봇 연결",
  common: "장비 공통 조작", timing: "장비 응답 시간", localFiles: "노트북 레시피 파일", gasStep: "가스 단계", history: "공정 기록",
  // 장비 박스(W-20 — 챔버K CARD 와 같은 말)
  vacuum: "진공", shutter: "셔터·인터락", gas: "가스·압력", next: "다음 공정", alerts: "알림",
} as const;

/** 조작 주체 이름 — 묶음 <c>.proc.owner enumLabels 와 같게(옛 묶음이면 이 이름) */
export const OWNER: Record<string, string> = { robot: "로봇", web: "웹", local: "노트북" };

/** 공정 상태 이름 — 묶음 states 가 비었을 때(장비 4단계 전) 대신 쓰는 이름(묶음 16 states 와 같은 말) */
export const STATE_FALLBACK: Record<string, { label: string; kind: "idle" | "active" | "stopping" }> = {
  IDLE: { label: "대기", kind: "idle" }, idle: { label: "대기", kind: "idle" },
  PREFLIGHT: { label: "시작 전 점검", kind: "active" }, preflight: { label: "시작 전 점검", kind: "active" },
  RUNNING: { label: "공정 중", kind: "active" }, run: { label: "진행 중", kind: "active" },
  COOLDOWN: { label: "공정 사이 대기", kind: "active" }, test: { label: "TEST 모드", kind: "active" },
  CLEANUP: { label: "끝 정리", kind: "stopping" }, STOPPING: { label: "정지 순서 중", kind: "stopping" },
  stopping: { label: "정지 중", kind: "stopping" },
};

/** 조사 — 낱말 뒤에 이것만 붙으면(벤트를·게이트가·로드락에서는) 바꾼다. 그 밖의 한글이 이어지면(게이트웨이) 다른 낱말이라 바꾸지 않는다 */
const JOSA = ["에서", "에게", "으로", "까지", "부터", "보다", "처럼", "마다", "이나", "이랑", "하고", "이다", "입니다", "이며", "이고", "이면", "이라",
  "은", "는", "이", "가", "을", "를", "의", "에", "께", "로", "와", "과", "도", "만", "나", "랑", "인", "라"].join("|");
/** 낱말 단위 규칙 — 앞에 한글이 붙어 있으면(이벤트) 바꾸지 않고, 뒤에는 조사만 붙거나 한글이 아닌 글자일 때만 바꾼다(W-19b) */
const word = (src: string) => new RegExp(`(?<![가-힣])(?:${src})(?=(?:${JOSA})*(?![가-힣]))`, "g");

/** 챔버K toTerms 보다 먼저 — RF 파워를 올리고 내리는 '램프'는 승온이 아니라 천천히 올리기·내리기.
 *  챔버12 v1 공정 문구 '메인 밸브'는 진공 MV 가 아니라 가스 Main 밸브(MAIN_n_GAS_SW — PLC 이름 'Main 가스')라 'MV' 로 바꾸지 않는다(W-21·22 E) */
const PRE12: [RegExp, string][] = [[/RF (연속 )?정지 램프/, "RF $1정지 천천히 내리기"], [/RF 램프/, "RF 천천히 올리기"],
  [/메인 밸브|Main 밸브/, "Main 가스"]];
/** 옛 묶음(15 이하)·옛 기록의 옛 말 → 용어표 말(챔버12 말) */
const OLD_TO_NEW12: [RegExp, string][] = [
  [/플라즈마 클리닝/, "Plasma Cleaning"], [/로드락/, "Loadlock"], [/로터리( 펌프)?/, "Rotary"], [/터보( 펌프)?/, "Turbo"],
  [/러핑 밸브/, "RV"], [/러핑/, "RV"], [/포어라인 밸브/, "FV"], [/포어라인/, "FV"], [/게이트 ?밸브/, "Gate"], [/게이트/, "Gate"],
  [/벤트/, "Vent"], [/4핀/, "4Pin"], [/척 모터/, "Chuck"], [/메인 셔터/, "Main 셔터"], [/Gun 셔터 G(\d)/, "Gun$1 셔터"],
  [/시퀀스 편집/, "공정 순서 편집"], [/시퀀스/, "공정 순서"], [/사건/, "기록"],
];
/** 챔버12 낱말 바꾸기 규칙(차례대로) — RF 램프 · 챔버K OLD_TO_NEW 를 낱말 단위로 감싼 것(챔버K toTerms 는 그대로) · 챔버12 말.
 *  ops2:ch12-ui 가 이 목록으로 바뀐 자리를 하나씩 따라가 본다(한글이 줄어든 곳은 이 규칙뿐인지) */
export const TERM_RULES12: [RegExp, string][] = [
  ...[...PRE12, ...OLD_TO_NEW, ...OLD_TO_NEW12].map(([re, to]): [RegExp, string] => [word(re.source), to]),
];
/** 옛 묶음·장비 문장의 옛 말 → 용어표 말(낱말 단위). 장비가 보내는 글은 그대로 두고 보일 때만 바꾼다 */
export const toTerms12 = (t: string) => TERM_RULES12.reduce((x, [re, to]) => x.replace(re, to), t);

// ───────────── 설정 탭(W-19) ─────────────
// 설정 이름·설명은 평소 보기·상세 보기 모두 용어표 낱말 바꾸기(toTerms12)만 한다 — 장비 글의 문장·숫자·주소는 그대로 보인다.
// (설명에 남는 코드·주소·v1 은 장비 쪽 설정 help 작업에서 고친다)
/** 설정 값의 평소 보기 글 — 코드 모양 값(SP3_ON)만 읽는 말로('SP3 켜기'), 나머지는 null(원래 표시). 입력 칸은 원래 값 그대로 */
export function settingValue12(_key: string, v: unknown): string | null {
  const m = typeof v === "string" ? /^SP(\d)_ON$/.exec(v) : null;
  return m ? `SP${m[1]} 켜기` : null;
}

/** 이름 끝의 PLC 주소·코일 이름 괄호 '(D119)'·'(M00401)'·'(L_VAC_READY_SW)' — 상세 보기에서만 */
const ADDR_PAREN = /\s*\((?:[DM]\d+[^)]*|[A-Za-z][A-Za-z0-9]*_[A-Za-z0-9_]+)\)/g;
const tidy = (t: string) => toTerms12(t.replace(ADDR_PAREN, "")).replace(/\s{2,}/g, " ").trim();

/** 카드 제목과 같은 앞말을 뺀 이름 — CH1 카드의 'CH1 MV' → 'MV', Loadlock 칸의 'Loadlock 4Pin 올림' → '4Pin 올림' */
export function dropPrefix(name: string, title: string | null | undefined): string {
  if (!title || !name.startsWith(`${title} `)) return name;
  return name.slice(title.length + 1).trim() || name;
}

/** 장소 이름 — 챔버는 묶음 chambers label, Loadlock·공통은 이 파일 */
export function placeName(b: BundleLike, id: string): string {
  const l = b?.chambers?.find((c) => c.id === id)?.label;
  return l ? tidy(l) : PLACE[id] ?? id.toUpperCase();
}

const fieldsOf = (b: BundleLike) => [...(b?.snapshot?.blocks ?? []).flatMap((x) => x.fields), ...(b?.snapshot?.process ?? [])];
export const fieldOf = (b: BundleLike, column: string): FieldLike | undefined => fieldsOf(b).find((x) => x.column === column);

/** 스냅샷 필드 이름 — 묶음 label(주소 괄호는 빼고, 옛 말이면 용어표 말). title 을 주면 그 앞말을 뺀다.
 *  묶음에 그 필드가 없으면(옛 묶음) FIELD_FALLBACK, 그것도 없으면 열 이름 */
export function fieldName(b: BundleLike, column: string, title?: string | null): string {
  const l = fieldOf(b, column)?.label;
  return dropPrefix(l ? tidy(l) : FIELD_FALLBACK[column.replace(/^(ch\d|pc|tsp)\./, "")] ?? column, title);
}
/** 옛 묶음(15 이하)에 없는 필드의 이름 — 챔버 앞말을 뺀 열 이름 → 이름 */
const FIELD_FALLBACK: Record<string, string> = { "proc.step_label": "진행 중 동작" };

/** 장비 블록 이름(묶음 snapshot.blocks label — 'CH1 DC Pulse'). title 을 주면 그 앞말을 뺀다 */
export function blockName(b: BundleLike, name: string, title?: string | null): string {
  const l = b?.snapshot?.blocks?.find((x) => x.name === name)?.label;
  return dropPrefix(l ? tidy(l) : name, title);
}

/** PLC 버튼 이름 — 묶음 label(묶음 16: 'CH1 MV'·'Loadlock 4Pin 올림'·'Gun1 셔터'). title 을 주면 그 앞말을 뺀다 */
export function buttonName(b: BundleLike, target: string, title?: string | null): string {
  const btn = b?.plcButtons?.find((x) => x.target === target);
  return dropPrefix(btn ? plcLabel(btn) : target, title);
}
/** 버튼 하나의 이름(옛 묶음 label 의 코일 이름 괄호는 빼고 옛 말은 용어표 말) */
export function plcLabel(btn: { target: string; label?: string | null; short?: string | null }): string {
  const t = tidy(String(btn.label || btn.short || ""));
  return t || btn.target;
}

/** 명령 이름 — 묶음 commands label */
export function commandName(b: BundleLike, kind: string): string {
  const l = b?.commands?.find((c) => c.kind === kind)?.label;
  return l ? tidy(l) : kind;
}

/** 조작 주체 이름(로봇·웹·노트북) — 묶음 <c>.proc.owner enumLabels, 없으면 이 파일 */
export function ownerName(b: BundleLike, owner: string | null | undefined): string {
  if (!owner) return "";
  const e = fieldOf(b, "ch1.proc.owner")?.enumLabels?.[owner];
  return e ? tidy(e) : OWNER[owner] ?? owner;
}

/** 출처(장비) 이름 — 묶음 eventSources label */
export function sourceName12(b: BundleLike, src: string): string {
  const l = b?.eventSources?.find((x) => x.source === src)?.label;
  return l ? tidy(l) : src;
}

/** 필드 마우스 설명 — 평소 보기는 help, 상세 보기는 desc + 열 이름. 챔버12 desc 에는 코일 이름·주소가 있어(묶음 16) 평소 보기에 쓰지 않는다 */
export function fieldTip(f: FieldLike | undefined, detail: boolean): string | undefined {
  if (!f) return undefined;
  if (detail) return [f.desc, f.column].filter(Boolean).join(" · ") || undefined;
  return f.help || undefined;
}
export const fieldTipOf = (b: BundleLike, column: string, detail: boolean) => fieldTip(fieldOf(b, column), detail);
