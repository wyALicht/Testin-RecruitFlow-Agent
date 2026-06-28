import { Prisma } from "@prisma/client";
import { unstable_noStore as noStore, revalidatePath } from "next/cache";

import {
  DEFAULT_SIDEBAR_SETTINGS,
  normalizeSidebarSettings,
  SIDEBAR_SETTINGS_KEY,
  type SidebarSettings
} from "@/lib/sidebar-settings";
import { prisma } from "@/lib/prisma";

type AppSettingRow = {
  value: Prisma.JsonValue;
};

export async function getSidebarSettings() {
  noStore();
  const rows = await prisma.$queryRaw<AppSettingRow[]>(
    Prisma.sql`SELECT "value" FROM "AppSetting" WHERE "key" = ${SIDEBAR_SETTINGS_KEY} LIMIT 1`
  );

  return rows[0]?.value
    ? normalizeSidebarSettings(rows[0].value)
    : DEFAULT_SIDEBAR_SETTINGS;
}

export async function updateSidebarSettings(settings: SidebarSettings) {
  const normalized = normalizeSidebarSettings(settings);
  const value = JSON.stringify(normalized);

  await prisma.$executeRaw(
    Prisma.sql`
      INSERT INTO "AppSetting" ("key", "value", "updatedAt")
      VALUES (${SIDEBAR_SETTINGS_KEY}, CAST(${value} AS JSONB), NOW())
      ON CONFLICT ("key")
      DO UPDATE SET "value" = CAST(${value} AS JSONB), "updatedAt" = NOW()
    `
  );

  revalidatePath("/", "layout");
  return normalized;
}
