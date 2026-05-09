# AI功能清单开发

更新时间：2026-05-08

扫描范围：`server.js`、`routes/`、`middleware/`、`db/`、`services/`、`admin/`、`miniprogram/app.*`、`miniprogram/pages/`、`miniprogram/components/`、`miniprogram/utils/`、`scripts/`、`README.md`、`.env.example`。已跳过 `node_modules`、`miniprogram/miniprogram_npm`、`.git`、构建产物和运行数据库文件。

## 0. 开发状态记录

### 2026-05-08 第一批稳定性与安全修复：已完成

- 已完成：修复 `routes/payment.js` 中 `req.user.id` 与鉴权中间件不一致的问题，统一为 `req.user.userId`。
- 已完成：微信支付回调增加订单金额校验，防止支付金额与订单金额不一致时错误开通 VIP。
- 已完成：`routes/users.js` 网页端注册改为 `crypto.scrypt` 哈希存储密码，并兼容旧明文用户首次登录后自动升级哈希。
- 已完成：`routes/webhook.js` 强制要求 `WEBHOOK_SECRET`，未配置时拒绝执行部署。
- 已完成：后台 Banner 上传补充 magic bytes 文件头校验。
- 已完成：新增 `tests/smoke.test.js` 和 `npm test`，覆盖 health、公开职位列表、匿名鉴权拒绝、Webhook 缺签名拒绝。
- 验证结果：`npm test` 通过，4 个 smoke tests 全部通过。

### 2026-05-09 第二批优化：进行中

- 已完成：提交并推送第一批安全修复记录和基础 smoke tests，提交 `2adbb1a`。
- 已完成：新增 `AGENTS.md`，明确多 AI 分工、文件占用和高风险链路规则。
- 已完成：新增 `DEVELOPMENT_STATUS.md`，记录第二批任务状态、文件占用和待决策项。
- 已完成：补充 `README.md`，覆盖本地启动、测试、环境变量、目录边界和协作说明。
- 已完成：扩展后端 smoke tests，覆盖登录、支付 Mock 下单/确认/校验、订单鉴权、上传伪 MIME 拒绝、公开 banners/companies 列表。
- 验证结果：`npm test` 通过，11 个 smoke tests 全部通过。
- 待开始：小程序直接请求迁移第一批页面，优先 `messages`、`feedback`、`news`。
- 待开始：简历 API 去重方案，先设计，不删除旧接口。

## 1. 项目总览

### 技术栈

- 前端小程序：微信原生小程序，WXML/WXSS/JS，CommonJS。
- UI 依赖：`tdesign-miniprogram`，同时存在自研组件。
- 后端：Node.js、Express 4、better-sqlite3。
- 数据库：SQLite，WAL 模式，启动时建表和补字段。
- 管理后台：原生 HTML/CSS/JS 静态页，通过 `/admin/api/*` 调后端。
- AI：DeepSeek Chat Completions。
- 第三方：微信登录、微信手机号、微信订阅消息、微信支付 JSAPI v2、RapidAPI JSearch、NewsAPI、LeetCode GraphQL。
- 部署：GitHub Webhook + shell 脚本自动构建前端。

### 架构现状

- 当前仓库是全栈单仓：后端、后台、小程序都在 `jobapp-server`。
- 后端入口为 `server.js`，业务接口集中在 `routes/`。
- 小程序页面已注册 48 个，所有页面均具备 `.js/.wxml/.wxss/.json` 四件套。
- API 客户端已模块化为 `miniprogram/utils/api-*.js`，但仍有若干页面直接使用 `wx.request` 或 `wx.uploadFile`。
- 全局状态主要依赖 `App.globalData` 和 `wxStorage`。
- 后端响应格式不完全统一，既有 `{ code, message, data }`，也有 `{ error }`、JSearch 原始结构、AI 原始结构。

## 2. 已实现功能模块

| 模块 | 当前状态 | 主要文件 | 稳定性 | 风险 |
|---|---|---|---|---|
| 首页与导航 | 已实现 | `miniprogram/pages/index`、`app.json` | 中 | 中 |
| 职位搜索/推荐 | 已实现 | `routes/jobs.js`、`data/jobs.json`、`pages/jobs`、`pages/job-detail` | 中 | 中 |
| 企业库 | 已实现 | `routes/companies.js`、`services/companyService.js`、`pages/companies`、`pages/company-detail` | 中 | 中 |
| 网申管理 | 已实现 | `routes/applications.js`、`pages/applications` | 中 | 中 |
| 面经/题库 | 已实现 | `routes/experiences.js`、`routes/comments.js`、`pages/experiences`、`pages/experience-detail` | 中 | 中 |
| AI 模拟面试 | 已实现 | `routes/ai.js`、`routes/asr.js`、`pages/interview-*`、`pages/ai-report` | 中 | 高 |
| AI 职业规划 | 已实现 | `routes/ai.js`、`pages/career-planner` | 中 | 中 |
| AI 项目生成 | 已实现 | `routes/ai.js`、`pages/project-builder` | 中 | 中 |
| AI 助手/工作流 | 已实现 | `routes/ai.js`、`pages/ai-assistant`、`pages/ai-workflow` | 中 | 高 |
| 简历管理 | 已实现 | `routes/resumes.js`、`routes/users.js`、`pages/resume` | 中 | 中 |
| 薪资查询 | 已实现 | `routes/salaries.js`、`pages/salary` | 中 | 中 |
| 校招日历 | 已实现 | `routes/campus.js`、`pages/campus`、`pages/campus-detail` | 中 | 中 |
| 求职机构测评 | 已实现 | `routes/agencies.js`、`pages/agencies`、`pages/agency-detail`、`pages/agency-compare` | 中 | 中 |
| 收藏 | 已实现 | `routes/favorites.js`、`utils/favorites.js`、`pages/favorites` | 中 | 中 |
| 消息通知 | 已实现 | `routes/messages.js`、`routes/notify.js`、`pages/messages` | 中 | 中 |
| 用户资料/登录 | 已实现 | `routes/users.js`、`middleware/auth.js`、`pages/login`、`pages/profile` | 中 | 高 |
| 文件上传 | 已实现 | `routes/upload.js`、`routes/admin.js` | 中 | 中 |
| VIP/支付 | 半完成 | `routes/payment.js`、`pages/vip`、`utils/api-payment.js` | 低 | 高 |
| 新闻资讯 | 已实现 | `routes/news.js`、`pages/news`、`pages/news-detail` | 中 | 中 |
| 管理后台 | 已实现 | `admin/*.html`、`admin/js/common.js`、`routes/admin.js` | 中 | 中 |
| GitHub 自动部署 | 已实现 | `routes/webhook.js`、`scripts/deploy-frontend.sh` | 中 | 高 |

## 3. 页面结构与完成度

### TabBar 页面

- 首页：`pages/index/index`
- 职位：`pages/jobs/jobs`
- 题库：`pages/experiences/experiences`
- 测评：`pages/agencies/agencies`
- 我的：`pages/profile/profile`

### 核心业务页面

- 职位链路：`jobs` -> `job-detail` -> `applications` / `webview` / `interview-dialog`
- 企业链路：`companies` -> `company-detail` -> `job-detail` / `experience-detail`
- 面经链路：`experiences` -> `experience-detail` -> `comments` / `interview-dialog`
- AI 面试链路：`interview-setup` -> `interview-dialog` -> `ai-report` -> `ai-history`
- 简历链路：`resume` -> AI 诊断/导出/项目生成
- 机构测评链路：`agencies` -> `agency-detail` / `agency-compare`
- 校招链路：`campus` -> `campus-detail` -> `webview`
- 个人中心链路：`profile` -> `profile-edit` / `applications` / `favorites` / `messages` / `settings`

### 页面完成度判断

所有 48 个页面文件完整，但完成度并不一致：

- 成熟主链路：`index`、`jobs`、`job-detail`、`profile`、`applications`、`companies`、`agencies`、`campus`。
- 功能较重、需要专项回归：`resume`、`salary`、`ai-assistant`、`ai-workflow`、`interview-dialog`、`experience-detail`。
- 仍有演示/本地数据痕迹：`applications`、`agencies`、`campus`、`experiences`、`interview-bank`、`salary`、`search`、`ai-report`。
- 极简页面：`webview`、`privacy`、`about`、`settings`，功能简单但需要确认合规文案和外链安全。

### 超长页面文件

- `miniprogram/pages/salary/salary.wxss`：1460 行。
- `miniprogram/pages/applications/applications.wxss`：1096 行。
- `miniprogram/pages/ai-workflow/ai-workflow.wxss`：1081 行。
- `miniprogram/pages/jobs/jobs.wxss`：1079 行。
- `miniprogram/pages/index/index.wxss`：1041 行。
- `miniprogram/pages/experience-detail/experience-detail.js`：600 行。
- `miniprogram/pages/resume/resume.js`：536 行。
- `miniprogram/pages/jobs/jobs.js`：522 行。
- `miniprogram/pages/salary/salary.js`：507 行。

## 4. 后端接口结构

### 路由覆盖

- `routes/admin.js`：40 个接口，后台所有管理能力集中在一个文件。
- `routes/users.js`：12 个接口，登录、资料、简历兼容入口。
- `routes/agencies.js`：9 个接口，机构列表、详情、评价、点赞、AI 评估、对比。
- `routes/jobs.js`：8 个接口，JSearch 代理、本地职位、筛选、推荐。
- `routes/payment.js`：6 个接口，订单、微信回调、mock 支付、订单校验。
- `routes/ai.js`：5 个接口，AI 助手、普通对话、职业规划、项目生成、工作流。
- `routes/comments.js`、`routes/experiences.js`、`routes/resumes.js`：各 5 个左右接口。
- `routes/banners.js`、`routes/news.js`、`routes/logo.js`：偏读取型接口。

### 数据层

- `db/database.js` 建 20+ 张表，并创建索引。
- `orders` 表在 `routes/payment.js` 内动态创建，没有统一归入 `db/database.js`。
- `campus_schedules`、`users`、`resumes`、`banners` 有启动时补字段逻辑。
- JSON 字段大量存 TEXT，如 `education`、`job_preference`、`services`、`tags`、`timeline`。

## 5. 关键问题清单

### P0 高优先级

1. 支付用户 ID 字段错误
   - 位置：`routes/payment.js`
   - 现状：鉴权中间件挂载 `req.user.userId`，支付路由多处使用 `req.user.id`。
   - 风险：订单创建、mock 确认、订单查询可能绑定不到正确用户。

2. 网页端密码明文存储
   - 位置：`routes/users.js`、`db/database.js`
   - 现状：`web-login` 使用 `WHERE password = ?`，`web-register` 直接插入明文密码。
   - 风险：一旦数据库泄露，用户密码直接暴露。

3. Webhook 签名可被空 secret 绕过
   - 位置：`routes/webhook.js`
   - 现状：仅当 `WEBHOOK_SECRET` 存在时验证签名。
   - 风险：生产环境误配为空时，任何人可触发部署脚本。

4. `.env.example` 与 CORS 逻辑不一致
   - 位置：`.env.example`、`server.js`
   - 现状：示例写 `ALLOWED_ORIGIN=*`，但代码是精确匹配 origin，不把 `*` 当通配符。
   - 风险：本地/生产跨域配置误判。

### P1 中高优先级

1. 后台上传缺少魔数校验
   - 位置：`routes/admin.js`
   - 对比：`routes/upload.js` 已做 magic bytes 校验。

2. 简历 API 重复
   - 位置：`routes/users.js`、`routes/resumes.js`
   - 风险：两个入口行为不一致，前端调用混乱。

3. 职位数据源双轨
   - 位置：`routes/jobs.js`、`routes/admin.js`、`data/jobs.json`、`db/database.js`
   - 风险：后台管理写 JSON，但数据库也有 `jobs` 表。

4. AI JSON 解析脆弱
   - 位置：`routes/ai.js`
   - 现状：通过正则提取 JSON，没有 schema 校验。

5. 部分页面绕过统一 API 客户端
   - 位置：`pages/messages`、`pages/feedback`、`pages/job-detail`、`pages/profile-edit`、`pages/news`、`pages/index` 等。
   - 风险：token、错误处理、重试、缓存行为不一致。

### P2 中低优先级

1. `routes/admin.js` 是 God Route，维护成本高。
2. 大量页面 WXSS 超长，公共设计系统抽取不足。
3. `miniprogram/utils/api.js` 桶式导出可能出现函数名冲突。
4. `db/database.js` 混合 DDL、索引、兼容迁移，缺少 migration 版本管理。
5. README 偏简略，缺少完整环境变量、部署、测试、协作说明。
6. 没有自动化测试和 CI。

## 6. 性能优化清单

### 后端

- 将 `routes/jobs.js` 的本地 JSON 全量搜索迁移到 SQLite 或建立预索引。
- 后台 `LIKE '%keyword%'` 查询可接受当前规模，数据增长后需 FTS5 或专门搜索索引。
- AI 接口需要记录耗时、超时、错误类型，便于定位高延迟。
- `routes/logo.js`、`services/companyService.js` 需要评估外部请求缓存策略。

### 小程序

- 优先处理超长 WXSS 页面，抽公共 token、按钮、列表卡、筛选栏样式。
- 统一直接 `wx.request` 页面到 `api-client.js`，减少重复请求和错误分叉。
- 对首页、职位页、薪资页、AI 助手页做包体积和首屏耗时检查。
- 评估 `tdesign-miniprogram` 组件按需打包和上传包体积。

## 7. 安全优化清单

- 密码必须哈希存储，禁止明文。
- 生产环境强制要求 `JWT_SECRET`、`WEBHOOK_SECRET`、微信支付配置。
- 后台上传加入 magic bytes 校验，并统一上传安全工具。
- 管理后台 token 存 localStorage 有 XSS 风险，需要 CSP、HTML 转义和更严格的输入输出策略。
- 微信支付回调应补充金额校验，确认回调金额与订单金额一致。
- 管理后台删除类接口建议补操作日志。
- 检查 GitHub 历史，确认没有提交过真实 `.env`、密钥、数据库文件。

## 8. 测试与稳定性清单

当前没有发现 `tests/`、`test/`、`__tests__/`、CI workflow。

建议最小测试集：

- 后端 smoke test：`/api/health`、`/api/jobs`、`/api/banners`、`/api/companies`。
- 鉴权测试：未登录访问 `/api/applications`、`/api/resumes`、`/api/payment/orders` 应返回 401。
- 登录测试：mock 微信登录、手机号登录参数校验。
- 支付测试：mock 下单、mock-confirm、verify、orders。
- 上传测试：正常图片、伪 MIME、超 5MB。
- AI 测试：缺少 key、超时、JSON 解析失败。
- 小程序手工回归：TabBar、登录、职位详情、网申、简历、AI 面试、VIP。

## 9. DX 与协作清单

### 当前不足

- 没有 lint、format、test、typecheck。
- 没有 CI。
- README 缺少完整本地启动路径、端口说明、环境变量解释、部署流程。
- 多 AI 协作没有文件锁和任务状态文档。
- `.env.example` 默认 `JWT_SECRET` 会被后端拒绝启动，且 `ALLOWED_ORIGIN=*` 与实现不匹配。

### 建议新增协作文档

- `AGENTS.md`：AI 分工、文件归属、禁止并发改同文件。
- `DEVELOPMENT_STATUS.md`：任务状态、负责人、文件范围、阻塞点。
- `CHANGELOG_AI.md`：每次 AI 修改摘要和验证结果。

## 10. 功能开发总清单

### A. 先修稳定性和安全

| 任务 | 目标 | 文件 | 风险 | 负责人建议 |
|---|---|---|---|---|
| 修复支付 userId bug | 统一 `req.user.userId` | `routes/payment.js` | 高 | 已完成 |
| 密码哈希改造 | web 登录改 scrypt 哈希并兼容旧明文 | `routes/users.js` | 高 | 已完成 |
| Webhook 强制签名 | 必须配置 `WEBHOOK_SECRET` | `routes/webhook.js`、`.env.example` | 高 | 已完成 |
| 后台上传安全补齐 | banner 上传加入 magic bytes | `routes/admin.js` | 中 | 已完成 |
| 支付金额校验 | 回调校验订单金额 | `routes/payment.js` | 高 | 已完成 |

### B. 统一接口和数据源

| 任务 | 目标 | 文件 | 风险 | 负责人建议 |
|---|---|---|---|---|
| 简历 API 去重 | 保留一个主入口 | `routes/users.js`、`routes/resumes.js`、`utils/api-resumes.js` | 中 | AI2 设计，AI1 实施 |
| 职位数据源决策 | JSON 与 SQLite 二选一或明确边界 | `routes/jobs.js`、`routes/admin.js`、`db/database.js` | 高 | Human 决策 |
| 响应格式统一 | 建立 `{code,message,data}` 或明确例外 | `routes/*`、`utils/api-client.js` | 中 | AI2 规范，AI1 分批 |
| 直接 wx.request 迁移 | 页面统一走 `api-client.js` | 多个页面 | 中 | AI1 分页面并行 |

### C. AI 功能专项

| 任务 | 目标 | 文件 | 风险 | 负责人建议 |
|---|---|---|---|---|
| AI JSON schema 校验 | 防止模型输出异常导致页面崩溃 | `routes/ai.js` | 中 | AI1 |
| AI 错误码统一 | 余额不足、超时、限流、解析失败统一 | `routes/ai.js`、`utils/api-ai.js` | 中 | AI1 |
| AI 历史持久化 | 当前多处依赖本地历史，补服务端历史 | 新 route/table 或现有消息表 | 高 | Human 定产品范围 |
| AI 面试报告真实数据化 | 减少 `ai-report` mock 依赖 | `pages/ai-report`、后端接口 | 中 | AI1 |
| AI 功能会员边界 | 明确免费次数/VIP 权限 | `utils/vip.js`、AI 页面、后端限流 | 中 | Human + AI2 |

### D. 小程序体验优化

| 任务 | 目标 | 文件 | 风险 | 负责人建议 |
|---|---|---|---|---|
| 首页信息架构复盘 | 明确主路径：简历、找岗、面试、投递 | `pages/index` | 中 | AI2 方案，AI1 实施 |
| 职位页性能优化 | 降低重复请求、筛选状态清晰 | `pages/jobs`、`api-jobs.js` | 中 | AI1 |
| 简历页拆分 | 降低 `resume.js/wxml/wxss` 复杂度 | `pages/resume` | 中高 | AI1 分步 |
| 薪资页拆分 | 处理 1460 行 WXSS 和复杂状态 | `pages/salary` | 中 | AI1 |
| AI 助手体验验收 | SSE、历史、快捷操作、失败重试 | `pages/ai-assistant` | 中 | AI1 + Human |

### E. 后台管理优化

| 任务 | 目标 | 文件 | 风险 | 负责人建议 |
|---|---|---|---|---|
| 拆分 admin route | 40 个接口拆模块 | `routes/admin.js` | 中高 | AI1 分批 |
| 管理后台操作日志 | 记录删除、更新、上传 | `routes/admin.js`、新表 | 中 | Human 定范围 |
| 后台表单校验统一 | 减少脏数据 | `admin/*.html`、`admin/js/common.js` | 中 | AI1 |
| 后台错误处理统一 | 已有基础，继续统一空态/loading | `admin/js/common.js` | 低 | AI1 |

### F. 工程化和测试

| 任务 | 目标 | 文件 | 风险 | 负责人建议 |
|---|---|---|---|---|
| 添加后端 smoke tests | 覆盖核心 API | `tests/`、`package.json` | 低 | AI1 |
| 添加 GitHub Actions | push 后跑测试 | `.github/workflows/*` | 低 | AI1 |
| 添加 lint/format | 统一代码风格 | `package.json`、配置文件 | 低 | AI1 |
| 完善 README | 启动、部署、环境变量、协作 | `README.md` | 低 | AI2 |
| 建立 AI 协作文档 | 三个 AI 分工和文件锁 | `AGENTS.md`、`DEVELOPMENT_STATUS.md` | 低 | AI2 + Human |

## 11. 推荐并行开发分工

### AI1（Builder）

- 修复支付 `req.user.id` bug。
- 后台上传 magic bytes。
- 新增 smoke tests。
- 分页面迁移直接 `wx.request`。
- 分批拆超长 WXSS。

### AI2（Reviewer / Planner）

- 设计简历 API 合并方案。
- 设计职位数据源统一方案。
- 审查 AI JSON schema 和错误码规范。
- 维护 `DEVELOPMENT_STATUS.md`。
- Review AI1 的高风险改动。

### Human

- 决策支付上线策略、密码迁移策略、职位数据源主线。
- 验收微信支付、登录、AI 计费/VIP 权限。
- 最终确认 UI/业务流程。

## 12. 建议执行顺序

1. P0 修复：支付 userId、密码哈希、Webhook secret、后台上传校验。
2. 补测试：health、auth、payment mock、upload、核心列表。
3. API 去重：简历 API、统一响应格式、直接请求迁移。
4. 数据源治理：职位 JSON vs SQLite。
5. AI 功能治理：schema、错误码、历史持久化、会员边界。
6. UI/DX：超长样式拆分、README、CI、协作文档。
