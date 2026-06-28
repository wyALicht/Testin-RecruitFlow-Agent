/**
 * Dashboard 招聘过程数据导入 API。
 *
 * 接收汇总过程数据并生成岗位、候选人、岗位申请和招聘日志，适合演示或迁移汇总看板数据。
 * 该操作会写入批次记录，后续可通过撤回接口回滚。
 */
import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { dashboardProcessImportSchema } from "@/lib/schemas/dashboard-import";
import { importDashboardProcessData } from "@/lib/services/dashboard-import";

export async function POST(request: Request) {
  const authorization = await authorizeRequest(request, PERMISSIONS.POSITION_MANAGE);
  if (!authorization.ok) return authorization.response;

  try {
    const payload = dashboardProcessImportSchema.parse(await request.json());
    return NextResponse.json(await importDashboardProcessData(payload));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "岗位过程数据导入失败" },
      { status: 400 }
    );
  }
}
