"use client";

// 챔버12 로그(W-19 ⑤ — 챔버K W-17·W-18 로그 줄과 같은 규칙). 한 줄 = 시각 | 출처 | 이름 | 내용(빈 칸 없이, 같은 말 두 번 없이).
// 바탕은 챔버K text.logLine(plain) — 출처 = 묶음 eventSources 이름(공정·MFC·Ion Gauge·안전·웹 연결 …), 이름 = 묶음 eventKinds 이름에서
// 출처 낱말을 뺀 것(logView.withoutSource — '공정 | 단계'), 내용 = 사유 이름 > 값으로 만든 글 > 장비 문장을 다듬은 글. 코드·원문은 상세 보기에서만.
// 챔버12 공정 엔진 사건(공정 단계·건너뛰기·일시정지/재개·공정 중 값 바꾸기·레시피 적재·공정 동작)은 장비 data 모양이 챔버K 와 달라 여기서
// 내용을 만든다. PLC 버튼 사건(command/plc_button — D425)은 출처 = 누른 곳(웹·노트북·로봇), 이름 'PLC 버튼', 내용 'CH1 Vent 켜기 · 홍길동'
// (logic.plcButtonLine). 기록 탭 '전체'에서는 챔버에 딸린 줄의 출처 앞에 장소 이름('CH1 공정'). 챔버 나누기는 logic.feedChamber.
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertOctagon, AlertTriangle, BellRing, CheckSquare, Square } from "lucide-react";
import { FS, Btn, Card, Chip, Empty, Tabs } from "../chk/kit";
import { useChk2Mode } from "../chk/mode";
import { adjustLine, fmtDur, logLine, type LogLine } from "../chk/text";
import { ALERT_KEEP, ALERT_MAX_AGE_MS, withoutSource } from "../chk/logView";
import type { FeedItem } from "../chk/useChk2";
import { fmtKst } from "@/lib/ops2/time";
import { byWord } from "@/lib/ops2/chk/plain";
import { blockLabel, chamberState, feedChamber, hasPlcEvent, plcButtonLine } from "./logic";
import { asChk, type Ch12Bundle, type Ch12State } from "./types";
import { reasonLabel } from "../chk/types";
import { CARD, placeName, reasonTip, sourceName12, stepName, toTerms12 } from "@/lib/ops2/ch12/terms";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** 사건을 낸 곳 — 노트북·웹·로봇(장비 data.source·origin·by) */
function who(cd: Obj): string {
  const src = s(cd.origin ?? cd.source);
  const w = src === "local" || src === "hmi" ? "노트북" : src === "web" ? "웹" : src === "robot" ? "로봇" : "";
  const by = byWord(typeof cd.by_name === "string" && cd.by_name ? cd.by_name : cd.by);
  const name = by.includes("@") ? by.split("@")[0] : by;
  return [w, name && name !== w ? name : ""].filter(Boolean).join(" · ");
}

/** 로그 한 줄(챔버12, 평소 보기 글) — 챔버K logLine(plain) 위에 챔버12 공정 사건·PLC 버튼 내용, 같은 말 두 번 막기 */
export function ch12LogLine(b: Ch12Bundle | null, e: FeedItem): LogLine {
  const kb = asChk(b);
  const base0 = logLine(kb, e, { plain: true });
  const base = { ...base0, kind: withoutSource(base0.source, base0.kind) };
  // PLC 버튼(D425): 장비가 plc_button 사건(누가·결과·공정 상태까지)을 내면 'PLC 버튼 받음' 명령 결과 줄은 상세에만(같은 일 두 줄 막기)
  if (e.type === "cmd_result" && (e.data as Obj).kind === "PLC_BUTTON" && hasPlcEvent(b)) return { ...base, main: false };
  if (e.type !== "event") return tidyLine(base);
  const d = e.data as Obj;
  const c = isObj(d.context) ? d.context : {};
  const cd = isObj(c.data) ? c.data : {};
  const msg = s(d.message);
  const step = (type: unknown, label?: unknown) => stepName(kb, { type: s(type) || null, label: s(label) || null }) || blockLabel(b, s(type));
  const by = who(cd) ? ` · ${who(cd)}` : "";
  let text = base.text, kind = base.kind, source = base.source;
  if (c.source === "command" && c.kind === "plc_button") {
    const l = plcButtonLine(b, cd);
    source = l.source;
    kind = b?.eventKinds?.find((x) => x.source === "command" && x.kind === "plc_button")?.label ?? "PLC 버튼";
    text = l.text;
  } else if (c.source === "process") {
    if (c.kind === "block" && cd.type) {
      const no = s(cd.no ?? cd.index), total = num(cd.total), el = num(cd.elapsed_s);
      const res = ({ done: "정상", ok: "정상", skipped: "건너뜀", aborted: "중단", stopped: "정지", error: "오류", failed: "실패" } as Record<string, string>)[s(cd.result)] ?? s(cd.result);
      const pre = cd.auto ? "" : `${no}${total !== null && cd.phase !== "end" ? `/${total}` : ""} `;
      text = cd.phase === "end"
        ? `${pre}${step(cd.type, cd.label)} 끝 ${res}${el !== null ? ` · ${fmtDur(el)}` : ""}`
        : `${pre}${step(cd.type, cd.label)} 시작`;
    } else if (c.kind === "skip" && (cd.type || cd.block_no !== undefined)) {
      text = d.level === "warn" ? `건너뛰지 않음${msg ? ` · ${toTerms12(msg.replace(/\s+—\s+/g, " · "))}` : ""}` : `${s(cd.block_no)} ${step(cd.type)}${by}`;
    } else if (c.kind === "pause" && typeof cd.on === "boolean") {
      kind = cd.on ? "일시정지" : "재개";
      text = `${s(cd.block_no)} ${step(cd.type)}${by}`.trim();
    } else if (c.kind === "adjust" && cd.result === "stepping" && typeof cd.text === "string") {
      text = cd.text;                                             // 가스 단계 규칙 C — 'O2 9.0 → 9.5 → 10 진행 중 2/3'
    } else if (c.kind === "adjust" && cd.device) {
      text = adjustLine(kb, { ...cd, by: who(cd) || byWord(cd.by) }).replace(/^공정 중 수정 · /, "");
    } else if (c.kind === "recipe_loaded") {
      const nb = num(cd.blocks), nr = num(cd.rows);
      text = `'${msg || "이름 없음"}'${nr ? ` · ${nr}행` : ""}${nb ? ` · 단계 ${nb}개` : ""}${by}`;
    } else if (c.kind === "step" && typeof cd.label === "string") {
      text = `${num(cd.index) !== null ? `${s(cd.index)}/${s(cd.total)} ` : ""}${cd.label}`;    // 공정 동작(묶음 16) — v1 스텝 문구는 원시 줄에
    }
  }
  // 같은 글 두 번 막기 — 장비 문구가 코드로 시작하면(예 'STATUS on=1 …') 내용에서 코드를 빼고, 원시 줄에는 코드를 한 번만
  const code = s(d.code);
  if (code && text.startsWith(`${code} `)) text = text.slice(code.length + 1);
  const rule = d.ruleId ? ` [${s(d.ruleId)}]` : "";
  const msgRest = code && msg.startsWith(`${code} `) ? msg.slice(code.length + 1) : msg;      // 원시 줄에는 내용에 없는 장비 문구만
  const raw = `${code}${rule}${msgRest && !text.includes(msgRest) ? ` ${msgRest}` : ""}`;
  return tidyLine({ ...base, kind, text, source: source || sourceName12(b, s(c.source)) || "장비", raw: raw.trim() });
}

/** 줄 다듬기 — 알림창 문구의 빈 줄은 한 줄로, 내용이 이름으로 시작하면 이름을 빼고, 옛 말은 용어표 말로, 출처는 비우지 않는다 */
function tidyLine(l: LogLine): LogLine {
  // 호스트·v1 오류 번호('[E104] …')는 평소 보기에서 뺀다(원시 줄에 그대로)
  let text = toTerms12(l.text.replace(/\n\s*\n+/g, "\n").replace(/\[[A-Z]\d{2,4}\]\s*/g, "")).trim();
  const kind = toTerms12(l.kind);
  if (text === kind) text = "";
  else if (kind && text.startsWith(`${kind} `)) text = text.slice(kind.length + 1).replace(/^[·:]\s*/, "");
  return { ...l, kind, text, source: toTerms12(l.source || "장비") };
}

/** 기록 탭 '전체' — 챔버에 딸린 줄은 출처 앞에 장소 이름('CH1 공정'). PLC 버튼 줄은 내용(버튼 이름)에 장소가 있어 붙이지 않는다 */
const sourceWithPlace = (b: Ch12Bundle | null, e: FeedItem, l: LogLine) => {
  const ch = feedChamber(e);
  const c = isObj((e.data as Obj).context) ? (e.data as Obj).context as Obj : {};
  if (!["ch1", "ch2", "pc", "tsp"].includes(ch) || (c.source === "command" && c.kind === "plc_button")) return l.source ?? "장비";
  const place = placeName(b, ch);
  return l.source?.startsWith(place) ? l.source : `${place} ${l.source ?? ""}`.trim();
};

const LEVEL_TONE: Record<string, string> = { error: "text-[#B42318]", critical: "text-[#B42318]", warn: "text-[#B54708]", info: "text-[#5B6470]" };
const LevelIcon = ({ level }: { level: string }) =>
  level === "warn" ? <AlertTriangle size={11} /> : level === "error" || level === "critical" ? <AlertOctagon size={11} /> : null;

export type FeedFilter = "all" | "ch1" | "ch2" | "pc" | "tsp" | "shared";
const FILTER_KEYS: FeedFilter[] = ["all", "ch1", "ch2", "pc", "tsp", "shared"];
const filters = (b: Ch12Bundle | null) => FILTER_KEYS.map((key) => ({ key, label: key === "all" ? "전체" : placeName(b, key) }));
const inFilter = (e: FeedItem, f: FeedFilter) => {
  if (f === "all") return true;
  const c = feedChamber(e);
  return f === "shared" ? !["ch1", "ch2", "pc", "tsp"].includes(c) : c === f;
};

/** 기록 탭 로그 — 챔버 고르기(전체·CH1·CH2·PC·TSP·공통) · 경고·오류만 · 상세면 전부와 코드 */
export function Ch12EventFeed({ bundle, feed, height = "h-[28rem]" }: { bundle: Ch12Bundle | null; feed: FeedItem[]; height?: string }) {
  const [onlyIssue, setOnlyIssue] = useState(false);
  const [f, setF] = useState<FeedFilter>("all");
  const { detail } = useChk2Mode();
  const box = useRef<HTMLDivElement | null>(null);
  const stick = useRef(true);
  const rows = useMemo(() => feed.map((e) => ({ e, ...ch12LogLine(bundle, e) })), [bundle, feed]);
  const seen = rows.filter((r) => (detail || r.main) && inFilter(r.e, f));
  const shown = onlyIssue ? seen.filter((r) => r.level !== "info") : seen;
  const issues = seen.filter((r) => r.level !== "info").length;
  const newest = feed[feed.length - 1]?.id;
  useEffect(() => {
    const el = box.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [newest, onlyIssue, f]);
  return (
    <Card title={CARD.feed} right={
      <button onClick={() => setOnlyIssue((v) => !v)} aria-pressed={onlyIssue}
        className={`flex items-center gap-1 rounded-lg px-2 py-1 ${FS.small} font-semibold ${onlyIssue ? "bg-[#FEE4E2] text-[#B42318]" : "text-[#5B6470] hover:bg-[#F5F6F8]"}`}>
        {onlyIssue ? <CheckSquare size={12} aria-hidden /> : <Square size={12} aria-hidden />} 경고·오류만{issues > 0 && ` ${issues}`}
      </button>
    }>
      <div className="mb-2"><Tabs small tabs={filters(bundle)} value={f} onChange={setF} /></div>
      {!shown.length ? (
        <p className={`py-6 text-center ${FS.body} text-[#8A929D]`}>{onlyIssue ? "경고·오류가 없습니다" : "로그가 없습니다. 장비가 연결되면 쌓입니다"}</p>
      ) : (
        <div ref={box} onScroll={() => { const el = box.current; if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24; }}
          className={`${height} space-y-1 overflow-y-auto rounded-lg bg-[#F5F6F8] p-2 [overflow-anchor:none]`}>
          {shown.map((r) => (
            <p key={r.e.id} className={`flex items-start gap-2 ${FS.small} leading-snug`} title={detail ? r.raw : r.desc} data-log-line="">
              <span className="shrink-0 tabular-nums text-[#8A929D]">{fmtKst(r.e.ts)}</span>
              <span className="w-28 shrink-0 truncate text-[#5B6470]" data-log-source="">{f === "all" ? sourceWithPlace(bundle, r.e, r) : r.source}</span>
              <span className={`flex shrink-0 items-center gap-1 font-semibold ${LEVEL_TONE[r.level] ?? LEVEL_TONE.info}`} data-log-kind="">
                <LevelIcon level={r.level} />{r.kind}
              </span>
              <span className={`min-w-0 whitespace-pre-line ${r.level === "info" ? "text-[#1B1F24]" : LEVEL_TONE[r.level] ?? LEVEL_TONE.info}`} data-log-text="">
                {r.text}
                {detail && r.raw && <span className="ml-1.5 font-mono text-[#8A929D]">{r.raw}</span>}
              </span>
            </p>
          ))}
        </div>
      )}
    </Card>
  );
}

export const chamberWord = (b: Ch12Bundle | null, c: string) => placeName(b, ["ch1", "ch2", "pc", "tsp"].includes(c) ? c : "shared");

/** 챔버 칸 알림 — 이 챔버의 활성 알람 + 최근 사건(평소 보기 줄, 새것 위), '기록 전체 보기' → 기록 탭(챔버K 알림과 같은 모양) */
/** 알림 시각 — 오늘(한국 시각) 것은 시각만, 아니면 날짜까지(챔버K W-14 와 같게) */
function whenText(iso: string): string {
  const full = fmtKst(iso), today = fmtKst(new Date().toISOString());
  return full.slice(0, 10) === today.slice(0, 10) ? full.slice(-8) : full;
}

/** 운전 탭 알림 띠(W-20 — 챔버K 대기 화면 알림 띠와 같은 모양) — 두 챔버·Plasma Cleaning·TSP·공통 알림을 한 목록에(평소 보기 줄, 최근 60줄,
 *  챔버에 딸린 줄은 출처 앞에 장소 이름). 활성 알람 = 챔버 알람(장소 이름 + 사유 이름) + 장비 알람.
 *  운전 탭 영역(컨테이너 run) 1360px 이상: 오른쪽 1/4 띠 — 높이는 왼쪽 묶음을 따르고(페이지를 늘이지 않음) 목록이 남은 높이를 채워 스크롤,
 *  그보다 좁으면 맨 아래 한 줄 전체 · 목록 최대 240px */
/** 알림 줄(챔버K logView.alertLines 와 같은 규칙 — 사용자 결정 2026-11-26): 경고·오류 수준 사건, 거부·실패한 명령(설정 결과 포함),
 *  정상이 아니게 끝난 공정만. 24시간이 지난 줄은 빼고 최근 keep(20) 줄, 최신이 위. 줄 글은 챔버12 로그 줄(ch12LogLine — 출처 앞에 장소 이름).
 *  활성 알람은 부르는 쪽이 따로(alarmList12). 운전 대시보드도 같은 함수 */
export function alertLines12(bundle: Ch12Bundle | null, feed: FeedItem[], nowMs: number, keep = ALERT_KEEP) {
  return feed.map((e) => ({ e, ...ch12LogLine(bundle, e) }))
    .filter((r) => (r.level === "warn" || r.level === "error" || r.level === "critical") && !(nowMs - Date.parse(r.e.ts) > ALERT_MAX_AGE_MS))
    .slice(-keep).reverse().map((r) => ({ ...r, source: sourceWithPlace(bundle, r.e, r) }));
}

/** 활성 알람(챔버별 <c>.proc.alarms + state.alarms) — 이름은 묶음 사유 이름(없으면 '알람', 코드는 상세 보기에서만) */
export function alarmList12(bundle: Ch12Bundle | null, st: Ch12State | null, detail: boolean): { ruleId: string; text: string; tip?: string; chamber?: string }[] {
  const name = (code: string) => { const l = reasonLabel(asChk(bundle), code); return l !== code ? l : detail ? code : "알람"; };
  const alarms: { ruleId: string; text: string; tip?: string; chamber?: string }[] = [];
  const own = new Set<string>();
  for (const c of ["ch1", "ch2", "pc", "tsp"] as const) {
    for (const r of chamberState(st, c)?.alarms ?? []) {
      own.add(r);
      alarms.push({ ruleId: `${c}:${r}`, text: `${placeName(bundle, c)} ${name(r)}`, tip: reasonTip(asChk(bundle), r, detail), chamber: c });
    }
  }
  for (const a of st?.alarms ?? []) {
    if (own.has(a.ruleId)) continue;
    const t = a.code ? reasonLabel(asChk(bundle), a.code) : a.ruleId;
    alarms.push({ ruleId: a.ruleId, text: a.chamber ? `${placeName(bundle, a.chamber)} ${t}` : t, tip: reasonTip(asChk(bundle), a.code, detail),
      chamber: a.chamber ?? undefined });
  }
  return alarms;
}

export function RunAlerts({ bundle, st, feed, onLog, nowMs }: {
  bundle: Ch12Bundle | null; st: Ch12State | null; feed: FeedItem[]; onLog?: () => void; nowMs: number;
}) {
  const { detail } = useChk2Mode();
  // 1분마다만 다시 거른다(24시간 기준 — 매초 바뀔 일이 없다)
  const minute = Math.floor(nowMs / 60_000);
  const lines = useMemo(() => alertLines12(bundle, feed, minute * 60_000), [bundle, feed, minute]);
  const alarms = alarmList12(bundle, st, detail);
  return (
    <Card title={<><BellRing size={15} /> {CARD.alerts}</>} right={onLog && <Btn size="sm" kind="ghost" onClick={onLog}>기록 전체 보기</Btn>}
      className="flex flex-col @min-[1360px]/run:absolute @min-[1360px]/run:inset-0">
      <p className={`mb-2 ${FS.body} text-[#5B6470]`}>
        활성 알람 {alarms.length ? <Chip tone="alarm">{alarms.length}개</Chip> : <b className="text-[#1B1F24]">없음</b>}
      </p>
      {alarms.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">{alarms.map((a) => <Chip key={a.ruleId} tone="alarm" title={a.tip}>{a.text}</Chip>)}</div>
      )}
      {lines.length ? (
        <ul className="max-h-[240px] space-y-1.5 overflow-y-auto pr-1 @min-[1360px]/run:min-h-0 @min-[1360px]/run:max-h-none @min-[1360px]/run:flex-1" data-alert-list="">
          {lines.map((r) => (
            <li key={r.e.id} className={`${FS.body} leading-snug`} title={r.desc} data-log-line="">
              <span className={`mr-1.5 tabular-nums text-[#5B6470] ${FS.small}`}>{whenText(r.e.ts)}</span>
              <span className={`mr-1.5 text-[#5B6470] ${FS.small}`} data-log-source="">{r.source}</span>
              {r.level === "warn" ? <Chip tone="warn">{r.kind}</Chip> : r.level === "error" || r.level === "critical"
                ? <Chip tone="alarm">{r.kind}</Chip> : <b className="text-[#1B1F24]">{r.kind}</b>}
              <span className={`ml-1 whitespace-pre-line ${r.level === "warn" ? "text-[#B54708]" : r.level === "error" || r.level === "critical" ? "text-[#B42318]" : "text-[#5B6470]"}`}>{r.text}</span>
            </li>
          ))}
        </ul>
      ) : <Empty>알림 없음</Empty>}
    </Card>
  );
}
