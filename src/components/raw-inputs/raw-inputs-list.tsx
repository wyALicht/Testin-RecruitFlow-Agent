"use client";

import { AgentTaskStatus, CandidateStatus, RawInputType } from "@prisma/client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { AIReparseControls } from "@/components/ai/ai-reparse-controls";
import { useAuth } from "@/components/auth/auth-provider";
import { StatusBadge } from "@/components/status-badge";
import { TaskStatusBadge } from "@/components/task-status-badge";
import { CopyButton } from "@/components/ui/copy-button";
import { INPUT_TYPE_LABELS } from "@/lib/constants";
import { authFetch } from "@/lib/auth/client-session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { formatDateTime } from "@/lib/utils";

type RawInputListItem = {
  id: string;
  candidateId: string | null;
  inputType: RawInputType;
  content: string;
  createdAt: string;
  candidate: {
    id: string;
    name: string;
    status: CandidateStatus;
    position: {
      title: string;
    } | null;
  } | null;
  agentTaskCount: number;
  encodingIssue: boolean;
};

type RawInputDetail = {
  id: string;
  candidateId: string | null;
  inputType: RawInputType;
  content: string;
  parsedResult: unknown;
  createdAt: string;
  candidate: {
    id: string;
    name: string;
    status: CandidateStatus;
    position: {
      title: string;
    } | null;
  } | null;
  agentTasks: Array<{
    id: string;
    agentName: string;
    taskType: string;
    status: AgentTaskStatus;
    confidence: number | null;
    createdAt: string;
  }>;
  encodingIssue: boolean;
};

type CandidateOption = {
  id: string;
  name: string;
  position: {
    title: string;
  } | null;
};

type BatchEditableKey = "inputType" | "candidateId";

function summarizeText(content: string) {
  return content.length > 96 ? `${content.slice(0, 96)}...` : content;
}

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

export function RawInputsList({
  items,
  candidateOptions
}: {
  items: RawInputListItem[];
  candidateOptions: CandidateOption[];
}) {
  const router = useRouter();
  const { can } = useAuth();
  const canDeleteRawInputs = can(PERMISSIONS.RAW_INPUT_DELETE);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBatchEditing, setIsBatchEditing] = useState(false);
  const [enabledBatchFields, setEnabledBatchFields] = useState<BatchEditableKey[]>([]);
  const [batchValues, setBatchValues] = useState<{
    inputType: RawInputType;
    candidateId: string;
  }>({
    inputType: RawInputType.OTHER,
    candidateId: ""
  });
  const [batchMessage, setBatchMessage] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<RawInputDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isDeleting, startDeleteTransition] = useTransition();
  const [isBatchPending, startBatchTransition] = useTransition();
  const parsedResultRef = useRef<HTMLElement | null>(null);

  const allSelected = items.length > 0 && selectedIds.length === items.length;
  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.includes(item.id)),
    [items, selectedIds]
  );

  function toggleSelection(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
    setBatchMessage(null);
  }

  function toggleAll() {
    setSelectedIds(allSelected ? [] : items.map((item) => item.id));
    setBatchMessage(null);
  }

  function toggleBatchField(field: BatchEditableKey) {
    setEnabledBatchFields((current) =>
      current.includes(field) ? current.filter((item) => item !== field) : [...current, field]
    );
  }

  function submitBatchEdit() {
    if (!selectedIds.length || !enabledBatchFields.length) {
      setBatchMessage("请先选择原始输入和需要修改的字段。");
      return;
    }

    const patch = Object.fromEntries(
      enabledBatchFields.map((field) => [
        field,
        field === "candidateId" ? batchValues.candidateId || null : batchValues.inputType
      ])
    );

    setBatchMessage(null);
    startBatchTransition(async () => {
      try {
        const response = await authFetch("/api/raw-inputs/batch-update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: selectedIds, patch })
        });
        const payload = (await response.json()) as { count?: number; error?: string };
        if (!response.ok) {
          setBatchMessage(payload.error || "批量编辑原始输入失败");
          return;
        }

        setBatchMessage(`已更新 ${payload.count ?? selectedIds.length} 条原始输入。`);
        setIsBatchEditing(false);
        setEnabledBatchFields([]);
        setSelectedIds([]);
        router.refresh();
      } catch (error) {
        setBatchMessage(error instanceof Error ? error.message : "批量编辑原始输入失败");
      }
    });
  }

  function deleteSelected() {
    if (!selectedIds.length) return;

    const preview = selectedItems
      .slice(0, 3)
      .map((item) => `${INPUT_TYPE_LABELS[item.inputType]} ${item.id}`)
      .join("、");
    const suffix = selectedItems.length > 3 ? ` 等 ${selectedItems.length} 条记录` : "";
    const confirmed = window.confirm(
      `确认删除 ${preview}${suffix} 吗？\n\n原始输入及其解析结果会被删除，候选人不会被删除。`
    );
    if (!confirmed) return;

    setBatchMessage(null);
    startBatchTransition(async () => {
      try {
        const response = await authFetch("/api/raw-inputs/batch-delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: selectedIds })
        });
        const payload = (await response.json()) as { count?: number; error?: string };
        if (!response.ok) {
          setBatchMessage(payload.error || "批量删除原始输入失败");
          return;
        }

        if (selectedItemId && selectedIds.includes(selectedItemId)) {
          setSelectedItemId(null);
        }
        setBatchMessage(`已删除 ${payload.count ?? selectedIds.length} 条原始输入。`);
        setIsBatchEditing(false);
        setSelectedIds([]);
        router.refresh();
      } catch (error) {
        setBatchMessage(error instanceof Error ? error.message : "批量删除原始输入失败");
      }
    });
  }

  useEffect(() => {
    if (!selectedItemId) {
      setSelectedItem(null);
      setDetailError(null);
      setIsDetailLoading(false);
      return;
    }

    let cancelled = false;
    setDetailError(null);
    setIsDetailLoading(true);

    async function loadDetail() {
      try {
        const response = await authFetch(`/api/raw-inputs/${selectedItemId}`, {
          cache: "no-store"
        });
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error || "加载原始输入详情失败");
        }

        if (!cancelled) {
          setSelectedItem(payload);
        }
      } catch (error) {
        if (!cancelled) {
          setDetailError(error instanceof Error ? error.message : "加载原始输入详情失败");
          setSelectedItem(null);
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
  }, [selectedItemId]);

  useEffect(() => {
    if (!selectedItemId) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedItemId(null);
      }
    }

    window.addEventListener("keydown", handleKeydown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeydown);
    };
  }, [selectedItemId]);

  function handleDelete() {
    if (!selectedItem) {
      return;
    }

    const confirmed = window.confirm(`确认删除原始输入 ${selectedItem.id} 吗？`);
    if (!confirmed) {
      return;
    }

    startDeleteTransition(async () => {
      const response = await authFetch(`/api/raw-inputs/${selectedItem.id}`, {
        method: "DELETE"
      });
      const payload = await response.json();

      if (!response.ok) {
        setDetailError(payload.error || "删除原始输入失败");
        return;
      }

      setSelectedItemId(null);
      router.refresh();
    });
  }

  return (
    <>
      <div className="page-note">列表页只保留摘要，点击任意一行后再加载完整原文、解析结果和关联任务。</div>

      <div className={`selection-toolbar ${selectedIds.length ? "active" : ""}`}>
        <div className="selection-toolbar-copy">
          <strong>
            {selectedIds.length
              ? `已选择 ${selectedIds.length} 条原始输入`
              : "批量管理原始输入"}
          </strong>
          <span>
            可统一修改输入类型或候选人关联；删除操作仅管理员可用。
          </span>
        </div>
        <div className="inline-actions">
          <label className="select-all-control">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} />
            <span>全选</span>
          </label>
          <button
            className="btn-secondary"
            type="button"
            disabled={!selectedIds.length || isBatchPending}
            onClick={() => setIsBatchEditing((current) => !current)}
          >
            批量编辑
          </button>
          {canDeleteRawInputs ? (
            <button
              className="btn-danger"
              type="button"
              disabled={!selectedIds.length || isBatchPending}
              onClick={deleteSelected}
            >
              {isBatchPending ? "处理中..." : "批量删除"}
            </button>
          ) : null}
        </div>
      </div>

      {isBatchEditing ? (
        <section className="batch-edit-panel" aria-label="批量编辑原始输入">
          <div className="section-headline">
            <div>
              <h3>批量编辑 {selectedIds.length} 条原始输入</h3>
              <p className="muted">
                只会覆盖勾选的项目；未勾选的字段保持原值。
              </p>
            </div>
            <button
              className="btn-ghost"
              type="button"
              onClick={() => setIsBatchEditing(false)}
            >
              收起
            </button>
          </div>
          <div className="batch-field-grid raw-input-batch-fields">
            <div className="batch-field">
              <label className="batch-field-switch">
                <input
                  type="checkbox"
                  checked={enabledBatchFields.includes("inputType")}
                  onChange={() => toggleBatchField("inputType")}
                />
                <span>修改输入类型</span>
              </label>
              <select
                className="select"
                value={batchValues.inputType}
                disabled={!enabledBatchFields.includes("inputType")}
                onChange={(event) =>
                  setBatchValues((current) => ({
                    ...current,
                    inputType: event.target.value as RawInputType
                  }))
                }
              >
                {Object.entries(INPUT_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <span className="field-helper">修正简历、邮件、聊天、备注等分类。</span>
            </div>

            <div className="batch-field">
              <label className="batch-field-switch">
                <input
                  type="checkbox"
                  checked={enabledBatchFields.includes("candidateId")}
                  onChange={() => toggleBatchField("candidateId")}
                />
                <span>修改关联候选人</span>
              </label>
              <select
                className="select"
                value={batchValues.candidateId}
                disabled={!enabledBatchFields.includes("candidateId")}
                onChange={(event) =>
                  setBatchValues((current) => ({
                    ...current,
                    candidateId: event.target.value
                  }))
                }
              >
                <option value="">清除候选人关联</option>
                {candidateOptions.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name}
                    {candidate.position?.title ? ` · ${candidate.position.title}` : ""}
                  </option>
                ))}
              </select>
              <span className="field-helper">
                同步更新关联 Agent 任务；选择空项表示解除关联。
              </span>
            </div>
          </div>
          <div className="inline-actions">
            <button
              className="btn"
              type="button"
              onClick={submitBatchEdit}
              disabled={isBatchPending || !enabledBatchFields.length}
            >
              {isBatchPending ? "保存中..." : "应用批量修改"}
            </button>
            <button
              className="btn-ghost"
              type="button"
              onClick={() => setEnabledBatchFields([])}
              disabled={isBatchPending}
            >
              清空修改项
            </button>
          </div>
        </section>
      ) : null}

      {batchMessage ? (
        <div
          className={
            batchMessage.includes("失败") || batchMessage.includes("请先")
              ? "alert danger"
              : "alert info"
          }
          role="status"
        >
          {batchMessage}
        </div>
      ) : null}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th className="selection-cell">
                <label className="table-checkbox" aria-label="全选当前原始输入">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                  <span />
                </label>
              </th>
              <th>创建时间</th>
              <th>输入类型</th>
              <th>原文预览</th>
              <th>关联候选人</th>
              <th>关联任务</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {items.length ? (
              items.map((item) => {
                const selected = selectedIds.includes(item.id);
                return (
                <tr
                  key={item.id}
                  className={`clickable-row ${selected ? "table-row-selected" : ""}`}
                  onClick={() => setSelectedItemId(item.id)}
                >
                  <td className="selection-cell">
                    <label
                      className="table-checkbox"
                      aria-label={`选择原始输入 ${item.id}`}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleSelection(item.id)}
                      />
                      <span />
                    </label>
                  </td>
                  <td>{formatDateTime(item.createdAt)}</td>
                  <td>{INPUT_TYPE_LABELS[item.inputType]}</td>
                  <td style={{ maxWidth: 320 }}>
                    {item.encodingIssue ? (
                      <div className="encoding-warning">该历史记录在写入前已发生编码损坏，原文无法完整恢复。</div>
                    ) : (
                      <div>{summarizeText(item.content)}</div>
                    )}
                  </td>
                  <td>
                    {item.candidate ? (
                      <div>
                        <Link href={`/candidates/${item.candidate.id}`} className="btn-ghost">
                          {item.candidate.name}
                        </Link>
                        <div className="muted">{item.candidate.position?.title || "未分配岗位"}</div>
                      </div>
                    ) : (
                      "未关联"
                    )}
                  </td>
                  <td>{item.agentTaskCount ? `${item.agentTaskCount} 条` : "暂无"}</td>
                  <td>
                    <button
                      className="btn-secondary"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedItemId(item.id);
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
                <td colSpan={7}>
                  <div className="empty-state">暂无原始输入记录。</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedItemId ? (
        <div className="drawer-overlay" onClick={() => setSelectedItemId(null)}>
          <aside className="drawer-panel" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <h3>原始输入回溯</h3>
                <p>{selectedItem ? `${selectedItem.id} | ${INPUT_TYPE_LABELS[selectedItem.inputType]}` : selectedItemId}</p>
              </div>
              <button className="drawer-close" onClick={() => setSelectedItemId(null)} aria-label="关闭详情抽屉">
                脳
              </button>
            </div>

            <div className="drawer-actions">
              {selectedItem?.candidate ? (
                <Link href={`/candidates/${selectedItem.candidate.id}#raw-inputs`} className="btn-secondary">
                  跳到候选人
                </Link>
              ) : (
                <button className="btn-secondary" disabled>
                  未关联候选人
                </button>
              )}
              <button
                className="btn-secondary"
                onClick={() => parsedResultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                disabled={!selectedItem}
              >
                跳到解析结果
              </button>
              {canDeleteRawInputs ? (
                <button className="btn-danger" onClick={handleDelete} disabled={!selectedItem || isDeleting}>
                  {isDeleting ? "删除中..." : "删除条目"}
                </button>
              ) : null}
            </div>

            <div className="drawer-body">
              {isDetailLoading ? <div className="empty-state">正在加载详情...</div> : null}
              {detailError ? <div className="alert danger">{detailError}</div> : null}

              {selectedItem ? (
                <>
                  {selectedItem.encodingIssue ? (
                    <div className="alert warning">
                      检测到这条历史数据在进入系统前已经出现不可逆的问号或替换字符。系统已阻止页面继续显示乱码，建议删除后从原文件重新解析。
                    </div>
                  ) : null}
                  <section className="drawer-section">
                    <div className="section-headline">
                      <h4>原文内容</h4>
                      <CopyButton value={selectedItem.content} />
                    </div>
                    <pre className="code-block raw-input-block">{selectedItem.content}</pre>
                  </section>

                  <section className="drawer-section" ref={parsedResultRef}>
                    <div className="section-headline">
                      <h4>解析结果</h4>
                      <CopyButton value={renderStructuredValue(selectedItem.parsedResult)} />
                    </div>
                    <pre className="code-block">{renderStructuredValue(selectedItem.parsedResult)}</pre>
                  </section>

                  <section className="drawer-section">
                    <h4>关联候选人</h4>
                    {selectedItem.candidate ? (
                      <div className="subtle-item">
                        <div className="inline-actions" style={{ justifyContent: "space-between" }}>
                          <strong>{selectedItem.candidate.name}</strong>
                          <StatusBadge status={selectedItem.candidate.status} />
                        </div>
                        <p className="muted" style={{ margin: "8px 0 0" }}>
                          {selectedItem.candidate.position?.title || "未分配岗位"}
                        </p>
                      </div>
                    ) : (
                      <div className="empty-state">当前原始输入尚未关联候选人。</div>
                    )}
                  </section>

                  <section className="drawer-section">
                    <h4>关联 Agent 任务</h4>
                    {selectedItem.agentTasks.length ? (
                      <div className="subtle-list">
                        {selectedItem.agentTasks.map((task) => (
                          <div key={task.id} className="subtle-item">
                            <div className="inline-actions" style={{ justifyContent: "space-between" }}>
                              <strong>{task.agentName}</strong>
                              <TaskStatusBadge status={task.status} />
                            </div>
                            <p className="muted" style={{ margin: "8px 0 0" }}>
                              {task.taskType} |{" "}
                              {task.confidence !== null ? `${Math.round(task.confidence * 100)}%` : "暂无置信度"} |{" "}
                              {formatDateTime(task.createdAt)}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="empty-state">当前原始输入还没有关联 Agent 任务。</div>
                    )}
                  </section>

                  <section className="drawer-section">
                    <h4>重新解析 / 重新运行 AI</h4>
                    <AIReparseControls content={selectedItem.content} inputTypeHint={selectedItem.inputType} />
                  </section>
                </>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
