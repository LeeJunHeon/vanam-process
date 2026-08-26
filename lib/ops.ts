// 장비 운전(ops) 공용 타입·포맷터.
// payload 계약은 장비 리포터와 공유한다. 장비는 자신의 계측 항목을
// groups로 정의해 보내고, 웹은 장비를 알지 못한 채 그대로 렌더한다.

export type MetricItem = {
  label: string;
  value?: string | number | null;    // 계측값(PV)
  setpoint?: string | number | null; // 설정값(SV)
  unit?: string;
  sub?: string;
};

export type MetricGroup = { label: string; items: MetricItem[] };

export type OpsPayload = {
  status?: "idle" | "running" | "error";
  stage?: string;
  process?: { name?: string; totalSec?: number };
  groups?: MetricGroup[];
  metrics?: Record<string, string | number>; // 구버전 호환(평면 구조)
  indicators?: Record<string, boolean>;
  valves?: Record<string, boolean>;
  heater?: { pv?: string; sv?: string; status?: string; output?: string };
};

export type OpsRun = {
  id: number;
  status: string;
  processName: string | null;
  startedAt: string;
  endedAt: string | null;
  errorMsg: string | null;
};

export type OpsEvent = { id: number; ts: string; level: string; message: string };

export type OpsStatus = {
  state: { equipment: string; payload: OpsPayload; updatedAt: string } | null;
  run: OpsRun | null;
  events: OpsEvent[];
  runs: OpsRun[];
  commands?: OpsCommand[];
};

const KST = "Asia/Seoul";

export function fmtTime(iso?: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleTimeString("ko-KR", {
    hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: KST,
  });
}

export function fmtDateTime(iso?: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("ko-KR", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    hour12: false, timeZone: KST,
  });
}

export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}시간 ${m}분`;
  if (m > 0) return `${m}분 ${s % 60}초`;
  return `${s}초`;
}

export function secBetween(a?: string | null, b?: string | null): number {
  if (!a) return 0;
  const end = b ? new Date(b).getTime() : Date.now();
  return Math.max(0, (end - new Date(a).getTime()) / 1000);
}

// 마지막 수신 30초 이내면 온라인으로 본다(리포터 유휴 스냅샷 주기 10초 × 3).
export const ONLINE_WINDOW_MS = 30_000;

export const RUN_LABEL: Record<string, string> = {
  running: "진행 중", done: "정상 종료", error: "오류 종료", aborted: "중단",
};

export type OpsCommand = {
  id: number;
  command: string;
  label: string | null;
  args: unknown;
  status: string;
  requestedBy: string;
  requestedAt: string;
  finishedAt: string | null;
  result: string | null;
};

export const CMD_STATUS_LABEL: Record<string, string> = {
  pending: "대기", sent: "전송됨", done: "완료", failed: "실패", expired: "만료",
};

// 로그가 멈춘 것으로 오해하지 않도록 상대 시각을 함께 보여준다
export function fmtAgo(iso?: string | null): string {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "방금";
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  return `${Math.floor(s / 86400)}일 전`;
}
