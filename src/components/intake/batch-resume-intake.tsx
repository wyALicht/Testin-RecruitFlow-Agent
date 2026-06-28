"use client";

import { CandidateStatus, RawInputType } from "@prisma/client";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import type { IntakeDepartment, IntakePosition } from "@/components/intake/intake-types";
import { AI_PROVIDER_OPTIONS, type AIProviderOptionValue } from "@/lib/ai/options";
import { authFetch } from "@/lib/auth/client-session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { INPUT_SCENE_LABELS, STATUS_LABELS, STATUS_ORDER } from "@/lib/constants";

type InputScene = keyof typeof INPUT_SCENE_LABELS;

type CandidateDraft = {
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
  confidence: number;
  uncertainFields: string[];
  positionTitle: string | null;
  inputType: RawInputType;
  inputScene: InputScene;
  tags: string[];
  followUpSuggestion: string | null;
  customFields: Record<string, unknown>;
};

type CustomFieldDefinition = {
  key: string;
  label: string;
  fieldType: string;
  required: boolean;
  options: unknown;
};

type ExtractResponse = {
  rawInputId: string;
  providerName: string;
  positionContext: {
    positionId: string | null;
    positionTitle: string | null;
    jobDescriptionUsed: boolean;
  };
  draft: CandidateDraft;
  duplicate: {
    candidateId: string;
    candidateName: string;
    reasons: string[];
    score: number;
  } | null;
  customFieldDefinitions: CustomFieldDefinition[];
  file?: {
    name: string;
    url?: string;
  };
};

type BatchStatus =
  | "waiting"
  | "parsing"
  | "review"
  | "confirmed"
  | "excluded"
  | "saving"
  | "saved"
  | "failed";
type SaveMode = "merge" | "create" | null;
type QueueFilter = "all" | "pending" | "review" | "confirmed" | "issues";

type BatchItem = {
  id: string;
  file: File;
  status: BatchStatus;
  selectedForParse: boolean;
  saveMode: SaveMode;
  result?: ExtractResponse;
  reviewedDraft?: CandidateDraft;
  candidateId?: string;
  error?: string;
  errorPhase?: "parse" | "save";
};

const MAX_FILES = 20;
const MAX_FILE_SIZE = 8 * 1024 * 1024;
const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".txt", ".md", ".json"];

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function fileExtension(fileName: string) {
  const index = fileName.lastIndexOf(".");
  return index >= 0 ? fileName.slice(index).toLowerCase() : "";
}

function createBatchItemId() {
  const browserCrypto = globalThis.crypto;
  if (typeof browserCrypto?.randomUUID === "function") return browserCrypto.randomUUID();
  if (typeof browserCrypto?.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    browserCrypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  return `batch-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

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

function statusText(status: BatchStatus, errorPhase?: BatchItem["errorPhase"]) {
  if (status === "failed") return errorPhase === "save" ? "入库失败" : "解析失败";
  return {
    waiting: "等待解析",
    parsing: "AI 解析中",
    review: "待人工确认",
    confirmed: "已确认",
    excluded: "已排除",
    saving: "入库中",
    saved: "已入库"
  }[status];
}

function fieldValue(value: string | null | undefined) {
  return value ?? "";
}

const uncertainAliases: Record<string, string[]> = {
  name: ["姓名"],
  phone: ["联系方式", "手机号", "电话"],
  email: ["联系方式", "邮箱"],
  education: ["学历", "最高学历"],
  school: ["学校", "毕业院校"],
  major: ["专业"],
  yearsOfExperience: ["工作年限", "工作经验"],
  skills: ["技能", "技能标签"],
  positionTitle: ["应聘岗位", "目标岗位"],
  status: ["招聘阶段", "当前状态"],
  tags: ["候选人标签"],
  source: ["来源"],
  remark: ["Agent备注", "Agent 备注"],
  followUpSuggestion: ["AI跟进建议", "AI 跟进建议"]
};

function needsAiReview(draft: CandidateDraft, field: string, label?: string) {
  const aliases = new Set([field, label, ...(uncertainAliases[field] ?? [])].filter(Boolean));
  return draft.uncertainFields.some((item) => aliases.has(item));
}

function AiReviewLabel({ label, show }: { label: string; show: boolean }) {
  return (
    <>
      {label}
      {show ? <span className="ai-review-badge">AI 待确认</span> : null}
    </>
  );
}

export function BatchResumeIntake({
  departments,
  positions,
  initialPositionId = ""
}: {
  departments: IntakeDepartment[];
  positions: IntakePosition[];
  initialPositionId?: string;
}) {
  const initialPosition = positions.find((position) => position.id === initialPositionId);
  const { can } = useAuth();
  const canManagePositionPresets = can(PERMISSIONS.POSITION_MANAGE);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [provider, setProvider] = useState<AIProviderOptionValue>("qwen");
  const [departmentId, setDepartmentId] = useState(initialPosition?.departmentId ?? "");
  const [positionId, setPositionId] = useState(initialPositionId);
  const [items, setItems] = useState<BatchItem[]>([]);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [queueFilter, setQueueFilter] = useState<QueueFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [educationFilter, setEducationFilter] = useState("all");
  const [autoParse, setAutoParse] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [pageNotice, setPageNotice] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [isBatchSaving, setIsBatchSaving] = useState(false);
  const [retryingItemId, setRetryingItemId] = useState<string | null>(null);

  const filteredPositions = useMemo(
    () => positions.filter((position) => !departmentId || position.departmentId === departmentId),
    [departmentId, positions]
  );
  const selectedDepartmentName =
    departments.find((department) => department.id === departmentId)?.name ?? "";
  const selectedPositionName = positions.find((position) => position.id === positionId)?.title ?? "";
  const configurationLocked = items.some((item) =>
    ["parsing", "review", "confirmed", "saving", "saved"].includes(item.status)
  );
  const counts = useMemo(
    () => ({
      total: items.length,
      parsed: items.filter((item) =>
        ["review", "confirmed", "excluded", "saving", "saved"].includes(item.status)
      ).length,
      review: items.filter((item) => item.status === "review").length,
      confirmed: items.filter((item) => item.status === "confirmed").length,
      saved: items.filter((item) => item.status === "saved").length,
      failed: items.filter((item) => item.status === "failed").length,
      parsing: items.filter((item) => item.status === "parsing").length,
      pending: items.filter(
        (item) => item.status === "waiting" || (item.status === "failed" && item.errorPhase === "parse")
      ).length,
      selectedPending: items.filter(
        (item) =>
          item.selectedForParse &&
          (item.status === "waiting" || (item.status === "failed" && item.errorPhase === "parse"))
      ).length
    }),
    [items]
  );
  const progress = counts.total ? Math.round(((counts.parsed + counts.failed) / counts.total) * 100) : 0;
  const allConfirmationsComplete =
    items.length > 0 &&
    counts.pending === 0 &&
    counts.parsing === 0 &&
    counts.review === 0 &&
    counts.failed === 0 &&
    items.some((item) => ["confirmed", "excluded", "saved"].includes(item.status));
  const activeItem = items.find((item) => item.id === activeItemId) ?? null;
  const pendingUploadItems = items.filter(
    (item) =>
      item.status === "waiting" || (item.status === "failed" && item.errorPhase === "parse")
  );
  const allPendingUploadsSelected =
    pendingUploadItems.length > 0 &&
    pendingUploadItems.every((item) => item.selectedForParse);
  const educationOptions = Array.from(
    new Set(
      items
        .map((item) => item.reviewedDraft?.education?.trim())
        .filter((value): value is string => Boolean(value))
    )
  ).sort((left, right) => left.localeCompare(right, "zh-CN"));
  const visibleItems = items.filter((item) => {
    const statusMatches =
      queueFilter === "all" ||
      (queueFilter === "pending" && ["waiting", "parsing"].includes(item.status)) ||
      (queueFilter === "review" && item.status === "review") ||
      (queueFilter === "confirmed" && ["confirmed", "saved"].includes(item.status)) ||
      (queueFilter === "issues" &&
        (item.status === "failed" ||
          Boolean(item.result?.duplicate) ||
          Boolean(item.reviewedDraft?.uncertainFields.length)));
    if (!statusMatches) return false;
    if (
      educationFilter !== "all" &&
      item.reviewedDraft?.education?.trim() !== educationFilter
    ) {
      return false;
    }
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    const draft = item.reviewedDraft;
    return [
      item.file.name,
      draft?.name,
      draft?.phone,
      draft?.email,
      draft?.school,
      draft?.major,
      draft?.education,
      ...(draft?.skills ?? []),
      ...(draft?.tags ?? [])
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });
  const hasQueueFilters =
    queueFilter !== "all" || educationFilter !== "all" || Boolean(searchQuery.trim());
  const selectableVisibleItems = visibleItems.filter(
    (item) =>
      item.status === "waiting" || (item.status === "failed" && item.errorPhase === "parse")
  );
  const allVisibleSelected =
    selectableVisibleItems.length > 0 &&
    selectableVisibleItems.every((item) => item.selectedForParse);

  function patchItem(id: string, patch: Partial<BatchItem>) {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  }

  function updateActiveDraft(patch: Partial<CandidateDraft>) {
    if (!activeItem?.reviewedDraft) return;
    patchItem(activeItem.id, {
      status: activeItem.status === "confirmed" ? "review" : activeItem.status,
      reviewedDraft: {
        ...activeItem.reviewedDraft,
        ...patch
      }
    });
  }

  function updateCustomField(key: string, value: unknown) {
    if (!activeItem?.reviewedDraft) return;
    updateActiveDraft({
      customFields: {
        ...activeItem.reviewedDraft.customFields,
        [key]: value
      }
    });
  }

  function addFiles(fileList: FileList | File[]) {
    const incoming = Array.from(fileList);
    setPageError(null);
    setPageNotice(null);
    const existingKeys = new Set(
      items.map((item) => `${item.file.name}:${item.file.size}:${item.file.lastModified}`)
    );
    const accepted: BatchItem[] = [];
    const rejected: string[] = [];
    for (const file of incoming) {
      const key = `${file.name}:${file.size}:${file.lastModified}`;
      if (existingKeys.has(key)) {
        rejected.push(`${file.name}：已在本批次中`);
        continue;
      }
      if (!ALLOWED_EXTENSIONS.includes(fileExtension(file.name))) {
        rejected.push(`${file.name}：格式不支持`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        rejected.push(`${file.name}：超过 8MB`);
        continue;
      }
      if (items.length + accepted.length >= MAX_FILES) {
        rejected.push(`一次最多上传 ${MAX_FILES} 份`);
        break;
      }
      existingKeys.add(key);
      accepted.push({
        id: createBatchItemId(),
        file,
        status: "waiting",
        selectedForParse: true,
        saveMode: null
      });
    }
    if (rejected.length) setPageError(rejected.slice(0, 3).join("；"));
    if (!accepted.length) return;
    setItems((current) => [...current, ...accepted]);
    setActiveItemId((current) => current ?? accepted[0].id);
    if (autoParse && departmentId && positionId) {
      setPageNotice(`已加入 ${accepted.length} 份简历，正在自动解析。`);
      setTimeout(() => void parseItems(accepted), 0);
    } else if (!departmentId || !positionId) {
      setPageNotice(`已加入 ${accepted.length} 份简历，请选择部门和岗位后开始解析。`);
    } else {
      setPageNotice(`已加入 ${accepted.length} 份简历，点击“开始批量解析”即可处理。`);
    }
  }

  async function parseItem(
    item: BatchItem,
    targetDepartmentId = departmentId,
    targetPositionId = positionId
  ) {
    patchItem(item.id, {
      status: "parsing",
      selectedForParse: false,
      error: undefined,
      errorPhase: undefined,
      result: undefined,
      reviewedDraft: undefined,
      candidateId: undefined
    });
    try {
      const formData = new FormData();
      formData.append("file", item.file);
      formData.append("provider", provider);
      formData.append("departmentId", targetDepartmentId);
      formData.append("positionId", targetPositionId);
      const response = await authFetch("/api/agent/extract-file", { method: "POST", body: formData });
      const payload = (await response.json()) as ExtractResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error || "简历解析失败");
      patchItem(item.id, {
        status: "review",
        result: payload,
        reviewedDraft: {
          ...payload.draft,
          customFields: payload.draft.customFields ?? {}
        },
        saveMode: payload.duplicate ? null : "create"
      });
      setActiveItemId((current) => current ?? item.id);
    } catch (error) {
      patchItem(item.id, {
        status: "failed",
        selectedForParse: true,
        saveMode: null,
        errorPhase: "parse",
        error: error instanceof Error ? error.message : "简历解析失败"
      });
    }
  }

  async function parseItems(
    queue: BatchItem[],
    targetDepartmentId = departmentId,
    targetPositionId = positionId
  ) {
    if (!queue.length) {
      setPageError("请先添加待解析的简历文件");
      return;
    }
    setPageError(null);
    setIsBatchRunning(true);
    let cursor = 0;
    async function worker() {
      while (cursor < queue.length) {
        const item = queue[cursor];
        cursor += 1;
        await parseItem(item, targetDepartmentId, targetPositionId);
      }
    }
    try {
      await Promise.all([worker(), worker()]);
    } finally {
      setIsBatchRunning(false);
      setPageNotice("本轮解析已完成，请在候选人队列中连续审核 AI 结果。");
    }
  }

  async function parseAll() {
    if (!departmentId || !positionId) {
      setPageError("请先选择部门和该部门下的目标岗位");
      return;
    }
    const queue = items.filter(
      (item) =>
        item.selectedForParse &&
        (item.status === "waiting" || (item.status === "failed" && item.errorPhase === "parse"))
    );
    if (!queue.length) {
      setPageError("请先勾选需要解析的简历");
      return;
    }
    await parseItems(queue);
  }

  function toggleParseSelection(itemId: string, selectedForParse: boolean) {
    patchItem(itemId, { selectedForParse });
  }

  function toggleVisibleParseSelection(selectedForParse: boolean) {
    const selectableIds = new Set(selectableVisibleItems.map((item) => item.id));
    setItems((current) =>
      current.map((item) =>
        selectableIds.has(item.id) ? { ...item, selectedForParse } : item
      )
    );
  }

  function togglePendingUploadSelection(selectedForParse: boolean) {
    const pendingIds = new Set(pendingUploadItems.map((item) => item.id));
    setItems((current) =>
      current.map((item) =>
        pendingIds.has(item.id) ? { ...item, selectedForParse } : item
      )
    );
  }

  function openFilePicker() {
    if (!isBatchRunning && !isBatchSaving) fileInputRef.current?.click();
  }

  function removeWaitingItem(itemId: string) {
    setItems((current) => current.filter((item) => item.id !== itemId));
    setActiveItemId((current) => {
      if (current !== itemId) return current;
      return items.find((item) => item.id !== itemId)?.id ?? null;
    });
  }

  function nextReviewItem(currentId: string) {
    const currentIndex = items.findIndex((item) => item.id === currentId);
    const next =
      items.slice(currentIndex + 1).find((item) => item.status === "review") ??
      items.find((item) => item.status === "review" && item.id !== currentId);
    setActiveItemId(next?.id ?? currentId);
  }

  function confirmActiveItem() {
    if (!activeItem?.reviewedDraft) return;
    if (!activeItem.reviewedDraft.name.trim()) {
      patchItem(activeItem.id, { error: "请补充候选人姓名后再确认" });
      return;
    }
    if (activeItem.result?.duplicate && !activeItem.saveMode) {
      patchItem(activeItem.id, { error: "请先选择合并已有候选人或仍然新建" });
      return;
    }
    const missingCustomField = activeItem.result?.customFieldDefinitions.find(
      (field) =>
        field.required &&
        (activeItem.reviewedDraft?.customFields[field.key] === undefined ||
          activeItem.reviewedDraft?.customFields[field.key] === "")
    );
    if (missingCustomField) {
      patchItem(activeItem.id, { error: `请填写必填字段“${missingCustomField.label}”` });
      return;
    }
    patchItem(activeItem.id, { status: "confirmed", error: undefined });
    nextReviewItem(activeItem.id);
  }

  function excludeActiveItem() {
    if (!activeItem) return;
    patchItem(activeItem.id, { status: "excluded", error: undefined });
    nextReviewItem(activeItem.id);
  }

  async function saveItem(item: BatchItem) {
    if (!item.result || !item.reviewedDraft || !item.saveMode) {
      patchItem(item.id, {
        status: "review",
        errorPhase: undefined,
        error: "入库上下文不完整，请重新确认保存策略后再试"
      });
      return false;
    }
    patchItem(item.id, { status: "saving", error: undefined, errorPhase: undefined });
    try {
      const response = await authFetch("/api/candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...item.reviewedDraft,
          rawInputId: item.result.rawInputId,
          duplicateMatchId:
            item.saveMode === "merge" ? item.result.duplicate?.candidateId ?? null : null,
          targetPositionId: positionId
        })
      });
      const payload = (await response.json()) as { candidate?: { id: string }; error?: string };
      if (!response.ok || !payload.candidate?.id) {
        throw new Error(payload.error || "候选人保存失败");
      }
      patchItem(item.id, {
        status: "saved",
        candidateId: payload.candidate.id,
        error: undefined,
        errorPhase: undefined
      });
      return true;
    } catch (error) {
      patchItem(item.id, {
        status: "failed",
        errorPhase: "save",
        error: error instanceof Error ? error.message : "候选人保存失败"
      });
      return false;
    }
  }

  function returnFailedSaveToReview(item: BatchItem) {
    patchItem(item.id, {
      status: "review",
      error: undefined,
      errorPhase: undefined
    });
  }

  async function retryFailedSave(item: BatchItem) {
    setPageError(null);
    setRetryingItemId(item.id);
    setPageNotice(`正在重新入库“${item.reviewedDraft?.name || item.file.name}”…`);
    try {
      const succeeded = await saveItem(item);
      setPageNotice(
        succeeded
          ? `“${item.reviewedDraft?.name || item.file.name}”已重新入库成功。`
          : null
      );
    } finally {
      setRetryingItemId(null);
    }
  }

  async function saveConfirmed() {
    const queue = items.filter((item) => item.status === "confirmed");
    if (!queue.length) {
      setPageError("请先完成人工确认，再执行批量入库");
      return;
    }
    setPageError(null);
    setIsBatchSaving(true);
    try {
      for (const item of queue) await saveItem(item);
    } finally {
      setIsBatchSaving(false);
    }
  }

  function changeDepartment(nextDepartmentId: string) {
    setDepartmentId(nextDepartmentId);
    if (
      !positions.some(
        (position) => position.id === positionId && position.departmentId === nextDepartmentId
      )
    ) {
      setPositionId("");
    }
  }

  const draft = activeItem?.reviewedDraft;

  return (
    <div className="grid batch-intake">
      <section className="card batch-setup-card">
        <div className="page-header">
          <div>
            <h3>批量简历录入</h3>
            <p>先设置归属并上传简历，解析后系统会自动进入连续审核模式。</p>
          </div>
          <div className="page-actions">
            <button
              className="btn-secondary"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isBatchRunning || isBatchSaving}
            >
              {configurationLocked ? "继续添加简历" : "添加简历"}
            </button>
            <button
              className="btn"
              type="button"
              onClick={parseAll}
              disabled={isBatchRunning || isBatchSaving || !counts.selectedPending}
            >
              {isBatchRunning
                ? `正在解析 ${counts.parsed + counts.failed}/${counts.total}`
                : counts.selectedPending
                  ? `仅解析已选简历（${counts.selectedPending}）`
                  : counts.pending
                    ? "请先勾选简历"
                  : "暂无待解析简历"}
            </button>
          </div>
        </div>

        <div className="batch-intake-config">
          <div className="field">
            <label htmlFor="batch-provider">AI 模型</label>
            <select
              id="batch-provider"
              className="select"
              value={provider}
              onChange={(event) => setProvider(event.target.value as AIProviderOptionValue)}
              disabled={configurationLocked}
            >
              {AI_PROVIDER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="batch-department">部门 *</label>
            <select
              id="batch-department"
              className="select"
              value={departmentId}
              onChange={(event) => changeDepartment(event.target.value)}
              disabled={configurationLocked}
            >
              <option value="">请选择部门</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>{department.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="batch-position">目标岗位 *</label>
            <select
              id="batch-position"
              className="select"
              value={positionId}
              onChange={(event) => {
                const nextPositionId = event.target.value;
                setPositionId(nextPositionId);
                const waitingItems = items.filter(
                  (item) => item.status === "waiting" && item.selectedForParse
                );
                if (autoParse && departmentId && nextPositionId && waitingItems.length) {
                  setPageNotice(`岗位已选定，正在自动解析 ${waitingItems.length} 份简历。`);
                  setTimeout(
                    () => void parseItems(waitingItems, departmentId, nextPositionId),
                    0
                  );
                }
              }}
              disabled={configurationLocked || !departmentId}
            >
              <option value="">{departmentId ? "请选择岗位" : "请先选择部门"}</option>
              {filteredPositions.map((position) => (
                <option key={position.id} value={position.id}>{position.title}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="batch-preset-note">
          <span>部门与岗位由管理员预设，必须先选部门，再选择该部门下的岗位。</span>
          {departmentId && positionId ? (
            <strong>{selectedDepartmentName} — {selectedPositionName}</strong>
          ) : null}
          {canManagePositionPresets ? <Link href="/positions">管理部门与岗位预设</Link> : null}
        </div>
        <label className="batch-auto-parse">
          <input
            type="checkbox"
            checked={autoParse}
            onChange={(event) => setAutoParse(event.target.checked)}
            disabled={isBatchRunning}
          />
          <span>
            <strong>上传后自动解析</strong>
            <small>默认关闭。开启后，仅自动处理新上传且已勾选的简历。</small>
          </span>
        </label>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.txt,.md,.json"
          style={{ display: "none" }}
          onChange={(event) => {
            if (event.target.files) addFiles(event.target.files);
            event.target.value = "";
          }}
        />

        {configurationLocked ? (
          <div className="batch-binding-summary">
            <div><span>本批次部门</span><strong>{selectedDepartmentName}</strong></div>
            <div><span>本批次岗位</span><strong>{selectedPositionName}</strong></div>
            <p>配置已锁定。仍可继续追加简历，新文件会沿用当前部门和岗位。</p>
          </div>
        ) : null}
        <div
          className={`dropzone batch-dropzone ${configurationLocked ? "compact" : ""} ${isDragActive ? "active" : ""}`}
          role="button"
          tabIndex={0}
          aria-label="点击或拖入多份简历"
          onClick={openFilePicker}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              openFilePicker();
            }
          }}
          onDragOver={(event) => {
            event.preventDefault();
            if (!isBatchRunning && !isBatchSaving) setIsDragActive(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            setIsDragActive(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragActive(false);
            if (!isBatchRunning && !isBatchSaving) addFiles(event.dataTransfer.files);
          }}
        >
          <div className="batch-upload-prompt">
            <span className="batch-upload-mark" aria-hidden="true">+</span>
            <div>
              <strong>
                {configurationLocked
                  ? "继续拖入简历，或点击追加文件"
                  : pendingUploadItems.length
                    ? `已上传 ${pendingUploadItems.length} 份待解析简历`
                    : "拖入多份简历，或点击添加简历"}
              </strong>
              <p className="muted">支持 PDF、DOCX、TXT、MD、JSON；单文件不超过 8MB，最多 20 份。</p>
            </div>
            <span className="batch-upload-action">选择文件</span>
          </div>

          {pendingUploadItems.length ? (
            <div
              className="batch-upload-files"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
            >
              <div className="batch-upload-files-header">
                <label>
                  <input
                    type="checkbox"
                    checked={allPendingUploadsSelected}
                    onChange={(event) => togglePendingUploadSelection(event.target.checked)}
                  />
                  <span>全选待解析简历</span>
                </label>
                <strong>已选 {counts.selectedPending} / {pendingUploadItems.length} 份</strong>
              </div>
              <div className="batch-upload-file-grid">
                {pendingUploadItems.map((item) => (
                  <article
                    className={`batch-upload-file ${item.selectedForParse ? "selected" : ""}`}
                    key={item.id}
                  >
                    <label className="batch-upload-file-select">
                      <input
                        type="checkbox"
                        checked={item.selectedForParse}
                        onChange={(event) =>
                          toggleParseSelection(item.id, event.target.checked)
                        }
                        aria-label={`选择解析 ${item.file.name}`}
                      />
                    </label>
                    <button
                      type="button"
                      className="batch-upload-file-main"
                      onClick={() => setActiveItemId(item.id)}
                    >
                      <strong title={item.file.name}>{item.file.name}</strong>
                      <span>
                        {formatFileSize(item.file.size)}
                        {item.error ? ` · ${item.error}` : " · 等待解析"}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="batch-upload-file-remove"
                      onClick={() => removeWaitingItem(item.id)}
                      aria-label={`移除 ${item.file.name}`}
                    >
                      移除
                    </button>
                  </article>
                ))}
              </div>
            </div>
          ) : null}

          {!configurationLocked && items.length ? (
            <button
              className="btn-ghost danger-text batch-upload-clear"
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setItems([]);
                setActiveItemId(null);
              }}
            >
              清空本批次
            </button>
          ) : null}
        </div>
        {pageNotice ? <div className="alert info" role="status">{pageNotice}</div> : null}
        {pageError ? <div className="alert danger" role="alert">{pageError}</div> : null}
      </section>

      {items.length ? (
        <section className="batch-progress-card" aria-label="批次处理进度">
          <div className="batch-progress-copy">
            <strong>批次进度 {progress}%</strong>
            <span>
              共 {counts.total} 份 · 待确认 {counts.review} · 已确认 {counts.confirmed} · 已入库 {counts.saved}
              {counts.failed ? ` · 失败 ${counts.failed}` : ""}
            </span>
          </div>
          <div className="completion-track"><span style={{ width: `${progress}%` }} /></div>
        </section>
      ) : null}

      {items.length ? (
        <section className="batch-review-workspace">
          <aside className="batch-review-queue" aria-label="候选人审核队列">
            <div className="batch-queue-header">
              <div>
                <h3>候选人队列</h3>
                <p>点击记录即可查看和修改 AI 结果。</p>
              </div>
              <div className="batch-queue-filters">
                {([
                  ["all", "全部"],
                  ["pending", `待处理 ${counts.pending + counts.parsing}`],
                  ["review", `待确认 ${counts.review}`],
                  ["confirmed", "已确认"],
                  ["issues", "异常"]
                ] as Array<[QueueFilter, string]>).map(([value, label]) => (
                  <button
                    type="button"
                    key={value}
                    className={queueFilter === value ? "active" : ""}
                    onClick={() => setQueueFilter(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="batch-queue-search">
                <label htmlFor="batch-queue-search">搜索简历</label>
                <input
                  id="batch-queue-search"
                  className="input"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="文件名、姓名、学校、技能…"
                />
              </div>
              <div className="batch-queue-filter-row">
                <label htmlFor="batch-education-filter">学历</label>
                <select
                  id="batch-education-filter"
                  className="select"
                  value={educationFilter}
                  onChange={(event) => setEducationFilter(event.target.value)}
                >
                  <option value="all">全部学历</option>
                  {educationOptions.map((education) => (
                    <option key={education} value={education}>{education}</option>
                  ))}
                </select>
                {hasQueueFilters ? (
                  <button
                    type="button"
                    className="btn-ghost btn-compact"
                    onClick={() => {
                      setQueueFilter("all");
                      setEducationFilter("all");
                      setSearchQuery("");
                    }}
                  >
                    清除筛选
                  </button>
                ) : null}
              </div>
              {selectableVisibleItems.length ? (
                <div className="batch-parse-selection">
                  <label>
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={(event) => toggleVisibleParseSelection(event.target.checked)}
                    />
                    <span>选择当前结果</span>
                  </label>
                  <strong>已选 {counts.selectedPending} 份待解析</strong>
                </div>
              ) : null}
              <span className="batch-filter-result">当前显示 {visibleItems.length} / {items.length} 份</span>
            </div>
            <div className="batch-queue-list">
              {visibleItems.map((item) => (
                <article
                  key={item.id}
                  className={`batch-queue-item ${activeItemId === item.id ? "active" : ""}`}
                >
                  {item.status === "waiting" ||
                  (item.status === "failed" && item.errorPhase === "parse") ? (
                    <label className="batch-queue-select">
                      <input
                        type="checkbox"
                        checked={item.selectedForParse}
                        onChange={(event) =>
                          toggleParseSelection(item.id, event.target.checked)
                        }
                        aria-label={`选择解析 ${item.file.name}`}
                      />
                    </label>
                  ) : (
                    <span className="batch-queue-select-spacer" />
                  )}
                  <button
                    type="button"
                    className="batch-queue-open"
                    onClick={() => setActiveItemId(item.id)}
                  >
                    <span className={`batch-queue-status ${item.status}`} />
                    <span className="batch-queue-main">
                      <strong>{item.reviewedDraft?.name || item.file.name}</strong>
                      <small>
                        {item.reviewedDraft
                          ? `${item.reviewedDraft.education || "学历待确认"} · ${Math.round(item.reviewedDraft.confidence * 100)}%`
                          : formatFileSize(item.file.size)}
                      </small>
                    </span>
                    <span className={`status-badge ${item.status}`}>
                      {statusText(item.status, item.errorPhase)}
                    </span>
                  </button>
                  {item.status === "waiting" ? (
                    <button
                      type="button"
                      className="batch-queue-remove"
                      aria-label={`移除 ${item.file.name}`}
                      onClick={() => removeWaitingItem(item.id)}
                    >
                      移除
                    </button>
                  ) : null}
                </article>
              ))}
              {!visibleItems.length ? <div className="empty-state compact">当前筛选下没有记录。</div> : null}
            </div>
          </aside>

          <div className="batch-review-panel">
            {!activeItem ? (
              <div className="batch-review-empty">
                <strong>{isBatchRunning ? "AI 正在解析简历" : "选择一位候选人开始审核"}</strong>
                <p>解析完成后会自动打开第一份待确认记录。</p>
              </div>
            ) : activeItem.status === "waiting" || activeItem.status === "parsing" ? (
              <div className="batch-review-empty">
                <strong>{activeItem.status === "parsing" ? "正在提取候选人信息…" : "等待开始解析"}</strong>
                <p>{activeItem.file.name}</p>
              </div>
            ) : activeItem.status === "failed" ? (
              <div className="batch-review-empty error">
                <strong>{statusText(activeItem.status, activeItem.errorPhase)}</strong>
                <p>{activeItem.error}</p>
                {activeItem.errorPhase === "save" ? (
                  <div className="inline-actions">
                    <button
                      className="btn-secondary"
                      type="button"
                      onClick={() => returnFailedSaveToReview(activeItem)}
                    >
                      返回确认页修改
                    </button>
                    <button
                      className="btn"
                      type="button"
                      onClick={() => void retryFailedSave(activeItem)}
                      disabled={retryingItemId === activeItem.id}
                    >
                      {retryingItemId === activeItem.id ? "重新入库中…" : "重试入库"}
                    </button>
                  </div>
                ) : (
                  <button
                    className="btn"
                    type="button"
                    onClick={() => void parseItem(activeItem)}
                    disabled={isBatchRunning}
                  >
                    {isBatchRunning ? "重新解析中…" : "重新解析"}
                  </button>
                )}
              </div>
            ) : draft &&
              activeItem.result &&
              ["review", "confirmed", "saving"].includes(activeItem.status) ? (
              <>
                <div className="batch-review-header">
                  <div>
                    <span className={`status-badge ${activeItem.status}`}>
                      {statusText(activeItem.status)}
                    </span>
                    <h3>{draft.name || "待补充姓名"}</h3>
                    <p>{activeItem.file.name} · {activeItem.result.providerName}</p>
                  </div>
                  <div className="batch-review-header-meta">
                    <span>部门<strong>{selectedDepartmentName}</strong></span>
                    <span>岗位<strong>{selectedPositionName}</strong></span>
                    {activeItem.result.file?.url ? (
                      <Link href={activeItem.result.file.url} target="_blank" className="btn-secondary btn-compact">
                        查看原始简历
                      </Link>
                    ) : null}
                  </div>
                </div>

                <div className={`alert ${activeItem.result.positionContext?.jobDescriptionUsed ? "info" : "warning"}`}>
                  {activeItem.result.positionContext?.jobDescriptionUsed
                    ? `本份简历已参考“${activeItem.result.positionContext.positionTitle}”岗位 JD 生成备注和跟进建议。`
                    : `当前岗位未设置 JD，本份简历的备注和建议仅依据候选人材料生成。`}
                </div>

                {draft.uncertainFields.length ? (
                  <div className="alert warning">
                    AI 标记了 {draft.uncertainFields.length} 个待确认字段：{draft.uncertainFields.join("、")}
                  </div>
                ) : null}
                {activeItem.result.duplicate ? (
                  <div className="batch-duplicate-review">
                    <div>
                      <strong>疑似重复候选人：{activeItem.result.duplicate.candidateName}</strong>
                      <p>依据：{activeItem.result.duplicate.reasons.join("、")}，匹配度 {Math.round(activeItem.result.duplicate.score * 100)}%</p>
                    </div>
                    <div className="choice-group">
                      <button
                        type="button"
                        className={`choice-pill ${activeItem.saveMode === "merge" ? "active" : ""}`}
                        onClick={() => patchItem(activeItem.id, { saveMode: "merge", error: undefined })}
                      >
                        合并已有
                      </button>
                      <button
                        type="button"
                        className={`choice-pill ${activeItem.saveMode === "create" ? "active" : ""}`}
                        onClick={() => patchItem(activeItem.id, { saveMode: "create", error: undefined })}
                      >
                        仍然新建
                      </button>
                    </div>
                  </div>
                ) : null}
                {activeItem.error ? <div className="alert danger" role="alert">{activeItem.error}</div> : null}

                <div className="batch-review-form">
                  <div className={`field ${needsAiReview(draft, "name") ? "field-attention" : ""}`}>
                    <label htmlFor="batch-review-name"><AiReviewLabel label="姓名 *" show={needsAiReview(draft, "name")} /></label>
                    <input id="batch-review-name" className="input" value={draft.name} onChange={(event) => updateActiveDraft({ name: event.target.value })} />
                  </div>
                  <div className={`field ${needsAiReview(draft, "phone") ? "field-attention" : ""}`}>
                    <label htmlFor="batch-review-phone"><AiReviewLabel label="手机号" show={needsAiReview(draft, "phone")} /></label>
                    <input id="batch-review-phone" className="input" value={fieldValue(draft.phone)} onChange={(event) => updateActiveDraft({ phone: event.target.value || null })} />
                  </div>
                  <div className={`field ${needsAiReview(draft, "email") ? "field-attention" : ""}`}>
                    <label htmlFor="batch-review-email"><AiReviewLabel label="邮箱" show={needsAiReview(draft, "email")} /></label>
                    <input id="batch-review-email" type="email" className="input" value={fieldValue(draft.email)} onChange={(event) => updateActiveDraft({ email: event.target.value || null })} />
                  </div>
                  <div className={`field ${needsAiReview(draft, "education") ? "field-attention" : ""}`}>
                    <label htmlFor="batch-review-education"><AiReviewLabel label="最高学历" show={needsAiReview(draft, "education")} /></label>
                    <input id="batch-review-education" className="input" value={fieldValue(draft.education)} onChange={(event) => updateActiveDraft({ education: event.target.value || null })} />
                  </div>
                  <div className={`field ${needsAiReview(draft, "school") ? "field-attention" : ""}`}>
                    <label htmlFor="batch-review-school"><AiReviewLabel label="毕业院校" show={needsAiReview(draft, "school")} /></label>
                    <input id="batch-review-school" className="input" value={fieldValue(draft.school)} onChange={(event) => updateActiveDraft({ school: event.target.value || null })} />
                  </div>
                  <div className={`field ${needsAiReview(draft, "major") ? "field-attention" : ""}`}>
                    <label htmlFor="batch-review-major"><AiReviewLabel label="专业" show={needsAiReview(draft, "major")} /></label>
                    <input id="batch-review-major" className="input" value={fieldValue(draft.major)} onChange={(event) => updateActiveDraft({ major: event.target.value || null })} />
                  </div>
                  <div className={`field ${needsAiReview(draft, "yearsOfExperience") ? "field-attention" : ""}`}>
                    <label htmlFor="batch-review-years"><AiReviewLabel label="工作年限" show={needsAiReview(draft, "yearsOfExperience")} /></label>
                    <input id="batch-review-years" type="number" min={0} max={50} className="input" value={draft.yearsOfExperience ?? ""} onChange={(event) => updateActiveDraft({ yearsOfExperience: event.target.value ? Number(event.target.value) : null })} />
                  </div>
                  <div className={`field ${needsAiReview(draft, "status") ? "field-attention" : ""}`}>
                    <label htmlFor="batch-review-status"><AiReviewLabel label="招聘阶段" show={needsAiReview(draft, "status")} /></label>
                    <select id="batch-review-status" className="select" value={draft.status} onChange={(event) => updateActiveDraft({ status: event.target.value as CandidateStatus })}>
                      {STATUS_ORDER.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
                    </select>
                  </div>
                  <div className={`field full ${needsAiReview(draft, "skills") ? "field-attention" : ""}`}>
                    <label htmlFor="batch-review-skills"><AiReviewLabel label="技能" show={needsAiReview(draft, "skills")} /></label>
                    <input id="batch-review-skills" className="input" value={draft.skills.join("、")} onChange={(event) => updateActiveDraft({ skills: splitTextList(event.target.value) })} />
                  </div>
                  <div className={`field full ${needsAiReview(draft, "tags") ? "field-attention" : ""}`}>
                    <label htmlFor="batch-review-tags"><AiReviewLabel label="候选人标签" show={needsAiReview(draft, "tags")} /></label>
                    <input id="batch-review-tags" className="input" value={draft.tags.join("、")} onChange={(event) => updateActiveDraft({ tags: splitTextList(event.target.value) })} />
                  </div>
                  <div className={`field ${needsAiReview(draft, "source") ? "field-attention" : ""}`}>
                    <label htmlFor="batch-review-source"><AiReviewLabel label="来源" show={needsAiReview(draft, "source")} /></label>
                    <input id="batch-review-source" className="input" value={fieldValue(draft.source)} onChange={(event) => updateActiveDraft({ source: event.target.value || null })} />
                  </div>
                  <div className="field">
                    <label htmlFor="batch-review-scene">输入场景</label>
                    <select id="batch-review-scene" className="select" value={draft.inputScene} onChange={(event) => updateActiveDraft({ inputScene: event.target.value as InputScene })}>
                      {Object.entries(INPUT_SCENE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </div>
                  <div className={`field full ${needsAiReview(draft, "remark") ? "field-attention" : ""}`}>
                    <label htmlFor="batch-review-remark"><AiReviewLabel label="Agent 备注" show={needsAiReview(draft, "remark")} /></label>
                    <textarea id="batch-review-remark" className="textarea textarea-compact" value={fieldValue(draft.remark)} onChange={(event) => updateActiveDraft({ remark: event.target.value || null })} />
                  </div>
                  <div className={`field full ${needsAiReview(draft, "followUpSuggestion") ? "field-attention" : ""}`}>
                    <label htmlFor="batch-review-followup"><AiReviewLabel label="AI 跟进建议" show={needsAiReview(draft, "followUpSuggestion")} /></label>
                    <textarea id="batch-review-followup" className="textarea textarea-compact" value={fieldValue(draft.followUpSuggestion)} onChange={(event) => updateActiveDraft({ followUpSuggestion: event.target.value || null })} />
                  </div>
                </div>

                {activeItem.result.customFieldDefinitions.length ? (
                  <section className="batch-custom-fields">
                    <div className="section-headline">
                      <div>
                        <h4>岗位自定义字段</h4>
                        <p>以下内容将写入该岗位的招聘进度表。</p>
                      </div>
                      <span className="pill slate">{activeItem.result.customFieldDefinitions.length} 项</span>
                    </div>
                    <div className="batch-review-form">
                      {activeItem.result.customFieldDefinitions.map((field) => {
                        const value = draft.customFields[field.key] ?? "";
                        const options = Array.isArray(field.options) ? field.options.map(String) : [];
                        return (
                          <div
                            className={`field ${field.fieldType === "LONG_TEXT" ? "full" : ""} ${
                              needsAiReview(draft, field.key, field.label) ? "field-attention" : ""
                            }`}
                            key={field.key}
                          >
                            <label htmlFor={`batch-custom-${field.key}`}>
                              <AiReviewLabel
                                label={`${field.label}${field.required ? " *" : ""}`}
                                show={needsAiReview(draft, field.key, field.label)}
                              />
                            </label>
                            {field.fieldType === "SINGLE_SELECT" ? (
                              <select id={`batch-custom-${field.key}`} className="select" value={String(value)} onChange={(event) => updateCustomField(field.key, event.target.value)}>
                                <option value="">未填写</option>
                                {options.map((option) => <option key={option} value={option}>{option}</option>)}
                              </select>
                            ) : field.fieldType === "LONG_TEXT" ? (
                              <textarea id={`batch-custom-${field.key}`} className="textarea textarea-compact" value={String(value)} onChange={(event) => updateCustomField(field.key, event.target.value)} />
                            ) : (
                              <input
                                id={`batch-custom-${field.key}`}
                                className="input"
                                type={field.fieldType === "NUMBER" || field.fieldType === "MONEY" ? "number" : field.fieldType === "DATE" ? "date" : field.fieldType === "DATETIME" ? "datetime-local" : "text"}
                                value={Array.isArray(value) ? value.join(", ") : String(value)}
                                onChange={(event) => updateCustomField(field.key, event.target.value)}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ) : null}

                <div className="batch-review-action-bar">
                  <div>
                    <strong>{activeItem.status === "confirmed" ? "此记录已确认" : "确认后才会进入批量入库"}</strong>
                    <span>修改已确认记录会自动退回待确认状态。</span>
                  </div>
                  <div className="inline-actions">
                    <button className="btn-ghost danger-text" type="button" onClick={excludeActiveItem}>排除本次入库</button>
                    <button
                      className={allConfirmationsComplete ? "btn completion-button" : "btn"}
                      type="button"
                      onClick={confirmActiveItem}
                      disabled={
                        allConfirmationsComplete ||
                        (activeItem.status === "confirmed" &&
                          counts.review === 0 &&
                          counts.pending + counts.parsing > 0)
                      }
                    >
                      {allConfirmationsComplete
                        ? "全部确认完成 ✓"
                        : activeItem.status === "confirmed" &&
                            counts.review === 0 &&
                            counts.pending + counts.parsing > 0
                          ? `还有 ${counts.pending + counts.parsing} 份待解析`
                        : activeItem.status === "confirmed"
                          ? counts.review
                            ? "继续确认下一份"
                            : "重新确认"
                          : "确认并查看下一份"}
                    </button>
                  </div>
                </div>
              </>
            ) : activeItem.status === "excluded" ? (
              <div className="batch-review-empty">
                <strong>已排除本次入库</strong>
                <p>{activeItem.file.name}</p>
                <button className="btn-secondary" type="button" onClick={() => patchItem(activeItem.id, { status: "review" })}>恢复审核</button>
              </div>
            ) : activeItem.status === "saved" && activeItem.candidateId ? (
              <div className="batch-review-empty success">
                <strong>候选人已成功入库</strong>
                <p>{activeItem.reviewedDraft?.name}</p>
                <Link className="btn" href={`/candidates/${activeItem.candidateId}`}>查看候选人详情</Link>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {items.length ? (
        <div className="batch-commit-bar">
          <div>
            <strong>
              {allConfirmationsComplete
                ? "全部待确认简历已确认完成"
                : `已确认 ${counts.confirmed} 份`}
            </strong>
            <span>
              {allConfirmationsComplete
                ? "如继续加入新简历，状态会自动恢复为待处理。"
                : counts.review
                ? `还有 ${counts.review} 份待人工确认，未确认记录不会入库。`
                : counts.pending || counts.parsing
                  ? `还有 ${counts.pending + counts.parsing} 份简历等待解析或处理中。`
                  : "所有可处理记录均已完成审核。"}
            </span>
          </div>
          <button
            className="btn"
            type="button"
            onClick={saveConfirmed}
            disabled={!counts.confirmed || isBatchRunning || isBatchSaving}
          >
            {isBatchSaving ? "正在批量入库…" : `批量入库已确认记录（${counts.confirmed}）`}
          </button>
        </div>
      ) : null}
    </div>
  );
}
