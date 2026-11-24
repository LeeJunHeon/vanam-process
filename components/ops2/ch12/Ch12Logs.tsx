"use client";

// 챔버12 로그(2026-11-18 화면 다시 만들기) — 챔버K Chk2Logs EventFeed·Chk2Run 알림과 같은 모양·규칙.
// 기본 보기 = 묶음 eventKinds 의 main + 경고·오류 + 공정 시작·끝 + 명령 결과 + 설정 결과(챔버K logLine 그대로), '상세'를 켜면 전부와 코드.
// 챔버12 공정 엔진 사건(공정 단계·건너뛰기·일시정지/재개·순서 고침·공정 중 값 바꾸기·레시피 적재)은 장비 data 모양이 챔버K 와 달라 여기서 글을 만든다.
// 같은 글이 두 번 붙지 않게: 장비 문구가 코드로 시작하면(예 'STATUS on=1 …') 글에서 코드를 빼고, 상세의 원시 줄에는 글에 이미 있는 문구를 다시 붙이지 않는다.
// 챔버 나누기는 사건 context.chamber(run_*·cmd_result 는 data.chamber·args.chamber) — logic.feedChamber.
// PLC 버튼 사건(command/plc_button — D425)은 'PLC 버튼 · CH1 벤트 켬 · 홍길동(웹)'(공정 중이면 '(CH1 공정 중 · 블록)', 거부면 이유) —
// 그 챔버 탭(장비 context.chamber), 계정은 상세 원시 줄에만. 챔버K 로그 줄(chk/text)은 그대로.
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertOctagon, AlertTriangle, BellRing, CheckSquare, Square } from "lucide-react";
import { FS, Btn, Card, Chip, Empty, Tabs } from "../chk/kit";
import { useChk2Mode } from "../chk/mode";
import { adjustLine, fmtDur, logLine, type LogLine } from "../chk/text";
import type { FeedItem } from "../chk/useChk2";
import { fmtKst } from "@/lib/ops2/time";
import { blockLabel, feedChamber, hasPlcEvent, plcButtonLine } from "./logic";
import { asChk, type Ch12Bundle } from "./types";
import { placeName } from "@/lib/ops2/ch12/terms";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const RESULT: Record<string, string> = { done: "정상", ok: "정상", skipped: "건너뜀", aborted: "중단", stopped: "정지", error: "오류", failed: "실패" };

/** 로그 한 줄(챔버12) — 챔버K logLine 위에 챔버12 공정 사건 글·같은 글 두 번 막기 */
export function ch12LogLine(b: Ch12Bundle | null, e: FeedItem): LogLine {
  const base = logLine(asChk(b), e);
  // PLC 버튼(D425): 장비가 plc_button 사건(누가·결과·공정 상태까지)을 내면 'PLC 버튼 — 받음' 명령 결과 줄은 상세에만(같은 일 두 줄 막기)
  if (e.type === "cmd_result" && (e.data as Obj).kind === "PLC_BUTTON" && hasPlcEvent(b)) return { ...base, main: false };
  if (e.type !== "event") return base;
  const d = e.data as Obj;
  const c = isObj(d.context) ? d.context : {};
  const cd = isObj(c.data) ? c.data : {};
  const code = s(d.code), msg = s(d.message);
  const who = cd.by ? ` · ${s(cd.by)}` : cd.source ? ` · ${s(cd.source)}` : "";
  const bn = (t: unknown, l?: unknown) => {
    const name = blockLabel(b, s(t) || null);
    return `${name}${l && s(l) !== name && s(l) !== s(t) ? `(${s(l)})` : ""}`;
  };
  let text = base.text, kind = base.kind;
  if (c.source === "command" && c.kind === "plc_button") {      // 'PLC 버튼 · CH1 벤트 켬 · 홍길동(웹) (CH1 공정 중 · 메인 공정(시간))'
    kind = "PLC 버튼";
    text = plcButtonLine(b, cd);
  } else if (c.source === "process") {
    if (c.kind === "block" && cd.type) {
      const no = s(cd.no), total = num(cd.total), el = num(cd.elapsed_s);
      text = cd.phase === "end"
        ? `${no} ${bn(cd.type, cd.label)} 끝 — ${RESULT[s(cd.result)] ?? s(cd.result)}${el !== null ? `, ${fmtDur(el)}` : ""}`
        : `${no}${total !== null ? `/${total}` : ""} ${bn(cd.type, cd.label)} 시작${cd.auto ? "(자동 끝 정지)" : ""}`;
    } else if (c.kind === "skip" && (cd.type || cd.block_no !== undefined)) {
      text = d.level === "warn" ? `건너뛰지 않음 — ${msg}` : `${s(cd.block_no)} ${bn(cd.type)} 건너뜀${who}`;
    } else if (c.kind === "pause" && typeof cd.on === "boolean") {
      kind = cd.on ? "일시정지" : "재개";
      text = `${s(cd.block_no)} 블록 ${cd.on ? "일시정지" : "재개"}${who}`;
    } else if (c.kind === "adjust" && cd.result === "stepping" && typeof cd.text === "string") {
      text = cd.text;                                             // 가스 단계 규칙 C — 'O2 9.0 → 9.5 → 10 진행 중 2/3'
    } else if (c.kind === "adjust" && cd.device) {
      text = adjustLine(asChk(b), cd);
    } else if (c.kind === "recipe_loaded") {
      const nb = num(cd.blocks), nr = num(cd.rows);
      text = `'${msg || "이름 없음"}'${nr ? ` · ${nr}행` : ""}${nb ? ` · 블록 ${nb}개` : ""}${who}`;
    }
  }
  text = text.replace(/\n\s*\n+/g, "\n");                       // 알림창 문구의 빈 줄은 한 줄로(로그 줄 사이가 벌어지지 않게)
  // 같은 글 두 번 막기 — 문구가 코드로 시작하면 빼고, 원시 줄(상세)에는 글에 없는 것만
  if (code && text.startsWith(`${code} `)) text = text.slice(code.length + 1);
  const rule = d.ruleId ? ` [${s(d.ruleId)}]` : "";
  const rest = msg && !text.includes(msg.startsWith(`${code} `) ? msg.slice(code.length + 1) : msg) ? ` ${msg}` : "";
  return { ...base, kind, text, raw: `${code}${rule}${rest}`.trim() };
}

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
    <Card title="로그" right={
      <button onClick={() => setOnlyIssue((v) => !v)} aria-pressed={onlyIssue}
        className={`flex items-center gap-1 rounded-lg px-2 py-1 ${FS.small} font-semibold ${onlyIssue ? "bg-[#FEE4E2] text-[#B42318]" : "text-[#5B6470] hover:bg-[#F5F6F8]"}`}>
        {onlyIssue ? <CheckSquare size={12} aria-hidden /> : <Square size={12} aria-hidden />} 경고·오류만{issues > 0 && ` ${issues}`}
      </button>
    }>
      <div className="mb-2"><Tabs small tabs={filters(bundle)} value={f} onChange={setF} /></div>
      {!shown.length ? (
        <p className={`py-6 text-center ${FS.body} text-[#8A929D]`}>{onlyIssue ? "경고·오류가 없습니다" : "로그가 없습니다 — 장비가 연결되면 쌓입니다"}</p>
      ) : (
        <div ref={box} onScroll={() => { const el = box.current; if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24; }}
          className={`${height} space-y-1 overflow-y-auto rounded-lg bg-[#F5F6F8] p-2 [overflow-anchor:none]`}>
          {shown.map((r) => (
            <p key={r.e.id} className={`flex items-start gap-2 ${FS.small} leading-snug`} title={detail ? r.raw : undefined}>
              <span className="shrink-0 tabular-nums text-[#8A929D]">{fmtKst(r.e.ts)}</span>
              {f === "all" && <span className="w-12 shrink-0 font-semibold text-[#5B6470]">{chamberWord(bundle, feedChamber(r.e))}</span>}
              <span className={`flex shrink-0 items-center gap-1 font-semibold ${LEVEL_TONE[r.level] ?? LEVEL_TONE.info}`}>
                <LevelIcon level={r.level} />{r.kind}
              </span>
              <span className={`min-w-0 whitespace-pre-line ${LEVEL_TONE[r.level] ?? LEVEL_TONE.info}`}>
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
export function ChamberLog({ bundle, feed, ch, alarms, onLog, max = 12 }: {
  bundle: Ch12Bundle | null; feed: FeedItem[]; ch: string; alarms: { ruleId: string; text: string }[]; onLog?: () => void; max?: number;
}) {
  const lines = useMemo(() => feed.filter((e) => feedChamber(e) === ch).map((e) => ({ e, ...ch12LogLine(bundle, e) }))
    .filter((r) => r.main).slice(-max).reverse(), [bundle, feed, ch, max]);
  return (
    <Card title={<><BellRing size={15} /> 알림·로그</>} right={onLog && <Btn size="sm" kind="ghost" onClick={onLog}>기록 전체 보기</Btn>}>
      <p className={`mb-2 ${FS.body} text-[#5B6470]`}>
        활성 알람 {alarms.length ? <Chip tone="alarm">{alarms.length}개</Chip> : <b className="text-[#1B1F24]">없음</b>}
      </p>
      {alarms.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">{alarms.map((a) => <Chip key={a.ruleId} tone="alarm">{a.text}</Chip>)}</div>
      )}
      {lines.length ? (
        <ul className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
          {lines.map((r) => (
            <li key={r.e.id} className={`${FS.body} leading-snug`}>
              <span className={`mr-1.5 tabular-nums text-[#5B6470] ${FS.small}`}>{fmtKst(r.e.ts).slice(-8)}</span>
              {r.level === "warn" ? <Chip tone="warn">{r.kind}</Chip> : r.level === "error" || r.level === "critical"
                ? <Chip tone="alarm">{r.kind}</Chip> : <b className="text-[#1B1F24]">{r.kind}</b>}
              <span className={`ml-1 whitespace-pre-line ${r.level === "warn" ? "text-[#B54708]" : r.level === "error" || r.level === "critical" ? "text-[#B42318]" : "text-[#5B6470]"}`}>{r.text}</span>
            </li>
          ))}
        </ul>
      ) : <Empty>최근 사건이 없습니다</Empty>}
    </Card>
  );
}
