# 职引 Career Platform（求职小程序）

> 本文档是项目长期上下文的主入口。最后核对：2026-09-03。  
> 事实优先级：当前代码与 `git status` > 自动化测试结果 > `DEVELOPMENT_STATUS.md` > 其他历史文档。  
> 唯一主项目：`D:\ChatGPT-Projects\求职小程序\jobapp-server`。

## 1. 项目定位

职引是面向北美 STEM 留学生和国际学生的微信求职小程序，配套 Node.js 后端及运营管理后台。产品不是单纯的职位信息流，而是覆盖“画像—岗位判断—申请材料—进度管理—面试准备—复盘提升”的 AI 求职工作台。

当前主线为 V4/4.0 开发分支 `codex/v4-development`。核心业务代码已形成闭环，阶段判断为“V4 内测/灰度前收口”，不是正式全量运营完成态。主要剩余工作集中在发布安全、真实设备验收、生产配置、监控和支付，而不是重新开发基础页面。

## 2. 用户与业务场景

主要用户：

- 在美国、加拿大等地区求职的留学生，尤其是 STEM、新毕业生和早期职业人群。
- 需要判断 OPT/STEM OPT/H1B Sponsor 等资格匹配的用户。
- 需要管理多个岗位、简历版本、申请文案、面试任务和截止提醒的用户。
- 运营人员：维护职位、企业、校招、内容、Banner、会员、Sponsor 和 UGC 审核。

用户核心场景：

```text
登录/游客浏览
→ 完善教育、签证、技能与求职画像
→ 搜索职位/查看校招/浏览企业
→ 查看 Sponsor 与三维岗位匹配
→ 收藏或加入求职进度
→ 选择简历版本并生成申请文案
→ 跟踪 OA、面试、Offer 等状态
→ 使用 AI Agent、模拟面试和 Today 任务补强
→ 完成投递与复盘
```

其他业务流程：

- 内容与 UGC：浏览面经/资讯/题库 → 用户提交 → `pending` → 后台人工审核 → `approved/rejected`。
- 校招运营：飞书 Base 同步 → SQLite `campus_schedules` → 后端 API → 首页/资源中心/校招详情 → 截止提醒。
- 运营管理：管理员登录 → 分权限管理内容、用户、会员、开关、Sponsor、分享配置 → 记录审核或业务状态。

## 3. 当前开发阶段

- 产品阶段：V4 内测及灰度前收口。
- 当前分支：`codex/v4-development`；Sprint 1 代码提交截至 `a9b92a6`，最终 HEAD 以 `git log -1` 为准。
- 自动化基线（2026-09-03）：`npm run check:release` 通过，137/137 tests 通过，小程序静态/分包检查通过，媒体总量 191.2 KB，数据内容 Errors 0、Warnings 4。
- V4 数据迁移：本地 dry-run 显示 users/jobs/applications `pending=0`。
- V4 灰度：本地状态 `0% / paused`。
- E2E 静态预检：4/4 通过。真实开发者工具 E2E 根据 Human 决定暂停且不再默认运行；微信开发者工具人工预览正常，登录、文件选择、订阅消息和支付仍需真机人工验收。
- 严格运行时预检：仓库已具备环境矩阵、启动变量校验和 readiness 门禁；生产通过证据仍需在真实服务器由授权人员生成。`REAL_PAYMENT_LAUNCH_APPROVED=false` 继续保持。
- Sprint 0 恢复出的工作区已完成拆分提交；仓库未推送、未部署，生产切流和回滚演练未执行。

完成度估算约 78%。估算按十类能力等权评估：账号与画像、职位匹配、申请 CRM、简历与材料、面试与 AI、内容与校招、运营后台、会员支付、数据与监控、发布运维。前七项多为 80%–95%，支付和发布运维约 50%–65%，因此整体不是按页面数量简单计算。

## 4. 技术架构

| 层级 | 当前方案 |
|---|---|
| 小程序前端 | 微信原生小程序，JavaScript/CommonJS、WXML、WXSS，自定义 TabBar，主包 + 5 个业务分包 + skills 目录 |
| UI | 自研组件为主，仓库仍包含 `tdesign-miniprogram` 构建依赖/产物 |
| 状态 | `App.globalData`、`wxStorage`、页面本地状态；没有独立 Store 框架 |
| API 客户端 | `miniprogram/utils/api-client.js` + `api-*.js`，含 Token、缓存、去重、超时和部分降级；仍有少量直接 `wx.request/wx.uploadFile` |
| 后端 | Node.js、Express 4、CommonJS |
| 数据库 | SQLite + `better-sqlite3`，WAL；启动建表/补字段，V4 有幂等 schema 和独立迁移/回滚脚本 |
| 本地职位数据 | `data/jobs.json` 是唯一的本地职位数据源；另有外部实时和聚合数据源 |
| AI | 统一 OpenAI-compatible Chat Completions 客户端；支持火山方舟/豆包和 DeepSeek，超时重试、JSON 校验、脱敏与规则降级 |
| 后台 | 原生 HTML/CSS/JS，由 Express 提供 `/admin` 静态页面和 `/admin/api/*` |
| 文件 | 本地 `uploads/`，生产通过 `UPLOAD_DIR` 外置；尚未接对象存储 |
| 搜索 | JSON/SQLite 查询及外部职位源，没有独立 Elasticsearch/FTS 服务 |
| 自动化 | Node 测试、发布检查、微信开发者工具 E2E、GitHub Actions、cron、飞书同步、提醒派发、备份脚本 |
| 部署 | 腾讯云/Linux + Node 20 + PM2 + Nginx + HTTPS；仓库统一使用 4400、不可变版本目录、`current` 软链接和共享数据目录，实际服务器切换待 Human |
| 缓存 | 小程序内存 + wxStorage 缓存；后端主要为进程内缓存/SQLite，没有 Redis |

## 5. 项目目录

```text
jobapp-server/
├── admin/                 原生运营管理后台页面、样式和脚本
├── data/                  jobs.json 等本地业务数据
├── db/                    SQLite 连接、基础 Schema、V4 Schema、种子和格式化
├── docs/                  产品、API、V4、上线、验收、运维文档
├── middleware/            用户/管理员/内部任务鉴权和限流
├── miniprogram/           微信小程序唯一源码目录
│   ├── pages/             10 个主包页面
│   ├── package-ai/        AI、面试、日报、材料等页面
│   ├── package-career/    简历、规划、薪资、OA 等职业工具
│   ├── package-content/   面经、资讯、校招详情等内容页
│   ├── package-agency/    机构详情与对比
│   ├── package-user/      用户、企业、职位详情、申请等页面
│   ├── components/        公共组件
│   ├── behaviors/         登录门禁等共享行为
│   └── utils/             API、导航、缓存、匹配和本地工作台工具
├── routes/                旧版及通用 Express API
│   └── v4/                V4 画像、匹配、CRM、材料、面试、Agent、会员
├── services/              AI、企业导入及 V4 领域服务
├── scripts/               检查、E2E、同步、迁移、灰度、备份与运维脚本
├── tests/                 Node 测试；`all.test.js` 为统一入口
├── utils/                 后端公共能力
├── server.js              后端唯一正式入口
├── package.json           依赖与命令入口
├── AGENTS.md              多 AI 协作和唯一仓库规则
├── DEVELOPMENT_STATUS.md  现有详细开发状态流水
└── .env.example           仅记录变量名和安全示例，不得放真实密钥
```

不属于开发入口：

- 原 `jobapp-server-main-deploy` 部署工作树已于 2026-09-03 正确注销；分支 `codex/deploy-feishu-main` 保留。
- 原 `求职小程序_旧备份_20260610`、`banner-optimize` 和 `miniprogram_before_unify_20260514` 已于 2026-09-03 归档后送入回收站；归档位于 `D:\ChatGPT-Projects\求职小程序\archives\cleanup-20260903\`。
- 主仓内 `miniprogram_before_unify_*`：统一前备份，已在 `.gitignore` 规则中排除。

## 6. 核心业务模块

| 模块 | 状态 | 已实现 | 主要入口 |
|---|---|---|---|
| 登录、账户与资料 | 🟡 部分完成 | 微信登录、手机号登录、邮箱验证码、网页注册/登录、Token、资料维护、注销/数据删除、统一登录弹层 | `routes/users.js`、`middleware/auth.js`、`miniprogram/components/c-login-popup`、`package-user/pages/profile-edit` |
| V4 求职画像 | ✅ 已完成 | 教育、毕业、地区、签证/授权、Sponsor 需求、岗位/行业/技能、完成度 | `db/v4Schema.js`、`services/v4Profile.js`、`routes/v4/profile.js` |
| 职位与搜索 | 🟡 部分完成 | 本地/实时多源职位、搜索、筛选、地图、详情、推荐、统一职位卡片 | `routes/jobs.js`、`routes/aggregate.js`、`utils/jobData.js`、`pages/jobs`、`package-user/pages/job-detail` |
| Sponsor 与匹配 | ✅ 已完成 | OPT/STEM/H1B/Citizen 规则、证据、三维评分、缓存、批量重算、后台审核 | `services/v4Sponsor.js`、`services/v4JobMatch*.js`、`routes/v4/jobs.js`、`admin/sponsor-profiles.html` |
| 求职进度/申请 CRM | ✅ 已完成 | 看板、合法状态机、历史、联系人、任务、截止/面试时间、离线兼容 | `routes/applications.js`、`routes/v4/applications.js`、`pages/applications`、`package-user/pages/application-detail` |
| 简历中心 | 🟡 部分完成 | 在线/PDF 简历、经历库、多类型简历、不可变版本、对比恢复、岗位关联、AI 建议确认 | `routes/resumes.js`、`routes/v4/resumes.js`、`services/v4ResumeCenter.js`、`package-career/pages/resume*` |
| 申请文案库 | 🟡 部分完成 | Cover Letter、Recruiter 消息、Follow-up、确认后保存、额度；当前未提交改动正在收窄旧“申请材料库”语义 | `routes/career-assets.js`、`routes/v4/materials.js`、`package-ai/pages/application-materials` |
| AI Career / 职业规划 | 🟡 部分完成 | 四 Agent、上下文、任务状态机、写操作确认、脱敏、AI/规则降级、可执行职业计划 | `routes/ai.js`、`routes/v4/agents.js`、`services/v4Agents.js`、`services/careerPlanGenerator.js`、`pages/ai-career` |
| 模拟面试 | 🟡 部分完成 | 面试空间、会话、回答、四维评分、报告、趋势、Today 补强；真实模型质量与真机仍需验收 | `routes/v4/interviews.js`、`services/v4Interview.js`、`package-ai/pages/interview-*` |
| Today/日报/提醒 | 🟡 部分完成 | 本地与服务端任务合并、日报、收藏截止提醒、校招提醒、订阅消息、派发幂等 | `routes/v4/today.js`、`routes/notify.js`、`services/v4TodayTasks.js`、`pages/index`、`package-ai/pages/daily-brief` |
| 校招/企业/资源 | ✅ 已完成 | 飞书校招同步、企业库、资源中心、资讯、签证与帮助内容、薪资/OA/题库等 | `routes/campus.js`、`routes/companies.js`、`routes/content.js`、`pages/resources` |
| 面经、评论与机构 UGC | ✅ 已完成 | 面经/评论/回复/机构评价、点赞、发布前人工审核、审核日志 | `routes/experiences.js`、`routes/comments.js`、`routes/agencies.js`、`admin/*` |
| 会员与支付 | 🟡 部分完成 | 套餐、配额、订单、Mock、虚拟支付回调结构、VIP 到期；真实支付仍受双开关和资质控制 | `routes/payment.js`、`routes/v4/membership.js`、`services/v4Membership.js`、`package-user/pages/vip` |
| 管理后台 | 🟡 部分完成 | 用户、会员、职位、企业、校招、UGC、Banner、公告、功能开关、分享、Sponsor 等 | `admin/`、`routes/admin.js`、`routes/v4-admin.js` |
| 埋点与运营监控 | 🟡 部分完成 | analytics、错误/性能表、漏斗/留存/AI 使用/慢请求看板；外部告警未配置 | `routes/analytics.js`、`services/v4Analytics.js`、`routes/v4-admin.js` |
| 发布与运维 | 🟡 仓库侧完成 | Node 20、4400、不可变版本、共享数据、备份、候选 readiness、自动恢复旧软链接及手动 Actions 已统一；服务器演练待执行 | `.github/workflows`、`scripts/`、`ecosystem.config.cjs`、`nginx.conf` |

## 7. 已完成功能

- 61 个已注册小程序页面均具备 `.js/.json/.wxml/.wxss` 四件套。
- 自定义五项主导航：首页、资源、进度、AI 专家、我的。
- V4 求职画像、Sponsor 情报、岗位三层匹配及申请状态机。
- 简历不可变版本、AI 修改逐条确认和申请文案确认保存机制。
- 面试空间、训练记录、报告、趋势和 Today 补强任务的数据闭环。
- UGC 发布前审核、后台审核与审核日志。
- 登录门禁、密码哈希、上传魔数校验、Webhook 强制签名等已记录的安全修复。
- 功能开关、V4 灰度脚本、幂等迁移和受保护回滚。
- 137 项自动化测试、发布静态检查、数据内容检查和 E2E 静态预检。

## 8. 部分完成功能

- 真实 AI：代码可调用方舟/DeepSeek，已有历史真实 DeepSeek 验证记录；但供应商 429/5xx/断网演练、全功能质量抽检和生产成本监控未闭环。
- 支付：订单与虚拟支付结构存在，真实支付必须在资质确认和 `REAL_PAYMENT_LAUNCH_APPROVED` 放行后单独验收。
- 端到端验收：真实 E2E 已按 Human 决定暂停且不作为默认门禁；微信授权、文件选择、订阅消息、虚拟支付弹层仍需真机手测。
- 监控：内部慢请求与错误表存在，尚无正式的外部告警渠道。
- API 统一：大部分页面使用统一客户端，但简历、首页、收藏、AI 流式/上传等仍有直接网络调用。
- 数据库迁移：V4 有脚本，基础 Schema 仍大量依赖启动时 DDL，未落地统一 `schema_migrations`。

## 9. 未开发功能

- 独立对象存储、CDN 上传治理。
- 正式外部错误告警/值班通知渠道。
- 完整通用 migration runner 和 `schema_migrations` 基线。
- 生产级搜索服务或 SQLite FTS（当前规模未必需要）。
- 经资质审核后的真实支付退款实操和全量灰度。

明确暂缓：泛社区、社交关系、Offer 概率预测、复杂通用测评、无求职价值的通用 AI 扩张。

## 10. 数据模型

### 账号与资料

- `users`：登录主体、联系方式、教育/偏好兼容字段、VIP；与简历、申请、UGC、提醒等一对多。
- `user_profiles`：V4 标准画像，主键即 `user_id`；保存签证、Sponsor、目标岗位、技能和完成度。
- `resumes`、`resume_pdfs`：在线简历和 PDF 文件元数据。
- `career_experience_library`、`resume_versions_v4`、`resume_job_links`、`resume_ai_change_sets`：经历、不可变版本、岗位/申请关联和 AI 修改确认。

### 岗位与申请

- 本地岗位正文：`data/jobs.json`，不是 SQLite `jobs` 表。
- `aggregated_jobs`、`cron_logs`：多源职位聚合及任务日志。
- `job_sponsor_profiles`、`job_sponsor_history`：Sponsor 结论、证据与审计。
- `job_matches`：用户—岗位匹配快照、资格、分数、差距和行动建议。
- `applications`：用户申请主记录，兼容旧字段并扩展 V4 状态/截止/下一步。
- `application_history`、`application_contacts`、`application_tasks`：状态历史、联系人和下一步任务。
- `application_materials`、`ai_application_material_drafts`、`jd_match_reports`：正式文案、AI 草稿和 JD 匹配报告。

### 面试、任务和 AI

- `interview_spaces_v4`、`interview_sessions_v4`、`interview_answers_v4`、`interview_reports_v4`：岗位面试空间至报告闭环。
- `today_tasks_v4`、`daily_briefs`：服务端 Today 任务与日报。
- `ai_agent_tasks_v4`、`ai_usage`、`quota_usage_v4`：Agent 状态、旧 AI 次数和 V4 配额。

### 内容和运营

- `experiences`、`comments`、`comment_replies`、`agency_reviews`：UGC。
- `content_moderation_logs`：UGC 审核审计。
- `agencies`、`companies`、`company_aliases`、`company_sync_logs`：机构与企业资料。
- `campus_schedules`、`interview_questions`、`star_templates`、`announcements`、`banners`、`share_configs`：运营内容。
- `favorites`、`messages`、`job_reminders`、`feedbacks`：用户互动和通知。
- `feature_flags`、`rollout_config_v4`：功能开关及灰度。
- `analytics_events`、`error_events_v4`、`api_performance_v4`：埋点、错误和性能。
- `admin_accounts`：后台账号、角色和模块权限。

### 商业化

- `orders`：旧/通用订单、支付渠道、回调原文和支付状态；目前仍由 `routes/payment.js` 动态建表。
- `membership_plans_v4`、`user_subscriptions_v4`、`payment_refunds_v4`：V4 套餐、订阅和退款状态。

## 11. API 与第三方服务

### 内部 API

- `/api/users`：登录、资料、账户删除、旧简历兼容入口。
- `/api/jobs`、`/api/aggregate`、`/api/apply`：职位、聚合和投递。
- `/api/applications`、`/api/resumes`、`/api/career-assets`：旧/通用求职业务。
- `/api/v4/*`：profile、jobs、applications、resumes、materials、interviews、today、agents、membership。
- `/api/ai`、`/api/asr`：旧 AI、职业规划、ATS、Networking、语音转写。
- `/api/experiences`、`/api/comments`、`/api/agencies`：UGC。
- `/api/campus`、`/api/companies`、`/api/content`、`/api/news`：内容与资源。
- `/api/notify`、`/api/payment`、`/api/analytics`：通知、支付和埋点。
- `/admin/api/*`、`/admin/api/v4/*`：运营后台。
- `/api/health`、`/api/health/live`、`/api/health/ready`：运维探针。

### 外部服务

| 服务 | 用途 | 主要调用位置 | 配置变量 | 状态 |
|---|---|---|---|---|
| 微信开放接口 | code2session、手机号、订阅消息 | `routes/users.js`、`routes/notify.js` | `WX_APP_ID`、`WX_APP_SECRET`、`WX_TPL_*` | 已接入，真机需持续验收 |
| 微信虚拟支付/JSAPI | 会员订单与回调 | `routes/payment.js`、`utils/configure_wxpay_env.js` | `PAYMENT_*`、`VIRTUAL_PAY_*`、`WXPAY_*` | 代码已接，正式放行受控 |
| 火山方舟/豆包 | V4/通用 AI | `utils/aiClient.js`、`services/v4AiRuntime.js` | `AI_PROVIDER`、`ARK_API_KEY` 等 | 可用，需异常演练 |
| DeepSeek | 兼容 AI 提供商 | 同上及 `routes/ai.js` | `DEEPSEEK_API_KEY`、`DEEPSEEK_API_URL` | 有真实验证记录 |
| 飞书 Base/内容 API | 校招、企业和人工内容同步 | `scripts/sync_feishu_server.js`、`services/feishuCompanyImport.js`、小程序 `api-feishu-content.js` | `FEISHU_*` | 校招生产同步有验证记录 |
| RapidAPI/JSearch/LinkedIn/Indeed | 实时职位和公司数据 | `routes/jobs.js`、`routes/glassdoor.js` | `RAPID_API_*`、各 host | 按配置/订阅可用 |
| Adzuna、RemoteOK、The Muse | 免费/补充职位源 | `routes/jobs.js`、`routes/news.js` | `ADZUNA_*` 等 | 有降级链路 |
| RSS/公开资讯源 | 求职资讯 | `routes/news.js` | `OFFICIAL_NEWS_*`、`NEWS_RSS_ENABLED` | 已接入 |
| LeetCode GraphQL | 编程题库 | `miniprogram/utils/api-leetcode.js` | 小程序公开 URL | 小程序直连 |
| 腾讯 ASR | 语音转写 | `routes/asr.js` | `TENCENT_ASR_*` | 未配置时仅开发降级 |
| 腾讯短信 | 验证/通知预留 | `services/sms.js` | `TENCENT_SMS_*` | 生产配置待确认 |
| SMTP | 邮箱验证码/邮件 | `services/email.js` | `SMTP_*` | 未配置时仅开发兜底 |
| GitHub Actions/Webhook | CI 与部署 | `.github/workflows`、`routes/webhook.js` | GitHub Secrets、`WEBHOOK_SECRET` | 仓库已统一为手动生产发布，服务器执行待 Human |
| n8n | 自动化工作流预留 | `.github/workflows/deploy-n8n.yml`、`docs/n8n-*.json` | GitHub Environment Secrets/Variables | 仓库已移除明文默认密码；凭据轮换待 Human |

所有文档只能记录变量名，禁止写入真实 Key、Token、密码或证书内容。

## 12. 关键技术决策

- 唯一主仓：后端、后台、小程序都在 `jobapp-server`；历史原因未完整记录，但 `AGENTS.md` 明确禁止在副本开发。
- 原生小程序：当前采用 WXML/WXSS/JS + CommonJS，历史选择原因未记录，不应在收口阶段擅自迁移框架。
- SQLite：保留单机部署和低运维成本；V4 迁移保持幂等，正式回滚必须显式确认。
- 本地职位单一来源：`data/jobs.json` 是唯一的本地职位数据源，停止 SQLite `jobs` 双轨。
- API 响应：新增普通业务接口应使用 `{ code, message, data }`；支付、健康检查、Webhook、SSE 和部分旧 AI/新闻接口是明确例外。
- 网络调用：页面原则上不直接 `wx.request`，通过 `api-*.js` 与 `api-client.js`；上传/流式/公开第三方接口存在受控例外。
- AI 写入安全：AI 只生成草稿/建议；写申请或 Today 任务必须有用户确认令牌；简历修改必须生成新版本，不覆盖原文。
- AI 故障策略：敏感字段脱敏，JSON/schema 校验，有限重试，失败回落到确定性规则。
- 演示数据：生产 `ENABLE_DEMO_FALLBACK=false`；mock fixture 可留作开发测试，但不能成为生产主链路。
- 支付：Mock 仅限非生产；真实支付必须同时通过配置、资质和 `REAL_PAYMENT_LAUNCH_APPROVED`。
- UGC：所有公开 UGC 默认 `pending`，人工批准后才公开。
- 功能发布：数据库功能开关 + V4 0/5/20/50/100 灰度；高风险链路不与普通重构混合。

## 13. 开发规范

1. 先读 `PROJECT_CONTEXT.md`、`HANDOFF.md`、`TODO.md`、最新 `DEVELOPMENT_LOG.md`、`AGENTS.md` 和 `DEVELOPMENT_STATUS.md`。
2. 开发、测试、微信预览、提交、部署只从唯一主项目执行。
3. 修改前查看 `git status --short --branch`；当前工作区不干净时先确认文件归属，不得 reset、checkout 或覆盖。
4. 高风险链路：登录、支付、Webhook、上传、鉴权、数据库迁移。必须单任务、列风险、列验证和回滚。
5. 页面网络请求优先经 `miniprogram/utils/api-*.js`；新增后端 API 默认标准响应。
6. 业务字段后端用 snake_case，API/小程序展示多为 camelCase，统一经 formatter/adapter 转换。
7. 不把真实密钥、数据库、uploads、微信私有配置、证书提交到 Git。
8. 后端/公共逻辑修改至少运行 `npm test`；发布候选运行 `npm run check:release`；V4 数据修改先 dry-run。
9. 大任务完成后追加 `DEVELOPMENT_LOG.md`、同步 `TODO.md`；架构/数据/第三方变更再更新本文件；阶段结束更新 `HANDOFF.md`。

## 14. 已知问题

### P0

- 仓库发布基线尚未在真实服务器执行候选 readiness、`current` 切换和自动回滚演练。
- n8n 已改用 GitHub Environment Secret，但已暴露凭据的轮换和旧 Actions 日志评估仍需 Human 权限。
- 真机登录、上传/文件选择、订阅消息和虚拟支付不可用状态验收尚未完成；真实 E2E 根据 Human 决定暂停且非默认。

### P1

- 仓库已完成环境矩阵和严格预检门禁；真实 production 变量下的通过记录仍需授权人员生成，支付放行开关继续关闭。
- 外部 AI 的 429、5xx、超时、断网演练及成本/质量验收未闭环。
- `check:v4-ops` 记录提醒派发约 2.1 秒，超过 800ms 阈值；另有一个 GET 样本约 1.4 秒。
- 外部错误告警尚未正式配置，当前主要依赖数据库看板和日志。
- 基础数据库仍使用启动 DDL；`orders`、聚合、OA 等表仍在业务路由建表。
- `routes/admin.js` 超过 63 KB，职责过多。
- 多处直接 `wx.request/wx.uploadFile`，错误和登录过期处理存在分叉。
- 历史 V4 文档里部分“未接真实 AI”结论已被 8 月代码/验证更新，后续仍需分批校准。

### P2/P3

- 小程序主要依赖 `globalData + wxStorage`，跨页面状态和迁移成本较高。
- 当前本地文件存储、SQLite 和进程内缓存适合现阶段，规模增长后需评估对象存储、外部监控、备份恢复演练和搜索索引。
- `smoke.test.js` 体积较大，后续可按业务域拆分以降低维护成本。

## 15. 当前版本状态

- 代码版本：V4/4.0 开发线；Sprint 1 代码提交截至 `a9b92a6`，最终 HEAD 以 Git 为准。
- Git 跟踪：本地分支领先远端；Sprint 1 尚未推送、未部署。
- 包体：主包约 1.01 MB；skills 0.09 MB；AI 0.46 MB；career 0.46 MB；content 0.22 MB；agency 0.08 MB；user 0.58 MB；编译媒体总量 191.2 KB。
- 测试：137/137 通过；发布检查通过；内容 Errors 0、Warnings 4。
- 生产：`docs/PRODUCTION_READINESS_AND_MONITORING.md` 记录 2026-07-27 曾将提交 `5d7f7c5` 部署到 4400 并通过公网冒烟；8 月状态文档另有生产校招和 AI 验证记录。当前生产准确 commit 和配置仍需重新采集确认。

## 16. 下一阶段目标

### 下一阶段：数据闭环与质量基线

- 统一用户画像、简历、岗位、申请、面试和 Today 的关联 ID 与状态口径。
- 明确职位/校招来源、更新时间、过期规则与失败降级。
- 校验核心漏斗埋点并排除测试数据。
- 建立 AI 匿名化样本、异常演练和质量/成本基线。
- 建立数据库 migration baseline 与恢复演练方案。

上线前 Human 任务：服务器发布/回滚演练、n8n 凭据轮换、production 严格预检和真机高风险链路验收。

### 第二阶段：体验与生产验证

- 完成 AI 异常演练、质量抽检和成本监控。
- 优化提醒派发慢请求，验证跨设备任务和收藏提醒。
- 配置外部告警，校验真实留存、漏斗和 AI 使用数据。
- 分批治理直接请求和后台 God Route。

### 第三阶段：商业化与可扩展性

- 资质确认后单独完成真实支付/退款/灰度。
- 落地统一数据库 migration runner 和恢复演练。
- 按真实规模评估对象存储、FTS/搜索服务、Redis 和数据库升级，不提前过度建设。

## 17. AI 接手本项目必须知道的事项

- 只在 `jobapp-server` 工作，忽略部署镜像和旧备份。
- 本地分支包含尚未推送的 Sprint 1 提交，未经授权不得重写或丢弃。
- 历史文档中的“已完成”可能只代表代码完成；生产、E2E、真机和灰度状态必须分别核验。
- 当前最危险的不是业务页面缺失，而是仓库方案尚未在生产演练、凭据尚未轮换和真机发布验收不完整。
- 支付放行需要 Human 决策；不得自行开启 `REAL_PAYMENT_LAUNCH_APPROVED` 或真实支付。
- 不读取、复制或写入 `.env` 的值；只使用变量名做文档和检查。
- 任何数据库正式迁移、V4 灰度放量、生产写入、真实支付或凭据轮换都需明确授权与备份。
