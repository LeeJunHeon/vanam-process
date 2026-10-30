// 챔버12(CH12) 구글챗 전송 폭주 보호 — v1 controller/chat_notifier.py 의 대기 상한을 outbox 넣기(lib/ops2/ch12/chat.ts)에.
// v1 근거: _post_limits(151-158 — CHAT_POST_CONCURRENCY 4·CHAT_PENDING_MAX 200, max(1, int(값))), _pending_hard_max(214-221 —
//   CHAT_PENDING_HARD_MAX 1000), _schedule_post(184-212), _annotate_dropped(223-243).
//  - 노티파이어(v1 ChatNotifier 인스턴스 — CH1·CH2·PC·TSP·HOST, PLC 연결 끊김 chat_plc, 로봇 클라이언트 chat_client)마다
//    아직 보내지 못한 카드(v1 _pending 태스크 = 여기서는 queued 행)가 CHAT_PENDING_MAX 이상이면 새 일반 카드는 버리고 건수만 센다.
//    urgent 카드(v1 urgent=True — 공정 시작·장비 오류·CH2 히터·PLC 연결 끊김/재연결·로봇 클라이언트 공정)는 그 상한을 통과하되
//    CHAT_PENDING_HARD_MAX 는 넘지 못한다. 버린 것이 있으면 다음에 통과하는 카드 끝에 '(전송 실패로 생략된 알림 N건)' 한 번, 0 으로.
//  - 공정 모니터·OES 글은 v1 에서 ChatNotifier 를 거치지 않고 바로 보냈다(process_monitor·oes) — 상한 없음(그룹 null).
//  - 동시 POST(CHAT_POST_CONCURRENCY 4): 보내기는 챔버K 와 같은 lib/ops2/chat.ts 가 하나씩 보낸다(SENDER_CONCURRENCY 1) — 늘 상한
//    안이라 따로 막지 않는다(챔버K 보내기는 바꾸지 않음).
// 순수 함수만(DB 없이) — scripts/ops2-chat-ch12.mjs 가 직접 시험한다.
import type { Ch12Channel, Ch12ChatCfg, Ch12ChatKind, Notifier } from "./chatCards";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** lib/ops2/chat.ts drain 이 한 번에 보내는 수(하나씩) — CHAT_POST_CONCURRENCY(≥1) 보다 늘 작거나 같다 */
export const SENDER_CONCURRENCY = 1;

/** v1 urgent=True 로 보내던 카드 종류(chat_notifier.py:515·764·830, main.py:307·318, heater_service.py:534, chat_notifier.py:905·930·955) */
export const URGENT_KINDS: ReadonlySet<Ch12ChatKind> = new Set<Ch12ChatKind>(["run_start", "error_event", "heater", "plc_link", "client"]);

/** 버린 행의 lastError(그리고 다음 카드에 붙일 건수를 셀 때의 열쇠) */
export const DROP_REASON = "대기 상한 초과 — 생략(v1 CHAT_PENDING_MAX)";

/** 대기 상한을 같이 세는 묶음(v1 ChatNotifier 인스턴스). null = 상한 없음(v1 이 바로 보내던 모니터·OES) */
export function pendGroupOf(kind: Ch12ChatKind, channel: Ch12Channel, notifier: Notifier | null): string | null {
  if (channel === "monitor" || channel === "oes") return null;
  if (channel === "plc") return "PLC";          // v1 chat_plc(PLC 연결 끊김·재연결·자기 감시)
  if (channel === "client" || kind === "client") return "CLIENT";   // v1 chat_client
  return notifier ?? "HOST";
}

/** 한 묶음의 지금 상태 — 보내지 못한 카드 수(v1 len(_pending))·버린 카드 수(v1 _dropped) */
export type Gate = { pending: number; dropped: number };

/** v1 _schedule_post 의 판정. 통과면 note = 이 카드에 붙일 생략 건수(0 이면 붙이지 않음) — gate 를 고친다 */
export function admit(gate: Gate, urgent: boolean, cfg: Pick<Ch12ChatCfg, "pendingMax" | "pendingHardMax">): { ok: false } | { ok: true; note: number } {
  const soft = cfg.pendingMax, hard = cfg.pendingHardMax;
  if (gate.pending >= hard || (gate.pending >= soft && !urgent)) {
    gate.dropped += 1;
    return { ok: false };
  }
  const note = gate.dropped;
  gate.dropped = 0;
  gate.pending += 1;
  return { ok: true, note };
}

export const droppedNote = (n: number) => `(전송 실패로 생략된 알림 ${n}건)`;

/** v1 _annotate_dropped — text 면 끝에 줄바꿈 + 표기, 카드면 마지막 섹션 widgets 에 textParagraph, 아니면 text 로 */
export function annotateDropped(payload: Obj, n: number): Obj {
  const note = droppedNote(n);
  let pl: Obj;
  try {
    pl = JSON.parse(JSON.stringify(payload)) as Obj;
  } catch {
    return payload;
  }
  if ("text" in pl && typeof pl.text === "string") {
    pl.text = `${pl.text}\n${note}`;
    return pl;
  }
  const cards = pl.cardsV2 ?? pl.cards;
  if (Array.isArray(cards) && cards.length && isObj(cards[0])) {
    const c0 = cards[0] as Obj;
    const card = isObj(c0.card) ? c0.card : c0;
    const secs = card.sections;
    if (Array.isArray(secs) && secs.length && isObj(secs[secs.length - 1])) {
      const last = secs[secs.length - 1] as Obj;
      if (!Array.isArray(last.widgets)) last.widgets = [];
      (last.widgets as unknown[]).push({ textParagraph: { text: note } });
      return pl;
    }
  }
  if (!("text" in pl)) pl.text = note;
  return pl;
}
