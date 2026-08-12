import NextAuth from "next-auth";
import { prisma } from "@/lib/prisma";
import { authConfig } from "./auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;
      const dbUser = await prisma.user.findUnique({
        where: { email: user.email },
      });
      // public.user에 등록된 활성 사용자만 허용
      if (!dbUser || dbUser.isActive !== "Y") return false;
      return true;
    },
    async session({ session }) {
      if (!session.user?.email) return session;
      const dbUser = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true, name: true },
      });
      if (!dbUser) {
        session.user.dbId = null;
        session.user.role = "employee";
        session.user.employeeId = null;
        return session;
      }
      // hr 권한 source = position.code (CEO/ADMIN/EMPLOYEE)
      const employee = await prisma.employee.findUnique({
        where: { userId: dbUser.id },
        select: { id: true, position: { select: { code: true } } },
      });
      const positionCode = employee?.position?.code ?? null;
      session.user.name = dbUser.name;
      session.user.dbId = dbUser.id;
      session.user.role =
        positionCode === "CEO"
          ? "ceo"
          : positionCode === "ADMIN"
            ? "admin"
            : "employee";
      session.user.employeeId = employee?.id ?? null;
      return session;
    },
  },
});
