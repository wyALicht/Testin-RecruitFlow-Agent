"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { authFetch } from "@/lib/auth/client-session";
import { PERMISSIONS } from "@/lib/auth/permissions";

type CandidateDeleteButtonProps = {
  candidateId: string;
  candidateName: string;
  redirectTo?: string;
  variant?: "danger" | "ghost";
};

export function CandidateDeleteButton({
  candidateId,
  candidateName,
  redirectTo,
  variant = "danger"
}: CandidateDeleteButtonProps) {
  const router = useRouter();
  const { can, isLoading } = useAuth();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    const confirmed = window.confirm(`确认删除候选人“${candidateName}”吗？此操作会将其从候选人管理中移除。`);
    if (!confirmed) {
      return;
    }

    setError(null);

    startTransition(async () => {
      try {
        const response = await authFetch(`/api/candidates/${candidateId}`, {
          method: "DELETE"
        });

        const payload = (await response.json()) as { error?: string };
        if (!response.ok) {
          setError(payload.error || "删除失败");
          return;
        }

        if (redirectTo) {
          router.push(redirectTo);
          return;
        }

        router.refresh();
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "删除失败");
      }
    });
  }

  if (isLoading || !can(PERMISSIONS.CANDIDATE_DELETE)) {
    return null;
  }

  return (
    <>
      <button className={variant === "ghost" ? "btn-ghost" : "btn-danger"} onClick={handleDelete} disabled={isPending}>
        {isPending ? "删除中..." : "删除"}
      </button>
      {error ? <div className="danger-text">{error}</div> : null}
    </>
  );
}
