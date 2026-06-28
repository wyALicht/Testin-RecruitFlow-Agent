"use client";

import { CandidateStatus, NotificationType } from "@prisma/client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { NOTIFICATION_LABELS, STATUS_LABELS, STATUS_ORDER } from "@/lib/constants";
import { authFetch } from "@/lib/auth/client-session";
import { formatDateTime } from "@/lib/utils";

type CandidateDetail = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  school: string | null;
  education: string | null;
  major: string | null;
  yearsOfExperience: number | null;
  skills: string[];
  status: CandidateStatus;
  source: string | null;
  remark: string | null;
  confidence: number | null;
  uncertainFields: string[];
  positionTitle: string | null;
  tags: string[];
  followUpSuggestion: string | null;
  notifications: Array<{
    id: string;
    title: string;
    note: string | null;
    dueAt: string | null;
    done: boolean;
    type: NotificationType;
  }>;
};

function splitTextList(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[、，,\n]/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

export function CandidateDetailPanel({ candidate }: { candidate: CandidateDetail }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formState, setFormState] = useState({
    name: candidate.name,
    phone: candidate.phone ?? "",
    email: candidate.email ?? "",
    school: candidate.school ?? "",
    education: candidate.education ?? "",
    major: candidate.major ?? "",
    yearsOfExperience: candidate.yearsOfExperience?.toString() ?? "",
    skills: candidate.skills.join("、"),
    status: candidate.status,
    source: candidate.source ?? "",
    remark: candidate.remark ?? "",
    positionTitle: candidate.positionTitle ?? "",
    tags: candidate.tags.join("、"),
    followUpSuggestion: candidate.followUpSuggestion ?? ""
  });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const followUpCount = useMemo(
    () => candidate.notifications.filter((item) => !item.done).length,
    [candidate.notifications]
  );

  async function saveChanges() {
    setError(null);
    setMessage(null);

    startTransition(async () => {
      const response = await authFetch(`/api/candidates/${candidate.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ...formState,
          yearsOfExperience: formState.yearsOfExperience ? Number(formState.yearsOfExperience) : null,
          tags: splitTextList(formState.tags)
        })
      });

      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error || "保存失败");
        return;
      }

      setMessage("候选人信息已更新。");
      router.refresh();
    });
  }

  async function toggleNotification(id: string, done: boolean) {
    await authFetch(`/api/notifications/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ done })
    });

    router.refresh();
  }

  return (
    <div className="grid cols-2">
      <section className="card">
        <div className="page-header" style={{ marginBottom: 18 }}>
          <div>
            <h3>候选人编辑</h3>
            <p>可以在这里修正 Agent 抽取结果、补充标签和 AI 跟进建议。当前仍有 {followUpCount} 条待办提醒。</p>
          </div>
          <button className="btn" onClick={saveChanges} disabled={isPending}>
            {isPending ? "保存中..." : "保存修改"}
          </button>
        </div>

        {message ? <div className="alert info" style={{ marginBottom: 14 }}>{message}</div> : null}
        {error ? <div className="alert danger" style={{ marginBottom: 14 }}>{error}</div> : null}

        <div className="form-grid">
          <div className="field">
            <label>姓名</label>
            <input
              className="input"
              value={formState.name}
              onChange={(event) => setFormState((state) => ({ ...state, name: event.target.value }))}
            />
          </div>
          <div className="field">
            <label>岗位</label>
            <input
              className="input"
              value={formState.positionTitle}
              onChange={(event) => setFormState((state) => ({ ...state, positionTitle: event.target.value }))}
            />
          </div>
          <div className="field">
            <label>手机号</label>
            <input
              className="input"
              value={formState.phone}
              onChange={(event) => setFormState((state) => ({ ...state, phone: event.target.value }))}
            />
          </div>
          <div className="field">
            <label>邮箱</label>
            <input
              className="input"
              value={formState.email}
              onChange={(event) => setFormState((state) => ({ ...state, email: event.target.value }))}
            />
          </div>
          <div className="field">
            <label>学校</label>
            <input
              className="input"
              value={formState.school}
              onChange={(event) => setFormState((state) => ({ ...state, school: event.target.value }))}
            />
          </div>
          <div className="field">
            <label>最高学历</label>
            <input
              className="input"
              value={formState.education}
              onChange={(event) =>
                setFormState((state) => ({ ...state, education: event.target.value }))
              }
            />
          </div>
          <div className="field">
            <label>专业</label>
            <input
              className="input"
              value={formState.major}
              onChange={(event) => setFormState((state) => ({ ...state, major: event.target.value }))}
            />
          </div>
          <div className="field">
            <label>工作年限</label>
            <input
              className="input"
              value={formState.yearsOfExperience}
              onChange={(event) => setFormState((state) => ({ ...state, yearsOfExperience: event.target.value }))}
            />
          </div>
          <div className="field">
            <label>状态</label>
            <select
              className="select"
              value={formState.status}
              onChange={(event) =>
                setFormState((state) => ({ ...state, status: event.target.value as CandidateStatus }))
              }
            >
              {STATUS_ORDER.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </div>
          <div className="field full">
            <label>技能标签</label>
            <input
              className="input"
              value={formState.skills}
              onChange={(event) => setFormState((state) => ({ ...state, skills: event.target.value }))}
            />
          </div>
          <div className="field full">
            <label>候选人标签</label>
            <input
              className="input"
              value={formState.tags}
              onChange={(event) => setFormState((state) => ({ ...state, tags: event.target.value }))}
              placeholder="例如：前端、社招、高潜"
            />
          </div>
          <div className="field">
            <label>来源</label>
            <input
              className="input"
              value={formState.source}
              onChange={(event) => setFormState((state) => ({ ...state, source: event.target.value }))}
            />
          </div>
          <div className="field full">
            <label>AI 跟进建议</label>
            <textarea
              className="textarea"
              value={formState.followUpSuggestion}
              onChange={(event) => setFormState((state) => ({ ...state, followUpSuggestion: event.target.value }))}
            />
          </div>
          <div className="field full">
            <label>备注</label>
            <textarea
              className="textarea"
              value={formState.remark}
              onChange={(event) => setFormState((state) => ({ ...state, remark: event.target.value }))}
            />
          </div>
        </div>
      </section>

      <section className="grid">
        <div className="card">
          <h3>Agent 判断</h3>
          <div className="stats-inline" style={{ marginBottom: 12 }}>
            <span>置信度 {candidate.confidence ? `${Math.round(candidate.confidence * 100)}%` : "暂无"}</span>
            <span>当前状态 {STATUS_LABELS[candidate.status]}</span>
          </div>
          {candidate.tags.length ? (
            <div className="filter-summary" style={{ marginBottom: 12 }}>
              {candidate.tags.map((tag) => (
                <span key={tag} className="tag tag-neutral">
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
          {candidate.followUpSuggestion ? (
            <div className="alert info" style={{ marginBottom: 12 }}>
              <strong>AI 跟进建议：</strong>{candidate.followUpSuggestion}
            </div>
          ) : null}
          {candidate.uncertainFields.length ? (
            <div className="alert warning">待人工确认：{candidate.uncertainFields.join("、")}</div>
          ) : (
            <div className="alert info">当前字段已完成补充，没有明显待确认项。</div>
          )}
        </div>

        <div className="card">
          <h3>提醒事项</h3>
          <div className="subtle-list">
            {candidate.notifications.length ? (
              candidate.notifications.map((notification) => (
                <div key={notification.id} className="subtle-item">
                  <div className="inline-actions" style={{ justifyContent: "space-between" }}>
                    <strong>{notification.title}</strong>
                    <button
                      className={notification.done ? "btn-secondary" : "btn"}
                      onClick={() => toggleNotification(notification.id, !notification.done)}
                    >
                      {notification.done ? "重新打开" : "标记完成"}
                    </button>
                  </div>
                  <p className="muted" style={{ margin: "8px 0" }}>
                    {NOTIFICATION_LABELS[notification.type]} | 截止 {formatDateTime(notification.dueAt)}
                  </p>
                  <p style={{ margin: 0 }}>{notification.note || "暂无备注"}</p>
                </div>
              ))
            ) : (
              <div className="empty-state">当前暂无提醒事项。</div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
