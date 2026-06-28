import { APP_NAME } from "@/lib/constants";

export const SIDEBAR_SETTINGS_KEY = "sidebar";

type SidebarNavItem = {
  id: string;
  href: string;
  defaultLabel: string;
  adminOnly: boolean;
};

export const SIDEBAR_NAV_ITEMS = [
  { id: "dashboard", href: "/dashboard", defaultLabel: "Dashboard", adminOnly: false },
  { id: "positions", href: "/positions", defaultLabel: "岗位招聘进度", adminOnly: false },
  { id: "intake", href: "/intake", defaultLabel: "AI Intake", adminOnly: false },
  { id: "rawInputs", href: "/raw-inputs", defaultLabel: "原始输入", adminOnly: false },
  { id: "candidates", href: "/candidates", defaultLabel: "候选人管理", adminOnly: false },
  { id: "kanban", href: "/kanban", defaultLabel: "招聘看板", adminOnly: false },
  { id: "agentTasks", href: "/agent-tasks", defaultLabel: "Agent 日志", adminOnly: false },
  { id: "adminUsers", href: "/admin/users", defaultLabel: "后台管理", adminOnly: true }
] as const satisfies readonly SidebarNavItem[];

export type SidebarNavItemId = (typeof SIDEBAR_NAV_ITEMS)[number]["id"];

export type SidebarSettings = {
  brandTitle: string;
  brandDescription: string;
  navLabels: Record<SidebarNavItemId, string>;
};

export const DEFAULT_SIDEBAR_SETTINGS: SidebarSettings = {
  brandTitle: APP_NAME,
  brandDescription: "把简历录入、状态推进、待跟进提醒和招聘分析串成一条可落地的 AI 招聘工作流。",
  navLabels: Object.fromEntries(
    SIDEBAR_NAV_ITEMS.map((item) => [item.id, item.defaultLabel])
  ) as Record<SidebarNavItemId, string>
};

function stringSetting(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeSidebarSettings(value: unknown): SidebarSettings {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
  const maybeNavLabels = record.navLabels;
  const rawLabels =
    maybeNavLabels && typeof maybeNavLabels === "object" && !Array.isArray(maybeNavLabels)
      ? (maybeNavLabels as Record<string, unknown>)
      : {};

  const navLabels = Object.fromEntries(
    SIDEBAR_NAV_ITEMS.map((item) => {
      const label = stringSetting(rawLabels, item.id);
      return [item.id, label || item.defaultLabel];
    })
  ) as Record<SidebarNavItemId, string>;

  return {
    brandTitle: stringSetting(record, "brandTitle") || DEFAULT_SIDEBAR_SETTINGS.brandTitle,
    brandDescription:
      stringSetting(record, "brandDescription") || DEFAULT_SIDEBAR_SETTINGS.brandDescription,
    navLabels
  };
}
