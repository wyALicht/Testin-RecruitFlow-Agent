import { NextResponse } from "next/server";
import { z } from "zod";

import { AUTH_COOKIE_NAME, buildSessionCookieValue, getSessionCookieOptions } from "@/lib/auth/session";
import { createAuthUser } from "@/lib/auth/users";

const registerSchema = z
  .object({
    name: z.string().trim().min(2, "姓名至少 2 个字符").max(30, "姓名最多 30 个字符"),
    email: z.string().trim().email("请输入正确的邮箱"),
    password: z
      .string()
      .min(8, "密码至少 8 位")
      .regex(/[A-Za-z]/, "密码需包含字母")
      .regex(/\d/, "密码需包含数字"),
    confirmPassword: z.string()
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "两次输入的密码不一致",
    path: ["confirmPassword"]
  });

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const payload = registerSchema.parse(json);
    const user = await createAuthUser({
      name: payload.name,
      email: payload.email,
      password: payload.password,
      role: "recruiter"
    });

    const sessionToken = await buildSessionCookieValue({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    });

    const response = NextResponse.json({
      success: true,
      sessionToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });

    response.cookies.set(AUTH_COOKIE_NAME, sessionToken, getSessionCookieOptions());
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "注册失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
