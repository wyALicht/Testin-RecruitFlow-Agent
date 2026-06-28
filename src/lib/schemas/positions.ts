import {
  CandidateStatus,
  PositionFieldScope,
  PositionFieldType,
  PositionPriority,
  PositionRecruitmentStatus
} from "@prisma/client";
import { z } from "zod";

const nullableText = z
  .string()
  .trim()
  .transform((value) => (value ? value : null))
  .nullable()
  .optional();

const nullableLongText = z
  .string()
  .trim()
  .max(20000, "岗位 JD 最多 20000 个字符")
  .transform((value) => (value ? value : null))
  .nullable()
  .optional();

export const fieldAutoFillSourceSchema = z.enum([
  "NONE",
  "STATIC",
  "CURRENT_USER",
  "CURRENT_DATE",
  "POSITION_TITLE",
  "AI_RESUME"
]);

export const createPositionSchema = z
  .object({
    title: z.string().trim().min(2).max(80),
    departmentId: nullableText,
    department: nullableText,
    headcount: z.coerce.number().int().min(1).max(10000).default(1),
    owner: nullableText,
    recruitmentStatus: z.nativeEnum(PositionRecruitmentStatus).default(PositionRecruitmentStatus.NORMAL),
    priority: z.nativeEnum(PositionPriority).default(PositionPriority.REGULAR),
    description: nullableLongText
  })
  .refine((value) => Boolean(value.departmentId || value.department), {
    message: "请选择已有部门或填写新部门",
    path: ["departmentId"]
  });

export const batchUpdatePositionsSchema = z.object({
  ids: z.array(z.string().trim().min(1)).min(1),
  patch: z
    .object({
      departmentId: nullableText,
      department: nullableText,
      owner: nullableText,
      headcount: z.coerce.number().int().min(1).max(10000).optional(),
      status: z.enum(["open", "closed"]).optional(),
      recruitmentStatus: z.nativeEnum(PositionRecruitmentStatus).optional(),
      priority: z.nativeEnum(PositionPriority).optional(),
      positionCreatedAt: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "岗位创建日期格式不正确")
        .optional()
    })
    .refine((value) => Object.values(value).some((item) => item !== undefined), "请至少选择一个要修改的字段")
});

export const batchDeletePositionsSchema = z.object({
  ids: z.array(z.string().trim().min(1)).min(1)
});

export const updatePositionJobDescriptionSchema = z.object({
  description: nullableLongText
});

export const positionFieldSchema = z.object({
  id: z.string().optional(),
  key: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z][a-z0-9_]*$/, "字段标识只能使用小写字母、数字和下划线"),
  label: z.string().trim().min(1).max(40),
  fieldType: z.nativeEnum(PositionFieldType),
  scope: z.nativeEnum(PositionFieldScope).default(PositionFieldScope.APPLICATION),
  required: z.boolean().default(false),
  visible: z.boolean().default(true),
  editable: z.boolean().default(true),
  aiExtractable: z.boolean().default(false),
  system: z.boolean().default(false),
  options: z.array(z.string().trim().min(1)).default([]),
  defaultValue: z.unknown().optional(),
  autoFillRule: z
    .object({
      source: fieldAutoFillSourceSchema.default("NONE"),
      value: z.unknown().optional()
    })
    .default({ source: "NONE" }),
  conflictPolicy: z
    .enum(["FILL_EMPTY", "OVERWRITE_NEWER", "APPEND", "REQUIRE_CONFIRMATION", "MANUAL_ONLY"])
    .default("FILL_EMPTY"),
  sortOrder: z.coerce.number().int().min(0).default(0),
  width: z.coerce.number().int().min(100).max(480).default(160),
  active: z.boolean().default(true)
});

export const replacePositionFieldsSchema = z.object({
  fields: z.array(positionFieldSchema).min(1)
});

export const updateApplicationSchema = z.object({
  status: z.nativeEnum(CandidateStatus).optional(),
  appliedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "投递日期格式不正确")
    .optional(),
  values: z.record(z.string(), z.unknown()).optional(),
  source: z.string().trim().max(40).default("MANUAL")
});

export const importPositionProgressSchema = z.object({
  rows: z.array(
    z.object({
      action: z.enum(["UPDATE", "CREATE"]),
      applicationId: z.string().trim().min(1).optional(),
      values: z.record(z.string(), z.unknown()).default({}),
      status: z.nativeEnum(CandidateStatus).optional(),
      appliedAt: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "投递日期格式不正确")
        .optional()
    }).superRefine((row, context) => {
      if (row.action === "UPDATE" && !row.applicationId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "更新已有记录时缺少投递记录",
          path: ["applicationId"]
        });
      }
      if (row.action === "CREATE" && !String(row.values.name ?? "").trim()) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "新增记录必须包含姓名",
          path: ["values", "name"]
        });
      }
    })
  ).min(1).max(1000)
});
