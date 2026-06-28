"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { authFetch, clearTabSessionToken } from "@/lib/auth/client-session";
import { roleLabel } from "@/lib/auth/permissions";

export function UserMenu() {
  const router = useRouter();
  const { user: session, isLoading, error: sessionError, clearSession } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleLogout() {
    setError(null);

    startTransition(async () => {
      try {
        clearTabSessionToken();
        await authFetch("/api/auth/logout", {
          method: "POST"
        });
        clearSession();
        router.replace("/login");
        router.refresh();
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "退出登录失败");
      }
    });
  }

  const initials = useMemo(() => {
    if (!session?.name) {
      return "RF";
    }

    return session.name
      .split(/\s+/)
      .map((part) => part.slice(0, 1).toUpperCase())
      .join("")
      .slice(0, 2);
  }, [session]);

  return (
    <div className="user-menu">
      <div className="user-card user-card-compact">
        <div className="user-card-top">
          <div className="user-avatar" aria-hidden="true">
            {isLoading ? "..." : initials}
          </div>

          <div className="user-meta">
            {isLoading ? <strong>读取中</strong> : <strong>{session?.name ?? "未登录"}</strong>}
          </div>

          <span className={`pill pill-mini ${session?.role === "admin" ? "slate" : "blue"}`}>
            {session ? roleLabel(session.role) : "失效"}
          </span>
        </div>

        <div className="user-popover" role="group" aria-label="登录信息">
          {session ? <div className="user-popover-email">{session.email}</div> : null}

          <button
            className="btn-secondary user-logout-button"
            type="button"
            onClick={handleLogout}
            disabled={isPending || isLoading || !session}
          >
            {isPending ? "退出中..." : "退出登录"}
          </button>
        </div>
      </div>

      {error || sessionError ? <div className="danger-text">{error || sessionError}</div> : null}
    </div>
  );
}
