import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";

type Action = "create" | "update" | "delete";

// 이력에 남길 기록의 상태. 화면에서 그대로 모달에 채울 수 있는 형태로 둔다.
export type ReceiptState = {
  receivedAt: string;
  manager: string;
  source: string | null;
  clientName: string | null;
  memo: string | null;
  photoIds: number[];
};

type ReceiptLike = {
  receivedAt: Date;
  manager: string;
  source: string | null;
  clientName: string | null;
  memo: string | null;
};

// 기록 + 사진 id 목록을 스냅샷 형태로 변환
export function toState(r: ReceiptLike, photoIds: number[]): ReceiptState {
  return {
    receivedAt: r.receivedAt.toISOString(),
    manager: r.manager,
    source: r.source,
    clientName: r.clientName,
    memo: r.memo,
    photoIds,
  };
}

// 특정 기록의 현재 사진 id 목록 (떼지 않은 것만)
export async function currentPhotoIds(receiptId: number): Promise<number[]> {
  const rows = await prisma.substratePhoto.findMany({
    where: { receiptId, deletedAt: null },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  return rows.map((r) => r.id);
}

// 활동 이력 기록. 실패해도 본 작업을 막지 않는다(로그만 남기고 통과).
// snapshot.state = 이 시점의 값, snapshot.before = 변경 전 값(수정일 때만)
export async function logActivity(
  session: Session | null | undefined,
  action: Action,
  targetId: number,
  summary: string,
  snapshot?: { state: ReceiptState; before?: ReceiptState | null },
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
        snapshot: snapshot
          ? { state: snapshot.state, before: snapshot.before ?? null }
          : undefined,
      },
    });
  } catch (e) {
    console.error("activity log failed:", e);
  }
}

// 세션에서 담당자 이름을 결정한다. 등록/수정 시 클라이언트 값을 신뢰하지 않는다.
export function managerFromSession(session: Session | null | undefined): string {
  return session?.user?.name || session?.user?.email || "알 수 없음";
}
