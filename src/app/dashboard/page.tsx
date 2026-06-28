import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { type ReactNode } from "react";

import { DashboardCharts } from "@/components/dashboard/dashboard-charts";
import {
  DemandProgressExchangeControls,
  ProcessDataExchangeControls
} from "@/components/dashboard/dashboard-table-exchange";
import {
  CandidateDateFilter,
  type CandidateDatePreset
} from "@/components/filters/candidate-date-filter";
import { StatusBadge } from "@/components/status-badge";
import { getDashboardData } from "@/lib/services/dashboard";
import { listDepartments } from "@/lib/services/departments";
import { listPositionProgress } from "@/lib/services/positions";
import { formatDateTime, formatRelativeDays } from "@/lib/utils";

function parseUtcDate(value?: string) {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function endOfUtcDate(date?: Date) {
  if (!date) return undefined;
  const next = new Date(date);
  next.setUTCHours(23, 59, 59, 999);
  return next;
}

function todayString() {
  const date = new Date();
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function resolveDateRange(
  preset: CandidateDatePreset,
  anchorValue: string,
  fromValue: string,
  toValue: string
) {
  if (preset === "none") return {};

  if (preset === "custom") {
    let from = parseUtcDate(fromValue);
    let to = parseUtcDate(toValue);
    if (from && to && from > to) [from, to] = [to, from];
    return {
      dateFrom: from,
      dateTo: endOfUtcDate(to)
    };
  }

  const anchor = parseUtcDate(anchorValue) ?? parseUtcDate(todayString())!;
  const dateFrom = new Date(anchor);
  const dateTo = endOfUtcDate(anchor)!;

  if (preset === "week") {
    const day = dateFrom.getUTCDay() || 7;
    dateFrom.setUTCDate(dateFrom.getUTCDate() - day + 1);
    dateTo.setTime(dateFrom.getTime());
    dateTo.setUTCDate(dateFrom.getUTCDate() + 6);
    dateTo.setUTCHours(23, 59, 59, 999);
  }

  if (preset === "quarter") {
    const quarterStartMonth = Math.floor(dateFrom.getUTCMonth() / 3) * 3;
    dateFrom.setUTCMonth(quarterStartMonth, 1);
    dateTo.setUTCFullYear(dateFrom.getUTCFullYear(), quarterStartMonth + 3, 0);
    dateTo.setUTCHours(23, 59, 59, 999);
  }

  return { dateFrom, dateTo };
}

function formatDateRange(dateFrom?: Date, dateTo?: Date) {
  if (!dateFrom || !dateTo) return "";
  return `${dateFrom.toISOString().slice(0, 10)} 至 ${dateTo.toISOString().slice(0, 10)}`;
}

type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;
type DashboardPageSearchParams = {
  datePreset?: string;
  dateAnchor?: string;
  dateFrom?: string;
  dateTo?: string;
  departmentId?: string;
  positionId?: string;
  demandSort?: string;
  demandDir?: string;
  processSort?: string;
  processDir?: string;
};

type SortDirection = "asc" | "desc";

const DASHBOARD_FILTER_PARAM_KEYS = [
  "datePreset",
  "dateAnchor",
  "dateFrom",
  "dateTo",
  "departmentId",
  "positionId"
] as const;

function compareDashboardValues(left: unknown, right: unknown) {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }
  return String(left ?? "").localeCompare(String(right ?? ""), "zh-CN", {
    numeric: true,
    sensitivity: "base"
  });
}

function sortRows<T extends Record<string, unknown>>(
  rows: T[],
  key: string | undefined,
  direction: SortDirection,
  fallbackKey: keyof T
) {
  const sortKey = (key && key in (rows[0] ?? {}) ? key : fallbackKey) as keyof T;
  const factor = direction === "asc" ? 1 : -1;
  return [...rows].sort((left, right) => {
    const compared = compareDashboardValues(left[sortKey], right[sortKey]);
    return compared * factor || compareDashboardValues(left[fallbackKey], right[fallbackKey]);
  });
}

function sortHref(
  params: DashboardPageSearchParams,
  sortParam: "demandSort" | "processSort",
  dirParam: "demandDir" | "processDir",
  key: string
) {
  const query = new URLSearchParams();
  for (const paramKey of DASHBOARD_FILTER_PARAM_KEYS) {
    const value = params[paramKey];
    if (value) query.set(paramKey, value);
  }

  const active = params[sortParam] === key;
  query.set(sortParam, key);
  query.set(dirParam, active && params[dirParam] !== "desc" ? "desc" : "asc");
  return `/dashboard?${query.toString()}`;
}

function SortHeader({
  params,
  sortParam,
  dirParam,
  sortKey,
  numeric,
  children
}: {
  params: DashboardPageSearchParams;
  sortParam: "demandSort" | "processSort";
  dirParam: "demandDir" | "processDir";
  sortKey: string;
  numeric?: boolean;
  children: ReactNode;
}) {
  const active = params[sortParam] === sortKey;
  const direction = params[dirParam] === "desc" ? "desc" : "asc";
  return (
    <th className={numeric ? "numeric" : undefined} aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}>
      <Link className="sort-button sort-link" href={sortHref(params, sortParam, dirParam, sortKey)}>
        <span>{children}</span>
        <span className="sort-indicator" aria-hidden="true">
          {active ? (direction === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </Link>
    </th>
  );
}

function formatPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "-";
  return `${Math.round(value * 100)}%`;
}

function formatSnapshotDate(value: string | Date) {
  return new Date(value).toISOString().slice(0, 10);
}

function DemandProgressOverview({
  overview,
  params
}: {
  overview: DashboardData["demandProgressOverview"];
  params: DashboardPageSearchParams;
}) {
  const rows = sortRows(
    [...overview.normalRows, ...overview.pausedRows],
    params.demandSort,
    params.demandDir === "desc" ? "desc" : "asc",
    "positionName"
  );

  return (
    <section className="card dashboard-report-card">
      <div className="dashboard-report-heading">
        <div>
          <h3>岗位需求进度总览</h3>
          <p className="muted">
            已入职按岗位创建日期起算，累计到筛选结束日 {formatSnapshotDate(overview.snapshotEnd)}。
          </p>
        </div>
        <div className="inline-actions">
          <span className="tag tag-neutral">正常招聘 {overview.normalRows.length} 个岗位</span>
          <DemandProgressExchangeControls
            rows={rows}
            snapshotDate={formatSnapshotDate(overview.snapshotEnd)}
          />
        </div>
      </div>
      <div className="table-wrap dashboard-report-table-wrap">
        <table className="dashboard-report-table">
          <thead>
            <tr>
              <SortHeader params={params} sortParam="demandSort" dirParam="demandDir" sortKey="status">岗位状态</SortHeader>
              <SortHeader params={params} sortParam="demandSort" dirParam="demandDir" sortKey="priority">优先级</SortHeader>
              <SortHeader params={params} sortParam="demandSort" dirParam="demandDir" sortKey="positionName">岗位名称</SortHeader>
              <SortHeader params={params} sortParam="demandSort" dirParam="demandDir" sortKey="positionCount" numeric>岗位数量</SortHeader>
              <SortHeader params={params} sortParam="demandSort" dirParam="demandDir" sortKey="demandHeadcount" numeric>需求 HC</SortHeader>
              <SortHeader params={params} sortParam="demandSort" dirParam="demandDir" sortKey="onboarded" numeric>已入职</SortHeader>
              <SortHeader params={params} sortParam="demandSort" dirParam="demandDir" sortKey="pendingOffer" numeric>待入职</SortHeader>
              <SortHeader params={params} sortParam="demandSort" dirParam="demandDir" sortKey="vacancy" numeric>空缺 HC</SortHeader>
              <SortHeader params={params} sortParam="demandSort" dirParam="demandDir" sortKey="progress" numeric>招聘进度</SortHeader>
              <SortHeader params={params} sortParam="demandSort" dirParam="demandDir" sortKey="criticalStatus">关键状态</SortHeader>
            </tr>
          </thead>
          <tbody>
            <tr className="dashboard-report-total-row">
              <td>正常招聘合计</td>
              <td>-</td>
              <td>{overview.normalTotal.positionCount}</td>
              <td className="numeric">{overview.normalTotal.positionCount}</td>
              <td className="numeric">{overview.normalTotal.demandHeadcount}</td>
              <td className="numeric">{overview.normalTotal.onboarded}</td>
              <td className="numeric">{overview.normalTotal.pendingOffer}</td>
              <td className="numeric">{overview.normalTotal.vacancy}</td>
              <td className="numeric">{formatPercent(overview.normalTotal.progress)}</td>
              <td>{overview.normalTotal.criticalStatus}</td>
            </tr>
            {rows.length ? (
              rows.map((row) => (
                <tr key={row.positionId}>
                  <td>{row.status}</td>
                  <td>{row.priority}</td>
                  <td>{row.positionName}</td>
                  <td className="numeric">{row.positionCount}</td>
                  <td className="numeric">{row.demandHeadcount}</td>
                  <td className="numeric">{row.onboarded}</td>
                  <td className="numeric">{row.pendingOffer}</td>
                  <td className={`numeric ${row.vacancy < 0 ? "danger-text" : ""}`}>{row.vacancy}</td>
                  <td className="numeric">{formatPercent(row.progress)}</td>
                  <td>{row.criticalStatus}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={10}>
                  <div className="empty-state">当前筛选范围内没有可展示的岗位。</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ProcessRowsTable({
  title,
  rows,
  total,
  params
}: {
  title: string;
  rows: DashboardData["processData"]["regular"]["rows"];
  total: DashboardData["processData"]["regular"]["total"];
  params: DashboardPageSearchParams;
}) {
  const sortedRows = sortRows(
    rows,
    params.processSort,
    params.processDir === "desc" ? "desc" : "asc",
    "positionName"
  );

  return (
    <div className="dashboard-process-section">
      <h4>{title}</h4>
      <div className="table-wrap dashboard-report-table-wrap">
        <table className="dashboard-report-table dashboard-process-table">
          <thead>
            <tr>
              <SortHeader params={params} sortParam="processSort" dirParam="processDir" sortKey="positionName">岗位名称</SortHeader>
              <SortHeader params={params} sortParam="processSort" dirParam="processDir" sortKey="recruiter">招聘 HR</SortHeader>
              <SortHeader params={params} sortParam="processSort" dirParam="processDir" sortKey="recommended" numeric>推荐简历</SortHeader>
              <SortHeader params={params} sortParam="processSort" dirParam="processDir" sortKey="invited" numeric>邀约</SortHeader>
              <SortHeader params={params} sortParam="processSort" dirParam="processDir" sortKey="firstInterview" numeric>初试</SortHeader>
              <SortHeader params={params} sortParam="processSort" dirParam="processDir" sortKey="secondInterview" numeric>复试</SortHeader>
              <SortHeader params={params} sortParam="processSort" dirParam="processDir" sortKey="crossInterview" numeric>交叉面</SortHeader>
              <SortHeader params={params} sortParam="processSort" dirParam="processDir" sortKey="finalInterview" numeric>终试</SortHeader>
              <SortHeader params={params} sortParam="processSort" dirParam="processDir" sortKey="passed" numeric>通过</SortHeader>
              <SortHeader params={params} sortParam="processSort" dirParam="processDir" sortKey="offer" numeric>offer</SortHeader>
              <SortHeader params={params} sortParam="processSort" dirParam="processDir" sortKey="onboard" numeric>到岗</SortHeader>
              <SortHeader params={params} sortParam="processSort" dirParam="processDir" sortKey="remark">备注</SortHeader>
            </tr>
          </thead>
          <tbody>
            <tr className="dashboard-report-total-row">
              <td>{title}合计</td>
              <td>-</td>
              <td className="numeric">{total.recommended}</td>
              <td className="numeric">{total.invited}</td>
              <td className="numeric">{total.firstInterview}</td>
              <td className="numeric">{total.secondInterview}</td>
              <td className="numeric">{total.crossInterview}</td>
              <td className="numeric">{total.finalInterview}</td>
              <td className="numeric">{total.passed}</td>
              <td className="numeric">{total.offer}</td>
              <td className="numeric">{total.onboard}</td>
              <td />
            </tr>
            {sortedRows.length ? (
              sortedRows.map((row) => (
                <tr key={`${row.positionId}-${row.recruiter}`}>
                  <td>{row.positionName}</td>
                  <td>{row.recruiter}</td>
                  <td className="numeric">{row.recommended}</td>
                  <td className="numeric">{row.invited}</td>
                  <td className="numeric">{row.firstInterview}</td>
                  <td className="numeric">{row.secondInterview}</td>
                  <td className="numeric">{row.crossInterview}</td>
                  <td className="numeric">{row.finalInterview}</td>
                  <td className="numeric">{row.passed}</td>
                  <td className="numeric">{row.offer}</td>
                  <td className="numeric">{row.onboard}</td>
                  <td>{row.remark || "-"}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={12}>
                  <div className="empty-state">当前筛选范围内暂无过程数据。</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PositionProcessData({
  processData,
  params,
  eventDate
}: {
  processData: DashboardData["processData"];
  params: DashboardPageSearchParams;
  eventDate: string;
}) {
  return (
    <section className="card dashboard-report-card">
      <div className="dashboard-report-heading">
        <div>
          <h3>岗位过程数据</h3>
          <p className="muted">按当前日期条件统计投递和状态流转，跟随部门、岗位筛选。</p>
        </div>
        <ProcessDataExchangeControls
          eventDate={eventDate}
          groups={[
            { title: "高优先级岗位", rows: processData.highPriority.rows },
            { title: "中高优先级岗位", rows: processData.mediumHigh.rows },
            { title: "常规岗位", rows: processData.regular.rows }
          ]}
        />
      </div>
      <ProcessRowsTable
        title="高优先级岗位"
        rows={processData.highPriority.rows}
        total={processData.highPriority.total}
        params={params}
      />
      <ProcessRowsTable
        title="中高优先级岗位"
        rows={processData.mediumHigh.rows}
        total={processData.mediumHigh.total}
        params={params}
      />
      <ProcessRowsTable
        title="常规岗位"
        rows={processData.regular.rows}
        total={processData.regular.total}
        params={params}
      />
    </section>
  );
}

export default async function DashboardPage({
  searchParams
}: {
  searchParams?: Promise<DashboardPageSearchParams>;
}) {
  noStore();
  const params = await searchParams;
  const requestedPreset = params?.datePreset;
  const datePreset: CandidateDatePreset = ["day", "week", "quarter", "custom"].includes(
    requestedPreset ?? ""
  )
    ? (requestedPreset as CandidateDatePreset)
    : "none";
  const dateAnchor = params?.dateAnchor ?? todayString();
  const dateFromInput = params?.dateFrom ?? "";
  const dateToInput = params?.dateTo ?? "";
  const departmentId = params?.departmentId ?? "";
  const positionId = params?.positionId ?? "";
  const { dateFrom, dateTo } = resolveDateRange(
    datePreset,
    dateAnchor,
    dateFromInput,
    dateToInput
  );
  const [data, departments, positions] = await Promise.all([
    getDashboardData({
      dateFrom,
      dateTo,
      departmentId: departmentId || undefined,
      positionId: positionId || undefined
    }),
    listDepartments(),
    listPositionProgress()
  ]);
  const positionOptions = positions.filter((position) =>
    departmentId ? position.departmentId === departmentId : true
  );
  const selectedDepartment = departments.find((department) => department.id === departmentId);
  const selectedPosition = positions.find((position) => position.id === positionId);
  const dateRange = formatDateRange(dateFrom, dateTo);
  const dashboardEventDate = (dateTo ?? new Date()).toISOString().slice(0, 10);
  const scopeSummary = [
    selectedDepartment ? `部门：${selectedDepartment.name}` : "",
    selectedPosition ? `岗位：${selectedPosition.title}` : ""
  ].filter(Boolean).join(" · ");

  return (
    <div className="grid">
      <header className="page-header">
        <div>
          <h2>招聘 Dashboard</h2>
          <p>集中查看候选人总览、招聘漏斗、岗位分布、Agent 任务表现和待跟进提醒，帮助 HR 快速锁定当前优先级。</p>
        </div>
        <div className="page-actions">
          <Link className="btn" href="/intake">
            新增 AI Intake
          </Link>
          <Link className="btn-secondary" href="/candidates">
            查看候选人
          </Link>
        </div>
      </header>

      <section className="card dashboard-filter-card">
        <div className="dashboard-filter-heading">
          <div>
            <h3>Dashboard 数据筛选</h3>
            <p className="muted">
              按投递日期查看招聘数据；启用后仅统计当前仍处于招聘流程中的候选人。
            </p>
          </div>
          {dateRange || scopeSummary ? (
            <span className="dashboard-filter-summary">
              {[scopeSummary, dateRange].filter(Boolean).join(" · ")}
            </span>
          ) : null}
        </div>
        <form method="get" className="dashboard-filter-form">
          <div className="dashboard-filter-main">
          <div className="dashboard-scope-filter-grid">
            <div className="field">
              <label htmlFor="dashboard-department">部门</label>
              <select
                id="dashboard-department"
                name="departmentId"
                className="select"
                defaultValue={departmentId}
              >
                <option value="">全部部门</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="dashboard-position">岗位</label>
              <select
                id="dashboard-position"
                name="positionId"
                className="select"
                defaultValue={positionId}
              >
                <option value="">全部岗位</option>
                {positionOptions.map((position) => (
                  <option key={position.id} value={position.id}>
                    {position.department || "未设置部门"} · {position.title}
                  </option>
                ))}
              </select>
              <span className="field-helper">选择岗位时会优先按岗位统计；部门用于缩小岗位范围和数据范围。</span>
            </div>
          </div>
          <CandidateDateFilter
            initialPreset={datePreset}
            initialAnchor={dateAnchor}
            initialFrom={dateFromInput}
            initialTo={dateToInput}
          />
          </div>
          <div className="dashboard-filter-footer">
            <p className="dashboard-filter-note">
              选择岗位时会优先按岗位统计；启用日期后，仅统计投递日期在范围内且仍在流程中的候选人。
            </p>
          <div className="dashboard-filter-actions">
            <button className="btn" type="submit">应用筛选</button>
            <Link className="btn-secondary" href="/dashboard">重置</Link>
          </div>
          </div>
        </form>
      </section>

      <section className="grid cols-4">
        <div className="card">
          <div className="metric-value">{data.metrics.totalCandidates}</div>
          <div className="metric-sub">{data.filtered ? "范围内流程中候选人" : "候选人总数"}</div>
        </div>
        <div className="card">
          <div className="metric-value">
            {data.filtered ? data.metrics.totalApplications : data.metrics.todayNew}
          </div>
          <div className="metric-sub">{data.filtered ? "范围内有效投递" : "今日新增"}</div>
        </div>
        <div className="card">
          <div className="metric-value">
            {data.filtered ? data.metrics.involvedPositions : data.metrics.openPositions}
          </div>
          <div className="metric-sub">{data.filtered ? "涉及岗位" : "开放岗位"}</div>
        </div>
        <div className="card">
          <div className="metric-value">{data.metrics.pendingFollowUps}</div>
          <div className="metric-sub">待跟进提醒</div>
        </div>
      </section>

      <section className="grid dashboard-report-grid">
        <DemandProgressOverview overview={data.demandProgressOverview} params={params ?? {}} />
        <PositionProcessData
          processData={data.processData}
          params={params ?? {}}
          eventDate={dashboardEventDate}
        />
      </section>

      <section className="grid cols-2">
        <DashboardCharts
          statusDistribution={data.statusDistribution}
          positionDistribution={data.positionDistribution}
          funnel={data.funnel}
          trendDays={data.trendDays}
        />
      </section>

      <section className="grid cols-2">
        <div className="card">
          <h3>AI 招聘分析摘要</h3>
          <p className="muted" style={{ lineHeight: 1.8 }}>
            {data.summary}
          </p>
          <div className="stats-inline">
            <span>成功任务 {data.metrics.taskStats.success}</span>
            <span>失败任务 {data.metrics.taskStats.failed}</span>
            <span>待复核 {data.metrics.taskStats.review}</span>
          </div>
        </div>

        <div className="card">
          <div className="inline-actions" style={{ justifyContent: "space-between", marginBottom: 14 }}>
            <h3 style={{ margin: 0 }}>待跟进候选人</h3>
            <Link href="/candidates" className="btn-ghost">
              查看全部
            </Link>
          </div>

          {data.followUps.length ? (
            <div className="subtle-list">
              {data.followUps.map((item) => (
                item.candidate ? (
                  <div key={item.id} className="subtle-item">
                    <div className="inline-actions" style={{ justifyContent: "space-between" }}>
                      <div>
                        <strong>{item.candidate.name}</strong>
                        <div className="muted">{item.candidate.position?.title || "未分配岗位"}</div>
                      </div>
                      <StatusBadge status={item.candidate.status} />
                    </div>
                    <p style={{ margin: "10px 0 8px" }}>{item.title}</p>
                    <div className="stats-inline">
                      <span>截止 {formatDateTime(item.dueAt)}</span>
                      <span>更新时间 {formatRelativeDays(item.candidate.updatedAt)}</span>
                    </div>
                  </div>
                ) : null
              ))}
            </div>
          ) : (
            <div className="empty-state">当前没有待跟进提醒。</div>
          )}
        </div>
      </section>
    </div>
  );
}
