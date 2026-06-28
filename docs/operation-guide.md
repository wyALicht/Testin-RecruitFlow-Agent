# Testin RecruitFlow Agent 操作使用文档

本文面向第一次接触项目的新同学，目标是让你可以独立完成本地启动、账号初始化、业务演示和常见维护操作。

## 1. 项目用途

Testin RecruitFlow Agent 是一套面向招聘场景的 AI 候选人录入与跟踪系统。它可以把简历、邮件、聊天记录、备注等原始内容解析成候选人信息，并把处理过程保存到原始输入和 Agent 日志中，方便后续追溯。

核心业务闭环如下：

1. HR 在 `/intake` 上传简历或粘贴文本。
2. 系统调用 AI 或 mock provider 抽取候选人信息。
3. 系统检测是否存在疑似重复候选人。
4. HR 确认保存为新候选人，或合并到已有候选人。
5. 候选人进入候选人库、招聘看板、Dashboard 和跟进提醒。
6. 原始输入和 Agent 日志保留全过程记录。

## 2. 环境准备

### 2.1 软件要求

- Node.js 22.x
- npm
- PostgreSQL

如果只是本地体验，可以使用项目内置脚本启动本地 PostgreSQL：

```bash
npm run db:local
```

该命令会在 `.local-postgres` 目录下准备本地数据库运行文件。保持该终端运行，再打开新终端执行后续命令。

### 2.2 安装依赖

在项目根目录执行：

```bash
npm install
```

### 2.3 配置环境变量

复制 `.env.example` 为 `.env`，至少配置以下变量：

```env
DATABASE_URL="postgresql://用户名:密码@localhost:5432/数据库名?schema=public"
AUTH_SECRET="请替换为一段足够随机的字符串"
AI_PROVIDER=mock
NEXT_PUBLIC_APP_NAME="Testin RecruitFlow Agent"
```

本地只体验流程时建议先使用 `AI_PROVIDER=mock`。如果需要真实模型解析，可改为 Qwen、DeepSeek 或 custom provider。

Qwen 示例：

```env
AI_PROVIDER=qwen
QWEN_API_KEY="你的 Qwen API Key"
QWEN_MODEL=qwen-plus
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
```

DeepSeek 示例：

```env
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY="你的 DeepSeek API Key"
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_BASE_URL=https://api.deepseek.com
```

custom provider 示例：

```env
AI_PROVIDER=custom
CUSTOM_AI_PROVIDER_NAME="MyProvider"
CUSTOM_AI_API_KEY="你的 API Key"
CUSTOM_AI_BASE_URL="兼容 OpenAI 协议的 base URL"
CUSTOM_AI_MODEL="模型名称"
```

## 3. 初始化数据库和账号

第一次启动或数据库为空时，按顺序执行：

```bash
npx prisma generate
npx prisma migrate deploy
npm run db:seed
npm run admin:bootstrap -- --email admin@testin.local --name "Testin Admin" --password "Admin123456"
npm run hr:bootstrap
```

这些命令会完成：

- 生成 Prisma Client。
- 创建数据库表结构。
- 导入演示数据。
- 创建管理员账号。
- 创建 HR 测试账号。

默认测试账号：

| 角色 | 邮箱 | 密码 |
| --- | --- | --- |
| 管理员 | `admin@testin.local` | `Admin123456` |
| HR | `hr@testin.local` | `Hr123456` |

## 4. 启动系统

开发模式启动：

```bash
npm run dev
```

浏览器打开：

```text
http://localhost:3000
```

生产构建检查：

```bash
npm run build
```

构建通过后可执行：

```bash
npm run start
```

## 5. 页面和功能说明

### 5.1 登录和注册

- `/login`：登录入口。
- `/register`：注册普通招聘账号。

登录后系统会根据角色控制权限。管理员可以进入管理页面维护用户和部分配置，HR 主要完成招聘录入和跟进。

### 5.2 Dashboard

路径：`/dashboard`

用于查看招聘整体情况，包括候选人状态分布、岗位分布、待跟进提醒和 Agent 任务统计。适合演示或每日查看整体进度。

### 5.3 AI 智能录入

路径：`/intake`

标准操作步骤：

1. 登录系统。
2. 打开 `/intake`。
3. 选择部门。
4. 选择该部门下的目标岗位。
5. 选择 AI Provider，默认可使用 mock。
6. 选择录入方式：
   - 粘贴文本，例如简历、邮件、聊天记录。
   - 上传文件，例如 PDF、DOCX、TXT、MD、JSON。
7. 点击解析。
8. 查看系统抽取出的候选人草稿。
9. 如果提示疑似重复候选人，人工判断是否合并。
10. 确认无误后保存候选人。

保存后系统会同步创建或更新：

- Candidate 候选人记录。
- RecruitmentApplication 岗位申请记录。
- RecruitmentLog 状态流转日志。
- RawInput 原始输入记录。
- AgentTask AI 处理日志。
- Notification 跟进提醒。

### 5.4 候选人管理

路径：`/candidates`

常见操作：

1. 使用姓名、手机号、邮箱、学校等关键词搜索候选人。
2. 按状态、岗位、部门、来源、更新时间筛选。
3. 打开候选人详情查看完整信息。
4. 修改候选人状态、备注、标签等字段。
5. 执行单条删除或批量删除。

候选人删除采用软删除，数据会标记 `deletedAt`，不会直接物理删除主记录。

### 5.5 候选人详情

路径：`/candidates/[id]`

详情页可查看：

- 基础信息。
- 当前岗位和状态。
- 状态流转日志。
- 原始输入。
- Agent 任务。
- 跟进提醒。

当候选人状态发生变化时，系统会记录 RecruitmentLog，并生成或更新提醒。

### 5.6 原始输入回溯

路径：`/raw-inputs`

用于查看每次录入的原文、解析结果、关联候选人和关联 Agent 任务。排查 AI 抽取结果时，优先从这里确认原始内容是否正确。

### 5.7 Agent 日志

路径：`/agent-tasks`

用于查看 AI 处理过程。常见 taskType 包括：

- `extract`：候选人信息抽取。
- `classify`：输入类型和场景分类。
- `tagging`：标签生成。
- `followup`：跟进建议生成。
- `duplicate`：重复候选人检测。
- `status`：状态识别。

日志中会展示输入、输出、置信度、耗时和错误信息。真实模型调用失败时，优先查看这里的错误提示。

### 5.8 招聘看板

路径：`/kanban`

按招聘阶段展示候选人，适合快速查看流程推进情况。

### 5.9 管理后台

路径：

- `/admin`
- `/admin/users`

管理员可以维护用户和系统相关配置。普通 HR 如果没有权限，会收到 403 提示。

## 6. 演示建议路径

如果要给新同事或客户演示，建议按下面顺序：

1. 用管理员或 HR 账号登录。
2. 打开 `/dashboard`，说明当前招聘总览。
3. 打开 `/intake`，选择部门和岗位。
4. 上传项目根目录下的脱敏简历 PDF。
5. 展示 AI 抽取结果、置信度、缺失字段和跟进建议。
6. 保存候选人。
7. 打开 `/candidates`，展示候选人已进入人才库。
8. 打开候选人详情，展示状态日志、原始输入和 Agent 日志。
9. 打开 `/raw-inputs` 和 `/agent-tasks`，说明全过程可追溯。
10. 打开 `/kanban`，展示候选人在招聘流程中的位置。

项目根目录可用测试文件：

- `resume_cn_masked_frontend_zhou_xin.pdf`
- `resume_cn_masked_backend_qian_haoyu.pdf`
- `resume_cn_masked_algo_he_yunxi.pdf`

## 7. 常见维护命令

### 7.1 重置演示数据

```bash
npm run demo:reset
```

适合演示前恢复到干净状态。

### 7.2 重新导入种子数据

```bash
npm run db:seed
```

### 7.3 同步 Prisma Schema 到数据库

```bash
npm run db:push
```

开发阶段临时同步结构可使用该命令。正式环境建议使用 migration。

### 7.4 部署前检查

```bash
npm run predeploy:check
npm run build
```

## 8. 常见问题排查

### 8.1 登录提示未登录或登录过期

处理步骤：

1. 确认 `.env` 中 `AUTH_SECRET` 已配置。
2. 确认已创建账号。
3. 清理浏览器 cookie 后重新登录。
4. 如果数据库重置过，重新执行账号初始化命令。

### 8.2 Prisma 连接数据库失败

处理步骤：

1. 确认 PostgreSQL 正在运行。
2. 确认 `.env` 中 `DATABASE_URL` 指向正确数据库。
3. 执行 `npx prisma generate`。
4. 执行 `npx prisma migrate deploy`。

### 8.3 AI 调用失败

处理步骤：

1. 先把 `AI_PROVIDER` 改为 `mock`，确认业务流程本身可跑通。
2. 检查对应 provider 的 API Key、base URL 和 model。
3. 打开 `/agent-tasks` 查看错误信息。
4. 如果是网络或超时问题，确认运行环境可以访问模型服务。

### 8.4 文件上传后解析不到文字

可能原因：

- 文件是扫描件或图片型 PDF，当前没有 OCR。
- 文件超过 8MB。
- 文件类型不在支持范围内。

建议处理：

1. 换用文本型 PDF 或 DOCX。
2. 将扫描件先做 OCR，再上传 TXT/MD。
3. 拆分过大的文件。

### 8.5 页面数据没有刷新

系统有服务端读缓存。候选人、原始输入、Agent 日志和 Dashboard 在写入后会主动清缓存。如果仍看到旧数据，可刷新页面或重新登录后再查看。

