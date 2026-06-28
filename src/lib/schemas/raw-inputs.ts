import { RawInputType } from "@prisma/client";
import { z } from "zod";

const rawInputIdsSchema = z.array(z.string().trim().min(1)).min(1).max(500);

export const batchUpdateRawInputsSchema = z.object({
  ids: rawInputIdsSchema,
  patch: z
    .object({
      inputType: z.nativeEnum(RawInputType).optional(),
      candidateId: z.string().trim().min(1).nullable().optional()
    })
    .refine(
      (value) => value.inputType !== undefined || value.candidateId !== undefined,
      "请至少选择一个需要修改的字段"
    )
});

export const batchDeleteRawInputsSchema = z.object({
  ids: rawInputIdsSchema
});
