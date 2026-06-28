/**
 * Dashboard 汇总数据导入服务。
 *
 * 支持导入岗位需求数据和招聘过程统计数据，并通过 RecruitmentImportBatch/Entry 保存撤回依据。
 * 与岗位、候选人、岗位申请和招聘日志表交互，主要由 Dashboard 导入 API 调用。
 */
import {
  CandidateStatus,
  PositionPriority,
  PositionRecruitmentStatus,
  type Prisma
} from "@prisma/client";

import {
  POSITION_PRIORITY_LABELS,
  POSITION_RECRUITMENT_STATUS_LABELS
} from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { toPrismaJson } from "@/lib/prisma-json";
import { invalidateCacheByPrefix } from "@/lib/server-cache";
import { makeId } from "@/lib/store";
import type {
  DashboardDemandImportInput,
  DashboardProcessImportInput
} from "@/lib/schemas/dashboard-import";

type DashboardProcessRow = DashboardProcessImportInput["rows"][number];

const PRIORITY_TEXT_TO_VALUE = new Map<string, PositionPriority>(
  Object.entries(POSITION_PRIORITY_LABELS).map(([value, label]) => [
    normalizeToken(label),
    value as PositionPriority
  ])
);

const RECRUITMENT_STATUS_TEXT_TO_VALUE = new Map<string, PositionRecruitmentStatus>(
  Object.entries(POSITION_RECRUITMENT_STATUS_LABELS).map(([value, label]) => [
    normalizeToken(label),
    value as PositionRecruitmentStatus
  ])
);

const PROCESS_STAGES = [
  ["invited", CandidateStatus.INVITED],
  ["firstInterview", CandidateStatus.FIRST_INTERVIEW],
  ["secondInterview", CandidateStatus.SECOND_INTERVIEW],
  ["crossInterview", CandidateStatus.CROSS_INTERVIEW],
  ["finalInterview", CandidateStatus.FINAL_INTERVIEW],
  ["passed", CandidateStatus.PASSED],
  ["offer", CandidateStatus.OFFER],
  ["onboard", CandidateStatus.ONBOARD]
] as const;

function normalizeToken(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

function parseRecruitmentStatus(value?: string) {
  if (!value) return undefined;
  return RECRUITMENT_STATUS_TEXT_TO_VALUE.get(normalizeToken(value));
}

function parsePriority(value?: string) {
  if (!value) return undefined;
  return PRIORITY_TEXT_TO_VALUE.get(normalizeToken(value));
}

function parseEventDate(value?: string) {
  const date = value ? new Date(`${value}T00:00:00.000Z`) : new Date();
  if (Number.isNaN(date.getTime())) throw new Error("统计日期格式不正确");
  return date;
}

function rowCount(row: DashboardProcessRow, key: keyof DashboardProcessRow) {
  const value = row[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function targetCount(row: DashboardProcessRow, key: keyof DashboardProcessRow, currentKey: keyof DashboardProcessRow) {
  const target = rowCount(row, key);
  if (row.action === "CREATE") return target;
  return Math.max(0, target - rowCount(row, currentKey));
}

async function findPosition(
  tx: Prisma.TransactionClient,
  row: { positionName?: string }
) {
  if (!row.positionName) return null;
  return tx.position.findFirst({
    where: {
      title: { equals: row.positionName, mode: "insensitive" },
      deletedAt: null
    },
    select: { id: true, title: true }
  });
}

function invalidateDashboardImportCaches() {
  invalidateCacheByPrefix("dashboard:", "positions:", "candidates:");
}

function positionSnapshot(position: {
  headcount: number;
  recruitmentStatus: PositionRecruitmentStatus;
  priority: PositionPriority;
  status: string;
  deletedAt: Date | null;
  updatedAt: Date;
}) {
  return {
    headcount: position.headcount,
    recruitmentStatus: position.recruitmentStatus,
    priority: position.priority,
    status: position.status,
    deletedAt: position.deletedAt?.toISOString() ?? null,
    updatedAt: position.updatedAt.toISOString()
  };
}

export async function importDashboardDemandProgress(input: DashboardDemandImportInput) {
  // 需求导入只更新或创建岗位层面的招聘状态、优先级和 HC，不直接创建候选人。
  const result = await prisma.$transaction(async (tx) => {
    const batchIds: string[] = [];
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const missing: string[] = [];

    for (const row of input.rows) {
      const position = await findPosition(tx, row);
      if (!position && row.action === "UPDATE") {
        missing.push(row.positionName || "未命名岗位");
        continue;
      }

      const data: Prisma.PositionUpdateInput = {};
      const recruitmentStatus = parseRecruitmentStatus(row.status);
      const priority = parsePriority(row.priority);
      if (recruitmentStatus) data.recruitmentStatus = recruitmentStatus;
      if (priority) data.priority = priority;
      if (typeof row.demandHeadcount === "number" && row.demandHeadcount > 0) {
        data.headcount = row.demandHeadcount;
      }

      if (!Object.keys(data).length) {
        skipped += 1;
        continue;
      }

      if (!position && row.action === "CREATE") {
        const createdPosition = await tx.position.create({
          data: {
            id: makeId("pos"),
            title: row.positionName!,
            headcount: typeof row.demandHeadcount === "number" && row.demandHeadcount > 0
              ? row.demandHeadcount
              : 1,
            recruitmentStatus: recruitmentStatus ?? PositionRecruitmentStatus.NORMAL,
            priority: priority ?? PositionPriority.REGULAR,
            status: "open",
            positionCreatedAt: new Date()
          },
          select: { id: true, updatedAt: true }
        });
        const batchId = makeId("import");
        await tx.recruitmentImportBatch.create({
          data: { id: batchId, positionId: createdPosition.id }
        });
        await tx.recruitmentImportEntry.create({
          data: {
            id: makeId("import_entry"),
            batchId,
            action: "CREATE_POSITION",
            appliedApplicationAt: createdPosition.updatedAt
          }
        });
        batchIds.push(batchId);
        created += 1;
        continue;
      }

      const current = await tx.position.findUnique({
        where: { id: position!.id },
        select: {
          headcount: true,
          recruitmentStatus: true,
          priority: true,
          status: true,
          deletedAt: true,
          updatedAt: true
        }
      });
      if (!current) {
        missing.push(row.positionName || "未命名岗位");
        continue;
      }
      const updatedPosition = await tx.position.update({
        where: { id: position!.id },
        data: { ...data, updatedAt: new Date() },
        select: { updatedAt: true }
      });
      const batchId = makeId("import");
      await tx.recruitmentImportBatch.create({
        data: { id: batchId, positionId: position!.id }
      });
      await tx.recruitmentImportEntry.create({
        data: {
          id: makeId("import_entry"),
          batchId,
          action: "UPDATE_POSITION",
          beforeApplication: toPrismaJson(positionSnapshot(current)),
          appliedApplicationAt: updatedPosition.updatedAt
        }
      });
      batchIds.push(batchId);
      updated += 1;
    }

    return { batchIds, created, updated, skipped, missing };
  });
  invalidateDashboardImportCaches();
  return result;
}

export async function importDashboardProcessData(input: DashboardProcessImportInput) {
  // 过程数据是汇总口径，没有候选人明细；导入时按阶段数量生成占位候选人和流程日志用于演示看板。
  const eventDate = parseEventDate(input.eventDate);
  const result = await prisma.$transaction(async (tx) => {
    const batchIds: string[] = [];
    const batchesByPosition = new Map<string, string>();
    let createdCandidates = 0;
    let createdLogs = 0;
    let createdPositions = 0;
    let skipped = 0;
    const missing: string[] = [];

    for (const row of input.rows) {
      let position = await findPosition(tx, row);
      if (!position) {
        if (row.action === "UPDATE") {
          missing.push(row.positionName || "未命名岗位");
          continue;
        }
        const createdPosition = await tx.position.create({
          data: {
            id: makeId("pos"),
            title: row.positionName!,
            headcount: Math.max(1, rowCount(row, "onboard"), rowCount(row, "offer")),
            recruitmentStatus: PositionRecruitmentStatus.NORMAL,
            priority: PositionPriority.REGULAR,
            status: "open",
            positionCreatedAt: eventDate
          },
          select: { id: true, title: true }
        });
        position = createdPosition;
        createdPositions += 1;
      }

      const stageCounts = Object.fromEntries(
        PROCESS_STAGES.map(([key]) => [
          key,
          targetCount(
            row,
            key,
            `current${key[0].toUpperCase()}${key.slice(1)}` as keyof DashboardProcessRow
          )
        ])
      ) as Record<(typeof PROCESS_STAGES)[number][0], number>;
      const poolSize = Math.max(
        targetCount(row, "recommended", "currentRecommended"),
        ...Object.values(stageCounts)
      );
      if (!poolSize) {
        skipped += 1;
        continue;
      }

      let batchId = batchesByPosition.get(position.id);
      if (!batchId) {
        batchId = makeId("import");
        await tx.recruitmentImportBatch.create({
          data: { id: batchId, positionId: position.id }
        });
        batchesByPosition.set(position.id, batchId);
        batchIds.push(batchId);
      }

      for (let index = 0; index < poolSize; index += 1) {
        const reachedStages = PROCESS_STAGES.filter(([key]) => index < stageCounts[key]).map(
          ([, status]) => status
        );
        const finalStatus = reachedStages.at(-1) ?? CandidateStatus.RECOMMENDED;
        const candidate = await tx.candidate.create({
          data: {
            id: makeId("cand"),
            name: `汇总导入-${position.title}-${createdCandidates + 1}`,
            status: finalStatus,
            source: "Dashboard 汇总导入",
            remark: row.remark ?? null,
            positionId: position.id,
            lastFollowUpAt: eventDate
          }
        });
        const application = await tx.recruitmentApplication.create({
          data: {
            id: makeId("app"),
            candidateId: candidate.id,
            positionId: position.id,
            status: finalStatus,
            ownerName: row.recruiter ?? null,
            source: "Dashboard 汇总导入",
            appliedAt: eventDate,
            customValues: toPrismaJson({ dashboardImportRemark: row.remark ?? "" }),
            lastFollowUpAt: eventDate
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

        for (const status of reachedStages) {
          await tx.recruitmentLog.create({
            data: {
              id: makeId("log"),
              candidateId: candidate.id,
              applicationId: application.id,
              toStatus: status,
              note: "通过 Dashboard 岗位过程数据导入生成。",
              source: "DASHBOARD_IMPORT",
              createdBy: row.recruiter ?? "HR",
              createdAt: eventDate
            }
          });
          createdLogs += 1;
        }
        createdCandidates += 1;
      }
    }

    return { batchIds, createdPositions, createdCandidates, createdLogs, skipped, missing };
  });
  invalidateDashboardImportCaches();
  return result;
}

function jsonSnapshot(value: Prisma.JsonValue | null) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function undoDashboardImportBatches(batchIds: string[]) {
  // Dashboard 导入撤回同样做时间戳校验，确认导入后未被二次修改再回滚或软删除岗位。
  const uniqueBatchIds = Array.from(new Set(batchIds.filter(Boolean)));
  if (!uniqueBatchIds.length) throw new Error("缺少导入批次");

  await prisma.$transaction(async (tx) => {
    const batches = await tx.recruitmentImportBatch.findMany({
      where: { id: { in: uniqueBatchIds } },
      include: { entries: { orderBy: { createdAt: "desc" } } }
    });
    if (batches.length !== uniqueBatchIds.length) throw new Error("部分导入批次不存在");

    for (const batch of batches) {
      if (batch.status !== "APPLIED") throw new Error("该导入批次已经撤回");
      const position = await tx.position.findUnique({
        where: { id: batch.positionId },
        include: { _count: { select: { applications: true, candidates: true } } }
      });
      for (const entry of batch.entries) {
        if (entry.action === "UPDATE_POSITION") {
          if (
            !position ||
            (entry.appliedApplicationAt &&
              position.updatedAt.getTime() !== entry.appliedApplicationAt.getTime())
          ) {
            throw new Error("导入后的岗位已被再次修改，无法安全撤回，请先刷新并人工确认");
          }
        }
        if (entry.action === "CREATE_POSITION") {
          if (
            !position ||
            position._count.applications > 0 ||
            position._count.candidates > 0 ||
            (entry.appliedApplicationAt &&
              position.updatedAt.getTime() !== entry.appliedApplicationAt.getTime())
          ) {
            throw new Error("导入新增的岗位已产生招聘数据，无法安全撤回，请先人工确认");
          }
        }
        if (entry.action === "CREATE") {
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
            throw new Error("导入后的候选人已被再次修改，无法安全撤回，请先刷新并人工确认");
          }
        }
      }
    }

    for (const batch of batches) {
      for (const entry of batch.entries) {
        if (entry.action === "CREATE") {
          await tx.candidate.delete({ where: { id: entry.candidateId! } });
          continue;
        }
        if (entry.action === "UPDATE_POSITION") {
          const before = jsonSnapshot(entry.beforeApplication);
          await tx.position.update({
            where: { id: batch.positionId },
            data: {
              headcount: Number(before.headcount ?? 1),
              recruitmentStatus: before.recruitmentStatus as PositionRecruitmentStatus,
              priority: before.priority as PositionPriority,
              status: String(before.status ?? "open"),
              deletedAt: before.deletedAt ? new Date(String(before.deletedAt)) : null
            }
          });
          continue;
        }
        if (entry.action === "CREATE_POSITION") {
          await tx.position.update({
            where: { id: batch.positionId },
            data: { deletedAt: new Date(), status: "deleted" }
          });
        }
      }
      await tx.recruitmentImportBatch.update({
        where: { id: batch.id },
        data: { status: "UNDONE", undoneAt: new Date() }
      });
    }
  });

  invalidateDashboardImportCaches();
  return { success: true };
}
