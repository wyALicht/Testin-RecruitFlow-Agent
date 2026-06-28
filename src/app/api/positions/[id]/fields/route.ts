import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { replacePositionFieldsSchema } from "@/lib/schemas/positions";
import { getPositionProgress, replacePositionFields } from "@/lib/services/positions";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const position = await getPositionProgress(id);
  if (!position) return NextResponse.json({ error: "岗位不存在" }, { status: 404 });
  return NextResponse.json(position.fieldDefinitions);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await authorizeRequest(request, PERMISSIONS.POSITION_FIELD_MANAGE);
  if (!authorization.ok) return authorization.response;

  try {
    const { id } = await params;
    const payload = replacePositionFieldsSchema.parse(await request.json());
    return NextResponse.json(
      await replacePositionFields(id, payload.fields, {
        id: authorization.user.id,
        name: authorization.user.name
      })
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "字段设置保存失败" },
      { status: 400 }
    );
  }
}
