// 챔버K 장비 고르기·장비 사용 켜기/끄기 시험(W-24 A) — npm run ops2:chk-devices
//  ① CHK Sputter 페이지 목록(lib/ops2/display.ts chkDeviceChoice): CH12·CHK2·CHK2-SIM 이 켜져 있으면 CHK·CHK-SIM 둘(고르기 상자),
//     CHK2-SIM 을 끄면 하나(상자 없음), 저장된 선택이 CH12·꺼진 장비면 CHK2
//  ② POST /api/ops2/admin/devices/[equipment]/enabled — 관리자만(아니면 403), 바꾸면 enabled·사건 한 줄(누가),
//     같은 값이면 사건 없음, 없는 장비 404. DB·로그인·SSE 는 메모리 대역(esbuild alias)으로 — 실제 DB 에 닿지 않는다.
//  ③ W-25 C1 POST /api/ops2/uplink/ingest 의 끝 표시("bye": true): 끝 표시 뒤 새 실행이 바로 받아들여짐, 끝 표시 없이 끊기면
//     지금과 같음(조용한 시간 전 409), 살아 있는 다른 실행이 있으면 여전히 409, 주인이 아닌 실행의 끝 표시는 주인을 비우지 않음.
//     주인 자리(lease)는 claimLease·releaseLease 의 SQL 조건을 그대로 옮긴 메모리 대역
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as esbuild from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cache = join(root, "node_modules", ".cache", "ops2-chk-devices");
mkdirSync(cache, { recursive: true });
// 대역 모듈 — 장비 행·사건·세션은 globalThis.__t 에서
const mocks = {
  "@/lib/ops2/db": `export const ops2Db = {
    async $transaction(fn) { return fn({
      async $queryRaw(_s, eq) { const d = globalThis.__t.devices[eq]; return d ? [{ enabled: d.enabled, holder_instance: d.holder ?? null }] : []; },
      ops2Device: { async update({ where, data }) { Object.assign(globalThis.__t.devices[where.equipment], data); } },
      ops2Event: { async create({ data }) { globalThis.__t.events.push(data); return data; } },
    }); },
  };`,
  "@/lib/auth-helpers": `export async function requireSession() { const s = globalThis.__t.session;
      return s ? { ok: true, session: s } : { ok: false, response: new Response(JSON.stringify({ error: "로그인" }), { status: 401 }) }; }
    export function isAdminSession(s) { const r = s?.user?.role; return r === "admin" || r === "ceo"; }`,
  "@/lib/ops2/hub": `export function eventEnvelope(r) { return { id: r.msgId }; } export function publishBrowser(eq, list) { globalThis.__t.published.push([eq, list.length]); }`,
  "next/server": `export const NextResponse = { json: (b, init) => new Response(JSON.stringify(b), { status: init?.status ?? 200, headers: { "content-type": "application/json" } }) };`,
};
const plugin = {
  name: "mocks",
  setup(b) {
    b.onResolve({ filter: /^(@\/lib\/ops2\/db|@\/lib\/auth-helpers|@\/lib\/ops2\/hub|next\/server)$/ }, (a) => ({ path: a.path, namespace: "mock" }));
    b.onLoad({ filter: /.*/, namespace: "mock" }, (a) => ({ contents: mocks[a.path], loader: "js" }));
  },
};
const out = join(cache, "t.mjs");
await esbuild.build({
  absWorkingDir: root, bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "warning", plugins: [plugin],
  tsconfig: join(root, "tsconfig.json"),
  stdin: { resolveDir: root, loader: "ts", contents:
    `export { chkDeviceChoice, isChkEquipment, showEquipment } from "./lib/ops2/display";
     export { POST } from "./app/api/ops2/admin/devices/[equipment]/enabled/route";` },
});
const M = await import(`${pathToFileURL(out).href}?t=${Date.now()}`);

const fails = [];
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) fails.push(`${name}: ${a} ≠ ${b}`); else console.log(`  ok  ${name}`);
};
const dev = (e) => ({ equipment: e, label: e === "CH12" ? "챔버 CH1&2" : "챔버K", runMode: e.endsWith("-SIM") ? "sim" : "prod" });
const names = (c) => c.list.map((d) => M.showEquipment(d.equipment));

console.log("① CHK Sputter 장비 목록");
const all3 = ["CH12", "CHK2", "CHK2-SIM"].map(dev);
let c = M.chkDeviceChoice(all3, null);
eq("셋 켜짐 → CHK·CHK-SIM", names(c), ["CHK", "CHK-SIM"]);
eq("셋 켜짐 → 고르기 상자", c.showPicker, true);
eq("셋 켜짐 → 처음은 CHK2", c.picked, "CHK2");
eq("저장된 선택 CH12 → CHK2", M.chkDeviceChoice(all3, "CH12").picked, "CHK2");
eq("저장된 선택 CHK2-SIM → 그대로", M.chkDeviceChoice(all3, "CHK2-SIM").picked, "CHK2-SIM");
const off = ["CH12", "CHK2"].map(dev);                         // 관리 화면에서 CHK2-SIM 사용 끄기
c = M.chkDeviceChoice(off, "CHK2-SIM");
eq("CHK2-SIM 끔 → CHK 하나", names(c), ["CHK"]);
eq("CHK2-SIM 끔 → 고르기 상자 없음", c.showPicker, false);
eq("CHK2-SIM 끔·저장된 선택 CHK2-SIM → CHK2", c.picked, "CHK2");
c = M.chkDeviceChoice(["CH12", "CHK2-SIM"].map(dev), "CH12");
eq("CHK2 꺼짐 → CHK-SIM", [c.picked, c.showPicker], ["CHK2-SIM", false]);
c = M.chkDeviceChoice([dev("CH12")], "CH12");
eq("챔버K 장비 없음 → 빈 목록", [c.list.length, c.picked], [0, null]);
eq("챔버K 판정", ["CHK2", "CHK2-SIM", "CH12", "CHK", "CHK3", "CHK2-SIMX"].map(M.isChkEquipment), [true, true, false, false, false, false]);

console.log("② 장비 사용 켜기·끄기(관리 화면)");
globalThis.__t = { devices: { CHK2: { enabled: true, holder: "inst-a" }, "CHK2-SIM": { enabled: true } }, events: [], published: [], session: null };
const call = async (equipment, body, role) => {
  globalThis.__t.session = role ? { user: { email: `${role}@vanam`, role } } : null;
  const req = new Request("http://x/api", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
  const r = await M.POST(req, { params: Promise.resolve({ equipment }) });
  return [r.status, await r.json()];
};
let r = await call("CHK2-SIM", { enabled: false }, "user");
eq("관리자 아님 → 403", r[0], 403);
eq("관리자 아님 → 그대로 켜짐", globalThis.__t.devices["CHK2-SIM"].enabled, true);
r = await call("CHK2-SIM", { enabled: false }, null);
eq("로그인 없음 → 401", r[0], 401);
r = await call("CHK2-SIM", { enabled: false }, "admin");
eq("관리자 끄기 → 200·바뀜", [r[0], r[1].changed, globalThis.__t.devices["CHK2-SIM"].enabled], [200, true, false]);
const ev = globalThis.__t.events.at(-1);
eq("사건 한 줄(누가·무엇)", [ev.code, ev.source, ev.kind, ev.message, ev.context.data.by], ["DEVICE_DISABLED", "web", "device_enabled", "장비 사용을 껐습니다(admin@vanam)", "admin@vanam"]);
eq("화면에 알림", globalThis.__t.published.length, 1);
r = await call("CHK2-SIM", { enabled: false }, "admin");
eq("같은 값 → 사건 없음", [r[0], r[1].changed, globalThis.__t.events.length], [200, false, 1]);
r = await call("CHK2-SIM", { enabled: true }, "ceo");
eq("ceo 켜기 → 사건 DEVICE_ENABLED", [r[0], globalThis.__t.devices["CHK2-SIM"].enabled, globalThis.__t.events.at(-1).code], [200, true, "DEVICE_ENABLED"]);
r = await call("NOPE", { enabled: false }, "admin");
eq("없는 장비 → 404", r[0], 404);
r = await call("CHK2", { enabled: "no" }, "admin");
eq("enabled 가 참·거짓이 아님 → 400", r[0], 400);

console.log("③ 정상 종료 끝 표시(bye) — 주인 자리");
{
  const lease = { holder: null, seen: null };
  globalThis.__lease = lease;
  const mocks2 = {
    "@/lib/ops2/ingest": `const L = () => globalThis.__lease; export const LEASE_MS = 30000;
      export async function claimLease(eq, inst, now) { const s = L();      // WHERE holder IS NULL OR = inst OR seen IS NULL OR seen < now − LEASE
        if (!s.holder || s.holder === inst || !s.seen || now.getTime() - s.seen > LEASE_MS) { const prev = s.holder; s.holder = inst; s.seen = now.getTime(); return { ok: true, prev }; }
        return { ok: false, holder: s.holder, quietMs: now.getTime() - s.seen }; }
      export async function releaseLease(eq, inst) { const s = L(); if (s.holder === inst) { s.holder = null; s.seen = null; return true; } return false; }
      export async function processIngest() { return { acked: [], needWebSchema: false, fallback: 0 }; }
      export const ingestMaxBytes = () => 1000000; export const sqlState = () => null; export const stripNul = (x) => x;`,
    "@/lib/ops2/db": `export const ops2Db = { ops2Device: { async findUnique() { return { tokenHash: "h", enabled: true }; } } };`,
    "@/lib/ops2/token": `export const tokenMatches = () => true;`,
    "@/lib/ops2/commands": `export async function commandsForPost() { return []; }`,
    "@/lib/ops2/body": `export async function readLimited(req) { return req.text(); }`,
    "next/server": mocks["next/server"],
  };
  const plugin2 = {
    name: "mocks2",
    setup(b) {
      b.onResolve({ filter: /^(@\/lib\/ops2\/(ingest|db|token|commands|body)|next\/server)$/ }, (a) => ({ path: a.path, namespace: "m2" }));
      b.onLoad({ filter: /.*/, namespace: "m2" }, (a) => ({ contents: mocks2[a.path], loader: "js" }));
    },
  };
  const out2 = join(cache, "ingest.mjs");
  await esbuild.build({ absWorkingDir: root, bundle: true, format: "esm", platform: "node", outfile: out2, logLevel: "warning", plugins: [plugin2],
    tsconfig: join(root, "tsconfig.json"), stdin: { resolveDir: root, loader: "ts", contents: `export { POST } from "./app/api/ops2/uplink/ingest/route";` } });
  const I = await import(`${pathToFileURL(out2).href}?t=${Date.now()}`);
  const post = async (instance, bye) => {
    const body = { equipment: "CHK2", instance, schemaHash: "s", messages: [], ...(bye ? { bye: true } : {}) };
    const r = await I.POST(new Request("http://x/ingest", { method: "POST", body: JSON.stringify(body), headers: { authorization: "Bearer t" } }));
    return r.status;
  };
  eq("실행 A 연결", await post("A"), 200);
  eq("A 살아 있음 → 새 실행 B 409", await post("B"), 409);
  eq("끝 표시 없이 끊김 → B 는 여전히 409(조용한 시간 전 — 지금과 같음)", await post("B"), 409);
  eq("주인이 아닌 B 의 끝 표시 → 409·A 그대로", [await post("B", true), lease.holder], [409, "A"]);
  eq("A 정상 종료 끝 표시 → 200·주인 비움", [await post("A", true), lease.holder], [200, null]);
  eq("끝 표시 뒤 새 실행 C 바로 받아들여짐", [await post("C"), lease.holder], [200, "C"]);
  eq("C 살아 있음 → D 409", await post("D"), 409);
  lease.seen -= 31000;                                          // 조용한 시간이 지나면 넘겨받음(지금 규칙 그대로)
  eq("C 가 31 s 조용 → D 넘겨받음", [await post("D"), lease.holder], [200, "D"]);
}

if (fails.length) {
  console.log(`다름 ${fails.length}개`);
  for (const f of fails) console.log(`  ${f}`);
  process.exit(1);
}
console.log("장비 고르기·사용 켜기/끄기 시험 통과");
