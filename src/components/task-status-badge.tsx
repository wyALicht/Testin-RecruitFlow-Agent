import { AgentTaskStatus } from "@prisma/client";

import { TASK_STATUS_LABELS } from "@/lib/constants";

const tones: Record<AgentTaskStatus, string> = {
  PENDING: "slate",
  SUCCESS: "green",
  FAILED: "red",
  NEED_REVIEW: "amber"
};

export function TaskStatusBadge({ status }: { status: AgentTaskStatus }) {
  return <span className={`pill ${tones[status]}`}>{TASK_STATUS_LABELS[status]}</span>;
}
