import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { sidebarSettingsSchema } from "@/lib/schemas/settings";
import { getSidebarSettings, updateSidebarSettings } from "@/lib/services/app-settings";

export async function GET() {
  return NextResponse.json(await getSidebarSettings());
}

export async function PUT(request: Request) {
  const authorization = await authorizeRequest(request, PERMISSIONS.SITE_SETTINGS_MANAGE);
  if (!authorization.ok) return authorization.response;

  try {
    const payload = sidebarSettingsSchema.parse(await request.json());
    return NextResponse.json(await updateSidebarSettings(payload));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "侧边栏设置保存失败" },
      { status: 400 }
    );
  }
}
