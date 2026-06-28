import { AgentTaskStatus } from "@prisma/client";
import { unstable_noStore as noStore } from "next/cache";

import { AgentTaskLogDrawer } from "@/components/agent-tasks/agent-task-log-drawer";
import { listAgentTasks } from "@/lib/services/candidates";

export default async function AgentTasksPage() {
  noStore();
  const tasks = await listAgentTasks();
  const serializedTasks = tasks.map((task) => ({
    ...task,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    candidate: task.candidate
      ? {
          id: task.candidate.id,
          name: task.candidate.name,
          status: task.candidate.status,
          position: task.candidate.position ? { title: task.candidate.position.title } : null
        }
      : null,
    rawInput: task.rawInput
      ? {
          id: task.rawInput.id,
          candidateId: task.rawInput.candidateId,
          inputType: task.rawInput.inputType,
          createdAt: task.rawInput.createdAt.toISOString()
        }
      : null
  }));

  const completedCount = tasks.filter((task) => task.status === AgentTaskStatus.SUCCESS).length;
  const failedCount = tasks.filter((task) => task.status === AgentTaskStatus.FAILED).length;
  const unlinkedCount = tasks.filter((task) => !task.candidateId).length;

  return (
    <div className="grid">
      <header className="page-header">
        <div>
          <h2>Agent 日志</h2>
          <p>列表页只保留任务摘要，点击后再按需加载输入、输出、原始输入和错误信息。</p>
        </div>
      </header>

      <section className="grid cols-3 compact-grid">
        <article className="summary-card">
          <span className="summary-label">任务总数</span>
          <strong className="metric-compact">{tasks.length}</strong>
        </article>
        <article className="summary-card">
          <span className="summary-label">已完成 / 失败</span>
          <strong className="metric-compact">
            {completedCount} / {failedCount}
          </strong>
        </article>
        <article className="summary-card">
          <span className="summary-label">未关联候选人</span>
          <strong className="metric-compact">{unlinkedCount}</strong>
        </article>
      </section>

      <section className="card">
        <AgentTaskLogDrawer tasks={serializedTasks} />
      </section>
    </div>
  );
}
