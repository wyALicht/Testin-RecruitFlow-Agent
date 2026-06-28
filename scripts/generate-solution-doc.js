const fs = require("node:fs");
const path = require("node:path");
const {
  AlignmentType,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  PageBreak,
  Paragraph,
  TextRun
} = require("docx");

const root = process.cwd();
const screenshotDir = path.join(root, "artifacts", "solution-doc");
const outputPath = path.join(root, "Testin RecruitFlow Agent 方案演示文档.docx");

function getPngSize(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.toString("ascii", 1, 4) !== "PNG") {
    throw new Error(`Unsupported image format: ${filePath}`);
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

function imageParagraph(fileName, caption, targetWidth = 520) {
  const filePath = path.join(screenshotDir, fileName);
  const { width, height } = getPngSize(filePath);
  const targetHeight = Math.round((height / width) * targetWidth);

  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 180, after: 120 },
      children: [
        new ImageRun({
          data: fs.readFileSync(filePath),
          transformation: {
            width: targetWidth,
            height: targetHeight
          }
        })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 220 },
      children: [
        new TextRun({
          text: caption,
          italics: true,
          color: "5B6573"
        })
      ]
    })
  ];
}

function heading(text, level = HeadingLevel.HEADING_1) {
  return new Paragraph({
    text,
    heading: level,
    spacing: { before: 200, after: 120 }
  });
}

function body(text, options = {}) {
  return new Paragraph({
    spacing: { after: 120, line: 360 },
    ...options,
    children: [new TextRun(text)]
  });
}

function bullet(text) {
  return new Paragraph({
    text,
    bullet: { level: 0 },
    spacing: { after: 80, line: 320 }
  });
}

function callout(title, text) {
  return new Paragraph({
    spacing: { before: 80, after: 160, line: 320 },
    children: [
      new TextRun({ text: `${title}：`, bold: true }),
      new TextRun(text)
    ]
  });
}

async function main() {
  const children = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: "Testin RecruitFlow Agent",
          bold: true,
          size: 34
        })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 140 },
      children: [
        new TextRun({
          text: "招聘数据智能化记录与跟踪方案演示文档",
          bold: true,
          size: 30
        })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 280 },
      children: [
        new TextRun({
          text: "目标：在最小成本预算下，用 AI 替代招聘流程中的繁琐手工记录，提升招聘效率与过程可追溯性",
          color: "44546A"
        })
      ]
    }),
    ...imageParagraph("02-dashboard.png", "图 1  系统首页 / 招聘 Dashboard：体现候选人总量、岗位分布、状态分布与待跟进提醒", 480),
    callout(
      "方案定位",
      "本方案不是重新设计一套大而全的 ATS，而是基于现有已完成的项目能力，把招聘数据“录入、确认、归档、跟进、追溯”串成一个低成本、可落地、可演示的完整闭环。"
    ),
    new Paragraph({ children: [new PageBreak()] }),

    heading("一、项目要解决的核心问题"),
    body(
      "当前招聘流程中的核心矛盾，不是“没有数据”，而是“数据记录成本高、更新不及时、后续追踪断裂”。HR 每天都会收到大量简历、聊天记录、邮件和面试反馈，但这些信息通常分散在招聘平台、邮箱、IM 工具和本地文件中，最终仍要靠人工整理到 Excel 或内部表单里。这个过程耗时、易错、难追溯。"
    ),
    body(
      "因此，本项目要解决的核心问题是：在最小成本预算下，建立一套可落地的“招聘数据智能化记录与跟踪方案”，尽量用 AI 代替机械录入，同时让后续的候选人推进、提醒和复盘有据可查。"
    ),
    callout(
      "问题本质",
      "手工记录不是价值创造环节，却占用了 HR 大量时间；而一旦记录不完整，后续跟进、协同和招聘分析都会失真。"
    ),

    heading("二、当前招聘流程中的具体痛点"),
    bullet("录入重复且低效：收到一份 PDF 简历后，HR 需要手工摘录姓名、电话、学校、岗位方向、工作年限、技能等信息。"),
    bullet("信息分散且容易遗漏：候选人可能来自 BOSS、邮箱、微信、内部推荐，信息散落在多个渠道中。"),
    bullet("重复候选人难识别：同一候选人被多次投递或不同 HR 重复录入时，容易产生重复跟进和数据冲突。"),
    bullet("状态跟踪依赖人工记忆：候选人进入筛选、笔试、一面、二面、Offer 后，后续推进常靠表格或便签记录。"),
    bullet("过程不可追溯：一旦 AI 或人工录入出错，如果没有原始输入和处理日志，后续很难定位问题。"),
    bullet("招聘负责人难以快速掌握全局：岗位进展、待跟进候选人、渠道效果缺乏统一可视化视角。"),
    callout(
      "补图建议",
      "如果后续要做更完整的答辩版 PPT，建议补一张“传统 Excel + 简历附件 + 聊天记录”拼图，用来对比手工流程的混乱现状。"
    ),

    heading("三、方案目标与设计原则"),
    bullet("先解决最核心痛点：优先解决“信息录入麻烦、后续跟踪容易漏”的高频问题。"),
    bullet("人工可控、AI 辅助：AI 负责提取、分类、打标签和给建议，最终保存与合并仍由人工确认。"),
    bullet("最小改造成本：基于现有 AI Intake、候选人管理、原始输入回溯、Agent 日志和 Dashboard 能力完成闭环。"),
    bullet("全流程可追溯：所有原始输入、AI 输出、候选人关联和任务日志都可回看。"),
    callout(
      "设计原则的意义",
      "评判标准是“问题解决有效性”，因此这套方案强调的是低成本可落地，而不是复杂模型堆叠。"
    ),

    heading("四、整体方案概述"),
    body(
      "本方案可以概括为一句话：让招聘数据从“手工记录”变成“AI 自动提取 + 人工确认 + 系统持续跟踪”的闭环。"
    ),
    bullet("HR 上传简历、粘贴聊天记录或录入邮件内容。"),
    bullet("AI 自动抽取候选人结构化信息。"),
    bullet("系统自动识别疑似重复候选人。"),
    bullet("HR 快速确认、修正并保存。"),
    bullet("系统自动生成候选人档案、AI 标签和跟进建议。"),
    bullet("所有原始输入和 AI 处理日志被完整保存。"),
    bullet("后续通过候选人管理、看板和 Dashboard 持续跟踪招聘进展。"),
    callout(
      "方案价值",
      "这不是只解决“录入”一个动作，而是把“录入—确认—归档—跟进—追溯”串成完整闭环。"
    ),

    heading("五、核心功能方案设计（按业务流程展开）"),
    heading("1. 招聘入口：统一承接原始输入", HeadingLevel.HEADING_2),
    body(
      "系统支持文本录入和文件上传两种入口，分别适用于聊天记录、邮件内容、面试反馈，以及 PDF / DOCX 简历。HR 无需再打开 Excel 逐项录入，只需上传或粘贴内容，即可进入智能解析流程。"
    ),
    ...imageParagraph("03-intake.png", "图 2  AI Intake 页面：支持文本录入、文件上传、模型切换和录入确认流程", 500),

    heading("2. AI Intake：自动完成结构化提取", HeadingLevel.HEADING_2),
    body(
      "AI 自动抽取姓名、电话、邮箱、学校、专业、工作经验、技能、当前状态、来源、岗位方向等关键字段。这一步直接替代了 HR 过去最机械、最耗时的“从简历中摘字段”的工作。"
    ),
    callout(
      "真实场景举例",
      "上传一份后端工程师简历后，系统可自动识别“6 年经验、Java / Spring Boot / MySQL、目标岗位为后端开发工程师”等信息。"
    ),

    heading("3. 重复检测：避免重复录入和重复跟进", HeadingLevel.HEADING_2),
    body(
      "系统会基于姓名、电话、邮箱等信息识别疑似重复候选人，并支持人工判断是“合并到现有候选人”还是“仍创建新候选人”。这对内部推荐和多渠道投递场景尤其关键。"
    ),
    callout(
      "补图建议",
      "如果后续需要强化这一亮点，可以补一次“AI 解析后命中疑似重复候选人”的操作截图，作为答辩时的重点演示页面。"
    ),

    heading("4. 候选人管理：从记录转向持续跟踪", HeadingLevel.HEADING_2),
    body(
      "候选人保存后进入统一管理页面。系统不仅保存基础信息，还支持状态推进、AI 标签展示、AI 跟进建议、删除和候选人详情查看。录入结果因此不再是一次性的表单数据，而是可持续推进的招聘对象。"
    ),
    ...imageParagraph("04-candidates-list.png", "图 3  候选人管理列表：展示候选人状态、AI 标签、来源和最近跟进建议", 500),
    ...imageParagraph("05-candidate-detail.png", "图 4  候选人详情页：展示完整档案、AI 判断、提醒事项、原始输入与 Agent 处理记录", 500),

    heading("5. 原始输入回溯：保证数据可追溯", HeadingLevel.HEADING_2),
    body(
      "每一条候选人数据都可以回溯到原始输入。系统支持查看原始文本、文件解析内容、AI 解析结果、关联候选人和关联 Agent 任务。这解决了“录错了之后怎么查”的问题。"
    ),
    ...imageParagraph("07-raw-inputs-detail.png", "图 5  原始输入详情：原文、解析结果、关联候选人和关联 Agent 任务可完整回溯", 500),

    heading("6. Agent 日志：让 AI 处理过程透明化", HeadingLevel.HEADING_2),
    body(
      "系统记录每次 AI 任务的 input、output、confidence、error、关联 raw input 和关联 candidate。这样一旦模型提取不准，团队可以快速判断是输入质量问题、模型置信度不足，还是某次调用异常。"
    ),
    ...imageParagraph("09b-agent-tasks-detail-focus.png", "图 6  Agent 日志详情：展示任务状态、置信度、输入输出和错误排查入口", 500),

    heading("7. Dashboard / 看板：把跟踪结果可视化", HeadingLevel.HEADING_2),
    body(
      "系统通过 Dashboard 和招聘看板，把候选人状态分布、岗位分布、任务趋势、待跟进提醒和流程推进结果集中呈现出来，帮助招聘负责人快速看清全局。"
    ),
    ...imageParagraph("10-kanban.png", "图 7  招聘看板：按流程阶段展示候选人分布，便于团队推进状态流转", 500),

    heading("六、为什么这套方案能低成本快速落地"),
    bullet("不是从零重做系统，而是对现有能力做闭环整合。"),
    bullet("AI 聚焦在结构化提取、标签补全、跟进建议等最稳定、最节省人工的环节。"),
    bullet("技术架构轻量：Next.js + Prisma + PostgreSQL，可通过 GitHub + Vercel 快速部署。"),
    bullet("适合分阶段落地：先在单团队试点，验证有效后再扩展更多流程。"),
    callout(
      "落地优势",
      "评委关注的是是否能真正替代手工记录并提升效率，而不是系统是否设计得很复杂。当前项目已经证明这套方案具备演示与试运行条件。"
    ),

    heading("七、相较传统手工记录方式的效率提升点"),
    bullet("简历录入效率提升：上传后自动提取，HR 只需要确认关键字段。"),
    bullet("重复候选人处理效率提升：系统自动提示疑似重复，减少沟通冲突。"),
    bullet("跟进效率提升：状态推进与提醒沉淀在系统里，减少漏跟进。"),
    bullet("数据查找效率提升：候选人档案、原始输入、Agent 日志集中在一个系统里。"),
    bullet("复盘效率提升：出了问题可以回看原文、解析结果和任务日志。"),

    heading("八、方案演示时最值得展示的亮点"),
    bullet("从一份 PDF 简历开始，展示 AI 自动提取结构化候选人信息。"),
    bullet("展示候选人列表中的 AI 标签和 AI 跟进建议，体现系统不仅会录，还会辅助推进。"),
    bullet("展示候选人详情页中的原始输入、提醒事项和 Agent 处理记录，证明全过程可追溯。"),
    bullet("展示 Agent 日志详情页，说明模型输入输出透明，可用于质量排查。"),
    bullet("最后回到 Dashboard 和看板，展示数据沉淀后如何服务管理决策。"),

    heading("九、潜在风险与边界"),
    bullet("AI 提取并非 100% 准确，复杂或扫描版简历仍需要人工确认。"),
    bullet("当前更聚焦“记录与跟踪”问题，而不是完整替代所有 ATS 能力。"),
    bullet("文件解析能力依赖输入质量，对图片型或扫描型简历会有边界。"),
    bullet("模型效果依赖原始输入质量，碎片化内容会降低提取稳定性。"),

    heading("十、后续可扩展方向"),
    bullet("增加 OCR 能力，支持扫描 PDF 和图片简历。"),
    bullet("增强原始输入分类，进一步区分简历、邮件、聊天记录、面试反馈。"),
    bullet("让 AI 标签参与筛选、排序和优先级推荐。"),
    bullet("增加多模型重解析与对比能力，帮助持续优化抽取质量。"),
    bullet("接入更多招聘渠道，实现原始输入自动同步。"),

    heading("十一、总结：为什么这个方案能有效解决题目问题"),
    body(
      "这套方案的价值不在于“用了 AI”，而在于它精准切中了招聘流程里最耗时、最容易漏、最缺乏沉淀的环节：招聘数据的记录与跟踪。"
    ),
    body(
      "通过“AI 自动提取 + 人工确认 + 系统持续跟踪 + 全过程可回溯”的闭环，它能在最小成本下显著减少人工录入、减少重复候选人、减少跟进遗漏，并提升招聘推进效率与数据完整性。"
    ),
    body(
      "因此，这不是一个单纯的功能 Demo，而是一套围绕真实招聘核心痛点、可快速落地、可直接验证效果的解决方案。它最符合题目要求的地方，就在于“问题解决的有效性”足够强。"
    ),

    heading("附录：已嵌入截图说明", HeadingLevel.HEADING_2),
    bullet("图 1：系统首页 / Dashboard，总览招聘数据与待跟进任务。"),
    bullet("图 2：AI Intake，展示文本/文件输入、模型选择和录入确认区。"),
    bullet("图 3：候选人管理列表，展示标签、状态和跟进建议。"),
    bullet("图 4：候选人详情页，体现档案完整性与可追溯性。"),
    bullet("图 5：原始输入详情，体现从原文到解析结果的回溯能力。"),
    bullet("图 6：Agent 日志详情，体现 AI 过程透明与问题排查能力。"),
    bullet("图 7：招聘看板，体现流程推进与状态可视化能力。"),
    callout(
      "文档说明",
      "本版文档已尽量使用真实项目截图。若后续要做正式答辩版，建议再补“重复候选人命中界面”和“传统手工流程对比图”。"
    )
  ];

  const doc = new Document({
    creator: "OpenAI Codex",
    title: "Testin RecruitFlow Agent 方案演示文档",
    description: "招聘数据智能化记录与跟踪方案演示文档",
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1080,
              right: 900,
              bottom: 1080,
              left: 900
            }
          }
        },
        children
      }
    ]
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outputPath, buffer);
  console.log(outputPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
