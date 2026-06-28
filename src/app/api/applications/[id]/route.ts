import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { updateApplicationSchema } from "@/lib/schemas/positions";
import { updateApplicationProgress } from "@/lib/services/positions";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await authorizeRequest(request, PERMISSIONS.APPLICATION_WRITE);
  if (!authorization.ok) return authorization.response;

  try {
    const [{ id }, json] = await Promise.all([
      params,
      request.json()
    ]);
    const payload = updateApplicationSchema.parse(json);
    if (payload.appliedAt !== undefined) {
      const adminAuthorization = await authorizeRequest(request, PERMISSIONS.POSITION_MANAGE);
      if (!adminAuthorization.ok) return adminAuthorization.response;
    }
    return NextResponse.json(
      await updateApplicationProgress(id, payload, {
        id: authorization.user.id,
        name: authorization.user.name
      })
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "招聘进度更新失败" },
      { status: 400 }
    );
  }
}
