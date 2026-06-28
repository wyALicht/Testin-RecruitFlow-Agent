"use client";

import { CandidateStatus, PositionFieldScope, PositionFieldType } from "@prisma/client";
import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/components/auth/auth-provider";
import { ACTIVE_PIPELINE_STATUSES, STATUS_LABELS } from "@/lib/constants";
import { authFetch } from "@/lib/auth/client-session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import {
  downloadStyledExcel,
  getImportedValue,
  normalizeHeader,
  parseLocalTable,
  type ExportColumn
} from "@/lib/table-exchange";

type DatePreset = "none" | "day" | "week" | "quarter" | "custom";
type SortDirection = "asc" | "desc";
type ProgressSort = {
  key: string;
  direction: SortDirection;
};

type Field = {
  id: string;
  key: string;
  label: string;
  fieldType: PositionFieldType;
  scope: PositionFieldScope;
  required: boolean;
  editable: boolean;
  options: unknown;
  width: number;
};

type Application = {
  id: string;
  status: CandidateStatus;
  ownerName: string | null;
  source: string | null;
  appliedAt: string;
  updatedAt: string;
  customValues: unknown;
  candidate: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    school: string | null;
    education: string | null;
    major: string | null;
    yearsOfExperience: number | null;
    source: string | null;
    remark: string | null;
  };
};

type ImportPreviewRow = {
  id: string;
  rowNumber: number;
  selected: boolean;
  action: "UPDATE" | "CREATE" | "SKIP";
  applicationId?: string;
  matchedApplicationId?: string;
  name: string;
  matchLabel: string;
  values: Record<string, unknown>;
  status?: CandidateStatus;
  appliedAt?: string;
  canCreate: boolean;
};

type ImportPreviewMeta = {
  fileName: string;
  sheetName?: string;
  headerRowNumber: number;
  recognizedHeaders: string[];
};

function comparePrimitiveValues(left: unknown, right: unknown) {
  const leftDate = parseMaybeDate(left);
  const rightDate = parseMaybeDate(right);
  if (leftDate && rightDate) return leftDate.getTime() - rightDate.getTime();
  if (leftDate) return 1;
  if (rightDate) return -1;

  const leftNumber = typeof left === "number" ? left : Number(displayText(left));
  const rightNumber = typeof right === "number" ? right : Number(displayText(right));
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }

  return displayText(left).localeCompare(displayText(right), "zh-CN", {
    numeric: true,
    sensitivity: "base"
  });
}

function sortApplications(applications: Application[], fields: Field[], sort: ProgressSort) {
  const field = fields.find((item) => item.key === sort.key);
  const direction = sort.direction === "asc" ? 1 : -1;
  return [...applications].sort((left, right) => {
    const leftValue = field ? initialValue(left, field) : "";
    const rightValue = field ? initialValue(right, field) : "";
    const compared = comparePrimitiveValues(leftValue, rightValue);
    return compared * direction || left.id.localeCompare(right.id);
  });
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function optionsOf(value: unknown) {
  return Array.isArray(value) ? value.map(String) : [];
}

function displayText(value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  if (Array.isArray(value)) return value.map(String).join("、");
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.label === "string") return record.label;
    if (typeof record.href === "string") return record.href;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function visualTextLength(value: unknown) {
  return Array.from(displayText(value)).reduce(
    (total, character) => total + (/[\u0000-\u00ff]/.test(character) ? 0.58 : 1),
    0
  );
}

function fieldWidthRange(field: Field) {
  switch (field.fieldType) {
    case PositionFieldType.BOOLEAN:
      return { min: 88, max: 112 };
    case PositionFieldType.NUMBER:
    case PositionFieldType.MONEY:
    case PositionFieldType.RATING:
      return { min: 104, max: 148 };
    case PositionFieldType.DATE:
      return { min: 122, max: 148 };
    case PositionFieldType.DATETIME:
      return { min: 168, max: 205 };
    case PositionFieldType.USER:
      return { min: 118, max: 180 };
    case PositionFieldType.SINGLE_SELECT:
      return { min: 128, max: 190 };
    case PositionFieldType.MULTI_SELECT:
      return { min: 160, max: 260 };
    case PositionFieldType.FILE:
    case PositionFieldType.LINK:
      return { min: 190, max: 360 };
    case PositionFieldType.LONG_TEXT:
      return { min: 260, max: 420 };
    default:
      return { min: 112, max: 280 };
  }
}

function adaptiveFieldWidth(field: Field, applications: Application[]) {
  const contentLengths = applications.map((application) => visualTextLength(initialValue(application, field)));
  const longestLength = Math.max(visualTextLength(field.label) + (field.required ? 2 : 0), ...contentLengths);
  const estimated = 34 + longestLength * 14;
  const range = fieldWidthRange(field);
  const configuredWidth = Number.isFinite(field.width) ? field.width : 160;
  const blendedWidth = estimated * 0.72 + configuredWidth * 0.28;
  return Math.round(Math.min(range.max, Math.max(range.min, blendedWidth)));
}

function fileLinkValue(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    return {
      href: typeof record.href === "string" ? record.href : "",
      label: typeof record.label === "string" ? record.label : ""
    };
  }

  const href = String(value ?? "");
  if (!href) return { href: "", label: "" };

  try {
    const parsed = new URL(href, "http://localhost");
    const fileName = parsed.searchParams.get("filename");
    return {
      href,
      label: fileName || "候选人简历"
    };
  } catch {
    return { href, label: "候选人简历" };
  }
}

function initialValue(application: Application, field: Field) {
  if (field.key === "status") return application.status;
  if (field.key === "applied_at") return application.appliedAt.slice(0, 10);
  if (field.key === "hr") return application.ownerName ?? "";
  if (field.scope === PositionFieldScope.CANDIDATE && field.key in application.candidate) {
    return application.candidate[field.key as keyof Application["candidate"]] ?? "";
  }
  if (
    field.scope === PositionFieldScope.CANDIDATE &&
    /(education|degree|学历|教育程度)/i.test(`${field.key} ${field.label}`)
  ) {
    return application.candidate.education ?? "";
  }
  return objectValue(application.customValues)[field.key] ?? "";
}

function parseMaybeDate(value: unknown) {
  const text = displayText(value);
  if (!text) return null;
  const date = new Date(text.length <= 10 ? `${text}T00:00:00.000Z` : text);
  return Number.isNaN(date.getTime()) ? null : date;
}

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

function resolveDateRange(preset: DatePreset, anchorValue: string, fromValue: string, toValue: string) {
  if (preset === "none") return {};
  if (preset === "custom") {
    const from = fromValue ? new Date(`${fromValue}T00:00:00.000Z`) : null;
    const to = toValue ? new Date(`${toValue}T00:00:00.000Z`) : null;
    if (!from || !to || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
      return {};
    }
    return {
      from: startOfDay(from),
      to: endOfDay(to)
    };
  }

  const parsedAnchor = anchorValue ? new Date(`${anchorValue}T00:00:00.000Z`) : new Date();
  const anchor = Number.isNaN(parsedAnchor.getTime()) ? new Date() : parsedAnchor;
  const from = startOfDay(anchor);
  const to = endOfDay(anchor);

  if (preset === "week") {
    const day = from.getUTCDay() || 7;
    from.setUTCDate(from.getUTCDate() - day + 1);
    to.setTime(from.getTime());
    to.setUTCDate(from.getUTCDate() + 6);
    to.setUTCHours(23, 59, 59, 999);
  }

  if (preset === "quarter") {
    const quarterStartMonth = Math.floor(from.getUTCMonth() / 3) * 3;
    from.setUTCMonth(quarterStartMonth, 1);
    to.setUTCFullYear(from.getUTCFullYear(), quarterStartMonth + 3, 0);
    to.setUTCHours(23, 59, 59, 999);
  }

  return { from, to };
}

function dateRangeText(from?: Date, to?: Date) {
  if (!from || !to) return "";
  return `${from.toISOString().slice(0, 10)} 至 ${to.toISOString().slice(0, 10)}`;
}

function normalizeImportedDate(value: string) {
  const normalized = value
    .trim()
    .replace(/[年月./]/g, "-")
    .replace(/日/g, "")
    .replace(/\s+/g, "");
  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) return undefined;
  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function importAliasesForField(field: Field) {
  const aliases: Record<string, string[]> = {
    applied_at: ["日期", "投递时间", "投递日期", "简历投递日期"],
    hr: ["HR", "招聘HR", "负责人"],
    name: ["姓名", "候选人", "候选人姓名"],
    school: ["学校", "毕业院校", "院校"],
    education: ["学历", "最高学历", "教育程度"],
    major: ["专业", "所学专业"],
    resume: ["简历", "简历文件", "简历链接"],
    interviewer: ["面试官", "初面面试官"],
    first_interview_at: ["初面安排", "初面日程安排", "初试日程安排"],
    first_interview_result: ["初面结果", "初试结果"],
    status: ["当前阶段", "招聘阶段", "流程阶段"],
    remark: ["备注", "招聘备注"]
  };
  const labelAliases: Record<string, string[]> = {
    是否参加初面: ["是否参加初试", "是否参加一面"],
    初面日程安排: ["初面安排", "初试日程安排"],
    学历: ["最高学历", "教育程度"],
    基本情况: ["候选人基本情况", "Agent备注", "AI备注"]
  };
  return Array.from(
    new Set([
      field.label,
      field.key,
      ...(aliases[field.key] ?? []),
      ...(labelAliases[field.label] ?? [])
    ])
  );
}

function normalizeImportedFieldValue(field: Field, value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (field.fieldType === PositionFieldType.DATE) {
    return normalizeImportedDate(trimmed) ?? trimmed;
  }
  if (field.fieldType === PositionFieldType.NUMBER || field.fieldType === PositionFieldType.MONEY) {
    const numeric = trimmed.replace(/[,，￥¥元]/g, "").match(/-?\d+(?:\.\d+)?/)?.[0];
    return numeric ?? trimmed;
  }
  if (field.fieldType === PositionFieldType.BOOLEAN) {
    if (/^(是|通过|参加|已完成|true|1)$/i.test(trimmed)) return true;
    if (/^(否|未通过|不参加|未完成|false|0)$/i.test(trimmed)) return false;
  }
  if (field.fieldType === PositionFieldType.MULTI_SELECT) {
    return trimmed.split(/[、，,；;]/).map((item) => item.trim()).filter(Boolean);
  }
  return trimmed;
}

function normalizeMatchValue(value: unknown) {
  return displayText(value)
    .trim()
    .toLowerCase()
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/\s+/g, "");
}

function normalizePhoneForMatch(value: unknown) {
  return displayText(value).replace(/[^\d+]/g, "");
}

function candidateDuplicateKey(name: unknown, phone: unknown) {
  const normalizedName = normalizeMatchValue(name);
  const normalizedPhone = normalizePhoneForMatch(phone);
  return normalizedName && normalizedPhone ? `${normalizedName}:${normalizedPhone}` : "";
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

function FieldInput({
  field,
  value,
  onChange,
  canEditAppliedAt
}: {
  field: Field;
  value: unknown;
  onChange: (value: unknown) => void;
  canEditAppliedAt: boolean;
}) {
  const isEditable = field.key === "applied_at" ? canEditAppliedAt : field.editable;
  if (!isEditable) {
    if (field.fieldType === PositionFieldType.FILE || field.fieldType === PositionFieldType.LINK) {
      const link = fileLinkValue(value);
      return link.href ? (
        <a className="table-link table-file-link" href={link.href} target="_blank" rel="noreferrer" title={link.label}>
          {link.label}
        </a>
      ) : (
        <span className="muted">—</span>
      );
    }
    const text = displayText(value);
    return (
      <span className={`table-readonly-value ${field.fieldType === PositionFieldType.LONG_TEXT ? "table-long-value" : ""}`} title={text}>
        {text || "—"}
      </span>
    );
  }

  if (field.key === "status") {
    return (
      <select className="table-input" value={String(value)} onChange={(event) => onChange(event.target.value)}>
        {Object.values(CandidateStatus).map((status) => (
          <option key={status} value={status}>
            {STATUS_LABELS[status]}
          </option>
        ))}
      </select>
    );
  }

  if (field.fieldType === PositionFieldType.SINGLE_SELECT) {
    return (
      <select className="table-input" value={String(value ?? "")} onChange={(event) => onChange(event.target.value)}>
        <option value="">未填写</option>
        {optionsOf(field.options).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  if (field.fieldType === PositionFieldType.BOOLEAN) {
    return (
      <select className="table-input" value={String(value ?? "")} onChange={(event) => onChange(event.target.value === "true")}>
        <option value="">未填写</option>
        <option value="true">是</option>
        <option value="false">否</option>
      </select>
    );
  }

  if (field.fieldType === PositionFieldType.LONG_TEXT) {
    return (
      <textarea
        className="table-input table-textarea"
        rows={3}
        value={displayText(value)}
        onChange={(event) => onChange(event.target.value)}
        required={field.required}
      />
    );
  }

  const type =
    field.fieldType === PositionFieldType.NUMBER || field.fieldType === PositionFieldType.MONEY
      ? "number"
      : field.fieldType === PositionFieldType.DATE
        ? "date"
        : field.fieldType === PositionFieldType.DATETIME
          ? "datetime-local"
          : field.fieldType === PositionFieldType.LINK
            ? "url"
            : "text";
  return (
    <input
      className="table-input"
      type={type}
      value={Array.isArray(value) ? value.join(", ") : String(value ?? "")}
      onChange={(event) => onChange(event.target.value)}
      required={field.required}
    />
  );
}

function EditableRow({
  application,
  fields,
  columnWidths,
  canEditAppliedAt
}: {
  application: Application;
  fields: Field[];
  columnWidths: Record<string, number>;
  canEditAppliedAt: boolean;
}) {
  const router = useRouter();
  const initial = useMemo(
    () => Object.fromEntries(fields.map((field) => [field.key, initialValue(application, field)])),
    [application, fields]
  );
  const [values, setValues] = useState<Record<string, unknown>>(initial);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    setMessage(null);
    startTransition(async () => {
      const status = values.status as CandidateStatus | undefined;
      const editableValues = Object.fromEntries(
        fields
          .filter((field) => field.editable && !["status", "applied_at"].includes(field.key))
          .map((field) => [field.key, values[field.key]])
      );
      const appliedAt = canEditAppliedAt ? String(values.applied_at ?? "") : undefined;
      const response = await authFetch(`/api/applications/${application.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, appliedAt, values: editableValues, source: "MANUAL" })
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setMessage(payload.error || "保存失败");
        return;
      }
      setMessage("已保存");
      router.refresh();
    });
  }

  return (
    <tr className="progress-table-row">
      {fields.map((field) => (
        <td
          key={field.id}
          className={`progress-table-cell progress-cell-${field.fieldType.toLowerCase()}`}
          style={{
            width: columnWidths[field.id],
            minWidth: columnWidths[field.id],
            maxWidth: columnWidths[field.id]
          }}
        >
          {field.key === "name" ? (
            <div className="cell-stack">
              <FieldInput
                field={field}
                value={values[field.key]}
                onChange={(value) => setValues((current) => ({ ...current, [field.key]: value }))}
                canEditAppliedAt={canEditAppliedAt}
              />
              <Link className="table-link subtle-link" href={`/candidates/${application.candidate.id}`}>
                候选人详情
              </Link>
            </div>
          ) : (
            <FieldInput
              field={field}
              value={values[field.key]}
              onChange={(value) => setValues((current) => ({ ...current, [field.key]: value }))}
              canEditAppliedAt={canEditAppliedAt}
            />
          )}
        </td>
      ))}
      <td className="sticky-action-cell">
        <button className="btn-secondary btn-compact" type="button" onClick={save} disabled={isPending}>
          {isPending ? "保存中..." : "保存"}
        </button>
        {message ? <div className={message === "已保存" ? "save-success" : "danger-text"} role="status">{message}</div> : null}
      </td>
    </tr>
  );
}

export function PositionProgressTable({
  fields,
  applications,
  positionId,
  positionTitle
}: {
  fields: Field[];
  applications: Application[];
  positionId: string;
  positionTitle: string;
}) {
  const router = useRouter();
  const { can } = useAuth();
  const canEditAppliedAt = can(PERMISSIONS.POSITION_MANAGE);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const now = new Date();
  const today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")
  ].join("-");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<CandidateStatus | "ALL">("ALL");
  const [owner, setOwner] = useState("");
  const [source, setSource] = useState("");
  const [datePreset, setDatePreset] = useState<DatePreset>("none");
  const [dateAnchor, setDateAnchor] = useState(today);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sort, setSort] = useState<ProgressSort>({ key: "applied_at", direction: "desc" });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreviewRow[]>([]);
  const [importPreviewMeta, setImportPreviewMeta] = useState<ImportPreviewMeta | null>(null);
  const [lastImportBatchId, setLastImportBatchId] = useState<string | null>(null);
  const [isImporting, startImportTransition] = useTransition();
  const customDateError =
    datePreset === "custom"
      ? !dateFrom || !dateTo
        ? "请选择完整的开始和结束日期。"
        : dateFrom > dateTo
          ? "开始日期不能晚于结束日期。"
          : null
      : null;
  const resolvedDateRange = resolveDateRange(datePreset, dateAnchor, dateFrom, dateTo);
  const resolvedDateRangeText = dateRangeText(resolvedDateRange.from, resolvedDateRange.to);
  const anchorYear = Number(dateAnchor.slice(0, 4)) || new Date().getFullYear();
  const anchorQuarter = Math.floor((Number(dateAnchor.slice(5, 7)) - 1) / 3) + 1 || 1;
  const quarterYears = Array.from({ length: 11 }, (_, index) => new Date().getFullYear() - 5 + index);

  const owners = useMemo(
    () => Array.from(new Set(applications.map((item) => item.ownerName).filter((item): item is string => Boolean(item)))).sort(),
    [applications]
  );
  const sources = useMemo(
    () => Array.from(new Set(applications.map((item) => item.source).filter((item): item is string => Boolean(item)))).sort(),
    [applications]
  );

  const filteredApplications = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const { from, to } = customDateError ? {} : resolvedDateRange;
    return applications.filter((application) => {
      if (status !== "ALL" && application.status !== status) return false;
      if (owner && application.ownerName !== owner) return false;
      if (source && application.source !== source) return false;
      if (normalizedQuery) {
        const haystack = [
          application.candidate.name,
          application.candidate.phone,
          application.candidate.email,
          application.candidate.school,
          application.candidate.education,
          application.candidate.major,
          application.source,
          application.ownerName,
          ...fields.map((field) => displayText(initialValue(application, field)))
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(normalizedQuery)) return false;
      }
      if (from || to) {
        const dateValue = parseMaybeDate(application.appliedAt);
        if (!dateValue) return false;
        if (to && dateValue > to) return false;
        const appliedInRange = (!from || dateValue >= from) && (!to || dateValue <= to);
        const stillInFlow = ACTIVE_PIPELINE_STATUSES.has(application.status);
        if (!appliedInRange && !stillInFlow) return false;
      }
      return true;
    });
  }, [applications, customDateError, fields, owner, query, resolvedDateRange, source, status, datePreset]);

  const sortedApplications = useMemo(
    () => sortApplications(filteredApplications, fields, sort),
    [fields, filteredApplications, sort]
  );

  const columnWidths = useMemo(
    () => Object.fromEntries(fields.map((field) => [field.id, adaptiveFieldWidth(field, filteredApplications)])),
    [filteredApplications, fields]
  );
  const tableWidth = fields.reduce((total, field) => total + columnWidths[field.id], 0) + 112;

  const exportColumns: Array<ExportColumn<Application>> = useMemo(
    () =>
      fields.map((field) => ({
        key: field.key,
        label: field.label,
        width: Math.max(100, Math.min(420, columnWidths[field.id] ?? field.width ?? 160)),
        getValue: (row: Application) => {
          const value = initialValue(row, field);
          return field.key === "status" ? STATUS_LABELS[value as CandidateStatus] ?? value : value;
        }
      })),
    [columnWidths, fields]
  );

  function handleExport() {
    downloadStyledExcel({
      filename: `${positionTitle}-招聘进度-${new Date().toISOString().slice(0, 10)}`,
      sheetName: "招聘进度",
      columns: exportColumns,
      rows: sortedApplications
    });
  }

  function toggleSort(key: string) {
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: key === "applied_at" ? "desc" : "asc" }
    );
  }

  async function handleImport(file: File) {
    setError(null);
    setMessage(null);
    try {
      const table = await parseLocalTable(file, {
        expectedHeaders: fields.flatMap(importAliasesForField)
      });
      const recognizedHeaders = table.headers.filter((header) =>
        fields.some(
          (field) => importAliasesForField(field).some(
            (alias) => normalizeHeader(header) === normalizeHeader(alias)
          )
        )
      );
      if (!recognizedHeaders.length) {
        setError(
          `未识别到招聘进度表表头。系统读取了${
            table.sheetName ? `工作表“${table.sheetName}”` : "文件"
          }第 ${table.headerRowNumber} 行，请确认该行包含网页中的招聘进度字段名称。`
        );
        return;
      }

      const usedApplicationIds = new Set<string>();
      const previewRows = table.rows.reduce<ImportPreviewRow[]>((previewAcc, row, rowIndex) => {
          const importedValues = new Map(
            fields.map((field) => [
              field.key,
              getImportedValue(row, importAliasesForField(field))
            ])
          );
          const nameField = fields.find((field) => field.key === "name");
          const importedName = getImportedValue(
            row,
            nameField
              ? importAliasesForField(nameField)
              : ["姓名", "候选人", "候选人姓名"]
          );
          const phoneField = fields.find((field) => field.key === "phone");
          const importedPhone = getImportedValue(
            row,
            phoneField ? importAliasesForField(phoneField) : ["手机号", "手机", "电话", "phone"]
          );
          const importedDuplicateKey = candidateDuplicateKey(importedName, importedPhone);
          const application = importedDuplicateKey
            ? applications
            .filter((application) => !usedApplicationIds.has(application.id))
            .find(
              (application) =>
                candidateDuplicateKey(application.candidate.name, application.candidate.phone) ===
                importedDuplicateKey
            )
            : null;
          const values: Record<string, unknown> = {};
          let nextStatus: CandidateStatus | undefined;
          let nextAppliedAt: string | undefined;
          for (const field of fields) {
            const value = getImportedValue(row, importAliasesForField(field));
            if (!value) continue;
            if (field.key === "status") {
              nextStatus = statusFromText(value);
            } else if (field.key === "applied_at" && canEditAppliedAt) {
              nextAppliedAt = normalizeImportedDate(value);
            } else if (field.editable && field.key !== "applied_at") {
              values[field.key] = normalizeImportedFieldValue(field, value);
            }
          }
          const rowNumber = table.headerRowNumber + rowIndex + 1;
          const canCreate = Boolean(importedName.trim() && importedPhone.trim());
          if (application) {
            usedApplicationIds.add(application.id);
            previewAcc.push({
              id: `import-row-${rowNumber}`,
              rowNumber,
              selected: true,
              action: "UPDATE",
              applicationId: application.id,
              matchedApplicationId: application.id,
              name: importedName || application.candidate.name,
              matchLabel: `更新已有记录：${application.candidate.name}`,
              values,
              ...(nextStatus ? { status: nextStatus } : {}),
              ...(nextAppliedAt ? { appliedAt: nextAppliedAt } : {}),
              canCreate
            });
          } else {
            previewAcc.push({
              id: `import-row-${rowNumber}`,
              rowNumber,
              selected: false,
              action: "SKIP",
              name: importedName || "未识别姓名",
              matchLabel: canCreate
                ? "未按姓名和手机号匹配到当前岗位已有记录"
                : "缺少姓名或手机号，无法按组合查重",
              values,
              ...(nextStatus ? { status: nextStatus } : {}),
              ...(nextAppliedAt ? { appliedAt: nextAppliedAt } : {}),
              canCreate
            });
          }
          return previewAcc;
        }, []);

      if (!previewRows.length) {
        setError(
          `表格已成功读取，但未找到可预览的数据行。已识别表头：${recognizedHeaders.join("、")}。`
        );
        return;
      }
      setImportPreview(previewRows);
      setImportPreviewMeta({
        fileName: file.name,
        sheetName: table.sheetName,
        headerRowNumber: table.headerRowNumber,
        recognizedHeaders
      });
      setMessage(
        `表格解析完成：匹配已有记录 ${
          previewRows.filter((row) => row.action === "UPDATE").length
        } 条，未匹配 ${previewRows.filter((row) => row.action === "SKIP").length} 条。请确认后执行。`
      );
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "导入本地表格失败");
    } finally {
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }

  function patchImportPreviewRow(id: string, patch: Partial<ImportPreviewRow>) {
    setImportPreview((current) =>
      current.map((row) => (row.id === id ? { ...row, ...patch } : row))
    );
  }

  function setAllImportRows(selected: boolean) {
    setImportPreview((current) =>
      current.map((row) =>
        row.action === "SKIP" ? row : { ...row, selected }
      )
    );
  }

  function changeImportAction(row: ImportPreviewRow, action: ImportPreviewRow["action"]) {
    patchImportPreviewRow(row.id, {
      action,
      selected: action !== "SKIP",
      applicationId: action === "UPDATE" ? row.matchedApplicationId : undefined
    });
  }

  function executeImport() {
    const selectedRows = importPreview.filter(
      (row) => row.selected && row.action !== "SKIP"
    );
    if (!selectedRows.length) {
      setError("请至少选择一条需要新增或更新的记录");
      return;
    }
    setError(null);
    startImportTransition(async () => {
      try {
        const response = await authFetch(`/api/positions/${positionId}/import`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rows: selectedRows.map((row) => ({
              action: row.action,
              ...(row.applicationId ? { applicationId: row.applicationId } : {}),
              values: row.values,
              status: row.status,
              appliedAt: row.appliedAt
            }))
          })
        });
        const payload = (await response.json()) as {
          batchId?: string;
          created?: number;
          updated?: number;
          error?: string;
        };
        if (!response.ok || !payload.batchId) {
          setError(payload.error || "招聘进度表导入失败");
          return;
        }
        setLastImportBatchId(payload.batchId);
        setImportPreview([]);
        setImportPreviewMeta(null);
        setMessage(
          `导入完成：新增 ${payload.created ?? 0} 条，更新 ${payload.updated ?? 0} 条。可点击“撤回本次导入”恢复。`
        );
        router.refresh();
      } catch (importError) {
        setError(importError instanceof Error ? importError.message : "招聘进度表导入失败");
      }
    });
  }

  function undoLastImport() {
    if (!lastImportBatchId) return;
    setError(null);
    startImportTransition(async () => {
      try {
        const response = await authFetch(
          `/api/positions/${positionId}/import/${lastImportBatchId}/undo`,
          { method: "POST" }
        );
        const payload = (await response.json()) as { error?: string };
        if (!response.ok) {
          setError(payload.error || "撤回导入失败");
          return;
        }
        setLastImportBatchId(null);
        setMessage("本次招聘进度表导入已撤回，数据已恢复到导入前状态。");
        router.refresh();
      } catch (undoError) {
        setError(undoError instanceof Error ? undoError.message : "撤回导入失败");
      }
    });
  }

  return (
    <div className="progress-table-shell">
      <div className="progress-filter-panel">
        <div className="progress-filter-grid">
          <div className="field">
            <label>搜索</label>
            <input
              className="input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="姓名、手机号、学校、字段内容"
            />
          </div>
          <div className="field">
            <label>阶段</label>
            <select className="select" value={status} onChange={(event) => setStatus(event.target.value as CandidateStatus | "ALL")}>
              <option value="ALL">全部阶段</option>
              {Object.values(CandidateStatus).map((item) => (
                <option key={item} value={item}>
                  {STATUS_LABELS[item]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>HR</label>
            <select className="select" value={owner} onChange={(event) => setOwner(event.target.value)}>
              <option value="">全部 HR</option>
              {owners.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>来源</label>
            <select className="select" value={source} onChange={(event) => setSource(event.target.value)}>
              <option value="">全部来源</option>
              {sources.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>日期筛选</label>
            <select
              className="select"
              value={datePreset}
              onChange={(event) => setDatePreset(event.target.value as DatePreset)}
            >
              <option value="none">全部</option>
              <option value="day">日</option>
              <option value="week">周</option>
              <option value="quarter">季</option>
              <option value="custom">自选时间段</option>
            </select>
          </div>
          {datePreset === "day" || datePreset === "week" ? (
            <div className="field date-filter-value">
              <label>{datePreset === "day" ? "选择投递日期" : "选择该周内任意一天"}</label>
              <input className="input" type="date" value={dateAnchor} onChange={(event) => setDateAnchor(event.target.value)} />
              {resolvedDateRangeText ? <span className="field-helper">实际范围：{resolvedDateRangeText}</span> : null}
            </div>
          ) : null}
          {datePreset === "quarter" ? (
            <div className="date-filter-quarter progress-date-quarter">
              <div className="field">
                <label>年份</label>
                <select
                  className="select"
                  value={anchorYear}
                  onChange={(event) =>
                    setDateAnchor(`${event.target.value}-${String((anchorQuarter - 1) * 3 + 1).padStart(2, "0")}-01`)
                  }
                >
                  {quarterYears.map((year) => <option key={year} value={year}>{year} 年</option>)}
                </select>
              </div>
              <div className="field">
                <label>季度</label>
                <select
                  className="select"
                  value={anchorQuarter}
                  onChange={(event) =>
                    setDateAnchor(`${anchorYear}-${String((Number(event.target.value) - 1) * 3 + 1).padStart(2, "0")}-01`)
                  }
                >
                  <option value={1}>第一季度</option>
                  <option value={2}>第二季度</option>
                  <option value={3}>第三季度</option>
                  <option value={4}>第四季度</option>
                </select>
              </div>
              {resolvedDateRangeText ? <span className="field-helper date-filter-quarter-hint">实际范围：{resolvedDateRangeText}</span> : null}
            </div>
          ) : null}
          {datePreset === "custom" ? (
            <div className="date-filter-custom progress-date-custom">
              <div className="field">
                <label>开始日期</label>
                <input
                  className="input"
                  type="date"
                  value={dateFrom}
                  max={dateTo || undefined}
                  onChange={(event) => setDateFrom(event.target.value)}
                />
              </div>
              <div className="field">
                <label>结束日期</label>
                <input
                  className="input"
                  type="date"
                  value={dateTo}
                  min={dateFrom || undefined}
                  onChange={(event) => setDateTo(event.target.value)}
                />
              </div>
              {customDateError ? (
                <span className="danger-text date-filter-custom-hint" role="alert">{customDateError}</span>
              ) : (
                <span className="field-helper date-filter-custom-hint">实际范围：{resolvedDateRangeText}</span>
              )}
            </div>
          ) : null}
          {datePreset !== "none" ? (
            <div className="date-filter-rule progress-date-rule">
              统计投递日期在范围内，或投递更早但筛选范围内仍处于流程中的候选人。
            </div>
          ) : null}
        </div>
        <div className="progress-filter-actions">
          <div className="filter-summary">
            <span className="tag tag-neutral">当前显示 {filteredApplications.length} / {applications.length} 条</span>
            {datePreset !== "none" && !customDateError ? (
              <span className="tag tag-neutral">
                投递/流程日期：{resolvedDateRangeText}
              </span>
            ) : null}
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
            <button className="btn-secondary" type="button" onClick={handleExport} disabled={!filteredApplications.length || Boolean(customDateError)}>
              导出当前结果
            </button>
            {lastImportBatchId ? (
              <button
                className="btn-secondary"
                type="button"
                onClick={undoLastImport}
                disabled={isImporting}
              >
                {isImporting ? "撤回中..." : "撤回本次导入"}
              </button>
            ) : null}
            <button
              className="btn-ghost"
              type="button"
              onClick={() => {
                setQuery("");
                setStatus("ALL");
                setOwner("");
                setSource("");
                setDatePreset("none");
                setDateAnchor(today);
                setDateFrom("");
                setDateTo("");
              }}
            >
              清空筛选
            </button>
          </div>
        </div>
        {message ? <div className="alert info table-action-alert">{message}</div> : null}
        {error ? <div className="alert danger table-action-alert">{error}</div> : null}
      </div>

      <div className="table-wrap progress-table-wrap">
        <table className="progress-table" style={{ width: tableWidth }}>
          <colgroup>
            {fields.map((field) => (
              <col key={field.id} style={{ width: columnWidths[field.id] }} />
            ))}
            <col style={{ width: 112 }} />
          </colgroup>
          <thead>
            <tr>
              {fields.map((field) => (
                <th
                  key={field.id}
                  style={{
                    width: columnWidths[field.id],
                    minWidth: columnWidths[field.id],
                    maxWidth: columnWidths[field.id]
                  }}
                  title={`${field.label} · ${columnWidths[field.id]}px`}
                  aria-sort={
                    sort.key === field.key
                      ? sort.direction === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  <button
                    className="sort-button progress-table-heading"
                    type="button"
                    onClick={() => toggleSort(field.key)}
                    title={`按${field.label}排序`}
                  >
                    <span>
                      {field.label}
                      {field.required ? <b aria-label="必填">*</b> : null}
                    </span>
                    <span className="sort-indicator" aria-hidden="true">
                      {sort.key === field.key ? (sort.direction === "asc" ? "↑" : "↓") : "↕"}
                    </span>
                  </button>
                </th>
              ))}
              <th className="sticky-action-cell">操作</th>
            </tr>
          </thead>
          <tbody>
            {sortedApplications.length ? (
              sortedApplications.map((application) => (
                <EditableRow
                  key={application.id}
                  application={application}
                  fields={fields}
                  columnWidths={columnWidths}
                  canEditAppliedAt={canEditAppliedAt}
                />
              ))
            ) : (
              <tr>
                <td colSpan={fields.length + 1}>
                  <div className="empty-state">没有匹配到招聘进度数据，请调整筛选条件或先通过 AI 录入候选人。</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {importPreviewMeta && importPreview.length ? (
        <div
          className="drawer-overlay import-preview-overlay"
          onClick={() => {
            if (!isImporting) {
              setImportPreview([]);
              setImportPreviewMeta(null);
            }
          }}
        >
          <aside
            className="drawer-panel import-preview-panel"
            onClick={(event) => event.stopPropagation()}
            aria-label="招聘进度表导入预览"
          >
            <div className="drawer-header">
              <div>
                <h3>确认导入招聘进度表</h3>
                <p>
                  {importPreviewMeta.fileName} ·
                  {importPreviewMeta.sheetName
                    ? ` 工作表“${importPreviewMeta.sheetName}”`
                    : ""} · 第 {importPreviewMeta.headerRowNumber} 行表头
                </p>
              </div>
              <button
                className="drawer-close"
                type="button"
                aria-label="关闭导入预览"
                disabled={isImporting}
                onClick={() => {
                  setImportPreview([]);
                  setImportPreviewMeta(null);
                }}
              >
                ×
              </button>
            </div>
            <div className="drawer-actions import-preview-actions">
              <div className="stats-inline">
                <span>
                  可更新 {importPreview.filter((row) => row.matchedApplicationId).length} 条
                </span>
                <span>
                  未匹配 {importPreview.filter((row) => !row.matchedApplicationId).length} 条
                </span>
                <span>
                  已选择 {importPreview.filter((row) => row.selected && row.action !== "SKIP").length} 条
                </span>
              </div>
              <div className="inline-actions">
                <button className="btn-ghost btn-compact" type="button" onClick={() => setAllImportRows(true)}>
                  全选可执行项
                </button>
                <button className="btn-ghost btn-compact" type="button" onClick={() => setAllImportRows(false)}>
                  清空选择
                </button>
              </div>
            </div>
            <div className="drawer-body import-preview-body">
              <div className="import-preview-guide">
                已匹配记录默认更新；未匹配记录默认跳过，可改为新增。每行均可独立取消选择。
              </div>
              <div className="import-preview-list">
                {importPreview.map((row) => (
                  <article
                    className={`import-preview-row ${row.selected ? "selected" : ""}`}
                    key={row.id}
                  >
                    <label className="import-preview-check">
                      <input
                        type="checkbox"
                        checked={row.selected && row.action !== "SKIP"}
                        disabled={row.action === "SKIP"}
                        onChange={(event) =>
                          patchImportPreviewRow(row.id, { selected: event.target.checked })
                        }
                        aria-label={`选择第 ${row.rowNumber} 行 ${row.name}`}
                      />
                    </label>
                    <div className="import-preview-main">
                      <strong>{row.name}</strong>
                      <span>Excel 第 {row.rowNumber} 行 · {row.matchLabel}</span>
                    </div>
                    <select
                      className="select import-action-select"
                      value={row.action}
                      onChange={(event) =>
                        changeImportAction(
                          row,
                          event.target.value as ImportPreviewRow["action"]
                        )
                      }
                    >
                      {row.matchedApplicationId ? (
                        <option value="UPDATE">更新已有记录</option>
                      ) : null}
                      <option value="SKIP">跳过</option>
                      <option value="CREATE" disabled={!row.canCreate}>
                        新增为招聘记录
                      </option>
                    </select>
                  </article>
                ))}
              </div>
            </div>
            <div className="import-preview-footer">
              <span>
                本次操作执行后可通过“撤回本次导入”恢复；记录若被再次人工修改，将停止自动撤回以保护新数据。
              </span>
              <div className="inline-actions">
                <button
                  className="btn-secondary"
                  type="button"
                  disabled={isImporting}
                  onClick={() => {
                    setImportPreview([]);
                    setImportPreviewMeta(null);
                  }}
                >
                  取消
                </button>
                <button className="btn" type="button" onClick={executeImport} disabled={isImporting}>
                  {isImporting
                    ? "正在执行..."
                    : `执行所选操作（${
                        importPreview.filter(
                          (row) => row.selected && row.action !== "SKIP"
                        ).length
                      }）`}
                </button>
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
