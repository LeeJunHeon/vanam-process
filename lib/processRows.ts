// 공정 행 검증·정규화 — 발주 등록(POST /api/orders)과 공정 추가(POST /api/orders/[id]/processes) 공용.
// 실패 메시지는 호출부가 그대로 400 으로 돌려준다.
import { PROCESS_STATUSES, parseDateOnly } from "@/lib/orderUtils";

export type ProcessRowData = {
  processCodeId: number;
  detail: string | null;
  qty: number | null;
  plannedStart: Date | null;
  durationHours: number | null;
  status: string;
  location: string | null;
  ownerEmployeeId: number | null;
  memo: string | null;
};

export function parseProcessRows(
  rows: unknown[],
): { ok: true; rows: ProcessRowData[] } | { ok: false; error: string } {
  const out: ProcessRowData[] = [];
  for (const raw of rows) {
    const p = raw as Record<string, unknown>;
    const processCodeId = Number(p.processCodeId);
    if (!Number.isInteger(processCodeId) || processCodeId <= 0) {
      return { ok: false, error: "공정을 선택해주세요." };
    }
    const plannedStart = parseDateOnly(p.plannedStart);
    if (plannedStart === undefined) {
      return { ok: false, error: "작업시작예정 날짜 형식이 올바르지 않습니다." };
    }
    const qty = p.qty === null || p.qty === undefined || p.qty === "" ? null : Number(p.qty);
    if (qty !== null && !Number.isInteger(qty)) {
      return { ok: false, error: "횟수는 정수여야 합니다." };
    }
    const durationHours =
      p.durationHours === null || p.durationHours === undefined || p.durationHours === ""
        ? null
        : Number(p.durationHours);
    if (durationHours !== null && (!Number.isFinite(durationHours) || durationHours < 0)) {
      return { ok: false, error: "소요시간은 0 이상의 숫자여야 합니다." };
    }
    const status = typeof p.status === "string" && p.status ? p.status : "대기";
    if (!(PROCESS_STATUSES as readonly string[]).includes(status)) {
      return { ok: false, error: "상태 값이 올바르지 않습니다." };
    }
    out.push({
      processCodeId,
      detail: typeof p.detail === "string" && p.detail.trim() ? p.detail.trim() : null,
      qty,
      plannedStart,
      durationHours,
      status,
      location: typeof p.location === "string" && p.location.trim() ? p.location.trim() : null,
      ownerEmployeeId:
        p.ownerEmployeeId === null || p.ownerEmployeeId === undefined || p.ownerEmployeeId === ""
          ? null
          : Number(p.ownerEmployeeId),
      memo: typeof p.memo === "string" && p.memo.trim() ? p.memo.trim() : null,
    });
  }
  return { ok: true, rows: out };
}
