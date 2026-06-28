"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { authFetch } from "@/lib/auth/client-session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import {
  POSITION_PRIORITY_LABELS,
  POSITION_PRIORITY_ORDER,
  POSITION_RECRUITMENT_STATUS_LABELS,
  POSITION_RECRUITMENT_STATUS_ORDER,
  type PositionPriorityValue,
  type PositionRecruitmentStatusValue
} from "@/lib/constants";

type PositionItem = {
  id: string;
  title: string;
  departmentId: string | null;
  department: string | null;
  headcount: number;
  owner: string | null;
  status: string;
  recruitmentStatus: PositionRecruitmentStatusValue;
  priority: PositionPriorityValue;
  positionCreatedAt: string;
  applicationCount: number;
  activeCount: number;
  onboardCount: number;
  completionRate: number;
  fieldCount: number;
};

type EditableKey =
  | "departmentId"
  | "owner"
  | "headcount"
  | "recruitmentStatus"
  | "priority"
  | "positionCreatedAt";

function dateInputValue(value: string) {
  return value.slice(0, 10);
}

export function PositionManagementGrid({
  positions,
  departments
}: {
  positions: PositionItem[];
  departments: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const { can } = useAuth();
  const canManagePositions = can(PERMISSIONS.POSITION_MANAGE);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [enabledFields, setEnabledFields] = useState<EditableKey[]>([]);
  const [formValues, setFormValues] = useState({
    departmentId: "",
    owner: "",
    headcount: "1",
    recruitmentStatus: "NORMAL" as PositionRecruitmentStatusValue,
    priority: "REGULAR" as PositionPriorityValue,
    positionCreatedAt: new Date().toISOString().slice(0, 10)
  });
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedPositions = useMemo(
    () => positions.filter((position) => selectedIds.includes(position.id)),
    [positions, selectedIds]
  );
  const allSelected = positions.length > 0 && selectedIds.length === positions.length;

  function toggle(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
    setMessage(null);
  }

  function toggleAll() {
    setSelectedIds(allSelected ? [] : positions.map((position) => position.id));
    setMessage(null);
  }

  function toggleField(field: EditableKey) {
    setEnabledFields((current) =>
      current.includes(field) ? current.filter((item) => item !== field) : [...current, field]
    );
  }

  function submitBatchEdit() {
    if (!selectedIds.length || !enabledFields.length) {
      setMessage("请先选择岗位和需要修改的字段。");
      return;
    }
    const patch = Object.fromEntries(
      enabledFields.map((field) => [
        field,
        field === "headcount" ? Number(formValues.headcount) : formValues[field]
      ])
    );
    if (enabledFields.includes("departmentId") && !formValues.departmentId) {
      setMessage("请选择要绑定的部门。");
      return;
    }
    setMessage(null);
    startTransition(async () => {
      const response = await authFetch("/api/positions/batch-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds, patch })
      });
      const payload = (await response.json()) as { count?: number; error?: string };
      if (!response.ok) {
        setMessage(payload.error || "批量编辑岗位失败");
        return;
      }
      setMessage(`已更新 ${payload.count ?? selectedIds.length} 个岗位。`);
      setEditing(false);
      setEnabledFields([]);
      setSelectedIds([]);
      router.refresh();
    });
  }

  function deleteSelected() {
    if (!selectedIds.length) return;
    const names = selectedPositions.map((position) => position.title);
    const preview = names.slice(0, 3).join("、");
    const suffix = names.length > 3 ? ` 等 ${names.length} 个岗位` : "";
    const confirmed = window.confirm(
      `确认删除 ${preview}${suffix} 吗？\n\n岗位会从列表中隐藏，但候选人、投递记录和招聘历史会被保留。`
    );
    if (!confirmed) return;

    setMessage(null);
    startTransition(async () => {
      const response = await authFetch("/api/positions/batch-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds })
      });
      const payload = (await response.json()) as { count?: number; error?: string };
      if (!response.ok) {
        setMessage(payload.error || "批量删除岗位失败");
        return;
      }
      setMessage(`已删除 ${payload.count ?? selectedIds.length} 个岗位，历史招聘数据仍然保留。`);
      setEditing(false);
      setSelectedIds([]);
      router.refresh();
    });
  }

  return (
    <div className="grid">
      {canManagePositions ? <div className={`selection-toolbar ${selectedIds.length ? "active" : ""}`}>
        <div className="selection-toolbar-copy">
          <strong>{selectedIds.length ? `已选择 ${selectedIds.length} 个岗位` : "批量管理岗位"}</strong>
          <span>选择岗位后，可统一修改部门、负责人、计划人数、岗位状态或优先级。</span>
        </div>
        <div className="inline-actions">
          <label className="select-all-control">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} />
            <span>全选</span>
          </label>
          <button
            className="btn-secondary"
            type="button"
            disabled={!selectedIds.length || isPending}
            onClick={() => setEditing((current) => !current)}
          >
            批量编辑
          </button>
          <button
            className="btn-danger"
            type="button"
            disabled={!selectedIds.length || isPending}
            onClick={deleteSelected}
          >
            {isPending ? "处理中..." : "批量删除"}
          </button>
        </div>
      </div> : (
        <div className="page-note">
          当前为普通用户权限：可以查看岗位招聘进度并维护候选人流程，岗位结构与字段配置由管理员统一管理。
        </div>
      )}

      {editing && canManagePositions ? (
        <section className="batch-edit-panel" aria-label="批量编辑岗位">
          <div className="section-headline">
            <div>
              <h3>批量编辑 {selectedIds.length} 个岗位</h3>
              <p className="muted">勾选需要覆盖的字段；未勾选的字段保持原值。</p>
            </div>
            <button className="btn-ghost" type="button" onClick={() => setEditing(false)}>收起</button>
          </div>
          <div className="batch-field-grid">
            <div className="batch-field">
              <label className="batch-field-switch">
                <input type="checkbox" checked={enabledFields.includes("departmentId")} onChange={() => toggleField("departmentId")} />
                <span>修改部门</span>
              </label>
              <select
                className="select"
                value={formValues.departmentId}
                disabled={!enabledFields.includes("departmentId")}
                onChange={(event) =>
                  setFormValues((current) => ({ ...current, departmentId: event.target.value }))
                }
              >
                <option value="">请选择部门</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="batch-field">
              <label className="batch-field-switch">
                <input type="checkbox" checked={enabledFields.includes("owner")} onChange={() => toggleField("owner")} />
                <span>修改负责人</span>
              </label>
              <input className="input" value={formValues.owner} disabled={!enabledFields.includes("owner")} onChange={(event) => setFormValues((current) => ({ ...current, owner: event.target.value }))} placeholder="留空表示清除负责人" />
            </div>
            <div className="batch-field">
              <label className="batch-field-switch">
                <input type="checkbox" checked={enabledFields.includes("headcount")} onChange={() => toggleField("headcount")} />
                <span>修改计划人数</span>
              </label>
              <input className="input" type="number" min={1} value={formValues.headcount} disabled={!enabledFields.includes("headcount")} onChange={(event) => setFormValues((current) => ({ ...current, headcount: event.target.value }))} />
            </div>
            <div className="batch-field">
              <label className="batch-field-switch">
                <input
                  type="checkbox"
                  checked={enabledFields.includes("recruitmentStatus")}
                  onChange={() => toggleField("recruitmentStatus")}
                />
                <span>修改岗位状态</span>
              </label>
              <select
                className="select"
                value={formValues.recruitmentStatus}
                disabled={!enabledFields.includes("recruitmentStatus")}
                onChange={(event) =>
                  setFormValues((current) => ({
                    ...current,
                    recruitmentStatus: event.target.value as PositionRecruitmentStatusValue
                  }))
                }
              >
                {POSITION_RECRUITMENT_STATUS_ORDER.map((status) => (
                  <option key={status} value={status}>
                    {POSITION_RECRUITMENT_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </div>
            <div className="batch-field">
              <label className="batch-field-switch">
                <input
                  type="checkbox"
                  checked={enabledFields.includes("priority")}
                  onChange={() => toggleField("priority")}
                />
                <span>修改优先级</span>
              </label>
              <select
                className="select"
                value={formValues.priority}
                disabled={!enabledFields.includes("priority")}
                onChange={(event) =>
                  setFormValues((current) => ({
                    ...current,
                    priority: event.target.value as PositionPriorityValue
                  }))
                }
              >
                {POSITION_PRIORITY_ORDER.map((priority) => (
                  <option key={priority} value={priority}>
                    {POSITION_PRIORITY_LABELS[priority]}
                  </option>
                ))}
              </select>
            </div>
            <div className="batch-field">
              <label className="batch-field-switch">
                <input
                  type="checkbox"
                  checked={enabledFields.includes("positionCreatedAt")}
                  onChange={() => toggleField("positionCreatedAt")}
                />
                <span>修改岗位创建日期</span>
              </label>
              <input
                className="input"
                type="date"
                value={formValues.positionCreatedAt}
                disabled={!enabledFields.includes("positionCreatedAt")}
                onChange={(event) =>
                  setFormValues((current) => ({ ...current, positionCreatedAt: event.target.value }))
                }
              />
            </div>
          </div>
          <div className="inline-actions">
            <button className="btn" type="button" onClick={submitBatchEdit} disabled={isPending || !enabledFields.length}>
              {isPending ? "保存中..." : "应用批量修改"}
            </button>
            <button className="btn-ghost" type="button" onClick={() => setEnabledFields([])} disabled={isPending}>清空修改项</button>
          </div>
        </section>
      ) : null}

      {message ? (
        <div className={message.includes("失败") || message.includes("请先") ? "alert danger" : "alert info"} role="status">
          {message}
        </div>
      ) : null}

      <section className="position-card-grid">
        {positions.length ? positions.map((position) => {
          const selected = selectedIds.includes(position.id);
          return (
            <article className={`position-progress-card selectable-position-card ${selected ? "selected" : ""}`} key={position.id}>
              {canManagePositions ? <label className="position-card-checkbox" aria-label={`选择岗位 ${position.title}`}>
                <input type="checkbox" checked={selected} onChange={() => toggle(position.id)} />
                <span />
              </label> : null}
              <div className="position-card-header">
                <div>
                  <span className={`position-status ${position.recruitmentStatus === "NORMAL" ? "open" : ""}`}>
                    {position.status === "open"
                      ? POSITION_RECRUITMENT_STATUS_LABELS[position.recruitmentStatus]
                      : "已关闭"}
                  </span>
                  <span className="tag tag-neutral">{POSITION_PRIORITY_LABELS[position.priority]}</span>
                  <h3>{position.title}</h3>
                  <p>{position.department || "未设置部门"} · {position.owner || "未设置负责人"}</p>
                  <p className="muted">岗位创建日期：{dateInputValue(position.positionCreatedAt)}</p>
                </div>
                <strong className="completion-number">{position.completionRate}%</strong>
              </div>
              <div className="completion-track" aria-label={`招聘完成度 ${position.completionRate}%`}>
                <span style={{ width: `${position.completionRate}%` }} />
              </div>
              <div className="position-stat-grid">
                <div><span>计划</span><strong>{position.headcount}</strong></div>
                <div><span>候选人</span><strong>{position.applicationCount}</strong></div>
                <div><span>流程中</span><strong>{position.activeCount}</strong></div>
                <div><span>已入职</span><strong>{position.onboardCount}</strong></div>
              </div>
              <div className="position-card-footer">
                <span className="muted">{position.fieldCount || "默认"} 个已配置字段</span>
                <div className="inline-actions">
                  <Link className="btn-secondary btn-compact" href={`/positions/${position.id}`}>打开进度表</Link>
                  {canManagePositions ? (
                    <Link className="btn-ghost btn-compact" href={`/positions/${position.id}/settings`}>字段设置</Link>
                  ) : null}
                </div>
              </div>
            </article>
          );
        }) : (
          <div className="empty-state">还没有岗位。创建第一个岗位后即可配置招聘进度字段。</div>
        )}
      </section>
    </div>
  );
}
