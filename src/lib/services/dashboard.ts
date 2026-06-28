import { AgentTaskStatus, CandidateStatus } from "@prisma/client";

import { PositionPriority, PositionRecruitmentStatus } from "@prisma/client";

import {
  ACTIVE_PIPELINE_STATUSES,
  POSITION_PRIORITY_LABELS,
  POSITION_RECRUITMENT_STATUS_LABELS,
  STATUS_LABELS,
  STATUS_ORDER
} from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { READ_CACHE_TTL, readThroughCache } from "@/lib/server-cache";

export type DashboardFilters = {
  dateFrom?: Date;
  dateTo?: Date;
  departmentId?: string;
  positionId?: string;
};

type DashboardRecord = {
  candidateId: string;
  positionId: string | null;
  status: CandidateStatus;
  appliedAt: Date;
  updatedAt: Date;
};

type DashboardPosition = {
  id: string;
  title: string;
  departmentId: string | null;
  department: string | null;
  status: string;
  recruitmentStatus: PositionRecruitmentStatus;
  priority: PositionPriority;
  headcount: number;
  owner: string | null;
  positionCreatedAt: Date;
  applications: Array<{
    id: string;
    candidateId: string;
    status: CandidateStatus;
    ownerName: string | null;
    appliedAt: Date;
    updatedAt: Date;
  }>;
};

type ProcessAccumulator = {
  positionId: string;
  positionName: string;
  recruiter: string;
  priority: "high" | "mediumHigh" | "regular";
  recommended: number;
  invited: number;
  firstInterview: number;
  secondInterview: number;
  crossInterview: number;
  finalInterview: number;
  passed: number;
  offer: number;
  onboard: number;
  remark: string;
};

const CLOSED_POSITION_STATUSES = new Set(["closed", "deleted", "archived"]);
const PROCESS_LOG_STATUSES = [
  CandidateStatus.INVITED,
  CandidateStatus.FIRST_INTERVIEW,
  CandidateStatus.SECOND_INTERVIEW,
  CandidateStatus.CROSS_INTERVIEW,
  CandidateStatus.FINAL_INTERVIEW,
  CandidateStatus.PASSED,
  CandidateStatus.OFFER,
  CandidateStatus.ONBOARD
];

function dashboardCacheKey(filters: DashboardFilters) {
  return [
    "dashboard:data",
    filters.dateFrom?.toISOString() ?? "",
    filters.dateTo?.toISOString() ?? "",
    filters.departmentId ?? "",
    filters.positionId ?? ""
  ].join(":");
}

function startOfLocalTodayAsUtcCalendarDate() {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

function utcStart(date: Date) {
  const next = new Date(date);
  next.setUTCHours(0, 0, 0, 0);
  return next;
}

function utcEnd(date: Date) {
  const next = new Date(date);
  next.setUTCHours(23, 59, 59, 999);
  return next;
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatTrendDate(date: Date) {
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
}

function normalizedPositionStatus(status: string | null | undefined) {
  return String(status ?? "").trim().toLowerCase();
}

function isClosedPosition(status: string | null | undefined) {
  return CLOSED_POSITION_STATUSES.has(normalizedPositionStatus(status));
}

function positionStatusLabel(position: Pick<DashboardPosition, "recruitmentStatus">) {
  return POSITION_RECRUITMENT_STATUS_LABELS[position.recruitmentStatus];
}

function positionPriority(position: Pick<DashboardPosition, "priority">) {
  if (position.priority === PositionPriority.HIGHEST) {
    return { label: POSITION_PRIORITY_LABELS[position.priority], group: "high" as const };
  }
  if (position.priority === PositionPriority.MEDIUM_HIGH) {
    return { label: POSITION_PRIORITY_LABELS[position.priority], group: "mediumHigh" as const };
  }
  return { label: POSITION_PRIORITY_LABELS[position.priority], group: "regular" as const };
}

function emptyProcessTotal() {
  return {
    recommended: 0,
    invited: 0,
    firstInterview: 0,
    secondInterview: 0,
    crossInterview: 0,
    finalInterview: 0,
    passed: 0,
    offer: 0,
    onboard: 0
  };
}

function sumProcessRows(rows: ProcessAccumulator[]) {
  return rows.reduce(
    (total, row) => ({
      recommended: total.recommended + row.recommended,
      invited: total.invited + row.invited,
      firstInterview: total.firstInterview + row.firstInterview,
      secondInterview: total.secondInterview + row.secondInterview,
      crossInterview: total.crossInterview + row.crossInterview,
      finalInterview: total.finalInterview + row.finalInterview,
      passed: total.passed + row.passed,
      offer: total.offer + row.offer,
      onboard: total.onboard + row.onboard
    }),
    emptyProcessTotal()
  );
}

function uniqueLatestApplications(
  applications: Array<{
    candidateId: string;
    positionId: string;
    status: CandidateStatus;
    appliedAt: Date;
    candidate: { updatedAt: Date };
  }>
) {
  const byCandidate = new Map<string, DashboardRecord>();
  for (const application of applications) {
    const existing = byCandidate.get(application.candidateId);
    if (!existing || application.appliedAt > existing.appliedAt) {
      byCandidate.set(application.candidateId, {
        candidateId: application.candidateId,
        positionId: application.positionId,
        status: application.status,
        appliedAt: application.appliedAt,
        updatedAt: application.candidate.updatedAt
      });
    }
  }
  return Array.from(byCandidate.values());
}

function isApplicationInDateScope(
  application: { status: CandidateStatus; appliedAt: Date },
  filters: DashboardFilters
) {
  if (!filters.dateFrom && !filters.dateTo) return true;
  if (filters.dateTo && application.appliedAt > filters.dateTo) return false;

  const appliedInRange =
    (!filters.dateFrom || application.appliedAt >= filters.dateFrom) &&
    (!filters.dateTo || application.appliedAt <= filters.dateTo);
  return appliedInRange || ACTIVE_PIPELINE_STATUSES.has(application.status);
}

export async function getDashboardData(filters: DashboardFilters = {}) {
  const hasDateFilter = Boolean(filters.dateFrom || filters.dateTo);
  const hasScopeFilter = Boolean(filters.departmentId || filters.positionId);
  const hasAnyFilter = hasDateFilter || hasScopeFilter;
  const positionWhere = {
    deletedAt: null,
    ...(filters.positionId ? { id: filters.positionId } : {}),
    ...(filters.departmentId && !filters.positionId ? { departmentId: filters.departmentId } : {})
  };

  return readThroughCache(dashboardCacheKey(filters), READ_CACHE_TTL.short, async () => {
    const [positions, applications, allCandidates] = await Promise.all([
      prisma.position.findMany({
        where: positionWhere,
        select: {
          id: true,
          title: true,
          departmentId: true,
          department: true,
          status: true,
          recruitmentStatus: true,
          priority: true,
          headcount: true,
          owner: true,
          positionCreatedAt: true,
          applications: {
            where: { deletedAt: null, candidate: { deletedAt: null } },
            select: {
              id: true,
              candidateId: true,
              status: true,
              ownerName: true,
              appliedAt: true,
              updatedAt: true
            }
          }
        }
      }),
      hasDateFilter
        ? prisma.recruitmentApplication.findMany({
            where: {
              deletedAt: null,
              ...(filters.dateTo ? { appliedAt: { lte: filters.dateTo } } : {}),
              OR: [
                {
                  appliedAt: {
                    ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
                    ...(filters.dateTo ? { lte: filters.dateTo } : {})
                  }
                },
                { status: { in: Array.from(ACTIVE_PIPELINE_STATUSES) } }
              ],
              candidate: { deletedAt: null },
              position: positionWhere
            },
            select: {
              id: true,
              candidateId: true,
              positionId: true,
              status: true,
              appliedAt: true,
              candidate: {
                select: {
                  updatedAt: true
                }
              }
            },
            orderBy: { appliedAt: "desc" }
          })
        : Promise.resolve([]),
      hasDateFilter
        ? Promise.resolve([])
        : prisma.candidate.findMany({
            where: {
              deletedAt: null,
              ...(filters.positionId ? { positionId: filters.positionId } : {}),
              ...(filters.departmentId && !filters.positionId
                ? { position: { departmentId: filters.departmentId, deletedAt: null } }
                : {})
            },
            select: {
              id: true,
              createdAt: true,
              status: true,
              positionId: true,
              updatedAt: true
            }
          })
    ]);
    const dashboardPositions: DashboardPosition[] = positions;
    const positionIds = dashboardPositions.map((position) => position.id);
    const snapshotEnd = filters.dateTo ?? new Date();
    const scopedRecruitmentLogWhere = positionIds.length
      ? {
          OR: [
            {
              application: {
                is: {
                  positionId: { in: positionIds },
                  deletedAt: null
                }
              }
            },
            {
              applicationId: null,
              candidate: {
                positionId: { in: positionIds },
                deletedAt: null
              }
            }
          ]
        }
      : { id: "__none__" };
    const [onboardLogs, processLogs] = await Promise.all([
      prisma.recruitmentLog.findMany({
        where: {
          ...scopedRecruitmentLogWhere,
          toStatus: CandidateStatus.ONBOARD,
          createdAt: { lte: snapshotEnd }
        },
        select: {
          applicationId: true,
          candidateId: true,
          createdAt: true,
          application: { select: { id: true, positionId: true, candidateId: true } },
          candidate: { select: { positionId: true } }
        }
      }),
      prisma.recruitmentLog.findMany({
        where: {
          ...scopedRecruitmentLogWhere,
          toStatus: { in: PROCESS_LOG_STATUSES },
          createdAt: {
            ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
            ...(filters.dateTo ? { lte: filters.dateTo } : {})
          }
        },
        select: {
          toStatus: true,
          applicationId: true,
          candidateId: true,
          application: { select: { positionId: true, ownerName: true } },
          candidate: { select: { positionId: true } }
        }
      })
    ]);

    const records: DashboardRecord[] = hasDateFilter
      ? uniqueLatestApplications(applications)
      : allCandidates.map((candidate) => ({
          candidateId: candidate.id,
          positionId: candidate.positionId,
          status: candidate.status,
          appliedAt: candidate.createdAt,
          updatedAt: candidate.updatedAt
        }));
    const candidateIds = records.map((record) => record.candidateId);
    const applicationIds = applications.map((application) => application.id);
    const scopedApplicationIds =
      hasAnyFilter && !hasDateFilter
        ? (
            await prisma.recruitmentApplication.findMany({
              where: {
                deletedAt: null,
                candidateId: { in: candidateIds },
                ...(filters.positionId ? { positionId: filters.positionId } : {}),
                ...(filters.departmentId && !filters.positionId
                  ? { position: { departmentId: filters.departmentId, deletedAt: null } }
                  : {})
              },
              select: { id: true }
            })
          ).map((application) => application.id)
        : applicationIds;

    const [agentTasks, followUps] = await Promise.all([
      prisma.agentTask.findMany({
        where: hasAnyFilter
          ? {
              OR: [
                { candidateId: { in: candidateIds } },
                { applicationId: { in: scopedApplicationIds } },
                { rawInput: { candidateId: { in: candidateIds } } }
              ]
            }
          : undefined,
        select: {
          status: true,
          createdAt: true
        }
      }),
      prisma.notification.findMany({
        where: {
          done: false,
          ...(hasAnyFilter ? { candidateId: { in: candidateIds } } : {})
        },
        orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
        take: 6,
        select: {
          id: true,
          title: true,
          dueAt: true,
          candidate: {
            select: {
              id: true,
              name: true,
              status: true,
              updatedAt: true,
              position: {
                select: {
                  title: true
                }
              }
            }
          }
        }
      })
    ]);

    const totalCandidates = records.length;
    const todayStart = startOfLocalTodayAsUtcCalendarDate();
    const todayEnd = utcEnd(todayStart);
    const todayNew = records.filter(
      (record) => record.appliedAt >= todayStart && record.appliedAt <= todayEnd
    ).length;

    const statusDistribution = STATUS_ORDER.map((status) => ({
      status,
      label: STATUS_LABELS[status],
      count: records.filter((record) => record.status === status).length
    })).filter((item) => item.count > 0);

    const positionDistribution = positions
      .map((position) => ({
        id: position.id,
        name: position.title,
        count: records.filter((record) => record.positionId === position.id).length
      }))
      .filter((item) => item.count > 0);

    const onboardedByPosition = new Map<string, Set<string>>();
    const loggedOnboardApplicationIds = new Set<string>();
    const positionById = new Map(dashboardPositions.map((position) => [position.id, position]));

    for (const log of onboardLogs) {
      const positionId = log.application?.positionId ?? log.candidate.positionId;
      if (!positionId) continue;
      const position = positionById.get(positionId);
      if (!position || log.createdAt < position.positionCreatedAt) continue;
      const personKey = log.applicationId ?? `${positionId}:${log.candidateId}`;
      if (log.applicationId) loggedOnboardApplicationIds.add(log.applicationId);
      const set = onboardedByPosition.get(positionId) ?? new Set<string>();
      set.add(personKey);
      onboardedByPosition.set(positionId, set);
    }

    for (const position of dashboardPositions) {
      const set = onboardedByPosition.get(position.id) ?? new Set<string>();
      for (const application of position.applications) {
        if (loggedOnboardApplicationIds.has(application.id)) continue;
        if (application.status !== CandidateStatus.ONBOARD) continue;
        if (application.appliedAt < position.positionCreatedAt || application.appliedAt > snapshotEnd) continue;
        set.add(application.id);
      }
      if (set.size) onboardedByPosition.set(position.id, set);
    }

    const demandRows = dashboardPositions
      .filter((position) => !isClosedPosition(position.status))
      .map((position) => {
        const priority = positionPriority(position);
        const onboarded = onboardedByPosition.get(position.id)?.size ?? 0;
        const pendingOffer = position.applications.filter(
          (application) =>
            application.status === CandidateStatus.OFFER && application.appliedAt <= snapshotEnd
        ).length;
        const demandHeadcount = position.headcount ?? 0;
        const vacancy = demandHeadcount - onboarded - pendingOffer;
        const progress = demandHeadcount ? (onboarded + pendingOffer) / demandHeadcount : null;

        return {
          positionId: position.id,
          status: positionStatusLabel(position),
          priority: priority.label,
          priorityGroup: priority.group,
          positionName: position.title,
          positionCount: 1,
          demandHeadcount,
          onboarded,
          pendingOffer,
          vacancy,
          progress,
          criticalStatus:
            pendingOffer > 0
              ? `${pendingOffer} 人待入职`
              : vacancy <= 0
                ? "HC 已满足"
                : `空缺 ${vacancy} 人`
        };
      });
    const normalDemandRows = demandRows.filter(
      (row) => row.status === POSITION_RECRUITMENT_STATUS_LABELS[PositionRecruitmentStatus.NORMAL]
    );
    const pausedDemandRows = demandRows.filter(
      (row) => row.status !== POSITION_RECRUITMENT_STATUS_LABELS[PositionRecruitmentStatus.NORMAL]
    );
    const normalDemandTotal = normalDemandRows.reduce(
      (total, row) => ({
        positionCount: total.positionCount + row.positionCount,
        demandHeadcount: total.demandHeadcount + row.demandHeadcount,
        onboarded: total.onboarded + row.onboarded,
        pendingOffer: total.pendingOffer + row.pendingOffer,
        vacancy: total.vacancy + row.vacancy
      }),
      { positionCount: 0, demandHeadcount: 0, onboarded: 0, pendingOffer: 0, vacancy: 0 }
    );
    const demandProgressOverview = {
      normalRows: normalDemandRows,
      pausedRows: pausedDemandRows,
      normalTotal: {
        ...normalDemandTotal,
        progress: normalDemandTotal.demandHeadcount
          ? (normalDemandTotal.onboarded + normalDemandTotal.pendingOffer) /
            normalDemandTotal.demandHeadcount
          : null,
        criticalStatus: "该列为“正常招聘”统计"
      },
      snapshotEnd
    };

    const processRowsByKey = new Map<string, ProcessAccumulator>();
    const ensureProcessRow = (position: DashboardPosition, recruiter: string) => {
      const priority = positionPriority(position);
      const key = `${position.id}:${recruiter || "-"}`;
      const existing = processRowsByKey.get(key);
      if (existing) return existing;
      const created: ProcessAccumulator = {
        positionId: position.id,
        positionName: position.title,
        recruiter: recruiter || "-",
        priority: priority.group,
        recommended: 0,
        invited: 0,
        firstInterview: 0,
        secondInterview: 0,
        crossInterview: 0,
        finalInterview: 0,
        passed: 0,
        offer: 0,
        onboard: 0,
        remark: ""
      };
      processRowsByKey.set(key, created);
      return created;
    };

    for (const position of dashboardPositions.filter((item) => !isClosedPosition(item.status))) {
      for (const application of position.applications) {
        if (!isApplicationInDateScope(application, filters)) continue;
        const row = ensureProcessRow(position, application.ownerName ?? position.owner ?? "-");
        row.recommended += 1;
      }
    }

    for (const log of processLogs) {
      const positionId = log.application?.positionId ?? log.candidate.positionId;
      const position = positionId ? positionById.get(positionId) : null;
      if (!position || isClosedPosition(position.status)) continue;
      const row = ensureProcessRow(position, log.application?.ownerName ?? position.owner ?? "-");
      switch (log.toStatus) {
        case CandidateStatus.INVITED:
          row.invited += 1;
          break;
        case CandidateStatus.FIRST_INTERVIEW:
          row.firstInterview += 1;
          break;
        case CandidateStatus.SECOND_INTERVIEW:
          row.secondInterview += 1;
          break;
        case CandidateStatus.CROSS_INTERVIEW:
          row.crossInterview += 1;
          break;
        case CandidateStatus.FINAL_INTERVIEW:
          row.finalInterview += 1;
          break;
        case CandidateStatus.PASSED:
          row.passed += 1;
          break;
        case CandidateStatus.OFFER:
          row.offer += 1;
          break;
        case CandidateStatus.ONBOARD:
          row.onboard += 1;
          break;
        default:
          break;
      }
    }

    const processRows = Array.from(processRowsByKey.values()).sort((left, right) =>
      left.positionName.localeCompare(right.positionName, "zh-CN") ||
      left.recruiter.localeCompare(right.recruiter, "zh-CN")
    );
    const highPriorityProcessRows = processRows.filter((row) => row.priority === "high");
    const mediumHighProcessRows = processRows.filter((row) => row.priority === "mediumHigh");
    const regularProcessRows = processRows.filter((row) => row.priority === "regular");
    const processData = {
      highPriority: {
        rows: highPriorityProcessRows,
        total: sumProcessRows(highPriorityProcessRows)
      },
      mediumHigh: {
        rows: mediumHighProcessRows,
        total: sumProcessRows(mediumHighProcessRows)
      },
      regular: {
        rows: regularProcessRows,
        total: sumProcessRows(regularProcessRows)
      }
    };

    const funnelStatuses = [
      CandidateStatus.RECOMMENDED,
      CandidateStatus.INVITED,
      CandidateStatus.FIRST_INTERVIEW,
      CandidateStatus.SECOND_INTERVIEW,
      CandidateStatus.CROSS_INTERVIEW,
      CandidateStatus.FINAL_INTERVIEW,
      CandidateStatus.PASSED,
      CandidateStatus.OFFER,
      CandidateStatus.ONBOARD
    ];

    const funnel = funnelStatuses.map((status) => ({
      status,
      label: STATUS_LABELS[status],
      count: records.filter((record) => record.status === status).length
    }));

    const taskStats = {
      total: agentTasks.length,
      success: agentTasks.filter((task) => task.status === AgentTaskStatus.SUCCESS).length,
      failed: agentTasks.filter((task) => task.status === AgentTaskStatus.FAILED).length,
      review: agentTasks.filter((task) => task.status === AgentTaskStatus.NEED_REVIEW).length
    };

    const trendStart = hasDateFilter && filters.dateFrom
      ? utcStart(filters.dateFrom)
      : addUtcDays(todayStart, -6);
    const trendEnd = hasDateFilter && filters.dateTo
      ? utcEnd(filters.dateTo)
      : todayEnd;
    const totalTrendDays = Math.max(
      1,
      Math.floor((utcStart(trendEnd).getTime() - trendStart.getTime()) / 86_400_000) + 1
    );
    const bucketSize = totalTrendDays > 31 ? 7 : 1;
    const trendDays = Array.from(
      { length: Math.ceil(totalTrendDays / bucketSize) },
      (_, index) => {
        const bucketStart = addUtcDays(trendStart, index * bucketSize);
        const bucketEnd = new Date(
          Math.min(
            addUtcDays(bucketStart, bucketSize).getTime(),
            addUtcDays(utcStart(trendEnd), 1).getTime()
          )
        );
        const endLabelDate = addUtcDays(bucketEnd, -1);

        return {
          date:
            bucketSize === 1
              ? formatTrendDate(bucketStart)
              : `${formatTrendDate(bucketStart)}-${formatTrendDate(endLabelDate)}`,
          tasks: agentTasks.filter(
            (task) => task.createdAt >= bucketStart && task.createdAt < bucketEnd
          ).length,
          candidates: records.filter(
            (record) => record.appliedAt >= bucketStart && record.appliedAt < bucketEnd
          ).length
        };
      }
    );

    const inProgress = records.filter((record) =>
      ACTIVE_PIPELINE_STATUSES.has(record.status)
    ).length;
    const summaryPrefix = hasAnyFilter ? "当前筛选范围内" : "当前";
    const summary = `${summaryPrefix}共管理 ${totalCandidates} 位候选人，其中 ${inProgress} 位仍在招聘流程中，今日新增 ${todayNew} 位。Agent 关联任务共 ${taskStats.total} 次，成功率约 ${
      taskStats.total ? Math.round((taskStats.success / taskStats.total) * 100) : 0
    }%，待人工复核 ${taskStats.review} 次。`;

    const recordsByCandidate = new Map(records.map((record) => [record.candidateId, record]));
    const positionNames = new Map(positions.map((position) => [position.id, position.title]));
    const normalizedFollowUps = followUps.map((item) => {
      const filteredRecord = recordsByCandidate.get(item.candidate.id);
      const filteredPosition = filteredRecord?.positionId
        ? positionNames.get(filteredRecord.positionId)
        : null;

      return {
        id: item.id,
        title: item.title,
        dueAt: item.dueAt,
        candidate: {
          id: item.candidate.id,
          name: item.candidate.name,
          status: filteredRecord?.status ?? item.candidate.status,
          updatedAt: item.candidate.updatedAt,
          position: filteredPosition
            ? { title: filteredPosition }
            : item.candidate.position
              ? { title: item.candidate.position.title }
              : null
        }
      };
    });

    return {
      filtered: hasAnyFilter,
      metrics: {
        totalCandidates,
        totalApplications: hasDateFilter ? applications.length : scopedApplicationIds.length,
        todayNew,
        openPositions: positions.filter((position) => position.status === "open").length,
        involvedPositions: new Set(records.map((record) => record.positionId).filter(Boolean)).size,
        pendingFollowUps: normalizedFollowUps.length,
        taskStats
      },
      statusDistribution,
      positionDistribution,
      funnel,
      demandProgressOverview,
      processData,
      trendDays,
      followUps: normalizedFollowUps,
      summary
    };
  });
}
