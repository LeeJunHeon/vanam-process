// 노트북 로컬 화면 넣기(W-7) — hmi:build 결과를 챔버K v2 저장소의 v2\hmi 로.
// 사용법: npm run hmi:copy -- "<챔버K v2 폴더>" [--from <빌드 폴더, 기본 dist-hmi>]
//         npm run hmi:copy -- --target ch12 "<Chamber.Total_program 폴더>" [--from <빌드 폴더, 기본 dist-hmi/ch12>]
// 대상(--target): chk(기본 — 인자 없으면 예전과 똑같이) · ch12(챔버12 — <폴더>\v2\ch12\local_server.py 확인, 빌드의 build.json target 이 ch12 여야 함).
// v2\hmi 를 비우고(.gitkeep 은 남김) 결과 파일과 build.json 을 넣은 뒤 sha256 을 다시 맞춰 본다.
// 챔버K 폴더 확인: <폴더>\v2\chk\local_server.py 와 <폴더>\v2\hmi 가 있어야 한다(엉뚱한 폴더를 비우지 않게).
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const TARGETS = {
  chk: { from: "dist-hmi", pkg: "chk", name: "챔버K v2" },
  ch12: { from: "dist-hmi/ch12", pkg: "ch12", name: "Chamber.Total_program(챔버12 v2)" },
};
const tAt = args.indexOf("--target");
const tName = tAt >= 0 && args[tAt + 1] ? args[tAt + 1] : "chk";
const T = TARGETS[tName];
if (!T) {
  console.error(`모르는 대상 --target ${tName} (${Object.keys(TARGETS).join("·")})`);
  process.exit(1);
}
const fromAt = args.indexOf("--from");
const from = resolve(root, fromAt >= 0 && args[fromAt + 1] ? args[fromAt + 1] : T.from);
const repo = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--from" && args[i - 1] !== "--target");
if (!repo) {
  console.error(tName === "chk" ? '사용법: npm run hmi:copy -- "<챔버K v2 폴더>" [--from dist-hmi]'
    : `사용법: npm run hmi:copy -- --target ${tName} "<${T.name} 폴더>" [--from ${T.from}]`);
  process.exit(1);
}
const target = join(resolve(repo), "v2", "hmi");
if (!existsSync(join(resolve(repo), "v2", T.pkg, "local_server.py")) || !existsSync(target)) {
  console.error(`${T.name} 폴더가 아님(v2\\${T.pkg}\\local_server.py·v2\\hmi 없음): ${repo}`);
  process.exit(1);
}
const info = JSON.parse(readFileSync(join(from, "build.json"), "utf8"));
if ((info.target ?? "chk") !== tName) {
  console.error(`빌드 대상이 다름 — ${from}\\build.json target ${info.target ?? "chk"}, 넣을 곳 ${tName}`);
  process.exit(1);
}

// 비우기 — 점으로 시작하는 파일(.gitkeep)은 남긴다
for (const n of readdirSync(target)) if (!n.startsWith(".")) rmSync(join(target, n), { recursive: true, force: true });

for (const f of [...info.files.map((x) => x.path), "build.json"]) {
  const dst = join(target, ...f.split("/"));
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(join(from, ...f.split("/")), dst);
}

// 넣은 것 확인 — 목록 그대로, sha256 같음
const bad = info.files.filter((x) => createHash("sha256").update(readFileSync(join(target, ...x.path.split("/")))).digest("hex") !== x.sha256);
const extra = [];
const walk = (d, pre = "") => {
  for (const n of readdirSync(d)) {
    const rel = pre ? `${pre}/${n}` : n;
    if (statSync(join(d, n)).isDirectory()) walk(join(d, n), rel);
    else if (!n.startsWith(".") && n !== "build.json" && !info.files.some((x) => x.path === rel)) extra.push(rel);
  }
};
walk(target);
if (bad.length || extra.length) {
  console.error(`확인 실패 — sha256 다름 ${bad.map((x) => x.path)} · 목록 밖 ${extra}`);
  process.exit(1);
}
console.log(`hmi → ${target}`);
for (const f of info.files) console.log(`  ${f.path.padEnd(32)} ${String(f.bytes).padStart(9)} B  ${f.sha256.slice(0, 12)}`);
console.log(`  build.json · vanam-process ${info.vanamProcess.commit.slice(0, 7)}${info.vanamProcess.clean ? "" : " (작업 트리에 바뀐 것 있음)"} · ${info.builtAt}`);
