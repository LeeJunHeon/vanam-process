"use client";

import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";

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
          {page === "substrate" && (
            <div className="p-4 sm:p-6">
              <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center text-sm text-gray-400">
                기판 반입 기록 화면 — 다음 단계에서 구현
              </div>
            </div>
          )}
          {page === "activity" && (
            <div className="p-4 sm:p-6">
              <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center text-sm text-gray-400">
                활동 이력 화면 — 다음 단계에서 구현
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
