// 메뉴 정의 — 사이드바·AppShell(제목·권한 가드)·딥링크 검증·포털 메뉴 API(/api/portal-menus)가 함께 쓴다.
// 서버에서도 import 하므로 React·아이콘 컴포넌트를 두지 않고 아이콘은 lucide 이름 문자열로 둔다.

export type Page =
  | "dashboard" | "processes" | "orders" | "substrate" | "activity"
  | "opsDashboard"
  | "equipCh12" | "equipChk" | "equipRayvac" | "equipNcd" | "equipEvap" | "equipInline"
  | "ops2Admin";
export type Workspace = "business" | "ops";

// 포털 런처와 약속한 아이콘 이름 중 이 앱이 쓰는 것
export type NavIconName =
  | "LayoutDashboard" | "ListChecks" | "Layers" | "ClipboardList" | "History" | "Gauge" | "Cpu";

export type NavItem = { key: Page; label: string; icon: NavIconName; adminOnly?: boolean };

// 업무 관리 워크스페이스 — 기존 메뉴 그대로 (ISA-95 Level 4 영역)
export const BUSINESS_NAV: NavItem[] = [
  { key: "dashboard", label: "대시보드", icon: "LayoutDashboard" },
  { key: "processes", label: "공정 관리", icon: "ListChecks" },
  { key: "substrate", label: "기판 반입 기록", icon: "Layers" },
  { key: "orders", label: "발주 관리", icon: "ClipboardList", adminOnly: true },
  { key: "activity", label: "활동 이력", icon: "History", adminOnly: true },
];

// 장비 운전 워크스페이스 — 장비 아이콘은 Cpu로 통일
export const OPS_NAV: NavItem[] = [
  { key: "opsDashboard", label: "운전 대시보드", icon: "Gauge" },
  { key: "equipCh12", label: "CH1&2 Sputter", icon: "Cpu" },
  { key: "equipChk", label: "CHK", icon: "Cpu" },
  { key: "equipRayvac", label: "Rayvac ALD", icon: "Cpu" },
  { key: "equipNcd", label: "NCD ALD", icon: "Cpu" },
  { key: "equipEvap", label: "Evaporator", icon: "Cpu" },
  { key: "equipInline", label: "In-Line Sputter", icon: "Cpu" },
  { key: "ops2Admin", label: "장비 관리(v2)", icon: "Gauge", adminOnly: true },
];

export const NAV_BY_WORKSPACE: Record<Workspace, NavItem[]> = {
  business: BUSINESS_NAV,
  ops: OPS_NAV,
};

// 워크스페이스별 시작 페이지
export const WS_HOME: Record<Workspace, Page> = {
  business: "dashboard",
  ops: "opsDashboard",
};

const ALL_NAV = [...BUSINESS_NAV, ...OPS_NAV];

// 헤더 제목 = 메뉴 이름
export const PAGE_TITLE = Object.fromEntries(ALL_NAV.map((n) => [n.key, n.label])) as Record<Page, string>;

export function isPage(v: unknown): v is Page {
  return typeof v === "string" && ALL_NAV.some((n) => n.key === v);
}

export function workspaceOf(page: Page): Workspace {
  return OPS_NAV.some((n) => n.key === page) ? "ops" : "business";
}

export function isAdminOnlyPage(page: Page): boolean {
  return ALL_NAV.some((n) => n.key === page && n.adminOnly);
}

/** 사이드바에 보이는 순서(공통 → 관리자 그룹) 그대로, 권한에 맞는 메뉴만. */
export function visibleNav(ws: Workspace, isAdmin: boolean): { common: NavItem[]; admin: NavItem[] } {
  const nav = NAV_BY_WORKSPACE[ws];
  return {
    common: nav.filter((n) => !n.adminOnly),
    admin: isAdmin ? nav.filter((n) => n.adminOnly) : [],
  };
}

/** 포털 런처용 — 업무 → 운전 순서로 한 목록. */
export function visibleMenus(isAdmin: boolean): NavItem[] {
  return (["business", "ops"] as const).flatMap((ws) => {
    const v = visibleNav(ws, isAdmin);
    return [...v.common, ...v.admin];
  });
}
