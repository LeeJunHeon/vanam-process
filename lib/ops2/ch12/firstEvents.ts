// 챔버12 웹 화면을 다시 열 때 첫 묶음에 넣는 사건(2026-11-19 — 장비 D418 의 웹 쪽).
// 브라우저 SSE(app/api/ops2/[equipment]/v1/stream) 처음 묶음은 '최근 사건 100'(종류 무관)인데, 공정 중에는 상세 줄(PLC 기록·RF DISPLAY·MFC IO …)이
// 몇십 초 만에 그 100 을 채워 화면을 다시 열면 앞선 공정 진행 줄이 없었다(장비 허브 최근 링과 같은 문제). 그래서 챔버12 는 챔버별
// (ch1·ch2·pc·tsp·shared) 기본 보기 줄 — 장비 묶음 eventKinds 의 main(D414 와 같은 정의)·경고·오류 — 을 최근 MAIN_WINDOW_MS 안에서
// MAIN_PER_CHAMBER 개씩 더 읽어 최근 사건 100 과 합친다(같은 사건은 한 번, 오래된 것부터). 챔버K 는 그대로(최근 사건 100 만).
import type { Prisma } from "@/app/generated/prisma/client";

export const MAIN_PER_CHAMBER = 100;
export const MAIN_WINDOW_MS = 12 * 3600_000;
export const FIRST_CONTEXTS = ["ch1", "ch2", "pc", "tsp", "shared"] as const;
export const ISSUE_LEVELS = ["warn", "error", "critical"];

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

/** 묶음 eventKinds 의 main (source, kind) — 없으면 [] */
export function mainKindsOf(bundle: Obj | null): { source: string; kind: string }[] {
  const list = Array.isArray(bundle?.eventKinds) ? (bundle!.eventKinds as unknown[]) : [];
  return list.filter(isObj).filter((k) => k.level === "main" && typeof k.source === "string" && typeof k.kind === "string")
    .map((k) => ({ source: k.source as string, kind: k.kind as string }));
}

/** 챔버 하나의 기본 보기 줄 찾기 조건(ops2_event) — context.chamber 가 그 챔버이고 (경고·오류 또는 main 종류), 최근 창 안 */
export function mainWhere(equipment: string, chamber: string, kinds: { source: string; kind: string }[], nowMs: number): Prisma.Ops2EventWhereInput {
  return {
    equipment,
    ts: { gte: new Date(nowMs - MAIN_WINDOW_MS) },
    context: { path: ["chamber"], equals: chamber },
    OR: [{ level: { in: ISSUE_LEVELS } }, ...kinds.map((k) => ({ source: k.source, kind: k.kind }))],
  };
}

type Row = { msgId: string; ts: Date; seq: number };
/** 최근 사건(새 것부터)과 챔버별 기본 보기 줄(새 것부터)을 합쳐 오래된 것부터 — 같은 msgId 는 한 번 */
export function mergeFirstEvents<T extends Row>(recent: T[], mains: T[][]): T[] {
  const seen = new Map<string, T>();
  for (const r of [...recent, ...mains.flat()]) if (!seen.has(r.msgId)) seen.set(r.msgId, r);
  return [...seen.values()].sort((a, b) => a.ts.getTime() - b.ts.getTime() || a.seq - b.seq);
}
