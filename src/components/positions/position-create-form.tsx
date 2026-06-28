"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { authFetch } from "@/lib/auth/client-session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import {
  POSITION_PRIORITY_LABELS,
  POSITION_PRIORITY_ORDER,
  POSITION_RECRUITMENT_STATUS_LABELS,
  POSITION_RECRUITMENT_STATUS_ORDER
} from "@/lib/constants";

export function PositionCreateForm({
  departments
}: {
  departments: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const { can, isLoading: isAuthLoading } = useAuth();
  const [open, setOpen] = useState(false);
  const [departmentId, setDepartmentId] = useState("");
  const [newDepartmentName, setNewDepartmentName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const response = await authFetch("/api/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formData.get("title"),
          departmentId: formData.get("departmentId"),
          department: formData.get("department"),
          headcount: formData.get("headcount"),
          owner: formData.get("owner"),
          recruitmentStatus: formData.get("recruitmentStatus"),
          priority: formData.get("priority"),
          description: formData.get("description")
        })
      });
      const payload = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !payload.id) {
        setError(payload.error || "岗位创建失败");
        return;
      }
      setOpen(false);
      setDepartmentId("");
      setNewDepartmentName("");
      router.push(`/positions/${payload.id}`);
      router.refresh();
    });
  }

  if (isAuthLoading || !can(PERMISSIONS.POSITION_MANAGE)) {
    return null;
  }

  if (!open) {
    return (
      <button className="btn" type="button" onClick={() => setOpen(true)}>
        新建岗位
      </button>
    );
  }

  return (
    <div className="quick-create-panel">
      <form action={submit} className="form-grid">
        <div className="field">
          <label htmlFor="position-title">岗位名称 *</label>
          <input id="position-title" name="title" className="input" required minLength={2} />
        </div>
        <div className="field">
          <label htmlFor="position-department-id">已有部门</label>
          <select
            id="position-department-id"
            name="departmentId"
            className="select"
            value={departmentId}
            onChange={(event) => {
              setDepartmentId(event.target.value);
              if (event.target.value) setNewDepartmentName("");
            }}
          >
            <option value="">请选择部门</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="position-department">或新建部门</label>
          <input
            id="position-department"
            name="department"
            className="input"
            value={newDepartmentName}
            onChange={(event) => {
              setNewDepartmentName(event.target.value);
              if (event.target.value.trim()) setDepartmentId("");
            }}
            placeholder="未选择已有部门时生效"
          />
          <span className="field-helper">已有部门和新部门二选一，岗位创建后将固定建立部门关联。</span>
        </div>
        <div className="field">
          <label htmlFor="position-headcount">计划招聘人数 *</label>
          <input id="position-headcount" name="headcount" className="input" type="number" min={1} defaultValue={1} required />
        </div>
        <div className="field">
          <label htmlFor="position-owner">负责人</label>
          <input id="position-owner" name="owner" className="input" />
        </div>
        <div className="field">
          <label htmlFor="position-recruitment-status">岗位状态</label>
          <select
            id="position-recruitment-status"
            name="recruitmentStatus"
            className="select"
            defaultValue="NORMAL"
          >
            {POSITION_RECRUITMENT_STATUS_ORDER.map((status) => (
              <option key={status} value={status}>
                {POSITION_RECRUITMENT_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="position-priority">优先级</label>
          <select id="position-priority" name="priority" className="select" defaultValue="REGULAR">
            {POSITION_PRIORITY_ORDER.map((priority) => (
              <option key={priority} value={priority}>
                {POSITION_PRIORITY_LABELS[priority]}
              </option>
            ))}
          </select>
        </div>
        <div className="field full">
          <label htmlFor="position-description">岗位 JD</label>
          <textarea
            id="position-description"
            name="description"
            className="textarea"
            maxLength={20000}
            placeholder="可填写岗位职责、任职要求、技能栈、学历与经验要求；暂不填写时保持为空。"
          />
          <span className="field-helper">
            AI 解析简历时会参考该 JD 生成岗位相关的 Agent 备注和 AI 跟进建议，但不会把 JD 内容当作候选人经历。
          </span>
        </div>
        {error ? <div className="alert danger field full" role="alert">{error}</div> : null}
        <div className="field full inline-actions">
          <button className="btn" type="submit" disabled={isPending}>
            {isPending ? "创建中..." : "创建岗位"}
          </button>
          <button className="btn-ghost" type="button" onClick={() => setOpen(false)} disabled={isPending}>
            取消
          </button>
        </div>
      </form>
    </div>
  );
}
