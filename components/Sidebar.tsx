"use client";

import { useState } from "react";
import { Workflow, LayoutDashboard, ClipboardList, ListChecks, Layers, History, Gauge, Cpu, X, LogOut, ArrowLeft } from "lucide-react";
import { useSession, signOut } from "next-auth/react";

type Page =
  | "dashboard" | "processes" | "orders" | "substrate" | "activity"
  | "opsDashboard"
  | "equipCh12" | "equipChk" | "equipRayvac" | "equipNcd" | "equipEvap" | "equipInline";
type Workspace = "business" | "ops";

interface SidebarProps {
  workspace: Workspace;
  onWorkspaceChange: (ws: Workspace) => void;
  currentPage: Page;
  onNavigate: (page: Page) => void;
  isOpen: boolean;
  onClose: () => void;
}

type NavItem = { key: Page; label: string; icon: typeof Layers; adminOnly?: boolean };

// 업무 관리 워크스페이스 — 기존 메뉴 그대로 (ISA-95 Level 4 영역)
const BUSINESS_NAV: NavItem[] = [
  { key: "dashboard", label: "대시보드", icon: LayoutDashboard },
  { key: "processes", label: "공정 관리", icon: ListChecks },
  { key: "substrate", label: "기판 반입 기록", icon: Layers },
  { key: "orders", label: "발주 관리", icon: ClipboardList, adminOnly: true },
  { key: "activity", label: "활동 이력", icon: History, adminOnly: true },
];

// 장비 운전 워크스페이스 — 장비 아이콘은 Cpu로 통일
const OPS_NAV: NavItem[] = [
  { key: "opsDashboard", label: "운전 대시보드", icon: Gauge },
  { key: "equipCh12", label: "CH1&2 Sputter", icon: Cpu },
  { key: "equipChk", label: "CHK", icon: Cpu },
  { key: "equipRayvac", label: "Rayvac ALD", icon: Cpu },
  { key: "equipNcd", label: "NCD ALD", icon: Cpu },
  { key: "equipEvap", label: "Evaporator", icon: Cpu },
  { key: "equipInline", label: "In-Line Sputter", icon: Cpu },
];

export default function Sidebar({
  workspace,
  onWorkspaceChange,
  currentPage,
  onNavigate,
  isOpen,
  onClose,
}: SidebarProps) {
  const { data: session } = useSession();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const userName = session?.user?.name ?? "사용자";
  const role = (session?.user as { role?: string })?.role;
  const roleLabel =
    role === "ceo" ? "대표" : role === "admin" ? "관리자" : "직원";
  const isAdmin = role === "admin" || role === "ceo";
  const nav = workspace === "ops" ? OPS_NAV : BUSINESS_NAV;
  const commonItems = nav.filter((item) => !item.adminOnly);
  const adminItems = isAdmin ? nav.filter((item) => item.adminOnly) : [];
  const initial = (() => {
    if (!userName || userName === "사용자") return "?";
    const parts = userName.trim().split(" ").filter((p) => p.length > 0);
    const target = parts.length > 1 ? parts[parts.length - 1] : parts[0];
    return target.charAt(0).toUpperCase();
  })();

  const handleNav = (page: Page) => {
    onNavigate(page);
    if (window.innerWidth < 1024) onClose();
  };

  // 공통 / 관리자 그룹에서 같은 버튼을 재사용한다
  const renderNavItem = (item: NavItem) => {
    const Icon = item.icon;
    const active = currentPage === item.key;
    return (
      <button
        key={item.key}
        onClick={() => handleNav(item.key)}
        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all ${
          active
            ? "bg-blue-50 font-semibold text-blue-600"
            : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
        }`}
      >
        <Icon
          size={18}
          className={active ? "text-blue-500" : "text-gray-400"}
        />
        <span className="flex-1 text-left">{item.label}</span>
      </button>
    );
  };

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex shrink-0 flex-col border-r border-gray-100 bg-white transition-all duration-300 lg:static ${
          isOpen
            ? "w-64 translate-x-0"
            : "-translate-x-full lg:w-0 lg:translate-x-0 lg:overflow-hidden lg:border-0"
        }`}
      >
        {/* 포털로 이동 */}
        <a
          href="https://vanam.synology.me"
          className="flex items-center gap-2 border-b border-gray-100 px-5 py-3 text-blue-600 transition-colors hover:bg-blue-50"
          style={{ textDecoration: "none" }}
        >
          <ArrowLeft size={16} />
          <span className="text-sm font-semibold">VanaM 포털</span>
        </a>

        {/* 로고 */}
        <div className="border-b border-gray-100 px-5 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500">
                <Workflow size={16} className="text-white" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-gray-900">공정 관리</h1>
                <p className="text-[10px] text-gray-400">Process Management</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 hover:bg-gray-100 lg:hidden"
            >
              <X size={18} className="text-gray-400" />
            </button>
          </div>
        </div>

        {/* 워크스페이스 전환 (업무 관리 ↔ 장비 운전) */}
        <div className="px-3 pt-4">
          <div className="flex rounded-xl bg-gray-100 p-1">
            <button
              onClick={() => onWorkspaceChange("business")}
              className={`flex-1 rounded-lg py-1.5 text-xs transition-all ${
                workspace === "business"
                  ? "bg-white font-semibold text-blue-600 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              업무 관리
            </button>
            <button
              onClick={() => onWorkspaceChange("ops")}
              className={`flex-1 rounded-lg py-1.5 text-xs transition-all ${
                workspace === "ops"
                  ? "bg-white font-semibold text-blue-600 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              장비 운전
            </button>
          </div>
        </div>

        {/* 네비게이션 */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
          {commonItems.map(renderNavItem)}
          {adminItems.length > 0 && (
            <>
              <div className="px-3 pt-3 pb-1">
                <p className="px-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                  관리자
                </p>
              </div>
              {adminItems.map(renderNavItem)}
            </>
          )}
        </nav>

        {/* 사용자 정보 */}
        <div className="border-t border-gray-100 px-3 py-4">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-600">
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-gray-900">
                {userName}
              </p>
              <p className="text-[10px] text-gray-400">{roleLabel}</p>
            </div>
            <button
              onClick={() => setShowLogoutConfirm(true)}
              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
              title="로그아웃"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {showLogoutConfirm && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
        >
          <div className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-gray-900">로그아웃</h3>
            <p className="text-sm text-gray-500">정말 로그아웃하시겠습니까?</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="rounded-xl bg-gray-100 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200"
              >
                취소
              </button>
              <button
                onClick={() =>
                  signOut({ callbackUrl: "https://vanam.synology.me/login" })
                }
                className="rounded-xl bg-rose-500 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-rose-600"
              >
                로그아웃
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
