import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { batchUpdatePositionsSchema } from "@/lib/schemas/positions";
import { batchUpdatePositions } from "@/lib/services/positions";

export async function POST(request: Request) {
  const authorization = await authorizeRequest(request, PERMISSIONS.POSITION_MANAGE);
  if (!authorization.ok) return authorization.response;

  try {
    const payload = batchUpdatePositionsSchema.parse(await request.json());
    return NextResponse.json(await batchUpdatePositions(payload.ids, payload.patch));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "批量编辑岗位失败" },
      { status: 400 }
    );
  }
}
