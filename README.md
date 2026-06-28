# Testin RecruitFlow Agent

Testin RecruitFlow Agent 是一套面向招聘场景的 AI 候选人录入与跟踪系统。它不是完整 ATS，而是聚焦招聘流程中最耗时、最容易断点的环节：候选人信息录入、重复识别、流程跟进和全过程追溯。

系统支持从简历、邮件、聊天记录、备注等原始输入中抽取候选人信息，并将结果沉淀到候选人库、岗位申请、原始输入回溯、Agent 日志、提醒和看板中，形成一条可演示、可复盘、可继续扩展的招聘闭环。

## 项目价值

- 降低 HR 手工摘录简历和聊天信息的成本。
- 让每次 AI 处理都有原文、结果、日志和错误可查。
- 在候选人入库前提示疑似重复，减少重复建档。
- 将候选人状态、岗位申请、跟进提醒和看板统一起来。
- 支持 mock、本地演示和 Qwen、DeepSeek、custom OpenAI-compatible 模型接入。

## 核心流程

```mermaid
flowchart LR
  A["原始输入<br/>简历/邮件/聊天/备注"] --> B["AI Intake<br/>抽取候选人草稿"]
  B --> C["重复检测<br/>提示合并或新建"]
  C --> D["候选人库<br/>Candidate"]
  D --> E["岗位申请<br/>RecruitmentApplication"]
  E --> F["跟进提醒<br/>Notification"]
  B --> G["原始输入回溯<br/>RawInput"]
  B --> H["Agent 日志<br/>AgentTask"]
  E --> I["Dashboard / Kanban"]
```

## 功能概览

| 模块 | 能力 |
| --- | --- |
| AI 智能录入 | 支持文本粘贴、文件上传、PDF/DOCX/TXT/MD/JSON 解析、模型抽取和 mock 演示 |
| 重复候选人检测 | 基于手机号、邮箱、姓名、学校、专业、岗位、技能重合等信号判断疑似重复 |
| 候选人管理 | 候选人列表、详情、筛选、编辑、状态推进、删除和批量删除 |
| 岗位与申请 | 支持部门、岗位、JD、岗位自定义字段和候选人岗位申请记录 |
| 原始输入回溯 | 保留录入原文、解析结果、关联候选人和关联 Agent 任务 |
| Agent 日志 | 查看抽取、分类、标签、重复检测、跟进建议、状态识别等子任务 |
| Dashboard 与看板 | 展示招聘指标、候选人状态、岗位分布、待跟进事项和招聘阶段看板 |
| 账号与权限 | 支持管理员和 HR 账号，API 与页面均有登录态和权限校验 |

## 技术栈

- Next.js 15
- React 19
- TypeScript 5
- Prisma 6
- PostgreSQL
- OpenAI SDK
- pdf-parse
- mammoth
- Recharts
- zod

## 快速开始

### 1. 环境要求

- Node.js 22.x
- npm
- PostgreSQL

本地体验时，也可以使用项目内置脚本启动本地 PostgreSQL：

```bash
npm run db:local
```

该命令会占用当前终端运行数据库服务。保持它运行，再打开一个新终端执行后续命令。

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

复制 `.env.example` 为 `.env`，本地演示建议先使用 `mock` provider：

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/testin_recruitflow_agent?schema=public"
AUTH_SECRET="请替换为一段足够随机的字符串"
AI_PROVIDER=mock
NEXT_PUBLIC_APP_NAME="Testin RecruitFlow Agent"
```

如需接入 Qwen：

```env
AI_PROVIDER=qwen
QWEN_API_KEY="你的 Qwen API Key"
QWEN_MODEL=qwen-plus
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
```

如需接入 DeepSeek：

```env
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY="你的 DeepSeek API Key"
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_BASE_URL=https://api.deepseek.com
```

如需接入其他兼容 OpenAI 协议的模型：

```env
AI_PROVIDER=custom
CUSTOM_AI_PROVIDER_NAME=OtherModel
CUSTOM_AI_API_KEY="你的 API Key"
CUSTOM_AI_BASE_URL="兼容 OpenAI 协议的 base URL"
CUSTOM_AI_MODEL="模型名称"
```

### 4. 初始化数据库

第一次启动或数据库为空时执行：

```bash
npx prisma generate
npx prisma migrate deploy
npm run db:seed
npm run admin:bootstrap -- --email admin@testin.local --name "Testin Admin" --password "Admin123456"
npm run hr:bootstrap
```

如果在 Windows PowerShell 中遇到 `npx.ps1` 执行策略限制，可以改用本地 `.cmd` 命令：

```powershell
.\node_modules\.bin\prisma.cmd generate
.\node_modules\.bin\prisma.cmd migrate deploy
npm run db:seed
npm run admin:bootstrap -- --email admin@testin.local --name "Testin Admin" --password "Admin123456"
npm run hr:bootstrap
```

### 5. 启动项目

```bash
npm run dev
```

浏览器打开：

```text
http://localhost:3000
```

## 默认测试账号

执行数据库初始化和账号初始化后，可使用以下账号登录：

| 角色 | 邮箱 | 密码 |
| --- | --- | --- |
| 管理员 | `admin@testin.local` | `Admin123456` |
| HR | `hr@testin.local` | `Hr123456` |

## 推荐体验路径

1. 登录系统。
2. 打开 `/dashboard` 查看招聘总览。
3. 打开 `/intake`，选择部门和目标岗位。
4. 上传项目根目录下的脱敏简历，或粘贴候选人文本。
5. 查看 AI 抽取结果、置信度、缺失字段、标签和跟进建议。
6. 如提示疑似重复候选人，选择合并或继续新建。
7. 保存候选人。
8. 打开 `/candidates` 查看候选人列表。
9. 打开候选人详情，查看状态日志、原始输入和 Agent 日志。
10. 打开 `/raw-inputs`、`/agent-tasks`、`/kanban` 查看追溯和流程推进效果。

项目根目录提供了几份可直接测试的脱敏中文简历：

- `resume_cn_masked_frontend_zhou_xin.pdf`
- `resume_cn_masked_backend_qian_haoyu.pdf`
- `resume_cn_masked_algo_he_yunxi.pdf`

## 页面说明

| 路径 | 说明 |
| --- | --- |
| `/login` | 登录入口 |
| `/register` | 注册普通招聘账号 |
| `/dashboard` | 招聘总览、图表、待跟进事项和 Agent 统计 |
| `/intake` | AI 智能录入，支持文本和文件 |
| `/candidates` | 候选人列表、筛选、编辑和批量操作 |
| `/candidates/[id]` | 候选人详情、状态日志、原始输入、Agent 日志和提醒 |
| `/positions` | 岗位管理 |
| `/positions/[id]` | 岗位详情和招聘进度 |
| `/raw-inputs` | 原始输入回溯 |
| `/agent-tasks` | Agent 任务日志 |
| `/kanban` | 招聘流程看板 |
| `/admin` | 管理入口 |
| `/admin/users` | 用户管理 |

## 目录结构

```text
.
├─ src
│  ├─ app                 # Next.js 页面和 API Route
│  ├─ components          # 前端组件
│  └─ lib
│     ├─ agents           # 本地抽取、重复检测、合并和提醒规则
│     ├─ ai               # AI Provider、提示词、schema 和岗位匹配
│     ├─ auth             # 登录态、权限和鉴权
│     ├─ files            # 上传文件存储和解析
│     ├─ schemas          # API 参数校验
│     └─ services         # 候选人、岗位、Dashboard、Intake 等业务服务
├─ prisma                 # Prisma schema、迁移和种子脚本
├─ scripts                # 本地数据库、演示数据、账号初始化、部署检查脚本
├─ data                   # 演示数据和上传文件目录
├─ docs                   # 操作使用和代码流程文档
└─ artifacts              # 方案文档截图等交付物
```

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动开发服务 |
| `npm run build` | 生产构建检查 |
| `npm run start` | 启动生产服务 |
| `npm run db:local` | 启动本地 PostgreSQL |
| `npm run db:push` | 将 Prisma schema 推送到数据库 |
| `npm run db:seed` | 导入演示数据 |
| `npm run demo:reset` | 重置演示数据和演示资产 |
| `npm run admin:bootstrap` | 创建或更新管理员账号 |
| `npm run hr:bootstrap` | 创建或更新 HR 测试账号 |
| `npm run predeploy:check` | 部署前配置检查 |
| `npm run prisma:generate` | 生成 Prisma Client |

## 数据模型简述

| 模型 | 说明 |
| --- | --- |
| `Candidate` | 候选人人才库主表 |
| `Position` | 招聘岗位表 |
| `Department` | 部门字典表 |
| `RecruitmentApplication` | 候选人在某个岗位下的申请流程 |
| `RawInput` | 原始输入和 AI 解析结果快照 |
| `AgentTask` | AI 子任务执行日志 |
| `RecruitmentLog` | 候选人状态流转日志 |
| `Notification` | 跟进提醒 |
| `AuthUser` | 登录用户 |
| `PositionFieldDefinition` | 岗位自定义字段定义 |

## 配套文档

- [项目操作使用文档](docs/01_项目操作使用文档.md)：本地启动、账号初始化、业务演示、页面功能和常见问题排查。
- [代码流程说明文档](docs/02_代码流程说明文档.md)：项目分层、核心数据模型、AI Intake 主链路和二次开发注意事项。
- [注释规范与变更清单](docs/03_注释规范与变更清单.md)：本次注释范围、维护规范和后续处理原则。

## 常见问题

### 登录提示未登录或登录过期

确认 `.env` 中已配置 `AUTH_SECRET`，并且账号初始化命令已执行。如果数据库被重置，需要重新执行 `npm run admin:bootstrap` 和 `npm run hr:bootstrap`。

### Prisma 连接数据库失败

确认 PostgreSQL 正在运行，`DATABASE_URL` 指向正确数据库，然后执行：

```bash
npx prisma generate
npx prisma migrate deploy
```

PowerShell 执行策略受限时使用：

```powershell
.\node_modules\.bin\prisma.cmd generate
.\node_modules\.bin\prisma.cmd migrate deploy
```

### AI 调用失败

先将 `AI_PROVIDER` 改为 `mock` 验证业务流程是否正常。如果 mock 正常，再检查真实 provider 的 API Key、base URL、model 和网络访问权限。错误详情可在 `/agent-tasks` 查看。

### 文件解析不到文字

当前支持文本型 PDF、DOCX、TXT、MD、JSON 等文件。扫描件或图片型 PDF 暂无 OCR，建议先做 OCR 后再上传文本文件。

## 当前边界

- 当前版本重点解决“招聘数据智能记录与跟踪”，不是完整 ATS。
- AI 抽取结果建议由 HR 人工确认后再保存。
- 图片型简历和扫描件 PDF 暂不具备完整 OCR 能力。
- 更适合中小规模演示、试点、内部方案验证和二次开发起点。
