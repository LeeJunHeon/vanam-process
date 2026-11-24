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

/** 출처 칸을 같이 보이는 줄(알림·기록)에서는 이름이 출처 낱말로 시작하면 그 낱말을 뺀다(W-18 — "공정 | 시작", "웹 연결 | 끊김").
 *  빼고 나면 어색한 이름은 짧은 이름으로("공정 중 수정" → "값 수정", "공정 중 PLC 버튼" → "PLC 버튼") */
const AFTER_STRIP: Record<string, string> = { "중 수정": "값 수정", "중 PLC 버튼": "PLC 버튼" };
export function withoutSource(source: string | undefined, kind: string): string {
  if (!source || !kind.startsWith(`${source} `)) return kind;
  const k = kind.slice(source.length + 1).trim();
  return AFTER_STRIP[k] ?? (k || kind);
}

/** 피드 → 평소 보기 줄(코드·local 없음, 출처 칸과 겹치는 이름 낱말은 뺌) */
export function chkLines(bundle: Bundle | null, feed: FeedItem[], commands?: CmdRow[]): (LogLine & { e: FeedItem })[] {
  const byId = new Map((commands ?? []).map((c) => [c.id, c]));
  return feed.map((e, i) => {
    const l = logLine(bundle, e, { plain: true, blockType: e.type === "cmd_result" ? blockTypeOf(feed, i, byId) : null });
    return { e, ...l, kind: withoutSource(l.source, l.kind) };
  });
}

/** 사유 이름 — 묶음에 이름이 없으면(코드 그대로면) fallback(기본 빈 글). 코드는 상세 보기에서만 */
export function reasonText(bundle: Bundle | null, code: string | null | undefined, fallback = ""): string {
  if (!code) return "";
  const x = reasonLabel(bundle, code);
  return x === code || isCode(x) ? fallback : x;
}
