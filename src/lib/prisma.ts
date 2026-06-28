/**
 * Prisma Client 单例。
 *
 * 开发模式下把 PrismaClient 挂到 global，避免 Next.js 热更新反复创建数据库连接；
 * 生产模式直接创建实例，由 Prisma 负责连接池管理。
 */
import { PrismaClient } from "@prisma/client";

declare global {
  var prisma: PrismaClient | undefined;
}

export const prisma =
  global.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}
