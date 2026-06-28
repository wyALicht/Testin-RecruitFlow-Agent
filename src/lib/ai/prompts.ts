import { type AIExtractionContext } from "@/lib/ai/provider";

export const CANDIDATE_EXTRACTION_SYSTEM_PROMPT = `
你是招聘数据抽取助手，负责把简历、邮件、聊天记录、面试反馈和备注整理为结构化 JSON。

输出要求：
1. 只输出一个 JSON 对象，不要输出 Markdown，不要输出解释。
2. 缺失字段必须返回 null、[] 或合理默认值，绝对不要编造手机号、邮箱、学校、工作年限。
3. uncertainFields 里列出所有你无法确认或置信度较低的字段名，使用中文字段名，例如"联系方式"、"学校"、"技能标签"。
4. confidence 返回 0 到 1 之间的小数，表示整体抽取置信度。
5. status 必须是以下枚举之一：
   RECOMMENDED, INVITED, FIRST_INTERVIEW, SECOND_INTERVIEW, CROSS_INTERVIEW, FINAL_INTERVIEW, PASSED, OFFER, ONBOARD
6. inputType 必须是以下枚举之一：
   RESUME, EMAIL, CHAT, NOTE, OTHER
7. inputScene 必须是以下枚举之一：
   RESUME, EMAIL, CHAT, INTERVIEW_FEEDBACK, NOTE, OTHER
8. tags 请补充轻量标签，优先从这些方向中选择并组合：
   前端、后端、算法、产品、测试、数据、校招、社招、高潜、需复核
9. followUpSuggestion 请给出一句简短、可执行的下一步建议，例如：
   "建议今天完成初筛电话，确认期望薪资和到岗时间。"
10. 如果提供了岗位 JD：
   - 岗位 JD 只能用于匹配评价，不能作为候选人事实信息来源
   - 不得把 JD 中的学历、技能、经验、职责填写到候选人字段
   - remark 必须概括候选人与 JD 的匹配优势、明显差距和需要核实的要求
   - followUpSuggestion 必须根据 JD 差距给出具体、可执行的下一步核实或面试建议
11. 如果岗位 JD 为空，不得自行猜测岗位要求，remark 和 followUpSuggestion 仅依据候选人材料生成。

字段定义：
- name: 候选人姓名
- phone: 手机号，没有就返回 null
- email: 邮箱，没有就返回 null
- school: 学校，没有就返回 null
- education: 候选人的最高学历，只返回“博士、硕士、本科、大专、高中、中专”之一；无法确认返回 null
- major: 专业，没有就返回 null
- yearsOfExperience: 工作年限整数，没有就返回 null
- skills: 技能标签数组
- status: 当前招聘阶段
- source: 渠道来源，例如 BOSS 直聘、拉勾、内推；无法判断返回 null
- remark: 对当前上下文的简短说明
- confidence: 整体置信度
- uncertainFields: 待人工确认字段列表
- positionTitle: 应聘岗位，没有就返回 null
- inputType: 粗粒度输入类型
- inputScene: 细粒度原始输入场景
- tags: 轻量候选人标签
- followUpSuggestion: 下一步建议动作
`.trim();

export const DYNAMIC_FIELD_EXTRACTION_PROMPT = `
如果提供了“目标岗位自定义字段”，请额外返回 customFields 对象：
- customFields 的键必须使用给出的字段 key
- 只填写候选人材料中能够确认的值
- 无法确认时返回 null，不得猜测或编造
`.trim();

function buildPositionContext(context?: AIExtractionContext) {
  const position = context?.position;
  if (!position) {
    return "未指定目标岗位。";
  }

  const jobDescription = position.jobDescription?.trim();
  const customFields = context?.customFields ?? [];

  return [
    `目标岗位：${position.title}`,
    `所属部门：${position.departmentName ?? "未设置"}`,
    jobDescription
      ? `岗位 JD 开始：\n${jobDescription}\n岗位 JD 结束。`
      : "岗位 JD：未设置。请勿猜测岗位要求。",
    customFields.length
      ? [
          "目标岗位自定义字段：",
          ...customFields.map(
            (field) =>
              `- ${field.key}: ${field.label}，类型 ${field.fieldType}${field.required ? "，必填" : ""}`
          )
        ].join("\n")
      : "目标岗位没有需要 AI 提取的自定义字段。"
  ].join("\n\n");
}

export function buildCandidateExtractionUserPrompt(
  content: string,
  context?: AIExtractionContext
) {
  return `
请从候选人材料中抽取结构化信息，并结合岗位上下文生成 Agent 备注和 AI 跟进建议，严格按 JSON 返回。

${DYNAMIC_FIELD_EXTRACTION_PROMPT}

岗位上下文开始：
${buildPositionContext(context)}
岗位上下文结束。

候选人材料开始：
${content}
候选人材料结束。

再次强调：候选人字段只能来自“候选人材料”，岗位 JD 只能用于 remark 和 followUpSuggestion 的匹配分析。
`.trim();
}
