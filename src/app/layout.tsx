import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { AuthProvider } from "@/components/auth/auth-provider";
import { APP_NAME } from "@/lib/constants";
import { getSidebarSettings } from "@/lib/services/app-settings";

import "./globals.css";

export const metadata: Metadata = {
  title: APP_NAME,
  description: "AI 招聘录入、候选人管理、流程跟进与数据看板系统"
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const sidebarSettings = await getSidebarSettings();

  return (
    <html lang="zh-CN">
      <body>
        <AuthProvider>
          <AppShell sidebarSettings={sidebarSettings}>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
