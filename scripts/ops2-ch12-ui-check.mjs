// 챔버12(CH12) 화면·구글챗 동작 확인 — npm run ops2:ch12-ui [-- --repo <Chamber.Total_program 경로>] [-- --show <확인 이름>]
// 장비 저장소(Chamber.Total_program rewrite/v2 — 기본 ../Chamber.Total_program, 환경변수 CH12_REPO)의 sim 시험대(Ch12FullRig — 시뮬레이터·
// 실제 드라이버·실제 엔진·명령 처리 core·허브)를 python3 으로 몇 초(가상 시계) 돌려 장비 묶음(web_schema.bundle)·1초 state·사건을 받고,
//  1) 화면 부품(components/ops2/ch12 — 노트북 local 빌드와 같은 부품)을 esbuild 로 묶어 react-dom/server 로 그려 보이는 글·버튼·막힘을 본다
//     (v1 노트북 화면 동작의 v2 자리 — 장비 전수 목록 v2/ch12/spec/inv_ui.py 의 UI-### 가 이 확인 이름을 시험 칸에 적는다).
//  2) components/ops2/ch12/logic.ts 순수 함수(명령 이름·챔버 인자·상태·블록 조작·시간 글).
//  3) 구글챗: lib/ops2/ch12/chatCards.ts 가 v1 ChatNotifier 를 그대로 돌린 카드(아래 V1_EXTRA — 골든 317 경우에 없던 문구)와 같은가,
//     lib/ops2/chat.ts sendOne(가짜 DB·fetch — POST JSON·시간 제한·다시 보내기)·lib/ops2/ch12/chat.ts enqueueChatCh12(가짜 DB —
//     모드·주소·같은 묶음 중복 억제)·주소 환경변수 이름(inv_chat.py 의 CHAT-### 가 적는다).
// 새 의존성 없음(esbuild·react-dom 은 이미 devDependency·dependency). 묶은 파일은 node_modules/.cache/ops2-ch12-ui/(git 밖).
// 다른 것이 하나라도 있으면 exit 1. 장비 저장소가 없으면(포털만 받은 곳) 1)·2)의 장비 값 확인은 못 한다 — exit 2.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as esbuild from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const repo = resolve(arg("--repo") ?? process.env.CH12_REPO ?? join(root, "..", "Chamber.Total_program"));
const show = arg("--show");
const cache = join(root, "node_modules", ".cache", "ops2-ch12-ui");
mkdirSync(cache, { recursive: true });

// ───────────── 장비 sim 에서 묶음·state·사건 받기 ─────────────
const PY = String.raw`
import json, math, tempfile, sys
from pathlib import Path
from v2.common.clock import VirtualClock
from v2.common.commands import Source
from v2.ch12.sim.rig import Ch12FullRig
from v2.ch12 import web_schema as WS

def clean(o):
    if isinstance(o, float):
        return o if math.isfinite(o) else None
    if isinstance(o, dict):
        return {str(k): clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [clean(v) for v in o]
    if o is None or isinstance(o, (str, int, bool)):
        return o
    return str(o)

with tempfile.TemporaryDirectory() as tmp:
    c = VirtualClock(start_wall=1_760_000_000.0)
    c.register()
    rig = Ch12FullRig(c, Path(tmp), cfg={"CAMERA_MIN_FREE_GB": 0.0, "CH2_SUPPORTS_THICKNESS": True}, robot_api=False)
    assert rig.start()
    rig.loop.run(3)
    out = {"cmd": {}}
    def cmd(name, kind, args):
        r = rig.command(kind, args, source=Source.HMI)
        out["cmd"][name] = {"ok": r.ok, "reason": r.reason, "detail": r.detail}
    cmd("load", "RECIPE_LOAD", {"ch": 1, "rows": [{"#": "test", "Process_name": "T1", "time": "20s"}], "name": "ui-check"})
    cmd("start", "PROCESS_START", {"ch": 1})
    rig.loop.run(2)
    cmd("load2", "RECIPE_LOAD", {"ch": 2, "rows": [{"#": "test", "Process_name": "T2", "time": "20s"}], "name": "ui-check"})
    cmd("start2", "PROCESS_START", {"ch": 2})
    rig.loop.run(2)
    cmd("stop2", "PROCESS_STOP", {"ch": 2})
    rig.loop.run(4)
    cmd("start2_cooldown", "PROCESS_START", {"ch": 2})
    cmd("pre", "PRESPUTTER_RESERVE", {"ch": 2, "time": "06:30"})
    cmd("pre_bad", "PRESPUTTER_RESERVE", {"ch": 2, "time": "25:99"})
    cmd("pc_sel", "PC_SELECT_CH", {"ch": 2})
    cmd("power_select", "POWER_SELECT", {"on": True})
    rig.loop.run(3)
    h = rig.hub
    out["bundle"] = WS.bundle()
    out["state"] = h.last_state
    out["feed"] = [e for e in h.recent if e["type"] in ("event", "run_start", "run_end", "cmd_result")]
    rig.stop()
    c.close()
print(json.dumps(clean(out), ensure_ascii=False))
`;
if (!existsSync(join(repo, "v2", "ch12", "sim", "rig.py"))) {
  console.log(`장비 저장소가 없음: ${repo} (--repo 또는 CH12_REPO) — 화면 확인을 못 함`);
  process.exit(2);
}
const fx = JSON.parse(execFileSync("python3", ["-c", PY], {
  cwd: repo, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, env: { ...process.env, PYTHONPATH: repo },
}));
const bundle = fx.bundle;
const st = fx.state.data;
const feed = fx.feed;

// ───────────── 화면 부품 묶기(esbuild) ─────────────
const out = join(cache, "ui.mjs");
await esbuild.build({
  absWorkingDir: root, bundle: true, format: "esm", platform: "node", outfile: out, jsx: "automatic",
  tsconfig: join(root, "tsconfig.json"), external: ["react", "react-dom", "react/jsx-runtime", "lucide-react"], logLevel: "warning",
  define: { "process.env.NEXT_PUBLIC_BASE_PATH": '""' },
  stdin: {
    resolveDir: root, loader: "ts", contents: `
      export { default as Ch12Chamber } from "./components/ops2/ch12/Ch12Chamber";
      export { HeaterThicknessPanel, PcPanel, TspPanel, LoadLockPanel, RobotPanel } from "./components/ops2/ch12/Ch12Aux";
      export { PlcPanel, CmdForm } from "./components/ops2/ch12/Ch12Controls";
      export { EventFeed } from "./components/ops2/chk/Chk2Logs";
      export { RgaChart, rgaPoints } from "./components/ops2/ch12/Ch12Spectra";
      export { logLine } from "./components/ops2/chk/text";
      export * as L from "./components/ops2/ch12/logic";
      export * as T from "./components/ops2/ch12/types";
      export * as CC from "./lib/ops2/ch12/chatCards";`,
  },
});
const U = await import(`${pathToFileURL(out).href}?t=${Date.now()}`);
const { renderToStaticMarkup } = await import("react-dom/server");
const { createElement: h } = await import("react");
const L = U.L;

/** 그린 HTML → 글(태그 빼고, 공백 하나로) */
const textOf = (html) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ");
/** 버튼 글 → 막힘(disabled) 여부 */
function buttons(html) {
  const outB = {};
  for (const m of html.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)) outB[textOf(m[2]).trim()] = /\sdisabled=""/.test(m[1]);
  return outB;
}
const render = (C, props) => renderToStaticMarkup(h(C, props));
const can = () => true;
const noop = () => {};

const R = [];
const check = (name, cond, got) => R.push({ name, ok: !!cond, got });

// ───────────── 1) 화면(장비 sim 값) ─────────────
const kindsUsed = Object.entries(L.KINDS);
const kindsMissing = kindsUsed.filter(([, cands]) => !L.hasKind(bundle, cands)).map(([k]) => k);
check("ui:bundle-kinds — 화면 버튼이 부르는 명령이 장비 명령 표에 모두 있음", kindsMissing.length === 0, kindsMissing);

const chamberProps = (ch) => ({
  bundle, st, ch, connected: true, plcOk: true, allowed: () => true, canPlc: () => true, pending: {}, onAsk: noop, feed, skewMs: 0,
  mimicNote: "", nowMs: Date.parse(fx.state.ts), onEditSeq: noop,
});
{
  const html = render(U.Ch12Chamber, chamberProps("ch1"));
  const t = textOf(html), b = buttons(html);
  const cs = st.chambers.ch1;
  check("ui:chamber-running — 공정 중 상태 글·블록 n/전체·남은 시간·ETA, STOP 은 늘 눌림(v1 START/STOP 늘 활성)",
        cs.procState === "RUNNING" && t.includes(L.stateInfo(bundle, "RUNNING", "ch1").label) && t.includes("블록 1/1")
        && t.includes(L.clockOrDash(cs.remainS)) && t.includes("ETA(공정 끝까지)") && b["CH1 STOP"] === false,
        { procState: cs.procState, stop: b["CH1 STOP"], text: t.slice(0, 400) });
  check("ui:chamber-log — 이 챔버 사건만 로그(로그 줄 = 장비 시각 + 종류 + 글)",
        t.includes("로그") && feed.filter((e) => L.feedChamber(e) === "ch1").length > 0
        && feed.filter((e) => L.feedChamber(e) === "ch1").some((e) => t.includes(U.logLine(bundle, e).text)), t.slice(-600));
}
{
  const html = render(U.Ch12Chamber, chamberProps("ch2"));
  const t = textOf(html), b = buttons(html);
  check("ui:chamber-idle — 대기 중·공정 시작·적재 해제·오류 해제·STOP(늘 눌림)",
        t.includes("대기 중") && b["공정 시작"] === false && b["적재 해제"] === false && b["오류 해제"] === false && b["CH2 STOP"] === false,
        b);
  const pop = feed.find((e) => e.type === "event" && e.data.context?.kind === "popup" && e.data.context?.chamber === "ch2");
  const pl = pop && U.logLine(bundle, pop);
  check("ui:popup-line — v1 경고창(시작 가드 '대기 필요' 등)은 로그 줄(경고)로 — 문구 그대로, 시작은 COOLDOWN 거부",
        !!pop && pl.level === "warn" && pop.data.message.startsWith("이전 공정 종료 후 1분 대기 필요합니다.") && t.includes(pl.text.replace(/\s+/g, " "))
        && fx.cmd.start2_cooldown.reason === "COOLDOWN", { pop: pop?.data, cmd: fx.cmd.start2_cooldown });
  const blocks = (bundle.chambers.find((c) => c.id === "ch2").blocks ?? []).map((n) => bundle.snapshot.blocks.find((x) => x.name === n))
    .filter((x) => x && !["dcpulse", "rfpulse", "stm100", "oes", "rga", "dc", "rf"].includes(x.name.split(".").pop()));
  const labels = blocks.flatMap((x) => x.fields.slice(0, 2).map((f) => f.label));
  check("ui:chamber-values — 챔버 장비 1초 값 칸(묶음 chambers[].blocks 순서 — 접힌 칸 제외)", labels.length > 0 && labels.every((l) => t.includes(l)),
        labels.filter((l) => !t.includes(l)));
  check("ui:presputter — 프리스퍼터 예약·예약 취소 칸(시각 HH:MM), 장비가 매일 예약을 잡음·형식 오류는 TIME_FORMAT 거부",
        t.includes("프리스퍼터 예약") && t.includes("시각(HH:MM)") && "예약" in b && b["예약 취소"] === false
        && fx.cmd.pre.ok && fx.cmd.pre_bad.reason === "TIME_FORMAT" && fx.cmd.pre_bad.detail === "시간 형식 오류 (HH:MM)", fx.cmd);
}
{
  const html = render(U.HeaterThicknessPanel, { bundle, st, can, onAsk: noop, plcOk: true });
  const t = textOf(html), b = buttons(html);
  const pv = st.snapshot["ch2.heater.pv"];
  check("ui:heater-panel — CH2 히터 PV·SV·MV, 켜기/끄기(RUN 이면 끄기)·목표 적용·이상 리셋",
        typeof pv === "number" && t.includes(String(L.short(pv))) && b["히터 켜기"] === false && "목표 적용" in b
        && b["이상 리셋"] === false && st.heater?.run === false, { pv, b });
  check("ui:thickness-panel — 두께(ch2.thk)·STM-100(두께·증착률) 값, 두께 영점",
        t.includes("두께") && b["두께 영점"] === false && !!bundle.snapshot.blocks.find((x) => x.name === "ch2.stm100"), b);
}
{
  const html = render(U.PcPanel, { bundle, st, can, onAsk: noop });
  const b = buttons(html);
  check("ui:pc-panel — 플라즈마 클리닝 채널 선택·시작·정지·오류 해제(장비가 PC 실행 중 전환 거부)",
        "채널 선택" in b && b["클리닝 시작"] === false && b["클리닝 정지"] === false && b["오류 해제"] === false && fx.cmd.pc_sel.ok, b);
}
{
  const html = render(U.TspPanel, { bundle, st, can, onAsk: noop, nowMs: Date.parse(fx.state.ts) });
  const t = textOf(html), b = buttons(html);
  check("ui:tsp-panel — TSP 시작·정지·매일 예약(시각)", t.includes("매일 예약") && Object.keys(b).some((k) => k.includes("예약")), b);
}
{
  const html = render(U.LoadLockPanel, { bundle, st, plcOk: true, can, onAsk: noop });
  const b = buttons(html);
  const coil = bundle.plcButtons.find((x) => x.name === "SW_POWER_SELECT")?.coil;
  check("ui:loadlock-panel — Power Select(SW_POWER_SELECT 코일 215)·런타임 덤프",
        b["Power Select 보내기"] === false && b["런타임 덤프"] === false && coil === 215 && fx.cmd.power_select.ok, { b, coil });
}
{
  const html = render(U.RobotPanel, { bundle, st, can, onAsk: noop, feed });
  const t = textOf(html);
  check("ui:robot-panel — 로봇 연결 상태 칸(서버 페이지 자리)", t.includes("로봇"), t.slice(0, 300));
}
{
  const html = render(U.PlcPanel, { bundle, snapshot: st.snapshot, plcOk: true, canPress: () => true, pending: {}, onAsk: noop, note: "" });
  const t = textOf(html);
  check("ui:plc-buttons — 장비 PLC 버튼 전부(Power Select·부저 정지 포함)", bundle.plcButtons.length > 20
        && bundle.plcButtons.every((x) => t.includes(x.label)), bundle.plcButtons.filter((x) => !t.includes(x.label)).map((x) => x.label));
}
{
  const reasons = ["TIME_FORMAT", "LINK_DOWN", "CHANNEL_SWITCH_RUNNING", "COOLDOWN", "RUNNER_BUSY", "PC_RUNNING", "DUMP_BUSY",
                   "THICKNESS_BLOCKED", "HEATER_REJECTED", "NOT_SUPPORTED"];
  const miss = reasons.filter((c) => !bundle.reasons.some((r) => r.code === c && r.label));
  check("ui:cmd-reject-text — 거부 사유 코드마다 화면 이름(묶음 reasons)", miss.length === 0, miss);
}

{
  // RGA 그래프 — 장비 rga data 사건(드라이버 rga_link 'data' {mass_axis, pressures}) 마지막 것, v1 규칙으로 점 거름
  const ev = (ch, xs, ys) => ({ id: `r${ch}${xs.length}`, type: "event", ts: fx.state.ts, seq: 1, instance: "i",
    data: { level: "info", code: "DATA", message: "", context: { source: "rga", chamber: ch, kind: "data", data: { mass_axis: xs, pressures: ys } } } });
  const f = [ev("ch1", [1, 2, 18, 28, 70, 32], [1e-7, 0, 3e-8, NaN, 1e-6, 2e-9])];
  const html = render(U.RgaChart, { feed: f, ch: "ch1" });
  const pts = U.rgaPoints(f, "ch1");
  const kind = bundle.eventKinds?.find((k) => k.source === "rga" && k.kind === "data");
  check("ui:rga-chart — RGA 그래프(x Atomic Mass 0~65 눈금 14, y Partial Pressure 로그 1e-11~1e-5, 빨간 점+세로선; 비유한·범위 밖·y≤0 버림)",
        pts?.length === 3 && pts.map((p) => p.x).join() === "1,18,32" && (html.match(/<circle/g) ?? []).length === 3
        && html.includes("Atomic Mass") && html.includes("Partial Pressure") && html.includes("1e-11") && html.includes("1e-5")
        && render(U.RgaChart, { feed: f, ch: "ch2" }) === "" && !!kind, { pts, kind });
}

// ───────────── 2) logic.ts ─────────────
{
  const a = L.chArgs(bundle, "PRESPUTTER_RESERVE", "ch2", { time: "06:30", junk: 1 });
  const p = L.chArgs(bundle, "PROCESS_STOP", "ch1");
  check("ui:logic-args — 챔버 인자 ch 1|2(정수)·정의 밖 인자는 빼고 보냄", a.ch === 2 && a.time === "06:30" && !("junk" in a) && p.ch === 1,
        { a, p });
  const run = L.isRunning(bundle, st.chambers.ch1), idle = L.isRunning(bundle, st.chambers.ch2);
  const bc = L.blockControl(bundle, st.chambers.ch1);
  check("ui:logic-state — 진행 중 판단·블록 정의(건너뛰기·일시정지)·시간 글",
        run === true && idle === false && !!bc.def && L.clockOrDash(3725) === "1:02:05" && L.clockOrDash(65) === "1:05"
        && L.clockOrDash(null) === "—", { run, idle, bc: { skip: bc.skip, pause: bc.pause, why: bc.why } });
}

// ───────────── 3) 구글챗 ─────────────
// v1 ChatNotifier 를 그대로 돌린 카드(만든 법: 장비 저장소 v1 controller/chat_notifier.py 를 PySide6 자리표시로 import 해 아래 envs 와 같은
// 호출(notify_process_started·notify_error_with_src+flush·notify_process_finished_detail·notify_client_process)을 하고 _schedule_post 로
// 보낸 payload 를 잡음 — TZ=Asia/Seoul, 2026-10-30). 골든(lib/ops2/ch12/chat-golden) 317 경우에 없던 문구만.
const V1_EXTRA = {"_출처": {"v1": "Chamber.Total_program main controller/chat_notifier.py(ChatNotifier 그대로 실행)", "now": "2026-10-30T12:51:21Z"}, "cases": [{"name": "chat:v1-aggregate-lines", "now": "2026-10-30T12:51:21Z", "envs": [{"id": "8f24db4ec6cb46d798053e2236ce5622", "instance": "golden-0001", "seq": 1, "ts": "2026-10-30T12:51:21.000Z", "type": "run_start", "data": {"runId": "0c507775f2764da78d5d93553533f266", "chamber": "ch2", "name": "P1", "stepNo": 1, "params": {"process_note": "P1", "process_name": "P1", "Process_name": "P1", "use_dc_power": true, "dc_power": 100.0, "shutter_delay": 5.0, "process_time": 10.0, "use_g1": true, "G1_target_name": "Ti"}, "owner": "local", "recipeRev": 0}}, {"id": "f684d49863844f218c7c04989841622e", "instance": "golden-0001", "seq": 2, "ts": "2026-10-30T12:51:21.000Z", "type": "event", "data": {"level": "warn", "code": "CHAT", "ruleId": null, "message": "⚠️ CH2 DC Pulse OUTPUT OFF 실패 - 출력 상태 미확인 (켜져 있을 가능성 있음). 장비 패널의 HV/OUTPUT 상태를 즉시 확인하세요.", "context": {"source": "process", "chamber": "ch2", "kind": "chat", "origin": "engine:ch2"}}}, {"id": "aa754067a13b40cebf0baf3356470190", "instance": "golden-0001", "seq": 3, "ts": "2026-10-30T12:51:21.000Z", "type": "event", "data": {"level": "warn", "code": "CHAT", "ruleId": null, "message": "CH2 DC Pulse 저전류 감지 → 전체 공정 중단 | low_current: I <= 0.050A (3회 연속)", "context": {"source": "process", "chamber": "ch2", "kind": "chat", "origin": "engine:ch2"}}}, {"id": "67a64b5c186b4452a8c1a929c1d1eec7", "instance": "golden-0001", "seq": 4, "ts": "2026-10-30T12:51:21.000Z", "type": "event", "data": {"level": "warn", "code": "CHAT", "ruleId": null, "message": "CH2 DC Pulse 세트포인트 이탈(연속) 또는 P=0W 감지 → 전체 공정 중단 | setpoint dev", "context": {"source": "process", "chamber": "ch2", "kind": "chat", "origin": "engine:ch2"}}}, {"id": "a01bcafb385243d0903ee66f0f9902f0", "instance": "golden-0001", "seq": 5, "ts": "2026-10-30T12:51:21.000Z", "type": "event", "data": {"level": "warn", "code": "CHAT", "ruleId": null, "message": "⚠️ CH2 RF Pulse OFF 실패 - 출력 상태 미확인 (켜져 있을 가능성 있음). RF Pulse 장비의 출력 상태를 즉시 확인하세요.", "context": {"source": "process", "chamber": "ch2", "kind": "chat", "origin": "engine:ch2"}}}, {"id": "1909f8044d6b4dac89aba6f5bb50484e", "instance": "golden-0001", "seq": 6, "ts": "2026-10-30T12:51:21.000Z", "type": "event", "data": {"level": "warn", "code": "CHAT", "ruleId": null, "message": "⚠️ CH2 RF Power OFF 실패 - 출력 상태 미확인 (켜져 있을 가능성 있음). 전원 장비 출력과 PLC D/A(SET/WRITE)를 즉시 확인하세요.", "context": {"source": "process", "chamber": "ch2", "kind": "chat", "origin": "engine:ch2"}}}, {"id": "aadaa53ecfaa45468f331bbf31990f39", "instance": "golden-0001", "seq": 7, "ts": "2026-10-30T12:51:21.000Z", "type": "event", "data": {"level": "warn", "code": "CHAT", "ruleId": null, "message": "CH2 DC Power 출력 이상 → 전체 공정 중단 | low-power", "context": {"source": "process", "chamber": "ch2", "kind": "chat", "origin": "engine:ch2"}}}, {"id": "cae575f41dbc48f3bb0c4b6aeab8dbf3", "instance": "golden-0001", "seq": 8, "ts": "2026-10-30T12:51:21.000Z", "type": "event", "data": {"level": "warn", "code": "CHAT", "ruleId": null, "message": "⚠️ CH2 DC2 과전류 차단 → 전체 공정 중단 | overcurrent", "context": {"source": "process", "chamber": "ch2", "kind": "chat", "origin": "engine:ch2"}}}, {"id": "ce5804844e8e4ee1932de72e0283a372", "instance": "golden-0001", "seq": 9, "ts": "2026-10-30T12:51:21.000Z", "type": "event", "data": {"level": "warn", "code": "CHAT", "ruleId": null, "message": "⚠ 정리 중 DC Pulse 출력 OFF 미확인 — 장비 출력 상태 확인 필요", "context": {"source": "process", "chamber": "ch2", "kind": "chat", "origin": "engine:ch2"}}}], "expect": [{"cardsV2": [{"cardId": "notify-card", "card": {"header": {"title": "Sputter Controller", "subtitle": "Status Notification"}, "sections": [{"widgets": [{"textParagraph": {"text": "<b>ℹ️ 공정 시작</b>"}}, {"textParagraph": {"text": "CH2 · P1"}}, {"decoratedText": {"topLabel": "Chamber", "text": "CH2"}}, {"decoratedText": {"topLabel": "사용 Guns / 타겟", "text": "G1: Ti"}}, {"decoratedText": {"topLabel": "파워", "text": "DC1 100 W"}}, {"decoratedText": {"topLabel": "Shutter Delay", "text": "5분"}}, {"decoratedText": {"topLabel": "Process Time", "text": "10분"}}]}]}}]}, {"cardsV2": [{"cardId": "error-aggregate", "card": {"header": {"title": "Sputter Controller", "subtitle": "Status Notification"}, "sections": [{"widgets": [{"textParagraph": {"text": "<b>❌ 장비 오류</b>"}}, {"textParagraph": {"text": "• [DCPulse] ⚠️ CH2 DC Pulse OUTPUT OFF 실패 - 출력 상태 미확인 (켜져 있을 가능성 있음). 장비 패널의 HV/OUTPUT 상태를 즉시 확인하세요."}}]}]}}]}, {"cardsV2": [{"cardId": "error-aggregate", "card": {"header": {"title": "Sputter Controller", "subtitle": "Status Notification"}, "sections": [{"widgets": [{"textParagraph": {"text": "<b>❌ 장비 오류</b>"}}, {"textParagraph": {"text": "• [DCPulse] CH2 DC Pulse 저전류 감지 → 전체 공정 중단 | low_current: I <= 0.050A (3회 연속)"}}]}]}}]}, {"cardsV2": [{"cardId": "error-aggregate", "card": {"header": {"title": "Sputter Controller", "subtitle": "Status Notification"}, "sections": [{"widgets": [{"textParagraph": {"text": "<b>❌ 장비 오류</b>"}}, {"textParagraph": {"text": "• [DCPulse] CH2 DC Pulse 세트포인트 이탈(연속) 또는 P=0W 감지 → 전체 공정 중단 | setpoint dev"}}]}]}}]}, {"cardsV2": [{"cardId": "error-aggregate", "card": {"header": {"title": "Sputter Controller", "subtitle": "Status Notification"}, "sections": [{"widgets": [{"textParagraph": {"text": "<b>❌ 장비 오류</b>"}}, {"textParagraph": {"text": "• [RFPulse] ⚠️ CH2 RF Pulse OFF 실패 - 출력 상태 미확인 (켜져 있을 가능성 있음). RF Pulse 장비의 출력 상태를 즉시 확인하세요."}}]}]}}]}, {"cardsV2": [{"cardId": "error-aggregate", "card": {"header": {"title": "Sputter Controller", "subtitle": "Status Notification"}, "sections": [{"widgets": [{"textParagraph": {"text": "<b>❌ 장비 오류</b>"}}, {"textParagraph": {"text": "• [RF] ⚠️ CH2 RF Power OFF 실패 - 출력 상태 미확인 (켜져 있을 가능성 있음). 전원 장비 출력과 PLC D/A(SET/WRITE)를 즉시 확인하세요."}}]}]}}]}, {"cardsV2": [{"cardId": "error-aggregate", "card": {"header": {"title": "Sputter Controller", "subtitle": "Status Notification"}, "sections": [{"widgets": [{"textParagraph": {"text": "<b>❌ 장비 오류</b>"}}, {"textParagraph": {"text": "• [DC1] CH2 DC Power 출력 이상 → 전체 공정 중단 | low-power"}}]}]}}]}, {"cardsV2": [{"cardId": "error-aggregate", "card": {"header": {"title": "Sputter Controller", "subtitle": "Status Notification"}, "sections": [{"widgets": [{"textParagraph": {"text": "<b>❌ 장비 오류</b>"}}, {"textParagraph": {"text": "• [DC2] ⚠️ CH2 DC2 과전류 차단 → 전체 공정 중단 | overcurrent"}}]}]}}]}, {"cardsV2": [{"cardId": "error-aggregate", "card": {"header": {"title": "Sputter Controller", "subtitle": "Status Notification"}, "sections": [{"widgets": [{"textParagraph": {"text": "<b>❌ 장비 오류</b>"}}, {"textParagraph": {"text": "• [DC Pulse] ⚠ 정리 중 DC Pulse 출력 OFF 미확인 — 장비 출력 상태 확인 필요"}}]}]}}]}]}, {"name": "chat:v1-end-unknown-cause", "now": "2026-10-30T12:51:21Z", "envs": [{"id": "38553a4c3e4f48e0bfa996be566c2a46", "instance": "golden-0001", "seq": 10, "ts": "2026-10-30T12:51:21.000Z", "type": "run_start", "data": {"runId": "d10b1f0569284cb09989a22d49896db5", "chamber": "ch1", "name": "P1", "stepNo": 1, "params": {"process_note": "P1", "process_name": "P1", "Process_name": "P1", "use_dc_power": true, "dc_power": 100.0, "shutter_delay": 5.0, "process_time": 10.0, "use_g1": true, "G1_target_name": "Ti"}, "owner": "local", "recipeRev": 0}}, {"id": "5f5706dfdc214067a52be9ad8f8c613b", "instance": "golden-0001", "seq": 11, "ts": "2026-10-30T12:51:21.000Z", "type": "run_end", "data": {"runId": "d10b1f0569284cb09989a22d49896db5", "chamber": "ch1", "result": "error", "reasonCode": null, "summary": {"name": "P1"}}}], "expect": [{"cardsV2": [{"cardId": "notify-card", "card": {"header": {"title": "Sputter Controller", "subtitle": "Status Notification"}, "sections": [{"widgets": [{"textParagraph": {"text": "<b>ℹ️ 공정 시작</b>"}}, {"textParagraph": {"text": "CH1 · P1"}}, {"decoratedText": {"topLabel": "Chamber", "text": "CH1"}}, {"decoratedText": {"topLabel": "사용 Guns / 타겟", "text": "G1: Ti"}}, {"decoratedText": {"topLabel": "파워", "text": "DC1 100 W"}}, {"decoratedText": {"topLabel": "Shutter Delay", "text": "5분"}}, {"decoratedText": {"topLabel": "Process Time", "text": "10분"}}]}]}}]}, {"cardsV2": [{"cardId": "notify-card", "card": {"header": {"title": "Sputter Controller", "subtitle": "Status Notification"}, "sections": [{"widgets": [{"textParagraph": {"text": "<b>❌ 공정 종료</b>"}}, {"textParagraph": {"text": "CH1 · P1"}}, {"decoratedText": {"topLabel": "Chamber", "text": "CH1"}}, {"decoratedText": {"topLabel": "결과", "text": "오류로 종료"}}, {"decoratedText": {"topLabel": "공정 이름", "text": "P1"}}, {"decoratedText": {"topLabel": "원인", "text": "알 수 없음"}}]}]}}]}]}, {"name": "chat:v1-client-reject-unconfirmed", "now": "2026-10-30T12:51:21Z", "envs": [{"id": "6917e1b07bd647b4ba7573cf1a70efa6", "instance": "golden-0001", "seq": 12, "ts": "2026-10-30T12:51:21.000Z", "type": "event", "data": {"level": "info", "code": "CLIENT_PROCESS", "message": "finished", "context": {"source": "robot", "chamber": "shared", "kind": "client_process", "data": {"kind": "finished", "info": {"target": "CH1", "recipe_name": "r.csv", "row_count": 1, "result": "거절", "reason": "E205 이미 공정 중", "received_at": "2026-10-30T09:00:01", "finished_at": "2026-10-30T09:00:02", "request_id": "req-9"}}}}}, {"id": "d501644d21644348967d8185fb960edb", "instance": "golden-0001", "seq": 13, "ts": "2026-10-30T12:51:21.000Z", "type": "event", "data": {"level": "info", "code": "CLIENT_PROCESS", "message": "finished", "context": {"source": "robot", "chamber": "shared", "kind": "client_process", "data": {"kind": "finished", "info": {"target": "CH2", "result": "미확인", "reason": "", "started_at": "2026-10-30T08:00:00", "finished_at": "2026-10-30T08:30:00"}}}}}], "expect": [{"cardsV2": [{"cardId": "notify-card", "card": {"header": {"title": "Sputter Controller", "subtitle": "Status Notification"}, "sections": [{"widgets": [{"textParagraph": {"text": "<b>❌ 공정 에러</b>"}}, {"textParagraph": {"text": "CH1 · r"}}, {"decoratedText": {"topLabel": "구분", "text": "요청 거절 (시작 전)"}}, {"decoratedText": {"topLabel": "사유", "text": "E205 이미 공정 중"}}, {"decoratedText": {"topLabel": "대상", "text": "CH1"}}, {"decoratedText": {"topLabel": "레시피", "text": "r.csv (공정 1개)"}}, {"decoratedText": {"topLabel": "요청 시각", "text": "09:00:01"}}, {"decoratedText": {"topLabel": "시각", "text": "09:00:02"}}, {"decoratedText": {"topLabel": "request_id", "text": "req-9"}}]}]}}]}, {"cardsV2": [{"cardId": "notify-card", "card": {"header": {"title": "Sputter Controller", "subtitle": "Status Notification"}, "sections": [{"widgets": [{"textParagraph": {"text": "<b>❌ 공정 에러</b>"}}, {"textParagraph": {"text": "CH2 · —"}}, {"decoratedText": {"topLabel": "구분", "text": "종료 미확인"}}, {"decoratedText": {"topLabel": "사유", "text": "—"}}, {"decoratedText": {"topLabel": "대상", "text": "CH2"}}, {"decoratedText": {"topLabel": "레시피", "text": "—"}}, {"decoratedText": {"topLabel": "요청 시각", "text": "—"}}, {"decoratedText": {"topLabel": "시작 시각", "text": "08:00:00"}}, {"decoratedText": {"topLabel": "시각", "text": "08:30:00"}}]}]}}]}], "channel": "client"}]};
function same(a, b, path, o) {
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) { o.push(`${path}: 웹 ${JSON.stringify(a)?.slice(0, 300)} / v1 ${JSON.stringify(b)?.slice(0, 300)}`); return; }
    a.forEach((x, i) => same(x, b[i], `${path}[${i}]`, o));
    return;
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.join("|") !== kb.join("|")) o.push(`${path}: 키 웹 ${ka.join(",")} / v1 ${kb.join(",")}`);
    for (const k of new Set([...ka, ...kb])) same(a[k], b[k], `${path}.${k}`, o);
    return;
  }
  if (a !== b) o.push(`${path}: 웹 ${JSON.stringify(a)} / v1 ${JSON.stringify(b)}`);
}
for (const c of V1_EXTRA.cases) {
  const items = U.CC.buildCh12Items(c.envs, { now: new Date(c.now), skewMs: 0 }, U.CC.emptyState(), U.CC.DEFAULT_CFG);
  const sent = items.filter((i) => !i.skip).map((it, k) => [it, k]).sort((x, y) => (x[0].delayMs ?? 0) - (y[0].delayMs ?? 0) || x[1] - y[1])
    .map((x) => x[0]);
  const d = [];
  same(sent.map((i) => i.body), c.expect, "cards", d);
  if (c.channel) for (const i of sent) if (i.channel !== c.channel) d.push(`channel ${i.channel} ≠ ${c.channel}`);
  check(`${c.name} — v1 ChatNotifier 카드와 같음`, d.length === 0, d.slice(0, 6));
}

// 보내기·넣기 — 가짜 DB(메모리)·fetch 로 lib/ops2/chat.ts·lib/ops2/ch12/chat.ts 를 그대로 묶는다
const fakeDb = join(cache, "fake-db.mjs");
const { writeFileSync } = await import("node:fs");
writeFileSync(fakeDb, `
export const mem = { rows: [], device: null, nextId: 1 };
const match = (r, w = {}) => Object.entries(w).every(([k, v]) => {
  if (k === "AND") return v.every((x) => match(r, x));
  if (k === "payload") { const p = r.payload ?? {}; return p[v.path[0]] === v.equals; }
  if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) {
    if ("in" in v) return v.in.includes(r[k]);
    if ("gt" in v || "gte" in v || "lt" in v || "lte" in v) {
      const x = r[k] instanceof Date ? r[k].getTime() : r[k];
      const t = (y) => (y instanceof Date ? y.getTime() : y);
      return (!("gt" in v) || x > t(v.gt)) && (!("gte" in v) || x >= t(v.gte)) && (!("lt" in v) || x < t(v.lt)) && (!("lte" in v) || x <= t(v.lte));
    }
    return false;
  }
  return r[k] === v;
});
const sorted = (rows, o) => (o?.id === "desc" ? [...rows].reverse() : rows);
export const ops2Db = {
  ops2Device: { findUnique: async () => mem.device },
  ops2ChatOutbox: {
    findUnique: async ({ where }) => mem.rows.find((r) => (where.id !== undefined ? r.id === where.id : r.msgId === where.msgId)) ?? null,
    findFirst: async ({ where, orderBy }) => sorted(mem.rows.filter((r) => match(r, where)), orderBy)[0] ?? null,
    findMany: async ({ where, orderBy }) => sorted(mem.rows.filter((r) => match(r, where)), orderBy),
    count: async ({ where }) => mem.rows.filter((r) => match(r, where)).length,
    createMany: async ({ data }) => { let n = 0; for (const d of data) { if (mem.rows.some((r) => r.msgId === d.msgId)) continue;
      mem.rows.push({ tries: 0, ...d, id: mem.nextId++ }); n += 1; } return { count: n }; },
    update: async ({ where, data }) => { const r = mem.rows.find((x) => x.id === where.id); Object.assign(r, data); return r; },
    updateMany: async () => ({ count: 0 }),
  },
};
export async function deviceBundle() { return null; }
export const fmtKst = (x) => String(x);
`);
const chatOut = join(cache, "chat.mjs");
await esbuild.build({
  absWorkingDir: root, bundle: true, format: "esm", platform: "node", outfile: chatOut, logLevel: "warning",
  tsconfig: join(root, "tsconfig.json"),
  plugins: [{ name: "fake-db", setup(b) {
    b.onResolve({ filter: /^@\/lib\/ops2\/(db|browser)$|^@\/app\/generated\/prisma\/client$/ }, () => ({ path: fakeDb }));
  } }],
  stdin: { resolveDir: root, loader: "ts", contents: `
    export * as CHAT from "./lib/ops2/chat"; export * as CH12 from "./lib/ops2/ch12/chat"; export { mem } from ${JSON.stringify(fakeDb)};` },
});
const K = await import(`${pathToFileURL(chatOut).href}?t=${Date.now()}`);
{
  const names = K.CHAT.extraWebhookEnvNames("CH12");
  const proc = K.CHAT.webhookEnvNames("CH12").process;
  process.env[proc] = "https://chat.example.invalid/process";
  process.env[names.plc] = "https://chat.example.invalid/plc";
  check("chat:webhook-env — v1 웹훅 용도별(CHAT_WEBHOOK_URL·PLC_DISCONNECT·CLIENT_PROCESS·MONITOR·OES) = 포털 환경변수 채널",
        proc === "OPS2_CHAT_WEBHOOK_CH12" && names.plc === "OPS2_CHAT_PLC_WEBHOOK_CH12" && names.client === "OPS2_CHAT_CLIENT_WEBHOOK_CH12"
        && names.monitor === "OPS2_CHAT_MONITOR_WEBHOOK_CH12" && names.oes === "OPS2_CHAT_OES_WEBHOOK_CH12"
        && K.CHAT.webhookOf("CH12", "plc") === "https://chat.example.invalid/plc" && K.CHAT.webhookOf("CH12", "client") === null
        && K.CHAT.webhookOf("CH12", "process") === "https://chat.example.invalid/process", names);
}
{
  // 보내기: POST JSON·시간 제한 신호, 실패면 30 s·2 분·10 분 뒤 다시(세 번째 실패 뒤 failed) — v1 은 3 s 제한·조용히 버림(X12)
  const mem = K.mem;
  mem.rows.length = 0;
  mem.rows.push({ id: 1, equipment: "CH12", kind: "error_event", msgId: "m1", status: "queued", tries: 0,
                  payload: { channel: "process", body: { text: "hello" } } });
  const calls = [];
  let fail = true;
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); if (fail) throw Object.assign(new Error("x"), { cause: { code: "ECONNREFUSED" } });
    return { ok: true, status: 200, body: null }; };
  const now = new Date("2026-10-30T03:00:00Z");
  const r1 = await K.CHAT.sendOne(1, now);
  const after1 = { ...mem.rows[0] };
  fail = false;
  const r2 = await K.CHAT.sendOne(1, now);
  const c0 = calls[0]?.init ?? {};
  check("chat:send-one — POST application/json·본문 그대로·시간 제한, 실패면 다시 보내기(30 s 뒤) 그 다음 성공이면 sent",
        r1 === "retry" && after1.nextAt?.getTime() === now.getTime() + 30_000 && after1.lastError.startsWith("연결 실패") && r2 === "sent"
        && c0.method === "POST" && String(c0.headers["Content-Type"]).startsWith("application/json") && c0.body === '{"text":"hello"}'
        && !!c0.signal && mem.rows[0].status === "sent" && K.CHAT.RETRY_MS.join() === "30000,120000,600000",
        { r1, r2, after1, c0: { ...c0, signal: !!c0.signal } });
}
{
  // 넣기: 모드(prod 만 보냄 — v1 DEV_MODE 차단 자리)·주소 없음·같은 묶음의 같은 장비 오류는 반복(60 s 안)
  const mem = K.mem;
  const errEnv = (id) => ({ id, instance: "i", seq: 1, ts: "2026-10-30T03:00:00.000Z", type: "event",
    data: { level: "error", code: "ERROR_EVENT", message: "x", context: { source: "host", chamber: "shared", kind: "error_event",
            data: { src: "HOST", code: "E104", message: "JSON 파싱 실패" } } } });
  const now = new Date("2026-10-30T03:00:01Z");
  mem.rows.length = 0;
  mem.device = { runMode: "sim", clockSkewMs: 0, webSchemaHash: "h" };
  await K.CH12.enqueueChatCh12("CH12-SIM", [errEnv("s1")], now);
  const simRow = { ...mem.rows[0] };
  mem.rows.length = 0;
  mem.device = { runMode: "prod", clockSkewMs: 0, webSchemaHash: "h" };
  delete process.env.OPS2_CHAT_WEBHOOK_CH12;
  await K.CH12.enqueueChatCh12("CH12", [errEnv("p0")], now);
  const noAddr = { ...mem.rows[0] };
  process.env.OPS2_CHAT_WEBHOOK_CH12 = "https://chat.example.invalid/process";
  mem.rows.length = 0;
  await K.CH12.enqueueChatCh12("CH12", [errEnv("p1"), errEnv("p2")], now);
  const st2 = mem.rows.map((r) => [r.status, r.lastError]);
  check("chat:enqueue-mode — sim 은 보내지 않음(모드)·주소 없으면 skipped·prod 는 queued", simRow.status === "skipped"
        && simRow.lastError === "보내지 않음(모드 sim)" && noAddr.status === "skipped" && noAddr.lastError === "주소 없음"
        && st2[0][0] === "queued", { simRow, noAddr, st2 });
  check("chat:dedup-batch — 같은 장비 오류(src·코드·원인)가 60 s 안에 또 오면 보내지 않고 세기만(v1 _err_dedup_decide)",
        st2.length === 2 && st2[1][0] === "skipped" && st2[1][1] === "반복(60 s 안)" && mem.rows[1].payload.repeatOf === mem.rows[0].msgId, st2);
}

// ───────────── 결과 ─────────────
if (show) {
  const r = R.find((x) => x.name.startsWith(show));
  console.log(JSON.stringify(r, null, 1)?.slice(0, 6000));
}
console.log(`챔버12 화면·구글챗 확인 (장비 ${repo})`);
for (const r of R) if (!r.ok) console.log(`  ✗ ${r.name}\n      ${JSON.stringify(r.got)?.slice(0, 700)}`);
console.log(`  확인 ${R.length} · 맞음 ${R.filter((r) => r.ok).length} · 틀림 ${R.filter((r) => !r.ok).length}`);
process.exit(R.every((r) => r.ok) ? 0 : 1);
