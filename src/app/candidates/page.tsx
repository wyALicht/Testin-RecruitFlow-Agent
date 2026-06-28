import { CandidateStatus } from "@prisma/client";
import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";

import { CandidateManagementTable } from "@/components/candidates/candidate-management-table";
import {
  CandidateDateFilter,
  type CandidateDatePreset
} from "@/components/filters/candidate-date-filter";
import { STATUS_LABELS, STATUS_ORDER } from "@/lib/constants";
import { listDepartments } from "@/lib/services/departments";
import { listCandidates, listCandidateSources, listPositions } from "@/lib/services/candidates";

type DatePreset = CandidateDatePreset;

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setUTCHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setUTCHours(23, 59, 59, 999);
  return next;
}

function parseDate(value?: string) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function todayString() {
  const date = new Date();
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function formatUtcDate(date: Date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0")
  ].join("-");
}

function resolveDateRange(params: {
  preset: DatePreset;
  anchor?: string;
  from?: string;
  to?: string;
}) {
  if (params.preset === "none") return {};

  if (params.preset === "custom") {
    let from = parseDate(params.from);
    let to = parseDate(params.to);
    if (from && to && from > to) {
      [from, to] = [to, from];
    }
    return {
      dateFrom: from ? startOfDay(from) : undefined,
      dateTo: to ? endOfDay(to) : undefined
    };
  }

  const anchor = parseDate(params.anchor) ?? new Date();
  const start = startOfDay(anchor);
  const end = endOfDay(anchor);

  if (params.preset === "week") {
    const day = start.getUTCDay() || 7;
    start.setUTCDate(start.getUTCDate() - day + 1);
    end.setTime(start.getTime());
    end.setUTCDate(start.getUTCDate() + 6);
    end.setUTCHours(23, 59, 59, 999);
  }

  if (params.preset === "quarter") {
    const quarterStartMonth = Math.floor(start.getUTCMonth() / 3) * 3;
    start.setUTCMonth(quarterStartMonth, 1);
    end.setUTCFullYear(start.getUTCFullYear(), quarterStartMonth + 3, 0);
    end.setUTCHours(23, 59, 59, 999);
  }

  return { dateFrom: start, dateTo: end };
}

function dateRangeLabel(dateFrom?: Date, dateTo?: Date) {
  if (!dateFrom && !dateTo) return "";
  const from = dateFrom ? formatUtcDate(dateFrom) : "最早";
  const to = dateTo ? formatUtcDate(dateTo) : "现在";
  return `${from} 至 ${to}`;
}

function buildActiveFilterSummary({
  query,
  status,
  positionId,
  departmentId,
  source,
  onlyPendingFollowUp,
  dateFrom,
  dateTo,
  positions,
  departments
}: {
  query: string;
  status: CandidateStatus | "ALL";
  positionId: string;
  departmentId: string;
  source: string;
  onlyPendingFollowUp: boolean;
  dateFrom?: Date;
  dateTo?: Date;
  positions: Array<{ id: string; title: string }>;
  departments: Array<{ id: string; name: string }>;
}) {
  const chips: string[] = [];

  if (query) chips.push(`关键词：${query}`);
  if (status !== "ALL") chips.push(`状态：${STATUS_LABELS[status]}`);
  if (positionId) chips.push(`岗位：${positions.find((item) => item.id === positionId)?.title || positionId}`);
  if (departmentId) chips.push(`部门：${departments.find((item) => item.id === departmentId)?.name || departmentId}`);
  if (source) chips.push(`来源：${source}`);
  const rangeLabel = dateRangeLabel(dateFrom, dateTo);
  if (rangeLabel) chips.push(`投递日期：${rangeLabel} · 流程中`);
  if (onlyPendingFollowUp) chips.push("仅看待跟进");

  return chips;
}

export default async function CandidatesPage({
  searchParams
}: {
  searchParams?: Promise<{
    q?: string;
    status?: string;
    positionId?: string;
    departmentId?: string;
    source?: string;
    onlyPendingFollowUp?: string;
    datePreset?: DatePreset;
    dateAnchor?: string;
    dateFrom?: string;
    dateTo?: string;
  }>;
}) {
  noStore();
  const params = await searchParams;
  const query = params?.q ?? "";
  const requestedStatus = (params?.status as CandidateStatus | "ALL" | undefined) ?? "ALL";
  const positionId = params?.positionId ?? "";
  const departmentId = params?.departmentId ?? "";
  const source = params?.source ?? "";
  const onlyPendingFollowUp = params?.onlyPendingFollowUp === "true";
  const requestedDatePreset = params?.datePreset as string | undefined;
  const datePreset: DatePreset = ["day", "week", "quarter", "custom"].includes(
    requestedDatePreset ?? ""
  )
    ? (requestedDatePreset as DatePreset)
    : "none";
  const dateAnchor = params?.dateAnchor ?? todayString();
  const dateFromInput = params?.dateFrom ?? "";
  const dateToInput = params?.dateTo ?? "";
  const status = requestedStatus;
  const { dateFrom, dateTo } = resolveDateRange({
    preset: datePreset,
    anchor: dateAnchor,
    from: dateFromInput,
    to: dateToInput
  });

  const [positions, departments, sources, candidates] = await Promise.all([
    listPositions(),
    listDepartments(),
    listCandidateSources(),
    listCandidates({
      query,
      status,
      positionId,
      departmentId,
      source: source || undefined,
      dateFrom,
      dateTo,
      onlyPendingFollowUp
    })
  ]);

  const activeFilterSummary = buildActiveFilterSummary({
    query,
    status,
    positionId,
    departmentId,
    source,
    onlyPendingFollowUp,
    dateFrom,
    dateTo,
    positions,
    departments
  });
  const pendingCount = candidates.filter((candidate) => candidate.notifications.length > 0).length;
  const taggedCount = candidates.filter((candidate) => (candidate.tags ?? []).length > 0).length;
  const recentlyActiveCount = candidates.filter((candidate) => {
    const updatedAt = new Date(candidate.updatedAt).getTime();
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return updatedAt >= sevenDaysAgo;
  }).length;
  const serializedCandidates = candidates.map((candidate) => ({
    ...candidate,
    lastFollowUpAt: candidate.lastFollowUpAt?.toISOString() ?? null,
    createdAt: candidate.createdAt.toISOString(),
    updatedAt: candidate.updatedAt.toISOString()
  }));

  return (
    <div className="grid">
      <header className="page-header">
        <div>
          <h2>候选人管理</h2>
          <p>支持按关键词、状态、岗位、部门、来源筛选候选人；日期筛选按投递日期范围统计仍在流程中的候选人。</p>
        </div>
        <div className="page-actions">
          <Link href="/intake" className="btn">
            新增候选人
          </Link>
        </div>
      </header>

      <section className="grid cols-4 compact-grid">
        <article className="summary-card">
          <span className="summary-label">当前结果</span>
          <strong className="metric-compact">{candidates.length}</strong>
        </article>
        <article className="summary-card">
          <span className="summary-label">待跟进候选人</span>
          <strong className="metric-compact">{pendingCount}</strong>
        </article>
        <article className="summary-card">
          <span className="summary-label">已生成 AI 标签</span>
          <strong className="metric-compact">{taggedCount}</strong>
        </article>
        <article className="summary-card">
          <span className="summary-label">近 7 天有更新</span>
          <strong className="metric-compact">{recentlyActiveCount}</strong>
        </article>
      </section>

      <section className="card table-filter-card">
        <form className="form-grid form-grid-wide" style={{ alignItems: "end" }}>
          <div className="field">
            <label>搜索</label>
            <input className="input" name="q" defaultValue={query} placeholder="姓名、手机号、邮箱、学校、标签" />
          </div>
          <div className="field">
            <label>状态</label>
            <select className="select" name="status" defaultValue={status}>
              <option value="ALL">全部状态</option>
              {STATUS_ORDER.map((item) => (
                <option key={item} value={item}>
                  {STATUS_LABELS[item]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>部门</label>
            <select className="select" name="departmentId" defaultValue={departmentId}>
              <option value="">全部部门</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>岗位</label>
            <select className="select" name="positionId" defaultValue={positionId}>
              <option value="">全部岗位</option>
              {positions.map((position) => (
                <option key={position.id} value={position.id}>
                  {position.title}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>来源</label>
            <select className="select" name="source" defaultValue={source}>
              <option value="">全部来源</option>
              {sources.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <CandidateDateFilter
            initialPreset={datePreset}
            initialAnchor={dateAnchor}
            initialFrom={dateFromInput}
            initialTo={dateToInput}
          />
          <div className="field">
            <label>待跟进</label>
            <label className="review-check table-filter-check" style={{ marginTop: 0 }}>
              <input type="checkbox" name="onlyPendingFollowUp" value="true" defaultChecked={onlyPendingFollowUp} />
              <span>仅看待跟进候选人</span>
            </label>
          </div>
          <div className="field full">
            <div className="filter-toolbar">
              <div className="filter-summary">
                {activeFilterSummary.length ? (
                  activeFilterSummary.map((item) => (
                    <span key={item} className="tag tag-neutral">
                      {item}
                    </span>
                  ))
                ) : (
                  <span className="muted">当前未启用额外筛选；选择投递日期后，仅展示该日期范围内仍在流程中的候选人。</span>
                )}
              </div>
              <div className="inline-actions">
                <button className="btn" type="submit">
                  应用筛选
                </button>
                <Link href="/candidates" className="btn-ghost">
                  重置筛选
                </Link>
              </div>
            </div>
          </div>
        </form>
      </section>

      <section className="card">
        <CandidateManagementTable candidates={serializedCandidates} />
      </section>
    </div>
  );
}
