import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { updatePositionJobDescriptionSchema } from "@/lib/schemas/positions";
import {
  getPositionProgress,
  updatePositionJobDescription
} from "@/lib/services/positions";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const position = await getPositionProgress(id);
  if (!position) {
    return NextResponse.json({ error: "岗位不存在" }, { status: 404 });
  }
  return NextResponse.json(position);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authorization = await authorizeRequest(request, PERMISSIONS.POSITION_MANAGE);
  if (!authorization.ok) return authorization.response;

  try {
    const [{ id }, payload] = await Promise.all([
      params,
      request.json().then((json) => updatePositionJobDescriptionSchema.parse(json))
    ]);
    return NextResponse.json(
      await updatePositionJobDescription(id, payload.description)
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "岗位 JD 保存失败" },
      { status: 400 }
    );
  }
}
