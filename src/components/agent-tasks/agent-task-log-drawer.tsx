"use client";

import { AgentTaskStatus, CandidateStatus, RawInputType } from "@prisma/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { AIReparseControls } from "@/components/ai/ai-reparse-controls";
import { useAuth } from "@/components/auth/auth-provider";
import { StatusBadge } from "@/components/status-badge";
import { TaskStatusBadge } from "@/components/task-status-badge";
import { CopyButton } from "@/components/ui/copy-button";
import { INPUT_TYPE_LABELS } from "@/lib/constants";
import { authFetch } from "@/lib/auth/client-session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { formatDateTime } from "@/lib/utils";

type AgentTaskListItem = {
  id: string;
  agentName: string;
  taskType: string;
  status: AgentTaskStatus;
  confidence: number | null;
  durationMs: number | null;
  candidateId: string | null;
  rawInputId: string | null;
  createdAt: string;
  updatedAt: string;
  candidate: {
    id: string;
    name: string;
    status: CandidateStatus;
    position: {
      title: string;
    } | null;
  } | null;
  rawInput: {
    id: string;
    candidateId: string | null;
    inputType: RawInputType;
    createdAt: string;
  } | null;
};

type AgentTaskDetail = AgentTaskListItem & {
  input: unknown;
  output: unknown;
  error: string | null;
  rawInput: (AgentTaskListItem["rawInput"] & {
    content: string;
    parsedResult: unknown;
  }) | null;
};

function renderStructuredValue(value: unknown) {
  if (value === null || value === undefined) {
    return "暂无";
  }

  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function AgentTaskLogDrawer({ tasks }: { tasks: AgentTaskListItem[] }) {
  const router = useRouter();
  const { can } = useAuth();
  const canDeleteAgentTasks = can(PERMISSIONS.AGENT_TASK_DELETE);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<AgentTaskDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDeleting, startDeleteTransition] = useTransition();
  const [isBatchDeleting, startBatchDeleteTransition] = useTransition();
  const rawInputRef = useRef<HTMLElement | null>(null);

  const allSelected = tasks.length > 0 && selectedIds.length === tasks.length;
  const selectedLabels = useMemo(
    () => tasks.filter((task) => selectedIds.includes(task.id)).map((task) => `${task.agentName} / ${task.taskType}`),
    [selectedIds, tasks]
  );

  useEffect(() => {
    if (!selectedTaskId) {
      setSelectedTask(null);
      setDetailError(null);
      setIsDetailLoading(false);
      return;
    }

    let cancelled = false;
    setDetailError(null);
    setIsDetailLoading(true);

    async function loadDetail() {
      try {
        const response = await authFetch(`/api/agent-tasks/${selectedTaskId}`, {
          cache: "no-store"
        });
        const payload = (await response.json()) as AgentTaskDetail & { error?: string };

        if (!response.ok) {
          throw new Error(payload.error || "加载 Agent 日志详情失败");
        }

        if (!cancelled) {
          setSelectedTask(payload);
        }
      } catch (error) {
        if (!cancelled) {
          setDetailError(error instanceof Error ? error.message : "加载 Agent 日志详情失败");
          setSelectedTask(null);
        }
      } finally {
        if (!cancelled) {
          setIsDetailLoading(false);
        }
      }
    }

    void loadDetail();

    return () => {
      cancelled = true;
    };
  }, [selectedTaskId]);

  useEffect(() => {
    if (!selectedTaskId) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedTaskId(null);
      }
    }

    window.addEventListener("keydown", handleKeydown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeydown);
    };
  }, [selectedTaskId]);

  function toggleTask(taskId: string) {
    setSelectedIds((current) => (current.includes(taskId) ? current.filter((id) => id !== taskId) : [...current, taskId]));
  }

  function toggleAll() {
    setSelectedIds(allSelected ? [] : tasks.map((task) => task.id));
  }

  function handleDelete() {
    if (!selectedTask) {
      return;
    }

    const confirmed = window.confirm(`确认删除 Agent 日志 ${selectedTask.id} 吗？`);
    if (!confirmed) {
      return;
    }

    startDeleteTransition(async () => {
      const response = await authFetch(`/api/agent-tasks/${selectedTask.id}`, {
        method: "DELETE"
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setDetailError(payload.error || "删除 Agent 日志失败");
        return;
      }

      setSelectedTaskId(null);
      setSelectedIds((current) => current.filter((id) => id !== selectedTask.id));
      router.refresh();
    });
  }

  function handleBatchDelete() {
    if (!selectedIds.length) {
      return;
    }

    const preview = selectedLabels.slice(0, 3).join("、");
    const suffix = selectedLabels.length > 3 ? ` 等 ${selectedLabels.length} 条日志` : "";
    const confirmed = window.confirm(`确认批量删除 ${preview}${suffix} 吗？`);
    if (!confirmed) {
      return;
    }

    setDetailError(null);
    startBatchDeleteTransition(async () => {
      const response = await authFetch("/api/agent-tasks/batch-delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ ids: selectedIds })
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setDetailError(payload.error || "批量删除 Agent 日志失败");
        return;
      }

      if (selectedTaskId && selectedIds.includes(selectedTaskId)) {
        setSelectedTaskId(null);
      }
      setSelectedIds([]);
      router.refresh();
    });
  }

  return (
    <>
      <div className="page-note">列表页先展示任务摘要，点开后再按需加载输入、输出、原始输入和错误详情。</div>

      {canDeleteAgentTasks ? <div className={`selection-toolbar ${selectedIds.length ? "active" : ""}`}>
        <div className="selection-toolbar-copy">
          <strong>{selectedIds.length ? `已选 ${selectedIds.length} 条 Agent 日志` : "支持批量删除 Agent 日志"}</strong>
          <span>{selectedIds.length ? "建议先筛查异常日志，再执行批量清理。" : "勾选后会出现批量操作条。"}</span>
        </div>
        <div className="inline-actions">
          <button
            className="btn-ghost"
            type="button"
            onClick={() => setSelectedIds([])}
            disabled={!selectedIds.length || isBatchDeleting}
          >
            清空选择
          </button>
          <button
            className="btn-danger"
            type="button"
            onClick={handleBatchDelete}
            disabled={!selectedIds.length || isBatchDeleting}
          >
            {isBatchDeleting ? "删除中..." : "批量删除"}
          </button>
        </div>
      </div> : (
        <div className="page-note">普通用户可以查看和重新运行 Agent 任务，日志清理由管理员负责。</div>
      )}

      {detailError ? <div className="alert danger">{detailError}</div> : null}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th className="selection-cell">
                <label className="table-checkbox" aria-label="全选当前 Agent 日志">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                  <span />
                </label>
              </th>
              <th>Agent</th>
              <th>任务类型</th>
              <th>候选人</th>
              <th>状态</th>
              <th>置信度</th>
              <th>耗时</th>
              <th>创建时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {tasks.length ? (
              tasks.map((task) => {
                const isSelected = selectedIds.includes(task.id);

                return (
                  <tr key={task.id} className={`clickable-row ${isSelected ? "table-row-selected" : ""}`} onClick={() => setSelectedTaskId(task.id)}>
                    <td className="selection-cell" onClick={(event) => event.stopPropagation()}>
                      <label className="table-checkbox" aria-label={`选择日志 ${task.id}`}>
                        <input type="checkbox" checked={isSelected} onChange={() => toggleTask(task.id)} />
                        <span />
                      </label>
                    </td>
                    <td>{task.agentName}</td>
                    <td>{task.taskType}</td>
                    <td>
                      {task.candidate ? (
                        <Link
                          href={`/candidates/${task.candidate.id}`}
                          className="btn-ghost"
                          onClick={(event) => event.stopPropagation()}
                        >
                          {task.candidate.name}
                        </Link>
                      ) : (
                        "未关联"
                      )}
                    </td>
                    <td>
                      <TaskStatusBadge status={task.status} />
                    </td>
                    <td>{task.confidence !== null ? `${Math.round(task.confidence * 100)}%` : "暂无"}</td>
                    <td>{task.durationMs !== null ? `${task.durationMs}ms` : "未记录"}</td>
                    <td>{formatDateTime(task.createdAt)}</td>
                    <td>
                      <button
                        className="btn-secondary"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedTaskId(task.id);
                        }}
                      >
                        查看详情
                      </button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={9}>
                  <div className="empty-state">暂无 Agent 任务记录。</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedTaskId ? (
        <div className="drawer-overlay" onClick={() => setSelectedTaskId(null)}>
          <aside className="drawer-panel" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <h3>{selectedTask?.agentName ?? "Agent 日志详情"}</h3>
                <p>
                  {selectedTask ? `${selectedTask.taskType} | 创建于 ${formatDateTime(selectedTask.createdAt)}` : selectedTaskId}
                </p>
              </div>
              <button className="drawer-close" onClick={() => setSelectedTaskId(null)} aria-label="关闭详情抽屉">
                ×
              </button>
            </div>

            <div className="drawer-actions">
              {selectedTask?.candidate ? (
                <Link href={`/candidates/${selectedTask.candidate.id}#agent-tasks`} className="btn-secondary">
                  跳到候选人
                </Link>
              ) : (
                <button className="btn-secondary" disabled>
                  未关联候选人
                </button>
              )}

              {selectedTask?.rawInput ? (
                selectedTask.candidate ? (
                  <Link href={`/candidates/${selectedTask.candidate.id}#raw-inputs`} className="btn-secondary">
                    跳到原始输入
                  </Link>
                ) : (
                  <button
                    className="btn-secondary"
                    onClick={() => rawInputRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                  >
                    跳到原始输入
                  </button>
                )
              ) : (
                <button className="btn-secondary" disabled>
                  无原始输入
                </button>
              )}

              {canDeleteAgentTasks ? (
                <button className="btn-danger" onClick={handleDelete} disabled={!selectedTask || isDeleting}>
                  {isDeleting ? "删除中..." : "删除条目"}
                </button>
              ) : null}
            </div>

            <div className="drawer-body">
              {isDetailLoading ? <div className="empty-state">正在加载详情...</div> : null}

              {selectedTask ? (
                <>
                  <section className="drawer-section">
                    <h4>任务概览</h4>
                    <div className="drawer-summary-grid">
                      <div className="drawer-summary-card">
                        <span>任务状态</span>
                        <TaskStatusBadge status={selectedTask.status} />
                      </div>
                      <div className="drawer-summary-card">
                        <span>置信度</span>
                        <strong>
                          {selectedTask.confidence !== null ? `${Math.round(selectedTask.confidence * 100)}%` : "暂无"}
                        </strong>
                      </div>
                      <div className="drawer-summary-card">
                        <span>耗时</span>
                        <strong>{selectedTask.durationMs !== null ? `${selectedTask.durationMs}ms` : "未记录"}</strong>
                      </div>
                      <div className="drawer-summary-card">
                        <span>更新时间</span>
                        <strong>{formatDateTime(selectedTask.updatedAt)}</strong>
                      </div>
                    </div>
                  </section>

                  <section className="drawer-section">
                    <h4>关联候选人</h4>
                    {selectedTask.candidate ? (
                      <div className="subtle-item">
                        <div className="inline-actions" style={{ justifyContent: "space-between" }}>
                          <strong>{selectedTask.candidate.name}</strong>
                          <StatusBadge status={selectedTask.candidate.status} />
                        </div>
                        <p className="muted" style={{ margin: "8px 0 0" }}>
                          {selectedTask.candidate.position?.title || "未分配岗位"}
                        </p>
                      </div>
                    ) : (
                      <div className="empty-state">当前任务未关联候选人。</div>
                    )}
                  </section>

                  <section className="drawer-section">
                    <div className="section-headline">
                      <h4>任务 Input</h4>
                      <CopyButton value={renderStructuredValue(selectedTask.input)} />
                    </div>
                    <pre className="code-block">{renderStructuredValue(selectedTask.input)}</pre>
                  </section>

                  <section className="drawer-section">
                    <div className="section-headline">
                      <h4>任务 Output</h4>
                      <CopyButton value={renderStructuredValue(selectedTask.output)} />
                    </div>
                    <pre className="code-block">{renderStructuredValue(selectedTask.output)}</pre>
                  </section>

                  <section className="drawer-section" ref={rawInputRef}>
                    <h4>原始输入</h4>
                    {selectedTask.rawInput ? (
                      <>
                        <div className="stats-inline" style={{ marginBottom: 12 }}>
                          <span>ID: {selectedTask.rawInput.id}</span>
                          <span>类型: {INPUT_TYPE_LABELS[selectedTask.rawInput.inputType]}</span>
                          <span>创建于 {formatDateTime(selectedTask.rawInput.createdAt)}</span>
                        </div>
                        <div className="section-headline" style={{ marginBottom: 8 }}>
                          <span className="muted">原文内容</span>
                          <CopyButton value={selectedTask.rawInput.content} />
                        </div>
                        <pre className="code-block raw-input-block">{selectedTask.rawInput.content}</pre>
                        <div className="section-headline" style={{ marginTop: 16 }}>
                          <h4 style={{ margin: 0 }}>解析结果</h4>
                          <CopyButton value={renderStructuredValue(selectedTask.rawInput.parsedResult)} />
                        </div>
                        <pre className="code-block">{renderStructuredValue(selectedTask.rawInput.parsedResult)}</pre>
                      </>
                    ) : (
                      <div className="empty-state">当前任务没有关联原始输入。</div>
                    )}
                  </section>

                  <section className="drawer-section">
                    <h4>错误信息</h4>
                    {selectedTask.error ? (
                      <div className="alert danger">{selectedTask.error}</div>
                    ) : (
                      <div className="alert info">当前任务没有错误信息。</div>
                    )}
                  </section>

                  {selectedTask.rawInput ? (
                    <section className="drawer-section">
                      <h4>重新解析 / 重新运行 AI</h4>
                      <AIReparseControls
                        content={selectedTask.rawInput.content}
                        inputTypeHint={selectedTask.rawInput.inputType}
                      />
                    </section>
                  ) : null}
                </>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
