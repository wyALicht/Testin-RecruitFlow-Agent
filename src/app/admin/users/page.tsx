import { AdminOnly } from "@/components/auth/admin-only";
import { UserManagement } from "@/components/auth/user-management";

export default function AdminUsersPage() {
  return (
    <AdminOnly>
      <div className="grid">
        <header className="page-header">
          <div>
            <h2>用户与权限</h2>
            <p>管理员可以创建内部账号并调整角色；普通用户专注于招聘录入、候选人维护和流程推进。</p>
          </div>
        </header>
        <UserManagement />
      </div>
    </AdminOnly>
  );
}
