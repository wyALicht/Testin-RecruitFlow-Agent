/**
 * 岗位集合 API。
 *
 * GET 返回岗位进度列表；POST 创建岗位并初始化默认进度字段。
 * 创建岗位需要 POSITION_MANAGE 权限。
 */
import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createPositionSchema } from "@/lib/schemas/positions";
import { createPosition, listPositionProgress } from "@/lib/services/positions";

export async function GET() {
  return NextResponse.json(await listPositionProgress());
}

export async function POST(request: Request) {
  const authorization = await authorizeRequest(request, PERMISSIONS.POSITION_MANAGE);
  if (!authorization.ok) return authorization.response;

  try {
    const payload = createPositionSchema.parse(await request.json());
    return NextResponse.json(await createPosition(payload), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "岗位创建失败" },
      { status: 400 }
    );
  }
}
