import { randomUUID } from "node:crypto";

import type {
  AgentTask,
  Candidate,
  Notification,
  Position,
  RawInput,
  RecruitmentLog
} from "@prisma/client";

export type PositionRecord = Position;
export type CandidateRecord = Candidate;
export type RecruitmentLogRecord = RecruitmentLog;
export type RawInputRecord = RawInput;
export type AgentTaskRecord = AgentTask;
export type NotificationRecord = Notification;

export function makeId(prefix: string) {
  return `${prefix}_${randomUUID().slice(0, 8)}`;
}
