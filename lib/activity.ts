import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";

type Action = "create" | "update" | "delete";

// 활동 이력 기록. 실패해도 본 작업을 막지 않는다(로그만 남기고 통과).
export async function logActivity(
  session: Session | null | undefined,
  action: Action,
  targetId: number,
  summary: string,
) {
  try {
    await prisma.activityLog.create({
      data: {
        targetType: "substrate_receipt",
        targetId,
        action,
        actorEmail: session?.user?.email ?? "unknown",
        actorName: session?.user?.name ?? null,
        summary,
      },
    });
  } catch (e) {
    console.error("activity log failed:", e);
  }
}
