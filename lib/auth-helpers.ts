import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { auth } from "@/auth";

const disableAuth = process.env.DISABLE_AUTH === "true";

function devSession(): Session {
  // 로컬 우회용 가짜 CEO
  return {
    user: {
      name: "개발자",
      email: "dev@vanam.local",
      role: "ceo",
      dbId: null,
      employeeId: null,
    },
  } as unknown as Session;
}

export async function requireSession(): Promise<
  { ok: true; session: Session } | { ok: false; response: NextResponse }
> {
  if (disableAuth) return { ok: true, session: devSession() };
  const session = await auth();
  if (!session?.user)
    return {
      ok: false,
      response: NextResponse.json(
        { error: "로그인이 필요합니다." },
        { status: 401 },
      ),
    };
  return { ok: true, session };
}

export function isAdminSession(session: Session | null | undefined): boolean {
  const role = session?.user?.role;
  return role === "admin" || role === "ceo";
}

// 본인 기록이거나 관리자면 true — 수정/삭제 권한 판정
export function canModify(
  session: Session | null | undefined,
  createdByEmail: string,
): boolean {
  if (isAdminSession(session)) return true;
  return session?.user?.email === createdByEmail;
}
