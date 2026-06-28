/**
 * API 请求鉴权守卫。
 *
 * 负责从请求中解析当前登录用户，并按权限表判断是否允许执行操作。
 * API Route 直接返回本模块构造的 401/403 NextResponse，避免各接口重复实现鉴权错误处理。
 */
import { NextResponse } from "next/server";

import { getSessionFromRequest, type SessionUser } from "@/lib/auth/session";
import { hasPermission, type Permission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";

type AuthorizationSuccess = {
  ok: true;
  user: SessionUser;
};

type AuthorizationFailure = {
  ok: false;
  response: NextResponse;
};

export type AuthorizationResult = AuthorizationSuccess | AuthorizationFailure;

export async function getAuthenticatedUser(request: Request): Promise<SessionUser | null> {
  // Token 只证明会话有效；这里再查数据库，确保账号仍存在且角色使用最新值。
  const session = await getSessionFromRequest(request);
  if (!session) return null;

  const user = await prisma.authUser.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true
    }
  });

  if (!user) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role
  };
}

export async function authorizeRequest(
  request: Request,
  permission?: Permission
): Promise<AuthorizationResult> {
  // permission 为空时只校验登录态；传入权限时继续做角色权限判断。
  const user = await getAuthenticatedUser(request);

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "未登录或登录已过期" }, { status: 401 })
    };
  }

  if (permission && !hasPermission(user.role, permission)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "当前账号没有执行此操作的权限，请联系管理员。" },
        { status: 403 }
      )
    };
  }

  return { ok: true, user };
}
