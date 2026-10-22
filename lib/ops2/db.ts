import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/app/generated/prisma/client";

// ops2 전용 DB 연결 — 세션 시간대를 UTC 로 고정한다.
// @prisma/adapter-pg 는 Date 를 오프셋 없는 UTC 값으로 보내고(formatDateTime) timestamptz 를 읽을 때 오프셋을 버린다.
// 그래서 세션 시간대가 UTC 가 아니면 timestamptz 가 어긋난다. 연결 시작 옵션이라 서버·DB 의 timezone 설정보다 우선한다.
// ops2 코드(ingest·lease·관리 API)는 이 연결만 쓴다. 세션 확인 등 그 밖은 lib/prisma.ts 그대로.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL, options: "-c TimeZone=UTC", max: 5 });

// 개발 중 핫리로드로 인한 PrismaClient 중복 생성 방지용 globalThis 싱글톤(lib/prisma.ts 와 같은 방식).
const globalForOps2 = globalThis as unknown as {
  ops2Db: PrismaClient | undefined;
};

export const ops2Db = globalForOps2.ops2Db ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForOps2.ops2Db = ops2Db;
}
