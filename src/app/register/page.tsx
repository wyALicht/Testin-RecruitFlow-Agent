"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState, useTransition } from "react";

import { writeTabSessionToken } from "@/lib/auth/client-session";

function RegisterPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const from = searchParams.get("from");
  const loginHref = useMemo(() => {
    return from ? `/login?from=${encodeURIComponent(from)}` : "/login";
  }, [from]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/auth/register", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            name,
            email,
            password,
            confirmPassword
          })
        });

        const payload = (await response.json()) as { error?: string; sessionToken?: string };
        if (!response.ok) {
          setError(payload.error || "注册失败");
          return;
        }

        if (payload.sessionToken) {
          writeTabSessionToken(payload.sessionToken);
        }

        router.replace(from || "/dashboard");
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "注册失败");
      }
    });
  }

  return (
    <div className="login-shell">
      <section className="login-card">
        <div className="login-header">
          <span className="pill emerald">Testin RecruitFlow Agent</span>
          <h1>注册账号</h1>
          <p>新注册账号默认创建为招聘账号。注册成功后会直接进入系统，并在当前标签页内保持独立登录状态。</p>
        </div>

        <form className="grid" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="register-name">姓名</label>
            <input
              id="register-name"
              className="input"
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="例如：张三"
            />
          </div>

          <div className="field">
            <label htmlFor="register-email">邮箱</label>
            <input
              id="register-email"
              className="input"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
            />
          </div>

          <div className="field">
            <label htmlFor="register-password">密码</label>
            <input
              id="register-password"
              className="input"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="至少 8 位，包含字母和数字"
            />
          </div>

          <div className="field">
            <label htmlFor="register-confirm-password">确认密码</label>
            <input
              id="register-confirm-password"
              className="input"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="再次输入密码"
            />
          </div>

          {error ? <div className="alert danger">{error}</div> : null}

          <button className="btn" type="submit" disabled={isPending}>
            {isPending ? "注册中..." : "注册并进入系统"}
          </button>
        </form>

        <div className="auth-switch">
          <span className="muted">已经有账号？</span>
          <Link href={loginHref} className="btn-secondary auth-link-button">
            返回登录
          </Link>
        </div>

        <div className="page-note login-note">
          <div>公开注册默认创建招聘账号，不会自动授予管理员权限。</div>
          <div>同一浏览器中不同标签页可以分别登录不同账号，但候选人数据库仍然共享。</div>
        </div>
      </section>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="login-shell">
          <section className="login-card">正在加载注册页...</section>
        </div>
      }
    >
      <RegisterPageContent />
    </Suspense>
  );
}
