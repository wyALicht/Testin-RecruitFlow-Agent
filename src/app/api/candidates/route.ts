/**
 * 候选人集合 API。
 *
 * GET 根据筛选参数返回候选人列表；POST 保存 AI Intake 草稿或手工候选人，并可能触发合并。
 * 写操作需要候选人写入权限，参数由 Zod schema 校验。
 */
import { CandidateStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { candidateDraftSchema } from "@/lib/schemas/candidate";
import { createOrMergeCandidate, listCandidates } from "@/lib/services/candidates";

function parseDateParam(value: string | null) {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function parseEndDateParam(value: string | null) {
  const date = parseDateParam(value);
  if (!date) return undefined;
  date.setUTCHours(23, 59, 59, 999);
  return date;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const candidates = await listCandidates({
    query: searchParams.get("q") ?? undefined,
    status: (searchParams.get("status") as CandidateStatus | "ALL" | null) ?? "ALL",
    positionId: searchParams.get("positionId") ?? undefined,
    departmentId: searchParams.get("departmentId") ?? undefined,
    source: searchParams.get("source") ?? undefined,
    updatedWithinDays: searchParams.get("updatedWithinDays")
      ? Number(searchParams.get("updatedWithinDays"))
      : undefined,
    dateFrom: parseDateParam(searchParams.get("dateFrom")),
    dateTo: parseEndDateParam(searchParams.get("dateTo")),
    onlyPendingFollowUp: searchParams.get("onlyPendingFollowUp") === "true"
  });

  return NextResponse.json(candidates);
}

export async function POST(request: Request) {
  const authorization = await authorizeRequest(request, PERMISSIONS.CANDIDATE_WRITE);
  if (!authorization.ok) return authorization.response;

  try {
    const json = await request.json();
    const payload = candidateDraftSchema.parse(json);
    const result = await createOrMergeCandidate({
      ...payload,
      inputType: payload.inputType,
      currentUser: authorization.user
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "候选人保存失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
