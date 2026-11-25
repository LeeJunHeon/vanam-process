// 챔버K·챔버12 화면 문구 검사(W-15, W-19 에 챔버12 더함) — npm run ops2:chk-wording
// 장비 5-20 ④ 문구 규칙(v2/tests/test_web_labels.py test_screen_texts_follow_wording_rules)과 같은 식을 웹 챔버K 화면 글에 건다:
//   문장 속 줄표(—) · '안 함/안 씀/안 됨' · '못 함' · '미룸' · '켬/끔'.
// 보는 곳: components/ops2/chk/**/*.ts(x) · lib/ops2/chk/*.ts · (W-19) components/ops2/ch12/**/*.ts(x) · lib/ops2/ch12/*.ts 의 화면 글
//   (JSX 글, 따옴표·백틱 글 — 주석·import·className 같은 속성 값은 뺌)과
//   골든 묶음(lib/ops2/chk/golden/bundle*.json 이 있으면 그 화면 이름·설명).
// 값이 없을 때 쓰는 '—' 한 글자(빈 값 표시)는 문장이 아니라서 본다 — 한글과 같이 쓴 줄표만 걸린다.
// 예외(EXCEPT): CH1&2 가 같은 글을 쓰는 공유 파일의 글, v1 대조 시험·골든이 v1 과 같기를 요구하는 글. 하나라도 걸리면 exit 1.
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BAD = /안 ?(함|씀|됨)(?![가-힣])|못 ?함(?![가-힣])|미룸|(?<![가-힣])(켬|끔)(?![가-힣])|[가-힣](켬|끔)(?![가-힣])/;
const HANGUL = /[가-힣]/;
const dashBad = (t) => t.includes("—") && HANGUL.test(t);
// W-16: 평소 보기 글에 대문자 코드(UPLINK_AUTH_FAILED 등)·영문 local 이 섞이지 않는다 — 한글 글 속의 코드 모양·local 을 잡는다
//   (코드는 상세 보기에서만 — 부르는 쪽이 detail 일 때 따로 붙이고, 그 글은 코드만이라 한글이 없어 걸리지 않는다)
const CODE = /\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/;
const codeBad = (t) => HANGUL.test(t) && (CODE.test(t) || /(?<![A-Za-z])local(?![A-Za-z])/.test(t));
const bad = (t) => BAD.test(t) || dashBad(t) || codeBad(t);
// W-17: 용어표의 옛 말(장비 5-23 ⑤ 목록 + 화면 말) — 챔버K 화면 글에 없다. '블록'·'스텝'은 레시피 편집 파일에서만
const OLD_TERMS = ["인터록", "이온 게이지", "이오나이저", "필라멘트", "디개스", "방출", "냉각수", "도어", "차단밸브", "메인 밸브", "Main 밸브",
  "건 셔터", "Gun 1", "Gun 2", "순방향", "반사", "설정점", "끄기 순서", "끄기 단계", "감시 신호", "램프", "런 이력", "사건", "로컬",
  "장비 정의", "실제/설정", "안전·유틸리티", "유틸리티", "셔터·안전",
  // W-19: 챔버12 용어표 옛 말(장비 묶음 16 test_web_labels OLD_TERMS 와 같은 목록)
  "로터리", "터보 펌프", "러핑", "포어라인", "벤트", "게이트 밸브", "로드락", "4핀", "척 모터", "플라즈마 클리닝", "메인 셔터", "시퀀스"];
// '블록'·'스텝'은 레시피 편집(레시피 탭) 파일에서만 — 챔버12 는 레시피 탭·블록 정의·v1 행 검사·레시피 저장
const RECIPE_FILES = /(Chk2BlockEditor|Chk2RecipeEditor|Chk2Recipes|recipeText|Ch12Recipes|Ch12BlockEditor)\.tsx?$|lib\/ops2\/(chk|ch12)\/(blocks|recipe|recipes)\.ts$/;
// 평소 보기 화면 파일 — 한글 글 60자 안, PLC 주소·v1·묶음 번호 없음
const EVERYDAY = /components\/ops2\/chk\/(Chk2Page|Chk2Status|Chk2Run|Chk2Devices|Chk2Hmi|Chk2Manual|Chk2Logs|Chk2Seq|Chk2Trend|Chk2LocalNext|Chk2LocalConfig|StateTag|logView)\.tsx?$|lib\/ops2\/chk\/(plain|terms)\.ts$/
  .source + "|" + /components\/ops2\/ch12\/(Ch12Page|Ch12Status|Ch12Run|Ch12Hmi|Ch12Aux|Ch12Thickness|Ch12Logs|Ch12History|Ch12Confirm|Ch12Popups|Ch12LocalFiles|Ch12SeqEdit|Ch12Spectra|Ch12Timing|Ch12Inputs|BlockCard|logic)\.tsx?$|lib\/ops2\/ch12\/terms\.ts$/.source;
const isEveryday = (rel) => new RegExp(EVERYDAY).test(rel);
function problems(rel, t) {
  const out = [];
  if (bad(t)) out.push("문구 규칙");
  if (!HANGUL.test(t)) return out;
  const old = OLD_TERMS.filter((w) => t.includes(w));
  if (!RECIPE_FILES.test(rel)) for (const w of ["블록", "스텝"]) if (t.includes(w)) old.push(w);
  if (old.length) out.push(`옛 말 ${old.join("·")}`);
  if (isEveryday(rel)) {
    if ([...t.replace(/X/g, "")].length > 60) out.push("60자 넘음");
    if (/\b[MPD]\d{4,5}\b|\bD\d{2}\b|\bv1\b|묶음 ?\d/.test(t)) out.push("주소·v1·묶음 번호");
  }
  return out;
}

// 예외 — [파일(저장소 기준), 글의 일부]. 이유를 옆에 적는다
const EXCEPT = [
  // v1 대조 시험(장비 test_bench_fixes)이 v1 과 같기를 요구하는 이온 게이지 상태 이름(묶음이 주는 글을 그대로 보인다)
  ["*", "음수 — 영점·오염 확인"],
  // 장비가 만든 글을 웹이 그대로 다시 만드는 검사·순서 글(골든 web_block_cases·web_template_cases 가 장비 글과 같기를 요구)
  ["lib/ops2/chk/blocks.ts", "반복 횟수를 줄일 것"], ["lib/ops2/chk/blocks.ts", "승온 시작"], ["lib/ops2/chk/blocks.ts", "도달 대기 안 함"],
  ["lib/ops2/chk/recipe.ts", "DC 를 쓸 때만"], ["lib/ops2/chk/recipe.ts", "파이썬 램프로 실행"], ["lib/ops2/chk/recipe.ts", "저장된 값을 읽지 못함"],
  // CH1&2 가 같은 부품으로 그리는 글(kit·Chk2Config) — 바꾸면 CH1&2 화면이 달라진다. CH1&2 와 같은 문제로 보고만
  ["components/ops2/chk/kit.tsx", "잠김 — "], ["components/ops2/chk/kit.tsx", "— 명령을 장비에 보냅니다."],
  ["components/ops2/chk/Chk2Config.tsx", "보내지 못함"],
  ["components/ops2/chk/Chk2Config.tsx", "장비 대기 키 —"],
  ["components/ops2/chk/Chk2Config.tsx", "장비가 지금 쓰는 값을 보여 줍니다"],
  ["components/ops2/chk/Chk2Config.tsx", "목록에서 값을 골라야"],
  ["components/ops2/chk/Chk2Config.tsx", "노트북 덮어쓰기 —"],
  ["components/ops2/chk/Chk2Config.tsx", "거부 —"],
  ["components/ops2/chk/Chk2Config.tsx", "편집한 값은 그대로 남아 있습니다 —"],
  ["components/ops2/chk/Chk2Config.tsx", "설정 적용 확인 —"],
  ["components/ops2/chk/Chk2Config.tsx", "local_override.json"], ["components/ops2/chk/Chk2Config.tsx", "CONFIG_INVALID"],
  ["components/ops2/chk/Chk2Config.tsx", "CONFIG_H_IN_PROCESS"],
  // 장비가 만든 검사·순서 글(골든·장비 recipe.py 와 같은 글 — 설정 키 이름이 글에 들어 있다)
  ["lib/ops2/chk/blocks.ts", "_SET=X 설정"], ["lib/ops2/chk/recipe.ts", "IG_ENABLED=false"], ["lib/ops2/chk/recipe.ts", "HEATER_ENABLED=false"],
  ["lib/ops2/chk/recipe.ts", "HEATER_RECIPE_MAX_STEPS"],
  // 웹 챗: 서버 콘솔 글(사람 화면 아님)·모든 장비(CH1&2 포함)가 같이 쓰는 웹 연락 끊김 글
  ["lib/ops2/chat.ts", "[ops2/chat] OPS2_CHAT_TREAT_AS_PROD"], ["lib/ops2/chat.ts", "늦게 판단(웹이 그동안 보지 못함)"],
  ["lib/ops2/chat.ts", "웹이 장비 연락을 X 동안 받지 못함"], ["lib/ops2/chat.ts", "장비 연락을 다시 받음 —"],
  // W-17 — 용어표 옛 말 예외
  //  골든(web_block_cases expanded·errors)이 장비 스텝 문구와 같기를 요구하는 글(장비 blocks.py 스텝 문구는 그대로 — 상세 보기 전용)
  ["lib/ops2/chk/blocks.ts", "파워 끄기 단계는 뺄 수 없음"], ["lib/ops2/chk/blocks.ts", "히터 램프 속도 X°C/min 설정"],
  ["lib/ops2/chk/blocks.ts", "이온 게이지 필라멘트 ON"], ["lib/ops2/chk/blocks.ts", "이온 게이지 필라멘트 OFF"], ["lib/ops2/chk/blocks.ts", "RF 램프다운 → OFF"],
  //  CH1&2 가 같이 쓰는 파일의 기본 글(챔버K 는 선택 옵션 plain 으로 바꿔 보인다 — Chk2Adjust plain·logLine plain·RunList plain)
  ["components/ops2/chk/Chk2Adjust.tsx", "히터 램프 속도"], ["components/ops2/chk/Chk2Adjust.tsx", "앞으로 올 블록부터 적용"],
  ["components/ops2/chk/Chk2Adjust.tsx", "이미 지나 남은 블록이 사용하지 않음"], ["components/ops2/chk/Chk2Adjust.tsx", "램프"],
  ["components/ops2/chk/Chk2Logs.tsx", "런 이력"], ["components/ops2/chk/text.ts", "다음 블록부터"],
  ["components/ops2/chk/types.ts", "다음 블록부터"], ["components/ops2/chk/types.ts", "· 블록 X"],
  ["components/ops2/chk/Chk2Config.tsx", "장비 정의를 기다리는 중"],
  //  화면 글이 아니라 검사 오류 글을 가려내는 비교 문자열("블록 " 으로 시작하는 오류는 칸 옆에 따로 보인다)
  ["components/ops2/chk/Chk2Seq.tsx", "블록 "],
  // W-19 — 챔버12 예외
  //  확인창 위험 문구: 장비 commands.HAZARD_TEXT(묶음 16 plcHazardText)와 같은 글 — 묶음이 옛것일 때 대신 쓴다. 두 문장 경고라 60자를 넘는다
  ["components/ops2/ch12/Ch12Hmi.tsx", "사람 위험: Vent·Door·Gate"], ["components/ops2/ch12/Ch12Hmi.tsx", "장비 위험: Turbo·Rotary 끄기"],
  ["components/ops2/ch12/Ch12Hmi.tsx", "지금 DC Pulse 사용 중입니다. RF Select 는"],
  //  두께 Factor 창 재료 고르기 첫 항목: 장비 thickness_factors.material_choices 가 보내는 글과 같아야 고른 값을 '재료 없음'으로 읽는다
  ["components/ops2/ch12/Ch12Thickness.tsx", "(선택 안 함)"],
  //  장비가 만든 검사·순서 글을 웹이 그대로 다시 만드는 글(골든 web_ch12_blocks·web_ch12_recipe_check·web_ch12_template 이 장비 글과
  //  같기를 요구 — ops2:golden). 레시피 탭 검사 결과·적재 전 확인에만 보인다
  ["lib/ops2/ch12/blocks.ts", "뺄 수 없는 단계"], ["lib/ops2/ch12/blocks.ts", "DC2(폐지 — 히터와 배타)"],
  ["lib/ops2/ch12/blocks.ts", "이 챔버 설정에서 꺼져 있음(SUPPORTS_"], ["lib/ops2/ch12/blocks.ts", "이 챔버에 없는 건 셔터"],
  ["lib/ops2/ch12/recipe.ts", "CESAR 사양 3-5"], ["lib/ops2/ch12/recipe.ts", "SUPPORTS_HEATER=false 또는 히터 초기화 실패"],
  ["lib/ops2/ch12/recipe.ts", "메인 공정 구간에 있습니다 —"], ["lib/ops2/ch12/recipe.ts", "기본 램프 속도"], ["lib/ops2/ch12/recipe.ts", "히터 사용 — 목표"],
  ["lib/ops2/ch12/recipes.ts", "장비가 처리하지 못하는 값"],
  //  구글챗 카드·보내기 기록(화면 글 아님): v1 ChatNotifier 카드 글과 같아야 한다(ops2:chat-ch12 골든), 버린 행 lastError 는 건수를 세는 열쇠
  ["lib/ops2/ch12/chatCards.ts", "이어간 블록"], ["lib/ops2/ch12/chatCards.ts", "프로그램 재시작 — 이어가지 못해 안전 정지"],
  ["lib/ops2/ch12/chatLimits.ts", "대기 상한 초과 — 생략(v1 CHAT_PENDING_MAX)"],
];
const SKIP_ATTR = new Set(["className", "key", "d", "viewBox", "fill", "stroke", "strokeDasharray", "fontFamily", "textAnchor",
  "role", "type", "inputMode", "name", "id", "href", "src", "style", "kind", "tone", "size", "level", "words"]);

function* files(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) { if (n !== "golden") yield* files(p); }
    else if (/\.(ts|tsx)$/.test(n) && !n.endsWith(".d.ts")) yield p;
  }
}

const hits = [];
const except = (rel, t) => EXCEPT.some(([f, part]) => (f === "*" || f === rel) && t.includes(part));
const add = (rel, line, t) => {
  const p = problems(rel, t);
  if (p.length && !except(rel, t)) hits.push(`${rel}:${line}  [${p.join(", ")}] ${t.replace(/\s+/g, " ").trim().slice(0, 140)}`);
};

const LISTS = [...["components/ops2/chk", "lib/ops2/chk", "components/ops2/ch12", "lib/ops2/ch12"].flatMap((dir) => [...files(join(root, dir))]),
  join(root, "lib/ops2/chatText.ts"), join(root, "lib/ops2/chat.ts")];      // 웹 챗 문구(챔버K)
{
  for (const f of LISTS) {
    const rel = relative(root, f);
    const src = readFileSync(f, "utf8");
    const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, f.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const lineOf = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
    const visit = (n) => {
      if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) return;
      if (ts.isJsxAttribute(n) && SKIP_ATTR.has(n.name.getText(sf))) return;
      if (ts.isJsxText(n)) add(rel, lineOf(n), n.getText(sf));
      else if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) add(rel, lineOf(n), n.text);
      else if (ts.isTemplateExpression(n)) {
        add(rel, lineOf(n), [n.head.text, ...n.templateSpans.map((s) => `X${s.literal.text}`)].join(""));
        n.templateSpans.forEach((s) => visit(s.expression));
        return;
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
}

// 골든 묶음(있으면) — 화면에 나오는 이름·설명
const gdir = join(root, "lib/ops2/chk/golden");
if (existsSync(gdir)) {
  for (const n of readdirSync(gdir).filter((x) => /^bundle.*\.json$/.test(x))) {
    const walk = (o, path) => {
      if (typeof o === "string") { if (/(label|desc|help|text|title)$/i.test(path)) add(`golden/${n}`, path, o); }
      else if (Array.isArray(o)) o.forEach((v, i) => walk(v, `${path}[${i}]`));
      else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) walk(v, `${path}.${k}`);
    };
    walk(JSON.parse(readFileSync(join(gdir, n), "utf8")), "");
  }
}

if (hits.length) {
  console.log(`문구 규칙에 걸린 글 ${hits.length}개`);
  for (const h of hits) console.log(`  ${h}`);
  process.exit(1);
}
console.log("챔버K·챔버12 화면 문구 검사 통과 — 0건");
