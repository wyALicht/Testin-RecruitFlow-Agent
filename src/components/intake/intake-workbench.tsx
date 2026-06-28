"use client";

import { CandidateStatus, RawInputType } from "@prisma/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import type { IntakeDepartment, IntakePosition } from "@/components/intake/intake-types";
import { AI_PROVIDER_OPTIONS, type AIProviderOptionValue } from "@/lib/ai/options";
import { authFetch } from "@/lib/auth/client-session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { INPUT_SCENE_LABELS, INPUT_TYPE_LABELS, STATUS_LABELS, STATUS_ORDER } from "@/lib/constants";

type InputScene = keyof typeof INPUT_SCENE_LABELS;

type ExtractResponse = {
  rawInputId: string;
  providerName: string;
  positionContext: {
    positionId: string | null;
    positionTitle: string | null;
    jobDescriptionUsed: boolean;
  };
  draft: {
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
  duplicate: {
    candidateId: string;
    candidateName: string;
    reasons: string[];
    score: number;
    positionTitle: string | null;
    status: CandidateStatus;
  } | null;
  customFieldDefinitions: Array<{
    key: string;
    label: string;
    fieldType: string;
    required: boolean;
    options: unknown;
  }>;
  parsedText?: string;
  file?: {
    name: string;
    mimeType: string;
    size: number;
    inputTypeHint: RawInputType;
    inputSceneHint?: InputScene;
    inputSceneLabel?: string;
  };
};

type DraftState = {
  name: string;
  phone: string;
  email: string;
  school: string;
  education: string;
  major: string;
  yearsOfExperience: string;
  skills: string;
  status: CandidateStatus;
  source: string;
  remark: string;
  confidence: number;
  uncertainFields: string[];
  positionTitle: string;
  inputType: RawInputType;
  inputScene: InputScene;
  tags: string;
  followUpSuggestion: string;
  customFields: Record<string, unknown>;
};

type CandidatePreview = {
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
  position: {
    title: string;
  } | null;
  tags?: string[];
  followUpSuggestion?: string | null;
};

type SaveMode = "merge" | "create";

const initialDraft: DraftState = {
  name: "",
  phone: "",
  email: "",
  school: "",
  education: "",
  major: "",
  yearsOfExperience: "",
  skills: "",
  status: CandidateStatus.RECOMMENDED,
  source: "",
  remark: "",
  confidence: 0,
  uncertainFields: [],
  positionTitle: "",
  inputType: RawInputType.OTHER,
  inputScene: "OTHER",
  tags: "",
  followUpSuggestion: "",
  customFields: {}
};

const fieldLabels: Record<
  keyof Pick<
    DraftState,
    | "name"
    | "phone"
    | "email"
    | "school"
    | "education"
    | "major"
    | "yearsOfExperience"
    | "skills"
    | "status"
    | "source"
    | "remark"
    | "positionTitle"
    | "tags"
    | "followUpSuggestion"
  >,
  string
> = {
  name: "姓名",
  phone: "手机号",
  email: "邮箱",
  school: "学校",
  education: "最高学历",
  major: "专业",
  yearsOfExperience: "工作年限",
  skills: "技能标签",
  status: "当前状态",
  source: "来源",
  remark: "Agent 备注",
  positionTitle: "应聘岗位",
  tags: "候选人标签",
  followUpSuggestion: "AI 跟进建议"
};

const uncertainFieldNameMap: Record<string, keyof DraftState | undefined> = {
  "姓名": "name",
  "联系方式": "phone",
  "手机号": "phone",
  "邮箱": "email",
  "学校": "school",
  "学历": "education",
  "最高学历": "education",
  "专业": "major",
  "工作年限": "yearsOfExperience",
  "技能标签": "skills",
  "技能": "skills",
  "应聘岗位": "positionTitle",
  "目标岗位": "positionTitle",
  "招聘阶段": "status",
  "当前状态": "status",
  "来源": "source",
  "候选人标签": "tags",
  "Agent备注": "remark",
  "Agent 备注": "remark",
  "AI跟进建议": "followUpSuggestion",
  "AI 跟进建议": "followUpSuggestion"
};

function AiReviewLabel({ label, show }: { label: string; show: boolean }) {
  return (
    <>
      {label}
      {show ? <span className="ai-review-badge">AI 待确认</span> : null}
    </>
  );
}

function splitTextList(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[銆侊紝,\n]/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

function compareStatusProgress(status: CandidateStatus) {
  return STATUS_ORDER.indexOf(status);
}

function formatFieldValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "未提供";
  }

  return String(value);
}

function formatSkills(value: string | string[]) {
  const list = Array.isArray(value) ? value : splitTextList(value);
  return list.length ? list.join("、") : "未提供";
}

function formatTags(value: string | string[]) {
  const list = Array.isArray(value) ? value : splitTextList(value);
  return list.length ? list.join("、") : "未生成";
}

function buildMergePreview(existing: CandidatePreview, draft: DraftState) {
  const mergedSkills = Array.from(new Set([...existing.skills, ...splitTextList(draft.skills)]));
  const mergedTags = Array.from(new Set([...(existing.tags ?? []), ...splitTextList(draft.tags)]));

  return {
    name: existing.name || draft.name,
    phone: existing.phone || draft.phone || "",
    email: existing.email || draft.email || "",
    school: existing.school || draft.school || "",
    education: existing.education || draft.education || "",
    major: existing.major || draft.major || "",
    yearsOfExperience:
      existing.yearsOfExperience !== null && existing.yearsOfExperience !== undefined
        ? String(existing.yearsOfExperience)
        : draft.yearsOfExperience,
    skills: mergedSkills.join("、"),
    status:
      compareStatusProgress(draft.status) > compareStatusProgress(existing.status) ? draft.status : existing.status,
    source: existing.source || draft.source || "",
    remark: [existing.remark, draft.remark].filter(Boolean).join(" "),
    confidence: Math.max(existing.confidence ?? 0, draft.confidence),
    positionTitle: existing.position?.title || draft.positionTitle || "",
    tags: mergedTags.join("、"),
    followUpSuggestion: draft.followUpSuggestion || existing.followUpSuggestion || ""
  };
}

export function IntakeWorkbench({
  departments,
  positions,
  initialPositionId = ""
}: {
  departments: IntakeDepartment[];
  positions: IntakePosition[];
  initialPositionId?: string;
}) {
  const initialPosition = positions.find((position) => position.id === initialPositionId);
  const router = useRouter();
  const { can } = useAuth();
  const canManagePositionPresets = can(PERMISSIONS.POSITION_MANAGE);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const resultPanelRef = useRef<HTMLElement | null>(null);
  const [content, setContent] = useState("");
  const [draft, setDraft] = useState(initialDraft);
  const [rawInputId, setRawInputId] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<ExtractResponse["duplicate"]>(null);
  const [duplicateCandidate, setDuplicateCandidate] = useState<CandidatePreview | null>(null);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);
  const [saveMode, setSaveMode] = useState<SaveMode | null>(null);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successLink, setSuccessLink] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedFileMeta, setParsedFileMeta] = useState<ExtractResponse["file"] | null>(null);
  const [providerName, setProviderName] = useState<string | null>(null);
  const [positionContext, setPositionContext] = useState<ExtractResponse["positionContext"] | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<AIProviderOptionValue>("qwen");
  const [selectedDepartmentId, setSelectedDepartmentId] = useState(initialPosition?.departmentId ?? "");
  const [targetPositionId, setTargetPositionId] = useState(initialPositionId);
  const [customFieldDefinitions, setCustomFieldDefinitions] = useState<ExtractResponse["customFieldDefinitions"]>([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const [isAnalyzing, startAnalyze] = useTransition();
  const [isSaving, startSave] = useTransition();
  const [isParsingFile, startFileParse] = useTransition();
  const [isLoadingDuplicate, startDuplicateLoad] = useTransition();

  useEffect(() => {
    if (!duplicate?.candidateId) {
      setDuplicateCandidate(null);
      setDuplicateError(null);
      return;
    }

    startDuplicateLoad(async () => {
      try {
        setDuplicateError(null);
        const response = await authFetch(`/api/candidates/${duplicate.candidateId}`);
        const payload = (await response.json()) as CandidatePreview & { error?: string };

        if (!response.ok) {
          setDuplicateCandidate(null);
          setDuplicateError(payload.error || "閲嶅鍊欓€変汉璇︽儏鍔犺浇澶辫触");
          return;
        }

        setDuplicateCandidate({
          ...payload,
          tags: payload.tags ?? [],
          followUpSuggestion: payload.followUpSuggestion ?? null
        });
      } catch (requestError) {
        setDuplicateCandidate(null);
        setDuplicateError(requestError instanceof Error ? requestError.message : "閲嶅鍊欓€変汉璇︽儏鍔犺浇澶辫触");
      }
    });
  }, [duplicate?.candidateId]);

  useEffect(() => {
    if (!rawInputId) {
      return;
    }

    resultPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [rawInputId]);

  function updateField<K extends keyof DraftState>(field: K, value: DraftState[K]) {
    setReviewConfirmed(false);
    setDraft((current) => ({
      ...current,
      [field]: value
    }));
  }

  function clearExtractionForPresetChange() {
    if (!rawInputId) return;
    setDraft(initialDraft);
    setRawInputId(null);
    setDuplicate(null);
    setDuplicateCandidate(null);
    setDuplicateError(null);
    setSaveMode(null);
    setReviewConfirmed(false);
    setError(null);
    setSuccessLink(null);
    setParsedFileMeta(null);
    setProviderName(null);
    setPositionContext(null);
    setCustomFieldDefinitions([]);
  }

  function resetWorkbench() {
    setContent("");
    setDraft(initialDraft);
    setRawInputId(null);
    setDuplicate(null);
    setDuplicateCandidate(null);
    setDuplicateError(null);
    setSaveMode(null);
    setReviewConfirmed(false);
    setError(null);
    setSuccessLink(null);
    setSelectedFile(null);
    setParsedFileMeta(null);
    setProviderName(null);
    setSelectedProvider("qwen");
    setSelectedDepartmentId(initialPosition?.departmentId ?? "");
    setTargetPositionId(initialPositionId);
    setCustomFieldDefinitions([]);
    setIsDragActive(false);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function formatFileSize(size: number) {
    if (size < 1024) {
      return `${size} B`;
    }

    if (size < 1024 * 1024) {
      return `${(size / 1024).toFixed(1)} KB`;
    }

    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  function fieldNeedsAttention(field: keyof DraftState) {
    return draft.uncertainFields.some((uncertainField) => uncertainFieldNameMap[uncertainField] === field);
  }

  function applyExtractionPayload(payload: ExtractResponse) {
    setRawInputId(payload.rawInputId);
    setDuplicate(payload.duplicate);
    setDuplicateCandidate(null);
    setDuplicateError(null);
    setSaveMode(payload.duplicate ? null : "create");
    setReviewConfirmed(false);
    setProviderName(payload.providerName);
    setPositionContext(payload.positionContext ?? null);
    setCustomFieldDefinitions(payload.customFieldDefinitions ?? []);
    setParsedFileMeta(payload.file ?? null);
    if (payload.parsedText) {
      setContent(payload.parsedText);
    }
    setDraft({
      ...payload.draft,
      phone: payload.draft.phone ?? "",
      email: payload.draft.email ?? "",
      school: payload.draft.school ?? "",
      education: payload.draft.education ?? "",
      major: payload.draft.major ?? "",
      yearsOfExperience: payload.draft.yearsOfExperience?.toString() ?? "",
      skills: payload.draft.skills.join("、"),
      source: payload.draft.source ?? "",
      remark: payload.draft.remark ?? "",
      positionTitle: payload.draft.positionTitle ?? "",
      tags: payload.draft.tags.join("、"),
      followUpSuggestion: payload.draft.followUpSuggestion ?? ""
      ,
      customFields: payload.draft.customFields ?? {}
    });
  }

  function assignFile(file: File | null) {
    setSelectedFile(file);
    setError(null);
    if (!file) {
      setParsedFileMeta(null);
    }
  }

  async function handleAnalyze() {
    if (!selectedDepartmentId || !targetPositionId) {
      setError("请先选择部门，再选择该部门下由管理员预设的目标岗位");
      return;
    }
    setError(null);
    setSuccessLink(null);
    setParsedFileMeta(null);

    startAnalyze(async () => {
      try {
        const response = await authFetch("/api/agent/extract", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            content,
            provider: selectedProvider,
            departmentId: selectedDepartmentId || undefined,
            positionId: targetPositionId || undefined
          })
        });

        const payload = (await response.json()) as ExtractResponse & { error?: string };
        if (!response.ok) {
          setError(payload.error || "鏂囨湰鍒嗘瀽澶辫触");
          return;
        }

        applyExtractionPayload(payload);
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "鏂囨湰鍒嗘瀽澶辫触");
      }
    });
  }

  async function handleFileAnalyze(file = selectedFile) {
    if (!file) {
      setError("请先选择或拖入文件");
      return;
    }
    if (!selectedDepartmentId || !targetPositionId) {
      setError("请先选择部门，再选择该部门下由管理员预设的目标岗位");
      return;
    }

    setError(null);
    setSuccessLink(null);

    startFileParse(async () => {
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("provider", selectedProvider);
        if (selectedDepartmentId) {
          formData.append("departmentId", selectedDepartmentId);
        }
        if (targetPositionId) {
          formData.append("positionId", targetPositionId);
        }

        const response = await authFetch("/api/agent/extract-file", {
          method: "POST",
          body: formData
        });

        const payload = (await response.json()) as ExtractResponse & { error?: string };
        if (!response.ok) {
          setError(payload.error || "鏂囦欢瑙ｆ瀽澶辫触");
          return;
        }

        applyExtractionPayload(payload);
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "鏂囦欢瑙ｆ瀽澶辫触");
      }
    });
  }

  async function handleSave() {
    setError(null);
    setSuccessLink(null);

    startSave(async () => {
      try {
        const response = await authFetch("/api/candidates", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            ...draft,
            yearsOfExperience: draft.yearsOfExperience ? Number(draft.yearsOfExperience) : null,
            rawInputId,
            duplicateMatchId: saveMode === "merge" ? duplicate?.candidateId ?? null : null,
            tags: splitTextList(draft.tags),
            customFields: draft.customFields,
            targetPositionId: targetPositionId || null
          })
        });

        const payload = await response.json();
        if (!response.ok) {
          setError(payload.error || "淇濆瓨澶辫触");
          return;
        }

        const link = `/candidates/${payload.candidate.id}`;
        setSuccessLink(link);
        router.refresh();
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "淇濆瓨澶辫触");
      }
    });
  }

  const mergePreview = duplicateCandidate ? buildMergePreview(duplicateCandidate, draft) : null;
  const providerHint = AI_PROVIDER_OPTIONS.find((option) => option.value === selectedProvider)?.hint;
  const filteredPositions = selectedDepartmentId
    ? positions.filter((position) => position.departmentId === selectedDepartmentId)
    : [];
  const selectedPosition = positions.find((position) => position.id === targetPositionId);
  const selectedDepartmentName =
    selectedPosition?.departmentName ??
    departments.find((department) => department.id === selectedDepartmentId)?.name ??
    "";
  const saveLabel =
    duplicate && !saveMode
      ? "璇峰厛閫夋嫨淇濆瓨绛栫暐"
      : saveMode === "merge" && duplicate
        ? isSaving
          ? "鍚堝苟涓?.."
          : "确认合并并保存"
        : isSaving
          ? "淇濆瓨涓?.."
          : "纭鍒涘缓鍊欓€変汉";

  return (
    <div className="grid">
      <section className="card">
        <div className="page-header" style={{ marginBottom: 18 }}>
          <div>
            <h3>褰曞叆娴佺▼</h3>
            <p>先解析原始内容，再复核字段、处理疑似重复，最后确认入库。</p>
          </div>
        </div>

        <div className="stepper">
          <div className={`step-item ${content.trim() ? "done" : "active"}`}>
            <span>1</span>
            <div>
              <strong>瑙ｆ瀽鍘熸枃</strong>
              <p>粘贴文本或上传文件</p>
            </div>
          </div>
          <div className={`step-item ${rawInputId ? "done" : ""}`}>
            <span>2</span>
            <div>
              <strong>澶嶆牳瀛楁</strong>
              <p>检查标签、场景和待确认字段</p>
            </div>
          </div>
          <div className={`step-item ${duplicate ? "active" : rawInputId ? "done" : ""}`}>
            <span>3</span>
            <div>
              <strong>澶勭悊閲嶅</strong>
              <p>纭鍚堝苟杩樻槸鏂板缓</p>
            </div>
          </div>
          <div className={`step-item ${successLink ? "done" : ""}`}>
            <span>4</span>
            <div>
              <strong>淇濆瓨鍏ュ簱</strong>
              <p>确认后写入候选人库</p>
            </div>
          </div>
        </div>

        <div className="page-note" style={{ marginTop: 16 }}>
          寤鸿涓€娆″彧澶勭悊鍗曚釜鍊欓€変汉鐨勫畬鏁翠笂涓嬫枃銆傜粨鏋滃嚭鏉ュ悗锛屼紭鍏堟鏌ヨ緭鍏ュ満鏅€丄I 鏍囩鍜岄粍鑹查珮浜瓧娈点€?        </div>
      </section>

      <div className="split-layout">
        <section className="card">
          <div className="page-header" style={{ marginBottom: 18 }}>
            <div>
              <h3>鍘熷鍐呭杈撳叆</h3>
              <p>支持粘贴文本，或拖入 / 选择 PDF、DOCX、TXT、MD、JSON 文件。</p>
            </div>
            <div className="page-actions">
              <button className="btn-secondary" type="button" onClick={resetWorkbench}>
                閲嶇疆鏈褰曞叆
              </button>
              <button
                className="btn"
                onClick={handleAnalyze}
                disabled={isAnalyzing || !content.trim() || !selectedDepartmentId || !targetPositionId}
              >
                {isAnalyzing ? "鍒嗘瀽涓?.." : "鍒嗘瀽鏂囨湰"}
              </button>
            </div>
          </div>

          <div className="field" style={{ marginBottom: 16 }}>
            <label>选择大模型</label>
            <div className="choice-group provider-choice-group">
              {AI_PROVIDER_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`choice-pill provider-choice-pill ${selectedProvider === option.value ? "active" : ""}`}
                  onClick={() => setSelectedProvider(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="page-note provider-note">
              当前选择：<strong>{AI_PROVIDER_OPTIONS.find((option) => option.value === selectedProvider)?.label}</strong>
              <span className="muted" style={{ marginLeft: 8 }}>{providerHint}</span>
            </div>
          </div>

          <div className="intake-position-fields">
            <div className="field">
              <label htmlFor="target-department">閮ㄩ棬 *</label>
              <select
                id="target-department"
                className="select"
                value={selectedDepartmentId}
                onChange={(event) => {
                  const nextDepartmentId = event.target.value;
                  clearExtractionForPresetChange();
                  setSelectedDepartmentId(nextDepartmentId);
                  if (
                    !positions.some(
                      (position) =>
                        position.id === targetPositionId &&
                        position.departmentId === nextDepartmentId
                    )
                  ) {
                    setTargetPositionId("");
                  }
                }}
              >
                <option value="">璇峰厛閫夋嫨閮ㄩ棬</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
            <label htmlFor="target-position">鐩爣宀椾綅 *</label>
            <select
              id="target-position"
              className="select"
              value={targetPositionId}
              disabled={!selectedDepartmentId}
              onChange={(event) => {
                clearExtractionForPresetChange();
                setTargetPositionId(event.target.value);
                const selected = positions.find((position) => position.id === event.target.value);
                if (selected) {
                  setSelectedDepartmentId(selected.departmentId ?? "");
                  updateField("positionTitle", selected.title);
                }
              }}
            >
              <option value="">
                {selectedDepartmentId ? "请选择该部门下的岗位" : "请先选择部门"}
              </option>
              {filteredPositions.map((position) => (
                <option key={position.id} value={position.id}>
                  {position.title}
                </option>
              ))}
            </select>
            </div>
          </div>
          <div className="page-note provider-note" style={{ marginBottom: 16 }}>
            部门与岗位由管理员提前绑定。请选择部门后再选择岗位，AI 将参考对应岗位 JD，并读取岗位中标记为 AI 自动提取的字段。
            {canManagePositionPresets ? (
              <Link href="/positions" className="inline-admin-link">管理部门与岗位预设</Link>
            ) : null}
            {selectedPosition && selectedDepartmentName ? (
              <span className="intake-binding-preview">
                当前预设：{selectedDepartmentName} / {selectedPosition.title}
              </span>
            ) : null}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt,.md,.json"
            style={{ display: "none" }}
            onChange={(event) => assignFile(event.target.files?.[0] ?? null)}
          />

          <div
            className={`dropzone ${isDragActive ? "active" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragActive(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setIsDragActive(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragActive(false);
              assignFile(event.dataTransfer.files?.[0] ?? null);
            }}
          >
            <strong>鎷栨嫿鏂囦欢鍒拌繖閲岋紝鎴栫洿鎺ラ€夋嫨鏂囦欢</strong>
            <p className="muted" style={{ margin: "8px 0 12px" }}>
              支持 PDF、DOCX、TXT、MD、JSON，单文件不超过 8MB。
            </p>
            <div className="inline-actions" style={{ justifyContent: "center" }}>
              <button className="btn-secondary" type="button" onClick={() => fileInputRef.current?.click()}>
                閫夋嫨鏂囦欢
              </button>
              <button
                className="btn"
                type="button"
                onClick={() => handleFileAnalyze()}
                disabled={isParsingFile || !selectedFile || !selectedDepartmentId || !targetPositionId}
              >
                {isParsingFile ? "瑙ｆ瀽涓?.." : "鏂囦欢瑙ｆ瀽 + AI 鍒嗘瀽"}
              </button>
              {selectedFile ? (
                <button className="btn-ghost" type="button" onClick={() => assignFile(null)}>
                  娓呯┖鏂囦欢
                </button>
              ) : null}
            </div>
          </div>

          {selectedFile ? (
            <div className="file-meta">
              <strong>{selectedFile.name}</strong>
              <span>{formatFileSize(selectedFile.size)}</span>
              <span>{selectedFile.type || "鏈煡绫诲瀷"}</span>
            </div>
          ) : null}

          {parsedFileMeta ? (
            <div className="alert info" style={{ marginBottom: 14 }}>
              宸茶В鏋愭枃浠讹細{parsedFileMeta.name}锛屽ぇ灏?{formatFileSize(parsedFileMeta.size)}锛?              褰撳墠鎶藉彇鐢?<strong>{providerName}</strong> 瀹屾垚
              {parsedFileMeta.inputSceneLabel ? `，场景识别为 ${parsedFileMeta.inputSceneLabel}` : ""}。
            </div>
          ) : null}

          <textarea
            className="textarea"
            placeholder="例如：姓名、电话、邮箱、学校、技能、岗位、面试反馈、Offer 回复等内容，或者先通过上方文件上传自动填充。"
            value={content}
            onChange={(event) => setContent(event.target.value)}
          />

          <div className="input-toolbar" style={{ marginTop: 14 }}>
            <div className="stats-inline">
              <span>已输入 {content.length} 字</span>
              <span>寤鸿涓€娆″彧澶勭悊鍗曚釜鍊欓€変汉鐨勫畬鏁翠笂涓嬫枃</span>
            </div>
            {content ? (
              <button className="btn-ghost" type="button" onClick={() => setContent("")}>
                娓呯┖鏂囨湰
              </button>
            ) : null}
          </div>
        </section>

        <section className="card" ref={resultPanelRef}>
          <div className="page-header" style={{ marginBottom: 18 }}>
            <div>
              <h3>AI 结果确认页</h3>
              <p>
                {rawInputId
                  ? `杈撳叆绫诲瀷锛?{INPUT_TYPE_LABELS[draft.inputType]}锛岃緭鍏ュ満鏅細${INPUT_SCENE_LABELS[draft.inputScene]}锛屽綋鍓嶇疆淇″害 ${(draft.confidence * 100).toFixed(0)}%`
                  : "先执行文本分析，或先上传文件解析，再检查并保存候选人。"}
              </p>
            </div>
            <button
              className="btn-secondary"
              onClick={handleSave}
              disabled={
                isSaving ||
                !rawInputId ||
                !draft.name ||
                !reviewConfirmed ||
                (duplicate ? !saveMode || (saveMode === "merge" && !duplicateCandidate && isLoadingDuplicate) : false)
              }
            >
              {saveLabel}
            </button>
          </div>

          <div className="grid cols-4 compact-grid" style={{ marginBottom: 16 }}>
            <div className="summary-card">
              <span className="summary-label">褰撳墠妯″瀷</span>
              <strong>{providerName ?? "待分析"}</strong>
            </div>
            <div className="summary-card">
              <span className="summary-label">杈撳叆鍦烘櫙</span>
              <strong>{INPUT_SCENE_LABELS[draft.inputScene]}</strong>
            </div>
            <div className="summary-card">
              <span className="summary-label">待确认字段</span>
              <strong>{draft.uncertainFields.length} 项</strong>
            </div>
            <div className="summary-card">
              <span className="summary-label">淇濆瓨绛栫暐</span>
              <strong>
                {duplicate
                  ? saveMode === "merge"
                    ? "鍚堝苟鐜版湁鍊欓€変汉"
                    : saveMode === "create"
                      ? "浠嶅垱寤烘柊鍊欓€変汉"
                      : "寰呴€夋嫨"
                  : "鍒涘缓鏂板€欓€変汉"}
              </strong>
            </div>
          </div>

          {rawInputId && positionContext?.positionId ? (
            <div className={`alert ${positionContext.jobDescriptionUsed ? "info" : "warning"}`}>
              {positionContext.jobDescriptionUsed
                ? `本次已参考“${positionContext.positionTitle}”的岗位 JD 生成 Agent 备注和 AI 跟进建议。`
                : `“${positionContext.positionTitle}”暂未设置岗位 JD，本次备注和建议仅依据候选人材料生成。`}
            </div>
          ) : null}

          {duplicate ? (
            <div className="alert danger" style={{ marginBottom: 14 }}>
              检测到疑似重复候选人：{duplicate.candidateName}
              {duplicate.positionTitle ? ` / ${duplicate.positionTitle}` : ""}，当前阶段为 {STATUS_LABELS[duplicate.status]}，重复置信度 {(duplicate.score * 100).toFixed(0)}%。依据：{duplicate.reasons.join("、")}。
            </div>
          ) : null}

          {draft.uncertainFields.length ? (
            <div className="alert warning" style={{ marginBottom: 14 }}>
              待人工确认字段：{draft.uncertainFields.join("、")}。建议优先检查高亮字段。
            </div>
          ) : null}

          {duplicateError ? (
            <div className="alert warning" style={{ marginBottom: 14 }}>
              {duplicateError}
            </div>
          ) : null}

          {error ? (
            <div className="alert danger" style={{ marginBottom: 14 }}>
              {error}
            </div>
          ) : null}

          {successLink ? (
            <div className="alert info" style={{ marginBottom: 14 }}>
              鍊欓€変汉宸蹭繚瀛樻垚鍔熴€?              <Link href={successLink} style={{ textDecoration: "underline", marginLeft: 8 }}>
                鎵撳紑鍊欓€変汉璇︽儏
              </Link>
            </div>
          ) : null}

          <div className="form-grid">
            <div className={`field ${fieldNeedsAttention("name") ? "field-attention" : ""}`}>
              <label><AiReviewLabel label={fieldLabels.name} show={fieldNeedsAttention("name")} /></label>
              <input className="input" value={draft.name} onChange={(event) => updateField("name", event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="result-department">閮ㄩ棬</label>
              <input
                id="result-department"
                className="input result-binding-input"
                value={selectedDepartmentName || "未绑定部门"}
                readOnly
                aria-readonly="true"
              />
              <span className="field-helper">
                閮ㄩ棬鐢辩洰鏍囧矖浣嶈嚜鍔ㄥ甫鍑恒€傚闇€淇敼锛岃鍦ㄥ乏渚ч噸鏂伴€夋嫨閮ㄩ棬鍜屽矖浣嶃€?              </span>
            </div>
            <div className={`field ${fieldNeedsAttention("positionTitle") ? "field-attention" : ""}`}>
              <label><AiReviewLabel label={fieldLabels.positionTitle} show={fieldNeedsAttention("positionTitle")} /></label>
              <input
                className="input"
                value={selectedPosition?.title ?? draft.positionTitle}
                onChange={(event) => updateField("positionTitle", event.target.value)}
                readOnly={Boolean(selectedPosition)}
              />
              {selectedPosition ? (
                <span className="field-helper">已绑定岗位，保存时以该岗位 ID 为准。</span>
              ) : null}
            </div>
            <div className={`field ${fieldNeedsAttention("phone") ? "field-attention" : ""}`}>
              <label><AiReviewLabel label={fieldLabels.phone} show={fieldNeedsAttention("phone")} /></label>
              <input className="input" value={draft.phone} onChange={(event) => updateField("phone", event.target.value)} />
            </div>
            <div className={`field ${fieldNeedsAttention("email") ? "field-attention" : ""}`}>
              <label><AiReviewLabel label={fieldLabels.email} show={fieldNeedsAttention("email")} /></label>
              <input className="input" value={draft.email} onChange={(event) => updateField("email", event.target.value)} />
            </div>
            <div className={`field ${fieldNeedsAttention("school") ? "field-attention" : ""}`}>
              <label><AiReviewLabel label={fieldLabels.school} show={fieldNeedsAttention("school")} /></label>
              <input className="input" value={draft.school} onChange={(event) => updateField("school", event.target.value)} />
            </div>
            <div className={`field ${fieldNeedsAttention("education") ? "field-attention" : ""}`}>
              <label><AiReviewLabel label={fieldLabels.education} show={fieldNeedsAttention("education")} /></label>
              <input
                className="input"
                value={draft.education}
                onChange={(event) => updateField("education", event.target.value)}
                placeholder="例如：本科、硕士"
              />
            </div>
            <div className={`field ${fieldNeedsAttention("major") ? "field-attention" : ""}`}>
              <label><AiReviewLabel label={fieldLabels.major} show={fieldNeedsAttention("major")} /></label>
              <input className="input" value={draft.major} onChange={(event) => updateField("major", event.target.value)} />
            </div>
            <div className={`field ${fieldNeedsAttention("yearsOfExperience") ? "field-attention" : ""}`}>
              <label><AiReviewLabel label={fieldLabels.yearsOfExperience} show={fieldNeedsAttention("yearsOfExperience")} /></label>
              <input
                className="input"
                value={draft.yearsOfExperience}
                onChange={(event) => updateField("yearsOfExperience", event.target.value)}
              />
            </div>
            <div className={`field ${fieldNeedsAttention("status") ? "field-attention" : ""}`}>
              <label><AiReviewLabel label={fieldLabels.status} show={fieldNeedsAttention("status")} /></label>
              <select
                className="select"
                value={draft.status}
                onChange={(event) => updateField("status", event.target.value as CandidateStatus)}
              >
                {STATUS_ORDER.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </div>
            <div className={`field full ${fieldNeedsAttention("skills") ? "field-attention" : ""}`}>
              <label><AiReviewLabel label={fieldLabels.skills} show={fieldNeedsAttention("skills")} /></label>
              <input className="input" value={draft.skills} onChange={(event) => updateField("skills", event.target.value)} />
            </div>
            <div className={`field full ${fieldNeedsAttention("tags") ? "field-attention" : ""}`}>
              <label><AiReviewLabel label={fieldLabels.tags} show={fieldNeedsAttention("tags")} /></label>
              <input className="input" value={draft.tags} onChange={(event) => updateField("tags", event.target.value)} />
            </div>
            <div className={`field ${fieldNeedsAttention("source") ? "field-attention" : ""}`}>
              <label><AiReviewLabel label={fieldLabels.source} show={fieldNeedsAttention("source")} /></label>
              <input className="input" value={draft.source} onChange={(event) => updateField("source", event.target.value)} />
            </div>
            <div className="field">
              <label>杈撳叆绫诲瀷</label>
              <select
                className="select"
                value={draft.inputType}
                onChange={(event) => updateField("inputType", event.target.value as RawInputType)}
              >
                {Object.entries(INPUT_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>杈撳叆鍦烘櫙</label>
              <select
                className="select"
                value={draft.inputScene}
                onChange={(event) => updateField("inputScene", event.target.value as InputScene)}
              >
                {Object.entries(INPUT_SCENE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className={`field full ${fieldNeedsAttention("followUpSuggestion") ? "field-attention" : ""}`}>
              <label><AiReviewLabel label={fieldLabels.followUpSuggestion} show={fieldNeedsAttention("followUpSuggestion")} /></label>
              <textarea
                className="textarea"
                value={draft.followUpSuggestion}
                onChange={(event) => updateField("followUpSuggestion", event.target.value)}
              />
            </div>
            <div className={`field full ${fieldNeedsAttention("remark") ? "field-attention" : ""}`}>
              <label><AiReviewLabel label={fieldLabels.remark} show={fieldNeedsAttention("remark")} /></label>
              <textarea className="textarea" value={draft.remark} onChange={(event) => updateField("remark", event.target.value)} />
            </div>
          </div>

          {customFieldDefinitions.length ? (
            <section className="dynamic-intake-fields">
              <div className="section-headline">
                <div>
                  <h4>岗位自定义字段</h4>
                  <p className="muted">以下字段来自目标岗位配置，保存后会自动写入该岗位招聘进度表。</p>
                </div>
                <span className="pill slate">{customFieldDefinitions.length} 个 AI 字段</span>
              </div>
              <div className="form-grid">
                {customFieldDefinitions.map((field) => {
                  const value = draft.customFields[field.key] ?? "";
                  const options = Array.isArray(field.options) ? field.options.map(String) : [];
                  const needsReview = draft.uncertainFields.some(
                    (item) => item === field.key || item === field.label
                  );
                  const updateCustomField = (nextValue: unknown) =>
                    updateField("customFields", {
                      ...draft.customFields,
                      [field.key]: nextValue
                    });

                  return (
                    <div
                      className={`field ${field.fieldType === "LONG_TEXT" ? "full" : ""} ${
                        needsReview ? "field-attention" : ""
                      }`}
                      key={field.key}
                    >
                      <label htmlFor={`custom-${field.key}`}>
                        <AiReviewLabel
                          label={`${field.label}${field.required ? " *" : ""}`}
                          show={needsReview}
                        />
                      </label>
                      {field.fieldType === "SINGLE_SELECT" ? (
                        <select
                          id={`custom-${field.key}`}
                          className="select"
                          value={String(value)}
                          onChange={(event) => updateCustomField(event.target.value)}
                          required={field.required}
                        >
                          <option value="">未填写</option>
                          {options.map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      ) : field.fieldType === "LONG_TEXT" ? (
                        <textarea
                          id={`custom-${field.key}`}
                          className="textarea textarea-compact"
                          value={String(value)}
                          onChange={(event) => updateCustomField(event.target.value)}
                          required={field.required}
                        />
                      ) : (
                        <input
                          id={`custom-${field.key}`}
                          className="input"
                          type={
                            field.fieldType === "NUMBER" || field.fieldType === "MONEY"
                              ? "number"
                              : field.fieldType === "DATE"
                                ? "date"
                                : field.fieldType === "DATETIME"
                                  ? "datetime-local"
                                  : field.fieldType === "LINK"
                                    ? "url"
                                    : "text"
                          }
                          value={Array.isArray(value) ? value.join(", ") : String(value)}
                          onChange={(event) => updateCustomField(event.target.value)}
                          required={field.required}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          <label className="review-check">
            <input type="checkbox" checked={reviewConfirmed} onChange={(event) => setReviewConfirmed(event.target.checked)} />
            <span>我已复核以上字段，确认可以入库</span>
          </label>
        </section>
      </div>

      {duplicate ? (
        <section className="card">
          <div className="page-header" style={{ marginBottom: 18 }}>
            <div>
              <h3>閲嶅鍊欓€変汉鍚堝苟棰勮</h3>
              <p>先看清现有候选人与本次 AI 抽取结果的差异，再决定合并或新建。</p>
            </div>
          </div>

          <div className="choice-group" style={{ marginBottom: 18 }}>
            <button
              type="button"
              className={`choice-pill ${saveMode === "merge" ? "active" : ""}`}
              onClick={() => {
                setSaveMode("merge");
                setReviewConfirmed(false);
              }}
            >
              鍚堝苟鍒扮幇鏈夊€欓€変汉
            </button>
            <button
              type="button"
              className={`choice-pill ${saveMode === "create" ? "active" : ""}`}
              onClick={() => {
                setSaveMode("create");
                setReviewConfirmed(false);
              }}
            >
              浠嶅垱寤烘柊鍊欓€変汉
            </button>
          </div>

          {saveMode === "merge" ? (
            <div className="alert info" style={{ marginBottom: 18 }}>
              已选择合并模式。保存时会把本次 AI 抽取结果合并进候选人“{duplicate.candidateName}”。
            </div>
          ) : null}

          {saveMode === "create" ? (
            <div className="alert warning" style={{ marginBottom: 18 }}>
              已选择新建模式。即使检测到疑似重复，也会按新的候选人记录保存。
            </div>
          ) : null}

          {!saveMode ? (
            <div className="alert warning" style={{ marginBottom: 18 }}>
              璇峰厛閫夋嫨鈥滃悎骞跺埌鐜版湁鍊欓€変汉鈥濇垨鈥滀粛鍒涘缓鏂板€欓€変汉鈥濓紝鍐嶇户缁繚瀛樸€?            </div>
          ) : null}

          {isLoadingDuplicate && !duplicateCandidate ? (
            <div className="empty-state">姝ｅ湪鍔犺浇閲嶅鍊欓€変汉璇︽儏...</div>
          ) : duplicateCandidate ? (
            <div className="grid cols-3">
              <div className="compare-card">
                <h4>鐜版湁鍊欓€変汉</h4>
                <div className="compare-row"><span>濮撳悕</span><strong>{formatFieldValue(duplicateCandidate.name)}</strong></div>
                <div className="compare-row"><span>宀椾綅</span><strong>{formatFieldValue(duplicateCandidate.position?.title)}</strong></div>
                <div className="compare-row"><span>手机号</span><strong>{formatFieldValue(duplicateCandidate.phone)}</strong></div>
                <div className="compare-row"><span>閭</span><strong>{formatFieldValue(duplicateCandidate.email)}</strong></div>
                <div className="compare-row"><span>瀛︽牎</span><strong>{formatFieldValue(duplicateCandidate.school)}</strong></div>
                <div className="compare-row"><span>涓撲笟</span><strong>{formatFieldValue(duplicateCandidate.major)}</strong></div>
                <div className="compare-row"><span>宸ヤ綔骞撮檺</span><strong>{formatFieldValue(duplicateCandidate.yearsOfExperience)}</strong></div>
                <div className="compare-row"><span>状态</span><strong>{STATUS_LABELS[duplicateCandidate.status]}</strong></div>
                <div className="compare-row"><span>技能</span><strong>{formatSkills(duplicateCandidate.skills)}</strong></div>
                <div className="compare-row"><span>鏍囩</span><strong>{formatTags(duplicateCandidate.tags ?? [])}</strong></div>
                <div className="compare-row"><span>璺熻繘寤鸿</span><strong>{formatFieldValue(duplicateCandidate.followUpSuggestion)}</strong></div>
              </div>

              <div className="compare-card">
                <h4>鏈 AI 鎶藉彇</h4>
                <div className="compare-row"><span>濮撳悕</span><strong>{formatFieldValue(draft.name)}</strong></div>
                <div className="compare-row"><span>宀椾綅</span><strong>{formatFieldValue(draft.positionTitle)}</strong></div>
                <div className="compare-row"><span>手机号</span><strong>{formatFieldValue(draft.phone)}</strong></div>
                <div className="compare-row"><span>閭</span><strong>{formatFieldValue(draft.email)}</strong></div>
                <div className="compare-row"><span>瀛︽牎</span><strong>{formatFieldValue(draft.school)}</strong></div>
                <div className="compare-row"><span>涓撲笟</span><strong>{formatFieldValue(draft.major)}</strong></div>
                <div className="compare-row"><span>宸ヤ綔骞撮檺</span><strong>{formatFieldValue(draft.yearsOfExperience)}</strong></div>
                <div className="compare-row"><span>状态</span><strong>{STATUS_LABELS[draft.status]}</strong></div>
                <div className="compare-row"><span>技能</span><strong>{formatSkills(draft.skills)}</strong></div>
                <div className="compare-row"><span>鏍囩</span><strong>{formatTags(draft.tags)}</strong></div>
                <div className="compare-row"><span>璺熻繘寤鸿</span><strong>{formatFieldValue(draft.followUpSuggestion)}</strong></div>
              </div>

              <div className="compare-card highlight">
                <h4>{saveMode === "merge" ? "合并后结果预览" : saveMode === "create" ? "新建候选人预览" : "待选择保存策略"}</h4>
                <div className="compare-row"><span>濮撳悕</span><strong>{formatFieldValue(saveMode === "merge" ? mergePreview?.name : draft.name)}</strong></div>
                <div className="compare-row"><span>宀椾綅</span><strong>{formatFieldValue(saveMode === "merge" ? mergePreview?.positionTitle : draft.positionTitle)}</strong></div>
                <div className="compare-row"><span>手机号</span><strong>{formatFieldValue(saveMode === "merge" ? mergePreview?.phone : draft.phone)}</strong></div>
                <div className="compare-row"><span>閭</span><strong>{formatFieldValue(saveMode === "merge" ? mergePreview?.email : draft.email)}</strong></div>
                <div className="compare-row"><span>瀛︽牎</span><strong>{formatFieldValue(saveMode === "merge" ? mergePreview?.school : draft.school)}</strong></div>
                <div className="compare-row"><span>涓撲笟</span><strong>{formatFieldValue(saveMode === "merge" ? mergePreview?.major : draft.major)}</strong></div>
                <div className="compare-row"><span>宸ヤ綔骞撮檺</span><strong>{formatFieldValue(saveMode === "merge" ? mergePreview?.yearsOfExperience : draft.yearsOfExperience)}</strong></div>
                <div className="compare-row"><span>状态</span><strong>{STATUS_LABELS[saveMode === "merge" && mergePreview ? mergePreview.status : draft.status]}</strong></div>
                <div className="compare-row"><span>技能</span><strong>{formatSkills(saveMode === "merge" && mergePreview ? mergePreview.skills : draft.skills)}</strong></div>
                <div className="compare-row"><span>鏍囩</span><strong>{formatTags(saveMode === "merge" && mergePreview ? mergePreview.tags : draft.tags)}</strong></div>
                <div className="compare-row"><span>璺熻繘寤鸿</span><strong>{formatFieldValue(saveMode === "merge" ? mergePreview?.followUpSuggestion : draft.followUpSuggestion)}</strong></div>
              </div>
            </div>
          ) : (
            <div className="empty-state">当前没有可预览的重复候选人详情。</div>
          )}
        </section>
      ) : null}
    </div>
  );
}
