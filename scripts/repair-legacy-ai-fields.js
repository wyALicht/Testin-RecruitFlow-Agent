const fs = require("fs");
const path = require("path");

const dbPath = path.join(process.cwd(), "data", "db.json");
const db = JSON.parse(fs.readFileSync(dbPath, "utf8"));

function isPlaceholderText(value) {
  if (typeof value !== "string") {
    return false;
  }

  const text = value.trim();
  if (!text) {
    return true;
  }

  if (/^[?？]+$/.test(text)) {
    return true;
  }

  const questionMarkCount = (text.match(/[?？]/g) ?? []).length;
  return questionMarkCount >= 2 && questionMarkCount >= Math.ceil(text.length / 3);
}

function unique(list) {
  return Array.from(new Set(list.filter(Boolean)));
}

const candidateIds = new Set((db.candidates || []).filter((item) => !item.deletedAt).map((item) => item.id));
const positionMap = new Map((db.positions || []).map((item) => [item.id, item.title]));

function containsAny(text, keywords) {
  const lowered = String(text || "").toLowerCase();
  return keywords.some((keyword) => lowered.includes(String(keyword).toLowerCase()));
}

function deriveTags(candidate) {
  const positionTitle = positionMap.get(candidate.positionId) || "";
  const content = [
    positionTitle,
    candidate.major,
    candidate.school,
    candidate.remark,
    ...(Array.isArray(candidate.skills) ? candidate.skills : [])
  ]
    .filter(Boolean)
    .join("\n");

  const tags = [];

  if (containsAny(content, ["前端", "react", "vue", "next.js", "typescript"])) tags.push("前端");
  if (containsAny(content, ["后端", "java", "go", "node.js", "spring", "redis", "kafka"])) tags.push("后端");
  if (containsAny(content, ["算法", "llm", "rag", "pytorch", "机器学习", "向量"])) tags.push("算法");
  if (containsAny(content, ["产品", "需求", "用户研究", "流程", "prompt", "运营"])) tags.push("产品");
  if (containsAny(content, ["测试", "playwright", "selenium", "自动化测试"])) tags.push("测试");
  if (containsAny(content, ["数据", "sql", "tableau", "power bi", "looker", "分析"])) tags.push("数据");

  if (/(校招|应届|实习|毕业|202\d届|在读)/i.test(content) || Number(candidate.yearsOfExperience ?? 99) <= 1) {
    tags.push("校招");
  } else {
    tags.push("社招");
  }

  const confidence = Number(candidate.confidence ?? 0.72);
  const uncertainFields = Array.isArray(candidate.uncertainFields) ? candidate.uncertainFields : [];
  if (confidence >= 0.85 && uncertainFields.length <= 1) tags.push("高潜");
  if (confidence < 0.72 || uncertainFields.length >= 2) tags.push("需复核");

  return unique(tags).slice(0, 6);
}

function buildFollowUpSuggestion(candidate) {
  const baseMap = {
    RECOMMENDED: "建议今天跟进推荐简历，确认求职动机、到岗时间和期望薪资。",
    INVITED: "建议今天完成邀约沟通，确认面试时间、薪资范围和岗位匹配度。",
    FIRST_INTERVIEW: "建议今天催收一面反馈，并与候选人确认下一轮可约时间。",
    SECOND_INTERVIEW: "建议尽快确认二面反馈，并锁定终面可约时间。",
    CROSS_INTERVIEW: "建议同步交叉面反馈，并确认下一步推进节点。",
    FINAL_INTERVIEW: "建议同步终面结果，并提前准备 offer 沟通方案。",
    PASSED: "建议确认录用审批结果，并准备 offer 沟通方案。",
    OFFER: "建议在 24 小时内跟进 Offer 接受情况，并确认入职意向。",
    ONBOARD: "建议确认入职材料、报到时间和对接人信息。"
  };

  const fieldHints = {
    联系方式: "补充联系方式",
    手机号: "补充手机号",
    邮箱: "补充邮箱",
    学校: "确认学校",
    专业: "确认专业",
    工作年限: "确认工作年限",
    应聘岗位: "确认目标岗位",
    技能标签: "补充核心技能标签"
  };

  const extras = unique(
    (Array.isArray(candidate.uncertainFields) ? candidate.uncertainFields : [])
      .map((field) => fieldHints[field])
      .filter(Boolean)
  ).slice(0, 3);

  return `${baseMap[candidate.status] || baseMap.RECOMMENDED}${extras.length ? ` 同时${extras.join("、")}。` : ""}`;
}

function detectInputSceneByType(inputType) {
  if (inputType === "RESUME") return "RESUME";
  if (inputType === "EMAIL") return "EMAIL";
  if (inputType === "CHAT") return "CHAT";
  if (inputType === "NOTE") return "NOTE";
  return "OTHER";
}

const removedRawInputs = (db.rawInputs || []).filter((item) => !item.candidateId || !candidateIds.has(item.candidateId)).length;
const removedAgentTasks = (db.agentTasks || []).filter((item) => !item.candidateId || !candidateIds.has(item.candidateId)).length;

db.rawInputs = (db.rawInputs || []).filter((item) => item.candidateId && candidateIds.has(item.candidateId));
db.agentTasks = (db.agentTasks || []).filter((item) => item.candidateId && candidateIds.has(item.candidateId));

const candidateMap = new Map();
db.candidates = (db.candidates || []).map((candidate) => {
  const tags = !Array.isArray(candidate.tags) || !candidate.tags.length || candidate.tags.every(isPlaceholderText)
    ? deriveTags(candidate)
    : candidate.tags;
  const followUpSuggestion =
    typeof candidate.followUpSuggestion === "string" &&
    candidate.followUpSuggestion.trim().length &&
    !isPlaceholderText(candidate.followUpSuggestion)
      ? candidate.followUpSuggestion.trim()
      : buildFollowUpSuggestion(candidate);

  const normalized = {
    ...candidate,
    tags,
    followUpSuggestion
  };
  candidateMap.set(normalized.id, normalized);
  return normalized;
});

db.rawInputs = db.rawInputs.map((rawInput) => {
  const candidate = candidateMap.get(rawInput.candidateId);
  const inputScene = detectInputSceneByType(rawInput.inputType);
  const parsedResult =
    rawInput.parsedResult && typeof rawInput.parsedResult === "object" ? rawInput.parsedResult : null;
  const result = parsedResult && parsedResult.result && typeof parsedResult.result === "object" ? parsedResult.result : null;

  return {
    ...rawInput,
    inputScene,
    parsedResult:
      candidate && result
        ? {
            ...parsedResult,
            result: {
              ...result,
              inputScene,
              inputType: rawInput.inputType,
              tags: candidate.tags,
              followUpSuggestion: candidate.followUpSuggestion
            }
          }
        : rawInput.parsedResult
  };
});

fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), "utf8");

console.log(
  JSON.stringify(
    {
      removedRawInputs,
      removedAgentTasks,
      repairedCandidates: db.candidates.length
    },
    null,
    2
  )
);
