"use client";

import { useEffect, useRef, useState } from "react";
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
import Ops2AdminPage from "@/components/ops2/Ops2AdminPage";
import {
  PAGE_TITLE, WS_HOME, isAdminOnlyPage, isPage, workspaceOf, type Page, type Workspace,
} from "@/lib/navMenu";
import { readPageParam, sendLauncherUsage, writePageParam } from "@/lib/launcher";

const WS_STORAGE_KEY = "vanam-process:workspace";

// 주소에 쓸 page 값 — 기본 화면(업무 대시보드)이면 null(파라미터 삭제)
const pageParamFor = (ws: Workspace, pg: Page) =>
  ws === "business" && pg === WS_HOME.business ? null : pg;

export default function AppShell() {
  const [workspace, setWorkspace] = useState<Workspace>("business");
  const [page, setPage] = useState<Page>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // 로드 시 열린 상태(애니메이션 없음), 모바일이면 닫기.
  // 화면은 주소의 ?page= (포털 런처 딥링크)가 우선이고, 없으면 마지막 워크스페이스를 복원한다.
  // 딥링크로 정해진 워크스페이스는 저장하지 않는다(사용자가 직접 바꾼 것만 저장).
  useEffect(() => {
    if (window.innerWidth < 1024) setSidebarOpen(false);
    let ws: Workspace = "business";
    let pg: Page = WS_HOME.business;
    const deep = readPageParam();
    if (isPage(deep)) {
      ws = workspaceOf(deep);
      pg = deep;
    } else {
      // 모르는 키는 무시하고 기존 복원 규칙을 따른다
      try {
        if (window.localStorage.getItem(WS_STORAGE_KEY) === "ops") {
          ws = "ops";
          pg = WS_HOME.ops;
        }
      } catch {
        // localStorage 접근 실패(사파리 프라이빗 모드 등)는 무시
      }
    }
    setWorkspace(ws);
    setPage(pg);
    writePageParam(pageParamFor(ws, pg));
  }, []);

  // 화면이 바뀔 때마다 주소의 page 를 맞춘다(기본 화면이면 지움). 첫 실행은 건너뛴다 —
  // 초기값(dashboard)으로 주소를 지우지 않도록. 첫 화면의 주소는 위 복원 효과가 맞춘다.
  const urlSynced = useRef(false);
  useEffect(() => {
    if (!urlSynced.current) {
      urlSynced.current = true;
      return;
    }
    writePageParam(pageParamFor(workspace, page));
  }, [workspace, page]);

  // 사용자가 메뉴로 화면을 옮길 때만 쓴다(사용 기록은 여기서만 보낸다).
  // 같은 메뉴를 다시 누른 경우는 아무 것도 하지 않는다.
  const navigate = (next: Page) => {
    if (next === page) return;
    setPage(next);
    sendLauncherUsage(next);
  };

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
    if (isAdminOnlyPage(page) && session && !isAdmin)
      setPage("dashboard");
  }, [page, session, isAdmin]);

  return (
    <div className="flex h-screen">
      <Sidebar
        workspace={workspace}
        onWorkspaceChange={changeWorkspace}
        currentPage={page}
        onNavigate={navigate}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          title={PAGE_TITLE[page]}
          onToggleSidebar={() => setSidebarOpen((o) => !o)}
        />
        <main className="flex-1 overflow-y-auto bg-gray-50">
          {page === "dashboard" && <DashboardPage />}
          {page === "processes" && <ProcessesPage />}
          {page === "orders" && <OrdersPage />}
          {page === "substrate" && <SubstratePage />}
          {page === "activity" && <ActivityPage />}
          {page === "opsDashboard" && <OpsDashboardPage onNavigate={navigate} />}
          {page === "equipCh12" && <Ch12Page />}
          {page === "equipChk" && <ChkPage />}
          {page === "equipRayvac" && <EquipmentStubPage equip="rayvac" />}
          {page === "equipNcd" && <EquipmentStubPage equip="ncd" />}
          {page === "equipEvap" && <EquipmentStubPage equip="evap" />}
          {page === "equipInline" && <EquipmentStubPage equip="inline" />}
          {page === "ops2Admin" && <Ops2AdminPage />}
        </main>
      </div>
    </div>
  );
}
