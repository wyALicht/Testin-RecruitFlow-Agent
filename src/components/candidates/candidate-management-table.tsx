"use client";

import { CandidateStatus } from "@prisma/client";
import Link from "next/link";
import { type ReactNode, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { CandidateDeleteButton } from "@/components/candidates/candidate-delete-button";
import { useAuth } from "@/components/auth/auth-provider";
import { StatusBadge } from "@/components/status-badge";
import { authFetch } from "@/lib/auth/client-session";
import { STATUS_LABELS } from "@/lib/constants";
import { PERMISSIONS } from "@/lib/auth/permissions";
import {
  downloadStyledExcel,
  getImportedValue,
  parseLocalTable,
  type ExportColumn
} from "@/lib/table-exchange";
import { formatDateTime } from "@/lib/utils";

type CandidateListItem = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  school: string | null;
  education: string | null;
  major: string | null;
  status: CandidateStatus;
  source: string | null;
  tags: string[];
  followUpSuggestion: string | null;
  lastFollowUpAt: string | null;
  updatedAt: string;
  createdAt: string;
  position: {
    title: string;
    departmentId: string | null;
    department: string | null;
    departmentRef: {
      name: string;
    } | null;
  } | null;
  notifications: Array<{
    title: string;
  }>;
};

type SortDirection = "asc" | "desc";
type CandidateSortKey =
  | "name"
  | "position"
  | "department"
  | "phone"
  | "school"
  | "status"
  | "source"
  | "lastFollowUpAt"
  | "createdAt"
  | "updatedAt";

function candidateSortValue(candidate: CandidateListItem, key: CandidateSortKey) {
  switch (key) {
    case "position":
      return candidate.position?.title ?? "";
    case "department":
      return candidate.position?.departmentRef?.name ?? candidate.position?.department ?? "";
    case "phone":
      return candidate.phone ?? candidate.email ?? "";
    case "school":
      return candidate.school ?? candidate.major ?? "";
    case "status":
      return STATUS_LABELS[candidate.status] ?? candidate.status;
    case "source":
      return candidate.source ?? "";
    case "lastFollowUpAt":
      return candidate.lastFollowUpAt ?? candidate.updatedAt;
    case "createdAt":
      return candidate.createdAt;
    case "updatedAt":
      return candidate.updatedAt;
    default:
      return candidate.name;
  }
}

function compareCandidateValues(left: string, right: string) {
  const leftDate = Date.parse(left);
  const rightDate = Date.parse(right);
  if (Number.isFinite(leftDate) && Number.isFinite(rightDate)) {
    return leftDate - rightDate;
  }
  return left.localeCompare(right, "zh-CN", { numeric: true, sensitivity: "base" });
}

function sortCandidates(
  candidates: CandidateListItem[],
  key: CandidateSortKey,
  direction: SortDirection
) {
  const factor = direction === "asc" ? 1 : -1;
  return [...candidates].sort((left, right) => {
    const compared = compareCandidateValues(
      candidateSortValue(left, key),
      candidateSortValue(right, key)
    );
    return compared * factor || left.id.localeCompare(right.id);
  });
}

const CANDIDATE_EXPORT_COLUMNS: Array<ExportColumn<CandidateListItem>> = [
  { key: "id", label: "候选人ID", width: 190, getValue: (row) => row.id },
  { key: "name", label: "姓名", width: 120, getValue: (row) => row.name },
  { key: "position", label: "岗位", width: 180, getValue: (row) => row.position?.title ?? "" },
  {
    key: "department",
    label: "部门",
    width: 160,
    getValue: (row) => row.position?.departmentRef?.name ?? row.position?.department ?? ""
  },
  { key: "phone", label: "手机号", width: 140, getValue: (row) => row.phone ?? "" },
  { key: "email", label: "邮箱", width: 220, getValue: (row) => row.email ?? "" },
  { key: "school", label: "学校", width: 180, getValue: (row) => row.school ?? "" },
  { key: "education", label: "最高学历", width: 120, getValue: (row) => row.education ?? "" },
  { key: "major", label: "专业", width: 160, getValue: (row) => row.major ?? "" },
  { key: "status", label: "状态", width: 130, getValue: (row) => STATUS_LABELS[row.status] ?? row.status },
  { key: "source", label: "来源", width: 140, getValue: (row) => row.source ?? "" },
  { key: "tags", label: "AI标签", width: 220, getValue: (row) => row.tags.join("、") },
  { key: "followUpSuggestion", label: "AI跟进建议", width: 320, getValue: (row) => row.followUpSuggestion ?? "" },
  { key: "createdAt", label: "创建时间", width: 170, getValue: (row) => formatDateTime(row.createdAt) },
  { key: "updatedAt", label: "最近更新", width: 170, getValue: (row) => formatDateTime(row.updatedAt) }
];

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

function statusFromText(value: string): CandidateStatus | undefined {
  const normalized = value.trim();
  if (!normalized) return undefined;
  if (Object.values(CandidateStatus).includes(normalized as CandidateStatus)) {
    return normalized as CandidateStatus;
  }
  return Object.entries(STATUS_LABELS).find(([, label]) => label === normalized)?.[0] as
    | CandidateStatus
    | undefined;
}

function normalizeDuplicateName(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, "");
}

function normalizeDuplicatePhone(value: string | null | undefined) {
  return String(value ?? "").replace(/[^\d+]/g, "");
}

function duplicateKey(name: string | null | undefined, phone: string | null | undefined) {
  const normalizedName = normalizeDuplicateName(name);
  const normalizedPhone = normalizeDuplicatePhone(phone);
  return normalizedName && normalizedPhone ? `${normalizedName}:${normalizedPhone}` : "";
}

function buildCandidatePatch(row: Record<string, string>) {
  const patch: Record<string, unknown> = {};
  const mapping: Array<[string, string[]]> = [
    ["name", ["姓名", "候选人", "name"]],
    ["phone", ["手机号", "手机", "电话", "phone"]],
    ["email", ["邮箱", "email"]],
    ["school", ["学校", "毕业院校", "school"]],
    ["education", ["最高学历", "学历", "education"]],
    ["major", ["专业", "major"]],
    ["source", ["来源", "source"]],
    ["positionTitle", ["岗位", "应聘岗位", "position"]],
    ["followUpSuggestion", ["AI跟进建议", "跟进建议", "followUpSuggestion"]]
  ];

  for (const [key, headers] of mapping) {
    const value = getImportedValue(row, headers);
    if (value) patch[key] = value;
  }

  const statusText = getImportedValue(row, ["状态", "当前阶段", "status"]);
  const nextStatus = statusFromText(statusText);
  if (nextStatus) patch.status = nextStatus;

  const tags = getImportedValue(row, ["AI标签", "标签", "tags"]);
  if (tags) patch.tags = splitTextList(tags);

  return patch;
}

export function CandidateManagementTable({ candidates }: { candidates: CandidateListItem[] }) {
  const router = useRouter();
  const { can } = useAuth();
  const canDeleteCandidates = can(PERMISSIONS.CANDIDATE_DELETE);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: CandidateSortKey; direction: SortDirection }>({
    key: "updatedAt",
    direction: "desc"
  });
  const [isPending, startTransition] = useTransition();
  const [isImporting, startImportTransition] = useTransition();
  const sortedCandidates = useMemo(
    () => sortCandidates(candidates, sort.key, sort.direction),
    [candidates, sort]
  );

  const selectedCount = selectedIds.length;
  const allSelected = sortedCandidates.length > 0 && selectedCount === sortedCandidates.length;
  const selectedNames = candidates
    .filter((candidate) => selectedIds.includes(candidate.id))
    .map((candidate) => candidate.name);

  function toggleCandidate(candidateId: string) {
    setSelectedIds((current) =>
      current.includes(candidateId) ? current.filter((id) => id !== candidateId) : [...current, candidateId]
    );
  }

  function toggleAll() {
    setSelectedIds(allSelected ? [] : sortedCandidates.map((candidate) => candidate.id));
  }

  function toggleSort(key: CandidateSortKey) {
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: ["createdAt", "updatedAt", "lastFollowUpAt"].includes(key) ? "desc" : "asc" }
    );
  }

  function handleBatchDelete() {
    if (!selectedIds.length) return;

    const preview = selectedNames.slice(0, 3).join("、");
    const suffix = selectedNames.length > 3 ? ` 等 ${selectedNames.length} 位候选人` : "";
    const confirmed = window.confirm(`确认批量删除 ${preview}${suffix} 吗？此操作会将候选人移出管理列表。`);
    if (!confirmed) return;

    setError(null);
    setInfo(null);
    startTransition(async () => {
      try {
        const response = await authFetch("/api/candidates/batch-delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: selectedIds })
        });
        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          setError(payload.error || "批量删除候选人失败");
          return;
        }

        setSelectedIds([]);
        setInfo(`已删除 ${selectedIds.length} 位候选人。`);
        router.refresh();
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "批量删除候选人失败");
      }
    });
  }

  function handleExport() {
    const rows = selectedIds.length
      ? sortedCandidates.filter((candidate) => selectedIds.includes(candidate.id))
      : sortedCandidates;
    downloadStyledExcel({
      filename: `候选人详情-${new Date().toISOString().slice(0, 10)}`,
      sheetName: "候选人详情",
      columns: CANDIDATE_EXPORT_COLUMNS,
      rows,
      note: `导出时间：${formatDateTime(new Date().toISOString())}；共 ${rows.length} 条记录。`
    });
  }

  async function handleImport(file: File) {
    setError(null);
    setInfo(null);
    try {
      const table = await parseLocalTable(file);
      const byNameAndPhone = new Map(
        candidates
          .map((candidate) => [duplicateKey(candidate.name, candidate.phone), candidate] as const)
          .filter(([key]) => Boolean(key))
      );
      const updates = table.rows
        .map((row) => {
          const phone = getImportedValue(row, ["手机号", "手机", "电话", "phone"]);
          const name = getImportedValue(row, ["姓名", "候选人", "name"]);
          const candidate = byNameAndPhone.get(duplicateKey(name, phone));
          if (!candidate) return null;
          const patch = buildCandidatePatch(row);
          return Object.keys(patch).length ? { candidate, patch } : null;
        })
        .filter((item): item is { candidate: CandidateListItem; patch: Record<string, unknown> } => Boolean(item));

      if (!updates.length) {
        setError("没有找到可更新的候选人。请确认表格包含姓名和手机号，并且两项同时匹配已有候选人。");
        return;
      }

      startImportTransition(async () => {
        let success = 0;
        let failed = 0;
        for (const update of updates) {
          try {
            const response = await authFetch(`/api/candidates/${update.candidate.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(update.patch)
            });
            if (response.ok) success += 1;
            else failed += 1;
          } catch {
            failed += 1;
          }
        }
        setInfo(`导入完成：成功更新 ${success} 条，失败 ${failed} 条。`);
        router.refresh();
      });
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "导入本地表格失败");
    } finally {
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }

  function SortableHeader({
    sortKey,
    children
  }: {
    sortKey: CandidateSortKey;
    children: ReactNode;
  }) {
    const active = sort.key === sortKey;
    return (
      <th aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
        <button className="sort-button" type="button" onClick={() => toggleSort(sortKey)}>
          <span>{children}</span>
          <span className="sort-indicator" aria-hidden="true">
            {active ? (sort.direction === "asc" ? "↑" : "↓") : "↕"}
          </span>
        </button>
      </th>
    );
  }

  return (
    <>
      <div className="page-note">
        列表会随上方筛选条件刷新。可先筛选再导出，也可勾选部分候选人后只导出勾选项。
      </div>

      <div className={`selection-toolbar ${selectedCount ? "active" : ""}`}>
        <div className="selection-toolbar-copy">
          <strong>{selectedCount ? `已选 ${selectedCount} 位候选人` : "候选人详情表格操作"}</strong>
          <span>
            {selectedCount
              ? "当前批量操作仅作用于已勾选候选人。"
              : "支持导出当前筛选结果、导入本地表格批量更新、以及批量删除。"}
          </span>
        </div>
        <div className="inline-actions">
          <input
            ref={importInputRef}
            className="sr-only"
            type="file"
            accept=".xlsx,.xls,.csv,.tsv,.html"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleImport(file);
            }}
          />
          <button className="btn-secondary" type="button" onClick={() => importInputRef.current?.click()} disabled={isImporting}>
            {isImporting ? "导入中..." : "导入本地表格"}
          </button>
          <button className="btn-secondary" type="button" onClick={handleExport} disabled={!candidates.length}>
            导出表格
          </button>
          <button className="btn-ghost" type="button" onClick={() => setSelectedIds([])} disabled={!selectedCount || isPending}>
            清空选择
          </button>
          {canDeleteCandidates ? (
            <button className="btn-danger" type="button" onClick={handleBatchDelete} disabled={!selectedCount || isPending}>
              {isPending ? "删除中..." : "批量删除"}
            </button>
          ) : null}
        </div>
      </div>

      {info ? <div className="alert info table-action-alert">{info}</div> : null}
      {error ? <div className="alert danger table-action-alert">{error}</div> : null}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th className="selection-cell">
                <label className="table-checkbox" aria-label="全选当前候选人">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                  <span />
                </label>
              </th>
              <SortableHeader sortKey="name">姓名</SortableHeader>
              <SortableHeader sortKey="position">岗位 / 部门</SortableHeader>
              <SortableHeader sortKey="phone">联系方式</SortableHeader>
              <SortableHeader sortKey="school">学校 / 专业</SortableHeader>
              <SortableHeader sortKey="status">状态</SortableHeader>
              <th>AI 标签</th>
              <SortableHeader sortKey="lastFollowUpAt">最近跟进</SortableHeader>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {sortedCandidates.length ? (
              sortedCandidates.map((candidate) => {
                const isSelected = selectedIds.includes(candidate.id);
                const departmentName = candidate.position?.departmentRef?.name ?? candidate.position?.department ?? "未设置部门";

                return (
                  <tr key={candidate.id} className={isSelected ? "table-row-selected" : undefined}>
                    <td className="selection-cell">
                      <label className="table-checkbox" aria-label={`选择候选人 ${candidate.name}`}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleCandidate(candidate.id)}
                        />
                        <span />
                      </label>
                    </td>
                    <td>
                      <strong>{candidate.name}</strong>
                      <div className="muted">{candidate.source || "未填写来源"}</div>
                    </td>
                    <td>
                      <div>{candidate.position?.title || "未分配岗位"}</div>
                      <div className="muted">{departmentName}</div>
                    </td>
                    <td>
                      <div>{candidate.phone || "无手机号"}</div>
                      <div className="muted">{candidate.email || "无邮箱"}</div>
                    </td>
                    <td>
                      <div>{candidate.school || "未填写学校"}</div>
                      <div className="muted">{candidate.major || "未填写专业"}</div>
                    </td>
                    <td>
                      <StatusBadge status={candidate.status} />
                    </td>
                    <td>
                      {(candidate.tags ?? []).length ? (
                        <div className="filter-summary">
                          {(candidate.tags ?? []).map((tag) => (
                            <span key={tag} className="tag tag-neutral">
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="muted">暂无</span>
                      )}
                    </td>
                    <td>
                      <div>{formatDateTime(candidate.lastFollowUpAt || candidate.updatedAt)}</div>
                      <div className="muted">
                        {candidate.followUpSuggestion || candidate.notifications[0]?.title || "暂无待办提醒"}
                      </div>
                    </td>
                    <td>
                      <div className="inline-actions">
                        <Link href={`/candidates/${candidate.id}`} className="btn-secondary">
                          查看 / 编辑
                        </Link>
                        <CandidateDeleteButton candidateId={candidate.id} candidateName={candidate.name} variant="ghost" />
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={9}>
                  <div className="empty-state">没有匹配到候选人，试试调整筛选条件。</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
