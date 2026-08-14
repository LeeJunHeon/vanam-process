import { JWT } from "google-auth-library";

// hr-calendar-syncer 와 동일: 서비스계정 + 도메인 위임(subject 대행).
// googleapis 전체 패키지는 NAS 빌드를 다운시킬 만큼 무거워서
// 인증 라이브러리 + Calendar v3 REST 직접 호출로 대체했다.
const SCOPES = ["https://www.googleapis.com/auth/calendar"];
const API = "https://www.googleapis.com/calendar/v3";

function createClient(): JWT {
  const keyFile = process.env.GOOGLE_CALENDAR_KEY_FILE;
  const subject = process.env.GOOGLE_CALENDAR_SUBJECT;
  if (!keyFile || !subject) {
    throw new Error("GOOGLE_CALENDAR_KEY_FILE / GOOGLE_CALENDAR_SUBJECT 가 설정되지 않았습니다.");
  }
  return new JWT({ keyFile, scopes: SCOPES, subject });
}

// 핫리로드 중복 생성 방지 (lib/prisma.ts 와 동일 패턴)
const globalForCal = globalThis as unknown as { gjwt?: JWT };
function jwt(): JWT {
  return (globalForCal.gjwt ??= createClient());
}

type EventBody = { title: string; description: string; date: string };

// 구글 종일 일정은 end.date 가 "다음날"이어야 한다 (exclusive)
function nextDay(date: string): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function payload(b: EventBody) {
  return {
    summary: b.title,
    description: b.description,
    start: { date: b.date },
    end: { date: nextDay(b.date) },
  };
}

// JWT 인증이 붙은 REST 요청. google-auth-library 가 토큰 발급·갱신을 처리한다.
async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: T | null }> {
  const res = await jwt().request<T>({
    url: `${API}${path}`,
    method: method as "GET" | "POST" | "PUT" | "DELETE",
    data: body,
    validateStatus: () => true, // 상태코드는 호출부가 판정
  });
  return { status: res.status, data: (res.data as T) ?? null };
}

function enc(s: string): string {
  return encodeURIComponent(s);
}

// 종일 일정 생성 → eventId 반환
export async function insertAllDayEvent(calendarId: string, b: EventBody): Promise<string> {
  const { status, data } = await request<{ id?: string }>(
    "POST",
    `/calendars/${enc(calendarId)}/events`,
    payload(b),
  );
  if (status >= 300 || !data?.id) {
    throw new Error(`이벤트 생성 실패 (HTTP ${status})`);
  }
  return data.id;
}

// 종일 일정 갱신. 일정이 캘린더에서 이미 지워졌으면 false (호출부가 재생성).
export async function updateAllDayEvent(
  calendarId: string,
  eventId: string,
  b: EventBody,
): Promise<boolean> {
  const { status } = await request(
    "PUT",
    `/calendars/${enc(calendarId)}/events/${enc(eventId)}`,
    payload(b),
  );
  if (status === 404 || status === 410) return false;
  if (status >= 300) throw new Error(`이벤트 갱신 실패 (HTTP ${status})`);
  return true;
}

// 일정 삭제. 이미 없으면 조용히 통과.
export async function deleteEvent(calendarId: string, eventId: string): Promise<void> {
  const { status } = await request(
    "DELETE",
    `/calendars/${enc(calendarId)}/events/${enc(eventId)}`,
  );
  if (status === 404 || status === 410) return;
  if (status >= 300) throw new Error(`이벤트 삭제 실패 (HTTP ${status})`);
}
