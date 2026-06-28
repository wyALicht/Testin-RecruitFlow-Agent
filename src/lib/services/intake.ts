/**
 * AI 候选人录入编排服务。
 *
 * 负责把文本或文件解析后的内容转换为候选人草稿，并同步写入 RawInput 与 AgentTask。
 * 由 `/api/agent/extract` 和 `/api/agent/extract-file` 调用，依赖 AI Provider、岗位上下文、
 * 重复候选人检测和 Prisma 数据层。该服务只生成“待确认草稿”，真正入库由候选人服务完成。
 */
import { AgentTaskStatus, PositionFieldScope, Prisma, RawInputType } from "@prisma/client";

import { type ExtractedCandidateDraft, findDuplicateHint } from "@/lib/agents/extract";
import { type InputScene } from "@/lib/ai/types";
import {
  type AIExtractionContext,
  type AIProviderSelection,
  getAIProvider
} from "@/lib/ai/provider";
import { INPUT_SCENE_LABELS, INPUT_TYPE_LABELS } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { toPrismaJson, toPrismaNullableJson } from "@/lib/prisma-json";
import { invalidateCacheByPrefix } from "@/lib/server-cache";
import { listDuplicateCandidates } from "@/lib/services/candidates";
import { makeId } from "@/lib/store";

type RunCandidateIntakeParams = {
  content: string;
  rawInputContent?: string;
  initialInputType?: RawInputType;
  inputMeta?: Record<string, unknown>;
  providerSelection?: AIProviderSelection;
  departmentId?: string;
  positionId?: string;
};

export type CandidateIntakeResult = {
  rawInputId: string;
  draft: ExtractedCandidateDraft;
  duplicate: ReturnType<typeof findDuplicateHint>;
  providerName: string;
  positionContext: {
    positionId: string | null;
    positionTitle: string | null;
    jobDescriptionUsed: boolean;
  };
  customFieldDefinitions: Array<{
    key: string;
    label: string;
    fieldType: string;
    required: boolean;
    options: unknown;
  }>;
};

function invalidateRecruitmentReadCaches() {
  invalidateCacheByPrefix("dashboard:", "candidates:", "rawInputs:", "agentTasks:");
}

function buildModelPromptContent(
  content: string,
  inputType?: RawInputType,
  inputMeta?: Record<string, unknown>
) {
  // 将前端或文件解析阶段得到的类型提示拼到模型输入前，减少模型误判简历/邮件/聊天记录场景的概率。
  const promptHints: string[] = [];

  if (inputType && inputType !== RawInputType.OTHER) {
    promptHints.push(`输入类型提示：${INPUT_TYPE_LABELS[inputType]}`);
  }

  if (typeof inputMeta?.inputSceneHint === "string" && inputMeta.inputSceneHint in INPUT_SCENE_LABELS) {
    promptHints.push(
      `输入场景提示：${INPUT_SCENE_LABELS[inputMeta.inputSceneHint as keyof typeof INPUT_SCENE_LABELS]}`
    );
  }

  if (!promptHints.length) {
    return content;
  }

  return `${promptHints.join("\n")}\n\n${content}`;
}

function resolvePreferredInputType(
  initialInputType: RawInputType | undefined,
  draft: ExtractedCandidateDraft
) {
  if (initialInputType && initialInputType !== RawInputType.OTHER) {
    return initialInputType;
  }

  return draft.inputType;
}

function resolvePreferredInputScene(
  inputMeta: Record<string, unknown> | undefined,
  draft: ExtractedCandidateDraft
) {
  if (typeof inputMeta?.inputSceneHint === "string" && inputMeta.inputSceneHint in INPUT_SCENE_LABELS) {
    return inputMeta.inputSceneHint as InputScene;
  }

  return draft.inputScene;
}

export async function runCandidateIntake(
  params: RunCandidateIntakeParams
): Promise<CandidateIntakeResult> {
  // Intake 是候选人智能录入的服务端主流程：
  // 1. 校验部门/岗位上下文；
  // 2. 记录 RawInput，确保失败也可追溯；
  // 3. 调用 AI Provider 生成候选人草稿；
  // 4. 写入 AgentTask 日志，供页面回看每个子任务结果。
  if (!params.departmentId || !params.positionId) {
    throw new Error("请先选择部门，再选择该部门下由管理员预设的目标岗位");
  }
  const now = new Date();
  const rawInputId = makeId("raw");
  const provider = getAIProvider(params.providerSelection);
  const startedAt = Date.now();
  // Intake 必须绑定管理员预设岗位；岗位 JD 和可抽取字段会进入模型上下文。
  const targetPosition = params.positionId
    ? await prisma.position.findUnique({
        where: { id: params.positionId },
        include: {
          departmentRef: {
            select: {
              id: true,
              name: true
            }
          },
          fieldDefinitions: {
            where: {
              active: true,
              aiExtractable: true,
              scope: PositionFieldScope.APPLICATION
            },
            orderBy: { sortOrder: "asc" }
          }
        }
      })
    : null;
  if (params.positionId && (!targetPosition || targetPosition.deletedAt)) {
    throw new Error("目标岗位不存在或已被删除");
  }
  if (targetPosition && targetPosition.departmentId !== params.departmentId) {
    throw new Error("所选岗位与部门不匹配，请重新选择");
  }
  const contentForModel = buildModelPromptContent(
    params.content,
    params.initialInputType,
    params.inputMeta
  );
  const extractionContext: AIExtractionContext = {
    position: targetPosition
      ? {
          id: targetPosition.id,
          title: targetPosition.title,
          departmentName: targetPosition.departmentRef?.name ?? targetPosition.department ?? null,
          jobDescription: targetPosition.description?.trim() || null
        }
      : null,
    customFields:
      targetPosition?.fieldDefinitions.map((field) => ({
        key: field.key,
        label: field.label,
        fieldType: field.fieldType,
        required: field.required
      })) ?? []
  };
  const positionContext = {
    positionId: targetPosition?.id ?? null,
    positionTitle: targetPosition?.title ?? null,
    jobDescriptionUsed: Boolean(extractionContext.position?.jobDescription)
  };

  await prisma.rawInput.create({
    data: {
      id: rawInputId,
      candidateId: null,
      inputType: params.initialInputType ?? RawInputType.OTHER,
      inputScene: null,
      content: params.rawInputContent ?? params.content,
      parsedResult: toPrismaNullableJson({
        provider: provider.displayName,
        status: "processing",
        inputMeta: params.inputMeta ?? null
      }),
      createdAt: now
    }
  });

  try {
    // Provider 负责模型调用和本地规则兜底，Intake 层只关心统一的候选人草稿结构。
    const extractedDraft = await provider.extractCandidate(contentForModel, extractionContext);
    const draft: ExtractedCandidateDraft = {
      ...extractedDraft,
      positionTitle: targetPosition?.title ?? extractedDraft.positionTitle,
      inputType: resolvePreferredInputType(params.initialInputType, extractedDraft),
      inputScene: resolvePreferredInputScene(params.inputMeta, extractedDraft)
    };
    const duplicateCandidates = await listDuplicateCandidates();
    const duplicate = findDuplicateHint(draft, duplicateCandidates);
    const relatedCandidateId = duplicate?.candidateId ?? null;

    // RawInput 和 AgentTask 必须在同一事务内落库，避免页面出现“有原文但无处理日志”的半成品状态。
    await prisma.$transaction(async (tx) => {
      await tx.rawInput.update({
        where: { id: rawInputId },
        data: {
          inputType: draft.inputType,
          inputScene: draft.inputScene,
          parsedResult: toPrismaNullableJson({
            provider: provider.displayName,
            inputMeta: params.inputMeta ?? null,
            departmentId: params.departmentId ?? targetPosition?.departmentId ?? null,
            departmentName: targetPosition?.departmentRef?.name ?? targetPosition?.department ?? null,
            targetPositionId: params.positionId ?? null,
            positionContext: {
              ...positionContext,
              jobDescriptionSnapshot: extractionContext.position?.jobDescription ?? null
            },
            duplicate,
            result: draft
          })
        }
      });

      await tx.agentTask.createMany({
        // AgentTask 按子任务拆分，便于页面独立展示抽取、分类、标签、重复检测等结果。
        data: [
          {
            id: makeId("task"),
            agentName: `${provider.name}:CandidateExtractAgent`,
            taskType: "extract",
            status: draft.uncertainFields.length ? AgentTaskStatus.NEED_REVIEW : AgentTaskStatus.SUCCESS,
            input: toPrismaJson({
              contentLength: params.content.length,
              provider: params.providerSelection?.provider ?? null,
              positionContext,
              ...params.inputMeta
            }),
            output: toPrismaNullableJson(draft),
            error: null,
            confidence: draft.confidence,
            durationMs: Date.now() - startedAt,
            candidateId: relatedCandidateId,
            rawInputId,
            createdAt: now,
            updatedAt: now
          },
          {
            id: makeId("task"),
            agentName: `${provider.name}:InputClassifyAgent`,
            taskType: "classify",
            status: AgentTaskStatus.SUCCESS,
            input: toPrismaJson({
              sourceType: draft.inputType
            }),
            output: toPrismaNullableJson({
              inputScene: draft.inputScene,
              inputSceneLabel: INPUT_SCENE_LABELS[draft.inputScene]
            }),
            error: null,
            confidence: draft.confidence,
            durationMs: 40,
            candidateId: relatedCandidateId,
            rawInputId,
            createdAt: now,
            updatedAt: now
          },
          {
            id: makeId("task"),
            agentName: `${provider.name}:CandidateTagAgent`,
            taskType: "tagging",
            status: AgentTaskStatus.SUCCESS,
            input: toPrismaJson({
              positionTitle: draft.positionTitle,
              yearsOfExperience: draft.yearsOfExperience
            }),
            output: toPrismaNullableJson({
              tags: draft.tags
            }),
            error: null,
            confidence: draft.confidence,
            durationMs: 35,
            candidateId: relatedCandidateId,
            rawInputId,
            createdAt: now,
            updatedAt: now
          },
          {
            id: makeId("task"),
            agentName: `${provider.name}:FollowUpSuggestionAgent`,
            taskType: "followup",
            status: AgentTaskStatus.SUCCESS,
            input: toPrismaJson({
              status: draft.status,
              uncertainFields: draft.uncertainFields,
              positionContext
            }),
            output: toPrismaNullableJson({
              followUpSuggestion: draft.followUpSuggestion
            }),
            error: null,
            confidence: draft.confidence,
            durationMs: 30,
            candidateId: relatedCandidateId,
            rawInputId,
            createdAt: now,
            updatedAt: now
          },
          {
            id: makeId("task"),
            agentName: `${provider.name}:DuplicateCheckAgent`,
            taskType: "duplicate",
            status: duplicate ? AgentTaskStatus.NEED_REVIEW : AgentTaskStatus.SUCCESS,
            input: toPrismaJson({
              phone: draft.phone,
              email: draft.email,
              name: draft.name,
              positionTitle: draft.positionTitle
            }),
            output: toPrismaNullableJson(duplicate ?? { message: "未发现重复候选人" }),
            error: null,
            confidence: duplicate?.score ?? 0.94,
            durationMs: 60,
            candidateId: relatedCandidateId,
            rawInputId,
            createdAt: now,
            updatedAt: now
          },
          {
            id: makeId("task"),
            agentName: `${provider.name}:StatusTrackingAgent`,
            taskType: "status",
            status: AgentTaskStatus.SUCCESS,
            input: toPrismaJson({
              sourceType: draft.inputType
            }),
            output: toPrismaNullableJson({
              status: draft.status
            }),
            error: null,
            confidence: draft.confidence,
            durationMs: 40,
            candidateId: relatedCandidateId,
            rawInputId,
            createdAt: now,
            updatedAt: now
          }
        ]
      });
    });

    invalidateRecruitmentReadCaches();

    return {
      rawInputId,
      draft,
      duplicate,
      providerName: provider.displayName,
      positionContext,
      customFieldDefinitions:
        targetPosition?.fieldDefinitions.map((field) => ({
          key: field.key,
          label: field.label,
          fieldType: field.fieldType,
          required: field.required,
          options: field.options
        })) ?? []
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent 分析失败";

    // 失败同样写入 RawInput 与 AgentTask，方便用户在 Agent 日志页定位模型、网络或解析问题。
    await prisma.$transaction(async (tx) => {
      await tx.rawInput.update({
        where: { id: rawInputId },
        data: {
          parsedResult: toPrismaNullableJson({
            provider: provider.displayName,
            status: "failed",
            error: message,
            inputMeta: params.inputMeta ?? null
          })
        }
      });

      await tx.agentTask.create({
        data: {
          id: makeId("task"),
          agentName: `${provider.name}:CandidateExtractAgent`,
          taskType: "extract",
          status: AgentTaskStatus.FAILED,
          input: toPrismaJson({
            rawInputId,
            provider: params.providerSelection?.provider ?? null,
            ...params.inputMeta
          }),
          output: Prisma.JsonNull,
          error: message,
          confidence: null,
          durationMs: null,
          candidateId: null,
          rawInputId,
          createdAt: now,
          updatedAt: now
        }
      });
    });

    invalidateRecruitmentReadCaches();

    throw error;
  }
}
