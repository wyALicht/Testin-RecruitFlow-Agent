"use client";

import { AUTH_HEADER_NAME } from "@/lib/auth/constants";

const TAB_SESSION_KEY = "rf_tab_session_token";

export function readTabSessionToken() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.sessionStorage.getItem(TAB_SESSION_KEY);
}

export function writeTabSessionToken(token: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(TAB_SESSION_KEY, token);
}

export function clearTabSessionToken() {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(TAB_SESSION_KEY);
}

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers ?? {});
  const token = readTabSessionToken();

  if (token) {
    headers.set(AUTH_HEADER_NAME, token);
  }

  return fetch(input, {
    ...init,
    headers
  });
}
