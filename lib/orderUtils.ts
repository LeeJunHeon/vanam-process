import type { Prisma } from "@/app/generated/prisma/client";

// 시트 '코드' 시트의 옵션 목록. "세금계산선"은 원본 오타라 "세금계산서"로 교정.
export const PROCESS_STATUSES = ["대기", "예약", "진행", "보류", "완료", "취소"] as const;
export const PAYMENT_STATUSES = ["미결제", "세금계산서 발급", "입금확인", "선금확인", "부분입금확인"] as const;
export const PRECHECK_STATUSES = ["해당없음", "미완료", "완료", "이상보고"] as const;

// "YYYY-MM-DD" 형식만 허용. 잘못된 값은 null 대신 undefined 를 돌려 호출부가 400 처리.
export function parseDateOnly(value: unknown): Date | null | undefined {
  if (value === null || value === "" || value === undefined) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const d = new Date(value);
  return isNaN(d.getTime()) ? undefined : d;
}

// 발주번호 자동 채번: 접수일 기준 YYYYMMDD-001 형식.
// 유니크 제약이 최종 방어선이므로 호출부는 P2002 시 1회 재시도한다.
export async function generateOrderNo(
  db: Prisma.TransactionClient,
  receivedAt: string,
): Promise<string> {
  const prefix = receivedAt.replaceAll("-", "");
  const count = await db.workOrder.count({
    where: { orderNo: { startsWith: prefix + "-" } },
  });
  return `${prefix}-${String(count + 1).padStart(3, "0")}`;
}
