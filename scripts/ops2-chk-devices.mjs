// 챔버K 장비 고르기·장비 사용 켜기/끄기 시험(W-24 A)·끊김 표시(W-26) — npm run ops2:chk-devices
//  ① CHK Sputter 페이지 목록(lib/ops2/display.ts chkDeviceChoice): CH12·CHK2·CHK2-SIM 이 켜져 있으면 CHK·CHK-SIM 둘(고르기 상자),
//     CHK2-SIM 을 끄면 하나(상자 없음), 저장된 선택이 CH12·꺼진 장비면 CHK2
//  ② POST /api/ops2/admin/devices/[equipment]/enabled — 관리자만(아니면 403), 바꾸면 enabled·사건 한 줄(누가),
//     같은 값이면 사건 없음, 없는 장비 404. DB·로그인·SSE 는 메모리 대역(esbuild alias)으로 — 실제 DB 에 닿지 않는다.
//  ③ W-25 C1 POST /api/ops2/uplink/ingest 의 끝 표시("bye": true): 끝 표시 뒤 새 실행이 바로 받아들여짐, 끝 표시 없이 끊기면
//     지금과 같음(조용한 시간 전 409), 살아 있는 다른 실행이 있으면 여전히 409, 주인이 아닌 실행의 끝 표시는 주인을 비우지 않음.
//     주인 자리(lease)는 claimLease·releaseLease 의 SQL 조건을 그대로 옮긴 메모리 대역
//  ④ W-26 끊기면 지금 값은 "—"(lib/ops2/chk/conn showsNow·blindState): 운전 대시보드 CHK 박스 — 9 s 는 값, 11 s·15 시간은 네 칸 "—"·단위 없음·
//     상태 칩 한 줄이 칩 하나("끊김 — 지금 상태를 모름"). CHK 화면 장비 박스·HMI·추세 — 끊김(connected=false)이면 압력·Ar·RF For·TC1·TC2·IG
//     값 "—", 셔터·MV 는 '모름', 추세 선(지난 값)은 그대로. 노트북 화면 stream 끊김도 같은 결과, 다시 붙으면 값이 돌아온다
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

console.log("④ W-26 끊기면 지금 값은 '—'");
{
  const out3 = join(cache, "ui.mjs");
  await esbuild.build({
    absWorkingDir: root, bundle: true, format: "esm", platform: "node", outfile: out3, jsx: "automatic", logLevel: "warning",
    tsconfig: join(root, "tsconfig.json"), external: ["react", "react-dom", "react/jsx-runtime", "lucide-react"],
    define: { "process.env.NEXT_PUBLIC_BASE_PATH": '""' },
    stdin: { resolveDir: root, loader: "ts", contents: `
      export { showsNow, blindState } from "./lib/ops2/chk/conn";
      export { ChkBox } from "./components/OpsDashboardPage";
      export { VacuumCard, ShutterCard, GasCard, PowerCard, HeaterCard, IgCard } from "./components/ops2/chk/Chk2Devices";
      export { default as Chk2Hmi } from "./components/ops2/chk/Chk2Hmi";
      export { default as Chk2Trend } from "./components/ops2/chk/Chk2Trend";
      export { Chk2ModeContext } from "./components/ops2/chk/mode";
      export { StopButtons } from "./components/ops2/chk/Chk2Status";` },
  });
  const U = await import(`${pathToFileURL(out3).href}?t=${Date.now()}`);
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { createElement: h } = await import("react");
  const { readFileSync } = await import("node:fs");
  const B = JSON.parse(readFileSync(join(root, "lib/ops2/chk/golden/web_feed_cases.json"), "utf8")).bundle;
  const textOf = (html) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
  const render = (C, props, mode = {}) => renderToStaticMarkup(h(U.Chk2ModeContext.Provider, { value: { local: false, hmiKinds: [], detail: false, ...mode } }, h(C, props)));
  const snapNow = {
    "mfc.pressure_mtorr": 3.21, "mfc.ar_sccm": 20.4, "mfc.ar_set": 20, "mfc.ar_on": true, "mfc.o2_sccm": 0, "mfc.o2_set": 0, "mfc.o2_on": false,
    "mfc.sp_active": 1, "mfc.sp_sel_mtorr": 3.2, "mfc.valve_pct": 42.5,
    "rf.fwd_w": 101.5, "rf.ref_w": 1.2, "rf.set_w": 100, "rf.cmd_on": true, "rf.uncommanded": false, "rf.out_on": true,
    "heater.pv": 151.2, "heater.pv2": 149.8, "heater.sv": 150, "heater.run": true, "heater.mv": 1200, "heater.itl": true, "heater.ctrl_mode": "tc1", "heater.bias": 0.5,
    "ig.ion_torr": 2.5e-6, "ig.filament": true, "ig.emission": true, "ig.degas": false, "ig.ion_state": "ok",
    "plc.ms": true, "plc.s1": false, "plc.s2": false, "plc.mv": true, "plc.turbo": true, "plc.rotary": true, "plc.mv_interlock": true,
    "plc.rv": false, "plc.fv": true, "plc.vent": false, "plc.air": true, "plc.g1": true, "plc.g2": true, "plc.atm": false, "plc.water": true,
    "dc.out": false, "dc.p": 0, "rfp.out_on": false, "rfp.fwd_w": 0, "rfp.itl_open": false,
  };
  const stNow = {
    procState: "PROCESS", runId: "r1", step: { no: 3, total: 8, type: "rf_power", label: "RF", remainS: 120 }, snapshot: snapNow,
    links: { plc: { q: "ok", age: 0.2 }, mfc: { q: "ok" }, rf: { q: "ok" }, heater: { q: "ok" }, ig: { q: "ok" }, dc: { q: "off" }, rfp: { q: "ok" } },
    alarms: [], adjust: null,
  };
  // 대시보드 — 마지막 state 의 나이(웹 시계 기준 · 시계 차 0)
  // 끊기면 내린 칩은 자리만 남긴다(invisible·aria-hidden — data-dash-chips="hidden") — 보이는 글에서는 뺀다
  const HIDDEN = /<div[^>]*data-dash-chips="hidden"[^>]*>[\s\S]*?<\/div>/;
  const dashHtml = (ageMs) => renderToStaticMarkup(h(U.ChkBox, {
    d: { state: { ts: new Date(Date.now() - ageMs).toISOString(), data: stNow }, bundle: B, offsetMs: 0, hello: { runMode: "sim", web: { clockSkewMs: 0 } }, runs: [] },
    onState: () => {},
  }));
  const dash = (ageMs) => textOf(dashHtml(ageMs).replace(HIDDEN, ""));
  const UNIT = /mTorr|sccm|°C|\d W\b/;
  const chips = (t) => ["진공", "셔터", "인터락", "활성 알람", "RF 명령 없이"].filter((w) => t.includes(w));
  const d9 = dash(9_000);
  eq("대시보드 9 s(늦음) — 값·단위 그대로", ["3.21 mTorr", "20.4 sccm", "101.5 W", "151.2 °C"].map((x) => d9.includes(x)), [true, true, true, true]);
  eq("대시보드 9 s — 상태 칩 그대로, 끊김 칩 없음", [chips(d9).length >= 4, d9.includes("끊김 — 지금 상태를 모름")], [true, false]);
  for (const [name, ms] of [["11 s", 11_000], ["15 시간", 15 * 3600_000]]) {
    const t = dash(ms);
    eq(`대시보드 ${name} — 네 칸 "—"·단위 없음·제목 뒤 목표/꺼짐 없음`,
      [(t.match(/—/g) ?? []).length, UNIT.test(t), /· 목표|· 꺼짐/.test(t), ["3.21", "20.4", "101.5", "151.2"].some((x) => t.includes(x))], [5, false, false, false]);
    eq(`대시보드 ${name} — 상태 칩은 "끊김 — 지금 상태를 모름" 하나`, [chips(t), t.includes("끊김 — 지금 상태를 모름")], [[], true]);
    const html = dashHtml(ms);
    eq(`대시보드 ${name} — 내린 칩은 자리만(보이지 않음·읽기 도구 숨김 — 칩 줄 높이 그대로)`,
      [HIDDEN.test(html), /data-dash-chips="hidden"[^>]*/.test(html) && /class="[^"]*invisible[^"]*" aria-hidden="true" data-dash-chips="hidden"/.test(html)], [true, true]);
    eq(`대시보드 ${name} — 머리 칩·지난 공정 줄·버튼 그대로`, [t.includes("미연결"), t.includes("지난 공정"), t.includes("CHK Sputter 열기")], [true, true, true]);
  }
  // CHK 화면 — Chk2Page 가 connected=false 면 blindState 로 넘긴다(노트북 화면은 stream 이 끊겨도 같다)
  eq("규칙 — 늦음 3 s·9 s 는 보임, 10 s 까지 보임, 11 s·없음은 아님", [3000, 9000, 10000, 11000, null].map((a) => U.showsNow(a)), [true, true, true, false, false]);
  eq("규칙 — 노트북 stream 끊김이면 나이가 짧아도 아님", [U.showsNow(2000, 10000, false), U.showsNow(2000, 10000, true)], [false, true]);
  const lock = () => null, onAsk = () => {};
  const cards = (st) => {
    const ctx = { bundle: B, st, snap: st?.snapshot, lock, onAsk };
    return {
      gas: textOf(render(U.GasCard, ctx)), rf: textOf(render(U.PowerCard, { ...ctx, name: "rf" })), heater: textOf(render(U.HeaterCard, ctx)),
      ig: textOf(render(U.IgCard, ctx)), shut: textOf(render(U.ShutterCard, { ...ctx, onHmi: () => {} })), vac: textOf(render(U.VacuumCard, { ...ctx, onHmi: () => {} })),
    };
  };
  const nowWords = /열림|닫힘|켜짐|꺼짐|감지|없음/;
  for (const [name, connected] of [["웹 장비 끊김", U.showsNow(11_000)], ["노트북 stream 끊김", U.showsNow(2000, 10000, false)]]) {
    const st = connected ? stNow : U.blindState(stNow);
    const c = cards(st);
    eq(`${name} — 압력·Ar·RF For·TC1·TC2·IG 값 없음`,
      [c.gas.includes("3.21"), c.gas.includes("20.4"), c.rf.includes("101.5"), c.heater.includes("151.2"), c.heater.includes("149.8"), /2\.50E-0?6/.test(c.ig)],
      [false, false, false, false, false, false]);
    eq(`${name} — 값 자리는 "—"`, [c.gas, c.rf, c.heater, c.ig].map((t) => t.includes("—")), [true, true, true, true]);
    eq(`${name} — 셔터·MV·진공 상태는 '모름'(열림·닫힘·켜짐·꺼짐으로 그리지 않음)`,
      [c.shut.includes("모름"), nowWords.test(c.shut.replace(/셔터 모두 닫힘/g, "")), c.vac.includes("모름"), nowWords.test(c.vac)], [true, false, true, false]);
    eq(`${name} — RF 출력 칩·히터 운전 칩 내림`, [c.rf.includes("출력 켜짐"), /운전 모름|모름/.test(c.heater), /\b정지\b|운전 켜짐/.test(c.heater)], [false, true, false]);
    const hmi = render(U.Chk2Hmi, { bundle: B, snapshot: st.snapshot, links: st.links, plcOk: false, lockOf: () => "장비 끊김", pending: {}, onAsk, note: "장비가 끊겨 조작 잠금" });
    eq(`${name} — HMI 그림은 점선 회색(모름), 열림·닫힘 글 없음(범례 빼고)`, [hmi.includes('stroke-dasharray="3 3"'), /열림|닫힘/.test(textOf(hmi).replace(/열림·켜짐|닫힘·꺼짐|열린 배관/g, "")), textOf(hmi).includes("모름")], [true, false, true]);
  }
  // 칸 모양 — 끊겨도 마지막으로 받은 줄 구성 그대로(값이 있던 열·히터 제어 구조), 줄 수가 연결 때와 같다
  const rows = (html) => (html.match(/<(span|div)[^>]*class="[^"]*(justify-between)[^"]*"/g) ?? []).length;
  for (const [nm, C, extra] of [["진공", U.VacuumCard, { onHmi: () => {} }], ["히터", U.HeaterCard, {}], ["가스·압력", U.GasCard, {}], ["Ion Gauge", U.IgCard, {}]]) {
    const on = render(C, { bundle: B, st: stNow, snap: stNow.snapshot, lock, onAsk, ...extra });
    const bst = U.blindState(stNow);
    const off = render(C, { bundle: B, st: bst, snap: bst.snapshot, lock, onAsk, ...extra });
    eq(`끊김 — ${nm} 박스 줄 수 그대로`, rows(off), rows(on));
  }
  const tc2 = { ...stNow, snapshot: { ...snapNow, "heater.ctrl_mode": "tc2", "heater.casc_state": "running", "heater.sv2": 150, "heater.bias": null } };
  const hOn = textOf(render(U.HeaterCard, { bundle: B, st: tc2, snap: tc2.snapshot, lock, onAsk }));
  const hb = U.blindState(tc2), hOff = textOf(render(U.HeaterCard, { bundle: B, st: hb, snap: hb.snapshot, lock, onAsk }));
  eq("끊김 — 히터 TC2 단독 제어: TC2 편차·제어 방식 줄은 남고 글은 '—'(제어 방식 이름·보정 줄 없음)",
    [hOn.includes("TC2 편차"), hOff.includes("TC2 편차"), hOff.includes("제어 방식"), /TC2 단독|TC2 제어/.test(hOff), hOff.includes("보정")], [true, true, true, false, false]);
  const bl = U.blindState(stNow);
  eq("끊김 — 공정 상태·단계·run 은 마지막으로 받은 것(진행 줄은 회색), 원래 state 는 그대로", [bl.procState, bl.step, bl.runId, bl.blind, stNow.snapshot["mfc.pressure_mtorr"], bl.links],
    [stNow.procState, stNow.step, "r1", true, 3.21, { dc: { q: "off" } }]);
  // 추세 — 선(지난 값)은 그대로, 오른쪽 띠의 마지막 값 글만 "—"
  const t0 = Date.now() - 60_000;
  const trend = Array.from({ length: 20 }, (_, i) => ({ t: t0 + i * 2000, v: { "mfc.pressure_mtorr": 3.21, "mfc.sp_sel_mtorr": 3.2, "rf.fwd_w": 101.5, "heater.pv": 151.2 } }));
  const tr = (blind) => render(U.Chk2Trend, { trend, equipment: "CHK2", runId: null, local: false, nowMs: t0 + 40_000, pressureTarget: "mfc.sp_sel_mtorr", fitLegend: true, edgeTicks: true, blind });
  const tOn = tr(false), tOff = tr(true);
  const paths = (x) => (x.match(/<path d="M[^"]+"/g) ?? []).length;
  eq("추세 — 끊겨도 선 수 그대로(지난 값)", [paths(tOff), paths(tOff) === paths(tOn) && paths(tOn) > 0], [paths(tOn), true]);
  eq("추세 — 끊기면 마지막 값 글 '—'(연결 때는 값)", [textOf(tOn).includes("3.21"), textOf(tOff).includes("3.21"), textOf(tOff).includes("101.5"), textOf(tOff).includes("—")], [true, false, false, true]);
  // 정지 버튼 — 끊겨 잠기면 자물쇠가 버튼 그림 자리에(그림 수가 같아 390 폭에서 줄을 넘지 않음)
  const icons = (lk) => (render(U.StopButtons, { lock: () => lk, onAsk }).match(/<svg/g) ?? []).length;
  eq("정지 버튼 — 잠김·풀림 그림 수 같음(버튼마다 하나)", [icons(null), icons("장비 끊김")], [3, 3]);
  // 다시 붙음 — 같은 state 를 그대로 넘기면 값이 돌아온다
  const back = cards(U.showsNow(1000) ? stNow : U.blindState(stNow));
  eq("다시 붙음 — 압력·Ar·RF For·TC1·TC2 값, MS 열림·MV 열림", [back.gas.includes("3.21"), back.gas.includes("20.4"), back.rf.includes("101.5"), back.heater.includes("151.2"),
    back.heater.includes("149.8"), back.shut.includes("열림"), back.vac.includes("열림")], [true, true, true, true, true, true, true]);
  const d1 = dash(1000);
  eq("다시 붙음 — 대시보드 값·칩 돌아옴", [d1.includes("3.21 mTorr"), d1.includes("끊김 — 지금 상태를 모름"), chips(d1).length >= 4], [true, false, true]);
}

if (fails.length) {
  console.log(`다름 ${fails.length}개`);
  for (const f of fails) console.log(`  ${f}`);
  process.exit(1);
}
console.log("장비 고르기·사용 켜기/끄기·끊김 표시 시험 통과");
