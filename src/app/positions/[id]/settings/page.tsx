import Link from "next/link";
import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";

import { PositionFieldEditor } from "@/components/positions/position-field-editor";
import { AdminOnly } from "@/components/auth/admin-only";
import { getPositionProgress } from "@/lib/services/positions";

export default async function PositionSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  noStore();
  const { id } = await params;
  const position = await getPositionProgress(id);
  if (!position) notFound();

  return (
    <div className="grid">
      <div className="breadcrumb">
        <Link href="/positions">岗位招聘进度</Link>
        <span>/</span>
        <Link href={`/positions/${position.id}`}>{position.title}</Link>
        <span>/</span>
        <strong>字段设置</strong>
      </div>
      <header className="page-header">
        <div>
          <h2>{position.title} · 字段设置</h2>
          <p>设置招聘进度表的栏目、类型、预设值、自动填充来源和 AI 简历提取规则。</p>
        </div>
        <Link className="btn-secondary" href={`/positions/${position.id}`}>返回进度表</Link>
      </header>
      <section className="card">
        <AdminOnly>
          <PositionFieldEditor
          positionId={position.id}
          initialFields={position.fieldDefinitions.map((field) => ({
            id: field.id,
            key: field.key,
            label: field.label,
            fieldType: field.fieldType,
            scope: field.scope,
            required: field.required,
            visible: field.visible,
            editable: field.editable,
            aiExtractable: field.aiExtractable,
            system: field.system,
            options: field.options,
            defaultValue: field.defaultValue,
            autoFillRule: field.autoFillRule,
            conflictPolicy: field.conflictPolicy,
            width: field.width,
            active: field.active
          }))}
          />
        </AdminOnly>
      </section>
    </div>
  );
}
