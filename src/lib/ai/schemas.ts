import { CandidateStatus, RawInputType } from "@prisma/client";
import { z } from "zod";

import { INPUT_SCENES } from "@/lib/ai/types";
import { clampConfidence, toArray } from "@/lib/utils";

const nullableString = z.preprocess((value) => {
  if (value === undefined || value === null) {
    return null;
  }

  const text = String(value).trim();
  return text.length ? text : null;
}, z.string().nullable());

const yearsSchema = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value === "number") {
    return Math.max(0, Math.min(50, Math.round(value)));
  }

  const matched = String(value).match(/\d+/);
  return matched ? Number(matched[0]) : null;
}, z.number().int().min(0).max(50).nullable());

const listSchema = z.preprocess((value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  return toArray(value);
}, z.array(z.string()));

function normalizeStatus(value: unknown): CandidateStatus {
  const text = String(value ?? "").trim().toUpperCase();
  const direct = CandidateStatus[text as keyof typeof CandidateStatus];
  if (direct) {
    return direct;
  }

  const mappings: Record<string, CandidateStatus> = {
    "新候选人": CandidateStatus.RECOMMENDED,
    "推荐简历": CandidateStatus.RECOMMENDED,
    "待筛选": CandidateStatus.RECOMMENDED,
    "筛选中": CandidateStatus.INVITED,
    "初筛": CandidateStatus.INVITED,
    "邀约": CandidateStatus.INVITED,
    "笔试": CandidateStatus.INVITED,
    "一面": CandidateStatus.FIRST_INTERVIEW,
    "初试": CandidateStatus.FIRST_INTERVIEW,
    "首轮面试": CandidateStatus.FIRST_INTERVIEW,
    "二面": CandidateStatus.SECOND_INTERVIEW,
    "复试": CandidateStatus.SECOND_INTERVIEW,
    "交叉面": CandidateStatus.CROSS_INTERVIEW,
    "终面": CandidateStatus.FINAL_INTERVIEW,
    "终试": CandidateStatus.FINAL_INTERVIEW,
    "通过": CandidateStatus.PASSED,
    "OFFER": CandidateStatus.OFFER,
    "Offer": CandidateStatus.OFFER,
    "offer": CandidateStatus.OFFER,
    "入职": CandidateStatus.ONBOARD,
    "到岗": CandidateStatus.ONBOARD,
    "已入职": CandidateStatus.ONBOARD,
    "淘汰": CandidateStatus.RECOMMENDED,
    "已淘汰": CandidateStatus.RECOMMENDED,
    "放弃": CandidateStatus.RECOMMENDED,
    "已放弃": CandidateStatus.RECOMMENDED
  };

  return mappings[String(value ?? "").trim()] ?? CandidateStatus.RECOMMENDED;
}

function normalizeInputType(value: unknown): RawInputType {
  const text = String(value ?? "").trim().toUpperCase();
  const direct = RawInputType[text as keyof typeof RawInputType];
  if (direct) {
    return direct;
  }

  const mappings: Record<string, RawInputType> = {
    "简历": RawInputType.RESUME,
    "邮件": RawInputType.EMAIL,
    "聊天": RawInputType.CHAT,
    "聊天记录": RawInputType.CHAT,
    "备注": RawInputType.NOTE,
    "其他": RawInputType.OTHER
  };

  return mappings[String(value ?? "").trim()] ?? RawInputType.OTHER;
}

function normalizeInputScene(value: unknown) {
  const text = String(value ?? "").trim().toUpperCase();
  if (INPUT_SCENES.includes(text as (typeof INPUT_SCENES)[number])) {
    return text;
  }

  const mappings: Record<string, (typeof INPUT_SCENES)[number]> = {
    "简历": "RESUME",
    "邮件": "EMAIL",
    "聊天记录": "CHAT",
    "聊天": "CHAT",
    "面试反馈": "INTERVIEW_FEEDBACK",
    "备注": "NOTE",
    "其他": "OTHER"
  };

  return mappings[String(value ?? "").trim()] ?? "OTHER";
}

export const llmCandidateExtractSchema = z.object({
  name: z.string().trim().min(1, "妯″瀷鏈繑鍥炲€欓€変汉濮撳悕"),
  phone: nullableString,
  email: nullableString,
  school: nullableString,
  education: nullableString,
  major: nullableString,
  yearsOfExperience: yearsSchema,
  skills: listSchema,
  status: z.preprocess((value) => normalizeStatus(value), z.nativeEnum(CandidateStatus)),
  source: nullableString,
  remark: nullableString,
  confidence: z.preprocess((value) => {
    if (value === undefined || value === null || value === "") {
      return 0.7;
    }

    const numeric = Number(value);
    return Number.isFinite(numeric) ? clampConfidence(numeric) : 0.7;
  }, z.number().min(0).max(1)),
  uncertainFields: listSchema,
  positionTitle: nullableString,
  inputType: z.preprocess((value) => normalizeInputType(value), z.nativeEnum(RawInputType)),
  inputScene: z.preprocess((value) => normalizeInputScene(value), z.enum(INPUT_SCENES)),
  tags: listSchema,
  followUpSuggestion: nullableString,
  customFields: z.record(z.string(), z.unknown()).default({})
});

export type LlmCandidateExtract = z.infer<typeof llmCandidateExtractSchema>;
