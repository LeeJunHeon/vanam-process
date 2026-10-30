// 합성 장비 — 챔버12(CH1&2) v2 장비 연결(POST {URL}/ingest·GET {URL}/stream)을 개발 중에 확인한다. 계약은 챔버K 와 같다
// (장비 Chamber.Total_program v2/common/messages.py) + 챔버12 선택 칸(hello.chambers, run_*.chamber·owner·recipeRev,
// event context.chamber·origin, state.chambers{ch1,ch2,pc,tsp}·state.engines, snapshot_summary.runIds — 장비 v2/ch12/hub.py·uplink.py).
// 사용법: OPS2_FAKE_TOKEN=<토큰> node scripts/ops2-fake-device-ch12.mjs <시나리오> [인자]
//   환경변수 OPS2_FAKE_URL(기본 http://127.0.0.1:3000/process/api/ops2/uplink) · OPS2_FAKE_EQUIPMENT(기본 CH12-SIM)
//            OPS2_FAKE_INSTANCE(기본 fake-ch12-0001) · OPS2_FAKE_RUNMODE(기본 sim — prod 로 하면 구글챗 outbox 가 queued 가 된다;
//            웹훅 주소가 없으면 skipped "주소 없음") · OPS2_FAKE_BUNDLE(장비 웹 묶음 JSON 파일 — 있으면 hello 에 webSchema 로 싣는다.
//            만들기: cd Chamber.Total_program && python3 -c "from v2.ch12 import web_schema as W; import json; print(json.dumps(W.bundle()))" > b.json)
// 시나리오
//   hello              hello(chambers, 묶음 OPS2_FAKE_BUNDLE 이 있으면 webSchema) + state(chambers·engines)
//   run                CH1·CH2 동시 공정 — run_start 둘, 챔버별 사건·shared 사건, snapshot_summary(runIds), CH1 done·CH2 error
//                      (ops2_run.chamber·owner·recipe_rev, 사건 run_id 가 챔버별, ops2_summary.run_ids 확인)
//   chat               구글챗 카드가 되는 장비 이벤트 묶음(시작·집계 오류·실패 이유·종료·장비 오류 E301·PC·TSP·히터·PLC 링크·카메라)
//   resume             재시작·이어가기 결과(event kind resumed · run_end PROGRAM_RESTART)
//   stream [초] [reply] 명령 SSE 를 열어 받은 것을 찍는다(reply 면 cmd_result accepted 로 답함)
//   poll [초] [reply]  1 s 마다 빈 POST(state 포함) — 응답 commands 를 찍고 reply 면 답한다
//   post               빈 묶음 하나(인증·lease 확인용)
// 토큰은 화면에 찍지 않는다.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const URL_BASE = process.env.OPS2_FAKE_URL ?? "http://127.0.0.1:3000/process/api/ops2/uplink";
const TOKEN = process.env.OPS2_FAKE_TOKEN ?? "";
const EQUIPMENT = process.env.OPS2_FAKE_EQUIPMENT ?? "CH12-SIM";
const INSTANCE = process.env.OPS2_FAKE_INSTANCE ?? "fake-ch12-0001";
const RUN_MODE = process.env.OPS2_FAKE_RUNMODE ?? "sim";
const BUNDLE = process.env.OPS2_FAKE_BUNDLE ? JSON.parse(readFileSync(process.env.OPS2_FAKE_BUNDLE, "utf8")) : null;
const CHAMBERS = ["ch1", "ch2", "pc", "tsp"];

const uid = () => randomUUID().replace(/-/g, "");
const iso = (ms) => new Date(ms).toISOString();
let seq = 0;
const env = (type, data, tsMs = Date.now()) => ({ id: uid(), instance: INSTANCE, seq: ++seq, ts: iso(tsMs), type, data });

async function post(messages) {
  const body = JSON.stringify({ equipment: EQUIPMENT, instance: INSTANCE, schemaHash: "fake-ch12", messages });
  const t0 = performance.now();
  const res = await fetch(`${URL_BASE}/ingest`, {
    method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }, body,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json, ms: performance.now() - t0, bytes: Buffer.byteLength(body) };
}
function show(label, r) {
  const acked = Array.isArray(r.json?.acked) ? r.json.acked.length : "-";
  const extra = r.json && !Array.isArray(r.json?.acked) ? ` ${JSON.stringify(r.json)}` : "";
  const cmds = r.json?.commands?.length ? ` · commands ${r.json.commands.map((c) => `${c.id}(${c.kind})`).join(", ")}` : "";
  console.log(`${label}: HTTP ${r.status} · acked ${acked}${r.json?.needWebSchema ? " · needWebSchema" : ""}${cmds}` +
              ` · ${Math.round(r.ms)} ms · ${r.bytes} B${extra}`);
}

const hello = (withBundle = false) => env("hello", {
  equipment: EQUIPMENT, instance: INSTANCE, program: "fake-ch12", version: "fake@0000000", runMode: RUN_MODE,
  schemaHash: BUNDLE?.paramSchemaHash ?? "fake", configVersion: BUNDLE?.configVersion ?? 0, webSchemaHash: BUNDLE?.hash ?? "fake-ch12-web-schema",
  overriddenKeys: [], snapshotColumns: ["seq", "ch1.proc.state", "ch2.proc.state"], commandKinds: [], writesAllowed: false,
  deviceUtc: iso(Date.now()), chambers: CHAMBERS, ...(withBundle && BUNDLE ? { webSchema: BUNDLE } : {}),
});
const chamberState = (procState = "IDLE", runId = null, owner = null) => ({
  procState, runId, owner, recipeRev: runId ? 0 : null, step: runId ? { no: 3, total: 9, type: "main", label: "메인", elapsedS: 12, remainS: 48 } : null,
  remainS: runId ? 48 : null, etaRemainingS: runId ? 300 : null, minTotalS: runId ? 600 : null, paused: false, alarms: [],
});
const state = (ch = {}) => env("state", {
  procState: Object.values(ch).some((c) => c.runId) ? "BUSY" : "IDLE", runId: null,
  chambers: Object.fromEntries(CHAMBERS.map((c) => [c, ch[c] ?? chamberState()])),
  engines: { heater: { run: false, pv: 25.0 } }, heater: { run: false, pv: 25.0 }, alarms: [], links: { plc: { q: "ok", age: 0.1 } },
  configVersion: BUNDLE?.configVersion ?? 0, configPending: null, snapshot: { seq: 1 }, left: {}, stopping: null, uplink: { enabled: true },
});
/** 장비 hub 의 event — context {source, chamber, kind, origin, data} */
const event = (chamber, source, kind, message, { level = "info", code, data, ts } = {}) => env("event", {
  level, code: code ?? kind.toUpperCase(), ruleId: null, message,
  context: { source, chamber, kind, origin: chamber === "shared" ? source : `engine:${chamber}`, ...(data ? { data } : {}) },
}, ts);
const params = (name, extra = {}) => ({
  process_note: name, process_name: name, Process_name: name, shutter_delay: 5.0, process_time: 10.0, use_dc_power: true, dc_power: 100.0,
  use_g1: true, G1_target_name: "Ti", use_ar: true, ar_flow: 20.0, ...extra,
});

const scenarios = {
  async hello() {
    show(`hello(${BUNDLE ? "묶음 실음" : "묶음 없음"})+state`, await post([hello(true), state()]));
  },

  async run() {
    const T = Math.floor(Date.now() / 60_000) * 60_000 - 5 * 60_000;
    const r1 = `ch1-${uid().slice(0, 10)}`, r2 = `ch2-${uid().slice(0, 10)}`;
    const msgs = [
      hello(),
      env("run_start", { runId: r1, chamber: "ch1", recipeName: "fake-ch1", by: "web", name: "CH1 Ti", stepNo: 1, params: params("CH1 Ti"),
                         blocks: [], configVersion: 0, owner: "web", recipeRev: 0 }, T + 10_000),
      env("run_start", { runId: r2, chamber: "ch2", recipeName: "fake-ch2", by: "robot", name: "CH2 Cu", stepNo: 1,
                         params: params("CH2 Cu", { use_dc_pulse: true, dc_pulse_power: 200.0, dc_pulse_freq: 100, dc_pulse_off_time: 2.0 }),
                         blocks: [], configVersion: 0, owner: "robot", recipeRev: 0 }, T + 12_000),
      event("ch1", "process", "block", "3 main", { ts: T + 20_000 }),
      event("ch2", "process", "adjust", "dcpulse.power 200 → 210 (ok)", { ts: T + 25_000 }),
      event("shared", "plc", "conn_change", "PLC 연결 상태(공유 — run 에 붙지 않음)", { ts: T + 26_000 }),
      env("snapshot_summary", { runId: r2, runIds: { ch1: r1, ch2: r2 }, from: iso(T + 60_000), to: iso(T + 120_000), rows: 60,
                                values: { "ch1.ig.p": { last: 1e-6, mean: 1e-6, min: 1e-6, max: 1e-6 } }, quality: { plc: { okRatio: 1, maxAge: 0.2 } } },
          T + 120_000),
      env("run_end", { runId: r1, chamber: "ch1", result: "done", reasonCode: null, summary: { name: "CH1 Ti" } }, T + 150_000),
      event("ch2", "process", "chat", "⚠️ CH2 DC Pulse 과전류 차단 → 전체 공정 중단 | overcurrent", { level: "warn", code: "CHAT", ts: T + 160_000 }),
      event("ch2", "process", "chat", "❌ CH2 공정 실패 이유: overcurrent", { level: "warn", code: "CHAT", ts: T + 161_000 }),
      env("run_end", { runId: r2, chamber: "ch2", result: "error", reasonCode: "E571", summary: { name: "CH2 Cu" } }, T + 162_000),
      state(),
    ];
    console.log(`CH1 run ${r1} · CH2 run ${r2} · 메시지 ${msgs.length}개`);
    show("1차", await post(msgs));
    show("같은 묶음 다시", await post(msgs));
    console.log("확인: ops2_run 두 행(chamber ch1·ch2, owner web·robot), block 사건 run_id=CH1, adjust 사건 run_id=CH2, conn_change run_id 없음,");
    console.log("      ops2_summary run_ids [CH1, CH2]·run_id CH2, ops2_chat_outbox 시작 2·종료 2·집계 1·실패 이유 1(모드 sim 이면 skipped)");
  },

  async chat() {
    const r = `ch1-${uid().slice(0, 10)}`;
    const pc = (api, data, level = "info") => event("pc", "process", "card", api, { level, code: "CARD", data: { ...data, api, chat: "PC" } });
    const msgs = [
      hello(),
      event("ch1", "process", "chat", "Gate 체크 실패: CLOSE 아님 → 공정 시작 차단 (공정: P1)", { level: "error", code: "E301" }),
      env("run_start", { runId: r, chamber: "ch1", name: "P1", stepNo: 1, params: params("P1"), owner: "local", recipeRev: 0 }),
      event("ch1", "process", "chat", "⚠️ CH1 DC1 Power OFF 실패 - 출력 상태 미확인 (켜져 있을 가능성 있음). 전원 장비 출력과 PLC D/A(SET/WRITE)를 즉시 확인하세요.",
            { level: "warn", code: "CHAT" }),
      env("run_end", { runId: r, chamber: "ch1", result: "aborted", reasonCode: "USER_STOP", summary: { name: "P1" } }),
      pc("notify_process_started", { payload: { process_note: "Plasma Cleaning", process_time: 10.0, use_rf_power: true, rf_power: 150.0,
                                                prefix: "CH1 Plasma Cleaning", ch: 1 }, flush: true }),
      pc("notify_process_finished_detail", { ok: true, payload: { process_name: "Plasma Cleaning", prefix: "CH1 Plasma Cleaning", ch: 1,
                                                                  status: "success", stopped: false }, flush: true }),
      event("shared", "tsp_engine", "card", "started", { data: { card: "started", params: { process_note: "TSP run: target=5.000e-07, cycles=3" } } }),
      event("shared", "tsp_engine", "card", "finished", { data: { card: "finished", ok: true, detail: { process_name: "TSP", reason: null } } }),
      event("ch2", "heater", "card", "수동", { data: { title: "[CH2] 히터 시작", subtitle: "수동", status: "INFO", fields: { 목표: "300.0°C" }, urgent: true } }),
      event("shared", "plc", "link_down", "[CH1&2] PLC 연결 끊김", { level: "warn", data: { card: { title: "PLC 연결 끊김",
            subtitle: "[CH1&2] PLC 연결 끊김 (192.168.1.2:502) | 감지 10:00:00 | 사유=reset", status: "FAIL" } } }),
      event("shared", "camera", "disk_low", "디스크 여유 부족(12.0GB < 20.0GB) — 이번 공정 영상 미기록", { level: "warn", code: "DISK_LOW" }),
      state(),
    ];
    console.log(`모드 ${RUN_MODE} — 카드가 될 이벤트 ${msgs.length - 2}개(prod 가 아니면 outbox 는 모두 skipped "보내지 않음")`);
    show("chat", await post(msgs));
  },

  async resume() {
    const r = `ch2-${uid().slice(0, 10)}`;
    const msgs = [
      hello(),
      event("ch2", "process", "resumed", "복구됨(공백 14 s)", { data: { run_id: r, gap_s: 14.2, name: "CH2 Cu", block: { no: 4, label: "메인" },
            checks: [{ name: "gas", ok: true }, { name: "pressure", ok: true }] } }),
      env("run_end", { runId: `ch1-${uid().slice(0, 10)}`, chamber: "ch1", result: "error", reasonCode: "PROGRAM_RESTART",
                       summary: { name: "CH1 Ti", detail: { gap_s: 95, checks: [{ name: "power_output", ok: false, detail: "DC 출력 꺼짐" }] } } }),
      state(),
    ];
    show("resume", await post(msgs));
  },

  async stream(seconds = "60", mode = "") {
    const t0 = Date.now();
    const at = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), Number(seconds) * 1000);
    const q = new URLSearchParams({ equipment: EQUIPMENT, instance: INSTANCE });
    let res;
    try {
      res = await fetch(`${URL_BASE}/stream?${q}`, { headers: { Authorization: `Bearer ${TOKEN}`, "Accept-Encoding": "identity" }, signal: ac.signal });
    } catch (e) {
      console.log(`stream: 연결 실패 ${e.message}`);
      clearTimeout(timer);
      return;
    }
    console.log(`${at()} stream: HTTP ${res.status} ${res.headers.get("content-type")} (instance ${INSTANCE})`);
    if (res.status !== 200) {
      console.log(await res.text());
      clearTimeout(timer);
      return;
    }
    const dec = new TextDecoder();
    let buf = "";
    try {
      for await (const chunk of res.body) {
        buf += dec.decode(chunk, { stream: true });
        let i;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const block = buf.slice(0, i);
          buf = buf.slice(i + 2);
          if (block.startsWith(":")) {
            console.log(`${at()} ${block}`);
            continue;
          }
          const data = /^data: (.*)$/m.exec(block)?.[1];
          const cmd = data ? JSON.parse(data) : null;
          console.log(`${at()} command ${cmd?.id} ${cmd?.kind} ${JSON.stringify(cmd?.args)} expiresAt ${cmd?.expiresAt}`);
          if (mode === "reply" && cmd) {
            show(`  cmd_result ${cmd.id}`, await post([env("cmd_result", { cmdId: cmd.id, kind: cmd.kind, status: "accepted", reasonCode: null,
                                                                          source: "web", by: cmd.requestedBy, detail: "fake-ch12" })]));
          }
        }
      }
      console.log(`${at()} stream: 웹이 닫음`);
    } catch (e) {
      console.log(`${at()} stream: ${ac.signal.aborted ? "시간 끝" : `끊김 ${e.message}`}`);
    } finally {
      clearTimeout(timer);
    }
  },

  async poll(seconds = "20", mode = "none") {
    const end = Date.now() + Number(seconds) * 1000;
    let out = [hello()];
    while (Date.now() < end) {
      const r = await post([...out, state()]);
      out = [];
      const cmds = r.json?.commands ?? [];
      if (r.status !== 200 || cmds.length) show("POST", r);
      if (mode === "reply") {
        for (const c of cmds) out.push(env("cmd_result", { cmdId: c.id, kind: c.kind, status: "accepted", reasonCode: null, source: "web",
                                                           by: c.requestedBy, detail: "fake-ch12" }));
      }
      await new Promise((ok) => setTimeout(ok, 1000));
    }
  },

  async post() {
    show(`post ${EQUIPMENT}`, await post([]));
  },
};

const [name, ...args] = process.argv.slice(2);
if (!scenarios[name]) {
  console.error(`시나리오: ${Object.keys(scenarios).join(" · ")}`);
  process.exit(1);
}
if (!TOKEN) console.error("(OPS2_FAKE_TOKEN 없음 — 401 이 정상)");
await scenarios[name](...args);
