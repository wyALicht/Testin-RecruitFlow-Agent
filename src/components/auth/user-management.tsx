"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { authFetch } from "@/lib/auth/client-session";
import { roleLabel, type AppRole } from "@/lib/auth/permissions";
import { formatDateTime } from "@/lib/utils";

type ManagedUser = {
  id: string;
  name: string;
  email: string;
  role: AppRole;
  createdAt: string;
  updatedAt?: string;
};

export function UserManagement() {
  const { user: currentUser, refreshSession } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function loadUsers() {
    setIsLoading(true);
    setError(null);
    try {
      const response = await authFetch("/api/admin/users", { cache: "no-store" });
      const payload = (await response.json()) as ManagedUser[] & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "加载用户列表失败");
      }
      setUsers(payload);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "加载用户列表失败");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  const counts = useMemo(
    () => ({
      total: users.length,
      admin: users.filter((user) => user.role === "admin").length,
      recruiter: users.filter((user) => user.role === "recruiter").length
    }),
    [users]
  );

  function createUser(formData: FormData) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const response = await authFetch("/api/admin/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formData.get("name"),
            email: formData.get("email"),
            password: formData.get("password"),
            role: formData.get("role")
          })
        });
        const payload = (await response.json()) as ManagedUser & { error?: string };
        if (!response.ok) throw new Error(payload.error || "创建用户失败");

        setShowCreate(false);
        setMessage(`账号 ${payload.email} 已创建。`);
        await loadUsers();
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "创建用户失败");
      }
    });
  }

  function changeRole(user: ManagedUser, role: AppRole) {
    if (user.role === role) return;
    const confirmed = window.confirm(
      `确认将“${user.name}”设置为${roleLabel(role)}吗？权限会在该用户下次请求时立即生效。`
    );
    if (!confirmed) return;

    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const response = await authFetch(`/api/admin/users/${user.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role })
        });
        const payload = (await response.json()) as ManagedUser & { error?: string };
        if (!response.ok) throw new Error(payload.error || "调整角色失败");

        setUsers((current) => current.map((item) => (item.id === payload.id ? payload : item)));
        setMessage(`${payload.name} 已调整为${roleLabel(payload.role)}。`);
        if (payload.id === currentUser?.id) await refreshSession();
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "调整角色失败");
      }
    });
  }

  return (
    <>
      <section className="grid cols-3 compact-grid">
        <article className="summary-card">
          <span className="summary-label">全部账号</span>
          <strong className="metric-compact">{counts.total}</strong>
        </article>
        <article className="summary-card">
          <span className="summary-label">管理员</span>
          <strong className="metric-compact">{counts.admin}</strong>
        </article>
        <article className="summary-card">
          <span className="summary-label">普通用户</span>
          <strong className="metric-compact">{counts.recruiter}</strong>
        </article>
      </section>

      <section className="card">
        <div className="section-headline">
          <div>
            <h3>账号管理</h3>
            <p className="muted">系统始终至少保留一名管理员，当前管理员不能降级自己的账号。</p>
          </div>
          <button className="btn" type="button" onClick={() => setShowCreate((value) => !value)}>
            {showCreate ? "收起创建表单" : "创建用户"}
          </button>
        </div>

        {showCreate ? (
          <form action={createUser} className="admin-user-form">
            <div className="field">
              <label htmlFor="admin-user-name">姓名 *</label>
              <input id="admin-user-name" name="name" className="input" minLength={2} required />
            </div>
            <div className="field">
              <label htmlFor="admin-user-email">邮箱 *</label>
              <input id="admin-user-email" name="email" className="input" type="email" autoComplete="off" required />
            </div>
            <div className="field">
              <label htmlFor="admin-user-password">初始密码 *</label>
              <input id="admin-user-password" name="password" className="input" type="password" minLength={8} autoComplete="new-password" required />
              <span className="field-helper">至少 8 位，同时包含字母和数字。</span>
            </div>
            <div className="field">
              <label htmlFor="admin-user-role">角色 *</label>
              <select id="admin-user-role" name="role" className="select" defaultValue="recruiter">
                <option value="recruiter">普通用户</option>
                <option value="admin">管理员</option>
              </select>
            </div>
            <div className="admin-user-form-action">
              <button className="btn" type="submit" disabled={isPending}>
                {isPending ? "创建中..." : "确认创建"}
              </button>
            </div>
          </form>
        ) : null}

        {message ? <div className="alert info" role="status">{message}</div> : null}
        {error ? <div className="alert danger" role="alert">{error}</div> : null}

        {isLoading ? (
          <div className="empty-state">正在加载用户列表...</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>用户</th>
                  <th>邮箱</th>
                  <th>当前角色</th>
                  <th>创建时间</th>
                  <th>权限调整</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <strong>{user.name}</strong>
                      {user.id === currentUser?.id ? <div className="muted">当前登录账号</div> : null}
                    </td>
                    <td>{user.email}</td>
                    <td>
                      <span className={`pill ${user.role === "admin" ? "slate" : "blue"}`}>
                        {roleLabel(user.role)}
                      </span>
                    </td>
                    <td>{formatDateTime(user.createdAt)}</td>
                    <td>
                      <select
                        className="select admin-role-select"
                        value={user.role}
                        disabled={isPending || user.id === currentUser?.id}
                        aria-label={`调整 ${user.name} 的角色`}
                        onChange={(event) => changeRole(user, event.target.value as AppRole)}
                      >
                        <option value="recruiter">普通用户</option>
                        <option value="admin">管理员</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
