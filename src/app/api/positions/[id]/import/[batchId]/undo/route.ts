/**
 * 岗位进度表导入撤回 API。
 *
 * 根据岗位 ID 和导入批次 ID 回滚上一次导入。服务层会校验导入后的记录是否被再次修改，
 * 如已发生变化则拒绝撤回，避免覆盖用户后续编辑。
 */
import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { undoPositionProgressImport } from "@/lib/services/positions";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; batchId: string }> }
) {
  const authorization = await authorizeRequest(request, PERMISSIONS.APPLICATION_WRITE);
  if (!authorization.ok) return authorization.response;

  try {
    const { id, batchId } = await params;
    return NextResponse.json(await undoPositionProgressImport(id, batchId));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "撤回导入失败" },
      { status: 400 }
    );
  }
}
