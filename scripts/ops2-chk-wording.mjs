// 챔버K·챔버12 화면 문구 검사(W-15, W-19 에 챔버12 더함) — npm run ops2:chk-wording
// 장비 5-20 ④ 문구 규칙(v2/tests/test_web_labels.py test_screen_texts_follow_wording_rules)과 같은 식을 웹 챔버K 화면 글에 건다:
//   문장 속 줄표(—) · '안 함/안 씀/안 됨' · '못 함' · '미룸' · '켬/끔'.
// 보는 곳: components/ops2/chk/**/*.ts(x) · lib/ops2/chk/*.ts · (W-19) components/ops2/ch12/**/*.ts(x) · lib/ops2/ch12/*.ts 의 화면 글
//   (JSX 글, 따옴표·백틱 글 — 주석·import·className 같은 속성 값은 뺌)과
//   골든 묶음(lib/ops2/chk/golden/bundle*.json 이 있으면 그 화면 이름·설명).
// 값이 없을 때 쓰는 '—' 한 글자(빈 값 표시)는 문장이 아니라서 본다 — 한글과 같이 쓴 줄표만 걸린다.
// W-23: 설정 설명(묶음 params desc — 장비와 같은 패턴)·표시 장비 ID 'CHK2' 노출도 본다(아래).
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
  "로터리", "터보 펌프", "러핑", "포어라인", "벤트", "게이트 밸브", "로드락", "4핀", "척 모터", "플라즈마 클리닝", "메인 셔터", "시퀀스",
  // W-25 A6(사용자 결정 2026-11-26): '두절' → '끊김' 하나로
  "두절"];
// W-21: 챔버K 화면에서 바꾼 말(가스 도입 → 가스 주입, 정상 끝 정지 → 공정 끝, 셔터 딜레이 → Shutter Delay, 레시피 탭 → 레시피 열기) — 챔버K 파일만
const OLD_TERMS_CHK = ["가스 도입", "정상 끝 정지", "셔터 딜레이", "레시피 탭"];
// '블록'·'스텝'은 레시피 편집(레시피 탭) 파일에서만 — 챔버12 는 레시피 탭·블록 정의·v1 행 검사·레시피 저장
const RECIPE_FILES = /(Chk2BlockEditor|Chk2RecipeEditor|Chk2Recipes|recipeText|Ch12Recipes|Ch12BlockEditor)\.tsx?$|lib\/ops2\/(chk|ch12)\/(blocks|recipe|recipes)\.ts$/;
// 평소 보기 화면 파일 — 한글 글 60자 안, PLC 주소·v1·묶음 번호 없음
const EVERYDAY = /components\/ops2\/chk\/(Chk2Page|Chk2Status|Chk2Run|Chk2Devices|Chk2Hmi|Chk2Manual|Chk2Logs|Chk2Seq|Chk2Trend|Chk2LocalNext|Chk2LocalConfig|StateTag|logView)\.tsx?$|lib\/ops2\/chk\/(plain|terms)\.ts$/
  .source + "|" + /components\/ops2\/ch12\/(Ch12Page|Ch12Status|Ch12Run|Ch12Hmi|Ch12Aux|Ch12Thickness|Ch12Logs|Ch12History|Ch12Confirm|Ch12Popups|Ch12LocalFiles|Ch12SeqEdit|Ch12Spectra|Ch12Timing|Ch12Inputs|Ch12Devices|Ch12Dash|BlockCard|logic)\.tsx?$|lib\/ops2\/ch12\/terms\.ts$/.source;
const isEveryday = (rel) => new RegExp(EVERYDAY).test(rel);
function problems(rel, t) {
  const out = [];
  if (bad(t)) out.push("문구 규칙");
  if (!HANGUL.test(t)) return out;
  const old = OLD_TERMS.filter((w) => t.includes(w));
  if (/ops2\/chk\//.test(rel)) old.push(...OLD_TERMS_CHK.filter((w) => t.includes(w)));
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
  ["lib/ops2/chk/blocks.ts", "정상 끝 정지 순서"],      // W-21 장비 스텝 문구(v1 대조 — 화면에 보이지 않는 내부 스텝)
  // 옛 묶음(21 이하) 이름 → 지금 이름 표(terms.ts) — 옛 말을 찾는 쪽이라 그대로
  ["lib/ops2/chk/terms.ts", "가스 도입"], ["lib/ops2/chk/terms.ts", "정상 끝 정지"],
  ["lib/ops2/chk/blocks.ts", "반복 횟수를 줄일 것"], ["lib/ops2/chk/blocks.ts", "승온 시작"], ["lib/ops2/chk/blocks.ts", "도달 대기 안 함"],
  ["lib/ops2/chk/recipe.ts", "DC 를 쓸 때만"], ["lib/ops2/chk/recipe.ts", "파이썬 램프로 실행"], ["lib/ops2/chk/recipe.ts", "저장된 값을 읽지 못함"],
  // CH1&2 가 같은 부품으로 그리는 글(kit·Chk2Config) — 바꾸면 CH1&2 화면이 달라진다. CH1&2 와 같은 문제로 보고만
  ["components/ops2/chk/kit.tsx", "— 명령을 장비에 보냅니다."],
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
  ["lib/ops2/ch12/blocks.ts", "W(운전 상한 RF_OPERATING_MAX_W)"], ["lib/ops2/ch12/recipe.ts", "RF Target Power(W)는 운전 상한"],
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
const tipHits = [];
const TIP_DASH = /[가-힣]\s*—\s/;
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
      // W-25 B1: 도움말(title·data-tip 속성) 속 '한글 — ' 꼴 — 잠긴 버튼 앞말 '잠김: ' 처럼 쌍점으로
      if (ts.isJsxAttribute(n) && ["title", "data-tip"].includes(n.name.getText(sf)) && n.initializer) {
        const parts = [];
        const grab = (x) => { if (ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x)) parts.push(x.text);
          else if (ts.isTemplateExpression(x)) parts.push(x.head.text, ...x.templateSpans.map((y) => y.literal.text)); ts.forEachChild(x, grab); };
        grab(n.initializer);
        for (const t of parts) if (TIP_DASH.test(t) && !except(rel, t)) tipHits.push(`${rel}:${lineOf(n)}  [도움말 속 '한글 — '] ${t.trim().slice(0, 100)}`);
      }
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

hits.push(...tipHits);
// 도움말 검사 자체가 잡는가
if (!TIP_DASH.test("잠김 — 장비 끊김") || TIP_DASH.test("잠김: 장비 끊김")) { console.log("도움말 '한글 — ' 검사가 잘못됨"); process.exit(1); }

// W-25 A4: 화면 용어 바꿈(lib/ops2/chk/terms.ts toTerms)은 낱말 경계에서만 — 낱말 속(클램프)은 그대로, 조사만 붙은 낱말은 바꿈
{
  const esbuild = await import("esbuild");
  const { mkdirSync } = await import("node:fs");
  const { pathToFileURL } = await import("node:url");
  const cache = join(root, "node_modules", ".cache", "ops2-chk-wording");
  mkdirSync(cache, { recursive: true });
  const out = join(cache, "terms.mjs");
  await esbuild.build({ absWorkingDir: root, bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "warning",
    tsconfig: join(root, "tsconfig.json"), stdin: { resolveDir: root, loader: "ts", contents: `export { toTerms } from "./lib/ops2/chk/terms";` } });
  const { toTerms } = await import(`${pathToFileURL(out).href}?t=${Date.now()}`);
  const CASES = [["DAC 포화 클램프 해제", "DAC 포화 클램프 해제"], ["RF 램프다운", "RF 천천히 내리기"], ["스텝 3", "단계 3"], ["블록을 고름", "단계을 고름"],
    ["히터 램프 2 °C/min", "히터 승온 2 °C/min"], ["반사파 대기", "Reflected 대기"], ["도어 열림", "Door 열림"], ["방출 전류", "Emission 전류"],
    ["로컬에서", "노트북에서"], ["이벤트 3", "이벤트 3"], ["실제값", "실제값"], ["인터록이 꺼짐", "인터락이 꺼짐"]];
  const bad = CASES.filter(([a, b]) => toTerms(a) !== b);
  for (const [a, b] of bad) hits.push(`lib/ops2/chk/terms.ts  [용어 바꿈 낱말 경계] '${a}' → '${toTerms(a)}' (기대 '${b}')`);
  console.log(`용어 바꿈 낱말 경계 ${CASES.length}경우 — 다름 ${bad.length}`);
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

// W-23 D: 설정 설명(장비 묶음 params[].desc) — 장비 시험 test_web_labels.desc_problems 와 같은 패턴.
//   설명은 운전자·관리자가 읽는 말 1~2문장(…합니다/…입니다). 설정 키·v1·작업 번호·파일 이름·장비 명령 글자·금지 문구·옛 말이 없다.
//   골든 web_feed_cases.json 의 묶음(장비 make_web_feed_golden 이 설정 이름·설명을 넣는다)에서 읽는다.
const DESC_BAD = [
  ["설정 키", /\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/],
  ["v1·v2", /(?<![A-Za-z])[vV][12](?![0-9A-Za-z])/],
  ["작업·결정 번호", /(?<![\d.])\d{1,2}-\d{1,2}(?![\d])|W-\d+|[①-⑳]|20\d\d-\d\d-\d\d/],
  ["파일 이름", /\w+\.(py|json|cmd|txt)\b/],
  ["장비 명령 글자", /(?<![A-Za-z0-9])(R\d{1,3}|MEAS:\w+\??|OUTP\??|FACT:[\w-]+\??|VOLT:\w+\??|CURR:\w+\??|SYST:\w+\??|\*IDN\?|\*RST|APPLy|[QSDLMXVPWZ]\d{1,3}|D0\d{4}|M0\d{4}|X\d\d|S\d\d[A-Z]?)(?![A-Za-z0-9])/],
  ["금지 문구", /—|안 ?(함|씀|됨)(?![가-힣])|못 ?함(?![가-힣])|미룸|(?<![가-힣])(켬|끔)(?![가-힣])/],
  ["옛 말", new RegExp(["인터록", "이온 게이지", "필라멘트", "디개스", "방출", "냉각수", "도어", "차단 ?밸브", "메인 밸브", "순방향", "반사", "설정점",
    "램프", "블록", "스텝", "사건", "로컬", "시퀀스", "벤트", "로터리", "터보 펌프", "가스 도입", "정상 끝 정지", "셔터 딜레이", "두절"].join("|"))],
];
function descProblems(t) {
  const out = DESC_BAD.filter(([, re]) => re.test(t)).map(([n]) => n);
  const sents = t.trim().split(/(?<=\.)\s+/).filter(Boolean);
  if (!sents.length || sents.some((x) => !/니다(\([^()]*\))?\.$/.test(x))) out.push("문장 끝(…합니다/…입니다)");
  if (sents.length > 2) out.push("2문장 넘음");
  return out;
}
// 검사 자체가 패턴을 잡는다(빈 검사가 늘 통과하지 않게)
for (const t of ["유량 안정화 시간입니다(FLOW_STABILIZE_SEC).", "v1 과 같습니다.", "5-19 ③ 결정입니다.", "R5 로 읽습니다.", "켬 상태입니다.",
  "인터록을 겁니다.", "정지한다.", "하나입니다. 둘입니다. 셋입니다.", "S32 규칙입니다."]) {
  if (!descProblems(t).length) { console.log(`설정 설명 검사가 '${t}' 를 못 잡음`); process.exit(1); }
}
let descCount = 0;
const feed = join(root, "lib/ops2/chk/golden/web_feed_cases.json");
if (existsSync(feed)) {
  for (const p of JSON.parse(readFileSync(feed, "utf8")).bundle?.params ?? []) {
    descCount++;
    const pr = descProblems(p.desc ?? "");
    if (pr.length) hits.push(`golden/web_feed_cases.json params.${p.key}  [설정 설명 ${pr.join(", ")}] ${String(p.desc).slice(0, 140)}`);
  }
}

// W-23 E1: 표시 장비 ID — 화면 글에 'CHK2' 가 나오지 않는다(lib/ops2/display.ts showEquipment 가 CHK2 → CHK 로 만든다).
//   장비 ID 그 자체(따옴표 안이 'CHK2'·'CHK2-SIM' 뿐인 글 — 비교·저장 키)는 화면 글이 아니라서 보지 않는다. 상세 보기 글은 CHK2_EXCEPT 에.
const CHK2_FILES = [...["components/ops2/chk", "lib/ops2/chk"].flatMap((dir) => [...files(join(root, dir))]),
  join(root, "lib/ops2/chatText.ts"), join(root, "lib/ops2/chat.ts"), join(root, "components/OpsDashboardPage.tsx")];
const CHK2_EXCEPT = [
  ["components/ops2/chk/Chk2Config.tsx", "CHK2·CHK2-SIM"],    // 챔버12 화면(ck 꺼짐)의 기본 글 그대로(공유 파일 — 옵션으로만 바꿈)
];
let chk2Seen = 0;
for (const f of CHK2_FILES) {
  const rel = relative(root, f);
  const src = readFileSync(f, "utf8");
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, f.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const look = (n, t) => {
    if (!/CHK2/.test(t)) return;
    chk2Seen++;
    if (/^\s*CHK2(-SIM)?\s*$/.test(t)) return;                     // ID 그 자체(비교·저장 키)
    if (CHK2_EXCEPT.some(([ff, part]) => ff === rel && t.includes(part))) return;
    hits.push(`${rel}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}  [표시 장비 ID CHK2] ${t.replace(/\s+/g, " ").trim().slice(0, 140)}`);
  };
  const visit = (n) => {
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) return;
    if (ts.isJsxText(n)) look(n, n.getText(sf));
    else if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) look(n, n.text);
    else if (ts.isTemplateExpression(n)) look(n, [n.head.text, ...n.templateSpans.map((x) => `X${x.literal.text}`)].join(""));
    ts.forEachChild(n, visit);
  };
  visit(sf);
}
// 골든 평소 보기 줄(장비가 내는 글)에도 CHK2 가 없다 — 장비 ID 는 따로 오는 값이라 글에 섞이지 않는다
if (existsSync(feed)) {
  const walk = (o, path) => {
    if (typeof o === "string") { if (/(label|desc|help|text|title|detail|msg|message)$/i.test(path) && /CHK2/.test(o) && HANGUL.test(o)) hits.push(`golden/web_feed_cases.json ${path}  [표시 장비 ID CHK2] ${o.slice(0, 140)}`); }
    else if (Array.isArray(o)) o.forEach((v, i) => walk(v, `${path}[${i}]`));
    else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) walk(v, `${path}.${k}`);
  };
  walk(JSON.parse(readFileSync(feed, "utf8")).bundle ?? {}, "bundle");
}

if (hits.length) {
  console.log(`문구 규칙에 걸린 글 ${hits.length}개`);
  for (const h of hits) console.log(`  ${h}`);
  process.exit(1);
}
console.log(`챔버K·챔버12 화면 문구 검사 통과 — 0건(설정 설명 ${descCount}개, CHK2 글 ${chk2Seen}곳 확인)`);
