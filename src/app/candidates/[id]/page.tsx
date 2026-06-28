import Link from "next/link";
import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";

import { CandidateDeleteButton } from "@/components/candidates/candidate-delete-button";
import { CandidateDetailPanel } from "@/components/candidates/candidate-detail-panel";
import { StatusBadge } from "@/components/status-badge";
import { TaskStatusBadge } from "@/components/task-status-badge";
import { INPUT_SCENE_LABELS, INPUT_TYPE_LABELS, STATUS_LABELS } from "@/lib/constants";
import { getCandidateById } from "@/lib/services/candidates";
import { formatDateTime } from "@/lib/utils";

export default async function CandidateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  noStore();
  const { id } = await params;
  const candidate = await getCandidateById(id);

  if (!candidate) {
    notFound();
  }

  return (
    <div className="grid">
      <header className="page-header">
        <div>
          <h2>{candidate.name}</h2>
          <p>查看原始输入、招聘时间线、Agent 执行记录和提醒事项，也可以直接在详情页补全字段、标签和跟进建议。</p>
        </div>
        <div className="page-actions">
          <StatusBadge status={candidate.status} />
          <CandidateDeleteButton
            candidateId={candidate.id}
            candidateName={candidate.name}
            redirectTo="/candidates"
          />
          <Link href="/candidates" className="btn-secondary">
            返回列表
          </Link>
        </div>
      </header>

      <CandidateDetailPanel
        candidate={{
          id: candidate.id,
          name: candidate.name,
          phone: candidate.phone,
          email: candidate.email,
          school: candidate.school,
          education: candidate.education,
          major: candidate.major,
          yearsOfExperience: candidate.yearsOfExperience,
          skills: Array.isArray(candidate.skills) ? candidate.skills.map(String) : [],
          status: candidate.status,
          source: candidate.source,
          remark: candidate.remark,
          confidence: candidate.confidence,
          uncertainFields: Array.isArray(candidate.uncertainFields) ? candidate.uncertainFields.map(String) : [],
          positionTitle: candidate.position?.title ?? null,
          tags: Array.isArray(candidate.tags) ? candidate.tags.map(String) : [],
          followUpSuggestion: candidate.followUpSuggestion ?? null,
          notifications: candidate.notifications.map((item) => ({
            id: item.id,
            title: item.title,
            note: item.note,
            dueAt: item.dueAt?.toISOString() ?? null,
            done: item.done,
            type: item.type
          }))
        }}
      />

      <section className="grid cols-2">
        <div className="card">
          <h3>招聘流程时间线</h3>
          <div className="timeline">
            {candidate.logs.length ? (
              candidate.logs.map((log) => (
                <div key={log.id} className="timeline-item">
                  <strong>{STATUS_LABELS[log.toStatus]}</strong>
                  <div className="muted">
                    {formatDateTime(log.createdAt)} | {log.source || "manual"} | {log.createdBy || "未知操作人"}
                  </div>
                  <p style={{ marginBottom: 0 }}>{log.note || "无备注"}</p>
                </div>
              ))
            ) : (
              <div className="empty-state">暂无流程日志。</div>
            )}
          </div>
        </div>

        <div className="card" id="raw-inputs">
          <h3>原始输入记录</h3>
          <div className="subtle-list">
            {candidate.rawInputs.length ? (
              candidate.rawInputs.map((input) => (
                <div key={input.id} className="subtle-item">
                  <div className="muted">
                    {formatDateTime(input.createdAt)} | {INPUT_TYPE_LABELS[input.inputType]}
                    {input.inputScene ? ` | ${INPUT_SCENE_LABELS[input.inputScene]}` : ""}
                  </div>
                  <pre style={{ whiteSpace: "pre-wrap", margin: "8px 0 0" }}>{input.content}</pre>
                </div>
              ))
            ) : (
              <div className="empty-state">暂无原始输入。</div>
            )}
          </div>
        </div>
      </section>

      <section className="card" id="agent-tasks">
        <h3>Agent 处理记录</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Agent</th>
                <th>任务类型</th>
                <th>状态</th>
                <th>置信度</th>
                <th>耗时</th>
                <th>创建时间</th>
              </tr>
            </thead>
            <tbody>
              {candidate.agentTasks.length ? (
                candidate.agentTasks.map((task) => (
                  <tr key={task.id}>
                    <td>{task.agentName}</td>
                    <td>{task.taskType}</td>
                    <td>
                      <TaskStatusBadge status={task.status} />
                    </td>
                    <td>{task.confidence ? `${Math.round(task.confidence * 100)}%` : "暂无"}</td>
                    <td>{task.durationMs ? `${task.durationMs}ms` : "未记录"}</td>
                    <td>{formatDateTime(task.createdAt)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">当前没有 Agent 任务记录。</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
