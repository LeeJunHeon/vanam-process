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
    # PLC 버튼(D425) — 웹(로그인 이름)·노트북·거부, CH1 은 공정 중(TEST 20 s), CH2 는 정지 뒤. 명령 결과(cmd_result)도 받게 허브 길로
    out["plc_busy"] = {"ch1": rig.asm.proc["ch1"].busy, "ch2": rig.asm.proc["ch2"].busy}
    for cid, args, src, by in (("ui-plc-1", {"target": "vent_1_sw", "on": True, "by_name": "홍길동"}, Source.WEB, "hong@vanam.co.kr"),
                               ("ui-plc-2", {"target": "door_2_open_sw", "on": True}, Source.HMI, "local"),
                               ("ui-plc-3", {"target": "nope", "on": True}, Source.HMI, "local")):
        rig.hub.run_command("PLC_BUTTON", args, src, cid=cid, by=by)
    rig.loop.run(1)
    # OES 스펙트럼 — 링크와 같은 쓰로틀·거르기·솎기(drivers/oes_spectrum) 결과를 링크 이벤트 길로(ch1 공정 중)
    from v2.ch12.drivers import oes_spectrum as OS
    from v2.ch12.drivers.oes_link import OesEvent
    xs = [100.0 + i * 0.6 for i in range(2048)]
    ys = [500.0 + (15000.0 if i == 700 else 0.0) + (3000.0 if 1200 <= i <= 1203 else 0.0) for i in range(2048)]
    ys[5] = float("nan")
    d = OS.SpectrumThrottle(0.5).offer(1.0, xs, ys, "ch1", c.wall())
    rig._ev_for("ch1.oes")(OesEvent("spectrum", "", data=d))
    out["oes_peak_x"] = xs[700]
    # 두께 Factor·재료 창 값(THICKNESS_WINDOW — 결과 value 와 사건 thickness/window), 저장 검사 문구(장비)
    w = rig.hub.run_command("THICKNESS_WINDOW", {"ch": 2, "req": "ui-w1"}, Source.HMI, cid="ui-w1", by="local")
    out["cmd"]["window"] = {"ok": w.ok, "reason": w.reason}
    tool = {cc: {g: "" for g in ("G1", "G2", "G3")} for cc in ("up", "mid", "down")}
    tool["up"]["G1"], tool["mid"]["G3"], tool["down"]["G2"] = "5", "abc", "120.5"
    cmd("factor_bad", "THICKNESS_FACTOR_SAVE", {"ch": 2, "tooling": tool, "materials": {"G1": "없는재료", "G2": "", "G3": "Al — Aluminum"}})
    out["factor_bad_args"] = {"tooling": tool, "materials": {"G1": "없는재료", "G2": "", "G3": "Al — Aluminum"}}
    mrows = [["", "X", "1", "1", ""], ["Foo", "F", "0.1", "abc", ""], ["Aluminum", "Al", "2.7", "1.08", ""], ["aluminum", "Al", "2.7", "1.08", ""], ["", "", "", "", ""]]
    cmd("materials_bad", "THICKNESS_MATERIALS_SAVE", {"ch": 2, "rows": mrows, "confirmed": True})
    out["materials_bad_rows"] = mrows
    # 알림창 — 장비가 내는 길 그대로: 공정 실패(오류창·닫으면 오류 해제), PC 치명, 호스트(로봇) 오류
    a = rig.asm
    a.proc["ch1"].popup("CH1 공정 실패", "T1\n\n사유: x\n\n확인을 누르면 상태 표시가 Idle로 변경됩니다.", "error", clear_on_close=True)
    a.pc.popup("critical", "게이트밸브 인터락", "GV 닫힘", ch=2, clear_on_close=True)
    from v2.ch12.robot_api import report_to_emit
    report_to_emit(rig.emit)({"error_code": "E104", "message": "JSON 파싱 실패"}, "HOST")
    # 노트북 화면 파일 고르기(local_server /api/v1/files — 시작 폴더 아래)
    from v2.ch12 import local_server as LS
    share = Path(tmp) / "share"
    (share / "sub").mkdir(parents=True)
    (share / "sub" / "r2.xlsx").write_bytes(b"pk")
    (share / "r1.csv").write_text("#,Process_name\n", encoding="utf-8")
    (share / "x.txt").write_text("x", encoding="utf-8")
    rig.cfg["PROCESS_LIST_START_DIR"] = str(share)
    srv = LS.LocalServer(0, None)
    srv.attach(rig)
    out["files"] = srv.files("")[1]
    out["files_sub"] = srv.files("sub")[1]
    out["files_bad"] = srv.files("..")[0]
    rig.loop.run(2)
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
      export { default as Ch12Run, ChamberRun, trendDefs, TREND_COLS12 } from "./components/ops2/ch12/Ch12Run";
      export { PcPanel, TspPanel, PresputterPanel, RobotPanel, CommonOps } from "./components/ops2/ch12/Ch12Aux";
      export { HeaterBox12, ThicknessBox12, ChamberDevices, VacuumBox12, ShutterBox12, GasBox12, PowerBox12 } from "./components/ops2/ch12/Ch12Devices";
      export { StatusBand12 } from "./components/ops2/ch12/Ch12Status";
      export { default as Ch12Hmi, drawnTargets, plcAsk, plcContext, plcChamber, HAZARD_TEXT } from "./components/ops2/ch12/Ch12Hmi";
      export { default as Ch12Confirm, PlcConfirmBody, recordNote, isPlcAsk } from "./components/ops2/ch12/Ch12Confirm";
      export { withServerArgs } from "./lib/ops2/commandArgs";
      export { Ch12EventFeed, ch12LogLine, RunAlerts } from "./components/ops2/ch12/Ch12Logs";
      export { WEB_TABS, LOCAL_TABS } from "./components/ops2/ch12/Ch12Page";
      export { Chk2ModeContext } from "./components/ops2/chk/mode";
      export { default as Chk2Trend, layoutTrendLabels, LABEL_LINE, LABEL_GAP } from "./components/ops2/chk/Chk2Trend";
      export { trimFeed, feedIsMain } from "./components/ops2/chk/useChk2";
      export { mainKindsOf, mainWhere, mergeFirstEvents, MAIN_PER_CHAMBER, FIRST_CONTEXTS } from "./lib/ops2/ch12/firstEvents";
      export { FEED_MAIN_KEEP12 } from "./components/ops2/ch12/Ch12Page";
      export { RgaChart, rgaPoints, OesChart, oesPoints } from "./components/ops2/ch12/Ch12Spectra";
      export { default as Ch12SeqEdit } from "./components/ops2/ch12/Ch12SeqEdit";
      export * as TH from "./components/ops2/ch12/Ch12Thickness";
      export * as PO from "./components/ops2/ch12/Ch12Popups";
      export * as LF from "./components/ops2/ch12/Ch12LocalFiles";
      export * as PC from "./lib/ops2/ch12/pc";
      export { logLine } from "./components/ops2/chk/text";
      export * as L from "./components/ops2/ch12/logic";
      export * as T from "./components/ops2/ch12/types";
      export * as TM from "./lib/ops2/ch12/terms";
      export * as KT from "./lib/ops2/chk/terms";
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
/** 버튼 글 → 막힘(disabled) 여부(같은 글이 여럿이면 마지막) */
function buttons(html) {
  const outB = {};
  for (const m of html.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)) outB[textOf(m[2]).trim()] = /\sdisabled=""/.test(m[1]);
  return outB;
}
/** 버튼 글 → 잠금 이유(title '잠김 — …') */
function lockText(html, label) {
  for (const m of html.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)) {
    if (textOf(m[2]).trim() === label) { const t = /title="([^"]*)"/.exec(m[1]); return t ? t[1].replace(/&#x27;/g, "'") : ""; }
  }
  return null;
}
/** 상세(detail) 끄기·켜기 — 화면은 Chk2ModeContext 로 받는다 */
const render = (C, props, mode = {}) => renderToStaticMarkup(h(U.Chk2ModeContext.Provider, { value: { local: false, hmiKinds: [], detail: false, ...mode } }, h(C, props)));
const noLock = () => null;
const noop = () => {};
const can = () => true;

const R = [];
const check = (name, cond, got) => R.push({ name, ok: !!cond, got });

// 작업자 화면에 보이면 안 되는 개발용 글(상세를 끈 화면) — 인자 형식 이름·명령 이름·코일 원래 이름·JSON
const DEV_WORDS = ["any", "str", "obj", "rows", "JSON", "enum", "PROCESS_START", "RECIPE_LOAD", "PLC_BUTTON", "PC_START", "TSP_SCHEDULE", "HEATER_ONOFF",
  "BLOCK_SKIP", "PRESPUTTER_RESERVE", "RUNTIME_DUMP", "POWER_SELECT", "_SW", "L_VAC_READY", "SW_RF_SELECT", "proc.ch1", "ch1.mfc", "plc."];
const devHits = (t) => DEV_WORDS.filter((w) => new RegExp(`(^|[^A-Za-z0-9가-힣_.])${w.replace(/[.]/g, "\\.")}([^A-Za-z0-9_]|$)`).test(t));

// ───────────── 1) 화면(장비 sim 값) ─────────────
const kindsUsed = Object.entries(L.KINDS);
const kindsMissing = kindsUsed.filter(([, cands]) => !L.hasKind(bundle, cands)).map(([k]) => k);
check("ui:bundle-kinds — 화면 버튼이 부르는 명령이 장비 명령 표에 모두 있음", kindsMissing.length === 0, kindsMissing);

const nowMs = Date.parse(fx.state.ts);
const chamberProps = (ch) => ({
  bundle, st, ch, connected: true, lock: noLock, onAsk: noop, feed, trend: [], nowMs, skewMs: 0, equipment: "CH12-SIM", local: false,
  recipes: [], getRecipe: async () => null, onEditSeq: noop, onLog: noop,
});
{
  const html = render(U.ChamberRun, chamberProps("ch1"));
  const t = textOf(html), b = buttons(html);
  const cs = st.chambers.ch1;
  check("ui:chamber-running — 공정 중 상태 글·단계 n/전체·남은 시간·공정 끝까지, STOP 은 늘 눌림(v1 START/STOP 늘 활성), 지금 동작(stepLabel)",
        cs.procState === "RUNNING" && t.includes(L.stateInfo(bundle, "RUNNING", "ch1").label) && t.includes("단계 1/1")
        && t.includes(L.clockOrDash(cs.remainS)) && t.includes("공정 끝까지") && b["CH1 STOP"] === false
        && b["건너뛰기"] === false && b["일시정지"] === false && b["공정 순서 편집"] === false
        && (!cs.stepLabel || t.includes(`진행 중 동작 ${cs.stepLabel}`)),
        { procState: cs.procState, stop: b["CH1 STOP"], b, text: t.slice(0, 400) });
  // W-20 ④ 알림 띠 — 챔버 칸마다 있던 '알림·로그' 카드 대신 운전 탭 알림 띠 하나(두 챔버·공통, 최근 60줄, 챔버 줄은 출처 앞에 장소 이름)
  const al = render(U.RunAlerts, { bundle, st, feed, onLog: noop }), at = textOf(al);
  const mainAll = feed.map((e) => ({ e, l: U.ch12LogLine(bundle, e) })).filter((x) => x.l.main);
  const mine = mainAll.slice(-60).filter((x) => L.feedChamber(x.e) === "ch1").map((x) => x.l);
  const other = mainAll.slice(-60).filter((x) => L.feedChamber(x.e) !== "ch1").map((x) => x.l);
  check("ui:run-alerts — 알림 띠 하나(두 챔버·공통 줄 — 줄 = 시각 + 장소·출처 + 이름 + 내용, 최근 60줄), 챔버 칸 '알림·로그' 카드 없음",
        !t.includes("알림·로그") && !t.includes("기록 전체 보기") && at.includes("알림") && at.includes("기록 전체 보기")
        && mine.length > 0 && mine.every((l) => at.includes(l.text.replace(/\s+/g, " "))) && at.includes("CH1 공정") && other.length > 0
        && other.every((l) => at.includes(l.text.replace(/\s+/g, " "))) && (al.match(/data-log-line/g) ?? []).length === Math.min(60, mainAll.length)
        && mine.some((l) => l.source === "공정" && l.kind === "단계" && l.text.includes("시작")), { main: mainAll.length, ch1: mine.length, other: other.length });
  check("ui:no-dev-text — 운전 탭 CH1 칸에 개발용 글(인자 형식·명령 이름·코일 이름·열 이름)이 없음(상세 끔)", devHits(t).length === 0, devHits(t));
}
{
  // W-19b ③ 작은 글 — 적재 카드 '적재 <이름> · 공정 1/1'(옛 '1/1행' 아님), 주요 값 범례 '▲ 목표 · │ 현재',
  // 공정 끝까지 값과 '확정 전' 사이 띄움(위 띠·운전 카드). ETA 가 아직 없는 공정 중 + 적재 레시피·큐 1개
  const st3 = JSON.parse(JSON.stringify(st));
  const ek = st3.engines?.["proc.ch1"] ? "proc.ch1" : "ch1";
  st3.engines = { ...(st3.engines ?? {}), [ek]: { ...(st3.engines?.[ek] ?? {}), recipe_name: "CH1 RF Pulse Ar", queue: { index: 0, total: 1, mode: true } } };
  st3.chambers.ch1 = { ...st3.chambers.ch1, etaRemainingS: null };
  const html = render(U.ChamberRun, { ...chamberProps("ch1"), st: st3 }), t = textOf(html);
  const band = render(U.StatusBand12, { bundle, st: st3, connected: true, conn: { label: "장비 연결됨 · 1초 전", tone: "neutral" },
    links: [], mode: "sim", equipment: "CH12-SIM", label: null, lock: noLock, onAsk: noop, nowMs, plcOk: true });
  const gap = /공정 끝까지 <b[^>]*>[^<]+<\/b> (<!-- -->)?<span[^>]*>확정 전<\/span>/;
  check("ui:small-text — 적재 '… · 공정 1/1'(행 아님)·범례 '▲ 목표 · │ 현재'·위 띠 '공정 끝까지 — 확정 전' 띄움",
        t.includes("적재 CH1 RF Pulse Ar · 공정 1/1") && !/\d\/\d+행/.test(t) && t.includes("▲ 목표 · │ 현재") && !t.includes("세로선")
        && gap.test(band) && textOf(band).includes("확정 전"),
        { run: t.match(/적재 .{0,40}/)?.[0], legend: t.match(/▲.{0,20}/)?.[0], band: band.match(/공정 끝까지.{0,200}/)?.[0] });
}
{
  const html = render(U.ChamberRun, chamberProps("ch2"));
  const t = textOf(html), b = buttons(html);
  check("ui:chamber-idle — 대기 중·공정 시작·적재 해제·오류 해제·STOP(늘 눌림)·다음 공정 레시피 고르기",
        t.includes("대기 중") && b["공정 시작"] === false && b["적재 해제"] === false && b["오류 해제"] === false && b["CH2 STOP"] === false
        && t.includes("CH2 공정 레시피 고르기") && "적재" in b, b);
  const pop = feed.find((e) => e.type === "event" && e.data.context?.kind === "popup" && e.data.context?.chamber === "ch2");
  const pl = pop && U.ch12LogLine(bundle, pop);
  check("ui:popup-line — v1 경고창(시작 가드 '대기 필요' 등)은 로그 줄(경고)로 — 문구 그대로, 시작은 COOLDOWN 거부",
        !!pop && pl.level === "warn" && pop.data.message.startsWith("이전 공정 종료 후 1분 대기 필요합니다.")
        && textOf(render(U.RunAlerts, { bundle, st, feed })).includes(pl.text.replace(/\s+/g, " "))
        && fx.cmd.start2_cooldown.reason === "COOLDOWN", { pop: pop?.data, cmd: fx.cmd.start2_cooldown });
  const ht = textOf(render(U.HeaterBox12, { ctx: { bundle, st, lock: noLock, onAsk: noop }, plcOk: true }));
  // 히터 레지스터 칸(41칸)은 상세 보기에서 — PV·목표·MV 는 히터 박스(v1 히터 패널 글). 라벨의 레지스터 주소 '(D112)' 는 상세에서만
  const plain = (l) => l.replace(/\s*\((?:[DM]\d+)[^)]*\)/g, "").trim();
  const blocks = (bundle.chambers.find((c) => c.id === "ch2").blocks ?? []).map((n) => bundle.snapshot.blocks.find((x) => x.name === n))
    .filter((x) => x && !["dcpulse", "rfpulse", "stm100", "oes", "rga", "dc", "rf", "heater"].includes(x.name.split(".").pop()));
  const labels = blocks.flatMap((x) => x.fields.slice(0, 2).map((f) => [x.name, plain(f.label)]));
  const miss = labels.filter(([, l]) => !t.includes(l));
  const heaterVals = ht.includes(Number(st.heater.pv).toFixed(1)) && ht.includes("히터") && t.includes("히터") && !/\(D1\d\d\)/.test(ht);
  check("ui:chamber-values — 챔버 장비 박스 1초 값(가스·압력·Ion Gauge·CH2 두께 판정은 CH2 칸 두께 모니터 박스, 히터 값은 CH2 칸 히터 박스)",
        labels.length > 0 && miss.length === 0 && heaterVals, { miss, heaterVals });
}
{
  // W-20 ① 장비 박스 틀 — 챔버K DevCard(머리 제목·칩 → 큰 값/요약 → 줄 → 상태 → 안내 → 맨 아래 버튼 줄, 버튼 없으면 줄 없음) · 읽는 순서
  const titlesOf = (ch) => {
    const h = render(U.ChamberRun, chamberProps(ch));
    const seg = h.slice(h.indexOf(`data-devices="${ch}"`));
    return [...seg.matchAll(/<h3[^>]*>([^<]*)<\/h3>/g)].map((m) => m[1]);
  };
  const want = {
    ch1: ["진공", "셔터·인터락", "가스·압력", "Ion Gauge", "DC Pulse", "RF Pulse", "두께 모니터", "OES", "RGA"],
    ch2: ["진공", "셔터·인터락", "가스·압력", "Ion Gauge", "DC Power", "RF Power", "DC Pulse", "RF Pulse", "히터", "두께 모니터", "OES", "RGA"],
  };
  const got = { ch1: titlesOf("ch1").slice(0, want.ch1.length), ch2: titlesOf("ch2").slice(0, want.ch2.length) };
  const ctx = { bundle, st, lock: noLock, onAsk: noop, onHmi: noop };
  const vac = render(U.VacuumBox12, { ctx, ch: "ch1" }), ig = render(U.PowerBox12, { ctx, ch: "ch1", kind: "dcpulse" });
  const at = (h, x) => h.indexOf(x);
  const sum = /펌프 정지|운전</.exec(vac)?.index ?? -1;
  const order = at(vac, "<h3") < sum && sum < at(vac, ">MV<") && at(vac, ">MV<") < at(vac, "mt-auto")
    && at(vac, "mt-auto") < at(vac, "HMI 열기") && /border-t[^"]*pt-3/.test(vac);
  check("ui:device-boxes — 챔버 장비 박스(챔버K DevCard 틀) 읽는 순서·박스 틀 순서(머리 → 요약 → 상태 → 버튼 줄), 버튼 없는 박스는 버튼 줄 없음, 옛 접힘 글 없음",
        JSON.stringify(got) === JSON.stringify(want) && order && !ig.includes("mt-auto") && !/접어 둠/.test(render(U.ChamberRun, chamberProps("ch2"))),
        { got, order });
}
{
  // W-20 ② 설정에서 꺼진 장비 — 접지 않고 같은 박스: 칩 '사용하지 않음' · 안내 한 줄 · [설정 열기](설정 탭이 있을 때만), 값 줄·버튼은 그리지 않음
  const st4 = JSON.parse(JSON.stringify(st));
  st4.links = { ...(st4.links ?? {}), "ch1.rfpulse": { ...(st4.links?.["ch1.rfpulse"] ?? {}), q: "off" } };
  const boxOf = (h) => { const i = h.indexOf(">RF Pulse</h3>"); return i < 0 ? "" : h.slice(h.lastIndexOf("<div", h.lastIndexOf("<h3", i) - 1), h.indexOf("</h3>", h.indexOf("<h3", i + 20))); };
  const web = render(U.ChamberRun, { ...chamberProps("ch1"), st: st4, onConfig: noop });
  const loc = render(U.ChamberRun, { ...chamberProps("ch1"), st: st4 });
  const wb = textOf(boxOf(web)), lb = textOf(boxOf(loc));
  check("ui:device-off — 꺼진 장비(블록 품질 off)는 칩 '사용하지 않음'·안내 한 줄·[설정 열기](설정 탭 있을 때만)·값 줄 없음, 옛 '접어 둠' 없음",
        wb.includes("사용하지 않음") && wb.includes("장비 설정에서 사용하도록 바꾸면 값이 표시됩니다.") && wb.includes("설정 열기") && !wb.includes("Reflected")
        && lb.includes("사용하지 않음") && !lb.includes("설정 열기") && !/접어 둠/.test(web), { wb: wb.slice(0, 200), lb: lb.slice(0, 120) });
}
{
  // W-20 ③ 대기 화면 배치 — 대기 칸: 머리 카드 → 다음 공정 → 장비 박스 격자만(주요 값·추세·공정 순서는 공정 중에만), 공정 중 칸은 그대로.
  //   다음 공정: 적재 없음은 머리 오른쪽 한 줄, [레시피 열기](레시피 탭이 있을 때만). 격자 = 챔버 칸 폭(컨테이너 ch) 950px 3개 · 650px 2개 · 그 밖 1개
  const idle = render(U.ChamberRun, { ...chamberProps("ch2"), onEditRecipe: noop }), it = textOf(idle);
  const noEdit = render(U.ChamberRun, chamberProps("ch2"));
  const run = render(U.ChamberRun, chamberProps("ch1")), rt = textOf(run);
  const pos = (h, x) => h.indexOf(x);
  const loaded2 = !!L.engineOf(st, "ch2")?.recipe_name;
  const idleOk = st.chambers.ch2.procState === "IDLE" && idle.includes('data-layout="idle"') && pos(idle, "대기 중") < pos(idle, ">다음 공정<")
    && pos(idle, ">다음 공정<") < pos(idle, 'data-devices="ch2"') && !it.includes("주요 값") && !it.includes("추세") && !/>\s?공정 순서</.test(idle)
    && (loaded2 || it.includes("장비에 적재된 공정 레시피 없음")) && "레시피 열기" in buttons(idle) && !("레시피 열기" in buttons(noEdit));
  const runOk = run.includes('data-layout="run"') && rt.includes("주요 값") && rt.includes("CH1 추세") && />\s?공정 순서</.test(run) && !/>다음 공정</.test(run)
    && run.search(/>\s?공정 순서</) < pos(run, 'data-devices="ch1"');
  const gridOk = /class="@container\/ch [^"]*" data-chamber="ch2"/.test(idle) && /class="[^"]*@min-\[650px\]\/ch:grid-cols-2[^"]*@min-\[950px\]\/ch:grid-cols-3[^"]*" data-devices="ch2"/.test(idle);
  check("ui:idle-layout — 대기 칸 머리 → 다음 공정 → 장비 박스(주요 값·추세·공정 순서 없음), 공정 중 칸은 그대로, [레시피 열기]는 레시피 탭 있을 때만, 격자는 챔버 칸 폭 기준",
        idleOk && runOk && gridOk, { idleOk, runOk, gridOk, loaded2 });
}
{
  // W-20 ④ 운전 탭 영역(컨테이너 run) 1360px 이상: 왼쪽 3/4 CH1·CH2 칸 · 오른쪽 1/4 알림 띠(왼쪽 높이를 따름 — absolute, 목록 안 스크롤),
  //   공통 장비는 아래 전체 폭. 더 좁으면 알림은 맨 아래(order-last, 목록 최대 240px)
  const runP = { ...chamberProps("ch1"), plcOk: true, pcRecipes: [], getRow: async () => null, onEditSeq: noop, send: async () => ({}), notify: noop };
  const html = render(U.Ch12Run, runP);
  const left = /class="min-w-0 @min-\[1360px\]\/run:col-span-3"/.test(html), grid4 = /@container\/run[\s\S]{0,120}@min-\[1360px\]\/run:grid-cols-4/.test(html);
  const band = /class="relative order-last min-w-0 @min-\[1360px\]\/run:order-none" data-alerts=""/.test(html)
    && /@min-\[1360px\]\/run:absolute @min-\[1360px\]\/run:inset-0/.test(html) && /max-h-\[240px\][^"]*@min-\[1360px\]\/run:flex-1/.test(html);
  const one = (html.match(/data-alerts=""/g) ?? []).length === 1 && !textOf(html).includes("알림·로그");
  const order = html.indexOf('data-chamber="ch2"') < html.indexOf('data-alerts=""') && html.indexOf('data-alerts=""') < html.indexOf("Plasma Cleaning");
  check("ui:run-band — 운전 탭 1360px 이상 왼쪽 3/4 챔버 칸 · 오른쪽 1/4 알림 띠(하나, 왼쪽 높이·목록 안 스크롤), 좁으면 알림 맨 아래(240px)",
        left && grid4 && band && one && order, { left, grid4, band, one, order });
}
{
  const html = render(U.PresputterPanel, { bundle, st, lock: noLock, onAsk: noop });
  const t = textOf(html), b = buttons(html);
  check("ui:presputter — 프리스퍼터 예약·예약 취소 칸(시각 HH:MM 고르기), 장비가 매일 예약을 잡음·형식 오류는 TIME_FORMAT 거부",
        t.includes("프리스퍼터 예약") && t.includes("시각(HH:MM)") && (html.match(/aria-label="시각\(HH:MM\) 시"/g) ?? []).length === 2
        && "예약" in b && b["예약 취소"] === false && t.includes(String(st.engines["proc.ch2"].presputter.status_text))
        && fx.cmd.pre.ok && fx.cmd.pre_bad.reason === "TIME_FORMAT" && fx.cmd.pre_bad.detail === "시간 형식 오류 (HH:MM)", fx.cmd);
}
{
  const ctx = { bundle, st, lock: noLock, onAsk: noop };
  const html = render(U.HeaterBox12, { ctx, plcOk: true }) + render(U.ThicknessBox12, { ctx, ch: "ch2" });
  const t = textOf(html), b = buttons(html);
  const pv = st.heater.pv;
  check("ui:heater-panel — CH2 히터 PV·SV·MV, 목표 온도 칸(범위 0~상한 °C)·켜기(목표를 넣어야)/끄기(RUN 이면)·목표 적용·이상 리셋",
        typeof pv === "number" && t.includes(pv.toFixed(1)) && "히터 켜기" in b && lockText(html, "히터 켜기").includes("목표 온도를 넣으세요")
        && "목표 적용" in b && b["이상 리셋"] === false && st.heater?.run === false && t.includes("목표 온도") && /범위 0~\d+ °C/.test(t), { pv, b });
  check("ui:thickness-panel — 두께(ch2.thk)·STM-100(두께·증착률) 값, 두께 영점",
        t.includes("두께") && b["두께 영점"] === false && !!bundle.snapshot.blocks.find((x) => x.name === "ch2.stm100"), b);
}
{
  const pcList = [{ id: "r1", kind: "pc", name: "PC-1", rowCount: 1, check: { errors: 0, warnings: 0, first: null } }];
  const html = render(U.PcPanel, { bundle, st, lock: noLock, onAsk: noop, recipes: pcList, getRecipe: async () => null });
  const t = textOf(html), b = buttons(html);
  check("ui:pc-panel — Plasma Cleaning 채널(CH1/CH2) 선택·레시피 목록에서 고르기(JSON 칸 없음)·시작·정지·오류 해제(장비가 실행 중 전환 거부)",
        "채널 선택" in b && "CH1" in b && "CH2" in b && b["시작"] === false && b["정지"] === false && b["오류 해제"] === false
        && t.includes("Plasma Cleaning") && !t.includes("PC 레시피")
        && t.includes("PC-1") && !/<textarea|font-mono/.test(html) && devHits(t).length === 0 && fx.cmd.pc_sel.ok, { b, dev: devHits(t) });
  const rg = U.PC.pcRanges(bundle);
  const good = { use_ch: "2", process_name: "PC", base_pressure: "5e-6", gas_flow: "20", working_pressure: "2", rf_power: "100", process_time: "1" };
  check("ui:pc-recipe — PC 레시피 열(v1 PC CSV 첫 행)·범위(묶음 PC_DEFAULT_*)·검사(빈 칸·범위 밖 막음)",
        U.PC.checkPcRow(good, rg).length === 0 && U.PC.checkPcRow({ ...good, rf_power: "9999" }, rg)[0]?.includes("밖입니다")
        && U.PC.checkPcRow({ ...good, gas_flow: "" }, rg)[0]?.includes("값을 넣으세요") && U.PC.checkPcRow({ ...good, use_ch: "3" }, rg).length === 1
        && rg.rf_power.max === 600 && U.PC.PC_FIELDS.map((f) => f.key).join() === "use_ch,process_name,base_pressure,gas_flow,working_pressure,rf_power,process_time",
        rg);
}
{
  const html = render(U.TspPanel, { bundle, st, lock: noLock, onAsk: noop, nowMs });
  const t = textOf(html), b = buttons(html);
  check("ui:tsp-panel — TSP 목표 압력(Torr, 지수 표기)·사이클 수·시작·정지·매일 예약 켜기/끄기 + 시각(HH:MM 고르기)",
        t.includes("매일 예약") && t.includes("목표 압력") && t.includes("사이클 수") && "예약 켜기" in b && "예약 끄기" in b
        && b["TSP 시작"] === false && b["TSP 정지"] === false && (html.match(/aria-label="예약 시각 [시분]"/g) ?? []).length === 2, b);
  const tr = { min: 0, max: 1, unit: "Torr", minExclusive: true };
  const cr = L.paramRange(bundle, "TSP_UI_DEFAULT_CYCLES", { int: true });
  check("ui:inputs-range — 입력 칸은 범위 밖·숫자 아님을 보내기 전에 막음(지수 표기 받음, 범위 = 묶음 파라미터 min·max)",
        L.checkNum("5e-7", tr).error === null && L.checkNum("0", tr).error?.includes("밖입니다") && L.checkNum("abc", tr).error === "숫자가 아닙니다"
        && L.checkNum("0", cr).error?.includes("밖입니다") && L.checkNum("2.5", cr).error === "정수여야 합니다" && L.checkNum("", tr, true).error === "값을 넣으세요"
        && L.isHHMM("06:30") && !L.isHHMM("25:99"), { cr });
}
{
  const html = render(U.CommonOps, { bundle, st, lock: noLock, onAsk: noop, plcOk: true });
  const t = textOf(html), b = buttons(html);
  const coil = bundle.plcButtons.find((x) => x.name === "SW_POWER_SELECT")?.coil;
  check("ui:loadlock-panel — Power Select(SW_POWER_SELECT 코일 215 — 켜기·끄기 확인창)·런타임 덤프(사유 선택)",
        b["켜기"] === false && b["끄기"] === false && b["런타임 덤프"] === false && t.includes("런타임 덤프 사유(선택)") && coil === 215
        && fx.cmd.power_select.ok && devHits(t).length === 0, { b, coil, dev: devHits(t) });
}
{
  const html = render(U.RobotPanel, { bundle, st, feed });
  const t = textOf(html);
  const r = st.engines.robot;
  check("ui:robot-panel — 로봇 연결 상태 칸(장비 engines.robot — 받는 중·처리한 명령·처리 중·마지막 명령, 값 없으면 그렇게)",
        t.includes("로봇") && !!r && t.includes(`로봇 명령 받기 ${r.listening ? "켜짐" : "꺼짐"}`) && new RegExp(`처리한 명령 ${r.count} ?건`).test(t)
        && t.includes(r.last ? (bundle.commands.find((c) => c.kind === `ROBOT_${r.last.cmd}`)?.label.replace(/^로봇 /, "") ?? "명령") : "아직 없음")
        && !t.includes("모름") && !/\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/.test(t), t.slice(0, 300));
}
{
  const html = render(U.Ch12Hmi, { bundle, snapshot: st.snapshot, plcOk: true, lockOf: noLock, pending: {}, onAsk: noop, note: "노드를 눌러 조작" });
  const t = textOf(html);
  const drawn = U.drawnTargets(bundle);
  // 그 밖의 버튼 목록은 묶음 이름에서 칸 제목(CH1·CH2·Loadlock)과 같은 앞말을 뺀다('CH1 Chuck 중간' → CH1 칸의 'Chuck 중간')
  const shown = bundle.plcButtons.filter((x) => drawn.has(x.target) ? html.includes(`<title>${L.plcName(x)} · `)
    : t.includes(L.plcName(x).replace(/^(CH1|CH2|Loadlock) /, "")));
  check("ui:plc-buttons — 장비 PLC 버튼 전부(계통도 노드 + 그 밖의 버튼 목록 — Power Select·부저 정지 포함), 이름은 묶음 이름(코일 원래 이름은 상세에서만)",
        bundle.plcButtons.length > 20 && shown.length === bundle.plcButtons.length && !/[A-Za-z0-9]+_SW/.test(t),
        bundle.plcButtons.filter((x) => !shown.includes(x)).map((x) => x.label));
  // ── PLC 버튼 확인창·기록(2026-11-20 D425 — 잠그지 않고 알린다) ──
  const pb = (x) => bundle.plcButtons.find((b) => b.target === x);
  const snap0 = st.snapshot;
  const ctx = (x, want, s2 = st, sn = snap0) => U.plcContext(bundle, s2, sn, pb(x), want);
  const kinds = (c) => c.hazards.map((x) => x.kind).join(",");
  const c1 = ctx("vent_1_sw", true), c2 = ctx("door_2_open_sw", true);
  const tOff = ctx("turbo_1_sw", false), tOn = ctx("turbo_1_sw", true);
  const rfNo = ctx("sw_rf_select", true, st, { ...snap0, "ch2.dcpulse.out_on": false });
  const rfDcp = ctx("sw_rf_select", true, st, { ...snap0, "ch2.dcpulse.out_on": true });
  const rfOff = ctx("sw_rf_select", false, st, { ...snap0, "ch2.dcpulse.out_on": true });
  const st2 = { ...st, chambers: { ...st.chambers, ch2: st.chambers.ch1 }, engines: { ...st.engines, "proc.ch2": st.engines["proc.ch1"] } };
  const g1 = ctx("shutter_1_sw", true, st2), g1idle = ctx("shutter_1_sw", true), bz = ctx("buzzer_stop_sw", true, st2);
  const pin = ctx("l_pin_up_sw", true), ar = ctx("ar_1_gas_sw", true), mv = ctx("m_v_2_sw", false), chuck = ctx("z_m_p_1_cw_sw", true);
  const want1 = "CH1 공정 중 · TEST 모드 · T1";
  check("ui:plc-confirm — 확인창: 그 버튼의 챔버가 공정 중이면 맨 위 'CH1 공정 중 · 단계 · 공정 이름'(공유 Gun 셔터·Power Select 는 CH2, Loadlock·부저는 없음), " +
        "위험 두 갈래 — 사람(Vent·Door·Gate·Loadlock 4Pin·Chuck)·장비(Turbo·Rotary 끄기, FV·RV·MV, Power Select·RF Select — DC Pulse 출력 중 RF Select 켜기는 RF 전용 릴레이 문구 더)",
        fx.plc_busy.ch1 && !fx.plc_busy.ch2 && c1.procLine === want1 && kinds(c1) === "person" && c2.procLine === null && kinds(c2) === "person" &&
        kinds(tOff) === "equipment" && kinds(tOn) === "" && kinds(rfNo) === "equipment" && kinds(rfDcp) === "equipment,equipment" &&
        rfDcp.hazards[1].text.includes("RF 전용 릴레이") && kinds(rfOff) === "equipment" && g1.procLine === "CH2 공정 중 · TEST 모드 · T1" &&
        g1idle.procLine === null && bz.procLine === null && kinds(bz) === "" && pin.procLine === null && kinds(pin) === "person" &&
        ar.procLine === want1 && kinds(ar) === "" && kinds(mv) === "equipment" && kinds(chuck) === "person" &&
        c1.hazards[0].text === bundle.plcHazardText.person && tOff.hazards[0].text === bundle.plcHazardText.equipment &&
        U.HAZARD_TEXT.person === bundle.plcHazardText.person && U.HAZARD_TEXT.equipment === bundle.plcHazardText.equipment &&
        U.HAZARD_TEXT.rf_select_dcp === bundle.plcHazardText.rf_select_dcp,
        { c1, c2, tOff, tOn, rfDcp: kinds(rfDcp), g1: g1.procLine, busy: fx.plc_busy });
  const a1 = U.plcAsk(pb("vent_1_sw"), true, c1), a2 = U.plcAsk(pb("door_2_open_sw"), true, c2), a3 = U.plcAsk(pb("ar_2_gas_sw"), false, ctx("ar_2_gas_sw", false));
  const body = (a, local) => textOf(renderToStaticMarkup(h(U.PlcConfirmBody, { ask: a, local }))).trim();
  const hw = body(a1, false), hl = body(a2, true), hn = body(a3, false);
  const dlgHtml = renderToStaticMarkup(h(U.Chk2ModeContext.Provider, { value: { local: false, hmiKinds: [], detail: false } },
    h(U.Ch12Confirm, { ask: a1, onOk: noop, onCancel: noop })));
  check("ui:plc-confirm-text — 확인창 글: 빨간 줄이 맨 위(공정 중일 때만) → 조작 확인 · 'CH1 Vent → 켜기·열기' · '명령을 장비에 보냅니다.' · 공정 중에도 실행 안내 · 위험 문구 · " +
        "기록 안내(웹 = 이름·계정, 노트북 = '노트북'), 공정 중·위험이면 실행 빨강, 그 밖의 확인창도 같은 동작(챔버12 글)",
        hw.startsWith(`${want1} 조작 확인 CH1 Vent → 켜기·열기 명령을 장비에 보냅니다.`) && hw.includes("공정 중에도 실행되고") && hw.includes(bundle.plcHazardText.person) &&
        hw.endsWith("이 조작은 로그인한 이름·계정과 함께 장비 로그에 기록됩니다.") && !hw.includes(" — ") &&
        hl.startsWith("조작 확인 CH2 Door 열기 → 켜기·열기") && hl.endsWith("이 조작은 '노트북'에서 누른 것으로 장비 로그에 기록됩니다.") &&
        !hn.includes("위험:") && a1.red && a2.red && !a3.red && dlgHtml.includes("data-proc-line") && dlgHtml.includes("bg-[#B42318]") &&
        U.isPlcAsk(a1) && !U.isPlcAsk({ kind: "PROCESS_STOP", label: "x" }) &&
        textOf(renderToStaticMarkup(h(U.Ch12Confirm, { ask: { kind: "PROCESS_STOP", label: "CH1 STOP", stop: true }, onOk: noop, onCancel: noop }))).includes("실행자 계정과 함께 기록됩니다"),
        { hw, hl, hn });
  const plcEv = feed.filter((e) => e.type === "event" && e.data.context?.kind === "plc_button");
  const plcRes = feed.filter((e) => e.type === "cmd_result" && e.data.kind === "PLC_BUTTON");
  // 순서는 장비 시각 — 거부는 그 자리에서, 받은 명령은 PLC 쓰기가 끝난 뒤(결과까지 한 사건) → 버튼으로 찾는다
  const byT = (x) => plcEv.filter((e) => e.data.context.data.target === x);
  const ll = ["vent_1_sw", "door_2_open_sw", "nope"].map((x) => byT(x)).filter((a) => a.length === 1)
    .map(([e]) => ({ tab: L.feedChamber(e), ...U.ch12LogLine(bundle, e) }));
  check("ui:plc-log-line — 화면 로그 한 줄 = 출처 | 이름 | 내용: '웹 | PLC 버튼 | CH1 Vent 켜기 · 홍길동 · 진행 중 단계 TEST 모드'·'노트북 | PLC 버튼 | CH2 Door 열기 켜기'·" +
        "거부면 '… · 거부 · 사유 이름', 그 챔버 탭(CH1·CH2·공통), 평소 보기 줄(계정·장비 문장은 상세 원시 줄에만), 같은 말 두 번 없음, " +
        "'PLC 버튼 받음' 명령 결과 줄은 상세에만(같은 일 두 줄 막기)",
        plcEv.length === 3 && ll.length === 3 && ll[0].source === "웹" && ll[0].text === "CH1 Vent 켜기 · 홍길동 · 진행 중 단계 TEST 모드" && ll[0].tab === "ch1" &&
        ll[1].source === "노트북" && ll[1].text === "CH2 Door 열기 켜기" && ll[1].tab === "ch2" &&
        ll[2].source === "노트북" && ll[2].text === `모르는 대상 켜기 · 거부 · ${bundle.reasons.find((r) => r.code === "BAD_ARGS").label}` &&
        ll[2].tab === "shared" && ll[2].level === "warn" &&
        ll.every((x) => { const ws = `${x.source} ${x.kind} ${x.text}`.split(/[\s·|,()]+/).filter((w) => w.length >= 2); return ws.length === new Set(ws).size; }) &&
        ll.every((x) => x.main && x.kind === "PLC 버튼") && !ll[0].text.includes("@") && ll[0].raw.includes("hong@vanam.co.kr") &&
        plcRes.length === 3 && plcRes.every((e) => U.ch12LogLine(bundle, e).main === false) && L.hasPlcEvent(bundle),
        ll.map((x) => `${x.tab} ${x.level} ${x.source} | ${x.kind} | ${x.text} || ${x.raw}`));
  const dWho = [L.whoOf("web", "hong@vanam.co.kr", "홍길동"), L.whoOf("web", "hong@vanam.co.kr", null), L.whoOf("local", "local"), L.whoOf("robot", "robot")];
  const def = bundle.commands.find((c) => c.kind === "PLC_BUTTON"), kdef = { kind: "X", args: [{ name: "ch" }] };
  const sa = U.withServerArgs(def, { target: "vent_1_sw", on: true, by_name: "꾸민 이름" }, "홍길동");
  check("ui:plc-who — 누가: 웹은 로그인한 이름(웹 서버가 by_name 을 넣음 — 그 인자를 선언한 명령만, 브라우저 값은 덮어씀, 이름이 없으면 계정 @ 앞)·노트북은 '노트북'",
        dWho.join("|") === "홍길동(웹)|hong(웹)|노트북|로봇" && sa.by_name === "홍길동" && sa.target === "vent_1_sw" &&
        !("by_name" in U.withServerArgs(def, { target: "x", by_name: "y" }, null)) &&
        JSON.stringify(U.withServerArgs(kdef, { ch: 1, by_name: "z" }, "홍길동")) === JSON.stringify({ ch: 1, by_name: "z" }),
        { dWho, sa });
  const dt = textOf(render(U.Ch12Hmi, { bundle, snapshot: st.snapshot, plcOk: true, lockOf: noLock, pending: {}, onAsk: noop, note: "" }, { detail: true }));
  const locked = render(U.Ch12Hmi, { bundle, snapshot: st.snapshot, plcOk: false, lockOf: () => "PLC 값이 오래됨", pending: { [bundle.plcButtons[5].target]: true }, onAsk: noop, note: "PLC 응답 늦음 — 조작 잠금" });
  check("ui:hmi-map — HMI 계통도(CH1·CH2·Loadlock 2D — 진회색 = 켜짐·열림, 전환 중 파란 점선, 잠금 이유 aria·흐리게, 상세면 원래 이름)",
        html.includes('aria-label="CH1 계통도"') && html.includes('aria-label="CH2 계통도"') && html.includes('aria-label="Loadlock 계통도"')
        && html.includes('role="button"') && locked.includes("opacity-50") && locked.includes("잠김: PLC 값이 오래됨") && locked.includes("조작 잠금")
        && /[A-Z0-9]+_SW/.test(dt) && t.includes("열림·켜짐") && t.includes("전환 중"), null);
}
{
  // 사각 버튼(도어·게이트·핀·진공 준비) 상태 글 = 켜짐/꺼짐(챔버K Chk2Hmi 도어 버튼 규칙) — '게이트 닫기 … 열림' 처럼 거꾸로 보이지 않게(2026-11-19)
  const lamps = { g_v_1_close_lamp: true, g_v_1_open_lamp: false, g_v_2_close_lamp: false, g_v_2_open_lamp: true,
                  door_1_open_lamp: false, door_1_close_lamp: true, l_pin_up_lamp: true, l_pin_down_lamp: false, l_vac_ready_sw: false };
  const snap = { ...st.snapshot, ...Object.fromEntries(Object.entries(lamps).map(([k, v]) => [`plc.${k}`, v])) };
  const html = render(U.Ch12Hmi, { bundle, snapshot: snap, plcOk: true, lockOf: noLock, pending: {}, onAsk: noop, note: "" });
  const aria = (name) => (html.match(new RegExp(`aria-label="${name} · ([^"· ]+)`, "g")) ?? []).map((m) => m.split(" · ")[1]);
  const got = { "Gate 닫기": aria("Gate 닫기"), "Gate 열기": aria("Gate 열기"), "Door 닫기": aria("Door 닫기"), "Door 열기": aria("Door 열기"),
                "4Pin 올림": aria("4Pin 올림"), "4Pin 내림": aria("4Pin 내림"), "진공 준비": aria("진공 준비") };
  const words = Object.values(got).flat();
  check("ui:hmi-buttons — 사각 버튼 상태 글 켜짐/꺼짐(Gate 닫기 램프 켜짐 → 'Gate 닫기 켜짐', 열기 → '꺼짐'), 열림/닫힘은 밸브·셔터만, 이름은 칸 제목 앞말을 뺀 묶음 이름",
        got["Gate 닫기"].join() === "켜짐,꺼짐" && got["Gate 열기"].join() === "꺼짐,켜짐" && got["Door 닫기"][0] === "켜짐"
        && got["Door 열기"][0] === "꺼짐" && got["4Pin 올림"][0] === "켜짐" && got["4Pin 내림"][0] === "꺼짐" && got["진공 준비"][0] === "꺼짐"
        && words.length >= 9 && !words.some((w) => w === "열림" || w === "닫힘"), got);
}
{
  // 추세 그래프 오른쪽 라벨(공용 Chk2Trend — 챔버K 도 같은 부품, 2026-11-19): 라벨 상자(글자 줄 높이 LABEL_LINE)끼리 겹치지 않음을 좌표로.
  // 같은 값 2~4개, 축 맨 위·맨 아래 값, 그림 높이를 아주 작게 해도(띠를 늘리거나 같은 값은 한 줄로) — 순수 함수 + 실제 그림(HTML 의 text y)
  const LH = U.LABEL_LINE, GAP = U.LABEL_GAP;
  const boxesOk = (ys, h) => ys.every((a, i) => a - LH / 2 >= 0 && a + LH / 2 <= h + 0.01 && ys.every((b, j) => i === j || Math.abs(a - b) >= LH));
  const it = (y, text, group, dashed = false) => ({ y, text, group, dashed });
  const pure = [];
  for (const n of [2, 3, 4]) {                                 // 같은 값 n 개 — 위·가운데·아래
    for (const y0 of [24, 68, 112]) {
      const items = Array.from({ length: n }, (_, i) => it(y0, "20", `s${i >> 1}`, i % 2 === 1));
      const r = U.layoutTrendLabels(items, 24, 112, 132);
      pure.push({ n, y0, ok: boxesOk(r.labels.map((l) => l.y), r.height), h: r.height, labels: r.labels.length });
    }
  }
  for (const h of [40, 56, 70]) {                              // 그림 높이가 작아 띠에 다 못 들어갈 때(위 22 · 아래 20 은 그대로)
    const items = [it(30, "20", "a"), it(30, "20", "a", true), it(30, "5", "b"), it(30, "7", "b", true)];
    const r = U.layoutTrendLabels(items, 24, h - 20, h);
    pure.push({ min: h, ok: boxesOk(r.labels.map((l) => l.y), r.height), h: r.height, labels: r.labels.map((l) => l.text) });
  }
  for (const [up, down] of [[2, 2], [3, 1], [1, 3], [2, 1], [1, 2]]) {   // 위·아래 양쪽에 라벨 쌍(값이 축 맨 위·맨 아래) — 2026-11-19 남은 겹침
    const items = [...Array.from({ length: up }, (_, i) => it(24, "20", `u${i >> 1}`, i % 2 === 1)),
                   ...Array.from({ length: down }, (_, i) => it(112 - (i % 2) * 0.5, "1.5", `d${i >> 1}`, i % 2 === 1))];
    const r = U.layoutTrendLabels(items, 24, 112, 132);
    pure.push({ both: `${up}+${down}`, ok: boxesOk(r.labels.map((l) => l.y), r.height) && r.labels.length === up + down && r.height === 132,
                ys: r.labels.map((l) => l.y) });
  }
  const merged = U.layoutTrendLabels([it(30, "20", "a"), it(30, "20", "a", true), it(30, "5", "b"), it(30, "7", "b", true)], 24, 36, 56);
  const t0 = 1_760_000_000_000;
  const mk = (v) => Array.from({ length: 20 }, (_, i) => ({ t: t0 + i * 2000, v }));
  const labelYs = (html) => [...html.matchAll(/<text x="536" y="([0-9.]+)"[^>]*>(.*?)<\/text>/g)].map((m) => ({ y: Number(m[1]) - 3.5, t: m[2].replace(/<!-- -->/g, "") }));
  const svgH = (html) => [...html.matchAll(/<svg width="640" height="([0-9.]+)"/g)].map((m) => Number(m[1]));
  const drawn = [
    ["같은 값 2(압력=목표)", { "mfc.pressure_mtorr": 3, "mfc.sp_mtorr": 3 }],
    ["같은 값 4(DC·RF 와 목표 모두 100)", { "dc.p": 100, "dc.set_w": 100, "rf.fwd_w": 100, "rf.set_w": 100 }],
    ["축 맨 위 4개", { "dc.p": 300, "dc.set_w": 300, "rf.fwd_w": 299, "rf.set_w": 300 }],
    ["축 맨 아래 4개", { "dc.p": 300, "dc.set_w": 1, "rf.fwd_w": 0.5, "rf.set_w": 0.8, "rfp.fwd_w": 0.2, "rfp.set_w": 0.3 }],
    ["CH1 가스 유량 위 2·아래 2(Ar 20·목표 20, O2 1.5·목표 1.5)",
     { "ch1.mfc.ar_sccm": 20, "ch1.set.ar_sccm": 20, "ch1.mfc.o2_sccm": 1.5, "ch1.set.o2_sccm": 1.5 }, U.trendDefs(bundle, "ch1")],
  ].map(([name, v, defs]) => {
    const html = renderToStaticMarkup(h(U.Chk2Trend, { trend: mk(v), equipment: "CHK2", runId: null, local: true, nowMs: t0 + 40000, defs }));
    const labs = labelYs(html), hs = svgH(html);
    const ok = labs.length >= 2 && boxesOk(labs.map((l) => l.y), Math.max(...hs));
    return { name, ok, labs: labs.map((l) => `${l.t}@${l.y}`) };
  });
  check("ui:trend-labels — 추세 라벨 상자 겹침 없음(간격 = 글자 줄 높이 + 여유, 같은 값 2~4·축 위/아래·그림 높이 최소 — 띠 늘림·같은 값 한 줄 '20 · 목표 20')",
        GAP > LH && LH >= 12 * 1.2 && pure.every((x) => x.ok) && drawn.every((x) => x.ok)
        && merged.labels.some((l) => l.text === "20 · 목표 20") && pure.some((x) => x.min && x.h > x.min), { pure: pure.filter((x) => !x.ok), drawn: drawn.filter((x) => !x.ok), merged });
}
{
  // 화면을 다시 열어도 앞선 공정 진행 줄(2026-11-19 — 장비 허브 D418 의 웹·화면 쪽): ① 웹 첫 묶음 = 최근 사건 100 + 챔버별 기본 보기 줄
  // (묶음 eventKinds main·경고·오류, 챔버마다 100), 같은 것 한 번·오래된 것부터 ② 화면 로그 목록은 기본 보기 줄을 상세 줄과 따로 1500 까지(챔버K 는 그대로 300)
  const kinds = U.mainKindsOf(bundle);
  const w = U.mainWhere("CH12", "ch2", kinds, 1_760_000_000_000);
  const T0 = Date.parse(fx.state.ts);
  const row = (i, source, kind, chamber, level = "info") => ({ msgId: `m${i}`, ts: new Date(T0 + i * 100), seq: i, level, source, kind, context: { chamber } });
  const mainsCh2 = Array.from({ length: 30 }, (_, i) => row(i, "process", "block", "ch2"));                        // 앞선 공정 진행 줄
  const flood = Array.from({ length: 100 }, (_, i) => row(5000 + i, "rf", "display", "ch2")).reverse();          // 최근 사건 100(새 것부터) = 상세 줄뿐
  const merged = U.mergeFirstEvents(flood, [[...mainsCh2].reverse(), [row(29, "process", "block", "ch2")]]);
  const ordered = merged.every((r, i) => i === 0 || merged[i - 1].ts <= r.ts);
  const env = (r) => ({ id: r.msgId, type: "event", ts: r.ts.toISOString(), seq: r.seq, instance: "i",
                        data: { level: r.level, code: "X", message: "", context: { source: r.source, kind: r.kind, chamber: r.context.chamber } } });
  const feed = [...mainsCh2.map(env), ...Array.from({ length: 2000 }, (_, i) => env(row(10_000 + i, "plc", "log", "shared")))];
  const set = new Set(kinds.map((k) => `${k.source}|${k.kind}`));
  const kept = U.trimFeed(feed, 300, U.FEED_MAIN_KEEP12, U.feedIsMain(set));
  const plain = U.trimFeed(feed, 300, 0, U.feedIsMain(set));
  check("ui:first-events — 다시 연 화면: 웹 첫 묶음 = 최근 사건 100 + 챔버별 기본 보기 줄(main·경고·오류) 합침, 화면 로그는 기본 보기 줄을 상세와 따로(챔버K 는 최근 300 그대로)",
        kinds.some((k) => k.source === "process" && k.kind === "block") && !kinds.some((k) => k.source === "plc" && k.kind === "log")
        && w.equipment === "CH12" && JSON.stringify(w.context) === JSON.stringify({ path: ["chamber"], equals: "ch2" })
        && JSON.stringify(w.OR[0]) === JSON.stringify({ level: { in: ["warn", "error", "critical"] } }) && w.OR.length === kinds.length + 1
        && U.FIRST_CONTEXTS.join() === "ch1,ch2,pc,tsp,shared" && U.MAIN_PER_CHAMBER === 100
        && merged.length === 130 && ordered && merged.slice(0, 30).every((r, i) => r.msgId === `m${i}`)
        && kept.length === 330 && kept.slice(0, 30).every((e, i) => e.id === `m${i}`) && kept.slice(30).every((e) => e.data.context.kind === "log")
        && plain.length === 300 && plain.every((e, i) => e === feed[feed.length - 300 + i])
        && U.feedIsMain(null)(feed[40]) && !U.feedIsMain(set)(feed[40]) && U.feedIsMain(set)({ ...feed[40], data: { ...feed[40].data, level: "warn" } }),
        { merged: merged.length, kept: kept.length, plain: plain.length });
}
{
  // 가스 단계 규칙 C(장비 D420) — 흐르는 중 올림의 단계 진행이 운전 탭(공정 중 값 바꾸기 위)과 로그 줄에 보임
  const TXT = "O2 9.0 → 9.5 → 10 진행 중 2/3";
  const ek = st.engines?.["proc.ch1"] ? "proc.ch1" : "ch1";
  const eng = st.engines?.[ek] ?? {};
  const adj = [...(Array.isArray(eng.adjust) ? eng.adjust : []), { device: "mfc", item: "o2_flow", value: 10, recipe: 8, scope: "live", max: null,
                adjusted: null, stepping: { levels: [9, 9.5, 10], i: 2, n: 3, text: TXT } }];
  const st2 = { ...st, engines: { ...st.engines, [ek]: { ...eng, adjust: adj } } };
  const html = render(U.ChamberRun, { ...chamberProps("ch1"), st: st2 });
  const ev = { id: "gs1", type: "event", ts: fx.state.ts, seq: 1, instance: "i",
    data: { level: "info", code: "ADJUST", message: TXT, context: { source: "process", chamber: "ch1", kind: "adjust",
      data: { device: "mfc", item: "o2_flow", old: 8, new: 10, result: "stepping", text: TXT, steps: [9, 9.5, 10], step: 2 } } } };
  const ln = U.ch12LogLine(bundle, ev);
  check("ui:gas-stepping — 가스 단계 진행 'O2 9.0 → 9.5 → 10 진행 중 2/3' 이 운전 탭(공정 중 값 바꾸기 위)·로그 평소 보기 줄에",
        html.includes('data-gas-stepping="ch1"') && textOf(html).includes(TXT) && ln.text === TXT && ln.main === true, { text: ln.text, main: ln.main });
}
{
  const reasons = ["TIME_FORMAT", "LINK_DOWN", "CHANNEL_SWITCH_RUNNING", "COOLDOWN", "RUNNER_BUSY", "PC_RUNNING", "DUMP_BUSY",
                   "THICKNESS_BLOCKED", "HEATER_REJECTED", "NOT_SUPPORTED"];
  const miss = reasons.filter((c) => !bundle.reasons.some((r) => r.code === c && r.label));
  check("ui:cmd-reject-text — 거부 사유 코드마다 화면 이름(묶음 reasons)", miss.length === 0, miss);
}
{
  // 상태 띠 — CH1·CH2 공정 상태·블록·남은 시간·ETA, PC·TSP·로드락 요약, 모드·연결 칩, ALL STOP·부저 정지(늘 눌림)
  const html = render(U.StatusBand12, { bundle, st, connected: true, conn: { label: "장비 연결됨 · 1초 전", tone: "neutral" },
    links: [{ label: "PLC 정상", tone: "neutral" }], mode: "sim", equipment: "CH12-SIM", label: null, lock: noLock, onAsk: noop, nowMs, plcOk: true });
  const t = textOf(html), b = buttons(html);
  check("ui:status-band — 상태 띠(CH1·CH2 상태·단계·남은·공정 끝까지, Loadlock·Plasma Cleaning·TSP 요약, 모의 장비·연결·PLC 칩, ALL STOP·부저 정지)",
        t.includes(L.stateInfo(bundle, "RUNNING", "ch1").label) && t.includes("단계 1/1") && t.includes("대기 중") && t.includes("Loadlock")
        && t.includes("Plasma Cleaning") && t.includes("TSP") && t.includes("모의 장비") && !t.includes("SIM —") && t.includes("공정 끝까지")
        && t.includes("PLC 정상") && b["ALL STOP"] === false
        && b["부저 정지"] === false && (html.match(/data-band-chamber="ch[12]"/g) ?? []).length === 2, b);
}
{
  // 탭·잠금 — 웹 운전·HMI·레시피·기록·설정 / 노트북 운전·HMI·기록, 잠금 순서·문구 = 챔버K lockOf
  const base = { authLost: false, perms: { canOperate: true, kinds: ["PLC_BUTTON", "PROCESS_STOP", "PROCESS_START", "RECIPE_LOAD"] }, local: false, bench: false,
    benchOk: (k) => k === "RECIPE_LOAD", connected: true, webOnline: true, streamUp: true, plcOk: true, inflight: () => false };
  const lr = L.lockReason;
  check("ui:tabs-locks — 탭(웹 운전·HMI·레시피·기록·설정 / 노트북 운전·HMI·기록)·잠금 순서와 문구(로그인 → 권한 → bench → 정지 쪽 → 기다림 → 끊김 → PLC)",
        U.WEB_TABS.map((x) => x.label).join() === "운전,HMI,레시피,기록,설정" && U.LOCAL_TABS.map((x) => x.label).join() === "운전,HMI,기록"
        && U.WEB_TABS.every((x) => !!x.title) && U.LOCAL_TABS.every((x) => !!x.title)
        && lr({ ...base, authLost: true }, "PROCESS_STOP") === "로그인이 끊겨 새로고침해야 함" && lr({ ...base, perms: undefined }, "X") === "권한 정보를 읽는 중"
        && lr({ ...base, local: true }, "PC_START") === "노트북 화면에서 받지 않는 조작이라 웹에서 해야 함" && lr(base, "PC_START") === "권한 없음(장비 담당자·관리자만)"
        && lr({ ...base, bench: true }, "PROCESS_START") === "읽기 전용이라 잠김" && lr({ ...base, bench: true }, "RECIPE_LOAD") === null
        && lr({ ...base, connected: false }, "PROCESS_STOP") === null && lr({ ...base, connected: false, webOnline: false }, "PROCESS_STOP") === "장비 끊김"
        && lr({ ...base, inflight: () => true }, "PROCESS_START") === "결과를 기다리는 중" && lr({ ...base, inflight: () => true }, "PROCESS_STOP") === null
        && lr({ ...base, connected: false }, "PROCESS_START") === "장비 끊김" && lr({ ...base, local: true, connected: false, streamUp: false }, "PROCESS_START") === "노트북 프로그램 연결 끊김"
        && lr({ ...base, plcOk: false }, "PLC_BUTTON") === "PLC 값이 오래됨" && lr({ ...base, local: true }, "PLC_BUTTON") === null, null);
}
{
  // 로그 — 평소 보기(묶음 eventKinds main: 공정 단계 줄)·같은 글 두 번 막기·챔버 고르기
  const dup = { id: "d1", type: "event", ts: fx.state.ts, seq: 1, instance: "i",
    data: { level: "info", code: "STATUS", message: "STATUS on=1 fwd=10.0W", context: { source: "rfpulse", chamber: "ch1", kind: "status" } } };
  const dl = U.ch12LogLine(bundle, dup);
  const blk = feed.find((e) => e.type === "event" && e.data.context?.kind === "block");
  const bl = blk && U.ch12LogLine(bundle, blk);
  const html = render(U.Ch12EventFeed, { bundle, feed: [...feed, dup] }, { detail: true });
  const t = textOf(html);
  const plain = textOf(render(U.Ch12EventFeed, { bundle, feed }));
  check("ui:log-main — 로그 평소 보기에 공정 진행 줄('공정 | 단계 | 1/1 … 시작' — 묶음 eventKinds main)·같은 글이 한 줄에 두 번 붙지 않음('STATUS … STATUS STATUS' 없음)·챔버 고르기·출처 칸 늘 채움",
        !!bl && bl.main && bl.source === "공정" && bl.kind === "단계" && /^1\/1 .+ 시작$/.test(bl.text) && plain.includes(bl.text) && !t.includes("STATUS STATUS")
        && (t.match(/on=1 fwd=10\.0W/g) ?? []).length === 1 && dl.raw === "STATUS" && !dl.text.startsWith("STATUS")
        && ["전체", "CH1", "CH2", "Plasma Cleaning", "TSP", "공통"].every((x) => t.includes(x))
        && feed.map((e) => U.ch12LogLine(bundle, e)).every((l) => !!l.source), { bl, dl });
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
{
  // OES 그래프 — 장비 state.spectra(v1 거르기·0.5 s 쓰로틀·512점 솎기 — drivers/oes_spectrum), v1 축·빨간 선
  const pts = U.oesPoints(st, "ch1");
  const html = render(U.OesChart, { st, ch: "ch1" });
  const t = textOf(html);
  const ticks = Array.from({ length: 12 }, (_, k) => String(100 + k * 100));
  const yt = Array.from({ length: 9 }, (_, k) => String(k * 2000));
  const empty = render(U.OesChart, { st, ch: "ch2" });
  check("ui:oes-chart — OES 그래프(x Wavelength (nm) 100~1200 100 간격, y Intensity 0~16000 눈금 9, 빨간 선; 512점 이하·꼭대기 유지, 값 없으면 빈 축)",
        !!pts && pts.length <= 512 && pts.length >= 256 && pts.every((p) => p.x >= 100 && p.x <= 1200)
        && pts.some((p) => Math.abs(p.x - fx.oes_peak_x) < 1e-6 && p.y === 15500) && st.spectra.ch1.n === 2048
        && /data-oes-line=""/.test(html) && html.includes('stroke="#dc2626"') && t.includes("Wavelength (nm)") && t.includes("Intensity")
        && ticks.every((x) => t.includes(x)) && yt.every((y) => t.includes(y))
        && !/data-oes-line/.test(empty) && textOf(empty).includes("값 없음") && st.spectra.ch2 === null,
        { n: pts?.length, spectra: Object.keys(st.spectra ?? {}) });
  const ev = (kind, extra) => ({ id: `x${Math.random()}`, type: "event", ts: fx.state.ts, seq: 1, instance: "i",
    data: { level: "info", code: "X", message: extra?.message ?? "", context: { source: "rga", chamber: "ch1", kind, data: extra?.data ?? {} } } });
  const dat = ev("data", { data: { mass_axis: [18, 28], pressures: [1e-7, 2e-8] } });
  const runEnd = { id: "re", type: "run_end", ts: fx.state.ts, seq: 2, instance: "i", data: { chamber: "ch1", runId: "r" } };
  const runEnd2 = { ...runEnd, id: "re2", data: { chamber: "ch2", runId: "r" } };
  check("ui:spectra-reset — 그래프 지우기 v1 그대로(공정 시작·끝·RGA 스캔 시작 뒤 RGA 없음, 다른 챔버 공정은 상관없음; OES 는 장비가 비움)",
        U.rgaPoints([dat, runEnd], "ch1") === null && U.rgaPoints([dat, ev("status", { message: "[RGA] 스캔 시작 — 예산 2회" })], "ch1") === null
        && U.rgaPoints([dat, runEnd2], "ch1")?.length === 2 && U.rgaPoints([runEnd, dat], "ch1")?.length === 2, null);
}
{
  // 장비 키 state.engines["proc.chN"](assembly.register_engine) — 블록 목록·수정 항목·시작한 블록 수·시퀀스 편집 창
  const eng = st.engines["proc.ch1"];
  const cb = L.currentBlocks(st, feed, "ch1");
  const html = render(U.ChamberRun, chamberProps("ch1"));
  const seq = textOf(render(U.Ch12SeqEdit, { bundle, st, feed, ch: "ch1", can, onAsk: noop, onClose: noop }));
  check("ui:engines-key — 포털이 장비 키 proc.chN 을 읽음(지금 동작·단계 목록(공정 순서)·started_upto·수정 항목·공정 순서 편집 창이 채워짐, v1 스텝 문구는 상세 보기에서만)",
        L.engineOf(st, "ch1") === eng && !!eng && cb.from === "engine" && cb.blocks.length === eng.blocks.length && eng.blocks.length > 0
        && L.startedUpto(st, "ch1", cb.blocks.length) === eng.started_upto && eng.started_upto >= 1 && Array.isArray(eng.adjust)
        && !textOf(html).includes(eng.text) && textOf(render(U.ChamberRun, chamberProps("ch1"), { detail: true })).includes(eng.text)
        && (!eng.step_label || textOf(html).includes(eng.step_label)) && textOf(html).includes(`시작한 단계 ${eng.started_upto}/${eng.blocks.length}`)
        && !seq.includes("받는 중") && !seq.includes("모르는 키") && !seq.includes("오류 ") && seq.includes(`시작한 단계 ${eng.started_upto}/${eng.blocks.length}`)
        && L.engineOf(st, "ch2") === st.engines["proc.ch2"], { keys: Object.keys(st.engines), from: cb.from, seq: seq.slice(0, 200) });
}
{
  // 히터 패널 글(v1 ui/heater_panel.py 우선순위 문구 — 장비 heater_panel_text)
  const p = st.heater.panel;
  const t = textOf(render(U.HeaterBox12, { ctx: { bundle, st, lock: noLock, onAsk: noop }, plcOk: true }));
  const badge = { RUN: "운전", ITL: "인터락", FAULT: "이상", STOP: "정지" }[p?.badge] ?? p?.badge;
  check("ui:heater-text — v1 히터 패널 상태 문구·상태 줄·배지(운전·인터락·이상·정지)·소유자·램프(묶음 필드 이름 — 값 표 대신)",
        !!p && t.includes(p.status_text) && t.includes(p.state_line) && t.includes(badge) && t.includes(p.owner_text) && !/\b(RUN|ITL|FAULT|STOP)\b/.test(t.replace("ALL STOP", ""))
        && ["TC 정상", "D/A 정상", "Water", "진공 인터락", "히터 인터락", "과온", "TC 이상", "워치독 이상"].every((x) => t.includes(x))
        && ["정지", "운전 중", "운전 중 · 램프", "운전 중 · 유지", "PLC 응답 없음"].some((x) => p.status_text.startsWith(x) || p.status_text.startsWith("인터락")),
        p);
}
{
  // 두께 Factor·재료 창(v1 thickness_factor_dialog·thickness_material_dialog 그대로 — 값은 THICKNESS_WINDOW 사건)
  const win = U.TH.windowEvent(feed, "ui-w1");
  const fh = win && render(U.TH.FactorDialog, { win, feed, can, send: async () => ({}), onClose: noop, onReload: noop });
  const ft = fh ? textOf(fh) : "", fb = fh ? buttons(fh) : {};
  const mh = win && render(U.TH.MaterialsDialog, { win, used: [], can, send: async () => ({}), onClose: noop, onSaved: noop });
  const mt = mh ? textOf(mh) : "", mb = mh ? buttons(mh) : {};
  const mats = U.TH.matsOf(win?.materials);
  const fa = fx.factor_bad_args;
  const fc = U.TH.factorCollect(fa.tooling, fa.materials, mats);
  const mc = U.TH.materialsCollect(fx.materials_bad_rows);
  const factorText = "고칠 칸이 있어 저장하지 않았습니다:\n\n" + fc.errs.join("\n");
  const matText = "고칠 칸이 있어 저장하지 않았습니다:\n\n" + mc.errs.slice(0, 15).join("\n");
  check("ui:thickness-factor — Factor 창(제목·tooling 3×3 Up/Mid/Down×G1~G3·안내·재료 드롭다운 '(선택 안 함)'·ρ/Z 표시·저장/장비에 쓰기/재료 목록 편집/취소)",
        fx.cmd.window.ok && !!win && ft.includes("CH2 Thickness Monitor — Factor 설정") && ft.includes(win.factor.tooling_header)
        && ft.includes(win.factor.material_header) && ["Up", "Mid", "Down", "G1", "G2", "G3"].every((x) => ft.includes(x))
        && fh.includes('value="(선택 안 함)"') && fb["저장"] === false && fb["장비에 쓰기"] === false && fb["재료 목록 편집"] === false
        && fb["취소"] === false && ft.includes(win.factor.write_note) && ft.includes("저장하면 다음 공정 시작 때 적용됩니다")
        && U.TH.valueText("Al — Aluminum", mats, "G1") === "ρ 2.73 · Z 1.080" && U.TH.valueText("없음", mats, "G1") === "목록에 없음"
        && U.TH.valueText("", mats, "G1") === "—", { title: win?.factor.title, fb });
  check("ui:thickness-factor-check — 저장 검사 문구가 장비(v1)와 같음(tooling 10~399·숫자 아님·재료 목록에 없음, 빨간 칸)",
        fx.cmd.factor_bad.reason === "BAD_ARGS" && fx.cmd.factor_bad.detail === factorText.slice(0, 300)
        && fc.bad.join() === "tooling.up.G1,tooling.mid.G3,material.G1" && U.TH.checkTooling("120.5").v === 120.5,
        { web: factorText, dev: fx.cmd.factor_bad.detail, bad: fc.bad });
  check("ui:thickness-materials — 재료 창(제목·열 이름·기호·density·Z-factor·note·행 추가/행 삭제/저장/취소)·저장 검사 문구가 장비와 같음",
        mt.includes("Thickness Monitor — 재료 목록") && ["이름", "기호", "density (g/cm3)", "Z-factor", "note"].every((x) => mt.includes(x))
        && mt.includes(win.materials.header) && "행 추가" in mb && "행 삭제" in mb && mb["저장"] === false && mb["취소"] === false
        && (mh.match(/<tr/g) ?? []).length === win.materials.rows.length + 1
        && fx.cmd.materials_bad.reason === "BAD_ARGS" && fx.cmd.materials_bad.detail === matText.slice(0, 300)
        && mc.bad.join(" ") === "0,0 1,2 1,3 3,0" && U.TH.deleteConfirmText(["Aluminum"]).startsWith("Factor 설정에서 쓰는 재료입니다: Aluminum\n"),
        { web: matText, dev: fx.cmd.materials_bad.detail, bad: mc.bad });
}
{
  // 알림창(v1 경고 5 s·오류창(닫으면 오류 해제)·호스트 15 s, 같은 (제목, 본문) 억제·동시 5개)
  const pops = feed.map(U.PO.popupOf).filter(Boolean);
  const warn = pops.find((p) => p.title === "대기 필요" && p.chamber === "ch2");
  const fail = pops.find((p) => p.title === "CH1 공정 실패");
  const pc = pops.find((p) => p.title === "게이트밸브 인터락");
  const host = pops.find((p) => p.kind === "host");
  const A = U.PO.admit;
  const mk = (i, extra = {}) => ({ ...warn, id: `p${i}`, title: `t${i}`, ...extra });
  const five = [0, 1, 2, 3, 4].map((i) => mk(i));
  const html = render(U.PO.PopupStack, { list: [warn, fail, host], onClose: noop });
  check("ui:popups — v1 알림창 규칙(경고 5 s 자동 닫힘·오류창 자동 닫힘 없음·닫으면 CHAMBER_ERROR_CLEAR/PC_ERROR_CLEAR·호스트 15 s·중복 억제·동시 5개)",
        !!warn && warn.kind === "warning" && warn.autoMs === 5000 && !warn.clear
        && !!fail && fail.kind === "critical" && fail.autoMs === null && fail.clear?.kind === "CHAMBER_ERROR_CLEAR" && fail.clear.args.ch === 1
        && !!pc && pc.clear?.kind === "PC_ERROR_CLEAR" && pc.clear.args.ch === 2
        && !!host && host.autoMs === 15000 && host.title.length > 0 && !!bundle.commands.find((c) => c.kind === "CHAMBER_ERROR_CLEAR")
        && A([warn], { ...warn, id: "z" }).why === "dup" && A(five, mk(9)).why === "cap" && A(five, { ...fail, id: "f2" }).show
        && A([{ ...fail, clearOnClose: false, clear: null }], { ...fail, id: "f3" }).show && A([fail], { ...fail, id: "f4" }).why === "dup"
        && (html.match(/role="alertdialog"/g) ?? []).length === 3 && textOf(html).includes("이전 공정 종료 후 1분 대기 필요합니다."),
        { warn, fail, pc, host });
}
{
  // 노트북 화면 파일 고르기(장비 local_server GET /api/v1/files — 시작 폴더 PROCESS_LIST_START_DIR 아래, csv·xlsx·폴더)
  const html = render(U.LF.LocalFiles, { bundle, can, onAsk: noop, initial: fx.files });
  const t = textOf(html);
  const csv = fx.files.entries.find((e) => e.name === "r1.csv");
  const tg = U.LF.fileTargets(bundle, csv);
  const tx = U.LF.fileTargets(bundle, fx.files_sub.entries[0]);
  check("ui:local-files — 장비 폴더 목록(폴더 먼저·csv/xlsx 만·위 폴더)·고른 파일 → CH1/CH2 적재·Plasma Cleaning 불러오기(csv)·프리스퍼터 레시피(path)",
        fx.files.dir === "" && fx.files.parent === null && fx.files.entries.map((e) => e.name).join() === "sub,r1.csv" && t.includes("sub")
        && t.includes("r1.csv") && !t.includes("x.txt") && fx.files_sub.parent === "" && fx.files_bad === 403
        && tg.map((x) => x.label).join() === "CH1 적재,CH2 적재,Plasma Cleaning 불러오기,CH1 프리스퍼터 레시피,CH2 프리스퍼터 레시피"
        && tg[0].kind === "RECIPE_LOAD" && tg[0].args.path === csv.full && tg[1].args.ch === 2
        && !tx.some((x) => x.kind === "PC_RECIPE_LOAD"), { files: fx.files, tg });
}

{
  // 낱말 바꾸기(W-19b ②) — 묶음 16 의 모든 글(필드·사유·사건·명령·설정·상태·버튼·블록의 이름과 설명)과 sim 흐름의 기록 글에 toTerms12:
  // (a) 한글 바로 뒤에 영문 용어가 붙은 흔적('이Vent' 꼴) 0, (b) 같은 낱말이 잇달아 나오는 흔적('기록 기록' 꼴) 0,
  // (c) 한글 글자 수가 줄어든 것은 규칙 목록(TERM_RULES12) 바꾸기뿐, (d) 낱말 속에서 바뀐 자리(앞에 한글·뒤에 조사 아닌 한글) 0.
  // 챔버K toTerms 는 같은 검사를 돌려 걸린 것을 보여 주기만 한다(고치지 않음 — 챔버K 화면 그대로)
  const texts = new Set();
  const add = (x) => { if (typeof x === "string" && x.trim()) texts.add(x); };
  for (const blk of bundle.snapshot.blocks) { add(blk.label); add(blk.desc); for (const f of blk.fields) { add(f.label); add(f.help); add(f.desc); Object.values(f.enumLabels ?? {}).forEach(add); } }
  for (const f of bundle.snapshot.process) { add(f.label); add(f.help); add(f.desc); }
  for (const r of bundle.reasons) { add(r.label); add(r.help); }
  for (const e of bundle.eventKinds) { add(e.label); add(e.desc); }
  for (const e of bundle.eventSources) add(e.label);
  for (const c of bundle.commands) { add(c.label); add(c.desc); (c.args ?? []).forEach((x) => add(x.desc)); }
  for (const x of bundle.params) { add(x.label); add(x.desc); }
  for (const x of bundle.states) add(x.label);
  for (const x of bundle.plcButtons) add(x.label);
  for (const d of bundle.blocks.defs) { add(d.label); add(d.desc); }
  const nBundle = texts.size;
  for (const e of feed) {
    const d = e.data ?? {}; add(d.message); const c = d.context ?? {}; const cd = c.data ?? {};
    add(cd.text); add(cd.label); add(cd.message); add(cd.detail); add(c.title); add(c.message);
    const l = U.ch12LogLine(bundle, e); add(l.text); add(l.kind);
  }
  const H = (t) => (t.match(/[가-힣]/g) ?? []).length;
  const TERM = /[가-힣](?:Plasma Cleaning|Loadlock|Rotary|Turbo|RV|FV|Gate|Vent|4Pin|Chuck|Main 셔터|Gun\d? 셔터|Ion Gauge|Ionizer|Filament|Degas|Emission|Water|Door|MV|Forward|Reflected|SP|Gun\d)/g;
  const DUP = /(?<![가-힣A-Za-z0-9])([가-힣A-Za-z0-9]{2,})[\s·]+\1(?![가-힣A-Za-z0-9])/g;
  const n = (re, t) => (t.match(re) ?? []).length;
  const JOSA = /^(?:(?:에서|에게|으로|까지|부터|보다|처럼|마다|이나|이랑|하고|이다|입니다|이며|이고|이면|이라|은|는|이|가|을|를|의|에|께|로|와|과|도|만|나|랑|인|라))*(?![가-힣])/;
  const inWord = (t, re) => [...t.matchAll(new RegExp(re.source, "g"))].filter((m) =>
    /[가-힣]/.test(t[m.index - 1] ?? "") || (/[가-힣]/.test(t[m.index + m[0].length] ?? "") && !JOSA.test(t.slice(m.index + m[0].length))));
  const scan = (fn, rules, bounded) => {
    const out = { a: [], b: [], c: [], d: [] };
    for (const t of texts) {
      const r = fn(t);
      if (n(TERM, r) > n(TERM, t)) out.a.push(`${t} → ${r}`);
      if (n(DUP, r) > n(DUP, t)) out.b.push(`${t} → ${r}`);
      let x = t, expl = 0;
      for (const [re, to] of rules) {
        if (!bounded) for (const m of inWord(x, re)) out.d.push(`${m[0]} @ ${x.slice(Math.max(0, m.index - 6), m.index + m[0].length + 6)}`);
        x = x.replace(re, (...m) => { const rep = m[0].replace(new RegExp(re.source), to); expl += H(m[0]) - H(rep); return rep; });
      }
      if (x !== r || (H(r) < H(t) && H(t) - H(r) !== expl)) out.c.push(`${t} → ${r}`);
    }
    return out;
  };
  const r12 = scan(U.TM.toTerms12, U.TM.TERM_RULES12, true);
  // 챔버12 규칙은 낱말 단위로만 맞아야 한다 — 앞에 한글이 붙거나 조사 아닌 한글이 뒤따르는 글('이벤트'·'게이트웨이'·'벤트밸브')
  const probe = ["이벤트", "게이트웨이", "벤트밸브", "로드락스", "벤트를", "게이트가", "로드락에서는", "4핀 올림", "클램프"].map((t) => [t, U.TM.toTerms12(t)]);
  const probeOk = probe.map(([t, r]) => `${t}→${r}`).join() === "이벤트→이벤트,게이트웨이→게이트웨이,벤트밸브→벤트밸브,로드락스→로드락스,벤트를→Vent를,게이트가→Gate가,로드락에서는→Loadlock에서는,4핀 올림→4Pin 올림,클램프→클램프";
  check(`ui:terms-words — 낱말 바꾸기 toTerms12(글 ${texts.size}개 = 묶음 ${nBundle} + 기록 ${texts.size - nBundle}): (a) 한글+영문 붙음 0 · (b) 같은 낱말 잇달아 0 · ` +
        "(c) 한글이 줄어든 곳은 규칙 목록 바꾸기뿐 · 낱말 속 바꿈 없음(이벤트·게이트웨이 그대로, 벤트를·게이트가 는 바뀜)",
        texts.size > 1500 && r12.a.length === 0 && r12.b.length === 0 && r12.c.length === 0 && probeOk,
        { a: r12.a.slice(0, 5), b: r12.b.slice(0, 5), c: r12.c.slice(0, 5), probe });
  const rk = scan(U.KT.toTerms, U.KT.OLD_TO_NEW, false);
  console.log(`  (보고) 챔버K toTerms 같은 검사 — (a) ${rk.a.length} · (b) ${rk.b.length} · (c) ${rk.c.length} · 낱말 속 바꿈 ${rk.d.length}` +
              `${rk.d.length ? ` — ${[...new Set(rk.d)].slice(0, 6).join(" · ")}` : ""} (챔버K 는 고치지 않음)`);
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
