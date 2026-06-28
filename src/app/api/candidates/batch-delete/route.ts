import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { softDeleteCandidates } from "@/lib/services/candidates";

export async function POST(request: Request) {
  const authorization = await authorizeRequest(request, PERMISSIONS.CANDIDATE_DELETE);
  if (!authorization.ok) return authorization.response;

  try {
    const json = (await request.json()) as { ids?: unknown };
    const ids = Array.isArray(json.ids) ? json.ids.filter((value): value is string => typeof value === "string") : [];

    if (!ids.length) {
      return NextResponse.json({ error: "请先选择要删除的候选人。" }, { status: 400 });
    }

    const result = await softDeleteCandidates(ids);
    return NextResponse.json({ success: true, count: result.count });
  } catch (error) {
    const message = error instanceof Error ? error.message : "批量删除候选人失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
