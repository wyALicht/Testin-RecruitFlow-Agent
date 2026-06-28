"use client";

import { CandidateStatus } from "@prisma/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { STATUS_LABELS, STATUS_ORDER } from "@/lib/constants";
import { authFetch } from "@/lib/auth/client-session";
import { StatusBadge } from "@/components/status-badge";

const KANBAN_STATUSES = STATUS_ORDER;

type CandidateCard = {
  id: string;
  name: string;
  status: CandidateStatus;
  skills: string[];
  updatedAt: string;
  position: {
    title: string;
  } | null;
};

export function KanbanBoard({ candidates }: { candidates: CandidateCard[] }) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function moveToNext(candidate: CandidateCard) {
    const currentIndex = KANBAN_STATUSES.findIndex((status) => status === candidate.status);
    const nextStatus = KANBAN_STATUSES[currentIndex + 1];
    if (!nextStatus) {
      return;
    }

    setLoadingId(candidate.id);
    await authFetch(`/api/candidates/${candidate.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        status: nextStatus,
        remark: `在看板中推进到 ${STATUS_LABELS[nextStatus]}。`
      })
    });

    setLoadingId(null);
    router.refresh();
  }

  return (
    <div className="kanban">
      {KANBAN_STATUSES.map((status) => {
        const items = candidates.filter((candidate) => candidate.status === status);

        return (
          <section key={status} className="kanban-column">
            <div className="inline-actions" style={{ justifyContent: "space-between", marginBottom: 12 }}>
              <strong>{STATUS_LABELS[status]}</strong>
              <span className="pill slate">{items.length}</span>
            </div>

            {items.length ? (
              items.map((candidate) => (
                <div key={candidate.id} className="kanban-card">
                  <div className="inline-actions" style={{ justifyContent: "space-between" }}>
                    <strong>{candidate.name}</strong>
                    <StatusBadge status={candidate.status} />
                  </div>
                  <div className="muted">{candidate.position?.title || "未分配岗位"}</div>
                  <div className="tag-list">
                    {candidate.skills.slice(0, 4).map((skill) => (
                      <span key={skill} className="tag">
                        {skill}
                      </span>
                    ))}
                  </div>
                  <div className="muted">最近更新：{new Date(candidate.updatedAt).toLocaleDateString("zh-CN")}</div>
                  <div className="inline-actions">
                    <Link href={`/candidates/${candidate.id}`} className="btn-secondary">
                      查看详情
                    </Link>
                    {KANBAN_STATUSES.findIndex((status) => status === candidate.status) <
                    KANBAN_STATUSES.length - 1 ? (
                      <button className="btn" onClick={() => moveToNext(candidate)} disabled={loadingId === candidate.id}>
                        {loadingId === candidate.id ? "推进中..." : "推进下一阶段"}
                      </button>
                    ) : null}
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state">该阶段暂无候选人</div>
            )}
          </section>
        );
      })}
    </div>
  );
}
