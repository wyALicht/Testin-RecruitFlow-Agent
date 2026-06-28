import { unstable_noStore as noStore } from "next/cache";

import { KanbanBoard } from "@/components/kanban/kanban-board";
import { listKanbanColumns } from "@/lib/services/candidates";

export default async function KanbanPage() {
  noStore();
  const candidates = await listKanbanColumns();

  return (
    <div className="grid">
      <header className="page-header">
        <div>
          <h2>招聘看板</h2>
          <p>按阶段查看候选人分布，并直接从看板推进下一阶段，满足 MVP 中的流程可视化与状态跟踪场景。</p>
        </div>
      </header>

      <KanbanBoard
        candidates={candidates.map((candidate) => ({
          id: candidate.id,
          name: candidate.name,
          status: candidate.status,
          skills: Array.isArray(candidate.skills) ? candidate.skills.map(String) : [],
          updatedAt: candidate.updatedAt.toISOString(),
          position: candidate.position ? { title: candidate.position.title } : null
        }))}
      />
    </div>
  );
}
