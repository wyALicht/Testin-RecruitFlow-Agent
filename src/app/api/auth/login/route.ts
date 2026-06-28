/**
 * 登录 API。
 *
 * 校验邮箱和密码，成功后生成自定义 Session Token，并同时返回 token 与写入 HttpOnly Cookie。
 * 依赖用户服务完成密码校验，失败统一返回 JSON 错误。
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { AUTH_COOKIE_NAME, buildSessionCookieValue, getSessionCookieOptions } from "@/lib/auth/session";
import { findAuthUserByEmail, verifyPassword } from "@/lib/auth/users";

const loginSchema = z.object({
  email: z.string().trim().email("请输入正确的邮箱"),
  password: z.string().min(6, "密码至少 6 位")
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const payload = loginSchema.parse(json);
    const user = await findAuthUserByEmail(payload.email);

    if (!user || !verifyPassword(payload.password, user.passwordHash)) {
      return NextResponse.json({ error: "邮箱或密码错误" }, { status: 401 });
    }

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
    const message = error instanceof Error ? error.message : "登录失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
