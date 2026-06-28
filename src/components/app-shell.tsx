"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { SidebarSettingsEditor } from "@/components/settings/sidebar-settings-editor";
import { UserMenu } from "@/components/auth/user-menu";
import {
  SIDEBAR_NAV_ITEMS,
  type SidebarSettings
} from "@/lib/sidebar-settings";

export function AppShell({
  children,
  sidebarSettings
}: {
  children: ReactNode;
  sidebarSettings: SidebarSettings;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [currentSidebarSettings, setCurrentSidebarSettings] = useState(sidebarSettings);
  const [isSidebarEditorOpen, setIsSidebarEditorOpen] = useState(false);

  useEffect(() => {
    if (pathname !== "/login" && pathname !== "/register" && !isLoading && !user) {
      router.replace(`/login?from=${encodeURIComponent(pathname)}`);
    }
  }, [isLoading, pathname, router, user]);

  useEffect(() => {
    setCurrentSidebarSettings(sidebarSettings);
  }, [sidebarSettings]);

  if (pathname === "/login" || pathname === "/register") {
    return <main>{children}</main>;
  }

  if (isLoading || !user) {
    return (
      <main className="app-shell-loading">
        <div className="empty-state">正在校验当前标签页的登录状态...</div>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <h1>{currentSidebarSettings.brandTitle}</h1>
          <p>{currentSidebarSettings.brandDescription}</p>
        </div>

        <nav className="nav-list">
          {SIDEBAR_NAV_ITEMS.filter((item) => !item.adminOnly || user.role === "admin").map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link key={item.href} href={item.href} className={`nav-link ${isActive ? "active" : ""}`}>
                {currentSidebarSettings.navLabels[item.id]}
              </Link>
            );
          })}
        </nav>

        {user.role === "admin" ? (
          <button
            className="sidebar-settings-trigger"
            type="button"
            onClick={() => setIsSidebarEditorOpen(true)}
          >
            编辑侧边栏
          </button>
        ) : null}
      </aside>

      <main className="main">
        <div className="topbar">
          <div className="topbar-copy">
            <strong>共享候选人数据库</strong>
            <div className="muted">所有账号看到的是同一份候选人库，但每个标签页可以保持自己的登录身份。</div>
          </div>
          <UserMenu />
        </div>

        {children}
      </main>

      {user.role === "admin" ? (
        <SidebarSettingsEditor
          open={isSidebarEditorOpen}
          settings={currentSidebarSettings}
          onClose={() => setIsSidebarEditorOpen(false)}
          onSaved={(nextSettings) => {
            setCurrentSidebarSettings(nextSettings);
            setIsSidebarEditorOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
