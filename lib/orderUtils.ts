import type { Prisma } from "@/app/generated/prisma/client";

export { PROCESS_STATUSES, PAYMENT_STATUSES, PRECHECK_STATUSES } from "./status";

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
