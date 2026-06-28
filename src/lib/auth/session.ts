/**
 * Session Token 生成与校验工具。
 *
 * 项目没有使用第三方 JWT 库，而是用 HMAC-SHA256 对 Base64URL 编码后的会话载荷签名。
 * 登录接口写入 HttpOnly Cookie，middleware 和 API 鉴权会调用本模块校验登录态。
 */
import { cookies } from "next/headers";

import { AUTH_COOKIE_NAME, AUTH_HEADER_NAME, SESSION_TTL_MS } from "@/lib/auth/constants";

export { AUTH_COOKIE_NAME, AUTH_HEADER_NAME, SESSION_TTL_MS };

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "recruiter";
};

type SessionPayload = {
  user: SessionUser;
  expiresAt: number;
};

function getSessionSecret() {
  // 生产环境应显式配置 AUTH_SECRET；未配置时仅使用开发兜底值，避免本地演示无法登录。
  return process.env.AUTH_SECRET?.trim() || "testin-recruitflow-agent-dev-secret";
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function encodeBase64Url(value: string) {
  return bytesToBase64Url(new TextEncoder().encode(value));
}

function decodeBase64Url(value: string) {
  return new TextDecoder().decode(base64UrlToBytes(value));
}

async function sign(value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(signature));
}

function safeEqual(left: string, right: string) {
  // 固定时间比较签名，降低签名校验被时间差侧信道推断的风险。
  if (left.length !== right.length) {
    return false;
  }

  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return result === 0;
}

export async function createSessionToken(user: SessionUser) {
  const payload: SessionPayload = {
    user,
    expiresAt: Date.now() + SESSION_TTL_MS
  };

  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  return `${encodedPayload}.${await sign(encodedPayload)}`;
}

export async function verifySessionToken(token?: string | null) {
  // Token 结构为 payload.signature，任何结构错误、签名错误或过期都会返回 null。
  if (!token) {
    return null;
  }

  const [encodedPayload, receivedSignature] = token.split(".");
  if (!encodedPayload || !receivedSignature) {
    return null;
  }

  const expectedSignature = await sign(encodedPayload);
  if (!safeEqual(receivedSignature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(decodeBase64Url(encodedPayload)) as SessionPayload;
    if (!payload?.user || typeof payload.expiresAt !== "number" || payload.expiresAt <= Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export async function buildSessionCookieValue(user: SessionUser) {
  return createSessionToken(user);
}

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000
  };
}

export async function getSessionFromRequest(request: Request) {
  const headerToken = request.headers.get(AUTH_HEADER_NAME);
  if (headerToken) {
    const headerSession = await verifySessionToken(headerToken);
    if (headerSession) {
      return headerSession;
    }
  }

  const cookieStore = await cookies();
  const cookieToken = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  return verifySessionToken(cookieToken);
}
