import { NextRequest, NextResponse } from "next/server";
import { ops2Db } from "@/lib/ops2/db";
import { claimLease, ingestMaxBytes, processIngest, sqlState, stripNul } from "@/lib/ops2/ingest";
import { tokenMatches } from "@/lib/ops2/token";
import { commandsForPost } from "@/lib/ops2/commands";
import { readLimited } from "@/lib/ops2/body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/ops2/uplink/ingest — 챔버K v2 장비 → 웹(계약: 챔버K v2 common/messages.py).
// 세션이 아니라 장비별 Bearer 토큰(ops2_device.token_hash, 장비 ID 에 묶임). 토큰·본문은 로그에 남기지 않는다.
// 200 {acked, commands?, needWebSchema?} · 400 형식 · 401 토큰 · 409 다른 실행이 연결 중 · 413 본문 상한(OPS2_INGEST_MAX_BYTES)
export async function POST(req: NextRequest) {
  const max = ingestMaxBytes();
  const text = await readLimited(req, max);
  if (text === null) return NextResponse.json({ error: "too_large", max }, { status: 413 });

  let body: unknown;
  try {
    body = stripNul(JSON.parse(text));   // NUL 은 text·jsonb 가 받지 못한다
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const b = body as { equipment?: unknown; instance?: unknown; schemaHash?: unknown; messages?: unknown };
  if (typeof b?.equipment !== "string" || !b.equipment || typeof b.instance !== "string" || !b.instance
      || !Array.isArray(b.messages)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const equipment = b.equipment;
  const instance = b.instance;

  const device = await ops2Db.ops2Device.findUnique({
    where: { equipment },
    select: { tokenHash: true, enabled: true },
  });
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
    const r = await processIngest({ equipment, instance, now }, b.messages);
    // 이 실행 앞 명령 — 처음 보내는 pending 과, sent 인데 결과가 없어 다시 보내는 것(cmd_result 를 먼저 저장한 뒤라 받은 것은 빠진다)
    const commands = await commandsForPost(equipment, instance, new Date());
    return NextResponse.json({
      acked: r.acked,
      ...(commands.length ? { commands } : {}),
      ...(r.needWebSchema ? { needWebSchema: true } : {}),
    });
  } catch (e) {
    console.error("[ops2/ingest]", equipment, sqlState(e) ?? "-", (e as Error)?.message?.slice(0, 300));
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}
