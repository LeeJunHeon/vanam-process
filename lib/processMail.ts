import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";

// 공정 배정 메일 — 캘린더 일정 설명과 동일한 형식으로 담당자에게 발송.
// 실패해도 본 작업을 막지 않는다 (내부에서 전부 흡수).
export async function sendProcessAssignMail(processId: number): Promise<void> {
  try {
    const p = await prisma.workOrderProcess.findUnique({
      where: { id: processId },
      include: {
        order: {
          select: { orderNo: true, company: true, jobName: true, deletedAt: true },
        },
        processCode: { select: { code: true } },
        owner: { select: { name: true, email: true } },
      },
    });
    if (!p || p.deletedAt || p.order.deletedAt) return;
    if (p.status === "취소") return;
    if (!p.owner?.email) return; // 담당자 없음 / 이메일 없음 → 스킵

    const subject = `[공정 배정] ${p.processCode.code} · ${p.detail || p.order.orderNo}`;
    const body = [
      `${p.owner.name} 님, 아래 공정이 배정되었습니다.`,
      ``,
      `발주관리번호: ${p.order.orderNo}`,
      `고객사: ${p.order.company ?? ""}`,
      `작업명: ${p.order.jobName ?? ""}`,
      `Sequence: ${p.sequence}`,
      `공정: ${p.processCode.code}`,
      `공정상세: ${p.detail ?? ""}`,
      `횟수: ${p.qty ?? ""}`,
      `소요시간: ${p.durationHours ?? ""}`,
      `작업시작예정: ${p.plannedStart ? p.plannedStart.toISOString().slice(0, 10) : "미정"}`,
      `상태: ${p.status}`,
      `현위치: ${p.location ?? ""}`,
      `메모: ${p.memo ?? ""}`,
      ``,
      `공정 관리: https://vanam.synology.me/process`,
    ].join("\n");

    await sendEmail(p.owner.email, subject, body);
  } catch (e) {
    console.error("process mail failed:", processId, e);
  }
}
