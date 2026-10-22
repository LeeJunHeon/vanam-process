// 챔버K v2 명령 권한 — 판정은 DB 조회와 나눈 순수 함수(W-3 화면도 이것을 쓴다).
// 웹 설정 묶음 commands 의 role: "operator" → 관리자(admin·ceo) 또는 그 장비 담당자, "admin" → 관리자만, 그 밖 → 아무도.
// 담당자는 기준 장비 ID(-SIM 을 뗀 것)로 둔다 — CHK2 담당자는 CHK2·CHK2-SIM 모두.
// 이 파일은 타입만 가져온다(DB 는 부르는 쪽이 넘긴다) — node 로 바로 시험할 수 있게.
import type { PrismaClient } from "@/app/generated/prisma/client";

export type Actor = { role?: string | null; employeeId?: number | null };

/** 기준 장비 ID — "CHK2-SIM" → "CHK2" */
export function baseEquipment(equipment: string): string {
  return equipment.endsWith("-SIM") ? equipment.slice(0, -4) : equipment;
}

export function isAdminRole(role?: string | null): boolean {
  return role === "admin" || role === "ceo";
}

/** 이 사람이 이 장비 담당자인가 — operators 는 그 사람의 담당 기준 장비 ID 목록 */
export function isOperatorOf(actor: Actor, equipment: string, operators: readonly string[]): boolean {
  return actor.employeeId != null && operators.includes(baseEquipment(equipment));
}

/** 명령 권한 — cmdRole 은 묶음 commands[].role */
export function canRunCommand(actor: Actor, equipment: string, cmdRole: unknown, operators: readonly string[]): boolean {
  if (cmdRole === "admin") return isAdminRole(actor.role);
  if (cmdRole === "operator") return isAdminRole(actor.role) || isOperatorOf(actor, equipment, operators);
  return false;
}

/** 그 사람의 담당 기준 장비 ID 목록(DB) */
export async function operatorEquipments(db: Pick<PrismaClient, "ops2Operator">, employeeId?: number | null): Promise<string[]> {
  if (employeeId == null) return [];
  const rows = await db.ops2Operator.findMany({ where: { employeeId }, select: { equipment: true } });
  return rows.map((r) => r.equipment);
}
