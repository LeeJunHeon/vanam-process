"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import DashboardPage from "@/components/DashboardPage";
import ProcessesPage from "@/components/ProcessesPage";
import OrdersPage from "@/components/OrdersPage";
import SubstratePage from "@/components/SubstratePage";
import ActivityPage from "@/components/ActivityPage";

type Page = "dashboard" | "processes" | "orders" | "substrate" | "activity";

const pageTitle: Record<Page, string> = {
  dashboard: "대시보드",
  processes: "공정 관리",
  orders: "발주 관리",
  substrate: "기판 반입 기록",
  activity: "활동 이력",
};

export default function AppShell() {
  const [page, setPage] = useState<Page>("dashboard");
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
    if ((page === "activity" || page === "orders") && session && !isAdmin)
      setPage("dashboard");
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
          {page === "dashboard" && <DashboardPage />}
          {page === "processes" && <ProcessesPage />}
          {page === "orders" && <OrdersPage />}
          {page === "substrate" && <SubstratePage />}
          {page === "activity" && <ActivityPage />}
        </main>
      </div>
    </div>
  );
}
