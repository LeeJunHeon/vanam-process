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
// '개수 + 1'이 아니라 '그 날짜의 마지막 번호 + 1'로 채번한다.
// 개수 기반이면 중간 번호가 하드 삭제됐을 때(예: -002 만 삭제) 이미 존재하는
// 번호를 다시 만들어 그 날짜로는 등록이 영구히 막힌다.
// 재시도해도 개수가 그대로라 같은 번호가 반복되므로 재시도로 못 구한다.
// 번호에 구멍이 남더라도 재사용하지 않는 편이 추적상으로도 맞다.
// 유니크 제약이 최종 방어선이므로 호출부는 P2002 시 1회 재시도한다.
// (접미사가 3자리 zero-pad 라 문자열 내림차순 = 숫자 내림차순. 하루 999건 초과 시에만 깨진다)
export async function generateOrderNo(
  db: Prisma.TransactionClient,
  receivedAt: string,
): Promise<string> {
  const prefix = receivedAt.replaceAll("-", "");
  const last = await db.workOrder.findFirst({
    where: { orderNo: { startsWith: prefix + "-" } },
    orderBy: { orderNo: "desc" },
    select: { orderNo: true },
  });
  const next = last ? Number(last.orderNo.slice(prefix.length + 1)) + 1 : 1;
  return `${prefix}-${String(next).padStart(3, "0")}`;
}
