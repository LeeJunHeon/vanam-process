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
import OpsDashboardPage from "@/components/OpsDashboardPage";
import Ch12Page from "@/components/Ch12Page";
import EquipmentStubPage from "@/components/EquipmentStubPage";
import ChkPage from "@/components/ChkPage";

type Page =
  | "dashboard" | "processes" | "orders" | "substrate" | "activity"
  | "opsDashboard"
  | "equipCh12" | "equipChk" | "equipRayvac" | "equipNcd" | "equipEvap" | "equipInline";
type Workspace = "business" | "ops";

const pageTitle: Record<Page, string> = {
  dashboard: "대시보드",
  processes: "공정 관리",
  orders: "발주 관리",
  substrate: "기판 반입 기록",
  activity: "활동 이력",
  opsDashboard: "운전 대시보드",
  equipCh12: "CH1&2 Sputter",
  equipChk: "CHK",
  equipRayvac: "Rayvac ALD",
  equipNcd: "NCD ALD",
  equipEvap: "Evaporator",
  equipInline: "In-Line Sputter",
};

// 워크스페이스별 시작 페이지
const WS_HOME: Record<Workspace, Page> = {
  business: "dashboard",
  ops: "opsDashboard",
};

const WS_STORAGE_KEY = "vanam-process:workspace";

export default function AppShell() {
  const [workspace, setWorkspace] = useState<Workspace>("business");
  const [page, setPage] = useState<Page>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // 로드 시 열린 상태(애니메이션 없음), 모바일이면 닫기 + 마지막 워크스페이스 복원
  useEffect(() => {
    if (window.innerWidth < 1024) setSidebarOpen(false);
    try {
      if (window.localStorage.getItem(WS_STORAGE_KEY) === "ops") {
        setWorkspace("ops");
        setPage(WS_HOME.ops);
      }
    } catch {
      // localStorage 접근 실패(사파리 프라이빗 모드 등)는 무시
    }
  }, []);

  // 워크스페이스 전환 시 해당 홈 페이지로 이동하고 선택을 저장한다
  const changeWorkspace = (ws: Workspace) => {
    setWorkspace(ws);
    setPage(WS_HOME[ws]);
    try {
      window.localStorage.setItem(WS_STORAGE_KEY, ws);
    } catch {
      // 저장 실패는 무시
    }
  };

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
        workspace={workspace}
        onWorkspaceChange={changeWorkspace}
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
          {page === "opsDashboard" && <OpsDashboardPage onNavigate={setPage} />}
          {page === "equipCh12" && <Ch12Page />}
          {page === "equipChk" && <ChkPage />}
          {page === "equipRayvac" && <EquipmentStubPage equip="rayvac" />}
          {page === "equipNcd" && <EquipmentStubPage equip="ncd" />}
          {page === "equipEvap" && <EquipmentStubPage equip="evap" />}
          {page === "equipInline" && <EquipmentStubPage equip="inline" />}
        </main>
      </div>
    </div>
  );
}
