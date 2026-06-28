import { IntakeModeSwitcher } from "@/components/intake/intake-mode-switcher";
import { listPositions } from "@/lib/services/candidates";
import { listDepartments } from "@/lib/services/departments";

export default async function IntakePage({
  searchParams
}: {
  searchParams?: Promise<{ positionId?: string }>;
}) {
  const [positions, departments, params] = await Promise.all([
    listPositions(),
    listDepartments(),
    searchParams
  ]);
  const intakePositions = positions
    .map((position) => ({
      id: position.id,
      title: position.title,
      departmentId: position.departmentId ?? position.departmentRef?.id ?? null,
      departmentName: position.departmentRef?.name ?? position.department ?? "未设置部门"
    }))
    .filter(
      (position): position is typeof position & { departmentId: string } =>
        Boolean(position.departmentId)
    );
  const presetDepartmentIds = new Set(
    intakePositions.map((position) => position.departmentId)
  );
  return (
    <div className="grid">
      <header className="page-header">
        <div>
          <h2>AI 智能录入</h2>
          <p>支持单份精细录入和多份简历批量上传。系统会自动抽取候选人字段，并按预先绑定的部门与岗位写入招聘进度。</p>
        </div>
      </header>

      <IntakeModeSwitcher
        departments={departments
          .filter((department) => presetDepartmentIds.has(department.id))
          .map((department) => ({
            id: department.id,
            name: department.name
          }))}
        positions={intakePositions}
        initialPositionId={params?.positionId ?? ""}
      />
    </div>
  );
}
