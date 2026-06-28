"use client";

import type { ReactNode } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import type { Permission } from "@/lib/auth/permissions";

export function AdminOnly({
  children,
  fallback
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div className="empty-state">正在校验管理员权限...</div>;
  }

  if (user?.role !== "admin") {
    return (
      fallback ?? (
        <div className="permission-empty-state">
          <strong>当前账号没有管理权限</strong>
          <p>该功能仅管理员可使用，普通用户仍可继续进行简历录入、候选人维护和招聘流程跟进。</p>
        </div>
      )
    );
  }

  return children;
}

export function PermissionGate({
  permission,
  children,
  fallback = null
}: {
  permission: Permission;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { can, isLoading } = useAuth();
  if (isLoading) return null;
  return can(permission) ? children : fallback;
}
