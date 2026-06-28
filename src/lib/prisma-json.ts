import { Prisma } from "@prisma/client";

function cloneJson(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

export function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  const normalized = cloneJson(value ?? {});
  return (normalized === null ? {} : normalized) as Prisma.InputJsonValue;
}

export function toPrismaNullableJson(
  value: unknown
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  if (value === undefined || value === null) {
    return Prisma.JsonNull;
  }

  return cloneJson(value) as Prisma.InputJsonValue;
}
