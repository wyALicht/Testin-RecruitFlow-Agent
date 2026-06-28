/**
 * 岗位进度表导入 API。
 *
 * 针对单个岗位导入候选人申请进度。支持新增和更新两类行，
 * 服务层会记录导入批次与快照，供撤回接口做安全回滚。
 */
import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { importPositionProgressSchema } from "@/lib/schemas/positions";
import { importPositionProgress } from "@/lib/services/positions";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authorization = await authorizeRequest(request, PERMISSIONS.APPLICATION_WRITE);
  if (!authorization.ok) return authorization.response;

  try {
    const [{ id }, json] = await Promise.all([params, request.json()]);
    const payload = importPositionProgressSchema.parse(json);
    return NextResponse.json(
      await importPositionProgress(id, payload.rows, {
        id: authorization.user.id,
        name: authorization.user.name
      })
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "招聘进度表导入失败" },
      { status: 400 }
    );
  }
}
