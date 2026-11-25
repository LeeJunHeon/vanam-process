// 챔버K 평소 보기 줄 검사(W-18) — npm run ops2:chk-feed
// 장비 v2.tools.make_web_feed_golden 이 운전 모드 코드 경로 + 가짜 포트로 모은 봉투(lib/ops2/chk/golden/web_feed_cases.json)를
// 화면과 같은 함수(components/ops2/chk/logView.chkLines → text.logLine plain)로 그려, 평소 보기 줄(main)마다 검사한다.
//   출처·이름이 비지 않음 · 용어표 옛 말·대문자 코드·PLC 주소·v1·묶음 번호 없음 · 영문 오류 이름·주소·날것 낱말 없음 ·
//   출처–이름, 이름–내용에 같은 낱말 없음 · 정상이 아닌 공정 끝은 사유 이름이 보임 · warn·error·critical 줄은 내용이 있음 ·
//   내용이 빈 info 줄은 허용 목록만 · 단계 이름에 괄호가 겹치지 않음.
//   W-19: 정지 순서 끝 줄에 '그 밖' 없음 · 실패(error)가 든 정지 순서 끝은 '실패 N' · 안전 규칙으로 멈춘 줄 이름은 '공정 중단'·'수동 조작 중단'.
//   골든에 없는 경우(실패가 든 정지 순서 끝, 수동 조작 중 안전 규칙 멈춤)는 아래 EXTRA 의 작은 예로 본다.
// 장비 문장을 대체 글로 쓴 줄(fromMessage)은 목록으로 보인다. 하나라도 걸리면 exit 1.
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as esbuild from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cache = join(root, "node_modules", ".cache", "ops2-chk-feed");
mkdirSync(cache, { recursive: true });
const out = join(cache, "feed.mjs");
await esbuild.build({
  absWorkingDir: root, bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "warning",
  tsconfig: join(root, "tsconfig.json"),
  stdin: { resolveDir: root, loader: "ts", contents: `export { chkLines } from "./components/ops2/chk/logView";` },
});
const { chkLines } = await import(`${pathToFileURL(out).href}?t=${Date.now()}`);
const G = JSON.parse(readFileSync(join(root, "lib/ops2/chk/golden/web_feed_cases.json"), "utf8"));
// 작은 예(W-19) — 골든 봉투 모양 그대로, 값만 바꾼 것
const ev = (source, kind, code, level, message, extra = {}) => ({ type: "event", data: { code, level, message, context: { source, kind, ...extra } } });
const EXTRA = [
  { name: "x_seq_done_error", covers: "실패가 든 정지 순서 끝", envelopes: [
    ev("safety", "seq_done", "SEQ_DONE", "warn", "1:not_needed, 2:ok, 3:error:timeout, 4:sent, 5:ok, 6:skipped", { seq: "row_end" })] },
  { name: "x_manual_abort", covers: "수동 조작 중 안전 규칙으로 멈춤", envelopes: [
    ev("safety", "abort", "MV_INTERLOCK_LOST", "error", "수동 조작 중단")] },
];
G.cases.push(...EXTRA);

const OLD = ["인터록", "이온 게이지", "이오나이저", "필라멘트", "디개스", "방출", "냉각수", "도어", "차단밸브", "메인 밸브", "Main 밸브",
  "건 셔터", "Gun 1", "Gun 2", "순방향", "반사", "설정점", "끄기 순서", "끄기 단계", "감시 신호", "램프", "런 이력", "사건", "로컬",
  "장비 정의", "실제/설정", "안전·유틸리티", "유틸리티", "셔터·안전", "블록", "스텝",
  "가스 도입", "정상 끝 정지", "셔터 딜레이", "Stage0", "Stage1", "Stage2", "Stage3"];      // W-21
const DEV = [/\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/, /\b[MPD]0?\d{4,5}\b|\bD\d{2,3}\b/, /\bv1\b/, /묶음 ?\d/];
const RAW = [/\w*Error\b/, /gaierror/i, /localhost/i, /\b\d{1,3}(\.\d{1,3}){3}\b/, /\.invalid\b/, /\b(on|off):/, /\berror\b/, /\bdone\b/, /\baborted\b/];
// 내용이 비어도 되는 줄 — [출처, 이름, 이유]
const EMPTY_OK = [
  ["PLC", "장비 연결 복구", "이름이 곧 내용(연결이 돌아옴)"], ["웹 연결", "끊김", "주소·오류 이름이 든 장비 문장은 상세 보기에서만"],
  ["웹 연결", "복구", "이름이 곧 내용"], ["안전", "정지 순서 시작", "단계 수가 내용에 오지만 없을 수도 있음"],
  ["안전", "ALL STOP", "사용자가 누른 ALL STOP — 이름이 곧 내용"],
];
// 이름–내용 낱말이 겹쳐도 되는 줄 — [출처, 이름, 이유]
const OVERLAP_OK = [
  ["안전", "공정 중단", "이름은 멈춘 것, 내용은 사유 이름(묶음 reasons) — '공정 중 MV 인터락 꺼짐' 처럼 사유 이름에 '공정' 이 들어 있음"],
  ["안전", "수동 조작 중단", "위와 같음(수동 조작 중 안전 규칙으로 멈춤)"],
];
const overlapOk = (l) => OVERLAP_OK.some(([s, k]) => s === l.source && k === l.kind);
const emptyOk = (l) => EMPTY_OK.some(([s, k]) => s === l.source && k === l.kind);
const words = (t) => (t || "").split(/[\s·:→,|()]+/).filter((w) => w.length >= 2 && /[가-힣]/.test(w));
const reasonName = (b, code) => b.reasons?.find((r) => r.code === code)?.label;

let n = 0;
const bad = [];
const fromMessage = new Map();
const seqDone = [], ruleStop = [];
for (const c of G.cases) {
  const lines = chkLines(G.bundle, c.envelopes.map((e, i) => ({ id: `${c.name}-${i}`, ts: "", seq: i, ...e })));
  for (const l of lines) {
    if (!l.main) continue;
    n++;
    const where = `${c.name} | ${l.source} | ${l.kind} | ${l.text}`;
    const all = `${l.source} ${l.kind} ${l.text}`;
    const fail = (why) => bad.push(`${why}: ${where}`);
    if (!l.source) fail("출처 없음");
    if (!l.kind) fail("이름 없음");
    if (["노트북", "웹"].includes(l.source)) fail("출처는 LOCAL·WEB(W-21)");
    for (const w of OLD) if (all.includes(w)) fail(`옛 말 ${w}`);
    for (const re of DEV) if (re.test(all)) fail(`코드·주소·v1·묶음 ${all.match(re)[0]}`);
    for (const re of RAW) if (re.test(all)) fail(`영문 오류·주소·날것 ${all.match(re)[0]}`);
    const sw = words(l.source), kw = words(l.kind), tw = words(l.text);
    const sk = kw.filter((w) => sw.includes(w)), kt = tw.filter((w) => kw.includes(w));
    if (sk.length) fail(`출처–이름 겹침 ${sk.join(",")}`);
    if (kt.length && !overlapOk(l)) fail(`이름–내용 겹침 ${kt.join(",")}`);
    const ctx0 = l.e.data?.context ?? {};
    if (ctx0.source === "safety" && ctx0.kind === "seq_done") {
      if (l.text.includes("그 밖")) fail("정지 순서 끝에 '그 밖'");
      const nErr = [...String(l.e.data.message ?? "").matchAll(/\d+:error\b/g)].length;
      if (nErr && !l.text.includes(`실패 ${nErr}`)) fail(`정지 순서 끝에 '실패 ${nErr}' 없음`);
      seqDone.push(`${c.name} | ${l.text}`);
    }
    if (ctx0.source === "safety" && ctx0.kind === "abort") {
      const want = /수동 조작 중단/.test(String(l.e.data.message ?? "")) ? "수동 조작 중단" : "공정 중단";
      if (l.kind !== want) fail(`안전 규칙 멈춤 이름이 '${want}' 아님`);
      ruleStop.push(`${c.name} | ${l.source} | ${l.kind} | ${l.text}`);
    }
    if (l.e.type === "run_end" && l.e.data.result !== "done" && l.e.data.reasonCode) {
      const rn = reasonName(G.bundle, l.e.data.reasonCode);
      if (rn && !l.text.includes(rn)) fail(`공정 끝 사유 빠짐(${rn})`);
    }
    if (!l.text && ["warn", "error", "critical"].includes(l.level) && !emptyOk(l)) fail("경고·오류 줄 내용 없음");
    if (!l.text && l.level === "info" && !emptyOk(l)) fail("내용 없는 안내 줄(허용 목록 밖)");
    if (/\)\(|\)\)/.test(all)) fail("괄호 겹침");
    if (l.fromMessage) {
      const ctx = l.e.data.context ?? {};
      fromMessage.set(`${ctx.source ?? "?"}.${ctx.kind ?? "?"} ${l.e.data.code ?? ""}`, `${l.source} | ${l.kind} | ${l.text}`);
    }
  }
}
console.log(`챔버K 평소 보기 줄 검사 — 흐름 ${G.cases.length}개, 줄 ${n}개, 걸린 것 ${bad.length}개`);
for (const b of bad) console.log(`  ${b}`);
console.log(`정지 순서 끝 줄 ${seqDone.length}개`);
for (const x of seqDone) console.log(`  ${x}`);
console.log(`안전 규칙으로 멈춘 줄 ${ruleStop.length}개`);
for (const x of ruleStop) console.log(`  ${x}`);
console.log(`장비 문장을 대체 글로 쓴 줄(fromMessage) ${fromMessage.size}종`);
for (const [k, v] of fromMessage) console.log(`  ${k} → ${v}`);
if (process.argv.includes("--show")) {
  for (const c of G.cases) {
    console.log(`== ${c.name}`);
    for (const l of chkLines(G.bundle, c.envelopes.map((e, i) => ({ id: `${c.name}-${i}`, ts: "", seq: i, ...e })))) {
      if (l.main) console.log(`  ${l.source} | ${l.kind} | ${l.text}`);
    }
  }
}
process.exit(bad.length ? 1 : 0);
