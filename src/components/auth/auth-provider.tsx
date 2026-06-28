"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";

import { authFetch, readTabSessionToken } from "@/lib/auth/client-session";
import {
  hasPermission,
  type AppRole,
  type Permission
} from "@/lib/auth/permissions";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: AppRole;
};

type AuthContextValue = {
  user: CurrentUser | null;
  isLoading: boolean;
  error: string | null;
  can: (permission: Permission) => boolean;
  refreshSession: () => Promise<void>;
  clearSession: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function isPublicPath(pathname: string) {
  return pathname === "/login" || pathname === "/register";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(!isPublicPath(pathname));
  const [error, setError] = useState<string | null>(null);
  const isPublic = isPublicPath(pathname);
  const hasSessionToken = !isPublic && Boolean(readTabSessionToken());
  const effectiveIsLoading = isLoading || (!user && hasSessionToken);

  const refreshSession = useCallback(async () => {
    if (!readTabSessionToken()) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await authFetch("/api/auth/session", {
        cache: "no-store"
      });

      if (!response.ok) {
        setUser(null);
        return;
      }

      const payload = (await response.json()) as {
        authenticated: true;
        user: CurrentUser;
      };
      setUser(payload.user);
    } catch (requestError) {
      setUser(null);
      setError(requestError instanceof Error ? requestError.message : "获取登录信息失败");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isPublicPath(pathname)) {
      setIsLoading(false);
      return;
    }

    void refreshSession();
  }, [pathname, refreshSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading: effectiveIsLoading,
      error,
      can: (permission) => Boolean(user && hasPermission(user.role, permission)),
      refreshSession,
      clearSession: () => {
        setUser(null);
        setError(null);
      }
    }),
    [effectiveIsLoading, error, refreshSession, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth 必须在 AuthProvider 内使用");
  }
  return context;
}
