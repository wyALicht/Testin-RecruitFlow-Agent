import {
  CandidateStatus,
  PositionPriority,
  PositionFieldScope,
  PositionFieldType,
  PositionRecruitmentStatus,
  Prisma,
  type PositionFieldDefinition
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { toPrismaJson, toPrismaNullableJson } from "@/lib/prisma-json";
import { invalidateCacheByPrefix } from "@/lib/server-cache";
import { resolveDepartment } from "@/lib/services/departments";
import { makeId } from "@/lib/store";

/**
 * 岗位、岗位字段和岗位申请进度服务。
 *
 * 负责岗位创建/更新/软删除、岗位自定义字段维护、候选人岗位申请 upsert、进度表编辑、
 * 表格导入和导入撤回。候选人保存服务会调用本模块创建 RecruitmentApplication，
 * 岗位页面、进度表页面和 Dashboard 导入也依赖这里的事务逻辑。
 */
const DEFAULT_FIELDS = [
  ["applied_at", "投递日期", PositionFieldType.DATE, PositionFieldScope.SYSTEM, true, false],
  ["hr", "HR", PositionFieldType.USER, PositionFieldScope.APPLICATION, true, false],
  ["city", "城市", PositionFieldType.TEXT, PositionFieldScope.APPLICATION, true, false],
  ["name", "姓名", PositionFieldType.TEXT, PositionFieldScope.CANDIDATE, true, true],
  ["phone", "手机号", PositionFieldType.TEXT, PositionFieldScope.CANDIDATE, true, true],
  ["school", "毕业院校", PositionFieldType.TEXT, PositionFieldScope.CANDIDATE, true, true],
  ["education", "最高学历", PositionFieldType.TEXT, PositionFieldScope.CANDIDATE, true, true],
  ["major", "专业", PositionFieldType.TEXT, PositionFieldScope.CANDIDATE, true, true],
  ["resume", "简历", PositionFieldType.FILE, PositionFieldScope.APPLICATION, true, true],
  ["basic_profile", "基本情况", PositionFieldType.LONG_TEXT, PositionFieldScope.APPLICATION, true, true],
  ["written_test_score", "笔试成绩", PositionFieldType.NUMBER, PositionFieldScope.APPLICATION, true, true],
  ["interviewer", "面试官", PositionFieldType.USER, PositionFieldScope.APPLICATION, true, false],
  ["first_interview_at", "初面安排", PositionFieldType.DATETIME, PositionFieldScope.APPLICATION, true, false],
  ["first_interview_result", "初面结果", PositionFieldType.SINGLE_SELECT, PositionFieldScope.APPLICATION, true, false],
  ["status", "当前阶段", PositionFieldType.SINGLE_SELECT, PositionFieldScope.SYSTEM, true, false],
  ["remark", "备注", PositionFieldType.LONG_TEXT, PositionFieldScope.CANDIDATE, true, true]
] as const;

const STATUS_OPTIONS = Object.values(CandidateStatus);

function invalidatePositionCaches() {
  invalidateCacheByPrefix("positions:", "departments:", "dashboard:", "candidates:");
}

export async function ensureDefaultPositionFields(positionId: string) {
  // 每个岗位首次进入进度表前自动补齐默认字段，保证进度表、AI Intake 和导入逻辑有一致 schema。
  const count = await prisma.positionFieldDefinition.count({ where: { positionId } });
  if (count) {
    return;
  }

  await prisma.positionFieldDefinition.createMany({
    data: DEFAULT_FIELDS.map(([key, label, fieldType, scope, visible, aiExtractable], index) => ({
      id: makeId("field"),
      positionId,
      key,
      label,
      fieldType,
      scope,
      visible,
      editable: !["applied_at", "resume"].includes(key),
      required: ["name", "status"].includes(key),
      aiExtractable,
      system: ["applied_at", "status"].includes(key),
      options:
        key === "status"
          ? STATUS_OPTIONS
          : key === "first_interview_result"
            ? ["待反馈", "通过", "淘汰", "待定"]
            : [],
      defaultValue: key === "city" ? "长沙" : undefined,
      autoFillRule:
        key === "hr"
          ? { source: "CURRENT_USER" }
          : key === "city"
            ? { source: "STATIC", value: "长沙" }
            : aiExtractable && (scope === PositionFieldScope.APPLICATION || key === "education")
              ? { source: "AI_RESUME" }
              : { source: "NONE" },
      conflictPolicy: key === "remark" ? "APPEND" : "FILL_EMPTY",
      sortOrder: index,
      width: fieldType === PositionFieldType.LONG_TEXT ? 240 : 160,
      schemaVersion: 1,
      active: true
    }))
  });
}

export async function createPosition(payload: {
  title: string;
  departmentId?: string | null;
  department?: string | null;
  headcount: number;
  owner?: string | null;
  recruitmentStatus?: PositionRecruitmentStatus;
  priority?: PositionPriority;
  description?: string | null;
}) {
  const existing = await prisma.position.findFirst({
    where: {
      title: { equals: payload.title, mode: "insensitive" },
      deletedAt: null
    }
  });
  if (existing) {
    throw new Error("鍚屽悕宀椾綅宸茬粡瀛樺湪");
  }

  const department = await resolveDepartment({
    departmentId: payload.departmentId,
    departmentName: payload.department
  });
  const position = await prisma.position.create({
    data: {
      id: makeId("pos"),
      title: payload.title,
      department: department?.name ?? null,
      departmentId: department?.id ?? null,
      headcount: payload.headcount,
      owner: payload.owner ?? null,
      description: payload.description ?? null,
      recruitmentStatus: payload.recruitmentStatus ?? PositionRecruitmentStatus.NORMAL,
      priority: payload.priority ?? PositionPriority.REGULAR,
      positionCreatedAt: new Date(),
      status: "open"
    }
  });
  await ensureDefaultPositionFields(position.id);
  invalidatePositionCaches();
  return position;
}

export async function updatePositionJobDescription(
  positionId: string,
  description?: string | null
) {
  const position = await prisma.position.findFirst({
    where: {
      id: positionId,
      deletedAt: null
    },
    select: { id: true }
  });

  if (!position) {
    throw new Error("宀椾綅涓嶅瓨鍦ㄦ垨宸茶鍒犻櫎");
  }

  const updated = await prisma.position.update({
    where: { id: positionId },
    data: {
      description: description?.trim() || null,
      updatedAt: new Date()
    },
    select: {
      id: true,
      title: true,
      description: true,
      updatedAt: true
    }
  });

  invalidatePositionCaches();
  return updated;
}

export async function listPositionProgress() {
  const positions = await prisma.position.findMany({
    where: { deletedAt: null },
    include: {
      applications: {
        where: { deletedAt: null },
        select: { status: true, updatedAt: true }
      },
      _count: {
        select: { fieldDefinitions: true }
      }
    },
    orderBy: [{ priority: "asc" }, { recruitmentStatus: "asc" }, { updatedAt: "desc" }]
  });

  return positions.map((position) => {
    const active = position.applications.filter((item) => item.status !== CandidateStatus.ONBOARD).length;
    const onboard = position.applications.filter((item) => item.status === CandidateStatus.ONBOARD).length;
    return {
      ...position,
      applicationCount: position.applications.length,
      activeCount: active,
      onboardCount: onboard,
      completionRate: position.headcount ? Math.min(100, Math.round((onboard / position.headcount) * 100)) : 0,
      fieldCount: position._count.fieldDefinitions
    };
  });
}

export async function getPositionProgress(positionId: string) {
  const exists = await prisma.position.findUnique({
    where: { id: positionId },
    select: { id: true, deletedAt: true }
  });
  if (!exists || exists.deletedAt) {
    return null;
  }
  await ensureDefaultPositionFields(positionId);
  return prisma.position.findUnique({
    where: { id: positionId },
    include: {
      fieldDefinitions: {
        where: { active: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
      },
      applications: {
        where: { deletedAt: null },
        include: { candidate: true },
        orderBy: { updatedAt: "desc" }
      }
    }
  });
}

export async function batchUpdatePositions(
  ids: string[],
  patch: {
    departmentId?: string | null;
    department?: string | null;
    owner?: string | null;
    headcount?: number;
    status?: "open" | "closed";
    recruitmentStatus?: PositionRecruitmentStatus;
    priority?: PositionPriority;
    positionCreatedAt?: string;
  }
) {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  const department =
    patch.departmentId !== undefined || patch.department !== undefined
      ? await resolveDepartment({
          departmentId: patch.departmentId,
          departmentName: patch.department
        })
      : undefined;
  const result = await prisma.position.updateMany({
    where: {
      id: { in: uniqueIds },
      deletedAt: null
    },
    data: {
      ...(department !== undefined
        ? {
            department: department?.name ?? null,
            departmentId: department?.id ?? null
          }
        : {}),
      ...(patch.owner !== undefined ? { owner: patch.owner } : {}),
      ...(patch.headcount !== undefined ? { headcount: patch.headcount } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.recruitmentStatus !== undefined ? { recruitmentStatus: patch.recruitmentStatus } : {}),
      ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
      ...(patch.positionCreatedAt !== undefined
        ? { positionCreatedAt: new Date(`${patch.positionCreatedAt}T00:00:00.000Z`) }
        : {}),
      updatedAt: new Date()
    }
  });
  invalidatePositionCaches();
  return result;
}

export async function softDeletePositions(ids: string[]) {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  const deletedAt = new Date();
  const result = await prisma.position.updateMany({
    where: {
      id: { in: uniqueIds },
      deletedAt: null
    },
    data: {
      deletedAt,
      status: "deleted",
      updatedAt: deletedAt
    }
  });
  invalidatePositionCaches();
  return result;
}

export async function replacePositionFields(
  positionId: string,
  fields: Array<{
    id?: string;
    key: string;
    label: string;
    fieldType: PositionFieldType;
    scope: PositionFieldScope;
    required: boolean;
    visible: boolean;
    editable: boolean;
    aiExtractable: boolean;
    system: boolean;
    options: string[];
    defaultValue?: unknown;
    autoFillRule: {
      source: "NONE" | "STATIC" | "CURRENT_USER" | "CURRENT_DATE" | "POSITION_TITLE" | "AI_RESUME";
      value?: unknown;
    };
    conflictPolicy: string;
    sortOrder: number;
    width: number;
    active: boolean;
  }>,
  operator?: { id?: string | null; name?: string | null }
) {
  // 字段配置采用“保留系统字段、停用缺失非系统字段、upsert 当前字段”的方式，避免历史申请数据失去 schema 参照。
  const existing = await prisma.positionFieldDefinition.findMany({ where: { positionId } });
  const systemKeys = new Set(existing.filter((field) => field.system).map((field) => field.key));
  for (const key of systemKeys) {
    if (!fields.some((field) => field.key === key && field.active)) {
      throw new Error(`绯荤粺瀛楁 ${key} 涓嶈兘鍒犻櫎`);
    }
  }

  await prisma.$transaction(async (tx) => {
    const nextKeys = new Set(fields.map((field) => field.key));
    await tx.positionFieldDefinition.updateMany({
      where: { positionId, key: { notIn: Array.from(nextKeys) }, system: false },
      data: { active: false }
    });

    for (const [index, field] of fields.entries()) {
      const existingField = existing.find((item) => item.key === field.key);
      const data = {
        label: field.label,
        fieldType: field.fieldType,
        scope: field.scope,
        required: field.required,
        visible: field.visible,
        editable: field.editable,
        aiExtractable: field.aiExtractable,
        system: existingField?.system ?? field.system,
        options: toPrismaJson(field.options),
        defaultValue: toPrismaNullableJson(field.defaultValue),
        autoFillRule: toPrismaJson(field.autoFillRule),
        conflictPolicy: field.conflictPolicy,
        sortOrder: index,
        width: field.width,
        active: field.active,
        schemaVersion: (existingField?.schemaVersion ?? 0) + 1
      };

      await tx.positionFieldDefinition.upsert({
        where: { positionId_key: { positionId, key: field.key } },
        update: data,
        create: {
          id: field.id ?? makeId("field"),
          positionId,
          key: field.key,
          ...data
        }
      });
    }

    await tx.recruitmentApplication.updateMany({
      where: { positionId },
      data: { schemaVersion: { increment: 1 } }
    });
  });
  const applications = await prisma.recruitmentApplication.findMany({
    where: { positionId, deletedAt: null },
    select: {
      candidateId: true,
      status: true,
      source: true
    }
  });
  for (const application of applications) {
    await ensureApplicationForCandidate({
      candidateId: application.candidateId,
      positionId,
      status: application.status,
      source: application.source,
      ownerId: operator?.id,
      ownerName: operator?.name
    });
  }
  invalidatePositionCaches();
  return getPositionProgress(positionId);
}

function jsonObject(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

type AutoFillSource =
  | "NONE"
  | "STATIC"
  | "CURRENT_USER"
  | "CURRENT_DATE"
  | "POSITION_TITLE"
  | "AI_RESUME";

function autoFillRuleOf(field: PositionFieldDefinition) {
  const value = jsonObject(field.autoFillRule ?? {});
  return {
    source: (typeof value.source === "string" ? value.source : "NONE") as AutoFillSource,
    value: value.value
  };
}

function isEmptyValue(value: unknown) {
  return value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
}

function normalizedFieldIdentity(field: Pick<PositionFieldDefinition, "key" | "label">) {
  return `${field.key} ${field.label}`.toLowerCase().replace(/[\s_-]/g, "");
}

function isResumeField(field: Pick<PositionFieldDefinition, "key" | "label">) {
  return /(resume|cv|简历)/i.test(normalizedFieldIdentity(field));
}

function isEducationField(field: Pick<PositionFieldDefinition, "key" | "label">) {
  return /(education|degree|瀛﹀巻|鏁欒偛绋嬪害)/i.test(normalizedFieldIdentity(field));
}

function isBasicProfileField(field: Pick<PositionFieldDefinition, "key" | "label">) {
  return /(basicprofile|鍩烘湰鎯呭喌|鍊欓€変汉姒傚喌|鍊欓€変汉鎽樿)/i.test(normalizedFieldIdentity(field));
}

function rawInputHasStoredFile(parsedResult: Prisma.JsonValue | null) {
  const result = jsonObject(parsedResult ?? {});
  const inputMeta = jsonObject((result.inputMeta ?? {}) as Prisma.JsonValue);
  return typeof inputMeta.storedFileName === "string" && inputMeta.storedFileName.length > 0;
}

function rawInputOriginalFileName(parsedResult: Prisma.JsonValue | null) {
  const result = jsonObject(parsedResult ?? {});
  const inputMeta = jsonObject((result.inputMeta ?? {}) as Prisma.JsonValue);
  return typeof inputMeta.fileName === "string" && inputMeta.fileName.trim()
    ? inputMeta.fileName.trim()
    : null;
}

function buildBasicProfile(agentRemark?: string | null, followUpSuggestion?: string | null) {
  const sections = [
    agentRemark?.trim() ? `Agent 澶囨敞锛?{agentRemark.trim()}` : null,
    followUpSuggestion?.trim() ? `AI 璺熻繘寤鸿锛?{followUpSuggestion.trim()}` : null
  ].filter(Boolean);
  return sections.length ? sections.join("\n") : null;
}

function resolvePresetValue(
  field: PositionFieldDefinition,
  context: {
    currentUser?: { id?: string | null; name?: string | null };
    positionTitle: string;
    now: Date;
    education?: string | null;
    resumeUrl?: string | null;
    agentRemark?: string | null;
    followUpSuggestion?: string | null;
  }
) {
  // 申请记录创建时按字段规则自动填充 HR、日期、岗位名、简历链接、学历和候选人摘要等默认值。
  const rule = autoFillRuleOf(field);
  if (isResumeField(field) && context.resumeUrl) {
    return context.resumeUrl;
  }
  if (isEducationField(field) && context.education) {
    return context.education;
  }
  if (isBasicProfileField(field)) {
    return buildBasicProfile(context.agentRemark, context.followUpSuggestion);
  }
  switch (rule.source) {
    case "STATIC":
      return rule.value ?? field.defaultValue ?? null;
    case "CURRENT_USER":
      return context.currentUser?.name ?? null;
    case "CURRENT_DATE":
      return context.now.toISOString().slice(0, 10);
    case "POSITION_TITLE":
      return context.positionTitle;
    case "AI_RESUME":
      if (isResumeField(field)) return context.resumeUrl ?? null;
      if (isEducationField(field)) return context.education ?? null;
      return null;
    default:
      return field.defaultValue ?? null;
  }
}

function candidateValueKey(key: string) {
  return ["name", "phone", "email", "school", "education", "major", "yearsOfExperience", "source", "remark"].includes(key)
    ? key
    : null;
}

function normalizeValue(field: PositionFieldDefinition, value: unknown) {
  if (value === "" || value === undefined) return null;
  if (field.fieldType === PositionFieldType.NUMBER || field.fieldType === PositionFieldType.MONEY) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) throw new Error(`${field.label} 必须是数字`);
    return numeric;
  }
  if (field.fieldType === PositionFieldType.BOOLEAN) return Boolean(value);
  if (field.fieldType === PositionFieldType.MULTI_SELECT) {
    return Array.isArray(value) ? value.map(String) : String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  }
  return value === null ? null : String(value);
}

function chinaCalendarDate(date: Date) {
  const chinaTime = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return new Date(
    Date.UTC(
      chinaTime.getUTCFullYear(),
      chinaTime.getUTCMonth(),
      chinaTime.getUTCDate()
    )
  );
}

export async function updateApplicationProgress(
  applicationId: string,
  payload: {
    status?: CandidateStatus;
    appliedAt?: string;
    values?: Record<string, unknown>;
    source?: string;
  },
  operator?: { id?: string; name?: string }
) {
  // 岗位进度表的单条编辑入口：同时处理申请字段、候选人字段、负责人、状态流转和字段变更记录。
  const application = await prisma.recruitmentApplication.findUnique({
    where: { id: applicationId },
    include: {
      candidate: true,
      position: { include: { fieldDefinitions: { where: { active: true } } } }
    }
  });
  if (!application) throw new Error("宀椾綅鎶曢€掕褰曚笉瀛樺湪");

  const fields = new Map(application.position.fieldDefinitions.map((field) => [field.key, field]));
  const currentCustomValues = jsonObject(application.customValues);
  const nextCustomValues = { ...currentCustomValues };
  const candidatePatch: Record<string, unknown> = {};
  const changes: Array<{ key: string; oldValue: unknown; newValue: unknown }> = [];
  let nextOwnerName = application.ownerName;

  for (const [key, rawValue] of Object.entries(payload.values ?? {})) {
    const field = fields.get(key);
    if (!field || !field.editable) continue;
    const value = normalizeValue(field, rawValue);
    if (key === "hr") {
      nextOwnerName = typeof value === "string" && value.trim() ? value.trim() : null;
      if ((application.ownerName ?? null) !== nextOwnerName) {
        changes.push({
          key,
          oldValue: application.ownerName,
          newValue: nextOwnerName
        });
      }
      continue;
    }
    const candidateKey = field.scope === PositionFieldScope.CANDIDATE ? candidateValueKey(key) : null;
    const oldValue = candidateKey
      ? application.candidate[candidateKey as keyof typeof application.candidate]
      : currentCustomValues[key];

    if (payload.source === "AI_INTAKE") {
      if (field.conflictPolicy === "MANUAL_ONLY" || field.conflictPolicy === "REQUIRE_CONFIRMATION") {
        continue;
      }
      if (field.conflictPolicy === "FILL_EMPTY" && !isEmptyValue(oldValue)) {
        continue;
      }
    }

    if (candidateKey) candidatePatch[candidateKey] = value;
    else nextCustomValues[key] = value;
    if (JSON.stringify(oldValue ?? null) !== JSON.stringify(value ?? null)) {
      changes.push({ key, oldValue, newValue: value });
    }
  }

  const nextStatus = payload.status ?? application.status;
  if (nextStatus !== application.status) {
    changes.push({ key: "status", oldValue: application.status, newValue: nextStatus });
  }
  const nextAppliedAt = payload.appliedAt
    ? new Date(`${payload.appliedAt}T00:00:00.000Z`)
    : application.appliedAt;
  if (Number.isNaN(nextAppliedAt.getTime())) {
    throw new Error("鎶曢€掓棩鏈熸牸寮忎笉姝ｇ‘");
  }
  const currentAppliedDate = application.appliedAt.toISOString().slice(0, 10);
  const nextAppliedDate = nextAppliedAt.toISOString().slice(0, 10);
  if (nextAppliedDate !== currentAppliedDate) {
    changes.push({
      key: "applied_at",
      oldValue: currentAppliedDate,
      newValue: nextAppliedDate
    });
  }

  const result = await prisma.$transaction(async (tx) => {
    if (Object.keys(candidatePatch).length) {
      await tx.candidate.update({
        where: { id: application.candidateId },
        data: { ...candidatePatch, updatedAt: new Date() }
      });
    }
    const updated = await tx.recruitmentApplication.update({
      where: { id: application.id },
      data: {
        status: nextStatus,
        appliedAt: nextAppliedAt,
        ownerName: nextOwnerName,
        customValues: toPrismaJson(nextCustomValues),
        lastFollowUpAt: new Date()
      }
    });
    if (nextStatus !== application.status) {
      await tx.recruitmentLog.create({
        data: {
          id: makeId("log"),
          candidateId: application.candidateId,
          applicationId: application.id,
          fromStatus: application.status,
          toStatus: nextStatus,
          note: "岗位招聘进度表更新",
          source: payload.source ?? "manual",
          createdBy: operator?.name ?? "HR"
        }
      });
      // 同步候选人主状态，保证旧候选人列表和新岗位申请进度在过渡期展示一致。
      if (application.candidate.positionId === application.positionId) {
        await tx.candidate.update({
          where: { id: application.candidateId },
          data: { status: nextStatus, lastFollowUpAt: new Date() }
        });
      }
    }
    if (changes.length) {
      await tx.applicationFieldChange.createMany({
        data: changes.map((change) => ({
          id: makeId("change"),
          applicationId: application.id,
          fieldKey: change.key,
          oldValue: toPrismaNullableJson(change.oldValue),
          newValue: toPrismaNullableJson(change.newValue),
          source: payload.source ?? "MANUAL",
          operatorId: operator?.id ?? null,
          operatorName: operator?.name ?? null
        }))
      });
    }
    return updated;
  });
  invalidatePositionCaches();
  return result;
}

export async function ensureApplicationForCandidate(params: {
  candidateId: string;
  positionId: string;
  status: CandidateStatus;
  source?: string | null;
  rawInputId?: string | null;
  ownerId?: string | null;
  ownerName?: string | null;
}) {
  // Candidate 是人才库实体；RecruitmentApplication 是候选人在某个岗位下的流程实体。
  // 这里保证二者存在稳定关联，并按岗位字段规则补齐申请默认值。
  await ensureDefaultPositionFields(params.positionId);
  const position = await prisma.position.findUnique({
    where: { id: params.positionId },
    include: {
      fieldDefinitions: {
        where: { active: true },
        orderBy: { sortOrder: "asc" }
      }
    }
  });
  if (!position || position.deletedAt) {
    throw new Error("目标岗位不存在或已删除");
  }

  const candidateContext = await prisma.candidate.findUnique({
    where: { id: params.candidateId },
    select: {
      education: true,
      remark: true,
      followUpSuggestion: true,
      rawInputs: {
        where: { inputType: "RESUME" },
        orderBy: { createdAt: "desc" },
        select: { id: true, parsedResult: true, createdAt: true },
        take: 10
      }
    }
  });
  const requestedRawInput = params.rawInputId
    ? await prisma.rawInput.findUnique({
        where: { id: params.rawInputId },
        select: { id: true, parsedResult: true, createdAt: true }
      })
    : null;
  const resumeRawInput =
    (requestedRawInput && rawInputHasStoredFile(requestedRawInput.parsedResult)
      ? requestedRawInput
      : candidateContext?.rawInputs.find((item) => rawInputHasStoredFile(item.parsedResult))) ?? null;
  const resumeFileName = resumeRawInput
    ? rawInputOriginalFileName(resumeRawInput.parsedResult)
    : null;
  const resumeUrl = resumeRawInput
    ? `/api/raw-inputs/${resumeRawInput.id}/file${
        resumeFileName ? `?filename=${encodeURIComponent(resumeFileName)}` : ""
      }`
    : null;

  let application = await prisma.recruitmentApplication.upsert({
    where: { candidateId_positionId: { candidateId: params.candidateId, positionId: params.positionId } },
    update: {
      status: params.status,
      source: params.source ?? undefined,
      ownerId: params.ownerId ?? undefined,
      ownerName: params.ownerName ?? undefined,
      lastFollowUpAt: new Date(),
      deletedAt: null
    },
    create: {
      id: makeId("app"),
      candidateId: params.candidateId,
      positionId: params.positionId,
      status: params.status,
      source: params.source ?? null,
      ownerId: params.ownerId ?? null,
      ownerName: params.ownerName ?? null,
      appliedAt: chinaCalendarDate(
        requestedRawInput?.createdAt ?? resumeRawInput?.createdAt ?? new Date()
      ),
      customValues: {},
      lastFollowUpAt: new Date()
    }
  });

  const currentValues = jsonObject(application.customValues);
  const nextValues = { ...currentValues };
  const presetChanges: Array<{ key: string; value: unknown }> = [];
  const now = new Date();
  for (const field of position.fieldDefinitions) {
    if (field.scope !== PositionFieldScope.APPLICATION || field.system || !isEmptyValue(currentValues[field.key])) {
      continue;
    }
    const presetValue = resolvePresetValue(field, {
      currentUser: { id: params.ownerId, name: params.ownerName },
      positionTitle: position.title,
      now,
      education: candidateContext?.education,
      resumeUrl,
      agentRemark: candidateContext?.remark,
      followUpSuggestion: candidateContext?.followUpSuggestion
    });
    const value = isEmptyValue(presetValue) ? null : normalizeValue(field, presetValue);
    if (isEmptyValue(value)) continue;
    nextValues[field.key] = value;
    presetChanges.push({ key: field.key, value });
  }

  if (presetChanges.length || params.ownerName) {
    application = await prisma.$transaction(async (tx) => {
      const updated = await tx.recruitmentApplication.update({
        where: { id: application.id },
        data: {
          customValues: toPrismaJson(nextValues),
          ownerId: params.ownerId ?? application.ownerId,
          ownerName: params.ownerName ?? application.ownerName
        }
      });
      if (presetChanges.length) {
        await tx.applicationFieldChange.createMany({
          data: presetChanges.map((change) => ({
            id: makeId("change"),
            applicationId: application.id,
            fieldKey: change.key,
            oldValue: Prisma.JsonNull,
            newValue: toPrismaNullableJson(change.value),
            source: "PRESET",
            operatorId: params.ownerId ?? null,
            operatorName: params.ownerName ?? null
          }))
        });
      }
      return updated;
    });
  }
  if (params.rawInputId) {
    await prisma.$transaction([
      prisma.rawInput.updateMany({
        where: { id: params.rawInputId },
        data: { applicationId: application.id }
      }),
      prisma.agentTask.updateMany({
        where: { rawInputId: params.rawInputId },
        data: { applicationId: application.id }
      })
    ]);
  }
  invalidatePositionCaches();
  return application;
}

type PositionProgressImportRow = {
  action: "UPDATE" | "CREATE";
  applicationId?: string;
  values: Record<string, unknown>;
  status?: CandidateStatus;
  appliedAt?: string;
};

function candidateSnapshot(candidate: {
  name: string;
  phone: string | null;
  email: string | null;
  school: string | null;
  education: string | null;
  major: string | null;
  yearsOfExperience: number | null;
  source: string | null;
  remark: string | null;
  status: CandidateStatus;
  updatedAt: Date;
}) {
  return {
    name: candidate.name,
    phone: candidate.phone,
    email: candidate.email,
    school: candidate.school,
    education: candidate.education,
    major: candidate.major,
    yearsOfExperience: candidate.yearsOfExperience,
    source: candidate.source,
    remark: candidate.remark,
    status: candidate.status,
    updatedAt: candidate.updatedAt.toISOString()
  };
}

function applicationSnapshot(application: {
  status: CandidateStatus;
  ownerId: string | null;
  ownerName: string | null;
  source: string | null;
  appliedAt: Date;
  customValues: Prisma.JsonValue;
  lastFollowUpAt: Date | null;
  deletedAt: Date | null;
  updatedAt: Date;
}) {
  return {
    status: application.status,
    ownerId: application.ownerId,
    ownerName: application.ownerName,
    source: application.source,
    appliedAt: application.appliedAt.toISOString(),
    customValues: application.customValues,
    lastFollowUpAt: application.lastFollowUpAt?.toISOString() ?? null,
    deletedAt: application.deletedAt?.toISOString() ?? null,
    updatedAt: application.updatedAt.toISOString()
  };
}

function importRowData(
  row: PositionProgressImportRow,
  fields: PositionFieldDefinition[]
) {
  const fieldMap = new Map(fields.map((field) => [field.key, field]));
  const candidateData: Record<string, unknown> = {};
  const customValues: Record<string, unknown> = {};
  let ownerName: string | null | undefined;

  for (const [key, rawValue] of Object.entries(row.values)) {
    const field = fieldMap.get(key);
    if (!field || !field.editable || key === "status" || key === "applied_at") continue;
    const value = normalizeValue(field, rawValue);
    if (key === "hr") {
      ownerName = typeof value === "string" && value.trim() ? value.trim() : null;
      continue;
    }
    const candidateKey =
      field.scope === PositionFieldScope.CANDIDATE ? candidateValueKey(key) : null;
    if (candidateKey) candidateData[candidateKey] = value;
    else customValues[key] = value;
  }

  return { candidateData, customValues, ownerName };
}

export async function importPositionProgress(
  positionId: string,
  rows: PositionProgressImportRow[],
  operator: { id?: string; name?: string }
) {
  // 岗位进度表导入会记录批次和每条变更快照，撤回时依赖这些快照判断是否还能安全回滚。
  await ensureDefaultPositionFields(positionId);
  const position = await prisma.position.findFirst({
    where: { id: positionId, deletedAt: null },
    include: { fieldDefinitions: { where: { active: true } } }
  });
  if (!position) throw new Error("目标岗位不存在或已删除");

  const batchId = makeId("import");
  const result = await prisma.$transaction(async (tx) => {
    await tx.recruitmentImportBatch.create({
      data: {
        id: batchId,
        positionId,
        createdById: operator.id ?? null,
        createdByName: operator.name ?? null
      }
    });

    let created = 0;
    let updated = 0;
    for (const row of rows) {
      const prepared = importRowData(row, position.fieldDefinitions);
      const appliedAt = row.appliedAt
        ? new Date(`${row.appliedAt}T00:00:00.000Z`)
        : new Date();
      if (Number.isNaN(appliedAt.getTime())) throw new Error("鎶曢€掓棩鏈熸牸寮忎笉姝ｇ‘");

      if (row.action === "UPDATE") {
        const application = await tx.recruitmentApplication.findFirst({
          where: {
            id: row.applicationId,
            positionId,
            deletedAt: null
          },
          include: { candidate: true }
        });
        if (!application) throw new Error("待更新的招聘进度记录不存在或已发生变化");

        const beforeCandidate = candidateSnapshot(application.candidate);
        const beforeApplication = applicationSnapshot(application);
        const nextCustomValues = {
          ...jsonObject(application.customValues),
          ...prepared.customValues
        };
        const candidateUpdated = Object.keys(prepared.candidateData).length
          ? await tx.candidate.update({
              where: { id: application.candidateId },
              data: {
                ...prepared.candidateData,
                ...(row.status ? { status: row.status } : {}),
                updatedAt: new Date()
              }
            })
          : row.status
            ? await tx.candidate.update({
                where: { id: application.candidateId },
                data: { status: row.status, updatedAt: new Date() }
              })
            : application.candidate;
        const applicationUpdated = await tx.recruitmentApplication.update({
          where: { id: application.id },
          data: {
            status: row.status ?? application.status,
            ...(row.appliedAt ? { appliedAt } : {}),
            ...(prepared.ownerName !== undefined ? { ownerName: prepared.ownerName } : {}),
            customValues: toPrismaJson(nextCustomValues),
            lastFollowUpAt: new Date()
          }
        });

        await tx.recruitmentImportEntry.create({
          data: {
            id: makeId("import_entry"),
            batchId,
            action: "UPDATE",
            applicationId: application.id,
            candidateId: application.candidateId,
            beforeCandidate: toPrismaNullableJson(beforeCandidate),
            beforeApplication: toPrismaNullableJson(beforeApplication),
            appliedCandidateAt: candidateUpdated.updatedAt,
            appliedApplicationAt: applicationUpdated.updatedAt
          }
        });
        updated += 1;
        continue;
      }

      const name = String(prepared.candidateData.name ?? "").trim();
      if (!name) throw new Error("鏂板璁板綍缂哄皯濮撳悕");
      const status = row.status ?? CandidateStatus.RECOMMENDED;
      const candidate = await tx.candidate.create({
        data: {
          id: makeId("cand"),
          name,
          phone: (prepared.candidateData.phone as string | null | undefined) ?? null,
          email: (prepared.candidateData.email as string | null | undefined) ?? null,
          school: (prepared.candidateData.school as string | null | undefined) ?? null,
          education: (prepared.candidateData.education as string | null | undefined) ?? null,
          major: (prepared.candidateData.major as string | null | undefined) ?? null,
          yearsOfExperience:
            (prepared.candidateData.yearsOfExperience as number | null | undefined) ?? null,
          source: (prepared.candidateData.source as string | null | undefined) ?? "琛ㄦ牸瀵煎叆",
          remark: (prepared.candidateData.remark as string | null | undefined) ?? null,
          status,
          positionId,
          lastFollowUpAt: new Date()
        }
      });
      const application = await tx.recruitmentApplication.create({
        data: {
          id: makeId("app"),
          candidateId: candidate.id,
          positionId,
          status,
          source: "琛ㄦ牸瀵煎叆",
          ownerId: operator.id ?? null,
          ownerName: prepared.ownerName ?? operator.name ?? null,
          appliedAt,
          customValues: toPrismaJson(prepared.customValues),
          lastFollowUpAt: new Date()
        }
      });
      await tx.recruitmentLog.create({
        data: {
          id: makeId("log"),
          candidateId: candidate.id,
          applicationId: application.id,
          toStatus: status,
          note: "通过招聘进度表导入新增。",
          source: "IMPORT",
          createdBy: operator.name ?? "HR"
        }
      });
      await tx.recruitmentImportEntry.create({
        data: {
          id: makeId("import_entry"),
          batchId,
          action: "CREATE",
          applicationId: application.id,
          candidateId: candidate.id,
          appliedCandidateAt: candidate.updatedAt,
          appliedApplicationAt: application.updatedAt
        }
      });
      created += 1;
    }

    return { batchId, created, updated };
  });
  invalidatePositionCaches();
  return result;
}

function jsonSnapshot(value: Prisma.JsonValue | null) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function undoPositionProgressImport(
  positionId: string,
  batchId: string
) {
  // 撤回导入前先校验导入后的候选人/申请是否被再次修改，避免覆盖用户后续手工维护的数据。
  const batch = await prisma.recruitmentImportBatch.findFirst({
    where: { id: batchId, positionId },
    include: { entries: { orderBy: { createdAt: "desc" } } }
  });
  if (!batch) throw new Error("导入批次不存在");
  if (batch.status !== "APPLIED") throw new Error("璇ュ鍏ユ壒娆″凡鎾ゅ洖");

  await prisma.$transaction(async (tx) => {
    for (const entry of batch.entries) {
      const application = entry.applicationId
        ? await tx.recruitmentApplication.findUnique({
            where: { id: entry.applicationId },
            select: { updatedAt: true }
          })
        : null;
      const candidate = entry.candidateId
        ? await tx.candidate.findUnique({
            where: { id: entry.candidateId },
            select: { updatedAt: true }
          })
        : null;
      if (
        !application ||
        !candidate ||
        (entry.appliedApplicationAt &&
          application.updatedAt.getTime() !== entry.appliedApplicationAt.getTime()) ||
        (entry.appliedCandidateAt &&
          candidate.updatedAt.getTime() !== entry.appliedCandidateAt.getTime())
      ) {
        throw new Error("导入后的记录已被再次修改，无法安全撤回，请先刷新并人工确认");
      }
    }

    for (const entry of batch.entries) {
      if (entry.action === "CREATE") {
        await tx.candidate.delete({ where: { id: entry.candidateId! } });
        continue;
      }
      const candidateBefore = jsonSnapshot(entry.beforeCandidate);
      const applicationBefore = jsonSnapshot(entry.beforeApplication);
      await tx.candidate.update({
        where: { id: entry.candidateId! },
        data: {
          name: String(candidateBefore.name ?? ""),
          phone: (candidateBefore.phone as string | null | undefined) ?? null,
          email: (candidateBefore.email as string | null | undefined) ?? null,
          school: (candidateBefore.school as string | null | undefined) ?? null,
          education: (candidateBefore.education as string | null | undefined) ?? null,
          major: (candidateBefore.major as string | null | undefined) ?? null,
          yearsOfExperience:
            (candidateBefore.yearsOfExperience as number | null | undefined) ?? null,
          source: (candidateBefore.source as string | null | undefined) ?? null,
          remark: (candidateBefore.remark as string | null | undefined) ?? null,
          status: candidateBefore.status as CandidateStatus
        }
      });
      await tx.recruitmentApplication.update({
        where: { id: entry.applicationId! },
        data: {
          status: applicationBefore.status as CandidateStatus,
          ownerId: (applicationBefore.ownerId as string | null | undefined) ?? null,
          ownerName: (applicationBefore.ownerName as string | null | undefined) ?? null,
          source: (applicationBefore.source as string | null | undefined) ?? null,
          appliedAt: new Date(String(applicationBefore.appliedAt)),
          customValues: toPrismaJson(
            jsonSnapshot(applicationBefore.customValues as Prisma.JsonValue)
          ),
          lastFollowUpAt: applicationBefore.lastFollowUpAt
            ? new Date(String(applicationBefore.lastFollowUpAt))
            : null,
          deletedAt: applicationBefore.deletedAt
            ? new Date(String(applicationBefore.deletedAt))
            : null
        }
      });
    }
    await tx.recruitmentImportBatch.update({
      where: { id: batch.id },
      data: { status: "UNDONE", undoneAt: new Date() }
    });
  });
  invalidatePositionCaches();
  return { success: true };
}
