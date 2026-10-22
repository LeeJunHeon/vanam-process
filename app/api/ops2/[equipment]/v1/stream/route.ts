import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-helpers";
import { ops2Db } from "@/lib/ops2/db";
import { enabledDevice } from "@/lib/ops2/browser";
import {
  eventEnvelope, sseEnvelope, subscribeBrowser, unsubscribeBrowser, type BrowserSub, type WireEnvelope,
} from "@/lib/ops2/hub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEEPALIVE_MS = 15_000;
const RECENT_EVENTS = 100;
const QUEUE_MAX = 300;            // 브라우저가 못 가져간 덩어리 — 넘으면 끊는다(다시 붙으면 처음 묶음부터)

/** 서버가 닫는 시간(다시 붙으며 세션을 다시 본다) — OPS2_BROWSER_STREAM_MAX_SEC, 기본 30 분 */
function maxAgeMs(): number {
  const v = Number(process.env.OPS2_BROWSER_STREAM_MAX_SEC);
  return Number.isFinite(v) && v > 0 ? v * 1000 : 30 * 60_000;
}

// GET /api/ops2/[equipment]/v1/stream — 브라우저 SSE(로컬 /api/v1/stream 과 같은 형식, id 는 envelope id).
// 처음 묶음: hello(마지막) → 최신 state → 최근 사건 100(오래된 것부터). 그 뒤 ingest 가 커밋한 것을 바로
// (state·event·run_start·run_end·cmd_result·config_ack·hello, 웹이 만든 사건 INSTANCE_TAKEOVER·INSTANCE_RELEASED 포함).
// 다시 붙으면 처음 묶음부터(Last-Event-ID 로 이어 받지 않음 — 화면이 envelope id 로 거른다).
export async function GET(req: NextRequest, { params }: { params: Promise<{ equipment: string }> }) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  const { equipment } = await params;
  const device = await enabledDevice(equipment);
  if (!device) return NextResponse.json({ error: "unknown_device" }, { status: 404 });

  const enc = new TextEncoder();
  let sub: BrowserSub | null = null;
  let ka: ReturnType<typeof setInterval> | null = null;
  let life: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (ka) clearInterval(ka);
    if (life) clearTimeout(life);
    req.signal.removeEventListener("abort", cleanup);
    if (sub) unsubscribeBrowser(sub);
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let ready = false;                     // 처음 묶음을 다 넣기 전에 온 실시간 덩어리는 잠깐 모아 둔다
      const held: Uint8Array[] = [];
      const put = (bytes: Uint8Array) => {
        if (closed) return false;
        if ((controller.desiredSize ?? 0) < -QUEUE_MAX) return false;    // 느린 구독자
        try {
          controller.enqueue(bytes);
          return true;
        } catch {
          cleanup();
          return false;
        }
      };
      const close = () => {
        const was = closed;
        cleanup();
        if (!was) {
          try { controller.close(); } catch { /* 이미 닫힘 */ }
        }
      };
      sub = {
        equipment,
        send: (bytes) => {
          if (closed) return false;
          if (!ready) {
            if (held.length >= QUEUE_MAX) return false;
            held.push(bytes);
            return true;
          }
          return put(bytes);
        },
        close,
      };
      subscribeBrowser(sub);
      req.signal.addEventListener("abort", cleanup);
      ka = setInterval(() => { if (!put(enc.encode(": ka\n\n"))) close(); }, KEEPALIVE_MS);
      life = setTimeout(close, maxAgeMs());
      put(enc.encode("retry: 1000\n: open\n\n"));      // 닫히면 브라우저가 1 s 뒤 다시 붙는다(기본 약 3 s)

      void (async () => {
        try {
          const [state, events] = await Promise.all([
            ops2Db.ops2State.findUnique({ where: { equipment } }),
            ops2Db.ops2Event.findMany({ where: { equipment }, orderBy: [{ ts: "desc" }, { seq: "desc" }], take: RECENT_EVENTS }),
          ]);
          const first: WireEnvelope[] = [];
          const h = device.lastHello;
          if (h && typeof h === "object" && !Array.isArray(h)) {
            const inst = String((h as { instance?: unknown }).instance ?? device.holderInstance ?? "-");
            first.push({ id: `hello-${inst}-${device.lastHelloAt?.getTime() ?? 0}`, instance: inst, seq: 0,
                         ts: (device.lastHelloAt ?? new Date()).toISOString(), type: "hello", data: h });
          }
          if (state) {
            first.push({ id: state.msgId, instance: state.instance, seq: state.seq, ts: state.ts.toISOString(),
                         type: "state", data: state.data });
          }
          first.push(...events.reverse().map(eventEnvelope));
          if (first.length && !put(enc.encode(first.map(sseEnvelope).join("")))) return close();
          ready = true;
          for (const b of held.splice(0)) if (!put(b)) return close();
        } catch (e) {
          console.error("[ops2/browser-stream]", equipment, (e as Error)?.message?.slice(0, 300));
          close();
        }
      })();
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",   // 압축이 SSE 를 모으지 않게
      "X-Accel-Buffering": "no",
    },
  });
}
