import { NextResponse } from "next/server";
import { z } from "zod";

import { authorizeRequest } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { updateManagedAuthUser } from "@/lib/auth/users";

const updateUserSchema = z
  .object({
    name: z.string().trim().min(2, "姓名至少 2 个字符").max(30, "姓名最多 30 个字符").optional(),
    role: z.enum(["admin", "recruiter"]).optional()
  })
  .refine((value) => value.name !== undefined || value.role !== undefined, "请至少修改一项");

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authorization = await authorizeRequest(request, PERMISSIONS.USER_MANAGE);
  if (!authorization.ok) return authorization.response;

  try {
    const [{ id }, payload] = await Promise.all([
      params,
      request.json().then((json) => updateUserSchema.parse(json))
    ]);
    return NextResponse.json(
      await updateManagedAuthUser({
        id,
        actorId: authorization.user.id,
        ...payload
      })
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "更新用户失败" },
      { status: 400 }
    );
  }
}
