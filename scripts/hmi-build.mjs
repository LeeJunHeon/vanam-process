// 노트북 로컬 화면 빌드(W-7) — hmi/main.tsx 를 esbuild 로 JS 하나, hmi/index.css 를 Tailwind(@tailwindcss/postcss)로 CSS 하나,
// index.html 하나. 파일 이름에 내용 해시. 소스맵 없음, 외부 주소(CDN·글꼴) 요청 없음(시스템 글꼴).
// 사용법: npm run hmi:build [-- --out <폴더>]   (기본 dist-hmi/ — .gitignore)
// 결과 폴더에 build.json(vanam-process 커밋 SHA·작업 트리 깨끗한지·빌드 시각·esbuild·tailwind 버전·파일 목록과 sha256)도.
// 웹 앱(next build)·Docker 이미지와는 따로 — 이 스크립트만 hmi/ 를 읽는다.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const outArg = args.indexOf("--out");
const out = resolve(root, outArg >= 0 && args[outArg + 1] ? args[outArg + 1] : "dist-hmi");
if (out === root || !relative(root, out) || relative(out, root) === "") throw new Error(`출력 폴더가 저장소 자체: ${out}`);

const sha = (b) => createHash("sha256").update(b).digest("hex");
const git = (...a) => execFileSync("git", a, { cwd: root, encoding: "utf8" }).trim();

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "assets"), { recursive: true });

// ── JS ──
const js = await esbuild.build({
  absWorkingDir: root,
  entryPoints: { app: "hmi/main.tsx" },
  bundle: true, minify: true, format: "esm", target: ["es2020", "chrome100", "edge100"], platform: "browser",
  outdir: join(out, "assets"), entryNames: "[name]-[hash]", sourcemap: false, legalComments: "none",
  jsx: "automatic", tsconfig: join(root, "tsconfig.json"), metafile: true, logLevel: "warning",
  define: { "process.env.NODE_ENV": '"production"', "process.env.NEXT_PUBLIC_BASE_PATH": '""' },
});
const jsFile = Object.keys(js.metafile.outputs).find((f) => f.endsWith(".js"));

// ── CSS ──
const cssSrc = join(root, "hmi", "index.css");
const css = await postcss([tailwind({ base: root, optimize: { minify: true } })]).process(readFileSync(cssSrc, "utf8"), { from: cssSrc });
// 머리 주석의 주소만 뺀다(라이선스 표시는 남김) — 결과물에 외부 주소 문자열이 없게
const cssText = css.css.replace(/(\/\*![^*]*?) \| https?:\/\/[^ *]+( \*\/)/, "$1$2");
const cssName = `app-${sha(cssText).slice(0, 8).toUpperCase()}.css`;
writeFileSync(join(out, "assets", cssName), cssText);

// ── index.html ──
const jsName = jsFile.split("/").pop();
writeFileSync(join(out, "index.html"), `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>챔버K v2 — 노트북 화면</title>
<link rel="stylesheet" href="/assets/${cssName}">
</head>
<body>
<div id="root"></div>
<script type="module" src="/assets/${jsName}"></script>
</body>
</html>
`);

// ── build.json ──
const files = [];
const walk = (d) => {
  for (const n of readdirSync(d).sort()) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p);
    else if (n !== "build.json") {
      const b = readFileSync(p);
      files.push({ path: relative(out, p).replaceAll("\\", "/"), bytes: b.length, sha256: sha(b) });
    }
  }
};
walk(out);
const req = createRequire(import.meta.url);
const info = {
  what: "챔버K v2 노트북 로컬 화면(vanam-process hmi/ — W-7)",
  vanamProcess: { commit: git("rev-parse", "HEAD"), branch: git("rev-parse", "--abbrev-ref", "HEAD"),
                  clean: git("status", "--porcelain") === "" },
  builtAt: new Date().toISOString(),
  esbuild: esbuild.version,
  tailwindcss: JSON.parse(readFileSync(req.resolve("tailwindcss/package.json"), "utf8")).version,
  files,
};
writeFileSync(join(out, "build.json"), JSON.stringify(info, null, 1) + "\n");

console.log(`hmi 빌드 → ${out}`);
for (const f of files) console.log(`  ${f.path.padEnd(32)} ${String(f.bytes).padStart(9)} B  ${f.sha256.slice(0, 12)}`);
console.log(`  커밋 ${info.vanamProcess.commit.slice(0, 7)}${info.vanamProcess.clean ? "" : " (작업 트리에 바뀐 것 있음)"} · esbuild ${info.esbuild} · tailwind ${info.tailwindcss}`);
