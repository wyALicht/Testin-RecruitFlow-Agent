"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/components/auth/auth-provider";
import { authFetch } from "@/lib/auth/client-session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import {
  downloadStyledExcel,
  getImportedValue,
  parseLocalTable,
  type ExportColumn
} from "@/lib/table-exchange";

type ImportAction = "UPDATE" | "CREATE" | "SKIP";

type DemandRow = {
  status: string;
  priority: string;
  positionName: string;
  positionCount: number;
  demandHeadcount: number;
  onboarded: number;
  pendingOffer: number;
  vacancy: number;
  progress: number | null;
  criticalStatus: string;
};

type ProcessRow = {
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

type ProcessGroup = {
  title: string;
  rows: ProcessRow[];
};

type DemandPreviewRow = {
  id: string;
  rowNumber: number;
  selected: boolean;
  action: ImportAction;
  positionName: string;
  matchLabel: string;
  status: string;
  priority: string;
  demandHeadcount?: number;
};

type ProcessPreviewRow = {
  id: string;
  rowNumber: number;
  selected: boolean;
  action: ImportAction;
  positionName: string;
  recruiter: string;
  matchLabel: string;
  recommended?: number;
  invited?: number;
  firstInterview?: number;
  secondInterview?: number;
  crossInterview?: number;
  finalInterview?: number;
  passed?: number;
  offer?: number;
  onboard?: number;
  currentRecommended?: number;
  currentInvited?: number;
  currentFirstInterview?: number;
  currentSecondInterview?: number;
  currentCrossInterview?: number;
  currentFinalInterview?: number;
  currentPassed?: number;
  currentOffer?: number;
  currentOnboard?: number;
  remark?: string;
};

type ImportResult = {
  batchIds?: string[];
  created?: number;
  updated?: number;
  createdPositions?: number;
  createdCandidates?: number;
  createdLogs?: number;
  skipped?: number;
  missing?: string[];
  error?: string;
};

const DEMAND_HEADERS = [
  "岗位状态",
  "优先级",
  "岗位名称",
  "岗位数量",
  "需求 HC",
  "已入职",
  "待入职",
  "空缺 HC",
  "招聘进度",
  "关键状态"
];

const PROCESS_HEADERS = [
  "优先级分组",
  "岗位名称",
  "招聘 HR",
  "推荐简历",
  "邀约",
  "初试",
  "复试",
  "交叉面",
  "终试",
  "通过",
  "offer",
  "到岗",
  "备注"
];

function todayString() {
  const date = new Date();
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

function parseCount(value: string) {
  if (!value) return undefined;
  const parsed = Number(value.replace(/[,%]/g, "").trim());
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : undefined;
}

function formatPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "";
  return `${Math.round(value * 100)}%`;
}

function isTotalOrEmptyRow(positionName: string) {
  return !positionName || positionName.includes("合计");
}

function processPriorityLabel(priority: ProcessRow["priority"]) {
  if (priority === "high") return "最高";
  if (priority === "mediumHigh") return "中高";
  return "常规";
}

function fileInputAccept() {
  return ".xlsx,.xls,.csv,.tsv,.html";
}

function nextActionOptions(row: { action: ImportAction; matchLabel: string }) {
  const matched = row.matchLabel.startsWith("匹配");
  return matched
    ? [
        ["UPDATE", "更新已有"] as const,
        ["CREATE", "新增记录"] as const,
        ["SKIP", "跳过"] as const
      ]
    : [
        ["CREATE", "新增记录"] as const,
        ["SKIP", "跳过"] as const
      ];
}

async function undoImport(batchIds: string[]) {
  const response = await authFetch("/api/dashboard/import/undo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ batchIds })
  });
  const payload = (await response.json()) as { error?: string };
  if (!response.ok) throw new Error(payload.error || "撤回导入失败");
}

export function DemandProgressExchangeControls({
  rows,
  snapshotDate
}: {
  rows: DemandRow[];
  snapshotDate: string;
}) {
  const router = useRouter();
  const { can } = useAuth();
  const canImport = can(PERMISSIONS.POSITION_MANAGE);
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [previewRows, setPreviewRows] = useState<DemandPreviewRow[]>([]);
  const [lastBatchIds, setLastBatchIds] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const columns: Array<ExportColumn<DemandRow>> = [
    { key: "status", label: "岗位状态", width: 120, getValue: (row) => row.status },
    { key: "priority", label: "优先级", width: 90, getValue: (row) => row.priority },
    { key: "positionName", label: "岗位名称", width: 220, getValue: (row) => row.positionName },
    { key: "positionCount", label: "岗位数量", width: 90, getValue: (row) => row.positionCount },
    { key: "demandHeadcount", label: "需求 HC", width: 90, getValue: (row) => row.demandHeadcount },
    { key: "onboarded", label: "已入职", width: 90, getValue: (row) => row.onboarded },
    { key: "pendingOffer", label: "待入职", width: 90, getValue: (row) => row.pendingOffer },
    { key: "vacancy", label: "空缺 HC", width: 90, getValue: (row) => row.vacancy },
    { key: "progress", label: "招聘进度", width: 100, getValue: (row) => formatPercent(row.progress) },
    { key: "criticalStatus", label: "关键状态", width: 180, getValue: (row) => row.criticalStatus }
  ];

  function exportRows() {
    setMessage(null);
    downloadStyledExcel({
      filename: `岗位需求进度总览-${snapshotDate}`,
      sheetName: "岗位需求进度总览",
      columns,
      rows,
      note: "可导入字段：岗位名称、岗位状态、优先级、需求 HC；公式统计列会在系统内重新计算。"
    });
  }

  async function readImportFile(file: File) {
    setMessage(null);
    const table = await parseLocalTable(file, { expectedHeaders: DEMAND_HEADERS });
    const currentByName = new Map(rows.map((row) => [normalizeKey(row.positionName), row]));
    const parsedRows = table.rows
      .map((row, index): DemandPreviewRow | null => {
        const positionName = getImportedValue(row, ["岗位名称", "岗位", "positionName"]);
        if (isTotalOrEmptyRow(positionName)) return null;
        const matched = currentByName.get(normalizeKey(positionName));
        const action: ImportAction = matched ? "UPDATE" : "SKIP";
        return {
          id: `demand-import-${table.headerRowNumber + index + 1}`,
          rowNumber: table.headerRowNumber + index + 1,
          selected: Boolean(matched),
          action,
          positionName,
          matchLabel: matched ? `匹配已有岗位：${matched.positionName}` : "未匹配已有岗位",
          status: getImportedValue(row, ["岗位状态", "状态", "recruitmentStatus"]),
          priority: getImportedValue(row, ["优先级", "priority"]),
          demandHeadcount: parseCount(getImportedValue(row, ["需求 HC", "需求HC", "需求人数", "HC"]))
        };
      })
      .filter((row): row is DemandPreviewRow => Boolean(row));

    if (!parsedRows.length) {
      setMessage("未读取到可导入的岗位需求行。");
      return;
    }
    setPreviewRows(parsedRows);
    setMessage(`已解析 ${parsedRows.length} 行，请确认后执行导入。`);
  }

  function patchPreviewRow(id: string, patch: Partial<DemandPreviewRow>) {
    setPreviewRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function executeImport() {
    const selectedRows = previewRows.filter((row) => row.selected && row.action !== "SKIP");
    if (!selectedRows.length) {
      setMessage("请至少选择一条需要新增或更新的岗位需求记录。");
      return;
    }
    startTransition(async () => {
      const response = await authFetch("/api/dashboard/demand-progress/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: selectedRows.map((row) => ({
            action: row.action,
            positionName: row.positionName,
            status: row.status,
            priority: row.priority,
            demandHeadcount: row.demandHeadcount
          }))
        })
      });
      const payload = (await response.json()) as ImportResult;
      if (!response.ok) {
        setMessage(payload.error || "岗位需求进度导入失败");
        return;
      }
      setLastBatchIds(payload.batchIds ?? []);
      setPreviewRows([]);
      setMessage(
        `导入完成：新增 ${payload.created ?? 0} 个岗位，更新 ${payload.updated ?? 0} 个岗位。`
      );
      router.refresh();
    });
  }

  function undoLastImport() {
    startTransition(async () => {
      try {
        await undoImport(lastBatchIds);
        setLastBatchIds([]);
        setMessage("本次岗位需求进度导入已撤回。");
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "撤回导入失败");
      }
    });
  }

  return (
    <div className="dashboard-import-tools">
      <div className="inline-actions">
        <button className="btn-secondary btn-compact" type="button" onClick={exportRows}>
          导出
        </button>
        {canImport ? (
          <>
            <button
              className="btn-ghost btn-compact"
              type="button"
              disabled={isPending}
              onClick={() => inputRef.current?.click()}
            >
              读取导入
            </button>
            {previewRows.length ? (
              <button className="btn-secondary btn-compact" type="button" disabled={isPending} onClick={executeImport}>
                {isPending ? "执行中..." : "执行导入"}
              </button>
            ) : null}
            {lastBatchIds.length ? (
              <button className="btn-ghost btn-compact" type="button" disabled={isPending} onClick={undoLastImport}>
                撤回本次导入
              </button>
            ) : null}
            <input
              ref={inputRef}
              type="file"
              accept={fileInputAccept()}
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.currentTarget.value = "";
                if (file) void readImportFile(file).catch((error) => setMessage(error.message));
              }}
            />
          </>
        ) : null}
        {message ? <span className="muted">{message}</span> : null}
      </div>
      {previewRows.length ? (
        <div className="dashboard-import-preview">
          {previewRows.map((row) => (
            <label className="dashboard-import-preview-row" key={row.id}>
              <input
                type="checkbox"
                checked={row.selected}
                onChange={(event) => patchPreviewRow(row.id, { selected: event.target.checked })}
              />
              <span>第 {row.rowNumber} 行</span>
              <strong>{row.positionName}</strong>
              <span>{row.matchLabel}</span>
              <select
                className="select"
                value={row.action}
                onChange={(event) => {
                  const action = event.target.value as ImportAction;
                  patchPreviewRow(row.id, { action, selected: action !== "SKIP" });
                }}
              >
                {nextActionOptions(row).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ProcessDataExchangeControls({
  groups,
  eventDate
}: {
  groups: ProcessGroup[];
  eventDate?: string;
}) {
  const router = useRouter();
  const { can } = useAuth();
  const canImport = can(PERMISSIONS.POSITION_MANAGE);
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [previewRows, setPreviewRows] = useState<ProcessPreviewRow[]>([]);
  const [lastBatchIds, setLastBatchIds] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const exportRows = groups.flatMap((group) =>
    group.rows.map((row) => ({
      ...row,
      priorityLabel: group.title || processPriorityLabel(row.priority)
    }))
  );
  const columns: Array<ExportColumn<ProcessRow & { priorityLabel: string }>> = [
    { key: "priorityLabel", label: "优先级分组", width: 130, getValue: (row) => row.priorityLabel },
    { key: "positionName", label: "岗位名称", width: 220, getValue: (row) => row.positionName },
    { key: "recruiter", label: "招聘 HR", width: 120, getValue: (row) => row.recruiter },
    { key: "recommended", label: "推荐简历", width: 100, getValue: (row) => row.recommended },
    { key: "invited", label: "邀约", width: 80, getValue: (row) => row.invited },
    { key: "firstInterview", label: "初试", width: 80, getValue: (row) => row.firstInterview },
    { key: "secondInterview", label: "复试", width: 80, getValue: (row) => row.secondInterview },
    { key: "crossInterview", label: "交叉面", width: 90, getValue: (row) => row.crossInterview },
    { key: "finalInterview", label: "终试", width: 80, getValue: (row) => row.finalInterview },
    { key: "passed", label: "通过", width: 80, getValue: (row) => row.passed },
    { key: "offer", label: "offer", width: 80, getValue: (row) => row.offer },
    { key: "onboard", label: "到岗", width: 80, getValue: (row) => row.onboard },
    { key: "remark", label: "备注", width: 180, getValue: (row) => row.remark }
  ];

  function exportProcessRows() {
    setMessage(null);
    downloadStyledExcel({
      filename: `岗位过程数据-${eventDate ?? todayString()}`,
      sheetName: "岗位过程数据",
      columns,
      rows: exportRows,
      note: "导入前可逐行选择更新已有汇总、作为新增记录导入或跳过；更新会补齐到导入数量。"
    });
  }

  async function readImportFile(file: File) {
    setMessage(null);
    const table = await parseLocalTable(file, { expectedHeaders: PROCESS_HEADERS });
    const currentByKey = new Map(
      groups.flatMap((group) => group.rows).map((row) => [
        `${normalizeKey(row.positionName)}:${normalizeKey(row.recruiter || "-")}`,
        row
      ])
    );
    const parsedRows = table.rows
      .map((row, index): ProcessPreviewRow | null => {
        const positionName = getImportedValue(row, ["岗位名称", "岗位", "positionName"]);
        if (isTotalOrEmptyRow(positionName)) return null;
        const recruiter = getImportedValue(row, ["招聘 HR", "招聘HR", "HR", "负责人", "recruiter"]) || "-";
        const matched = currentByKey.get(`${normalizeKey(positionName)}:${normalizeKey(recruiter)}`);
        const action: ImportAction = matched ? "UPDATE" : "SKIP";
        return {
          id: `process-import-${table.headerRowNumber + index + 1}`,
          rowNumber: table.headerRowNumber + index + 1,
          selected: Boolean(matched),
          action,
          positionName,
          recruiter,
          matchLabel: matched ? `匹配已有过程行：${positionName} / ${recruiter}` : "未匹配已有过程行",
          recommended: parseCount(getImportedValue(row, ["推荐简历", "推荐", "recommended"])),
          invited: parseCount(getImportedValue(row, ["邀约", "invited"])),
          firstInterview: parseCount(getImportedValue(row, ["初试", "初面", "firstInterview"])),
          secondInterview: parseCount(getImportedValue(row, ["复试", "secondInterview"])),
          crossInterview: parseCount(getImportedValue(row, ["交叉面", "crossInterview"])),
          finalInterview: parseCount(getImportedValue(row, ["终试", "finalInterview"])),
          passed: parseCount(getImportedValue(row, ["通过", "passed"])),
          offer: parseCount(getImportedValue(row, ["offer", "Offer"])),
          onboard: parseCount(getImportedValue(row, ["到岗", "入职", "onboard"])),
          currentRecommended: matched?.recommended ?? 0,
          currentInvited: matched?.invited ?? 0,
          currentFirstInterview: matched?.firstInterview ?? 0,
          currentSecondInterview: matched?.secondInterview ?? 0,
          currentCrossInterview: matched?.crossInterview ?? 0,
          currentFinalInterview: matched?.finalInterview ?? 0,
          currentPassed: matched?.passed ?? 0,
          currentOffer: matched?.offer ?? 0,
          currentOnboard: matched?.onboard ?? 0,
          remark: getImportedValue(row, ["备注", "remark"])
        };
      })
      .filter((row): row is ProcessPreviewRow => Boolean(row));

    if (!parsedRows.length) {
      setMessage("未读取到可导入的岗位过程数据。");
      return;
    }
    setPreviewRows(parsedRows);
    setMessage(`已解析 ${parsedRows.length} 行，请确认后执行导入。`);
  }

  function patchPreviewRow(id: string, patch: Partial<ProcessPreviewRow>) {
    setPreviewRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function executeImport() {
    const selectedRows = previewRows.filter((row) => row.selected && row.action !== "SKIP");
    if (!selectedRows.length) {
      setMessage("请至少选择一条需要新增或更新的过程数据。");
      return;
    }
    startTransition(async () => {
      const response = await authFetch("/api/dashboard/process-data/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventDate: eventDate ?? todayString(), rows: selectedRows })
      });
      const payload = (await response.json()) as ImportResult;
      if (!response.ok) {
        setMessage(payload.error || "岗位过程数据导入失败");
        return;
      }
      setLastBatchIds(payload.batchIds ?? []);
      setPreviewRows([]);
      setMessage(
        `导入完成：新增岗位 ${payload.createdPositions ?? 0} 个，生成候选人 ${payload.createdCandidates ?? 0} 位、流程记录 ${payload.createdLogs ?? 0} 条。`
      );
      router.refresh();
    });
  }

  function undoLastImport() {
    startTransition(async () => {
      try {
        await undoImport(lastBatchIds);
        setLastBatchIds([]);
        setMessage("本次岗位过程数据导入已撤回。");
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "撤回导入失败");
      }
    });
  }

  return (
    <div className="dashboard-import-tools">
      <div className="inline-actions">
        <button className="btn-secondary btn-compact" type="button" onClick={exportProcessRows}>
          导出
        </button>
        {canImport ? (
          <>
            <button
              className="btn-ghost btn-compact"
              type="button"
              disabled={isPending}
              onClick={() => inputRef.current?.click()}
            >
              读取导入
            </button>
            {previewRows.length ? (
              <button className="btn-secondary btn-compact" type="button" disabled={isPending} onClick={executeImport}>
                {isPending ? "执行中..." : "执行导入"}
              </button>
            ) : null}
            {lastBatchIds.length ? (
              <button className="btn-ghost btn-compact" type="button" disabled={isPending} onClick={undoLastImport}>
                撤回本次导入
              </button>
            ) : null}
            <input
              ref={inputRef}
              type="file"
              accept={fileInputAccept()}
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.currentTarget.value = "";
                if (file) void readImportFile(file).catch((error) => setMessage(error.message));
              }}
            />
          </>
        ) : null}
        {message ? <span className="muted">{message}</span> : null}
      </div>
      {previewRows.length ? (
        <div className="dashboard-import-preview">
          {previewRows.map((row) => (
            <label className="dashboard-import-preview-row" key={row.id}>
              <input
                type="checkbox"
                checked={row.selected}
                onChange={(event) => patchPreviewRow(row.id, { selected: event.target.checked })}
              />
              <span>第 {row.rowNumber} 行</span>
              <strong>{row.positionName}</strong>
              <span>{row.recruiter}</span>
              <span>{row.matchLabel}</span>
              <select
                className="select"
                value={row.action}
                onChange={(event) => {
                  const action = event.target.value as ImportAction;
                  patchPreviewRow(row.id, { action, selected: action !== "SKIP" });
                }}
              >
                {nextActionOptions(row).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}
