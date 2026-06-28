import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { dashboardDemandImportSchema } from "@/lib/schemas/dashboard-import";
import { importDashboardDemandProgress } from "@/lib/services/dashboard-import";

export async function POST(request: Request) {
  const authorization = await authorizeRequest(request, PERMISSIONS.POSITION_MANAGE);
  if (!authorization.ok) return authorization.response;

  try {
    const payload = dashboardDemandImportSchema.parse(await request.json());
    return NextResponse.json(await importDashboardDemandProgress(payload));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "岗位需求进度导入失败" },
      { status: 400 }
    );
  }
}
