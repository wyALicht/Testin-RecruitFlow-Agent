/**
 * 原始输入回溯服务。
 *
 * 负责 RawInput 列表、详情、关联候选人、批量更新、删除和上传文件清理。
 * AI Intake、候选人详情页和原始输入页面都依赖这里维护“原文 -> 解析结果 -> 候选人/AgentTask”的追溯关系。
 */
import { Prisma, RawInputType } from "@prisma/client";

import { removeStoredResume } from "@/lib/files/storage";
import { prisma } from "@/lib/prisma";
import { READ_CACHE_TTL, invalidateCacheByPrefix, readThroughCache } from "@/lib/server-cache";
import { hasLikelyEncodingDamage, normalizeDisplayText } from "@/lib/text-quality";

const RAW_INPUT_CACHE_PREFIX = "rawInputs:";
const CANDIDATE_CACHE_PREFIX = "candidates:";
const AGENT_TASK_CACHE_PREFIX = "agentTasks:";
const DASHBOARD_CACHE_PREFIX = "dashboard:";

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function invalidateRecruitmentReadCaches() {
  invalidateCacheByPrefix(
    RAW_INPUT_CACHE_PREFIX,
    CANDIDATE_CACHE_PREFIX,
    AGENT_TASK_CACHE_PREFIX,
    DASHBOARD_CACHE_PREFIX
  );
}

function storedFileNameOf(parsedResult: Prisma.JsonValue | null) {
  // 上传文件名保存在 parsedResult.inputMeta 中，删除 RawInput 时需要同步清理本地附件。
  const result = jsonObject(parsedResult);
  const inputMeta = jsonObject(result.inputMeta);
  return typeof inputMeta.storedFileName === "string" ? inputMeta.storedFileName : null;
}

export async function listRawInputs() {
  return readThroughCache(`${RAW_INPUT_CACHE_PREFIX}list`, READ_CACHE_TTL.short, async () => {
    const rawInputs = await prisma.rawInput.findMany({
      select: {
        id: true,
        candidateId: true,
        inputType: true,
        createdAt: true,
        content: true,
        candidate: {
          select: {
            id: true,
            name: true,
            status: true,
            position: {
              select: {
                title: true
              }
            }
          }
        },
        _count: {
          select: {
            agentTasks: true
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    return rawInputs.map((rawInput) => ({
      ...rawInput,
      content: normalizeDisplayText(
        rawInput.content.length > 120 ? `${rawInput.content.slice(0, 120)}...` : rawInput.content
      ),
      encodingIssue: hasLikelyEncodingDamage(rawInput.content),
      candidateId: rawInput.candidate?.id ?? rawInput.candidateId,
      candidate: rawInput.candidate,
      agentTaskCount: rawInput._count.agentTasks
    }));
  });
}

export async function listRawInputCandidateOptions() {
  return readThroughCache(`${RAW_INPUT_CACHE_PREFIX}candidate-options`, READ_CACHE_TTL.short, () =>
    prisma.candidate.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        position: {
          select: {
            title: true
          }
        }
      },
      orderBy: [{ name: "asc" }, { createdAt: "desc" }]
    })
  );
}

export async function getRawInputById(id: string) {
  return readThroughCache(`${RAW_INPUT_CACHE_PREFIX}detail:${id}`, READ_CACHE_TTL.short, async () => {
    const rawInput = await prisma.rawInput.findUnique({
      where: { id },
      include: {
        candidate: {
          include: {
            position: true
          }
        },
        agentTasks: {
          orderBy: { createdAt: "desc" }
        }
      }
    });

    if (!rawInput) {
      return null;
    }

    return {
      ...rawInput,
      content: normalizeDisplayText(rawInput.content),
      encodingIssue: hasLikelyEncodingDamage(rawInput.content),
      candidateId: rawInput.candidate?.id ?? rawInput.candidateId,
      candidate: rawInput.candidate
        ? {
            id: rawInput.candidate.id,
            name: rawInput.candidate.name,
            status: rawInput.candidate.status,
            position: rawInput.candidate.position ? { title: rawInput.candidate.position.title } : null
          }
        : null
    };
  });
}

export async function deleteRawInputById(id: string) {
  const existing = await prisma.rawInput.findUnique({
    where: { id },
    select: { id: true, parsedResult: true }
  });

  if (!existing) {
    return null;
  }

  await prisma.rawInput.delete({
    where: { id }
  });
  const storedFileName = storedFileNameOf(existing.parsedResult);
  if (storedFileName) {
    await removeStoredResume(storedFileName);
  }

  invalidateRecruitmentReadCaches();
  return existing;
}

export async function batchUpdateRawInputs(
  ids: string[],
  patch: {
    inputType?: RawInputType;
    candidateId?: string | null;
  }
) {
  // 手工改绑候选人时同步更新 AgentTask，并断开 application 关联，避免旧岗位申请继续引用错误原文。
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));

  if (patch.candidateId) {
    const candidate = await prisma.candidate.findFirst({
      where: {
        id: patch.candidateId,
        deletedAt: null
      },
      select: { id: true }
    });
    if (!candidate) {
      throw new Error("指定的候选人不存在或已被删除");
    }
  }

  const existing = await prisma.rawInput.findMany({
    where: { id: { in: uniqueIds } },
    select: {
      id: true,
      parsedResult: true
    }
  });

  await prisma.$transaction(async (tx) => {
    for (const rawInput of existing) {
      const data: Prisma.RawInputUpdateInput = {};

      if (patch.inputType !== undefined) {
        data.inputType = patch.inputType;
      }

      if (patch.candidateId !== undefined) {
        const parsedResult =
          rawInput.parsedResult &&
          typeof rawInput.parsedResult === "object" &&
          !Array.isArray(rawInput.parsedResult)
            ? (rawInput.parsedResult as Record<string, unknown>)
            : {};

        data.candidate = patch.candidateId
          ? { connect: { id: patch.candidateId } }
          : { disconnect: true };
        data.application = { disconnect: true };
        data.parsedResult = {
          ...parsedResult,
          candidateId: patch.candidateId
        } as Prisma.InputJsonValue;

        await tx.agentTask.updateMany({
          where: { rawInputId: rawInput.id },
          data: { candidateId: patch.candidateId, updatedAt: new Date() }
        });
      }

      await tx.rawInput.update({
        where: { id: rawInput.id },
        data
      });
    }
  });

  invalidateRecruitmentReadCaches();
  return { count: existing.length };
}

export async function batchDeleteRawInputs(ids: string[]) {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  const existing = await prisma.rawInput.findMany({
    where: { id: { in: uniqueIds } },
    select: { parsedResult: true }
  });
  const result = await prisma.rawInput.deleteMany({
    where: { id: { in: uniqueIds } }
  });
  await Promise.all(
    existing
      .map((item) => storedFileNameOf(item.parsedResult))
      .filter((item): item is string => Boolean(item))
      .map((storedFileName) => removeStoredResume(storedFileName))
  );
  invalidateRecruitmentReadCaches();
  return result;
}
