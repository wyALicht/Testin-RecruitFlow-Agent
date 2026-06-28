const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

function iso(value) {
  return new Date(value).toISOString();
}

function buildPdf(lines) {
  const escape = (value) => value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

  const contentLines = ["BT", "/F1 12 Tf", "50 780 Td", "16 TL"];
  lines.forEach((line, index) => {
    if (index === 0) {
      contentLines.push(`(${escape(line)}) Tj`);
    } else {
      contentLines.push(`T* (${escape(line)}) Tj`);
    }
  });
  contentLines.push("ET");
  const content = `${contentLines.join("\n")}\n`;

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}endstream`
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return pdf;
}

function writePdf(fileName, lines) {
  fs.writeFileSync(path.join(ROOT, fileName), buildPdf(lines), "utf8");
}

function makeTask(id, agentName, taskType, status, input, output, confidence, durationMs, candidateId, rawInputId, time) {
  return {
    id,
    agentName,
    taskType,
    status,
    input,
    output,
    error: null,
    confidence,
    durationMs,
    candidateId,
    rawInputId,
    createdAt: time,
    updatedAt: time
  };
}

const positions = [
  {
    id: "pos_mock_frontend",
    title: "前端工程师",
    department: "平台研发",
    headcount: 2,
    owner: "Luna",
    description: "负责招聘系统、数据看板和内部工具前端开发。",
    status: "open",
    createdAt: iso("2026-04-01T09:00:00.000Z"),
    updatedAt: iso("2026-04-20T09:00:00.000Z")
  },
  {
    id: "pos_mock_backend",
    title: "后端工程师",
    department: "平台研发",
    headcount: 3,
    owner: "Ming",
    description: "负责核心服务、Agent 编排能力与平台接口开发。",
    status: "open",
    createdAt: iso("2026-04-02T09:00:00.000Z"),
    updatedAt: iso("2026-04-20T09:00:00.000Z")
  },
  {
    id: "pos_mock_ai_pm",
    title: "AI 产品经理",
    department: "AI 应用",
    headcount: 1,
    owner: "Jade",
    description: "负责智能招聘流程设计、AI Intake 策略与业务落地。",
    status: "open",
    createdAt: iso("2026-04-03T09:00:00.000Z"),
    updatedAt: iso("2026-04-20T09:00:00.000Z")
  },
  {
    id: "pos_mock_qa",
    title: "测试开发工程师",
    department: "质量平台",
    headcount: 1,
    owner: "Iris",
    description: "负责自动化测试平台、质量数据和回归保障。",
    status: "open",
    createdAt: iso("2026-04-04T09:00:00.000Z"),
    updatedAt: iso("2026-04-20T09:00:00.000Z")
  },
  {
    id: "pos_mock_data",
    title: "数据分析师",
    department: "经营分析",
    headcount: 1,
    owner: "Evan",
    description: "负责招聘漏斗分析、渠道转化和人才画像分析。",
    status: "open",
    createdAt: iso("2026-04-05T09:00:00.000Z"),
    updatedAt: iso("2026-04-20T09:00:00.000Z")
  },
  {
    id: "pos_mock_algo",
    title: "算法工程师",
    department: "AI Lab",
    headcount: 2,
    owner: "Noah",
    description: "负责简历理解、候选人匹配和排序模型。",
    status: "open",
    createdAt: iso("2026-04-06T09:00:00.000Z"),
    updatedAt: iso("2026-04-20T09:00:00.000Z")
  }
];

const candidateDefs = [
  {
    id: "cand_mock_lin_yucheng",
    name: "林语澄",
    phone: "13600001001",
    email: "lin.yucheng@example.com",
    school: "华南理工大学",
    major: "软件工程",
    yearsOfExperience: 5,
    skills: ["React", "Next.js", "TypeScript", "Node.js", "ECharts"],
    status: "FINAL_INTERVIEW",
    source: "BOSS直聘",
    remark: "产品理解和前端架构能力都很强，正在安排终面时间。",
    confidence: 0.94,
    uncertainFields: [],
    lastFollowUpAt: iso("2026-04-25T10:30:00.000Z"),
    positionId: "pos_mock_frontend",
    createdAt: iso("2026-04-12T09:30:00.000Z"),
    updatedAt: iso("2026-04-25T10:30:00.000Z"),
    provider: "qwen",
    inputType: "RESUME",
    rawContent: "简历录入：林语澄，前端工程师，5 年经验，长期负责数据看板和内部平台项目。"
  },
  {
    id: "cand_mock_zhao_wenjing",
    name: "赵文静",
    phone: "13600001002",
    email: "zhaowj@example.com",
    school: "武汉大学",
    major: "信息管理",
    yearsOfExperience: 6,
    skills: ["需求分析", "用户研究", "流程设计", "提示词设计", "SQL"],
    status: "INVITED",
    source: "内部推荐",
    remark: "由业务负责人内推，当前还在等待 HR 完成初筛电话。",
    confidence: 0.87,
    uncertainFields: ["期望薪资"],
    lastFollowUpAt: iso("2026-04-24T08:40:00.000Z"),
    positionId: "pos_mock_ai_pm",
    createdAt: iso("2026-04-18T08:40:00.000Z"),
    updatedAt: iso("2026-04-24T08:40:00.000Z"),
    provider: "deepseek",
    inputType: "NOTE",
    rawContent: "内推备注：AI 产品经理方向，流程设计和用户研究背景扎实，建议尽快安排初筛。"
  },
  {
    id: "cand_mock_he_junkai",
    name: "何俊凯",
    phone: "13600001003",
    email: "hejunkai@example.com",
    school: "哈尔滨工业大学",
    major: "计算机科学与技术",
    yearsOfExperience: 4,
    skills: ["Playwright", "Python", "CI/CD", "接口测试", "质量平台"],
    status: "INVITED",
    source: "拉勾",
    remark: "笔试已发出，候选人表示今晚会完成并回传。",
    confidence: 0.9,
    uncertainFields: [],
    lastFollowUpAt: iso("2026-04-23T14:20:00.000Z"),
    positionId: "pos_mock_qa",
    createdAt: iso("2026-04-15T14:20:00.000Z"),
    updatedAt: iso("2026-04-23T14:20:00.000Z"),
    provider: "qwen",
    inputType: "EMAIL",
    rawContent: "邮件记录：测试开发候选人已收到笔试并承诺今晚提交结果。"
  },
  {
    id: "cand_mock_su_qinghe",
    name: "苏清和",
    phone: "13600001004",
    email: "suqinghe@example.com",
    school: "中山大学",
    major: "统计学",
    yearsOfExperience: 5,
    skills: ["SQL", "Python", "Tableau", "Looker Studio", "A/B 测试"],
    status: "OFFER",
    source: "智联招聘",
    remark: "Offer 已发出，候选人将在周一上午前给最终回复。",
    confidence: 0.92,
    uncertainFields: [],
    lastFollowUpAt: iso("2026-04-25T02:10:00.000Z"),
    positionId: "pos_mock_data",
    createdAt: iso("2026-04-14T11:10:00.000Z"),
    updatedAt: iso("2026-04-25T02:10:00.000Z"),
    provider: "deepseek",
    inputType: "EMAIL",
    rawContent: "Offer 邮件已发送，候选人会在周一上午十点前确认最终决定。"
  },
  {
    id: "cand_mock_tang_jianing",
    name: "唐嘉宁",
    phone: "13600001005",
    email: "tangjn@example.com",
    school: "北京邮电大学",
    major: "数字媒体技术",
    yearsOfExperience: 3,
    skills: ["Vue", "React", "Figma", "设计系统", "可访问性"],
    status: "ONBOARD",
    source: "校园招聘",
    remark: "候选人已接受 offer，入职材料还差一项待补齐。",
    confidence: 0.95,
    uncertainFields: [],
    lastFollowUpAt: iso("2026-04-22T06:50:00.000Z"),
    positionId: "pos_mock_frontend",
    createdAt: iso("2026-04-10T06:50:00.000Z"),
    updatedAt: iso("2026-04-22T06:50:00.000Z"),
    provider: "qwen",
    inputType: "RESUME",
    rawContent: "校招简历：唐嘉宁，前端工程师方向，已接受 offer，正在准备入职。"
  },
  {
    id: "cand_mock_gu_yuanzhou",
    name: "顾远舟",
    phone: "13600001006",
    email: "guyz@example.com",
    school: "上海交通大学",
    major: "人工智能",
    yearsOfExperience: 2,
    skills: ["PyTorch", "LLM", "RAG", "向量检索", "Python"],
    status: "RECOMMENDED",
    source: "上传文件",
    remark: "扫描版简历，AI 抽取置信度一般，需要人工复核关键信息。",
    confidence: 0.71,
    uncertainFields: ["工作年限", "论文情况"],
    lastFollowUpAt: iso("2026-04-26T03:15:00.000Z"),
    positionId: "pos_mock_algo",
    createdAt: iso("2026-04-26T03:15:00.000Z"),
    updatedAt: iso("2026-04-26T03:15:00.000Z"),
    provider: "qwen",
    inputType: "RESUME",
    rawContent: "上传的扫描简历提到 RAG、向量检索和模型评测方向，部分字段仍待确认。"
  },
  {
    id: "cand_mock_chen_xiaobei",
    name: "陈晓北",
    phone: "13600001007",
    email: "chenxb@example.com",
    school: "同济大学",
    major: "软件工程",
    yearsOfExperience: 4,
    skills: ["Java", "Spring Boot", "MySQL", "Redis", "微服务"],
    status: "FIRST_INTERVIEW",
    source: "BOSS直聘",
    remark: "后端基础扎实，一面已结束，反馈较为积极。",
    confidence: 0.91,
    uncertainFields: [],
    lastFollowUpAt: iso("2026-04-24T05:00:00.000Z"),
    positionId: "pos_mock_backend",
    createdAt: iso("2026-04-13T05:00:00.000Z"),
    updatedAt: iso("2026-04-24T05:00:00.000Z"),
    provider: "deepseek",
    inputType: "CHAT",
    rawContent: "聊天记录摘要：具备微服务经验的后端候选人已通过一面。"
  },
  {
    id: "cand_mock_liu_shiyi",
    name: "刘诗怡",
    phone: "13600001008",
    email: "liusy@example.com",
    school: "南京大学",
    major: "数据科学",
    yearsOfExperience: 4,
    skills: ["Python", "dbt", "Airflow", "数据建模", "Power BI"],
    status: "SECOND_INTERVIEW",
    source: "内部推荐",
    remark: "业务沟通能力很强，准备进入分析负责人二面。",
    confidence: 0.89,
    uncertainFields: [],
    lastFollowUpAt: iso("2026-04-24T12:10:00.000Z"),
    positionId: "pos_mock_data",
    createdAt: iso("2026-04-16T12:10:00.000Z"),
    updatedAt: iso("2026-04-24T12:10:00.000Z"),
    provider: "qwen",
    inputType: "NOTE",
    rawContent: "招聘备注：沟通表达和分析思维都很好，建议推进至二面。"
  },
  {
    id: "cand_mock_qin_meng",
    name: "秦萌",
    phone: "13600001009",
    email: "qinmeng@example.com",
    school: "厦门大学",
    major: "人机交互",
    yearsOfExperience: 3,
    skills: ["交互设计", "Figma", "研究运营", "旅程地图", "设计评审"],
    status: "RECOMMENDED",
    source: "Maimai",
    remark: "背景有亮点，但与当前岗位所需的 AI 流程经验仍有明显差距。",
    confidence: 0.82,
    uncertainFields: [],
    lastFollowUpAt: iso("2026-04-21T07:20:00.000Z"),
    positionId: "pos_mock_ai_pm",
    createdAt: iso("2026-04-11T07:20:00.000Z"),
    updatedAt: iso("2026-04-21T07:20:00.000Z"),
    provider: "deepseek",
    inputType: "RESUME",
    rawContent: "AI 产品岗位简历评审记录：候选人因经验匹配度不足而未继续推进。"
  },
  {
    id: "cand_mock_yu_haonan",
    name: "余皓南",
    phone: "13600001010",
    email: "yuhaonan@example.com",
    school: "浙江大学",
    major: "计算机工程",
    yearsOfExperience: 7,
    skills: ["Go", "Kubernetes", "Kafka", "可观测性", "分布式系统"],
    status: "RECOMMENDED",
    source: "BOSS直聘",
    remark: "候选人因拿到更高优先级的外部 offer，主动撤回流程。",
    confidence: 0.93,
    uncertainFields: [],
    lastFollowUpAt: iso("2026-04-20T13:50:00.000Z"),
    positionId: "pos_mock_backend",
    createdAt: iso("2026-04-08T13:50:00.000Z"),
    updatedAt: iso("2026-04-20T13:50:00.000Z"),
    provider: "qwen",
    inputType: "EMAIL",
    rawContent: "邮件更新：后端候选人因已接受其他 offer，终止当前流程。"
  },
  {
    id: "cand_mock_wen_jiakai",
    name: "温嘉凯",
    phone: "13600001011",
    email: "wenjk@example.com",
    school: "华中科技大学",
    major: "自动化",
    yearsOfExperience: 2,
    skills: ["Selenium", "Python", "Robot Framework", "Postman", "JMeter"],
    status: "INVITED",
    source: "校园招聘",
    remark: "偏校招到初级岗画像，需确认测试深度与实习到岗时间。",
    confidence: 0.78,
    uncertainFields: ["毕业时间"],
    lastFollowUpAt: iso("2026-04-26T01:45:00.000Z"),
    positionId: "pos_mock_qa",
    createdAt: iso("2026-04-22T01:45:00.000Z"),
    updatedAt: iso("2026-04-26T01:45:00.000Z"),
    provider: "deepseek",
    inputType: "RESUME",
    rawContent: "校招简历：测试开发候选人有实习测试经验，毕业时间仍需确认。"
  },
  {
    id: "cand_mock_fang_xinyi",
    name: "方欣怡",
    phone: "13600001012",
    email: "fangxy@example.com",
    school: "四川大学",
    major: "新闻传播学",
    yearsOfExperience: 4,
    skills: ["内容策略", "提示词编写", "流程文档", "跨团队协作"],
    status: "RECOMMENDED",
    source: "上传文件",
    remark: "从内容运营转向 AI 产品运营，转型画像较有潜力。",
    confidence: 0.74,
    uncertainFields: ["当前岗位"],
    lastFollowUpAt: iso("2026-04-26T06:20:00.000Z"),
    positionId: "pos_mock_ai_pm",
    createdAt: iso("2026-04-26T06:20:00.000Z"),
    updatedAt: iso("2026-04-26T06:20:00.000Z"),
    provider: "qwen",
    inputType: "RESUME",
    rawContent: "上传简历：具备提示词编写和流程文档能力的复合型运营背景。"
  },
  {
    id: "cand_mock_pang_zihao",
    name: "庞子昊",
    phone: "13600001013",
    email: "pangzh@example.com",
    school: "东北大学",
    major: "统计学",
    yearsOfExperience: 6,
    skills: ["Python", "预测分析", "SQL", "实验设计", "业务汇报"],
    status: "OFFER",
    source: "内部推荐",
    remark: "业务分析作品集很扎实，offer 包正在走内部最终审批。",
    confidence: 0.9,
    uncertainFields: ["入职日期"],
    lastFollowUpAt: iso("2026-04-24T09:00:00.000Z"),
    positionId: "pos_mock_data",
    createdAt: iso("2026-04-12T09:00:00.000Z"),
    updatedAt: iso("2026-04-24T09:00:00.000Z"),
    provider: "deepseek",
    inputType: "NOTE",
    rawContent: "分析负责人备注：offer 方案已基本对齐，等待确认入职日期。"
  },
  {
    id: "cand_mock_xu_ran",
    name: "徐冉",
    phone: "13600001014",
    email: "xuran@example.com",
    school: "北京航空航天大学",
    major: "计算机科学与技术",
    yearsOfExperience: 5,
    skills: ["C++", "模型优化", "CUDA", "推理服务", "Python"],
    status: "FINAL_INTERVIEW",
    source: "BOSS直聘",
    remark: "算法工程系统背景很强，当前等待领导终面排期。",
    confidence: 0.93,
    uncertainFields: [],
    lastFollowUpAt: iso("2026-04-25T04:40:00.000Z"),
    positionId: "pos_mock_algo",
    createdAt: iso("2026-04-17T04:40:00.000Z"),
    updatedAt: iso("2026-04-25T04:40:00.000Z"),
    provider: "qwen",
    inputType: "CHAT",
    rawContent: "面试记录：候选人有生产级推理优化经验，建议推进终面。"
  },
  {
    id: "cand_mock_shen_jialin",
    name: "沈嘉琳",
    phone: "13600001015",
    email: "shenjl@example.com",
    school: "复旦大学",
    major: "信息系统",
    yearsOfExperience: 4,
    skills: ["React", "设计系统", "GraphQL", "性能优化", "A/B 测试"],
    status: "FIRST_INTERVIEW",
    source: "Moka 导入",
    remark: "由其他职位转流转入，仍需补一次前端架构面试。",
    confidence: 0.86,
    uncertainFields: ["当前薪资"],
    lastFollowUpAt: iso("2026-04-23T11:30:00.000Z"),
    positionId: "pos_mock_frontend",
    createdAt: iso("2026-04-14T11:30:00.000Z"),
    updatedAt: iso("2026-04-23T11:30:00.000Z"),
    provider: "deepseek",
    inputType: "NOTE",
    rawContent: "内部流转备注：该前端候选人从其他职位转入，需继续架构向一面讨论。"
  },
  {
    id: "cand_mock_mao_yiru",
    name: "毛依如",
    phone: "13600001016",
    email: "maoyr@example.com",
    school: "华东师范大学",
    major: "应用数学",
    yearsOfExperience: 3,
    skills: ["SQL", "Python", "指标设计", "Excel", "看板搭建"],
    status: "INVITED",
    source: "智联招聘",
    remark: "分析基础不错，已发送案例作业作为笔试。",
    confidence: 0.84,
    uncertainFields: [],
    lastFollowUpAt: iso("2026-04-24T15:10:00.000Z"),
    positionId: "pos_mock_data",
    createdAt: iso("2026-04-16T15:10:00.000Z"),
    updatedAt: iso("2026-04-24T15:10:00.000Z"),
    provider: "qwen",
    inputType: "EMAIL",
    rawContent: "分析案例作业已发出，候选人计划在 48 小时内提交。"
  },
  {
    id: "cand_mock_cao_tingting",
    name: "曹婷婷",
    phone: "13600001017",
    email: "caott@example.com",
    school: "暨南大学",
    major: "商业分析",
    yearsOfExperience: 5,
    skills: ["提示词质检", "流程 SOP", "项目协同", "供应商管理"],
    status: "INVITED",
    source: "内部推荐",
    remark: "更像 AI 运营相邻岗位画像，当前仍在初筛判断阶段。",
    confidence: 0.8,
    uncertainFields: ["目标岗位"],
    lastFollowUpAt: iso("2026-04-25T06:10:00.000Z"),
    positionId: "pos_mock_ai_pm",
    createdAt: iso("2026-04-19T06:10:00.000Z"),
    updatedAt: iso("2026-04-25T06:10:00.000Z"),
    provider: "deepseek",
    inputType: "CHAT",
    rawContent: "内推沟通摘要：候选人可能更适合 AI 运营或 AI PM 邻近流程岗位。"
  },
  {
    id: "cand_mock_ding_haoyu",
    name: "丁浩宇",
    phone: "13600001018",
    email: "dinghy@example.com",
    school: "电子科技大学",
    major: "软件工程",
    yearsOfExperience: 6,
    skills: ["Java", "Spring Cloud", "Kafka", "Redis", "接口设计"],
    status: "SECOND_INTERVIEW",
    source: "BOSS直聘",
    remark: "二面编码面已排期，候选人希望尽快拿到反馈结果。",
    confidence: 0.91,
    uncertainFields: [],
    lastFollowUpAt: iso("2026-04-25T08:05:00.000Z"),
    positionId: "pos_mock_backend",
    createdAt: iso("2026-04-18T08:05:00.000Z"),
    updatedAt: iso("2026-04-25T08:05:00.000Z"),
    provider: "qwen",
    inputType: "RESUME",
    rawContent: "后端简历评审：已通过一面，进入二面编码环节。"
  },
  {
    id: "cand_mock_ren_yiming",
    name: "任一鸣",
    phone: "13600001019",
    email: "renym@example.com",
    school: "西安交通大学",
    major: "计算机科学与技术",
    yearsOfExperience: 1,
    skills: ["Python", "NLP", "提示词调优", "数据标注", "模型评测"],
    status: "RECOMMENDED",
    source: "校园招聘",
    remark: "应届毕业生，做过 NLP 实习，适合初级算法工程师方向。",
    confidence: 0.76,
    uncertainFields: ["全职到岗时间"],
    lastFollowUpAt: iso("2026-04-26T02:50:00.000Z"),
    positionId: "pos_mock_algo",
    createdAt: iso("2026-04-26T02:50:00.000Z"),
    updatedAt: iso("2026-04-26T02:50:00.000Z"),
    provider: "deepseek",
    inputType: "RESUME",
    rawContent: "校招简历：初级算法工程师方向，待论文答辩后可全职入职。"
  },
  {
    id: "cand_mock_luo_anqi",
    name: "罗安琪",
    phone: "13600001020",
    email: "luoaq@example.com",
    school: "天津大学",
    major: "软件工程",
    yearsOfExperience: 3,
    skills: ["React", "Testing Library", "Tailwind", "设计质检", "指标分析"],
    status: "ONBOARD",
    source: "内部推荐",
    remark: "下周一入职，设备申请已经提交。",
    confidence: 0.93,
    uncertainFields: [],
    lastFollowUpAt: iso("2026-04-24T03:30:00.000Z"),
    positionId: "pos_mock_frontend",
    createdAt: iso("2026-04-13T03:30:00.000Z"),
    updatedAt: iso("2026-04-24T03:30:00.000Z"),
    provider: "qwen",
    inputType: "EMAIL",
    rawContent: "入职确认邮件：候选人将于下周一入职，设备准备流程已启动。"
  }
];

const candidates = candidateDefs.map((candidate) => ({
  ...candidate,
  deletedAt: null
}));

const logs = [];
const rawInputs = [];
const agentTasks = [];
const notifications = [];

const reminderByStatus = {
  RECOMMENDED: { type: "FOLLOW_UP", title: "跟进推荐简历", note: "确认候选人意向、到岗时间和岗位匹配度。" },
  INVITED: { type: "FOLLOW_UP", title: "完成邀约沟通", note: "确认面试时间、薪资范围和岗位动机。" },
  FIRST_INTERVIEW: { type: "INTERVIEW", title: "汇总一面反馈", note: "尽量在 24 小时内收齐面试反馈并决定是否推进。" },
  SECOND_INTERVIEW: { type: "INTERVIEW", title: "准备二面安排", note: "确认面试官分工和重点考察维度。" },
  CROSS_INTERVIEW: { type: "INTERVIEW", title: "同步交叉面反馈", note: "确认交叉面结论和下一步推进节点。" },
  FINAL_INTERVIEW: { type: "INTERVIEW", title: "确认终面排期", note: "锁定领导终面时间并同步候选人议程。" },
  PASSED: { type: "OFFER", title: "准备 Offer 沟通", note: "确认录用审批结果和候选人最终意向。" },
  OFFER: { type: "OFFER", title: "跟进 Offer 反馈", note: "确认最终意向，并提前准备备选方案。" },
  ONBOARD: { type: "ONBOARD", title: "跟进入职材料", note: "确认合同、证件和设备准备进度。" }
};

candidateDefs.forEach((candidate, index) => {
  const rawInputId = `raw_${candidate.id.replace("cand_", "")}`;
  const extractTaskId = `task_extract_${candidate.id.replace("cand_", "")}`;
  const duplicateTaskId = `task_duplicate_${candidate.id.replace("cand_", "")}`;
  const statusTaskId = `task_status_${candidate.id.replace("cand_", "")}`;

  rawInputs.push({
    id: rawInputId,
    candidateId: candidate.id,
    inputType: candidate.inputType,
    content: candidate.rawContent,
    parsedResult: {
      provider: candidate.provider,
      result: {
        candidateId: candidate.id,
        name: candidate.name,
        phone: candidate.phone,
        email: candidate.email,
        school: candidate.school,
        major: candidate.major,
        yearsOfExperience: candidate.yearsOfExperience,
        skills: candidate.skills,
        status: candidate.status,
        source: candidate.source,
        remark: candidate.remark,
        confidence: candidate.confidence,
        uncertainFields: candidate.uncertainFields,
        positionTitle: positions.find((position) => position.id === candidate.positionId)?.title ?? null,
        inputType: candidate.inputType
      }
    },
    createdAt: candidate.createdAt
  });

  logs.push({
    id: `log_${candidate.id.replace("cand_", "")}`,
    candidateId: candidate.id,
    fromStatus: null,
    toStatus: candidate.status,
    note: candidate.remark,
    source: "seed",
    createdBy: "system",
    createdAt: candidate.createdAt
  });

  agentTasks.push(
    makeTask(
      extractTaskId,
      `${candidate.provider}:CandidateExtractAgent`,
      "extract",
      candidate.confidence >= 0.8 ? "SUCCESS" : "NEED_REVIEW",
      {
        contentLength: candidate.rawContent.length,
        providerOverride: candidate.provider
      },
      {
        candidateId: candidate.id,
        confidence: candidate.confidence,
        uncertainFields: candidate.uncertainFields
      },
      candidate.confidence,
      1500 + index * 37,
      candidate.id,
      rawInputId,
      candidate.createdAt
    ),
    makeTask(
      duplicateTaskId,
      `${candidate.provider}:DuplicateCheckAgent`,
      "duplicate",
      "SUCCESS",
      {
        phone: candidate.phone,
        email: candidate.email,
        name: candidate.name
      },
      {
        message: "No duplicate candidate found"
      },
      0.95,
      80,
      candidate.id,
      rawInputId,
      candidate.createdAt
    ),
    makeTask(
      statusTaskId,
      `${candidate.provider}:StatusTrackingAgent`,
      "status",
      "SUCCESS",
      {
        sourceType: candidate.inputType
      },
      {
        candidateId: candidate.id,
        status: candidate.status
      },
      0.93,
      55,
      candidate.id,
      rawInputId,
      candidate.updatedAt
    )
  );

  const reminder = reminderByStatus[candidate.status];
  if (reminder) {
    notifications.push({
      id: `note_${candidate.id.replace("cand_", "")}`,
      candidateId: candidate.id,
      type: reminder.type,
      title: reminder.title,
      note: reminder.note,
      dueAt: iso(new Date(new Date(candidate.updatedAt).getTime() + 2 * 24 * 60 * 60 * 1000)),
      done: false,
      createdAt: candidate.updatedAt,
      updatedAt: candidate.updatedAt
    });
  }
});

const db = {
  positions,
  candidates,
  logs,
  rawInputs,
  agentTasks,
  notifications
};

const pdfFixtures = [
  {
    fileName: "resume_masked_frontend_lin.pdf",
    lines: [
      "Masked Resume - Frontend Engineer",
      "Name: Lin Y.",
      "Phone: 136****1001",
      "Email: l***@example.com",
      "Target Role: Frontend Engineer",
      "Experience: 5 years",
      "Skills: React, Next.js, TypeScript, Dashboard UI",
      "Projects: Recruiting dashboard, analytics portal, internal workflow tools",
      "Education: South China University of Technology"
    ]
  },
  {
    fileName: "resume_masked_backend_ding.pdf",
    lines: [
      "Masked Resume - Backend Engineer",
      "Name: Ding H.",
      "Phone: 136****1018",
      "Email: d***@example.com",
      "Target Role: Backend Engineer",
      "Experience: 6 years",
      "Skills: Java, Spring Cloud, Kafka, Redis, API Design",
      "Projects: Order service, orchestration APIs, distributed tracing platform",
      "Education: UESTC"
    ]
  },
  {
    fileName: "resume_masked_ai_pm_zhao.pdf",
    lines: [
      "Masked Resume - AI Product Manager",
      "Name: Zhao W.",
      "Phone: 136****1002",
      "Email: z***@example.com",
      "Target Role: AI Product Manager",
      "Experience: 6 years",
      "Skills: User Research, Workflow Design, Prompt Design, KPI Planning",
      "Projects: AI support workflow, ops automation, review pipelines",
      "Education: Wuhan University"
    ]
  },
  {
    fileName: "resume_masked_algo_gu.pdf",
    lines: [
      "Masked Resume - Algorithm Engineer",
      "Name: Gu Y.",
      "Phone: 136****1006",
      "Email: g***@example.com",
      "Target Role: Algorithm Engineer",
      "Experience: 2 years",
      "Skills: PyTorch, LLM, RAG, Vector Retrieval, Python",
      "Projects: Resume understanding, semantic retrieval, model evaluation",
      "Education: Shanghai Jiao Tong University"
    ]
  }
];

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf8");
pdfFixtures.forEach((fixture) => writePdf(fixture.fileName, fixture.lines));

console.log(`Reset seed source JSON with ${candidates.length} candidates, ${agentTasks.length} agent tasks and ${logs.length} logs.`);
console.log(`Generated ${pdfFixtures.length} masked PDF resumes in ${ROOT}.`);
console.log("Run `npm run db:seed` afterwards to import the refreshed seed data into Postgres.");
