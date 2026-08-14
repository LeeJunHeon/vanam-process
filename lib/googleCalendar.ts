import { google, type calendar_v3 } from "googleapis";

// hr-calendar-syncer 와 동일: 서비스계정 + 도메인 위임(subject 대행).
// admin 콘솔에 등록된 scope 와 일치해야 한다.
const SCOPES = ["https://www.googleapis.com/auth/calendar"];

function createClient(): calendar_v3.Calendar {
  const keyFile = process.env.GOOGLE_CALENDAR_KEY_FILE;
  const subject = process.env.GOOGLE_CALENDAR_SUBJECT;
  if (!keyFile || !subject) {
    throw new Error("GOOGLE_CALENDAR_KEY_FILE / GOOGLE_CALENDAR_SUBJECT 가 설정되지 않았습니다.");
  }
  const auth = new google.auth.JWT({ keyFile, scopes: SCOPES, subject });
  return google.calendar({ version: "v3", auth });
}

// 핫리로드 중복 생성 방지 (lib/prisma.ts 와 동일 패턴)
const globalForCal = globalThis as unknown as { gcal?: calendar_v3.Calendar };
function cal(): calendar_v3.Calendar {
  return (globalForCal.gcal ??= createClient());
}

// 구글 종일 일정은 end.date 가 "다음날"이어야 한다 (exclusive)
function nextDay(date: string): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function isGone(e: unknown): boolean {
  const code =
    (e as { code?: number }).code ??
    (e as { response?: { status?: number } }).response?.status;
  return code === 404 || code === 410;
}

type EventBody = { title: string; description: string; date: string };

function body(b: EventBody): calendar_v3.Schema$Event {
  return {
    summary: b.title,
    description: b.description,
    start: { date: b.date },
    end: { date: nextDay(b.date) },
  };
}

// 종일 일정 생성 → eventId 반환
export async function insertAllDayEvent(calendarId: string, b: EventBody): Promise<string> {
  const res = await cal().events.insert({ calendarId, requestBody: body(b) });
  if (!res.data.id) throw new Error("생성된 이벤트에 ID가 없습니다.");
  return res.data.id;
}

// 종일 일정 갱신. 일정이 캘린더에서 이미 지워졌으면 false (호출부가 재생성).
export async function updateAllDayEvent(
  calendarId: string,
  eventId: string,
  b: EventBody,
): Promise<boolean> {
  try {
    await cal().events.update({ calendarId, eventId, requestBody: body(b) });
    return true;
  } catch (e) {
    if (isGone(e)) return false;
    throw e;
  }
}

// 일정 삭제. 이미 없으면 조용히 통과.
export async function deleteEvent(calendarId: string, eventId: string): Promise<void> {
  try {
    await cal().events.delete({ calendarId, eventId });
  } catch (e) {
    if (isGone(e)) return;
    throw e;
  }
}
