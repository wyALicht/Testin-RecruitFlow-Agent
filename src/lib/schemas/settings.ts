import { z } from "zod";

export const sidebarSettingsSchema = z.object({
  brandTitle: z.string().trim().min(1, "系统名称不能为空").max(60, "系统名称不能超过 60 个字符"),
  brandDescription: z.string().trim().max(240, "侧边栏说明不能超过 240 个字符"),
  navLabels: z.record(
    z.string().trim().min(1, "菜单名称不能为空").max(30, "菜单名称不能超过 30 个字符")
  )
});
