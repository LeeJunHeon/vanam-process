// 합성 장비 — 챔버K v2 장비 연결(POST {URL}/ingest)을 시험한다. 계약: 챔버K v2 common/messages.py.
// 사용법: OPS2_FAKE_TOKEN=<토큰> node scripts/ops2-fake-device.mjs <시나리오> [인자]
//   환경변수 OPS2_FAKE_URL(기본 http://127.0.0.1:3000/process/api/ops2/uplink)
//            OPS2_FAKE_EQUIPMENT(기본 TEST-SIM) · OPS2_FAKE_INSTANCE(기본 fake-0001 — 본문 instance, lease 주인)
// 시나리오
//   hello            hello(묶음 없음) + state
//   summary          1분 요약 규칙(공정 중만 저장) + 같은 묶음 다시 + run_end 를 먼저 보낸 run
//   bad              틀린 envelope 이 섞인 묶음
//   big [바이트]     상한보다 큰 본문(기본 2.2 MB) → 413
//   bench [개수]     메시지 N 개(기본 500) 한 묶음 처리 시간
//   nul              문자열(키·값)에 NUL 이 든 사건·state → 지운 채 저장
//   check            정수 범위·시각 범위 검사(seq 2147483648·1800년 → bad, stepNo 범위 밖 → null)
//   fault [코드] [개수]  사건 N 개(기본 500) 중 하나의 code 를 바꿔 두 번 보낸다(로컬 DB 시험용 트리거와 함께)
//   post [장비 ID]   빈 묶음 하나(인증·lease 확인용)
// 토큰은 화면에 찍지 않는다.
import { randomUUID } from "node:crypto";

const URL_BASE = process.env.OPS2_FAKE_URL ?? "http://127.0.0.1:3000/process/api/ops2/uplink";
const TOKEN = process.env.OPS2_FAKE_TOKEN ?? "";
const EQUIPMENT = process.env.OPS2_FAKE_EQUIPMENT ?? "TEST-SIM";
const BODY_INSTANCE = process.env.OPS2_FAKE_INSTANCE ?? "fake-0001";

const uid = () => randomUUID().replace(/-/g, "");
const iso = (ms) => new Date(ms).toISOString();
let seq = 0;

function env(type, data, tsMs = Date.now(), instance = BODY_INSTANCE) {
  return { id: uid(), instance, seq: ++seq, ts: iso(tsMs), type, data };
}

async function post(messages, { equipment = EQUIPMENT, raw } = {}) {
  const body = raw ?? JSON.stringify({ equipment, instance: BODY_INSTANCE, schemaHash: "fake", messages });
  const t0 = performance.now();
  const res = await fetch(`${URL_BASE}/ingest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body,
  });
  const ms = performance.now() - t0;
  const json = await res.json().catch(() => null);
  return { status: res.status, json, ms, bytes: Buffer.byteLength(body) };
}

function show(label, r) {
  const acked = Array.isArray(r.json?.acked) ? r.json.acked.length : "-";
  const extra = r.json && !Array.isArray(r.json?.acked) ? ` ${JSON.stringify(r.json)}` : "";
  console.log(`${label}: HTTP ${r.status} · acked ${acked}${r.json?.needWebSchema ? " · needWebSchema" : ""}` +
              ` · ${Math.round(r.ms)} ms · ${r.bytes} B${extra}`);
}

const hello = (extra = {}) => env("hello", {
  equipment: EQUIPMENT, instance: BODY_INSTANCE, program: "fake-device", version: "fake@0000000", runMode: "sim",
  schemaHash: "fake", configVersion: 0, snapshotColumns: ["seq"], commandKinds: [], writesAllowed: false,
  deviceUtc: iso(Date.now()), webSchemaHash: "fake-web-schema", ...extra,
});
const state = () => env("state", { procState: "IDLE", heater: {}, snapshot: { seq: 1 }, alarms: [], links: {},
                                   configVersion: 0, left: {}, uplink: { enabled: true } });
const summary = (fromMs, inst) => env("snapshot_summary", {
  from: iso(fromMs), to: iso(fromMs + 60_000), rows: 60, values: { "dc.p": { last: 1, mean: 1, min: 1, max: 1 } },
  quality: { dc: { okRatio: 1, maxAge: 0.2 } },
}, fromMs + 60_000, inst);

const scenarios = {
  async hello() {
    show("hello+state", await post([hello(), state()]));
  },

  async summary() {
    const inst = `fake-run-${uid().slice(0, 8)}`;           // 이 시나리오만의 실행(다른 시험과 섞이지 않게)
    const T = Math.floor(Date.now() / 60_000) * 60_000 - 10 * 60_000;   // 10분 전 정각 분
    const r1 = `r1${uid().slice(0, 10)}`;
    const msgs = [
      summary(T - 60_000, inst),                                          // [T−1m,T)  공정 전 → 버림
      env("run_start", { runId: r1, recipeName: "fake", by: "fake", name: "행1", stepNo: 1, params: {}, blocks: [],
                         configVersion: 0 }, T + 30_000, inst),
      env("event", { level: "info", code: "FAKE_IN_RUN", message: "run 안 사건(run_id 없음 → 열린 run)" }, T + 40_000, inst),
      summary(T, inst),                                                   // [T,T+1m)   저장
      summary(T + 60_000, inst),                                          // [T+1m,T+2m) 저장
      env("run_end", { runId: r1, result: "done", reasonCode: null, summary: { name: "행1" } }, T + 140_000, inst),
      summary(T + 120_000, inst),                                         // [T+2m,T+3m) 저장(끝 T+2m20s)
      summary(T + 180_000, inst),                                         // [T+3m,T+4m) 버림
      env("event", { level: "info", code: "FAKE_AFTER_RUN", message: "run 뒤 사건 → run 없음" }, T + 200_000, inst),
    ];
    console.log(`instance ${inst} · T ${iso(T)} · run ${r1} · 메시지 ${msgs.length}개(요약 5 — 저장 기대 3)`);
    show("1차", await post(msgs));
    show("같은 묶음 다시", await post(msgs));
    const r2 = `r2${uid().slice(0, 10)}`;
    show("run_end 먼저", await post([env("run_end", { runId: r2, result: "aborted", reasonCode: "USER_STOP", summary: {} },
                                         T + 300_000, inst)]));
    show("run_start 나중", await post([env("run_start", { runId: r2, name: "행2", stepNo: 2, params: {}, configVersion: 0 },
                                           T + 240_000, inst)]));
    console.log(`확인: run ${r1}·${r2} 각 한 행, ops2_summary instance ${inst} 3행`);
  },

  async bad() {
    const good1 = env("event", { level: "info", code: "FAKE_GOOD", message: "정상 1" });
    const good2 = env("event", { level: "warn", code: "FAKE_GOOD", message: "정상 2" });
    const noField = env("event", { level: "info", message: "code 빠짐" });
    const unknown = env("weird_type", {});
    const badTs = { ...env("event", { level: "info", code: "X", message: "ts 틀림" }), ts: "어제" };
    const noSeq = { ...env("event", { level: "info", code: "X", message: "seq 없음" }) };
    delete noSeq.seq;
    const wrongEquip = hello({ equipment: "OTHER" });
    const msgs = [good1, noField, unknown, badTs, noSeq, wrongEquip, "문자열", { type: "event" }, good2];
    console.log(`메시지 ${msgs.length}개 — 정상 2, 틀림 7(id 있는 것 5 + id 없는 것 2) · 기대 acked 7`);
    show("bad", await post(msgs));
  },

  async big(bytes = "2200000") {
    const n = Number(bytes);
    show(`big ${n}`, await post(null, { raw: JSON.stringify({ equipment: EQUIPMENT, instance: BODY_INSTANCE,
                                                              messages: [{ pad: "x".repeat(n) }] }) }));
  },

  async bench(count = "500") {
    const n = Number(count);
    const inst = `fake-bench-${uid().slice(0, 8)}`;
    const msgs = [];
    for (let i = 0; i < n; i++) {
      msgs.push(i % 10 === 9
        ? env("cmd_result", { cmdId: `bench-${uid().slice(0, 12)}`, kind: "BUZZ_STOP", status: "accepted",
                              reasonCode: null, source: "hmi", by: "local", detail: "bench" }, Date.now(), inst)
        : env("event", { level: "info", code: "FAKE_BENCH", message: `bench ${i}`, context: { source: "fake", kind: "bench" } },
              Date.now(), inst));
    }
    msgs.push(state());
    show(`bench ${n}(새것)`, await post(msgs));
    show(`bench ${n}(같은 것 다시)`, await post(msgs));
  },

  async nul() {
    const ev = env("event", { level: "info", code: "FAKE_NUL", message: "NUL\u0000 사건",
                              context: { source: "fake", kind: "nul", "k\u0000ey": "v\u0000al", data: { s: "a\u0000b" } } });
    const st = env("state", { procState: "IDLE", snapshot: { seq: 1, note: "x\u0000y" }, alarms: [], uplink: {} });
    console.log(`event ${ev.id} · state ${st.id} — 문자열에 NUL`);
    show("nul", await post([ev, st]));
  },

  async check() {
    const bigSeq = { ...env("event", { level: "info", code: "FAKE_CHECK", message: "seq 범위 밖" }), seq: 2147483648 };
    const oldTs = { ...env("event", { level: "info", code: "FAKE_CHECK", message: "1800년" }), ts: "1800-01-01T00:00:00Z" };
    const runId = `rc${uid().slice(0, 10)}`;
    const run = env("run_start", { runId, name: "stepNo 범위 밖", stepNo: 2147483648, params: {}, configVersion: 0 });
    const good = env("event", { level: "info", code: "FAKE_CHECK", message: "정상" });
    console.log(`bad 기대 ${bigSeq.id}·${oldTs.id} · run ${runId}(stepNo null 기대) · 정상 ${good.id}`);
    show("check", await post([bigSeq, oldTs, run, good]));
    show("run_end", await post([env("run_end", { runId, result: "done", summary: {} })]));
  },

  // fault [코드] [개수] — 사건 N 개 중 하나(가운데)의 code 를 바꾼다(로컬 시험용 트리거와 함께). 같은 묶음을 두 번 보낸다.
  async fault(code = "FAULT_TEST", count = "500") {
    const n = Number(count);
    const inst = `fake-fault-${uid().slice(0, 8)}`;
    const msgs = [];
    for (let i = 0; i < n; i++) {
      msgs.push(env("event", { level: "info", code: i === Math.floor(n / 2) ? code : "FAKE_FAULT", message: `fault ${i}` },
                    Date.now(), inst));
    }
    console.log(`instance ${inst} · 사건 ${n}개 중 1개 ${code}`);
    show("1차", await post(msgs));
    show("같은 묶음 다시", await post(msgs));
  },

  async post(equipment = EQUIPMENT) {
    show(`post ${equipment}`, await post([], { equipment }));
  },
};

const [name, ...args] = process.argv.slice(2);
if (!scenarios[name]) {
  console.error(`시나리오: ${Object.keys(scenarios).join(" · ")}`);
  process.exit(1);
}
if (!TOKEN) console.error("(OPS2_FAKE_TOKEN 없음 — 401 이 정상)");
await scenarios[name](...args);
