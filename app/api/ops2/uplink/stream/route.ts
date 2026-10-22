import { NextRequest, NextResponse } from "next/server";
import { ops2Db } from "@/lib/ops2/db";
import { claimLease } from "@/lib/ops2/ingest";
import { tokenMatches } from "@/lib/ops2/token";
import { expireDue } from "@/lib/ops2/commands";
import { pump, register, unregister, type DeviceConn } from "@/lib/ops2/hub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEEPALIVE_MS = 15_000;     // 장비는 45 s 동안 아무것도 없으면 끊고 다시 붙는다

// GET /api/ops2/uplink/stream?equipment=&instance= — 웹 → 장비 SSE(명령의 주 경로, 계약: 챔버K v2 common/messages.py).
// 인증·lease 는 ingest 와 같다(401 토큰 · 409 다른 실행이 연결 중). 응답은 바로 돌려주고 대기 명령은 스트림 안에서 보낸다.
// ": open" → 대기 명령(event: command) → 15 s 마다 ": ka". 같은 실행이 새로 붙으면 예전 연결은 닫는다(lib/ops2/hub.ts).
export async function GET(req: NextRequest) {
  const equipment = req.nextUrl.searchParams.get("equipment") ?? "";
  const instance = req.nextUrl.searchParams.get("instance") ?? "";
  if (!equipment || !instance) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const device = await ops2Db.ops2Device.findUnique({ where: { equipment }, select: { tokenHash: true, enabled: true } });
  if (!device || !device.enabled || !tokenMatches(req.headers.get("authorization"), device.tokenHash)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const lease = await claimLease(equipment, instance, now);
    if (!lease.ok) {
      return NextResponse.json(
        { error: "another instance is active", activeInstance: lease.holder?.slice(0, 8) ?? null,
          lastSeenSec: lease.quietMs === null ? null : Math.round(lease.quietMs / 1000) },
        { status: 409 },
      );
    }
    await expireDue(equipment, now);
  } catch (e) {
    console.error("[ops2/stream]", equipment, (e as Error)?.message?.slice(0, 300));
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }

  const enc = new TextEncoder();
  let conn: DeviceConn | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (timer) clearInterval(timer);
    req.signal.removeEventListener("abort", cleanup);
    if (conn) unregister(conn);
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (chunk: string) => {
        if (closed) return false;
        try {
          controller.enqueue(enc.encode(chunk));
          return true;
        } catch {
          cleanup();
          return false;
        }
      };
      conn = {
        equipment, instance, connectedAt: new Date(), write,
        close: () => {
          const was = closed;
          cleanup();
          if (!was) {
            try { controller.close(); } catch { /* 이미 닫힘 */ }
          }
        },
      };
      write(": open\n\n");
      register(conn);
      timer = setInterval(() => { write(": ka\n\n"); }, KEEPALIVE_MS);
      req.signal.addEventListener("abort", cleanup);
      void pump(conn);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
