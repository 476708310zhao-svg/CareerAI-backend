# Development TODO

> 最后整理：2026-09-04。状态以勾选框和每个任务正文为准。优先保证可安全发布和核心链路真实跑通。

## P0

- [x] Sprint 2.1 统一核心实体引用与状态契约
- [x] Sprint 2.2 统一职位/校招来源、新鲜度、过期和失败降级
- [x] TASK-001 审查并收口当前未提交工作区
- [ ] TASK-002 统一生产发布架构与端口/目录配置（仓库完成，服务器演练待 Human）
- [ ] TASK-003 修复 n8n 部署凭据暴露并轮换凭据（仓库完成，轮换待 Human）
- [ ] TASK-004 建立可审计的严格运行时预检（代码完成，生产证据待 Human）
- [ ] TASK-005 完成真机高风险链路验收（真实 E2E 非默认/暂停）

## P1

- [ ] TASK-006 完成真实 AI 供应商异常演练和质量门禁
- [ ] TASK-007 优化提醒派发慢请求并验证幂等
- [ ] TASK-008 配置生产外部错误告警和发布监控
- [ ] TASK-009 验证跨设备 Today/收藏/校招提醒一致性
- [ ] TASK-010 落地统一数据库 migration 基线机制
- [ ] TASK-011 分批迁移非必要的直接小程序网络请求
- [ ] TASK-012 校准过期状态文档并确认生产真实版本

## P2

- [ ] TASK-013 拆分后台 God Route 和超大 smoke test
- [ ] TASK-014 增加管理员关键操作审计与数据导出策略
- [ ] TASK-015 真实业务数据校验留存、申请漏斗与 AI 使用率
- [ ] TASK-016 到期评估并下线旧简历兼容 API
- [ ] TASK-017 在资质确认后单独完成真实支付与退款灰度

## P3

- [ ] TASK-018 根据真实规模评估对象存储、FTS/搜索和 Redis
- [ ] TASK-019 评估小程序跨页面状态层与本地数据迁移规范

---

# 当前 Sprint

目标：建立可追踪、可解释、可迁移的数据闭环与 AI 质量基线。

任务：

- [x] Sprint 2.1 核心实体 `refs`、canonical Job ID 与状态契约
- [x] Sprint 2.2 职位/校招来源、新鲜度、过期和失败降级
- [x] Sprint 2.3 求职漏斗埋点校验与测试数据隔离
- [ ] Sprint 2.4 AI 匿名化异常样本集与安全质量门禁
- [ ] Sprint 2.5 数据库 migration baseline、备份与恢复演练

---

## TASK-001

任务：审查并收口当前未提交工作区  
优先级：P0  
状态：已完成（2026-09-03）  
所属模块：Git/发布治理

背景：当前有 46 个修改文件和 3 个未跟踪文件，覆盖登录限流、校招同步、申请文案、AI 提示、部署与测试；直接继续开发可能覆盖已有工作或把无关改动混发。

需要完成：

1. 逐文件审查 diff，按“校招同步”“申请文案”“登录/限流”“AI 提示/UI”“测试/发布”分组。
2. 确认每组的产品意图、负责人和验证证据；清除 `DEVELOPMENT_STATUS.md` 中已完成但仍标占用的过期记录。
3. 每组分别运行相关测试，形成独立提交；不使用 reset/checkout 丢弃任何用户改动。
4. 提交前运行密钥扫描和 `npm run check:release`。

涉及文件：

- `git status` 当前列出的 46 个修改文件
- `scripts/merge-campus-env.js`
- `tests/adminLoginRateLimit.test.js`
- `tests/campusContent.test.js`

完成标准：

- [x] 每个现有改动都有明确归属和变更说明
- [x] 每个提交只包含一个可验证主题
- [x] `npm run check:release` 通过
- [x] 工作区仅保留本次项目记忆文档，提交后为干净状态

依赖：需要产品/开发者确认未提交改动是否均应保留。  
风险：错误清理会永久丢失尚未提交的有效成果。

## TASK-002

任务：统一生产发布架构与端口/目录配置  
优先级：P0  
状态：仓库侧完成；服务器真实切流/回滚演练待 Human  
所属模块：部署/运维

背景：生产记录使用版本目录和 4400，仓库 PM2、Nginx、deploy 脚本和 GitHub Actions仍含 3001、Node 18和固定目录；`main` push 会自动部署。

需要完成：

1. 以当前真实生产架构为准确认端口、运行目录、Node 版本、PM2 名称、Nginx upstream 和数据目录。
2. 统一 `.github/workflows/deploy.yml`、`ecosystem.config.cjs`、`nginx.conf`、`deploy.sh` 和 `docs/production-deploy.md`。
3. 部署前执行备份、`npm ci`、`npm run check:release`、migration dry-run 和严格 preflight。
4. 采用新版本目录启动、readiness 通过后切流，并保留一键回滚到上个版本。
5. 验证 campus cron 和 reminder cron 都在统一版本下运行。

涉及文件：

- `.github/workflows/deploy.yml`
- `ecosystem.config.cjs`
- `nginx.conf`
- `deploy.sh`
- `docs/production-deploy.md`
- `docs/PRODUCTION_READINESS_AND_MONITORING.md`

完成标准：

- [x] 所有仓库配置只描述一个端口、一个运行目录策略和一个 Node 主版本
- [ ] staging 新端口 readiness 返回 200 后才允许切流
- [x] 数据/上传目录不随 release 被覆盖
- [ ] 回滚演练成功且文档可复现
- [x] `main` push 不会部署到废弃实例

依赖：确认真实生产服务器当前状态。  
风险：错误切流可能造成 API 中断、数据库路径错用或 cron 双跑。

## TASK-003

任务：修复 n8n 部署凭据暴露并轮换凭据  
优先级：P0  
状态：仓库侧完成；新密码轮换和旧 Actions 日志评估待 Human  
所属模块：安全/CI

背景：`deploy-n8n.yml` 存在硬编码默认密码，并把输入密码打印到 Actions 日志。

需要完成：

1. 删除 workflow 中的默认密码和所有密码回显。
2. 改为必需的 GitHub Environment Secret 或服务器端 secret 文件注入。
3. 对 workflow 日志和历史运行记录进行访问控制/清理评估。
4. 轮换当前 n8n 管理密码，并确认旧密码失效。
5. 为 n8n 增加 HTTPS、访问范围和版本固定策略。

涉及文件：

- `.github/workflows/deploy-n8n.yml`

完成标准：

- [x] 仓库 workflow 不再包含或回显明文凭据
- [x] 新凭据只通过 GitHub Environment Secret 管理
- [ ] 旧凭据已轮换并失效
- [ ] n8n 入口使用 HTTPS 且访问策略已确认

依赖：GitHub 和服务器权限；凭据轮换需 Human 授权。  
风险：凭据已可能进入历史日志，单纯改文件不足以消除风险。

## TASK-004

任务：建立可审计的严格运行时预检  
优先级：P0  
状态：代码与变量矩阵完成；生产严格预检证据待 Human  
所属模块：配置/发布

背景：2026-08-21 本机严格预检因 `JWT_SECRET` 缺失和支付放行关闭而返回 not_ready；需要让环境策略明确，而不是直接开启支付。

需要完成：

1. 为 local、test、staging、production 定义变量矩阵和支付策略。
2. 在 staging/production 以不输出值的方式运行严格预检并保存结果。
3. 支付未上线时确认 `PAYMENT_ENABLED=false`；若支付启用，则由 Human 审批 `REAL_PAYMENT_LAUNCH_APPROVED`。
4. 将 preflight、readiness 和关键 API smoke 纳入部署门禁。

涉及文件：

- `.env.example`
- `utils/envValidation.js`
- `utils/runtimeReadiness.js`
- `scripts/runtime-preflight.js`
- `.github/workflows/deploy.yml`

完成标准：

- [x] 各环境变量要求有清晰矩阵
- [ ] staging/production 预检记录不暴露变量值
- [x] 支付关闭时不会因缺少支付密钥误阻塞基础服务
- [x] JWT、微信、AI、数据库和已启用支付的检查均可复现

依赖：生产变量只能由授权人员配置。  
风险：为了让检查变绿而错误放开支付是禁止行为。

## TASK-005

任务：完成真机高风险链路验收；真实 E2E 仅在 Human 明确要求时运行  
优先级：P0  
状态：真实 E2E 非默认/暂停；人工微信预览正常，真机高风险链路待 Human  
所属模块：发布验收

背景：静态预检 4/4 已通过，用户已确认微信开发者工具可正常预览。根据 Human 决定，真实 E2E 不再作为默认门禁，以节省时间和 Token；真实授权、文件选择、订阅消息和支付仍无法由 mock 完全覆盖。

需要完成：

1. 默认运行专项单测、`npm run check:release`、静态检查并记录人工微信预览结果。
2. 真机验证微信登录/手机号拒绝与授权、职位、申请、简历 PDF、订阅消息、AI、会员展示。
3. 支付未放行时验证清晰的不可用状态；已获审批时另做虚拟支付沙箱/现网验收。
4. 只有 Human 明确要求时才运行并归档真实 E2E。

涉及文件：

- `scripts/e2e-3.0-bot.js`
- `docs/ACCEPTANCE_BOT.md`
- `docs/PAGE_UI_ACCEPTANCE_CHECKLIST_CN.md`
- `reports/e2e-3.0/`（不提交）

完成标准：

- [x] 137 项自动化测试、静态检查和人工微信预览通过
- [ ] 真机高风险链路均有截图/记录
- [ ] 失败场景有 issue、复现步骤和负责人
- [ ] 发布评审能引用本次报告

依赖：微信开发者工具登录、测试账号和真机。  
风险：自动化 mock 通过不代表微信授权、订阅消息或支付真实可用。

## TASK-006

任务：完成真实 AI 供应商异常演练和质量门禁  
优先级：P1  
状态：未开始  
所属模块：AI

背景：统一 AI 运行时和规则降级已完成，历史有 DeepSeek `source=live` 验证，但全链路生产演练未闭环。

需要完成：

1. 对四 Agent、四类申请文案、简历建议和面试评分建立匿名化样本集。
2. 演练超时、429、5xx、非法 JSON、断网和配置缺失。
3. 检查事实一致性、PII 脱敏、数字拦截、写入确认和额度扣减。
4. 记录延迟、成功率、降级率、Token/成本和人工质量评分。

涉及文件：

- `utils/aiClient.js`
- `services/v4AiRuntime.js`
- `services/v4Agents.js`
- `services/v4ResumeCenter.js`
- `services/v4Interview.js`
- `docs/V4_AI_RUNTIME.md`

完成标准：

- [ ] 所有错误类型均按约定降级或失败
- [ ] 不泄露 PII、不绕过确认、不编造关键事实
- [ ] 质量/延迟/成本达到书面阈值
- [ ] kill switch 回滚验证通过

依赖：测试环境 AI Key 和预算。  
风险：真实模型行为非确定性，必须保留规则降级。

## TASK-007

任务：优化提醒派发慢请求并验证幂等  
优先级：P1  
状态：未开始  
所属模块：通知/性能

背景：2026-08-21 `check:v4-ops` 记录 `/reminders/dispatch` 约 2123ms，超过 800ms 阈值。

需要完成：

1. 定位数据库扫描、微信 token 获取和逐条发送耗时。
2. 增加批量/分页、超时、并发上限和结构化耗时埋点。
3. 验证重复 cron、重试和部分失败不会重复发送。

涉及文件：

- `routes/notify.js`
- `scripts/dispatch_reminders.js`
- `services/v4Analytics.js`
- `tests/smoke.test.js`

完成标准：

- [ ] 本地/测试派发耗时满足约定阈值或转为可观察异步任务
- [ ] 同一提醒不会重复发送
- [ ] 部分失败可重试且有日志

依赖：可控的微信消息测试环境。  
风险：盲目并发可能触发微信限流。

## TASK-008

任务：配置生产外部错误告警和发布监控  
优先级：P1  
状态：未开始  
所属模块：可观测性

背景：项目已有 `error_events_v4`、`api_performance_v4` 和后台看板，但没有主动告警。

需要完成：

1. 选择告警渠道和错误聚合方式。
2. 对 5xx、readiness 失败、AI 降级突增、cron 失败和支付回调失败设置阈值。
3. 增加发布前后 30–60 分钟观察清单和负责人。

涉及文件：

- `services/v4Analytics.js`
- `routes/v4-admin.js`
- `scripts/healthcheck.js`
- `docs/PRODUCTION_READINESS_AND_MONITORING.md`

完成标准：

- [ ] 可主动收到关键故障告警
- [ ] 告警内容不含密钥和用户敏感信息
- [ ] 有测试告警和恢复通知记录

依赖：Human 选择通知渠道。  
风险：阈值过低会告警疲劳，过高会漏报。

## TASK-009

任务：验证跨设备 Today/收藏/校招提醒一致性  
优先级：P1  
状态：未开始  
所属模块：Today/提醒

背景：代码支持本地离线状态、服务端任务和截止提醒，但缺少完整跨设备验证。

需要完成：

1. 两台设备/两个会话验证任务创建、完成和离线补传。
2. 验证收藏岗位真实截止日、默认 30 日及提前 3/1 日提醒。
3. 验证校招提醒更新后不会重复或使用旧缓存。

涉及文件：

- `services/v4TodayTasks.js`
- `routes/v4/today.js`
- `routes/notify.js`
- `miniprogram/utils/favorite-reminder.js`
- `miniprogram/utils/daily-task-state.js`

完成标准：

- [ ] 跨设备最终一致
- [ ] 离线操作联网后只补传一次
- [ ] 截止时间变化能更新提醒

依赖：测试账号、设备和订阅消息授权。  
风险：客户端时间和时区差异可能导致错日。

## TASK-010

任务：落地统一数据库 migration 基线机制  
优先级：P1  
状态：未开始  
所属模块：数据库

背景：V4 有专项迁移/回滚，但基础表和部分业务表仍在启动或路由中创建。

需要完成：

1. 建立 `schema_migrations`、`db/migrations/` 和事务执行器。
2. 生成当前生产 Schema baseline，不重复执行历史 DDL。
3. 新结构只经 migration 进入；逐步迁出 `orders`、aggregate、OA 路由建表。
4. 用生产备份副本完成升级和恢复演练。

涉及文件：

- `db/database.js`
- `db/v4Schema.js`
- `routes/payment.js`
- `routes/aggregate.js`
- `routes/oa.js`
- `docs/DATABASE_MIGRATION_PLAN.md`

完成标准：

- [ ] 每个环境可查询已应用版本
- [ ] 重复执行幂等
- [ ] 失败事务不留下半结构
- [ ] 备份恢复演练成功

依赖：TASK-002 的发布/备份路径统一。  
风险：Schema baseline 标记错误可能跳过生产所需迁移。

## TASK-011

任务：分批迁移非必要的直接小程序网络请求  
优先级：P1  
状态：未开始  
所属模块：小程序/API

背景：首页、收藏、简历、部分上传和 AI 页面仍有直接 `wx.request/wx.uploadFile`；上传、SSE、LeetCode 等可保留有理由的例外。

需要完成：

1. 列出直接调用并标注“迁移/保留例外/第三方直连”。
2. 将普通业务请求迁入对应 `api-*.js`，统一 401、错误和超时。
3. 为上传、SSE 和第三方直连写清例外约定。

涉及文件：

- `miniprogram/pages/index/index.js`
- `miniprogram/utils/favorites.js`
- `miniprogram/package-career/pages/resume/resume.js`
- `miniprogram/package-ai/pages/ai-assistant/ai-assistant.js`
- `miniprogram/utils/api-client.js`

完成标准：

- [ ] 普通业务页面不再自行处理重复的 token/401/网络错误
- [ ] 保留例外有代码注释和测试
- [ ] 小程序发布检查通过

依赖：不得与 TASK-001 当前改动冲突。  
风险：流式和上传请求不能机械套用普通 JSON 客户端。

## TASK-012

任务：校准过期状态文档并确认生产真实版本  
优先级：P1  
状态：未开始  
所属模块：文档/运维

背景：旧文档仍写 48/69 tests、AI 未接真实模型、旧目录或旧端口；当前生产 commit 也没有单一实时记录。

需要完成：

1. 通过只读服务器/Git 信息确认生产 commit、release 目录、端口、数据库路径、功能开关和 cron。
2. 更新 `DEVELOPMENT_STATUS.md`、V4 文档和生产就绪文档，标记历史快照日期。
3. 对冲突文档加“已过期/仅供历史”提示，不删除有价值历史。

涉及文件：

- `DEVELOPMENT_STATUS.md`
- `docs/V4_UPDATE_AND_FEATURE_LIST.md`
- `docs/V4_AI_RUNTIME.md`
- `docs/PRODUCTION_READINESS_AND_MONITORING.md`
- `README.md`

完成标准：

- [ ] 一处可查询当前生产版本
- [ ] 文档不再把历史测试数字当当前值
- [ ] 本地、staging、production 状态明确分开

依赖：生产只读访问。  
风险：未经验证不得把本地状态写成生产状态。

## TASK-013

任务：拆分后台 God Route 和超大 smoke test  
优先级：P2  
状态：未开始  
所属模块：可维护性

背景：`routes/admin.js` 约 63 KB，`tests/smoke.test.js` 约 88 KB。

需要完成：

1. 按 users/content/jobs/settings 分离后台子路由，共用鉴权和响应工具。
2. 按 auth/payment/v4/content/admin/upload 拆分 smoke tests。
3. 保持公开路径和行为完全兼容。

完成标准：

- [ ] 现有 134 项测试全部通过
- [ ] API 路径无变化
- [ ] 不与高风险登录/支付行为修改混合

依赖：P0 发布收口后执行。  
风险：机械拆分可能改变路由顺序或中间件范围。

## TASK-014

任务：增加管理员关键操作审计与数据导出策略  
优先级：P2  
状态：未开始  
所属模块：后台/合规

需要完成：

1. 对用户 VIP、管理员账号、功能开关、Sponsor、删除和审核操作统一记录审计。
2. 定义导出字段、权限、脱敏、保留期和下载审计。
3. 增加管理员权限测试。

完成标准：

- [ ] 关键操作可追溯到管理员、时间、对象和前后状态
- [ ] 导出默认脱敏且按权限控制
- [ ] 审计记录不可由普通管理员删除

依赖：产品/合规决策。  
风险：审计日志本身可能含敏感数据，需最小化记录。

## TASK-015

任务：真实业务数据校验留存、申请漏斗与 AI 使用率  
优先级：P2  
状态：未开始  
所属模块：数据分析

需要完成：

1. 校验事件定义、去重、用户匿名化和时间窗口。
2. 对后台 7 日留存、岗位→申请、AI 使用率与数据库抽样对账。
3. 建立每周数据健康检查。

完成标准：

- [ ] 指标口径有文档
- [ ] 抽样误差在约定范围
- [ ] 测试/机器人事件不污染生产指标

依赖：生产只读数据权限。  
风险：不得把用户可识别信息带出授权范围。

## TASK-016

任务：到期评估并下线旧简历兼容 API  
优先级：P2  
状态：未开始  
所属模块：API/简历

背景：`/api/users/resumes` 标记 deprecated，历史计划至少保留到 2026-11-09。

需要完成：

1. 到期前统计旧接口调用量和调用方。
2. 确认小程序、后台和外部客户端均使用 `/api/resumes` 或 V4。
3. 先告警/监控，再分阶段下线并更新文档。

完成标准：

- [ ] 连续观察期无有效旧调用
- [ ] 回滚开关和兼容说明存在
- [ ] 下线后全量测试通过

依赖：不得早于约定保留期且需生产调用数据。  
风险：外部旧客户端可能仍在使用。

## TASK-017

任务：在资质确认后单独完成真实支付与退款灰度  
优先级：P2  
状态：未开始/资质阻塞  
所属模块：支付/商业化

需要完成：

1. Human 确认主体、虚拟支付商品和上线审批。
2. 验证签名、发货回调、幂等、金额/商品、权益到期和退款。
3. 以小流量灰度观察成功率、重复回调和权益一致性。

完成标准：

- [ ] 资质与审批有记录
- [ ] 沙箱/真机支付和退款通过
- [ ] 回调重放不重复发权益
- [ ] 可关闭支付且不影响基础功能

依赖：Human 决策和微信资质。  
风险：高风险资金链路，不得与普通优化混发。

## TASK-018

任务：根据真实规模评估对象存储、FTS/搜索和 Redis  
优先级：P3  
状态：未开始  
所属模块：架构

完成标准：

- [ ] 基于真实容量、QPS、成本和故障数据做决策
- [ ] 不为假设规模提前迁移

## TASK-019

任务：评估小程序跨页面状态层与本地数据迁移规范  
优先级：P3  
状态：未开始  
所属模块：小程序架构

完成标准：

- [ ] 盘点 `globalData/wxStorage` 所有关键状态和版本
- [ ] 建立向后兼容的本地 schema/version 迁移规则
- [ ] 仅在收益明确时引入轻量状态层

---

# 已完成

- [x] 2026-09-03 Sprint 0 恢复开发基线：确认唯一主项目、恢复 `miniprogram/` 和历史未提交增量、137/137 tests、微信开发者工具正常预览
- [x] 2026-09-03 清理旧开发目录：完整 ZIP 归档、11 份历史文档同步 Obsidian、注销部署工作树并保留独有分支、旧目录送入回收站
- [x] 2026-08-21 建立四份项目记忆文档
- [x] 2026-08-21 `npm run check:release`：134/134 tests，通过小程序和数据检查
- [x] 2026-08-21 V4 migration dry-run：pending=0
- [x] 2026-08-21 E2E dry-run：4/4
