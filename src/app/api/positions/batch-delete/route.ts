import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { batchDeletePositionsSchema } from "@/lib/schemas/positions";
import { softDeletePositions } from "@/lib/services/positions";

export async function POST(request: Request) {
  const authorization = await authorizeRequest(request, PERMISSIONS.POSITION_MANAGE);
  if (!authorization.ok) return authorization.response;

  try {
    const payload = batchDeletePositionsSchema.parse(await request.json());
    return NextResponse.json(await softDeletePositions(payload.ids));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "批量删除岗位失败" },
      { status: 400 }
    );
  }
}
