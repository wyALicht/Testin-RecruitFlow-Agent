"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState, useTransition } from "react";

import { writeTabSessionToken } from "@/lib/auth/client-session";

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("admin@testin.local");
  const [password, setPassword] = useState("Admin123456");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const from = searchParams.get("from");
  const registerHref = useMemo(() => {
    return from ? `/register?from=${encodeURIComponent(from)}` : "/register";
  }, [from]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/auth/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            email,
            password
          })
        });

        const payload = (await response.json()) as { error?: string; sessionToken?: string };
        if (!response.ok) {
          setError(payload.error || "登录失败");
          return;
        }

        if (payload.sessionToken) {
          writeTabSessionToken(payload.sessionToken);
        }

        router.replace(from || "/dashboard");
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "登录失败");
      }
    });
  }

  return (
    <div className="login-shell">
      <section className="login-card">
        <div className="login-header">
          <span className="pill emerald">Testin RecruitFlow Agent</span>
          <h1>登录系统</h1>
          <p>登录页与业务页完全分离。所有账号共享候选人数据库，但每个标签页会保留自己的登录身份。</p>
        </div>

        <form className="grid" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="login-email">邮箱</label>
            <input
              id="login-email"
              className="input"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="login-password">密码</label>
            <input
              id="login-password"
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          {error ? <div className="alert danger">{error}</div> : null}

          <button className="btn" type="submit" disabled={isPending}>
            {isPending ? "登录中..." : "登录并进入系统"}
          </button>
        </form>

        <div className="auth-switch">
          <span className="muted">还没有账号？</span>
          <Link href={registerHref} className="btn-secondary auth-link-button">
            注册招聘账号
          </Link>
        </div>

        <div className="page-note login-note">
          <div>默认管理员账号：`admin@testin.local` / `Admin123456`</div>
          <div>默认 HR 账号：`hr@testin.local` / `Hr123456`</div>
        </div>
      </section>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="login-shell">
          <section className="login-card">正在加载登录页...</section>
        </div>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}
