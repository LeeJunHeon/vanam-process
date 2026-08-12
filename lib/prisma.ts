import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/app/generated/prisma/client";

// Prisma 7 (prisma-client 제너레이터)은 드라이버 어댑터로 접속한다.
// datasource 블록엔 url이 없고, 접속정보는 런타임에 어댑터로 주입한다.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

// 개발 중 핫리로드로 인한 PrismaClient 중복 생성 방지용 globalThis 싱글톤.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
