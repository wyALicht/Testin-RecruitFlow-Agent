import { CandidateStatus } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";

import { PositionProgressTable } from "@/components/positions/position-progress-table";
import { PositionJDEditor } from "@/components/positions/position-jd-editor";
import { PermissionGate } from "@/components/auth/admin-only";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getPositionProgress } from "@/lib/services/positions";

export default async function PositionProgressPage({ params }: { params: Promise<{ id: string }> }) {
  noStore();
  const { id } = await params;
  const position = await getPositionProgress(id);
  if (!position) notFound();

  const applications = position.applications;
  const visibleFields = position.fieldDefinitions.filter((field) => field.visible);
  const active = applications.filter((item) => item.status !== CandidateStatus.ONBOARD).length;
  const offer = applications.filter((item) => item.status === CandidateStatus.OFFER).length;
  const onboard = applications.filter((item) => item.status === CandidateStatus.ONBOARD).length;

  return (
    <div className="grid">
      <div className="breadcrumb"><Link href="/positions">岗位招聘进度</Link><span>/</span><strong>{position.title}</strong></div>
      <header className="page-header">
        <div>
          <h2>{position.title}</h2>
          <p>{position.department || "未设置部门"} · 计划招聘 {position.headcount} 人 · 负责人 {position.owner || "未设置"}</p>
          <p className="muted">
            岗位 JD：{position.description?.trim() ? "已设置，AI 解析时将用于岗位匹配分析" : "未设置，AI 将仅依据候选人材料生成建议"}
          </p>
        </div>
        <div className="page-actions">
          <PermissionGate permission={PERMISSIONS.POSITION_FIELD_MANAGE}>
            <Link className="btn-secondary" href={`/positions/${position.id}/settings`}>设置表格字段</Link>
          </PermissionGate>
          <Link className="btn" href={`/intake?positionId=${position.id}`}>AI 录入候选人</Link>
        </div>
      </header>

      <section className="grid cols-4 compact-grid">
        <article className="summary-card"><span className="summary-label">全部投递</span><strong className="metric-compact">{applications.length}</strong></article>
        <article className="summary-card"><span className="summary-label">流程中</span><strong className="metric-compact">{active}</strong></article>
        <article className="summary-card"><span className="summary-label">Offer</span><strong className="metric-compact">{offer}</strong></article>
        <article className="summary-card"><span className="summary-label">已入职 / 计划</span><strong className="metric-compact">{onboard} / {position.headcount}</strong></article>
      </section>

      <PositionJDEditor
        positionId={position.id}
        positionTitle={position.title}
        initialDescription={position.description}
      />

      <section className="card progress-card">
        <div className="section-headline">
          <div>
            <h3>招聘进度表</h3>
            <p className="muted">可直接修改字段并按行保存。横向滚动用于浏览岗位自定义列。</p>
          </div>
          <span className="pill slate">{visibleFields.length} 个显示字段</span>
        </div>
        <PositionProgressTable
          positionId={position.id}
          positionTitle={position.title}
          fields={visibleFields.map((field) => ({
            id: field.id,
            key: field.key,
            label: field.label,
            fieldType: field.fieldType,
            scope: field.scope,
            required: field.required,
            editable: field.editable,
            options: field.options,
            width: field.width
          }))}
          applications={applications.map((application) => ({
            id: application.id,
            status: application.status,
            ownerName: application.ownerName,
            source: application.source,
            appliedAt: application.appliedAt.toISOString(),
            updatedAt: application.updatedAt.toISOString(),
            customValues: application.customValues,
            candidate: {
              id: application.candidate.id,
              name: application.candidate.name,
              phone: application.candidate.phone,
              email: application.candidate.email,
              school: application.candidate.school,
              education: application.candidate.education,
              major: application.candidate.major,
              yearsOfExperience: application.candidate.yearsOfExperience,
              source: application.candidate.source,
              remark: application.candidate.remark
            }
          }))}
        />
      </section>
    </div>
  );
}
