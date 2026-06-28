/**
 * 本地 mock AI Provider。
 *
 * 不访问外部模型服务，直接使用本地规则生成候选人草稿，适合无 API Key 的本地启动、演示和基础流程验证。
 */
import { extractCandidateDraft, type ExtractedCandidateDraft } from "@/lib/agents/extract";
import { applyJobDescriptionAssessment } from "@/lib/ai/job-match";
import { type AIExtractionContext } from "@/lib/ai/provider";

export class MockAIProvider {
  readonly name = "mock";
  readonly displayName = "Mock / heuristic";
  readonly model = "heuristic";

  async extractCandidate(
    content: string,
    context?: AIExtractionContext
  ): Promise<ExtractedCandidateDraft> {
    return applyJobDescriptionAssessment(extractCandidateDraft(content), content, context);
  }
}
