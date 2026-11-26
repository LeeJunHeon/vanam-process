// 챔버K 설정 기준 어긋남 시험(W-23 F) — npm run ops2:chk-config
// 프로그램 판이 바뀌어 묶음 paramSchemaHash·키가 웹 기준 행과 달라졌을 때 웹이 할 일(lib/ops2/configDrift.ts — ingest·설정 API 가 쓴다):
//   ① 기본값 바뀜(정의 해시만 다름) → 기준 행 자동 생성  ② 키 늘어남(기준 행에 없는 키) → 자동 생성(없는 키 목록)
//   ③ 적용·되돌리기 대기 중 → 자동으로 만들지 않고 화면 띠. 그리고 맞을 때·옛 행(해시 없음)은 어긋남 없음,
//   자동 기준 행 사건이 평소 보기 한 줄(알림에는 넣지 않음). 하나라도 다르면 exit 1.
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as esbuild from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cache = join(root, "node_modules", ".cache", "ops2-chk-config");
mkdirSync(cache, { recursive: true });
const out = join(cache, "config.mjs");
await esbuild.build({
  absWorkingDir: root, bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "warning",
  tsconfig: join(root, "tsconfig.json"),
  stdin: { resolveDir: root, loader: "ts", contents: `export * from "./lib/ops2/configDrift"; export { chkLines, alertLines } from "./components/ops2/chk/logView";` },
});
const M = await import(`${pathToFileURL(out).href}?t=${Date.now()}`);

const fails = [];
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) fails.push(`${name}: ${a} ≠ ${b}`);
  else console.log(`  ok  ${name}`);
};
const params = (keys) => keys.map((k) => ({ key: k, scope: k === "UPLINK_TOKEN" ? "secret" : "process", current: 1, stored: 1 }));
const row = (hash, keys) => ({ version: 7, paramSchemaHash: hash, paramValues: Object.fromEntries(keys.map((k) => [k, 1])) });
const KEYS = ["FLOW_STABILIZE_SEC", "GAS_STABILIZE_SEC", "UPLINK_TOKEN"];
const base = row("H1", KEYS.filter((k) => k !== "UPLINK_TOKEN"));

console.log("설정 기준 어긋남(W-23 F)");
// 맞음 — 같은 해시·같은 키(비밀값은 행에 없어도 됨)
eq("같은 판 → 어긋남 없음", M.baseDrift(base, { paramSchemaHash: "H1", params: params(KEYS) }), null);
eq("같은 판 → 할 일 없음", M.autoResyncAction(M.baseDrift(base, { paramSchemaHash: "H1", params: params(KEYS) }), null), "none");
// ① 기본값 바뀜 — 키는 같고 정의 해시만 다름
const d1 = M.baseDrift(base, { paramSchemaHash: "H2", params: params(KEYS) });
eq("① 기본값 바뀜 → 정의 다름", d1, { schema: true, missing: [] });
eq("① 기본값 바뀜 → 기준 행 자동 생성", M.autoResyncAction(d1, null), "create");
eq("① 메모", M.autoResyncNote(d1, 7), "프로그램이 새 판으로 바뀌어 노트북 프로그램 설정으로 기준을 다시 만들었습니다(설정 정의가 바뀜, 장비 v7)");
// ② 키 늘어남 — 기준 행에 없는 키(옛 행이라 해시가 없어도 잡는다)
const d2 = M.baseDrift(row(null, ["FLOW_STABILIZE_SEC", "GAS_STABILIZE_SEC"]), { paramSchemaHash: "H3", params: params([...KEYS, "ZERO_WAIT_MAX_SEC", "KEEP_AWAKE"]) });
eq("② 키 늘어남 → 없는 키", d2, { schema: false, missing: ["ZERO_WAIT_MAX_SEC", "KEEP_AWAKE"] });
eq("② 키 늘어남 → 기준 행 자동 생성", M.autoResyncAction(d2, null), "create");
eq("② 메모", M.autoResyncNote(d2, null), "프로그램이 새 판으로 바뀌어 노트북 프로그램 설정으로 기준을 다시 만들었습니다(새 설정 2개, 장비 v?)");
// ③ 적용 대기 중 — 자동으로 만들지 않고 띠
eq("③ 적용 대기 중 → 띠만", M.autoResyncAction(d1, 8), "banner");
eq("③ 되돌리기 대기 중(키 늘어남) → 띠만", M.autoResyncAction(d2, 9), "banner");
// 옛 행(해시 없음)·키 같음 — 어긋남으로 보지 않는다(옛 기록 때문에 기준을 새로 만들지 않는다)
eq("옛 행 해시 없음·키 같음 → 어긋남 없음", M.baseDrift(row(null, ["FLOW_STABILIZE_SEC", "GAS_STABILIZE_SEC"]), { paramSchemaHash: "H9", params: params(KEYS) }), null);
eq("기준 행 없음 → 어긋남 없음", M.baseDrift(null, { paramSchemaHash: "H9", params: params(KEYS) }), null);
eq("띠 글", M.DRIFT_TEXT, "프로그램이 새 판으로 바뀌어 설정 기준이 맞지 않습니다");
eq("만든 이", M.AUTO_RESYNC_BY, "자동 — 프로그램 판 바뀜");

// 자동 기준 행 사건 — 평소 보기 한 줄(출처 설정 · 이름 설정 기준), 알림에는 넣지 않는다(정보)
const ts = new Date().toISOString();
const feed = [{ id: "web-1", instance: "i", seq: 0, ts, type: "event",
  data: { level: "info", code: M.AUTO_RESYNC_CODE, ruleId: null, message: M.autoResyncNote(d1, 7),
          context: { source: "web", kind: "config_base", data: { version: 8, from: 7, deviceVersion: 7, schema: true, missing: [] } } } }];
const [l] = M.chkLines(null, feed);
eq("사건 줄", { main: l.main, source: l.source, kind: l.kind, text: l.text }, { main: true, source: "설정", kind: "기준 자동 생성", text: "프로그램 판이 바뀜 · 기준 v8" });
eq("알림에는 없음", M.alertLines(null, feed, Date.now()).length, 0);

if (fails.length) {
  console.log(`다름 ${fails.length}개`);
  for (const f of fails) console.log(`  ${f}`);
  process.exit(1);
}
console.log("설정 기준 어긋남 시험 통과");
