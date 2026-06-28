import { NextResponse } from "next/server";
import { z } from "zod";

import { authorizeRequest } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { undoDashboardImportBatches } from "@/lib/services/dashboard-import";

const undoDashboardImportSchema = z.object({
  batchIds: z.array(z.string().trim().min(1)).min(1).max(200)
});

export async function POST(request: Request) {
  const authorization = await authorizeRequest(request, PERMISSIONS.POSITION_MANAGE);
  if (!authorization.ok) return authorization.response;

  try {
    const payload = undoDashboardImportSchema.parse(await request.json());
    return NextResponse.json(await undoDashboardImportBatches(payload.batchIds));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "撤回导入失败" },
      { status: 400 }
    );
  }
}
