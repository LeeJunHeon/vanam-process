// 챔버K 로그·알림 줄(W-16) — text.logLine 을 평소 보기 글(plain)로 부르고, 수동 조작 명령 결과에는 어떤 조작이었는지(블록 종류)를 붙인다.
// 블록 종류: 웹 조작 기록(commands — 같은 cmdId 의 args.block.type) → 없으면(노트북 화면·옛 기록) 바로 뒤에 온 공정 사건(블록 시작·수동 조작)의 type.
import { logLine, type LogLine } from "./text";
import { reasonLabel, type Bundle, type CmdRow } from "./types";
import { isCode } from "@/lib/ops2/chk/plain";
import type { FeedItem } from "./useChk2";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

function blockTypeOf(feed: FeedItem[], i: number, byId: Map<string, CmdRow>): string | null {
  const d = feed[i].data;
  if (d.kind !== "MANUAL_BLOCK") return null;
  const row = typeof d.cmdId === "string" ? byId.get(d.cmdId) : undefined;
  const a = row?.args;
  if (isObj(a) && isObj(a.block) && typeof a.block.type === "string") return a.block.type;
  if (d.status !== "accepted") return null;
  for (let j = i + 1; j < Math.min(feed.length, i + 12); j++) {
    const e = feed[j];
    if (e.type === "cmd_result") break;
    const c = isObj(e.data.context) ? e.data.context : {};
    const cd = isObj(c.data) ? c.data : {};
    if (e.type === "event" && c.source === "process" && (c.kind === "block" || c.kind === "manual") && typeof cd.type === "string") return cd.type;
  }
  return null;
}

/** 피드 → 평소 보기 줄(코드·local 없음) */
export function chkLines(bundle: Bundle | null, feed: FeedItem[], commands?: CmdRow[]): (LogLine & { e: FeedItem })[] {
  const byId = new Map((commands ?? []).map((c) => [c.id, c]));
  return feed.map((e, i) => ({ e, ...logLine(bundle, e, { plain: true, blockType: e.type === "cmd_result" ? blockTypeOf(feed, i, byId) : null }) }));
}

/** 사유 이름 — 묶음에 이름이 없으면(코드 그대로면) fallback(기본 빈 글). 코드는 상세 보기에서만 */
export function reasonText(bundle: Bundle | null, code: string | null | undefined, fallback = ""): string {
  if (!code) return "";
  const x = reasonLabel(bundle, code);
  return x === code || isCode(x) ? fallback : x;
}
