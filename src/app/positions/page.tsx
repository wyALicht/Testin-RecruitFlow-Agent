import { unstable_noStore as noStore } from "next/cache";

import { PositionCreateForm } from "@/components/positions/position-create-form";
import { PositionManagementGrid } from "@/components/positions/position-management-grid";
import { PermissionGate } from "@/components/auth/admin-only";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { listDepartments } from "@/lib/services/departments";
import { listPositionProgress } from "@/lib/services/positions";

export default async function PositionsPage() {
  noStore();
  const [positions, departments] = await Promise.all([
    listPositionProgress(),
    listDepartments()
  ]);
  const totals = positions.reduce(
    (result, position) => ({
      headcount: result.headcount + position.headcount,
      applications: result.applications + position.applicationCount,
      active: result.active + position.activeCount,
      onboard: result.onboard + position.onboardCount
    }),
    { headcount: 0, applications: 0, active: 0, onboard: 0 }
  );
  const unboundPositionCount = positions.filter((position) => !position.departmentId).length;

  return (
    <div className="grid">
      <header className="page-header">
        <div>
          <h2>岗位招聘进度</h2>
          <p>每个岗位拥有独立的招聘进度表和字段配置。候选人信息、招聘阶段和岗位特有数据在同一视图中维护。</p>
        </div>
        <div className="page-actions">
          <PositionCreateForm
            departments={departments.map((department) => ({
              id: department.id,
              name: department.name
            }))}
          />
        </div>
      </header>

      <section className="grid cols-4 compact-grid">
        <article className="summary-card"><span className="summary-label">正常招聘</span><strong className="metric-compact">{positions.filter((item) => item.status === "open" && item.recruitmentStatus === "NORMAL").length}</strong></article>
        <article className="summary-card"><span className="summary-label">计划招聘</span><strong className="metric-compact">{totals.headcount}</strong></article>
        <article className="summary-card"><span className="summary-label">流程中</span><strong className="metric-compact">{totals.active}</strong></article>
        <article className="summary-card"><span className="summary-label">已入职</span><strong className="metric-compact">{totals.onboard}</strong></article>
      </section>

      {unboundPositionCount ? (
        <PermissionGate permission={PERMISSIONS.POSITION_MANAGE}>
          <div className="alert warning" role="status">
            当前有 {unboundPositionCount} 个岗位尚未绑定部门。请在下方选择岗位并使用“批量编辑 → 修改部门”完成绑定；
            未绑定部门的岗位不会出现在批量简历录入的岗位选项中。
          </div>
        </PermissionGate>
      ) : null}

      <PositionManagementGrid
        departments={departments.map((department) => ({
          id: department.id,
          name: department.name
        }))}
        positions={positions.map((position) => ({
          id: position.id,
          title: position.title,
          departmentId: position.departmentId,
          department: position.department,
          headcount: position.headcount,
          owner: position.owner,
          status: position.status,
          recruitmentStatus: position.recruitmentStatus,
          priority: position.priority,
          positionCreatedAt: position.positionCreatedAt.toISOString(),
          applicationCount: position.applicationCount,
          activeCount: position.activeCount,
          onboardCount: position.onboardCount,
          completionRate: position.completionRate,
          fieldCount: position.fieldCount
        }))}
      />
    </div>
  );
}
