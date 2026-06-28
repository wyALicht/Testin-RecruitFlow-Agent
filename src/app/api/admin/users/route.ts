import { NextResponse } from "next/server";
import { z } from "zod";

import { authorizeRequest } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createAuthUser, listAuthUsers } from "@/lib/auth/users";

const createUserSchema = z.object({
  name: z.string().trim().min(2, "姓名至少 2 个字符").max(30, "姓名最多 30 个字符"),
  email: z.string().trim().email("请输入正确的邮箱"),
  password: z
    .string()
    .min(8, "密码至少 8 位")
    .regex(/[A-Za-z]/, "密码需包含字母")
    .regex(/\d/, "密码需包含数字"),
  role: z.enum(["admin", "recruiter"]).default("recruiter")
});

export async function GET(request: Request) {
  const authorization = await authorizeRequest(request, PERMISSIONS.USER_MANAGE);
  if (!authorization.ok) return authorization.response;

  return NextResponse.json(await listAuthUsers());
}

export async function POST(request: Request) {
  const authorization = await authorizeRequest(request, PERMISSIONS.USER_MANAGE);
  if (!authorization.ok) return authorization.response;

  try {
    const payload = createUserSchema.parse(await request.json());
    const user = await createAuthUser(payload);

    return NextResponse.json(
      {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "创建用户失败" },
      { status: 400 }
    );
  }
}
