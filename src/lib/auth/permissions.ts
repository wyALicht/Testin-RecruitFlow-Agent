/**
 * 角色权限定义。
 *
 * admin 拥有全部权限；recruiter 只允许使用 AI 录入、写入候选人、写入岗位申请和维护原始输入。
 * API Route 通过 PERMISSIONS 常量传入 authorizeRequest 完成权限判断。
 */
export const PERMISSIONS = {
  AI_INTAKE_USE: "ai_intake.use",
  APPLICATION_WRITE: "application.write",
  CANDIDATE_WRITE: "candidate.write",
  CANDIDATE_DELETE: "candidate.delete",
  RAW_INPUT_WRITE: "raw_input.write",
  RAW_INPUT_DELETE: "raw_input.delete",
  AGENT_TASK_DELETE: "agent_task.delete",
  POSITION_MANAGE: "position.manage",
  POSITION_FIELD_MANAGE: "position_field.manage",
  SITE_SETTINGS_MANAGE: "site_settings.manage",
  USER_MANAGE: "user.manage"
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
export type AppRole = "admin" | "recruiter";

const RECRUITER_PERMISSIONS = new Set<Permission>([
  PERMISSIONS.AI_INTAKE_USE,
  PERMISSIONS.APPLICATION_WRITE,
  PERMISSIONS.CANDIDATE_WRITE,
  PERMISSIONS.RAW_INPUT_WRITE
]);

export function hasPermission(role: AppRole, permission: Permission) {
  return role === "admin" || RECRUITER_PERMISSIONS.has(permission);
}

export function roleLabel(role: AppRole) {
  return role === "admin" ? "管理员" : "普通用户";
}
