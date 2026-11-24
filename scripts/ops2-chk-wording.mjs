// 챔버K 화면 문구 검사(W-15) — npm run ops2:chk-wording
// 장비 5-20 ④ 문구 규칙(v2/tests/test_web_labels.py test_screen_texts_follow_wording_rules)과 같은 식을 웹 챔버K 화면 글에 건다:
//   문장 속 줄표(—) · '안 함/안 씀/안 됨' · '못 함' · '미룸' · '켬/끔'.
// 보는 곳: components/ops2/chk/**/*.ts(x) · lib/ops2/chk/*.ts 의 화면 글(JSX 글, 따옴표·백틱 글 — 주석·import·className 같은 속성 값은 뺌)과
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
const add = (rel, line, t) => { if (bad(t) && !except(rel, t)) hits.push(`${rel}:${line}  ${t.replace(/\s+/g, " ").trim().slice(0, 140)}`); };

const LISTS = [...["components/ops2/chk", "lib/ops2/chk"].flatMap((dir) => [...files(join(root, dir))]),
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
console.log("챔버K 화면 문구 검사 통과 — 0건");
