import { prisma } from "@/lib/prisma";
import {
  insertAllDayEvent,
  updateAllDayEvent,
  deleteEvent,
} from "@/lib/googleCalendar";

function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function syncProcessCalendar(processId: number): Promise<void> {
  try {
    const p = await prisma.workOrderProcess.findUnique({
      where: { id: processId },
      include: {
        order: { select: { orderNo: true, deletedAt: true } },
        processCode: {
          select: { code: true, calendarId: true, calendarEnabled: true },
        },
        owner: { select: { name: true } },
      },
    });
    if (!p) return;

    const save = (data: {
      calendarId?: string | null;
      calendarEventId?: string | null;
      syncStatus: string;
    }) =>
      prisma.workOrderProcess.update({
        where: { id: p.id },
        data: { ...data, syncedAt: new Date() },
      });

    const removeExisting = async () => {
      if (p.calendarId && p.calendarEventId) {
        await deleteEvent(p.calendarId, p.calendarEventId);
      }
    };

    // 1) 소프트 삭제 또는 상태=취소 → 일정 제거 (시트 CANCEL_MODE=DELETE)
    if (p.deletedAt || p.order.deletedAt || p.status === "취소") {
      await removeExisting();
      await save({ calendarId: null, calendarEventId: null, syncStatus: "취소" });
      return;
    }

    // 2) 시작예정일 없음 → 기존 일정 정리 후 표시
    //    (시트는 방치했지만, 낡은 일정이 캘린더에 남는 것을 막기 위해 제거한다)
    if (!p.plannedStart) {
      await removeExisting();
      await save({ calendarId: null, calendarEventId: null, syncStatus: "필수정보 부족" });
      return;
    }

    // 3) 캘린더 매핑 (외주 등 미연동 공정)
    const target = p.processCode.calendarEnabled ? p.processCode.calendarId : null;
    if (!target) {
      await removeExisting();
      await save({ calendarId: null, calendarEventId: null, syncStatus: "미연동" });
      return;
    }

    // 제목·설명 — 실제 시트 생성 일정과 동일 형식
    const eventBody = {
      title: `[${p.processCode.code}] ${p.detail || p.order.orderNo}`,
      description: [
        `발주관리번호: ${p.order.orderNo}`,
        `Sequence: ${p.sequence}`,
        `공정: ${p.processCode.code}`,
        `공정상세: ${p.detail ?? ""}`,
        `횟수: ${p.qty ?? ""}`,
        `소요시간: ${p.durationHours ?? ""}`,
        `상태: ${p.status}`,
        `담당자: ${p.owner?.name ?? ""}`,
        `현위치: ${p.location ?? ""}`,
        `메모: ${p.memo ?? ""}`,
      ].join("\n"),
      date: dateStr(p.plannedStart),
    };

    // 4) 공정 변경으로 대상 캘린더가 바뀜 → 옛 일정 삭제 후 새 캘린더에 생성 (시트 방식)
    if (p.calendarEventId && p.calendarId && p.calendarId !== target) {
      await deleteEvent(p.calendarId, p.calendarEventId);
      const eventId = await insertAllDayEvent(target, eventBody);
      await save({ calendarId: target, calendarEventId: eventId, syncStatus: "동기화완료" });
      return;
    }

    // 5) 같은 캘린더면 갱신, 캘린더에서 수동 삭제됐으면 재생성
    if (p.calendarEventId && p.calendarId === target) {
      const ok = await updateAllDayEvent(target, p.calendarEventId, eventBody);
      if (ok) {
        await save({ calendarId: target, calendarEventId: p.calendarEventId, syncStatus: "동기화완료" });
        return;
      }
    }
    const eventId = await insertAllDayEvent(target, eventBody);
    await save({ calendarId: target, calendarEventId: eventId, syncStatus: "동기화완료" });
  } catch (e) {
    console.error("calendar sync failed:", processId, e);
    try {
      await prisma.workOrderProcess.update({
        where: { id: processId },
        data: { syncStatus: "동기화오류", syncedAt: new Date() },
      });
    } catch {
      // 상태 기록조차 실패하면 로그만 남긴다
    }
  }
}
