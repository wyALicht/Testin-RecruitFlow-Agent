import { type ExtractedCandidateDraft, buildFollowUpSuggestion } from "@/lib/agents/extract";
import { type AIExtractionContext } from "@/lib/ai/provider";
import { SKILL_KEYWORDS } from "@/lib/constants";

function normalizedIncludes(text: string, keyword: string) {
  return text.toLowerCase().includes(keyword.toLowerCase());
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

export function applyJobDescriptionAssessment(
  draft: ExtractedCandidateDraft,
  content: string,
  context?: AIExtractionContext
): ExtractedCandidateDraft {
  const position = context?.position;
  const jobDescription = position?.jobDescription?.trim();

  if (!position || !jobDescription) {
    return draft;
  }

  const resumeText = `${content}\n${draft.skills.join(" ")}`;
  const jdSkills = SKILL_KEYWORDS.filter((skill) => normalizedIncludes(jobDescription, skill));
  const matchedSkills = jdSkills.filter((skill) => normalizedIncludes(resumeText, skill));
  const missingSkills = jdSkills.filter((skill) => !normalizedIncludes(resumeText, skill));
  const strengths = unique([...matchedSkills, ...draft.skills]).slice(0, 4);
  const gaps = missingSkills.slice(0, 4);

  const remarkSections = [
    `已结合“${position.title}”岗位 JD 进行匹配分析。`,
    strengths.length ? `候选人已体现的相关能力：${strengths.join("、")}。` : null,
    gaps.length
      ? `JD 关注但简历中尚未明确的能力：${gaps.join("、")}，需要进一步核实。`
      : "简历与 JD 中可识别的核心技能方向基本一致，仍需通过面试确认实际深度。",
    draft.uncertainFields.length
      ? `候选人信息仍有待确认项：${draft.uncertainFields.slice(0, 3).join("、")}。`
      : null
  ].filter(Boolean);

  const baseSuggestion =
    draft.followUpSuggestion ||
    buildFollowUpSuggestion({
      status: draft.status,
      uncertainFields: draft.uncertainFields,
      inputScene: draft.inputScene,
      positionTitle: position.title
    });
  const jdSuggestion = gaps.length
    ? `下一步重点核实 ${gaps.join("、")} 的实际经验，并结合 JD 场景追问项目深度。`
    : "下一步建议围绕 JD 核心职责进行结构化面试，验证相关经验的实际深度和成果。";

  return {
    ...draft,
    positionTitle: position.title,
    remark: remarkSections.join(""),
    followUpSuggestion: `${baseSuggestion}${jdSuggestion}`.trim()
  };
}
