import { z } from "zod";

const optionalText = z
  .string()
  .trim()
  .transform((value) => (value ? value : undefined))
  .optional();

const optionalNonNegativeInt = z
  .union([z.coerce.number().int().min(0).max(1000), z.literal("").transform(() => undefined)])
  .optional();

export const dashboardDemandImportSchema = z.object({
  rows: z.array(
    z.object({
      action: z.enum(["UPDATE", "CREATE"]),
      positionName: optionalText,
      status: optionalText,
      priority: optionalText,
      demandHeadcount: optionalNonNegativeInt
    }).refine((row) => Boolean(row.positionName), {
      message: "缺少岗位名称"
    })
  ).min(1).max(1000)
});

export const dashboardProcessImportSchema = z.object({
  eventDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "统计日期格式不正确")
    .optional(),
  rows: z.array(
    z.object({
      action: z.enum(["UPDATE", "CREATE"]),
      positionName: optionalText,
      recruiter: optionalText,
      currentRecommended: optionalNonNegativeInt,
      currentInvited: optionalNonNegativeInt,
      currentFirstInterview: optionalNonNegativeInt,
      currentSecondInterview: optionalNonNegativeInt,
      currentCrossInterview: optionalNonNegativeInt,
      currentFinalInterview: optionalNonNegativeInt,
      currentPassed: optionalNonNegativeInt,
      currentOffer: optionalNonNegativeInt,
      currentOnboard: optionalNonNegativeInt,
      recommended: optionalNonNegativeInt,
      invited: optionalNonNegativeInt,
      firstInterview: optionalNonNegativeInt,
      secondInterview: optionalNonNegativeInt,
      crossInterview: optionalNonNegativeInt,
      finalInterview: optionalNonNegativeInt,
      passed: optionalNonNegativeInt,
      offer: optionalNonNegativeInt,
      onboard: optionalNonNegativeInt,
      remark: optionalText
    }).refine((row) => Boolean(row.positionName), {
      message: "缺少岗位名称"
    })
  ).min(1).max(500)
});

export type DashboardDemandImportInput = z.infer<typeof dashboardDemandImportSchema>;
export type DashboardProcessImportInput = z.infer<typeof dashboardProcessImportSchema>;
