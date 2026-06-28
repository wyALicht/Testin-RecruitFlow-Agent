import { CandidateStatus } from "@prisma/client";

import { STATUS_BADGE_TONES, STATUS_LABELS } from "@/lib/constants";

export function StatusBadge({ status }: { status: CandidateStatus }) {
  return <span className={`pill ${STATUS_BADGE_TONES[status]}`}>{STATUS_LABELS[status]}</span>;
}
