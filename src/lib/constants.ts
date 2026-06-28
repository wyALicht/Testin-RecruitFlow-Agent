import {
  AgentTaskStatus,
  CandidateStatus,
  NotificationType,
  RawInputType
} from "@prisma/client";

import { type InputScene } from "@/lib/ai/types";

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Testin RecruitFlow Agent";

export const STATUS_LABELS: Record<CandidateStatus, string> = {
  RECOMMENDED: "推荐简历",
  INVITED: "邀约",
  FIRST_INTERVIEW: "初试",
  SECOND_INTERVIEW: "复试",
  CROSS_INTERVIEW: "交叉面",
  FINAL_INTERVIEW: "终试",
  PASSED: "通过",
  OFFER: "offer",
  ONBOARD: "到岗"
};

export const STATUS_ORDER: CandidateStatus[] = [
  CandidateStatus.RECOMMENDED,
  CandidateStatus.INVITED,
  CandidateStatus.FIRST_INTERVIEW,
  CandidateStatus.SECOND_INTERVIEW,
  CandidateStatus.CROSS_INTERVIEW,
  CandidateStatus.FINAL_INTERVIEW,
  CandidateStatus.PASSED,
  CandidateStatus.OFFER,
  CandidateStatus.ONBOARD
];

export const ACTIVE_PIPELINE_STATUSES = new Set<CandidateStatus>([
  CandidateStatus.RECOMMENDED,
  CandidateStatus.INVITED,
  CandidateStatus.FIRST_INTERVIEW,
  CandidateStatus.SECOND_INTERVIEW,
  CandidateStatus.CROSS_INTERVIEW,
  CandidateStatus.FINAL_INTERVIEW,
  CandidateStatus.PASSED,
  CandidateStatus.OFFER
]);

export const STATUS_BADGE_TONES: Record<CandidateStatus, string> = {
  RECOMMENDED: "slate",
  INVITED: "blue",
  FIRST_INTERVIEW: "indigo",
  SECOND_INTERVIEW: "violet",
  CROSS_INTERVIEW: "amber",
  FINAL_INTERVIEW: "pink",
  PASSED: "green",
  OFFER: "green",
  ONBOARD: "emerald"
};

export type PositionRecruitmentStatusValue = "NORMAL" | "DELAYED" | "PAUSED";
export type PositionPriorityValue = "HIGHEST" | "MEDIUM_HIGH" | "REGULAR";

export const POSITION_RECRUITMENT_STATUS_LABELS: Record<PositionRecruitmentStatusValue, string> = {
  NORMAL: "正常招聘",
  DELAYED: "暂缓",
  PAUSED: "暂停"
};

export const POSITION_RECRUITMENT_STATUS_ORDER: PositionRecruitmentStatusValue[] = [
  "NORMAL",
  "DELAYED",
  "PAUSED"
];

export const POSITION_PRIORITY_LABELS: Record<PositionPriorityValue, string> = {
  HIGHEST: "最高",
  MEDIUM_HIGH: "中高",
  REGULAR: "常规"
};

export const POSITION_PRIORITY_ORDER: PositionPriorityValue[] = [
  "HIGHEST",
  "MEDIUM_HIGH",
  "REGULAR"
];

export const TASK_STATUS_LABELS: Record<AgentTaskStatus, string> = {
  PENDING: "处理中",
  SUCCESS: "成功",
  FAILED: "失败",
  NEED_REVIEW: "待复核"
};

export const INPUT_TYPE_LABELS: Record<RawInputType, string> = {
  RESUME: "简历",
  EMAIL: "邮件",
  CHAT: "聊天记录",
  NOTE: "备注",
  OTHER: "其他"
};

export const INPUT_SCENE_LABELS: Record<InputScene, string> = {
  RESUME: "简历",
  EMAIL: "邮件",
  CHAT: "聊天记录",
  INTERVIEW_FEEDBACK: "面试反馈",
  NOTE: "备注",
  OTHER: "其他"
};

export const NOTIFICATION_LABELS: Record<NotificationType, string> = {
  FOLLOW_UP: "待跟进",
  INTERVIEW: "面试提醒",
  OFFER: "Offer 跟进",
  ONBOARD: "入职提醒",
  OTHER: "其他"
};

export const SKILL_KEYWORDS = [
  "React",
  "Next.js",
  "TypeScript",
  "JavaScript",
  "Vue",
  "Node.js",
  "Python",
  "Java",
  "Go",
  "Playwright",
  "Selenium",
  "Prisma",
  "SQL",
  "Prompt Engineering",
  "AI Agent",
  "LLM",
  "RAG",
  "PyTorch",
  "Spring Boot",
  "Kubernetes",
  "产品设计",
  "用户研究",
  "流程设计",
  "自动化测试",
  "CI/CD",
  "数据分析",
  "项目管理"
];
