import { CandidateStatus, RawInputType } from "@prisma/client";
import { z } from "zod";

import { INPUT_SCENES } from "@/lib/ai/types";

const nullableTrimmed = z
  .string()
  .trim()
  .transform((value) => (value.length ? value : null))
  .nullable()
  .optional();

export const candidateDraftSchema = z.object({
  name: z.string().trim().min(2, "候选人姓名至少 2 个字符").max(30, "候选人姓名过长"),
  phone: nullableTrimmed.refine(
    (value) => !value || /^1[3-9]\d{9}$/.test(value),
    "鎵嬫満鍙锋牸寮忎笉姝ｇ‘"
  ),
  email: nullableTrimmed.refine(
    (value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
    "邮箱格式不正确"
  ),
  school: nullableTrimmed,
  education: nullableTrimmed,
  major: nullableTrimmed,
  yearsOfExperience: z.coerce.number().int().min(0).max(50).nullable().optional(),
  skills: z.union([z.array(z.string()), z.string()]).optional(),
  status: z.nativeEnum(CandidateStatus).default(CandidateStatus.RECOMMENDED),
  source: nullableTrimmed,
  remark: nullableTrimmed,
  confidence: z.coerce.number().min(0).max(1).nullable().optional(),
  uncertainFields: z.array(z.string()).optional(),
  positionTitle: nullableTrimmed,
  rawInputId: nullableTrimmed,
  duplicateMatchId: nullableTrimmed,
  inputType: z.nativeEnum(RawInputType).optional(),
  inputScene: z.enum(INPUT_SCENES).optional(),
  tags: z.union([z.array(z.string()), z.string()]).optional(),
  followUpSuggestion: nullableTrimmed,
  customFields: z.record(z.string(), z.unknown()).default({}),
  targetPositionId: nullableTrimmed
});

export const updateCandidateSchema = candidateDraftSchema.partial().extend({
  name: z.string().trim().min(2).max(30).optional()
});

export const extractRequestSchema = z.object({
  content: z.string().trim().min(10, "璇疯嚦灏戞彁渚?10 涓瓧绗︾殑鍘熷鍐呭"),
  provider: z.enum(["mock", "deepseek", "qwen", "custom"]).optional(),
  inputTypeHint: z.nativeEnum(RawInputType).optional(),
  departmentId: z.string().trim().min(1, "璇烽€夋嫨閮ㄩ棬"),
  positionId: z.string().trim().min(1, "璇烽€夋嫨鐩爣宀椾綅")
});
