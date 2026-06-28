/**
 * 登录用户数据服务。
 *
 * 负责用户查询、注册、管理员维护、密码哈希和密码校验。
 * 密码使用 scrypt 加盐哈希保存，登录接口和用户管理 API 依赖本模块。
 */
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

import { AuthRole as PrismaAuthRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type AuthRole = PrismaAuthRole;

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: AuthRole;
  createdAt: string;
};

export type ManagedAuthUser = Omit<AuthUser, "passwordHash"> & {
  updatedAt: string;
};

export type CreateAuthUserInput = {
  name: string;
  email: string;
  password: string;
  role?: AuthRole;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizeName(name: string) {
  return name.trim();
}

function hashPassword(password: string, salt?: string) {
  // 存储格式为 salt:derivedKey，校验时复用 salt 重新计算派生密钥。
  const resolvedSalt = salt ?? randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, resolvedSalt, 64).toString("hex");
  return `${resolvedSalt}:${derivedKey}`;
}

function buildUserId(email: string) {
  return createHash("sha1").update(normalizeEmail(email)).digest("hex").slice(0, 12);
}

function serializeUser(user: {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: AuthRole;
  createdAt: Date;
}): AuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    passwordHash: user.passwordHash,
    role: user.role,
    createdAt: user.createdAt.toISOString()
  };
}

function serializeManagedUser(user: {
  id: string;
  name: string;
  email: string;
  role: AuthRole;
  createdAt: Date;
  updatedAt: Date;
}): ManagedAuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString()
  };
}

export async function listAuthUsers() {
  const users = await prisma.authUser.findMany({
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      updatedAt: true
    }
  });

  return users.map(serializeManagedUser);
}

export async function findAuthUserByEmail(email: string) {
  const user = await prisma.authUser.findUnique({
    where: {
      email: normalizeEmail(email)
    }
  });

  return user ? serializeUser(user) : null;
}

export async function createAuthUser(input: CreateAuthUserInput) {
  const email = normalizeEmail(input.email);
  const existing = await prisma.authUser.findUnique({
    where: { email }
  });

  if (existing) {
    throw new Error("该邮箱已注册，请直接登录");
  }

  const user = await prisma.authUser.create({
    data: {
      id: buildUserId(email),
      name: normalizeName(input.name),
      email,
      passwordHash: hashPassword(input.password),
      role: input.role ?? "recruiter"
    }
  });

  return serializeUser(user);
}

export async function updateManagedAuthUser(input: {
  id: string;
  actorId: string;
  name?: string;
  role?: AuthRole;
}) {
  // 管理员维护用户时禁止把自己降级，并保证系统至少保留一名管理员。
  const target = await prisma.authUser.findUnique({
    where: { id: input.id }
  });

  if (!target) {
    throw new Error("用户不存在");
  }

  if (input.id === input.actorId && input.role && input.role !== "admin") {
    throw new Error("不能将当前登录的管理员账号降级");
  }

  if (target.role === "admin" && input.role === "recruiter") {
    const adminCount = await prisma.authUser.count({
      where: { role: "admin" }
    });
    if (adminCount <= 1) {
      throw new Error("系统必须至少保留一名管理员");
    }
  }

  const updated = await prisma.authUser.update({
    where: { id: input.id },
    data: {
      name: input.name === undefined ? undefined : normalizeName(input.name),
      role: input.role
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      updatedAt: true
    }
  });

  return serializeManagedUser(updated);
}

export function verifyPassword(password: string, passwordHash: string) {
  const [salt, expectedHash] = passwordHash.split(":");
  if (!salt || !expectedHash) {
    return false;
  }

  const actualHash = scryptSync(password, salt, 64).toString("hex");
  return timingSafeEqual(Buffer.from(actualHash, "hex"), Buffer.from(expectedHash, "hex"));
}
