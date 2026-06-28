const fs = require("fs");
const path = require("path");

const root = process.cwd();
const outputDir = path.join(root, "tmp", "resume-fixtures");

const resumes = [
  {
    fileName: "resume_cn_masked_frontend_zhou_xin.html",
    name: "周欣",
    subtitle: "女 | 4年经验 | 本科 | 手机：138****4521 | 邮箱：zhoux***@example.com",
    role: "目标岗位：前端开发工程师 / Web 前端工程师",
    education: "华东师范大学  软件工程  本科  2016.09 - 2020.06",
    experienceTitle: "上海某企业服务平台  前端开发工程师  2021.03 - 至今",
    experience: [
      "负责招聘中后台、数据看板和内部工作台前端开发，主导 React + Next.js 页面重构。",
      "优化候选人列表、筛选与录入交互，推动关键页面首屏加载时长下降约 30%。",
      "与产品和后端协作设计 AI 智能录入流程，支持文件上传、结构化抽取和人工复核。"
    ],
    projectTitle: "智能招聘工作台",
    projects: [
      "负责原始输入回溯页、Agent 日志抽屉、候选人管理页和 Dashboard 的交互设计与实现。",
      "搭建高密度数据展示规范和可复用组件样式，提升招聘团队日常操作效率。"
    ],
    skills: "React、Next.js、TypeScript、Tailwind CSS、ECharts、复杂表单交互、可视化设计"
  },
  {
    fileName: "resume_cn_masked_backend_qian_haoyu.html",
    name: "钱浩宇",
    subtitle: "男 | 6年经验 | 本科 | 手机：139****7812 | 邮箱：qianh***@example.com",
    role: "目标岗位：后端开发工程师 / 平台研发工程师",
    education: "电子科技大学  计算机科学与技术  本科  2013.09 - 2017.06",
    experienceTitle: "成都某企业软件有限公司  高级后端工程师  2020.05 - 至今",
    experience: [
      "负责招聘流程引擎、消息通知和 Agent 任务编排服务设计，技术栈以 Java / Spring Boot 为主。",
      "主导 Redis、Kafka、MySQL 的链路治理与性能优化，支撑高并发简历导入和状态流转。",
      "推动候选人、原始输入、AgentTask 和提醒事项等核心数据模型落地。"
    ],
    projectTitle: "智能招聘流程中台",
    projects: [
      "设计 AI Intake、重复检测、跟进提醒和招聘看板接口，支持多账号共享同一候选人数据库。",
      "建设任务日志、原始输入回溯和状态追踪机制，方便排查模型输出质量。"
    ],
    skills: "Java、Spring Boot、MySQL、Redis、Kafka、Docker、接口设计、链路治理"
  },
  {
    fileName: "resume_cn_masked_algo_he_yunxi.html",
    name: "何云溪",
    subtitle: "女 | 2年经验 | 硕士 | 手机：137****6634 | 邮箱：heyx***@example.com",
    role: "目标岗位：算法工程师 / 大模型应用工程师",
    education: "上海交通大学  人工智能  硕士  2020.09 - 2023.03",
    experienceTitle: "上海某 AI 创业公司  算法工程师  2023.04 - 至今",
    experience: [
      "负责简历理解、候选人标签补全和匹配排序模型研发，参与 Prompt 设计与效果评估。",
      "基于 RAG 与向量检索搭建招聘知识库问答能力，提升结构化抽取稳定性。",
      "建设离线评测集和线上质量回溯机制，支持 DeepSeek / Qwen 双模型效果对比。"
    ],
    projectTitle: "智能简历解析与候选人标签系统",
    projects: [
      "输出候选人方向标签、校招/社招判断、高潜/需复核提示和下一步跟进建议。",
      "将原始输入进一步分类为简历、邮件、聊天记录、面试反馈和其他备注。"
    ],
    skills: "Python、PyTorch、LLM、RAG、向量检索、评测集构建、Prompt Engineering"
  }
];

function renderList(items) {
  return items.map((item) => `<li>${item}</li>`).join("");
}

function renderResume(resume) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>${resume.name} - 脱敏简历</title>
  <style>
    @page { size: A4; margin: 18mm 16mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #172033;
      font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
      background:
        radial-gradient(circle at top right, rgba(36, 87, 255, 0.08), transparent 28%),
        linear-gradient(180deg, #f8fbff 0%, #ffffff 100%);
    }
    .resume {
      width: 100%;
      min-height: 100vh;
      padding: 28px 34px 34px;
      background: rgba(255,255,255,0.96);
      border: 1px solid rgba(25, 58, 124, 0.08);
      box-shadow: 0 18px 48px rgba(41, 72, 152, 0.12);
    }
    .hero {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 18px;
      align-items: end;
      padding-bottom: 18px;
      border-bottom: 2px solid #d8e4ff;
    }
    .name {
      margin: 0;
      font-size: 30px;
      line-height: 1.1;
      font-weight: 700;
      letter-spacing: 0.04em;
    }
    .subtitle {
      margin-top: 10px;
      color: #52617d;
      font-size: 14px;
    }
    .badge {
      align-self: start;
      padding: 8px 12px;
      border-radius: 999px;
      background: #193a7c;
      color: #fff;
      font-size: 12px;
      letter-spacing: 0.08em;
    }
    .section { margin-top: 22px; }
    .section-title {
      margin: 0 0 10px;
      font-size: 14px;
      font-weight: 700;
      color: #173a75;
      letter-spacing: 0.12em;
    }
    .panel {
      padding: 14px 16px;
      border-radius: 16px;
      background: linear-gradient(180deg, #ffffff 0%, #f5f8ff 100%);
      border: 1px solid #e2e9fb;
    }
    .single-line {
      margin: 0;
      font-size: 14px;
      line-height: 1.8;
    }
    .job-title {
      margin: 0 0 8px;
      font-size: 15px;
      font-weight: 700;
    }
    ul {
      margin: 0;
      padding-left: 20px;
      color: #24324d;
      line-height: 1.8;
      font-size: 14px;
    }
    .skills {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .skill {
      padding: 8px 10px;
      border-radius: 999px;
      background: #eef3ff;
      color: #173a75;
      font-size: 13px;
      border: 1px solid #d7e4ff;
    }
  </style>
</head>
<body>
  <main class="resume">
    <section class="hero">
      <div>
        <h1 class="name">${resume.name}</h1>
        <div class="subtitle">${resume.subtitle}</div>
      </div>
      <div class="badge">脱敏测试简历</div>
    </section>

    <section class="section">
      <h2 class="section-title">求职意向</h2>
      <div class="panel"><p class="single-line">${resume.role}</p></div>
    </section>

    <section class="section">
      <h2 class="section-title">教育背景</h2>
      <div class="panel"><p class="single-line">${resume.education}</p></div>
    </section>

    <section class="section">
      <h2 class="section-title">工作经历</h2>
      <div class="panel">
        <p class="job-title">${resume.experienceTitle}</p>
        <ul>${renderList(resume.experience)}</ul>
      </div>
    </section>

    <section class="section">
      <h2 class="section-title">项目经历</h2>
      <div class="panel">
        <p class="job-title">${resume.projectTitle}</p>
        <ul>${renderList(resume.projects)}</ul>
      </div>
    </section>

    <section class="section">
      <h2 class="section-title">技能优势</h2>
      <div class="skills">
        ${resume.skills.split("、").map((skill) => `<span class="skill">${skill}</span>`).join("")}
      </div>
    </section>
  </main>
</body>
</html>`;
}

fs.mkdirSync(outputDir, { recursive: true });

for (const resume of resumes) {
  fs.writeFileSync(path.join(outputDir, resume.fileName), renderResume(resume), "utf8");
}

console.log(`Generated ${resumes.length} HTML resume fixtures in ${outputDir}`);
