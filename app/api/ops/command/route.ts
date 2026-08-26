import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-helpers";
import { CMD_TTL_SEC, COMMAND_MAP } from "@/lib/opsCommands";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/ops/command — 사용자가 명시적으로 누른 원격 제어 요청만 생성한다.
export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const equipment: string = body?.equipment ?? "";
  const command: string = body?.command ?? "";
  const args = body?.args ?? null;

  const defs = COMMAND_MAP[equipment];
  const def = defs?.find((d) => d.key === command);
  if (!def) {
    return NextResponse.json({ error: "허용되지 않은 명령입니다." }, { status: 400 });
  }

  // 장비가 연결되어 있지 않으면 명령을 만들지 않는다(나중에 되살아나는 것 방지).
  const state = await prisma.opsState.findUnique({ where: { equipment } });
  const fresh =
    state && Date.now() - new Date(state.updatedAt).getTime() < 30_000;
  if (!fresh) {
    return NextResponse.json(
      { error: "장비가 연결되어 있지 않아 명령을 보낼 수 없습니다." },
      { status: 409 },
    );
  }

  const who = auth.session.user?.email ?? auth.session.user?.name ?? "unknown";

  const cmd = await prisma.opsCommand.create({
    data: {
      equipment,
      command,
      args: args ?? undefined,
      label: def.label,
      status: "pending",
      requestedBy: who,
      expiresAt: new Date(Date.now() + CMD_TTL_SEC * 1000),
    },
    select: { id: true },
  });

  return NextResponse.json({ ok: true, id: cmd.id });
}

// GET /api/ops/command?equipment=CHK — 조작 감사 로그 조회
export async function GET(req: NextRequest) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const equipment = req.nextUrl.searchParams.get("equipment") ?? "CHK";
  const items = await prisma.opsCommand.findMany({
    where: { equipment },
    orderBy: { requestedAt: "desc" },
    take: 30,
  });
  return NextResponse.json({ items });
}
