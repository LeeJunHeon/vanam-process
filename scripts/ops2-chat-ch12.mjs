// 챔버12(CH12) 구글챗 카드 골든 — npm run ops2:chat-ch12 [-- --file <골든 파일>] [-- --show <경우 이름>]
// lib/ops2/ch12/chat-golden/web_ch12_chat.json(장비 envelope 표본 → v1 controller/chat_notifier.py ChatNotifier 를 그대로 돌린 카드 JSON)을
// lib/ops2/ch12/chatCards.ts buildCh12Items 가 같게 내는지 본다(DB 없이 — 순수 함수).
//  - 경우마다 envs 를 빈 노티파이어 상태로 넣고, 보낼 카드(skip 없는 것, delayMs 가 있는 것은 뒤로 — 보내는 순서)의 body 가 expect 와 같은가
//  - repeat: 첫 카드 finish(반복) — v1 60 s 중복 억제 뒤 부제 끝 '직전 N초 동안 같은 오류 n회 반복'
//  - summary: 만료된 다른 열쇠 요약 카드 errorSummaryCard · tail: 그 뒤 카드
//  - skipped: 억제(PLC 연결계 E401·E402)한 수 · channel: 모든 카드의 채널
// 그리고 v1 에 없는 새 카드(재시작·이어가기 결과 — 지시 3장 (7))와 sim 규칙·채널은 아래 NEW 에서 문구를 직접 본다.
// 전송 폭주 보호(lib/ops2/ch12/chatLimits.ts — v1 _schedule_post·_annotate_dropped)는 v1 시험 tests/test_leak_guards.py
// test_4·4b·9·10 의 숫자와 v1 _annotate_dropped 를 실제로 돌린 결과(아래 LIMIT_V1)로 본다.
// 새 의존성 없이: node 가 .ts 의 타입만 지우고 실행한다(Node 22.18+/23.6+ 기본). 다른 것이 하나라도 있으면 exit 1.
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

registerHooks({
  resolve(spec, ctx, next) {
    if (/^\.\.?\//.test(spec) && !/\.[cm]?[jt]s$/.test(spec) && ctx.parentURL?.endsWith(".ts")) return next(`${spec}.ts`, ctx);
    return next(spec, ctx);
  },
});
const C = await import("../lib/ops2/ch12/chatCards.ts");
const LIM = await import("../lib/ops2/ch12/chatLimits.ts");

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const file = arg("--file") ? resolve(arg("--file")) : resolve(root, "lib/ops2/ch12/chat-golden/web_ch12_chat.json");
const show = arg("--show");
const raw = JSON.parse(readFileSync(file, "utf8"));

function same(a, b, path, out) {
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      out.push(`${path}: 웹 ${JSON.stringify(a)?.slice(0, 400)} / v1 ${JSON.stringify(b)?.slice(0, 400)}`);
      return;
    }
    a.forEach((x, i) => same(x, b[i], `${path}[${i}]`, out));
    return;
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.join("|") !== kb.join("|")) out.push(`${path}: 키 웹 ${ka.join(",")} / v1 ${kb.join(",")}`);
    for (const k of new Set([...ka, ...kb])) same(a[k], b[k], `${path}.${k}`, out);
    return;
  }
  if (a !== b) out.push(`${path}: 웹 ${JSON.stringify(a)} / v1 ${JSON.stringify(b)}`);
}

const build = (c) => C.buildCh12Items(c.envs, { now: new Date(c.now), skewMs: 0 }, C.emptyState(), C.DEFAULT_CFG);
const order = (items) => items.filter((i) => !i.skip).map((it, k) => [it, k])
  .sort((x, y) => (x[0].delayMs ?? 0) - (y[0].delayMs ?? 0) || x[1] - y[1]).map((x) => x[0]);

let failed = false;
let ok = 0;
const bad = [];
for (const c of raw.cases) {
  const diffs = [];
  try {
    const items = build(c);
    const sent = order(items);
    if (show === c.name) console.log(JSON.stringify(items, (k, v) => (k === "finish" ? undefined : v), 1));
    same(sent.map((i) => i.body), c.expect, "cards", diffs);
    if (c.channel) for (const i of sent) if (i.channel !== c.channel) diffs.push(`channel 웹 ${i.channel} / 기대 ${c.channel}`);
    if (c.skipped !== undefined) same(items.filter((i) => i.skip).length, c.skipped, "skipped", diffs);
    if (c.repeat) {
      const f = sent[0]?.finish;
      if (!f) diffs.push("repeat: 첫 카드에 finish 없음");
      else same(f({ n: c.repeat.n, elapsedS: c.repeat.elapsedS }).body, c.repeat.expect, "repeat", diffs);
    }
    if (c.summary) {
      const sub = sent[0]?.dedup?.summarySub;
      if (!sub) diffs.push("summary: summarySub 없음");
      else same(C.errorSummaryCard(sub, { n: c.summary.n, elapsedS: c.summary.elapsedS }).body, c.summary.expect, "summary", diffs);
    }
  } catch (e) {
    diffs.push(`웹 계산이 멈춤: ${e?.stack?.split("\n").slice(0, 3).join(" ") ?? e}`);
  }
  if (diffs.length) bad.push({ name: c.name, diffs });
  else ok += 1;
}
console.log(`골든 ${file.slice(root.length + 1)} (CH12 구글챗 — v1 ChatNotifier)`);
console.log(`  v1 ${raw._출처?.v1 ?? "?"}`);
for (const b of bad) {
  console.log(`  ✗ ${b.name}`);
  for (const d of b.diffs.slice(0, 8)) console.log(`      ${d}`);
}
console.log(`  카드 경우 ${raw.cases.length} · 같음 ${ok} · 다름 ${bad.length}`);
failed ||= bad.length > 0;

// ───────────── v1 에 없는 새 카드·포털 규칙(문구를 직접) ─────────────
const NOW = "2026-10-30T03:00:00.000Z";
const e = (type, data, id) => ({ id, instance: "new-0001", seq: 1, ts: NOW, type, data });
const ctxEv = (chamber, kind, message, data, code = kind.toUpperCase(), level = "info") =>
  ({ level, code, ruleId: null, message, context: { source: "process", chamber, kind, origin: `engine:${chamber}`, ...(data ? { data } : {}) } });
const widgets = (it) => it.body.cardsV2[0].card.sections[0].widgets;
const field = (it, k) => widgets(it).find((w) => w.decoratedText?.topLabel === k)?.decoratedText.text;
const sub = (it) => widgets(it)[1]?.textParagraph?.text;
const NEW = [];
const check = (name, cond, got) => NEW.push({ name, ok: !!cond, got });
{
  const st = C.emptyState();
  const items = C.buildCh12Items([
    e("run_start", { runId: "r1", chamber: "ch1", name: "Ti 100nm", stepNo: 1, params: { process_note: "Ti 100nm", process_name: "Ti 100nm" } }, "a1"),
    e("event", ctxEv("ch1", "resumed", "복구됨(공백 12 s)", { run_id: "r1", gap_s: 12.4, block: { no: 5, label: "메인" },
      checks: [{ name: "gas", ok: true }, { name: "pressure", ok: true }] }), "a2"),
  ], { now: new Date(NOW) }, st);
  const r = items[1];
  check("이어가기 카드 1장(kind resumed)", items.length === 2 && r.kind === "resumed", items.map((i) => i.kind));
  check("이어가기 제목·부제", widgets(r)[0].textParagraph.text === "<b>✅ 공정 이어가기</b>" && sub(r) === "CH1 · Ti 100nm", widgets(r).slice(0, 2));
  check("이어가기 결과·블록·확인", field(r, "결과") === "프로그램 재시작 뒤 이어감(공백 12 s)" && field(r, "이어간 블록") === "5 메인"
        && field(r, "확인") === "2/2 통과", widgets(r));
}
{
  const st = C.emptyState();
  const items = C.buildCh12Items([
    e("run_start", { runId: "r2", chamber: "ch2", name: "Cu", stepNo: 1, params: { process_note: "Cu", process_name: "Cu" } }, "b1"),
    e("run_end", { runId: "r2", chamber: "ch2", result: "error", reasonCode: "PROGRAM_RESTART",
      summary: { name: "Cu", detail: { gap_s: 95, checks: [{ name: "power_output", ok: false, detail: "DC 출력 꺼짐" }, { name: "gas", ok: true }] } } }, "b2"),
  ], { now: new Date(NOW) }, st);
  const r = items[1];
  check("이어가지 못함 — 종료 카드 1장(실패 이유 글 없음)", items.length === 2 && r.kind === "run_end", items.map((i) => i.kind));
  check("이어가지 못함 결과·원인", field(r, "결과") === "프로그램 재시작 — 이어가지 못해 안전 정지(공백 95 s)"
        && field(r, "원인") === " • power_output: DC 출력 꺼짐" && sub(r) === "CH2 · Cu", widgets(r));
}
{
  // 허브가 재시작 뒤 열린 공정을 몰라 run_end 를 event 로 낸 경우
  const items = C.buildCh12Items([e("event", ctxEv("ch1", "run_end", "Ti", { run_id: "r3", status: "error" }, "PROGRAM_RESTART", "warn"), "c1")],
    { now: new Date(NOW) }, C.emptyState());
  check("event run_end PROGRAM_RESTART → 재시작 카드", items.length === 1 && field(items[0], "결과")?.startsWith("프로그램 재시작"), items.map((i) => i.title));
  const other = C.buildCh12Items([e("event", ctxEv("ch1", "run_end", "x", {}, "PREFLIGHT_FAILED", "error"), "c2")], { now: new Date(NOW) }, C.emptyState());
  check("시작 전 거부 run_end event → 카드 없음(v1 도 없음)", other.length === 0, other.map((i) => i.title));
}
{
  // 늦게 받음 — 10 분 넘은 원인은 skip, 종료 카드만 보냄
  const old = "2026-10-30T02:00:00.000Z";
  const items = C.buildCh12Items([
    { ...e("event", ctxEv("ch1", "chat", "[OES] 실패: x", null, "CHAT", "warn"), "d1"), ts: old },
    { ...e("run_end", { runId: "r4", chamber: "ch1", result: "done", summary: { name: "P" } }, "d2"), ts: old },
  ], { now: new Date(NOW) }, C.emptyState());
  check("늦게 받음 — 글은 skip, 종료 카드는 보냄(늦게 받음 칸)", items[0].skip === "늦게 받음" && !items[1].skip && field(items[1], "⚠ 늦게 받음"),
        items.map((i) => [i.kind, i.skip]));
}
{
  // 일반 사건(error 수준·안전 규칙 등)은 v1 에 없던 알림 — 카드 없음(새 알림을 늘리지 않음)
  const items = C.buildCh12Items([
    e("event", { level: "error", code: "INTERNAL_ERROR", message: "x", context: { source: "process", chamber: "ch1", kind: "internal_error" } }, "e1"),
    e("event", { level: "warn", code: "S12", ruleId: "S12", message: "x", context: { source: "safety", chamber: "ch2", kind: "fired" } }, "e2"),
    e("event", { level: "warn", code: "UPLINK_DOWN", message: "x", context: { source: "uplink", chamber: "shared", kind: "uplink_down" } }, "e3"),
    e("event", { level: "warn", code: "POPUP", message: "x", context: { source: "process", chamber: "ch1", kind: "popup" } }, "e4"),
  ], { now: new Date(NOW) }, C.emptyState());
  check("v1 에 없던 사건은 카드 없음", items.length === 0, items.map((i) => i.title));
}
{
  // selfwatch 는 PLC 웹훅(없으면 공정 웹훅 — v1 chat_plc or chat_ch1) · 모니터·OES·로봇은 자기 채널
  const items = C.buildCh12Items([e("event", { level: "warn", code: "SELFWATCH", message: "자원 임계 초과: x", context: { source: "selfwatch", chamber: "shared", kind: "selfwatch" } }, "f1")],
    { now: new Date(NOW) }, C.emptyState());
  check("selfwatch 채널 plc → 없으면 process", items[0]?.channel === "plc" && items[0]?.fallback === "process", items.map((i) => [i.channel, i.fallback]));
}
{
  const cfg = C.chatCfgOf({ CHAT_ERR_DEDUP_S: 0, CHAT_PLC_LINK_SUPPRESS: false, CHAT_PLC_LINK_CODES: '["e401"]' });
  check("설정값 읽기(CHAT_ERR_DEDUP_S·CHAT_PLC_LINK_*)", cfg.dedupS === 0 && cfg.plcSuppress === false && cfg.plcCodes.join() === "E401", cfg);
  const items = C.buildCh12Items([e("event", { level: "error", code: "ERROR_EVENT", message: "m", context: { source: "host", chamber: "shared",
    kind: "error_event", data: { src: "HOST", code: "E401", message: "PLC 응답 없음" } } }, "g1")], { now: new Date(NOW) }, C.emptyState(), cfg);
  check("CHAT_PLC_LINK_SUPPRESS 끄면 E401 카드 보냄", items.length === 1 && !items[0].skip, items.map((i) => i.skip));
}
{
  // ── 전송 폭주 보호(v1 CHAT_POST_CONCURRENCY·CHAT_PENDING_MAX·CHAT_PENDING_HARD_MAX) ──
  const d = C.chatCfgOf({});
  check("설정 기본값 = v1(4·200·1000)", d.postConcurrency === 4 && d.pendingMax === 200 && d.pendingHardMax === 1000, d);
  const c2 = C.chatCfgOf({ CHAT_POST_CONCURRENCY: 2, CHAT_PENDING_MAX: 0, CHAT_PENDING_HARD_MAX: 5.7 });
  check("설정값 읽기 max(1, int(값))(CHAT_POST_CONCURRENCY·CHAT_PENDING_*)", c2.postConcurrency === 2 && c2.pendingMax === 1 && c2.pendingHardMax === 5, c2);
  check("동시 POST — 보내기는 하나씩(≤ CHAT_POST_CONCURRENCY, v1 test_4b 의 2 도)", LIM.SENDER_CONCURRENCY <= c2.postConcurrency
        && LIM.SENDER_CONCURRENCY <= d.postConcurrency, LIM.SENDER_CONCURRENCY);
  // v1 test_4: 일반 카드 1000 장 → 대기 ≤ 200, 드롭 800 — 자리가 나면 다음 카드(urgent)에 '생략된 알림 800건' 1회, 0 으로
  const g = { pending: 0, dropped: 0 };
  const res = Array.from({ length: 1000 }, () => LIM.admit(g, false, d));
  check("일반 카드 1000 → 통과 200 · 드롭 800", res.filter((r) => r.ok).length === 200 && g.pending === 200 && g.dropped === 800, g);
  g.pending = 0;                                                     // 보냄(대기 비움)
  const nx = LIM.admit(g, true, d);
  check("다음 카드에 드롭 건수 800 한 번 · 0 으로", nx.ok && nx.note === 800 && g.dropped === 0 && LIM.admit(g, false, d).note === 0, [nx, g]);
  // v1 test_9·10: urgent 는 소프트 상한 통과(드롭 표기 소진), 하드 상한에서는 드롭
  const u = { pending: 200, dropped: 5 };
  const r9 = LIM.admit(u, true, d), r9n = LIM.admit(u, false, d);
  check("urgent 는 CHAT_PENDING_MAX 통과(표기 5) · 일반은 드롭", r9.ok && r9.note === 5 && !r9n.ok && u.dropped === 1, [r9, r9n, u]);
  const h = { pending: 1000, dropped: 0 };
  check("urgent 도 CHAT_PENDING_HARD_MAX 에서 드롭", !LIM.admit(h, true, d).ok && h.dropped === 1, h);
  // v1 _annotate_dropped 를 실제로 돌린 결과(controller/chat_notifier.py:223-243)
  const LIMIT_V1 = [
    [C.card("t", "", "INFO", null), 800, {"cardsV2": [{"cardId": "notify-card", "card": {"header": {"title": "Sputter Controller", "subtitle": "Status Notification"}, "sections": [{"widgets": [{"textParagraph": {"text": "<b>ℹ️ t</b>"}}, {"textParagraph": {"text": "(전송 실패로 생략된 알림 800건)"}}]}]}}]}],
    [{ text: "a" }, 3, { text: "a\n(전송 실패로 생략된 알림 3건)" }],
    [{ x: 1 }, 2, { x: 1, text: "(전송 실패로 생략된 알림 2건)" }],
  ];
  for (const [pl, n, want] of LIMIT_V1) {
    const out = [];
    same(LIM.annotateDropped(pl, n), want, "annotate", out);
    check(`생략 표기(v1 _annotate_dropped) ${JSON.stringify(pl).slice(0, 30)}`, !out.length && JSON.stringify(pl) !== JSON.stringify(want), out);
  }
  // 묶음(v1 ChatNotifier 인스턴스)·urgent 종류
  const grp = [LIM.pendGroupOf("run_start", "process", "CH1"), LIM.pendGroupOf("plc_link", "plc", null), LIM.pendGroupOf("error_event", "plc", "HOST"),
               LIM.pendGroupOf("client", "client", null), LIM.pendGroupOf("monitor", "monitor", null), LIM.pendGroupOf("oes", "oes", null),
               LIM.pendGroupOf("error_event", "process", "HOST"), LIM.pendGroupOf("run_end", "process", "TSP")];
  check("대기 묶음 = v1 노티파이어(CH1·PLC·PLC·CLIENT·없음·없음·HOST·TSP)", grp.join() === "CH1,PLC,PLC,CLIENT,,,HOST,TSP", grp);
  const urg = ["run_start", "error_event", "heater", "plc_link", "client"].every((k) => LIM.URGENT_KINDS.has(k))
    && !["run_end", "run_fail", "text", "aggregate", "resumed", "monitor", "oes"].some((k) => LIM.URGENT_KINDS.has(k));
  check("urgent 종류 = v1 urgent=True 카드(공정 시작·장비 오류·히터·PLC 연결·로봇 클라이언트)", urg, [...LIM.URGENT_KINDS]);
}
for (const n of NEW) if (!n.ok) console.log(`  ✗ ${n.name}\n      ${JSON.stringify(n.got).slice(0, 600)}`);
console.log(`  새 카드·포털 규칙 ${NEW.length} · 맞음 ${NEW.filter((n) => n.ok).length} · 틀림 ${NEW.filter((n) => !n.ok).length}`);
failed ||= NEW.some((n) => !n.ok);
process.exit(failed ? 1 : 0);
