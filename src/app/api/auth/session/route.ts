import { NextResponse } from "next/server";

import { getAuthenticatedUser } from "@/lib/auth/guards";

export async function GET(request: Request) {
  const user = await getAuthenticatedUser(request);

  if (!user) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    user
  });
}
