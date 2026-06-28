/**
 * 候选人、提醒、Agent 日志与看板数据服务。
 *
 * 该模块承接候选人列表查询、详情查询、AI Intake 保存确认、候选人合并、状态更新、
 * 软删除、提醒处理和 AgentTask 查询。它依赖 Prisma、岗位申请服务和本地 Agent 规则，
 * 是 `/api/candidates`、候选人页面、看板页面和 Agent 日志页面的主要后端入口。
 */
import {
  AgentTaskStatus,
  CandidateStatus,
  type InputScene,
  Prisma,
  RawInputType
} from "@prisma/client";

import {
  buildReminderForStatus,
  mergeCandidatePayload,
  shouldCreateReminder,
  type ExtractedCandidateDraft
} from "@/lib/agents/extract";
import { ACTIVE_PIPELINE_STATUSES } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { toPrismaJson, toPrismaNullableJson } from "@/lib/prisma-json";
import { READ_CACHE_TTL, invalidateCacheByPrefix, readThroughCache } from "@/lib/server-cache";
import { makeId } from "@/lib/store";
import { ensureApplicationForCandidate, updateApplicationProgress } from "@/lib/services/positions";
import { toArray } from "@/lib/utils";

export type CandidateListFilters = {
  query?: string;
  status?: CandidateStatus | "ALL";
  positionId?: string;
  departmentId?: string;
  source?: string;
  updatedWithinDays?: number;
  dateFrom?: Date;
  dateTo?: Date;
  onlyPendingFollowUp?: boolean;
};

type CandidatePayload = {
  name: string;
  phone?: string | null;
  email?: string | null;
  school?: string | null;
  education?: string | null;
  major?: string | null;
  yearsOfExperience?: number | null;
  skills?: string[] | string;
  status: CandidateStatus;
  source?: string | null;
  remark?: string | null;
  confidence?: number | null;
  uncertainFields?: string[];
  positionTitle?: string | null;
  rawInputId?: string | null;
  duplicateMatchId?: string | null;
  inputType?: RawInputType;
  inputScene?: InputScene;
  tags?: string[] | string;
  followUpSuggestion?: string | null;
  customFields?: Record<string, unknown>;
  targetPositionId?: string | null;
  currentUser?: {
    id: string;
    name: string;
  };
};

const CANDIDATE_CACHE_PREFIX = "candidates:";
const AGENT_TASK_CACHE_PREFIX = "agentTasks:";
const RAW_INPUT_CACHE_PREFIX = "rawInputs:";
const DASHBOARD_CACHE_PREFIX = "dashboard:";

function invalidateRecruitmentReadCaches() {
  invalidateCacheByPrefix(
    CANDIDATE_CACHE_PREFIX,
    AGENT_TASK_CACHE_PREFIX,
    RAW_INPUT_CACHE_PREFIX,
    DASHBOARD_CACHE_PREFIX
  );
}

function buildCandidatesListCacheKey(filters: CandidateListFilters) {
  // 查询条件会影响列表结果，缓存 key 必须包含所有筛选项，避免不同筛选之间互相污染。
  return `${CANDIDATE_CACHE_PREFIX}list:${JSON.stringify({
    query: filters.query ?? "",
    status: filters.status ?? "ALL",
    positionId: filters.positionId ?? "",
    departmentId: filters.departmentId ?? "",
    source: filters.source ?? "",
    updatedWithinDays: filters.updatedWithinDays ?? "",
    dateFrom: filters.dateFrom?.toISOString() ?? "",
    dateTo: filters.dateTo?.toISOString() ?? "",
    onlyPendingFollowUp: Boolean(filters.onlyPendingFollowUp)
  })}`;
}

function buildCandidateDraftFromPayload(payload: CandidatePayload): ExtractedCandidateDraft {
  // 前端保存候选人时提交的是扁平 payload，这里统一补齐 ExtractedCandidateDraft 的默认结构供合并逻辑复用。
  return {
    name: payload.name,
    phone: payload.phone ?? null,
    email: payload.email ?? null,
    school: payload.school ?? null,
    education: payload.education ?? null,
    major: payload.major ?? null,
    yearsOfExperience: payload.yearsOfExperience ?? null,
    skills: toArray(payload.skills),
    status: payload.status,
    source: payload.source ?? null,
    remark: payload.remark ?? null,
    confidence: payload.confidence ?? 0.66,
    uncertainFields: payload.uncertainFields ?? [],
    positionTitle: payload.positionTitle ?? null,
    inputType: payload.inputType ?? RawInputType.OTHER,
    inputScene: payload.inputScene ?? "OTHER",
    tags: toArray(payload.tags),
    followUpSuggestion: payload.followUpSuggestion ?? null,
    customFields: payload.customFields ?? {}
  };
}

async function ensurePosition(tx: Prisma.TransactionClient, positionTitle?: string | null) {
  // AI 可能从简历中识别出尚未建档的岗位名称；这里按标题复用或创建岗位，保证候选人仍能入库。
  if (!positionTitle?.trim()) {
    return null;
  }

  const normalizedTitle = positionTitle.trim();
  const existing = await tx.position.findFirst({
    where: { title: normalizedTitle, deletedAt: null }
  });

  if (existing) {
    return existing;
  }

  const now = new Date();
  return tx.position.create({
    data: {
      id: makeId("pos"),
      title: normalizedTitle,
      department: null,
      headcount: 1,
      owner: null,
      description: null,
      status: "open",
      createdAt: now,
      updatedAt: now
    }
  });
}

async function upsertReminder(
  tx: Prisma.TransactionClient,
  candidateId: string,
  status: CandidateStatus,
  followUpSuggestion?: string | null
) {
  // 每个候选人在同一提醒类型下只保留一条未完成提醒，避免状态多次更新后产生重复待办。
  if (!shouldCreateReminder(status)) {
    return null;
  }

  const reminder = buildReminderForStatus(status, followUpSuggestion);
  const now = new Date();
  const existing = await tx.notification.findFirst({
    where: {
      candidateId,
      type: reminder.type,
      done: false
    }
  });

  if (existing) {
    return tx.notification.update({
      where: { id: existing.id },
      data: {
        title: reminder.title,
        note: reminder.note,
        dueAt: reminder.dueAt,
        updatedAt: now
      }
    });
  }

  return tx.notification.create({
    data: {
      id: makeId("note"),
      candidateId,
      type: reminder.type,
      title: reminder.title,
      note: reminder.note,
      dueAt: reminder.dueAt,
      done: false,
      createdAt: now,
      updatedAt: now
    }
  });
}

async function syncIntakeAssociations(
  tx: Prisma.TransactionClient,
  rawInputId: string,
  candidateId: string,
  parsedResultPatch: Record<string, unknown>,
  now: Date
) {
  // 候选人保存或合并后，把 RawInput、AgentTask 统一挂到候选人名下，形成可追溯闭环。
  const rawInput = await tx.rawInput.findUnique({
    where: { id: rawInputId }
  });

  if (rawInput) {
    const parsedResult =
      rawInput.parsedResult && typeof rawInput.parsedResult === "object" && !Array.isArray(rawInput.parsedResult)
        ? (rawInput.parsedResult as Record<string, unknown>)
        : {};

    await tx.rawInput.update({
      where: { id: rawInputId },
      data: {
        candidateId,
        parsedResult: toPrismaNullableJson({
          ...parsedResult,
          ...parsedResultPatch
        })
      }
    });
  }

  await tx.agentTask.updateMany({
    where: { rawInputId },
    data: {
      candidateId,
      updatedAt: now
    }
  });
}

export async function listPositions() {
  return readThroughCache(`${CANDIDATE_CACHE_PREFIX}positions`, READ_CACHE_TTL.medium, async () =>
    prisma.position.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        title: true,
        departmentId: true,
        department: true,
        departmentRef: {
          select: {
            id: true,
            name: true
          }
        },
        updatedAt: true
      },
      orderBy: { updatedAt: "desc" }
    })
  );
}

export async function listCandidates(filters: CandidateListFilters = {}) {
  return readThroughCache(buildCandidatesListCacheKey(filters), READ_CACHE_TTL.short, async () => {
    const updatedThreshold =
      typeof filters.updatedWithinDays === "number"
        ? new Date(Date.now() - filters.updatedWithinDays * 24 * 60 * 60 * 1000)
        : null;
    const dateFrom = filters.dateFrom ?? updatedThreshold;
    const dateTo = filters.dateTo ?? null;
    const hasAppliedAtFlowFilter = Boolean(dateFrom || dateTo);
    const query = filters.query?.trim();
    const statusFilter = filters.status && filters.status !== "ALL" ? filters.status : null;
    const activeStatusValues = Array.from(ACTIVE_PIPELINE_STATUSES);

    return prisma.candidate.findMany({
      where: {
        deletedAt: null,
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(filters.positionId ? { positionId: filters.positionId } : {}),
        ...(filters.departmentId
          ? {
              position: {
                is: {
                  departmentId: filters.departmentId
                }
              }
            }
          : {}),
        ...(filters.source ? { source: filters.source } : {}),
        ...(hasAppliedAtFlowFilter
          ? {
              // 日期筛选以岗位申请为主，同时保留活跃流程候选人，避免正在推进的候选人被时间窗口隐藏。
              applications: {
                some: {
                  deletedAt: null,
                  ...(dateTo ? { appliedAt: { lte: dateTo } } : {}),
                  OR: [
                    {
                      appliedAt: {
                        ...(dateFrom ? { gte: dateFrom } : {}),
                        ...(dateTo ? { lte: dateTo } : {})
                      }
                    },
                    { status: { in: activeStatusValues } }
                  ]
                }
              }
            }
          : {}),
        ...(filters.onlyPendingFollowUp ? { notifications: { some: { done: false } } } : {}),
        ...(query
          ? {
              OR: [
                { name: { contains: query, mode: "insensitive" } },
                { phone: { contains: query, mode: "insensitive" } },
                { email: { contains: query, mode: "insensitive" } },
                { school: { contains: query, mode: "insensitive" } },
                { education: { contains: query, mode: "insensitive" } },
                { major: { contains: query, mode: "insensitive" } },
                { source: { contains: query, mode: "insensitive" } },
                { tags: { has: query } }
              ]
            }
          : {})
      },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        school: true,
        education: true,
        major: true,
        status: true,
        source: true,
        tags: true,
        followUpSuggestion: true,
        lastFollowUpAt: true,
        updatedAt: true,
        createdAt: true,
        position: {
          select: {
            title: true,
            departmentId: true,
            department: true,
            departmentRef: {
              select: {
                name: true
              }
            }
          }
        },
        notifications: {
          where: { done: false },
          orderBy: { dueAt: "asc" },
          take: 1,
          select: {
            title: true
          }
        }
      },
      orderBy: { updatedAt: "desc" }
    });
  });
}

export async function listCandidateSources() {
  return readThroughCache(`${CANDIDATE_CACHE_PREFIX}sources`, READ_CACHE_TTL.medium, async () => {
    const rows = await prisma.candidate.findMany({
      where: {
        deletedAt: null,
        source: {
          not: null
        }
      },
      select: {
        source: true
      },
      distinct: ["source"]
    });

    return rows
      .map((row) => row.source)
      .filter((value): value is string => Boolean(value))
      .sort((a, b) => a.localeCompare(b, "zh-CN"));
  });
}

export async function getCandidateById(id: string) {
  return readThroughCache(`${CANDIDATE_CACHE_PREFIX}detail:${id}`, READ_CACHE_TTL.short, async () =>
    prisma.candidate.findFirst({
      where: {
        id,
        deletedAt: null
      },
      include: {
        position: true,
        logs: {
          orderBy: { createdAt: "desc" }
        },
        rawInputs: {
          orderBy: { createdAt: "desc" }
        },
        agentTasks: {
          orderBy: { createdAt: "desc" }
        },
        notifications: {
          orderBy: [{ done: "asc" }, { dueAt: "asc" }]
        }
      }
    })
  );
}

export async function createOrMergeCandidate(payload: CandidatePayload) {
  // 保存确认阶段的主入口：优先根据 duplicateMatchId 或 RawInput 已有关联进行合并，否则创建新候选人。
  const result = await prisma.$transaction(async (tx) => {
    const now = new Date();
    const position = payload.targetPositionId
      ? await tx.position.findFirst({
          where: {
            id: payload.targetPositionId,
            deletedAt: null
          }
        })
      : await ensurePosition(tx, payload.positionTitle);
    if (payload.targetPositionId && !position) {
      throw new Error("目标岗位不存在或已被删除");
    }
    const draft = buildCandidateDraftFromPayload(payload);
    const linkedRawInput = payload.rawInputId
      ? await tx.rawInput.findUnique({
          where: { id: payload.rawInputId },
          select: { candidateId: true }
        })
      : null;
    const candidateToMergeId = payload.duplicateMatchId ?? linkedRawInput?.candidateId ?? null;

    if (candidateToMergeId) {
      // 合并只补齐空字段、合并标签/技能，并保留更靠后的招聘状态，避免覆盖 HR 已确认的信息。
      const existing = await tx.candidate.findFirst({
        where: {
          id: candidateToMergeId,
          deletedAt: null
        }
      });

      if (existing) {
        const previousStatus = existing.status;
        const merged = mergeCandidatePayload(existing, draft);

        const updated = await tx.candidate.update({
          where: { id: existing.id },
          data: {
            name: merged.name,
            phone: merged.phone,
            email: merged.email,
            school: merged.school,
            education: merged.education,
            major: merged.major,
            yearsOfExperience: merged.yearsOfExperience,
            skills: merged.skills,
            status: merged.status,
            source: merged.source,
            remark: merged.remark,
            confidence: merged.confidence,
            uncertainFields: merged.uncertainFields,
            tags: merged.tags,
            followUpSuggestion: merged.followUpSuggestion,
            positionId: position?.id ?? existing.positionId,
            lastFollowUpAt: now,
            updatedAt: now
          },
          include: {
            position: true
          }
        });

        await tx.recruitmentLog.create({
          data: {
            id: makeId("log"),
            candidateId: existing.id,
            fromStatus: previousStatus,
            toStatus: merged.status,
            note: linkedRawInput?.candidateId
              ? "Agent Intake 入库重试，已继续更新原候选人。"
              : "Agent 识别到重复候选人，已合并最新信息。",
            source: "agent",
            createdBy: "system",
            createdAt: now
          }
        });

        if (payload.rawInputId) {
          await syncIntakeAssociations(
            tx,
            payload.rawInputId,
            existing.id,
            {
              mergedIntoCandidateId: existing.id,
              mergedAt: now.toISOString()
            },
            now
          );
        }

        await upsertReminder(tx, existing.id, updated.status, updated.followUpSuggestion);
        return { candidate: updated, merged: true };
      }
    }

    const candidate = await tx.candidate.create({
      data: {
        id: makeId("cand"),
        name: payload.name,
        phone: payload.phone ?? null,
        email: payload.email ?? null,
        school: payload.school ?? null,
        education: payload.education ?? null,
        major: payload.major ?? null,
        yearsOfExperience: payload.yearsOfExperience ?? null,
        skills: toArray(payload.skills),
        status: payload.status,
        source: payload.source ?? null,
        remark: payload.remark ?? null,
        confidence: payload.confidence ?? null,
        uncertainFields: payload.uncertainFields ?? [],
        tags: toArray(payload.tags),
        followUpSuggestion: payload.followUpSuggestion ?? null,
        lastFollowUpAt: now,
        deletedAt: null,
        positionId: position?.id ?? null,
        createdAt: now,
        updatedAt: now
      },
      include: {
        position: true
      }
    });

    // 首次入库同时记录 RecruitmentLog，后续状态看板和详情页都依赖这条状态轨迹。
    await tx.recruitmentLog.create({
      data: {
        id: makeId("log"),
        candidateId: candidate.id,
        fromStatus: null,
        toStatus: candidate.status,
        note: "候选人通过 Agent Intake 创建。",
        source: "agent",
        createdBy: "system",
        createdAt: now
      }
    });

    if (payload.rawInputId) {
      await syncIntakeAssociations(
        tx,
        payload.rawInputId,
        candidate.id,
        {
          candidateId: candidate.id,
          savedAt: now.toISOString()
        },
        now
      );
    }

    await upsertReminder(tx, candidate.id, candidate.status, candidate.followUpSuggestion);
    return { candidate, merged: false };
  });

  const targetPositionId = payload.targetPositionId ?? result.candidate.positionId;
  if (targetPositionId) {
    // Candidate 是人才库实体，RecruitmentApplication 是候选人在某个岗位下的流程记录。
    const application = await ensureApplicationForCandidate({
      candidateId: result.candidate.id,
      positionId: targetPositionId,
      status: result.candidate.status,
      source: result.candidate.source,
      rawInputId: payload.rawInputId
      ,
      ownerId: payload.currentUser?.id,
      ownerName: payload.currentUser?.name
    });
    if (payload.customFields && Object.keys(payload.customFields).length) {
      await updateApplicationProgress(application.id, {
        status: result.candidate.status,
        values: payload.customFields,
        source: "AI_INTAKE"
      });
    }
  }
  invalidateRecruitmentReadCaches();
  return result;
}

export async function updateCandidate(id: string, payload: Partial<CandidatePayload>) {
  // 手工编辑候选人时同步写入 RecruitmentLog、AgentTask 和岗位申请，保证列表、详情和进度表口径一致。
  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.candidate.findFirst({
      where: {
        id,
        deletedAt: null
      }
    });

    if (!existing) {
      return null;
    }

    const now = new Date();
    const previousStatus = existing.status;
    const position =
      payload.positionTitle !== undefined ? await ensurePosition(tx, payload.positionTitle) : undefined;

    const updated = await tx.candidate.update({
      where: { id: existing.id },
      data: {
        name: payload.name ?? existing.name,
        phone: payload.phone === undefined ? existing.phone : payload.phone,
        email: payload.email === undefined ? existing.email : payload.email,
        school: payload.school === undefined ? existing.school : payload.school,
        education: payload.education === undefined ? existing.education : payload.education,
        major: payload.major === undefined ? existing.major : payload.major,
        yearsOfExperience:
          payload.yearsOfExperience === undefined ? existing.yearsOfExperience : payload.yearsOfExperience,
        skills: payload.skills === undefined ? existing.skills : toArray(payload.skills),
        status: payload.status ?? existing.status,
        source: payload.source === undefined ? existing.source : payload.source,
        remark: payload.remark === undefined ? existing.remark : payload.remark,
        confidence: payload.confidence === undefined ? existing.confidence : payload.confidence,
        uncertainFields:
          payload.uncertainFields === undefined ? existing.uncertainFields : payload.uncertainFields,
        tags: payload.tags === undefined ? existing.tags : toArray(payload.tags),
        followUpSuggestion:
          payload.followUpSuggestion === undefined ? existing.followUpSuggestion : payload.followUpSuggestion,
        positionId: position === undefined ? existing.positionId : position?.id ?? null,
        lastFollowUpAt: now,
        updatedAt: now
      },
      include: {
        position: true
      }
    });

    if (updated.status !== previousStatus) {
      await tx.recruitmentLog.create({
        data: {
          id: makeId("log"),
          candidateId: updated.id,
          fromStatus: previousStatus,
          toStatus: updated.status,
          note: payload.remark ?? "候选人状态已更新。",
          source: "manual",
          createdBy: "HR",
          createdAt: now
        }
      });
    }

    await tx.agentTask.create({
      data: {
        id: makeId("task"),
        agentName: "StatusTrackingAgent",
        taskType: "status",
        status: AgentTaskStatus.SUCCESS,
        input: toPrismaJson({
          candidateId: updated.id,
          previousStatus,
          nextStatus: updated.status
        }),
        output: toPrismaNullableJson({
          message: "状态更新已写入 RecruitmentLog。"
        }),
        error: null,
        confidence: 0.95,
        durationMs: 120,
        candidateId: updated.id,
        rawInputId: null,
        createdAt: now,
        updatedAt: now
      }
    });

    await upsertReminder(tx, updated.id, updated.status, updated.followUpSuggestion);
    return updated;
  });

  if (result) {
    if (result.positionId) {
      const application = await ensureApplicationForCandidate({
        candidateId: result.id,
        positionId: result.positionId,
        status: result.status,
        source: result.source,
        rawInputId: payload.rawInputId
        ,
        ownerId: payload.currentUser?.id,
        ownerName: payload.currentUser?.name
      });
      if (payload.customFields && Object.keys(payload.customFields).length) {
        await updateApplicationProgress(application.id, {
          status: result.status,
          values: payload.customFields,
          source: "MANUAL"
        });
      }
    }
    invalidateRecruitmentReadCaches();
  }

  return result;
}

export async function softDeleteCandidate(id: string) {
  // 候选人采用软删除，同时软删除关联岗位申请；RawInput 和 AgentTask 保留用于历史追溯。
  const candidate = await prisma.candidate.findFirst({
    where: {
      id,
      deletedAt: null
    }
  });

  if (!candidate) {
    return null;
  }

  const result = await prisma.candidate.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      updatedAt: new Date()
    }
  });

  await prisma.recruitmentApplication.updateMany({
    where: { candidateId: id, deletedAt: null },
    data: { deletedAt: new Date() }
  });

  invalidateRecruitmentReadCaches();
  return result;
}

export async function softDeleteCandidates(ids: string[]) {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (!uniqueIds.length) {
    return { count: 0 };
  }

  const result = await prisma.candidate.updateMany({
    where: {
      id: { in: uniqueIds },
      deletedAt: null
    },
    data: {
      deletedAt: new Date(),
      updatedAt: new Date()
    }
  });

  await prisma.recruitmentApplication.updateMany({
    where: { candidateId: { in: uniqueIds }, deletedAt: null },
    data: { deletedAt: new Date() }
  });

  invalidateRecruitmentReadCaches();
  return result;
}

export async function listAgentTasks() {
  return readThroughCache(`${AGENT_TASK_CACHE_PREFIX}list`, READ_CACHE_TTL.short, async () => {
    const tasks = await prisma.agentTask.findMany({
      select: {
        id: true,
        agentName: true,
        taskType: true,
        status: true,
        confidence: true,
        durationMs: true,
        candidateId: true,
        rawInputId: true,
        createdAt: true,
        updatedAt: true,
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
        rawInput: {
          select: {
            id: true,
            candidateId: true,
            inputType: true,
            createdAt: true
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    return tasks.map((task) => ({
      ...task,
      rawInput: task.rawInput
        ? {
            id: task.rawInput.id,
            candidateId: task.rawInput.candidateId,
            inputType: task.rawInput.inputType,
            createdAt: task.rawInput.createdAt
          }
        : null
    }));
  });
}

export async function listKanbanColumns() {
  return readThroughCache(`${CANDIDATE_CACHE_PREFIX}kanban`, READ_CACHE_TTL.short, async () =>
    prisma.candidate.findMany({
      where: {
        deletedAt: null
      },
      select: {
        id: true,
        name: true,
        status: true,
        skills: true,
        updatedAt: true,
        position: {
          select: {
            title: true
          }
        }
      },
      orderBy: { updatedAt: "desc" }
    })
  );
}

export async function listDuplicateCandidates() {
  return readThroughCache(`${CANDIDATE_CACHE_PREFIX}duplicates`, READ_CACHE_TTL.short, async () =>
    prisma.candidate.findMany({
      where: {
        deletedAt: null
      },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        school: true,
        education: true,
        major: true,
        yearsOfExperience: true,
        skills: true,
        status: true,
        position: {
          select: {
            title: true
          }
        }
      }
    })
  );
}

export async function markNotificationDone(id: string, done: boolean) {
  const notification = await prisma.notification.findUnique({
    where: { id }
  });

  if (!notification) {
    throw new Error("提醒不存在");
  }

  const result = await prisma.notification.update({
    where: { id },
    data: {
      done,
      updatedAt: new Date()
    }
  });

  invalidateRecruitmentReadCaches();
  return result;
}

export async function getAgentTaskById(id: string) {
  return readThroughCache(`${AGENT_TASK_CACHE_PREFIX}detail:${id}`, READ_CACHE_TTL.short, async () => {
    const task = await prisma.agentTask.findUnique({
      where: { id },
      include: {
        candidate: {
          include: {
            position: true
          }
        },
        rawInput: {
          include: {
            candidate: {
              include: {
                position: true
              }
            }
          }
        }
      }
    });

    if (!task) {
      return null;
    }

    const candidate = task.candidate ?? task.rawInput?.candidate ?? null;

    // 部分 AgentTask 初始只关联 RawInput，详情页展示时回退到 RawInput 关联候选人。
    return {
      ...task,
      candidate,
      candidateId: candidate?.id ?? task.candidateId,
      rawInput: task.rawInput
        ? {
            id: task.rawInput.id,
            candidateId: task.rawInput.candidateId,
            inputType: task.rawInput.inputType,
            inputScene: task.rawInput.inputScene,
            content: task.rawInput.content,
            parsedResult: task.rawInput.parsedResult,
            createdAt: task.rawInput.createdAt
          }
        : null
    };
  });
}

export async function deleteAgentTaskById(id: string) {
  const existing = await prisma.agentTask.findUnique({
    where: { id },
    select: { id: true }
  });

  if (!existing) {
    return null;
  }

  await prisma.agentTask.delete({
    where: { id }
  });

  invalidateRecruitmentReadCaches();
  return existing;
}

export async function deleteAgentTasksByIds(ids: string[]) {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (!uniqueIds.length) {
    return { count: 0 };
  }

  const result = await prisma.agentTask.deleteMany({
    where: {
      id: { in: uniqueIds }
    }
  });

  invalidateRecruitmentReadCaches();
  return result;
}
