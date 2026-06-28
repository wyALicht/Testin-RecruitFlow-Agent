import { unstable_noStore as noStore } from "next/cache";

import { RawInputsList } from "@/components/raw-inputs/raw-inputs-list";
import { listRawInputCandidateOptions, listRawInputs } from "@/lib/services/raw-inputs";

export default async function RawInputsPage() {
  noStore();
  const [rawInputs, candidateOptions] = await Promise.all([
    listRawInputs(),
    listRawInputCandidateOptions()
  ]);
  const serializedRawInputs = rawInputs.map((item) => ({
    ...item,
    createdAt: item.createdAt.toISOString()
  }));

  const linkedCandidateCount = rawInputs.filter((item) => item.candidateId).length;
  const linkedTaskCount = rawInputs.reduce((sum, item) => sum + item.agentTaskCount, 0);
  const unlinkedCount = rawInputs.length - linkedCandidateCount;

  return (
    <div className="grid">
      <header className="page-header">
        <div>
          <h2>原始输入回溯</h2>
          <p>按时间回看每次录入的原文、关联候选人和关联任务，列表先展示摘要，点开后再加载详情。</p>
        </div>
      </header>

      <section className="grid cols-3 compact-grid">
        <article className="summary-card">
          <span className="summary-label">原始输入总数</span>
          <strong className="metric-compact">{rawInputs.length}</strong>
        </article>
        <article className="summary-card">
          <span className="summary-label">已关联候选人</span>
          <strong className="metric-compact">{linkedCandidateCount}</strong>
        </article>
        <article className="summary-card">
          <span className="summary-label">待补链记录</span>
          <strong className="metric-compact">{unlinkedCount}</strong>
          <span className="summary-label">关联任务共 {linkedTaskCount} 条</span>
        </article>
      </section>

      <section className="card">
        <RawInputsList items={serializedRawInputs} candidateOptions={candidateOptions} />
      </section>
    </div>
  );
}
