import {
  CandidateStatus,
  NotificationType,
  RawInputType,
  type Candidate
} from "@prisma/client";

import { type InputScene } from "@/lib/ai/types";
import { ACTIVE_PIPELINE_STATUSES, SKILL_KEYWORDS, STATUS_ORDER } from "@/lib/constants";
import { clampConfidence, toArray } from "@/lib/utils";

/**
 * 本地候选人抽取与招聘业务规则。
 *
 * 这里提供 mock 模式和真实模型兜底所需的规则能力，包括基础字段识别、输入场景判断、
 * 标签推导、跟进建议、提醒生成、重复候选人检测和候选人合并策略。服务层和 AI Provider
 * 都依赖本模块产出的 ExtractedCandidateDraft 统一结构。
 */
export type ExtractedCandidateDraft = {
  name: string;
  phone: string | null;
  email: string | null;
  school: string | null;
  education: string | null;
  major: string | null;
  yearsOfExperience: number | null;
  skills: string[];
  status: CandidateStatus;
  source: string | null;
  remark: string | null;
  confidence: number;
  uncertainFields: string[];
  positionTitle: string | null;
  inputType: RawInputType;
  inputScene: InputScene;
  tags: string[];
  followUpSuggestion: string | null;
  customFields: Record<string, unknown>;
};

export type DuplicateHint = {
  candidateId: string;
  candidateName: string;
  reasons: string[];
  score: number;
  status: CandidateStatus;
  positionTitle: string | null;
};

type FollowUpContext = {
  status: CandidateStatus;
  uncertainFields: string[];
  inputScene: InputScene;
  positionTitle: string | null;
};

function normalizeLineValue(value: string) {
  return value.replace(/[锛屻€傦紱;].*$/, "").trim();
}

function matchLine(content: string, labels: string[]) {
  // 兼容“字段名: 值”和部分历史乱码分隔符格式，优先提取单行字段值。
  for (const label of labels) {
    const regex = new RegExp(`${label}[锛?]?\\s*([^\\n\\r]+)`, "i");
    const matched = content.match(regex);
    if (matched?.[1]) {
      return matched[1].trim();
    }
  }

  return null;
}

function detectPhone(content: string) {
  return content.match(/(?:\+?86[-\s]?)?1[3-9]\d{9}/)?.[0] ?? null;
}

function detectEmail(content: string) {
  return content.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)?.[0] ?? null;
}

export function detectHighestEducation(content: string) {
  const explicit = matchLine(content, ["最高学历", "学历", "学位", "教育程度"]);
  const searchText = `${explicit ?? ""}\n${content}`;
  const levels: Array<{ label: string; pattern: RegExp }> = [
    { label: "博士", pattern: /博士(?:研究生)?|Ph\.?D/i },
    { label: "硕士", pattern: /硕士(?:研究生)?|研究生|Master/i },
    { label: "本科", pattern: /本科|学士|Bachelor/i },
    { label: "大专", pattern: /大专|专科|Associate/i },
    { label: "高中", pattern: /高中/ },
    { label: "中专", pattern: /中专|职高|技校/ }
  ];

  return levels.find((level) => level.pattern.test(searchText))?.label ?? null;
}

function normalizeIdentityText(value?: string | null) {
  if (!value) {
    return "";
  }

  return value
    .trim()
    .toLowerCase()
    .replace(/[\s\u3000]/g, "")
    .replace(/[·•、，。；:：/\\|()[\]{}【】'"`_-]/g, "");
}

function normalizeLooseText(value?: string | null) {
  if (!value) {
    return "";
  }

  return value
    .trim()
    .toLowerCase()
    .replace(/[\u3000]/g, " ")
    .replace(/\s+/g, " ");
}

function normalizePhoneValue(value?: string | null) {
  if (!value) {
    return "";
  }

  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("86") && digits.length > 11) {
    return digits.slice(-11);
  }

  return digits;
}

function countSkillOverlap(left: string[], right: string[]) {
  const leftSet = new Set(left.map((item) => normalizeLooseText(item)).filter(Boolean));
  const rightSet = new Set(right.map((item) => normalizeLooseText(item)).filter(Boolean));

  let overlap = 0;
  for (const skill of leftSet) {
    if (rightSet.has(skill)) {
      overlap += 1;
    }
  }

  return overlap;
}

function detectName(content: string) {
  const explicit = matchLine(content, ["濮撳悕", "鍊欓€変汉", "鍚嶅瓧", "Name"]);
  if (explicit) {
    return normalizeLineValue(explicit);
  }

  const firstLine = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 1);

  if (!firstLine) {
    return "寰呯‘璁ゅ€欓€変汉";
  }

  const pureChineseName = firstLine.match(/^[\u4e00-\u9fa5]{2,4}$/);
  if (pureChineseName) {
    return pureChineseName[0];
  }

  return normalizeLineValue(firstLine).slice(0, 20) || "寰呯‘璁ゅ€欓€変汉";
}

function detectSkills(content: string) {
  const lowered = content.toLowerCase();
  const hits = SKILL_KEYWORDS.filter((skill) => lowered.includes(skill.toLowerCase()));
  const explicit = matchLine(content, ["技能", "技术栈", "擅长", "能力"]);
  return Array.from(new Set([...hits, ...toArray(explicit)])).slice(0, 8);
}

function detectStatus(content: string) {
  const normalized = content.toLowerCase();

  if (/(宸插叆鑱寍鍏ヨ亴鏃堕棿|onboard)/i.test(normalized)) {
    return CandidateStatus.ONBOARD;
  }
  if (/(offer|鍙戞斁 offer|褰曠敤)/i.test(normalized)) {
    return CandidateStatus.OFFER;
  }
  if (/(缁堥潰|final interview)/i.test(normalized)) {
    return CandidateStatus.FINAL_INTERVIEW;
  }
  if (/(浜ゅ弶闈?|浜ゅ弶闈㈣瘯|cross interview)/i.test(normalized)) {
    return CandidateStatus.CROSS_INTERVIEW;
  }
  if (/(閫氳繃|passed|pass)/i.test(normalized)) {
    return CandidateStatus.PASSED;
  }
  if (/(浜岄潰|浜岃疆闈㈣瘯|second interview)/i.test(normalized)) {
    return CandidateStatus.SECOND_INTERVIEW;
  }
  if (/(涓€闈鍒濋潰|first interview)/i.test(normalized)) {
    return CandidateStatus.FIRST_INTERVIEW;
  }
  if (/(绗旇瘯|娴嬭瘎|written test)/i.test(normalized)) {
    return CandidateStatus.INVITED;
  }
  if (/(绛涢€墊鍒濈瓫|寰呯瓫)/i.test(normalized)) {
    return CandidateStatus.INVITED;
  }
  if (/(鎷掔粷|娣樻卑|涓嶅悎閫倈reject)/i.test(normalized)) {
    return CandidateStatus.RECOMMENDED;
  }
  if (/(鏀惧純|withdraw)/i.test(normalized)) {
    return CandidateStatus.RECOMMENDED;
  }

  return CandidateStatus.RECOMMENDED;
}

export function detectInputScene(content: string): InputScene {
  // 输入场景用于 RawInput 分类和提示词增强；短文本默认按备注处理，避免过度判断为 OTHER。
  if (/(闈㈣瘯鍙嶉|闈㈣瘯瀹榺浼樼偣|椋庨櫓鐐箌璇勪环|澶嶇洏|寤鸿鎺ㄨ繘|寤鸿娣樻卑)/i.test(content)) {
    return "INTERVIEW_FEEDBACK";
  }
  if (/(閭欢|涓婚|鍙戜欢浜簗鏀朵欢浜簗offer|鎶勯€亅闄勪欢)/i.test(content)) {
    return "EMAIL";
  }
  if (/(寰俊|椋炰功|閽夐拤|鑱婂ぉ|瀵硅瘽|娑堟伅璁板綍)/i.test(content)) {
    return "CHAT";
  }
  if (/(绠€鍘唡鏁欒偛缁忓巻|宸ヤ綔缁忓巻|椤圭洰缁忓巻|姹傝亴鎰忓悜|鎶€鑳絴鏍″洯缁忓巻)/i.test(content)) {
    return "RESUME";
  }
  if (/(澶囨敞|琛ュ厖璇存槑|璺熻繘璁板綍)/i.test(content)) {
    return "NOTE";
  }
  if (content.length < 60) {
    return "NOTE";
  }
  return "OTHER";
}

export function mapInputSceneToRawInputType(scene: InputScene) {
  switch (scene) {
    case "RESUME":
      return RawInputType.RESUME;
    case "EMAIL":
      return RawInputType.EMAIL;
    case "CHAT":
      return RawInputType.CHAT;
    case "INTERVIEW_FEEDBACK":
    case "NOTE":
      return RawInputType.NOTE;
    default:
      return RawInputType.OTHER;
  }
}

export function detectRawInputType(content: string) {
  return mapInputSceneToRawInputType(detectInputScene(content));
}

function buildConfidence(fields: Array<string | number | null | undefined>, uncertainFields: string[]) {
  // 置信度是启发式评分：已识别字段越多越高，待复核字段越多越低，并由 clampConfidence 限制范围。
  const presentCount = fields.filter((field) => {
    if (Array.isArray(field)) {
      return field.length > 0;
    }
    return field !== null && field !== undefined && String(field).trim().length > 0;
  }).length;

  const raw = 0.48 + presentCount * 0.06 - uncertainFields.length * 0.05;
  return clampConfidence(raw);
}

function compareStatusProgress(status: CandidateStatus) {
  return STATUS_ORDER.indexOf(status);
}

function containsAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
}

export function deriveCandidateTags(params: {
  content: string;
  positionTitle: string | null;
  yearsOfExperience: number | null;
  confidence: number;
  uncertainFields: string[];
  skills: string[];
}) {
  // 标签用于列表筛选和快速浏览。这里是轻量规则兜底，真实模型结果会在 Provider 层合并进来。
  const lowered = `${params.content}\n${params.positionTitle ?? ""}\n${params.skills.join(" ")}`.toLowerCase();
  const tags: string[] = [];

  if (containsAny(lowered, ["鍓嶇", "react", "vue", "next.js", "typescript"])) {
    tags.push("鍓嶇");
  }
  if (containsAny(lowered, ["鍚庣", "java", "go", "node.js", "spring", "redis", "kafka"])) {
    tags.push("鍚庣");
  }
  if (containsAny(lowered, ["绠楁硶", "llm", "rag", "pytorch", "鏈哄櫒瀛︿範", "鍚戦噺"])) {
    tags.push("绠楁硶");
  }
  if (containsAny(lowered, ["产品", "需求", "用户研究", "流程", "prompt", "运营"])) {
    tags.push("浜у搧");
  }
  if (containsAny(lowered, ["测试", "playwright", "selenium", "自动化测试"])) {
    tags.push("娴嬭瘯");
  }
  if (containsAny(lowered, ["鏁版嵁", "sql", "tableau", "power bi", "looker", "鍒嗘瀽"])) {
    tags.push("鏁版嵁");
  }

  if (/(鏍℃嫑|搴斿眾|瀹炰範|姣曚笟|202\d灞妡鍦ㄨ)/i.test(params.content) || (params.yearsOfExperience ?? 99) <= 1) {
    tags.push("鏍℃嫑");
  } else {
    tags.push("绀炬嫑");
  }

  if (params.confidence >= 0.85 && params.uncertainFields.length <= 1) {
    tags.push("楂樻綔");
  }
  if (params.confidence < 0.72 || params.uncertainFields.length >= 2) {
    tags.push("闇€澶嶆牳");
  }

  return Array.from(new Set(tags)).slice(0, 6);
}

export function buildFollowUpSuggestion(context: FollowUpContext) {
  // 根据候选人当前阶段生成下一步动作建议，并把缺失字段转成可执行的补录任务。
  const baseMap: Record<CandidateStatus, string> = {
    [CandidateStatus.RECOMMENDED]: "建议今天跟进推荐简历，确认求职动机、到岗时间和期望薪资。",
    [CandidateStatus.INVITED]: "建议今天完成邀约沟通，确认面试时间、薪资范围和岗位匹配度。",
    [CandidateStatus.FIRST_INTERVIEW]: "建议今天催收初试反馈，并与候选人确认下一轮可约时间。",
    [CandidateStatus.SECOND_INTERVIEW]: "建议尽快确认复试反馈，并锁定后续可约时间。",
    [CandidateStatus.CROSS_INTERVIEW]: "建议同步交叉面反馈，并确认下一步推进节点。",
    [CandidateStatus.FINAL_INTERVIEW]: "建议同步终试结果，并提前准备 offer 沟通方案。",
    [CandidateStatus.PASSED]: "建议确认录用审批结果，并准备 offer 沟通方案。",
    [CandidateStatus.OFFER]: "建议在 24 小时内跟进 Offer 接受情况，并确认入职意向。",
    [CandidateStatus.ONBOARD]: "建议确认入职材料、报到时间和对接人信息。"
  };

  const sceneMap: Partial<Record<InputScene, string>> = {
    EMAIL: "同时同步邮件中的关键结论到系统备注。",
    CHAT: "同时整理聊天中的关键信息，避免遗漏口头承诺。",
    INTERVIEW_FEEDBACK: "同时补录面试结论、亮点和风险点。"
  };

  const missingHints: Record<string, string> = {
    联系方式: "补充联系方式",
    手机号: "补充手机号",
    邮箱: "补充邮箱",
    学校: "确认学校",
    专业: "确认专业",
    工作年限: "确认工作年限",
    应聘岗位: "确认目标岗位",
    技能标签: "补充核心技能标签"
  };

  const missingTasks = context.uncertainFields
    .map((field) => missingHints[field])
    .filter(Boolean)
    .slice(0, 3);

  const suffix = [
    sceneMap[context.inputScene] ?? null,
    missingTasks.length ? `同时${missingTasks.join("、")}。` : null
  ]
    .filter(Boolean)
    .join("");

  return `${baseMap[context.status]}${suffix}`.trim();
}

export function buildReminderForStatus(status: CandidateStatus, followUpSuggestion?: string | null) {
  // 不同招聘阶段对应不同提醒类型和到期时间，用于 Dashboard 待办和候选人详情提醒。
  const dueAt = new Date();
  let type: NotificationType = NotificationType.FOLLOW_UP;
  let title = "鍊欓€変汉璺熻繘鎻愰啋";
  let note = followUpSuggestion ?? "建议确认最新沟通进展，避免流程停滞。";

  if (status === CandidateStatus.OFFER) {
    dueAt.setDate(dueAt.getDate() + 1);
    type = NotificationType.OFFER;
    title = "Offer 鍥炴敹鎻愰啋";
    note = followUpSuggestion ?? "建议在 24 小时内确认 Offer 接受情况。";
  } else if (status === CandidateStatus.ONBOARD) {
    dueAt.setDate(dueAt.getDate() + 3);
    type = NotificationType.ONBOARD;
    title = "鍏ヨ亴璧勬枡纭";
    note = followUpSuggestion ?? "建议确认入职资料、报到时间和设备准备情况。";
  } else if (
    status === CandidateStatus.FIRST_INTERVIEW ||
    status === CandidateStatus.SECOND_INTERVIEW ||
    status === CandidateStatus.CROSS_INTERVIEW ||
    status === CandidateStatus.FINAL_INTERVIEW
  ) {
    dueAt.setDate(dueAt.getDate() + 2);
    type = NotificationType.INTERVIEW;
    title = "闈㈣瘯鍙嶉鎻愰啋";
    note = followUpSuggestion ?? "建议尽快催收面试反馈并同步下一步安排。";
  } else {
    dueAt.setDate(dueAt.getDate() + 3);
  }

  return { type, title, note, dueAt };
}

export function extractCandidateDraft(content: string): ExtractedCandidateDraft {
  // 本地规则抽取承担两个角色：mock 模式的主要结果，以及真实模型异常/漏字段时的兜底结果。
  const phone = detectPhone(content);
  const email = detectEmail(content);
  const school = matchLine(content, ["瀛︽牎", "姣曚笟闄㈡牎", "闄㈡牎"]);
  const education = detectHighestEducation(content);
  const major = matchLine(content, ["涓撲笟", "鏂瑰悜"]);
  const positionTitle = matchLine(content, ["岗位", "应聘岗位", "职位", "投递岗位"]);
  const yearsMatched = content.match(/(\d+)\s*(?:年|年以上)?(?:工作)?经验/);
  const yearsOfExperience = yearsMatched ? Number(yearsMatched[1]) : null;
  const skills = detectSkills(content);
  const status = detectStatus(content);
  const source =
    matchLine(content, ["鏉ユ簮", "娓犻亾"]) ||
    (content.includes("BOSS") ? "BOSS 鐩磋仒" : content.includes("鎷夊嬀") ? "鎷夊嬀" : "鎵嬪姩褰曞叆");
  const name = detectName(content);
  const inputScene = detectInputScene(content);
  const inputType = mapInputSceneToRawInputType(inputScene);

  const uncertainFields: string[] = [];
  if (!phone && !email) {
    uncertainFields.push("鑱旂郴鏂瑰紡");
  }
  if (!school) {
    uncertainFields.push("瀛︽牎");
  }
  if (!education) {
    uncertainFields.push("最高学历");
  }
  if (!positionTitle) {
    uncertainFields.push("搴旇仒宀椾綅");
  }
  if (!skills.length) {
    uncertainFields.push("技能标签");
  }

  const confidence = buildConfidence(
    [name, phone, email, school, education, major, yearsOfExperience, positionTitle, skills.join(",")],
    uncertainFields
  );
  const tags = deriveCandidateTags({
    content,
    positionTitle,
    yearsOfExperience,
    confidence,
    uncertainFields,
    skills
  });
  const followUpSuggestion = buildFollowUpSuggestion({
    status,
    uncertainFields,
    inputScene,
    positionTitle
  });

  const remarkByScene: Record<InputScene, string> = {
    RESUME: "由 AI 从简历内容中提取候选人信息。",
    EMAIL: "由 AI 从邮件往来中提取候选人信息。",
    CHAT: "由 AI 从聊天记录中提取候选人信息。",
    INTERVIEW_FEEDBACK: "由 AI 从面试反馈中提取候选人信息。",
    NOTE: "由 AI 从备注内容中提取候选人信息。",
    OTHER: "由 AI 从原始内容中提取候选人信息。"
  };

  return {
    name,
    phone,
    email,
    school,
    education,
    major,
    yearsOfExperience,
    skills,
    status,
    source,
    remark: remarkByScene[inputScene],
    confidence,
    uncertainFields,
    positionTitle,
    inputType,
    inputScene,
    tags,
    followUpSuggestion,
    customFields: {}
  };
}

export function findDuplicateHint(
  draft: ExtractedCandidateDraft,
  candidates: Array<
    Pick<Candidate, "id" | "name" | "phone" | "email" | "status" | "school" | "major" | "yearsOfExperience"> & {
      skills: unknown;
      position: { title: string } | null;
    }
  >
): DuplicateHint | null {
  // 重复检测采用强身份信息优先、弱信号累积分的策略：手机号/邮箱是强信号，姓名+学校/岗位/技能是弱信号。
  let bestMatch: DuplicateHint | null = null;
  const draftPhone = normalizePhoneValue(draft.phone);
  const draftEmail = normalizeLooseText(draft.email);
  const draftName = normalizeIdentityText(draft.name);
  const draftSchool = normalizeIdentityText(draft.school);
  const draftMajor = normalizeIdentityText(draft.major);
  const draftPosition = normalizeIdentityText(draft.positionTitle);
  const draftSkills = draft.skills;

  for (const candidate of candidates) {
    const reasons: string[] = [];
    let score = 0;
    const candidatePhone = normalizePhoneValue(candidate.phone);
    const candidateEmail = normalizeLooseText(candidate.email);
    const candidateName = normalizeIdentityText(candidate.name);
    const candidateSchool = normalizeIdentityText(candidate.school);
    const candidateMajor = normalizeIdentityText(candidate.major);
    const candidatePosition = normalizeIdentityText(candidate.position?.title ?? null);
    const candidateSkills = toArray(candidate.skills);
    const skillOverlap = countSkillOverlap(draftSkills, candidateSkills);
    const strongIdentityMatched =
      (draftPhone && candidatePhone && draftPhone === candidatePhone) ||
      (draftEmail && candidateEmail && draftEmail === candidateEmail);
    const nameMatched = Boolean(draftName && candidateName && draftName === candidateName);
    const schoolMatched = Boolean(draftSchool && candidateSchool && draftSchool === candidateSchool);
    const majorMatched = Boolean(draftMajor && candidateMajor && draftMajor === candidateMajor);
    const positionMatched = Boolean(draftPosition && candidatePosition && draftPosition === candidatePosition);
    const yearsClose =
      draft.yearsOfExperience !== null &&
      candidate.yearsOfExperience !== null &&
      Math.abs(draft.yearsOfExperience - candidate.yearsOfExperience) <= 1;

    if (draftPhone && candidatePhone && draftPhone === candidatePhone) {
      reasons.push("手机号一致");
      score += 0.72;
    }

    if (draftEmail && candidateEmail && draftEmail === candidateEmail) {
      reasons.push("邮箱一致");
      score += 0.68;
    }

    if (nameMatched) {
      reasons.push("姓名一致");
      score += 0.24;
    }

    if (positionMatched) {
      reasons.push("岗位一致");
      score += 0.14;
    }

    if (nameMatched && schoolMatched) {
      reasons.push("学校一致");
      score += 0.2;
    }

    if (nameMatched && majorMatched) {
      reasons.push("专业一致");
      score += 0.08;
    }

    if (nameMatched && yearsClose) {
      reasons.push("宸ヤ綔骞撮檺鎺ヨ繎");
      score += 0.08;
    }

    if (nameMatched && skillOverlap >= 2) {
      reasons.push(`技能重合 ${skillOverlap} 项`);
      score += skillOverlap >= 3 ? 0.16 : 0.12;
    }

    const threshold = strongIdentityMatched ? 0.5 : nameMatched ? 0.44 : 0.78;

    // 阈值随证据强弱动态调整，避免只有同名时误合并，也避免手机号/邮箱命中时漏报。
    if (score >= threshold && (!bestMatch || score > bestMatch.score)) {
      bestMatch = {
        candidateId: candidate.id,
        candidateName: candidate.name,
        reasons,
        score: clampConfidence(score),
        status: candidate.status,
        positionTitle: candidate.position?.title ?? null
      };
    }
  }

  return bestMatch;
}

export function mergeCandidatePayload(
  existing: {
    name: string;
    phone: string | null;
    email: string | null;
    school: string | null;
    education: string | null;
    major: string | null;
    yearsOfExperience: number | null;
    status: CandidateStatus;
    source: string | null;
    remark: string | null;
    confidence: number | null;
    uncertainFields: unknown;
    skills: unknown;
    tags?: unknown;
    followUpSuggestion?: string | null;
  },
  draft: ExtractedCandidateDraft
) {
  // 合并逻辑偏保守：已有人工维护字段优先，数组字段做去重合并，状态只向流程后段推进。
  const existingSkills = toArray(existing.skills);
  const mergedSkills = Array.from(new Set([...existingSkills, ...draft.skills]));
  const existingUncertainFields = toArray(existing.uncertainFields);
  const mergedUncertainFields = Array.from(
    new Set([
      ...existingUncertainFields.filter((field) => !draft[field as keyof ExtractedCandidateDraft]),
      ...draft.uncertainFields
    ])
  );
  const existingTags = toArray(existing.tags);
  const mergedTags = Array.from(new Set([...existingTags, ...draft.tags]));

  return {
    name: existing.name || draft.name,
    phone: existing.phone || draft.phone,
    email: existing.email || draft.email,
    school: existing.school || draft.school,
    education: existing.education || draft.education,
    major: existing.major || draft.major,
    yearsOfExperience: existing.yearsOfExperience ?? draft.yearsOfExperience,
    skills: mergedSkills,
    status:
      compareStatusProgress(draft.status) > compareStatusProgress(existing.status)
        ? draft.status
        : existing.status,
    source: existing.source || draft.source,
    remark: [existing.remark, draft.remark].filter(Boolean).join(" "),
    confidence: Math.max(existing.confidence ?? 0, draft.confidence),
    uncertainFields: mergedUncertainFields,
    tags: mergedTags,
    followUpSuggestion: draft.followUpSuggestion || existing.followUpSuggestion || null
  };
}

export function shouldCreateReminder(status: CandidateStatus) {
  return ACTIVE_PIPELINE_STATUSES.has(status);
}
