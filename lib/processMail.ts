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


// 공정 일정 변경 알림 — 작업시작예정일이 바뀐 경우 담당자에게 발송.
// 담당자 변경 시에는 배정 메일 본문에 새 날짜가 이미 들어가므로 호출부에서 이 함수를 건너뛴다.
// 실패해도 본 작업을 막지 않는다 (내부에서 전부 흡수).
export async function sendProcessRescheduleMail(
  processId: number,
  prevPlannedStart: Date | null,
): Promise<void> {
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

    const fmt = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "미정");

    const subject = `[공정 일정 변경] ${p.processCode.code} · ${p.detail || p.order.orderNo}`;
    const body = [
      `${p.owner.name} 님, 담당 공정의 작업시작예정일이 변경되었습니다.`,
      ``,
      `변경 전: ${fmt(prevPlannedStart)}`,
      `변경 후: ${fmt(p.plannedStart)}`,
      ``,
      `발주관리번호: ${p.order.orderNo}`,
      `고객사: ${p.order.company ?? ""}`,
      `작업명: ${p.order.jobName ?? ""}`,
      `Sequence: ${p.sequence}`,
      `공정: ${p.processCode.code}`,
      `공정상세: ${p.detail ?? ""}`,
      `횟수: ${p.qty ?? ""}`,
      `소요시간: ${p.durationHours ?? ""}`,
      `상태: ${p.status}`,
      `현위치: ${p.location ?? ""}`,
      `메모: ${p.memo ?? ""}`,
      ``,
      `캘린더 일정도 변경된 날짜로 자동 반영되었습니다.`,
      `공정 관리: https://vanam.synology.me/process`,
    ].join("\n");

    await sendEmail(p.owner.email, subject, body);
  } catch (e) {
    console.error("process reschedule mail failed:", processId, e);
  }
}
