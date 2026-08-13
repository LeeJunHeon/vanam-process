"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import SubstratePage from "@/components/SubstratePage";
import ActivityPage from "@/components/ActivityPage";

type Page = "substrate" | "activity";

const pageTitle: Record<Page, string> = {
  substrate: "기판 반입 기록",
  activity: "활동 이력",
};

export default function AppShell() {
  const [page, setPage] = useState<Page>("substrate");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // 로드 시 열린 상태(애니메이션 없음), 모바일이면 닫기
  useEffect(() => {
    if (window.innerWidth < 1024) setSidebarOpen(false);
  }, []);

  const { data: session } = useSession();
  const role = (session?.user as { role?: string })?.role;
  const isAdmin = role === "admin" || role === "ceo";

  // 비관리자가 활동 이력에 머무르지 않도록 기본 화면으로 되돌린다
  useEffect(() => {
    if (page === "activity" && session && !isAdmin) setPage("substrate");
  }, [page, session, isAdmin]);

  return (
    <div className="flex h-screen">
      <Sidebar
        currentPage={page}
        onNavigate={setPage}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          title={pageTitle[page]}
          onToggleSidebar={() => setSidebarOpen((o) => !o)}
        />
        <main className="flex-1 overflow-y-auto bg-gray-50">
          {page === "substrate" && <SubstratePage />}
          {page === "activity" && <ActivityPage />}
        </main>
      </div>
    </div>
  );
}
