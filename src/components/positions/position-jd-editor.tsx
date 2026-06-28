"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/components/auth/auth-provider";
import { authFetch } from "@/lib/auth/client-session";
import { PERMISSIONS } from "@/lib/auth/permissions";

const MAX_JD_LENGTH = 20000;

export function PositionJDEditor({
  positionId,
  positionTitle,
  initialDescription
}: {
  positionId: string;
  positionTitle: string;
  initialDescription: string | null;
}) {
  const router = useRouter();
  const { can } = useAuth();
  const canManage = can(PERMISSIONS.POSITION_MANAGE);
  const normalizedInitial = initialDescription?.trim() ?? "";
  const [description, setDescription] = useState(normalizedInitial);
  const [savedDescription, setSavedDescription] = useState(normalizedInitial);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const next = initialDescription?.trim() ?? "";
    setDescription(next);
    setSavedDescription(next);
  }, [initialDescription]);

  const hasChanges = description !== savedDescription;

  function cancelEditing() {
    setDescription(savedDescription);
    setEditing(false);
    setMessage(null);
  }

  function save() {
    setMessage(null);
    startTransition(async () => {
      try {
        const response = await authFetch(`/api/positions/${positionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description })
        });
        const payload = (await response.json()) as {
          description?: string | null;
          error?: string;
        };

        if (!response.ok) {
          setMessage(payload.error || "岗位 JD 保存失败");
          return;
        }

        const next = payload.description?.trim() ?? "";
        setDescription(next);
        setSavedDescription(next);
        setEditing(false);
        setMessage(
          next
            ? "岗位 JD 已保存，后续 AI 简历解析会自动使用最新内容。"
            : "岗位 JD 已清空，后续 AI 解析将仅依据候选人材料生成建议。"
        );
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "岗位 JD 保存失败");
      }
    });
  }

  return (
    <section className="card position-jd-card" aria-labelledby="position-jd-title">
      <div className="section-headline position-jd-heading">
        <div>
          <div className="inline-actions position-jd-title-row">
            <h3 id="position-jd-title">岗位 JD</h3>
            <span className={`pill ${savedDescription ? "emerald" : "slate"}`}>
              {savedDescription ? "已设置" : "未设置"}
            </span>
          </div>
          <p className="muted">
            AI 解析“{positionTitle}”岗位简历时，会参考这里的职责和任职要求生成 Agent 备注与 AI 跟进建议。
          </p>
        </div>
        {canManage && !editing ? (
          <button className="btn-secondary" type="button" onClick={() => setEditing(true)}>
            编辑岗位 JD
          </button>
        ) : null}
      </div>

      {editing && canManage ? (
        <div className="position-jd-editor">
          <label htmlFor={`position-jd-${positionId}`}>岗位 JD 内容</label>
          <textarea
            id={`position-jd-${positionId}`}
            className="textarea position-jd-textarea"
            value={description}
            maxLength={MAX_JD_LENGTH}
            autoFocus
            placeholder="填写岗位职责、任职要求、核心技能、学历与经验要求；留空保存表示清除岗位 JD。"
            onChange={(event) => {
              setDescription(event.target.value);
              setMessage(null);
            }}
          />
          <div className="position-jd-editor-footer">
            <span className="field-helper">
              JD 仅用于岗位匹配分析，不会被写入候选人的学历、技能或工作经历。
            </span>
            <span className="muted">{description.length} / {MAX_JD_LENGTH}</span>
          </div>
          <div className="inline-actions">
            <button
              className="btn"
              type="button"
              disabled={isPending || !hasChanges}
              onClick={save}
            >
              {isPending ? "保存中..." : "保存岗位 JD"}
            </button>
            <button
              className="btn-ghost"
              type="button"
              disabled={isPending}
              onClick={cancelEditing}
            >
              取消
            </button>
            {description ? (
              <button
                className="btn-ghost"
                type="button"
                disabled={isPending}
                onClick={() => setDescription("")}
              >
                清空内容
              </button>
            ) : null}
          </div>
        </div>
      ) : savedDescription ? (
        <div className="position-jd-content">{savedDescription}</div>
      ) : (
        <div className="position-jd-empty">
          当前岗位尚未设置 JD。AI 仍可正常解析简历，但备注和建议只会依据候选人材料生成。
        </div>
      )}

      {message ? (
        <div
          className={`alert ${message.includes("失败") || message.includes("权限") ? "danger" : "info"}`}
          role="status"
        >
          {message}
        </div>
      ) : null}
    </section>
  );
}
