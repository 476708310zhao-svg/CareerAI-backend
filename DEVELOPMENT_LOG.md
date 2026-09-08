# Development Log

> 本文件记录阶段性开发历史和后续每次较大开发。无法从 Git/文档确认具体日期的内容不写虚构时间。

## 项目开发阶段

### 阶段一：基础全栈产品搭建

完成：

- 建立微信原生小程序、Express 后端、SQLite 数据库和原生管理后台。
- 实现用户、职位、企业、申请、简历、面经、机构、校招、资讯、通知和基础 AI 页面。
- 根据当前代码推测，本阶段早于 2026-05，具体开发顺序待确认。

### 阶段二：稳定性、安全与工程化（2026-05）

完成：

- 修复支付 userId、金额校验、密码哈希、Webhook 签名和上传魔数校验。
- 建立 smoke tests、GitHub Actions、README、`AGENTS.md` 和 `DEVELOPMENT_STATUS.md`。
- 固定 `data/jobs.json` 为唯一的本地职位数据源。
- 建立 AI 配额、API 响应约定和简历 API 去重策略。
- 初步整理超长 WXSS 和后台公共工具。

### 阶段三：2.0/3.0 求职闭环与上线能力（2026-06 至 2026-07 上旬）

完成：

- 扩展申请材料、JD 匹配、面试笔记、提醒、会员和支付流程。
- 加入职位多源聚合、校招/企业飞书同步、资源内容和后台开关。
- 建立发布检查、验收机器人、微信开发者工具 E2E 入口、生产部署和备份文档。
- 增加管理员账号权限、分享配置和会员管理。

### 阶段四：V4 求职工作台（2026-07-14 起）

完成：

- Sprint 1：V4 画像、Sponsor、岗位匹配、申请 CRM、审计历史。
- Sprint 2：经历库、多简历版本、AI 修改确认、申请文案草稿和额度。
- Sprint 3：首页/Today 工作台、资源中心、五项主导航、离线任务同步。
- Sprint 4：面试空间、训练报告、AI Career 四 Agent、埋点、运营看板、会员配额、迁移/回滚/灰度。
- 统一 AI 运行时，支持真实模型与规则降级。

### 阶段五：审核、体验与生产修复（2026-07 下旬至 2026-08）

完成：

- UGC 发布前审核、统一登录弹层和审核友好交互。
- 职位卡片/详情、搜索、简历编辑、职业规划、资源中心和校招内容体验优化。
- 校招切换至新飞书 Base，并修复生产同步和缓存新鲜度。
- 建立首页推荐独立审核开关，记录 V4 生产发布和 readiness 结果。

当前仍待收口：

- 8 月 10–12 日相关修改仍在工作区，尚未形成干净提交。
- 真实 E2E、真机验收、严格发布预检和部署配置统一未完成。

---

## 2026-09-03｜Sprint 2 第一批：核心数据引用契约

### 本次完成

- 新增统一核心实体 `refs`，覆盖用户、岗位、申请、简历/版本、面试空间/会话/报告和 Today 任务。
- 抽取唯一的申请 V4 状态机，岗位详情与申请看板使用同一状态及文案。
- canonical Job ID 统一优先使用 `source_job_id`，修复旧数据中 `job_id` 与官方 ID 不一致时简历和面试链路可能错连的问题。
- Today 任务可按面试报告、AI Agent 或申请来源回溯完整业务链；申请、岗位匹配、简历优化、材料生成、面试和任务完成埋点增加紧凑 `refs`。
- 记录各实体状态枚举、兼容关系和后续 migration 边界；本批不修改生产表结构。

### 修改文件

- `utils/coreEntityRefs.js`、`utils/applicationStatus.js`
- `routes/v4/applications.js`、`jobs.js`、`resumes.js`、`materials.js`、`interviews.js`、`today.js`
- `services/v4Profile.js`、`services/v4Interview.js`、`services/v4TodayTasks.js`
- `tests/coreEntityRefs.test.js`、`tests/smoke.test.js`、`tests/all.test.js`
- `docs/CORE_ENTITY_REFERENCE_CONTRACT.md` 及项目状态/路线图/TODO

### 技术决策

- 先建立兼容层，API 保留旧字段并增加完整 `refs`；埋点保留旧字段并增加去空的紧凑 `refs`。
- 外部岗位 ID 保持字符串；SQLite 主键统一输出正整数或 `null`。
- 数据库 migration、历史数据清洗和外键加固作为独立批次，避免把 API 契约变化和生产数据变更混在一次提交中。

### 验证

- 核心引用与申请状态专项测试 6/6 通过。
- 全量测试 143/143 通过，包含旧双轨岗位 ID 的申请→简历→面试→报告→Today 关联验证。
- `git diff --check` 通过；未运行真实微信 E2E。

### 下一步

- Sprint 2 第二批：统一职位/校招的数据来源标识、更新时间、过期规则和失败降级。

---

## 2026-08-21

### 本次完成

- 全面盘点唯一主仓、Git 状态、依赖、页面、路由、数据库、服务、脚本、文档和历史提交。
- 建立 `PROJECT_CONTEXT.md`、`DEVELOPMENT_LOG.md`、`TODO.md`、`HANDOFF.md` 项目记忆体系。
- 识别 61 个注册页面、V4/旧版双层 API、核心数据模型和第三方服务。
- 运行发布基线：134/134 tests 通过；小程序静态/分包检查通过；数据内容 Errors 0、Warnings 4。
- 运行 V4 migration dry-run：users/jobs/applications 均 `pending=0`。
- 运行 V4 运维检查：0%/paused，无 error，发现 2 个慢请求样本。
- 运行 E2E dry-run：4/4 预检通过。
- 运行严格预检：未通过，发现本机缺少 `JWT_SECRET`，支付放行开关关闭。

### 修改文件

- `PROJECT_CONTEXT.md`
- `DEVELOPMENT_LOG.md`
- `TODO.md`
- `HANDOFF.md`

测试过程在已被 Git 忽略的 `reports/e2e-3.0/` 生成了一份 2026-08-21 预检报告；未修改业务代码。

### 技术决策

- 将项目阶段定为“V4 内测/灰度前收口”，不再沿用旧文档的 2.0/MVP 判断。
- 将完成度估为 78%，同时区分代码完成、自动化通过、真实 E2E、真机验收和生产放量。
- 将发布配置漂移、未提交工作区和 n8n 凭据暴露列为 P0，而不是继续堆叠新功能。
- 继续保留真实支付双开关，不把支付放行当作自动化开发任务。

### 遗留问题

- 当前已有 46 个修改文件、3 个未跟踪文件，需先审查和拆分提交。
- PM2/Nginx/GitHub Actions/文档在 3001、4400、固定目录和版本目录之间不一致。
- n8n workflow 有硬编码默认密码并回显输入密码。
- 真实 E2E 未完成 11/11，真机高风险路径未验收。
- 外部告警、AI 异常演练、提醒慢请求和统一 migration runner 未完成。

### 下一步

- 优先执行 `TASK-001`：保护并审查当前工作区，按业务批次拆分可验证提交；这是后续任何修复的前置条件。
- 紧接着执行 `TASK-002` 和 `TASK-003`，统一发布链路并消除凭据暴露。

---

## 2026-09-03 — Sprint 0：恢复开发基线

### 本次完成

- 确认唯一主项目为 `D:\ChatGPT-Projects\求职小程序\jobapp-server`；旧桌面目录是指向 D 盘的 Junction，不是独立副本。
- 确认开发分支为 `codex/v4-development`，Git 基线为 `bcd6e8430710f374cf8dfab61dd319562c0a1b73`。
- 从 Git 基线恢复整个 `miniprogram/`，共 1,588 个受跟踪文件。
- 根据 2026-08-10 至 2026-08-12 的 Codex 历史日志恢复未提交的小程序增量：
  - 登录弹窗关闭、跳过登录及拒绝手机号授权后的退出路径；
  - 紧凑 AI 提示条和三个旧面试页面的共享组件；
  - 资源中心标题胶囊与独立服务卡布局；
  - 校招首页强制刷新、`_fresh` 请求参数及“新开”改“更新”；
  - 首页分享图、分享配置缓存版本及后台默认分享图覆盖规则；
  - 校招模块“今日上新”改为“持续更新”。
- 按原历史方案将 `miniprogram/images/logo_google.png` 从 1172×514、23.2 KB 等比压缩为 400×175、11.2 KB。
- 微信开发者工具已由用户确认可以正常预览。
- 清理旧目录前生成完整 ZIP 归档并验证 6,628 个条目；将旧备份中的 11 份开发文档同步至 Obsidian 并完成 SHA-256 一致性校验。
- 正确注销 `jobapp-server-main-deploy` Git 工作树，保留含 5 个独有提交的 `codex/deploy-feishu-main` 分支。
- 将 `求职小程序_旧备份_20260610`、`banner-optimize` 和 `miniprogram_before_unify_20260514` 送入 Windows 回收站。

### 修改文件

- 恢复范围：`miniprogram/`。
- 状态记录：`DEVELOPMENT_STATUS.md`、`DEVELOPMENT_LOG.md`。
- 后端及其他既有未提交改动保持原样，未用部署副本覆盖主项目。
- 历史归档：`D:\ChatGPT-Projects\求职小程序\archives\cleanup-20260903\legacy-directories-before-cleanup.zip`。
- Obsidian 历史文档：`C:\Users\admin\Desktop\MyProject\Vapor知识库\职引\职引小程序\历史归档\2026-06旧版`。

### 技术决策

- 将 D 盘仓库作为后续开发的唯一可信工作目录。
- 将 Git HEAD 与可追溯的 Codex 历史补丁组合为恢复基线，不猜测或重建无法证实的改动。
- Sprint 0 只恢复和验证，不提交、不推送、不部署；真实支付、登录核心逻辑和生产配置不在本阶段扩展范围内。

### 验证

- `npm run check:release`：通过。
- 自动化测试：137/137 通过。
- `npm run check:miniprogram`：通过，编译包媒体总量 191.2 KB，要求严格小于 200 KB。
- `npm run check:data`：Errors 0，Warnings 4；均为现有支付、本地地址、占位或测试文案提示。
- `git diff --check`：通过。

### 遗留问题

- 当前恢复结果与此前后端改动仍在同一未提交工作区，需要人工审查后按业务批次拆分提交。
- 微信开发者工具的编译、预览和真机高风险路径尚未执行。

### 下一步

- 在微信开发者工具打开 `miniprogram/` 对应项目，完成编译和预览。
- 人工确认登录弹窗、资源中心、首页校招、分享卡片和三个面试页面。
- 验收通过后再制定安全的拆分提交方案，进入下一 Sprint。

---

## 2026-09-03 — Sprint 1：发布基线收口

### 本次完成

- 将恢复工作区按校招、申请文案、管理员限流、分享封面、审核 UI、测试和部署基线拆分为独立 Git 提交。
- 管理员登录限流改为真实 IP + 规范化用户名隔离，仅累计失败请求；Express 只信任本机反向代理。
- 分享配置取消陈旧接口缓存，后台支持继承全局封面，小程序优先使用管理端默认封面并恢复包内可靠封面。
- 登录弹层补充显著关闭/跳过入口，统一三个面试页面 AI 生成说明，优化资源中心和媒体包预算检查。
- 统一 Node 20、4400、版本目录、`current` 软链接、共享数据、备份、PM2、Nginx 和手动 GitHub 生产发布；候选版本先在 4401 readiness，失败时恢复上一软链接。
- 删除 n8n 默认明文密码和日志回显，改用 GitHub `production` Environment Secrets/Variables，固定版本且仅监听本机 HTTPS 反向代理入口。
- 根据 Human 决定，将真实微信 E2E 从默认门禁移除；后续默认使用专项测试、发布检查、静态检查和人工微信预览。

### 提交

- `35b8956 fix(campus): keep recruitment updates fresh`
- `64a3819 refactor(materials): focus library on application copy`
- `7922bde fix(admin): isolate failed login rate limits`
- `6d60b01 fix(share): restore reliable share covers`
- `d43dade refine(miniprogram): improve review-facing UI`
- `966ba50 test(e2e): preserve WeChat automation fixes`
- `d19d46f test(campus): cover daily update semantics`
- `a9b92a6 fix(deploy): unify production release baseline`

### 验证

- 管理员限流专项 2/2、分享专项 3/3、审核 UI 专项 22/22、校招内容 4/4、完整 smoke 65/65 通过。
- Shell、JavaScript、JSON、GitHub Workflow YAML 静态检查通过。
- 高置信度密钥扫描 0 命中；`.env`、数据库、uploads 和 E2E 报告未提交。
- 最终 `npm run check:release` 通过：137/137 tests、媒体总量 191.2 KB、数据检查 Errors 0/Warnings 4；`git diff --check` 通过。
- 未运行真实 E2E；用户已确认微信开发者工具预览正常。

### Human 待办

- 在真实服务器执行候选版本切流和回滚演练。
- 配置/轮换 n8n Secret 并评估旧 Actions 日志。
- 保存生产严格预检证据并完成真机高风险链路验收。
- 未经明确授权不得推送、部署或启用真实支付。

---

## 2026-09-04｜Sprint 2.2：职位与校招数据可信度基线

### 本次完成

- 新增统一 `dataMeta` 契约，覆盖来源、来源类型、更新时间、新鲜度、明确过期、fallback 原因和集合级降级统计。
- 将正式搜索/聚合接口恢复为小程序主源，飞书人工职位仅作失败兜底；服务端依次标记 JSearch、Adzuna、RemoteOK、The Muse、LinkedIn、Indeed、Greenhouse、Lever 与本地历史库。
- 删除本地职位分页扩容时的复制记录、`_pool_` ID 和伪造当前发布时间；历史岗位按真实时间显示为可能过期。
- 校招支持 `YYYY-MM-DD`、`YY.M.D`、`M.D`，明确截止日期已过时优先标记 `expired`，滚动截止文案保持原文。
- 职位/校招列表和详情展示紧凑来源及新鲜度；读取缓存时改标“本地缓存”并保留原来源，不冒充在线数据。

### 技术决策

- 职位 30 天内为近期、31～90 天建议复核、超过 90 天可能过期；校招采用 7/30 天更严格阈值。
- `fetchedAt` 只表示抓取时间，绝不参与内容新鲜度计算；缺发布时间和更新时间时返回 `unknown`。
- 当前能力是 Job Trust Score 的数据基线，不输出缺少官网核验、重复度和状态历史证据的确定性评分。

### 验证

- JavaScript 语法检查通过。
- 来源/时间、职位展示和校招内容专项测试 16/16 通过。
- `npm run check:release` 151/151 通过，小程序媒体总量 191.2 KB，数据检查 Errors 0/Warnings 4。
- 不运行真实微信 E2E。

### 下一步

- Sprint 2.3 校验完整求职漏斗埋点并隔离测试/演示数据。
- 微信开发者工具由 Human 人工确认卡片新增来源文案在窄屏下无截断异常。

---

## 2026-09-04｜Sprint 2.3：求职漏斗与数据隔离基线

### 本次完成

- 将求职主链路统一为 `job_viewed`、`job_matched`、`resume_optimized`、`application_added`、`application_submitted`、`interview_reached`、`offer_received` 七个 canonical 事件。
- 职位详情、普通/高级匹配、简历 AI 修改确认、V4 与兼容申请链路均由服务端写入可信漏斗事件；客户端埋点只保留行为辅助分析。
- Analytics 增加 `data_class`、`is_test`、`event_version` 兼容字段，按 production/demo/test/system 分类；运营看板默认只统计 production，可显式切换分类。
- 所有漏斗事件携带紧凑 `refs`、`missingRefs` 和事件版本；后台同时显示独立用户漏斗、原始事件数与缺失引用数量。
- 官网按钮点击继续记为 `official_apply_clicked`，不冒充投递完成；模拟面试训练事件不冒充真实进入面试；面试子状态只在首次进入真实面试阶段时计一次漏斗事件。

### 技术决策

- 漏斗可信来源固定为 `source=server`；看板按独立用户统计，避免重复详情加载放大转化人数。
- 自动化测试显式配置 `ANALYTICS_DATA_CLASS=test`，演示 fallback 标记为 demo，默认运营口径不包含非生产事件。
- 本批只做 Analytics 表兼容式加列，不删除或改写历史业务数据；正式 migration baseline 留在 Sprint 2.5。
- 当前转化率是 30 天窗口内相邻阶段独立用户数之比，不是严格同 cohort 归因；严格 cohort 与渠道归因留待真实业务数据校验。

### 验证

- 漏斗工具专项测试 4/4 通过。
- 完整 smoke 67/67 通过，覆盖七阶段、事件版本、核心引用、面试阶段去重、测试分类和运营看板默认隔离。
- `npm run check:release` 156/156 通过，小程序媒体 191.2 KB，数据检查 Errors 0/Warnings 4。
- JavaScript 语法及 `git diff --check` 通过；未运行真实微信 E2E。

### 下一步

- Sprint 2.4 建立 AI 匿名化异常样本集与安全质量门禁。
- 生产发布后再以只读方式对真实漏斗、留存和 AI 使用率抽样对账；当前不推送、不部署。

---

## 2026-09-04｜Sprint 2.4：AI 匿名样本与安全质量门禁

### 本次完成

- 建立 11 个完全合成的匿名样本，覆盖四个 AI Career Agent、五类申请文案、简历优化和面试评分。
- 建立超时、HTTP 429、HTTP 503、DNS 不可达、非法 JSON、配置缺失和 kill switch 七类故障矩阵，确认重试、错误编码和规则降级口径。
- AI 运行时对输入、真实模型输出和规则降级输出递归脱敏，扩展中国/国际电话、邮箱、证件号和银行卡直接标识符覆盖。
- Agent 拦截“已替用户创建/保存/投递/发送”等虚构执行声明；所有输入字段落库前脱敏，写操作仍需一次性确认令牌。
- 无效 Agent/简历/文案请求不扣额度，已受理任务的内部重试不重复扣额度。
- 耗时、Token、降级原因、上游状态和可选成本估算写入安全 Analytics 元数据；运营看板增加近 7 天 AI 质量汇总。

### 技术决策

- `npm run check:ai-quality` 不发起外部请求，并纳入 `check:release`；不将故障注入结果冒充为真实供应商质量结论。
- 费率未配置时 `estimatedCostUsd=null`，不将未知成本记为 0；费率必须来自经复核的供应商价格。
- 真实供应商 staging 验收阈值书面固化，但需 Human 提供测试 Key 和预算后才能宣告通过。

### 验证

- AI runtime/质量门禁/简历专项 12/12 通过。
- AI 故障矩阵 7/7 通过，匿名样本 11 个，外部请求 0。
- 完整 smoke 67/67 通过，覆盖递归脱敏、提示快照脱敏、确认令牌、重复确认、额度不多扣和看板汇总。
- `npm run check:release` 160/160 通过，小程序媒体 191.2 KB，数据检查 Errors 0/Warnings 4。
- 未运行真实微信 E2E，未调用真实 AI 供应商。

### 下一步

- Sprint 2.5 建立数据库 migration baseline，并在隔离数据库执行备份、恢复与回滚演练。
- Human 准备好 staging 测试 Key/预算后，再执行真实模型的事实一致性、P95 延迟、降级率和单次成本抽样。

---

## 2026-09-04｜Sprint 2.5：数据库 migration baseline 与恢复演练

### 本次完成

- 建立 `schema_migrations`、顺序 SQL migrations、版本/名称/校验和/耗时/时间记录与只读状态查询。
- 增加 baseline 关键表/字段前置校验，当前版本只登记历史结构，不重复执行旧 DDL。
- 每个迁移在 SQLite `IMMEDIATE` 事务内同时执行 SQL 和写入版本记录；重复执行不再写入，已应用文件变更会被 SHA-256 检测阻断。
- apply 命令强制显式数据库路径、已存在且通过完整性检查的备份和确认口令；生产环境另需 Human 审批后的显式参数。
- 新增一致性 backup/restore 辅助程序和一键隔离演练脚本。

### 技术决策

- 本批不直接改生产数据库，也不立即移除 `db/database.js`、V4 schema 和历史路由中的启动期 DDL；先让所有长期环境登记 baseline，再分批移除兼容兜底。
- baseline 不提供会删除历史业务表的 down migration；不可逆变更的标准回滚是停止写入后恢复已验证备份。
- schema migration 与已有 V4 业务数据回填/安全回滚脚本职责分离。

### 验证

- migration 专项 5/5、全量测试 165/165 通过。
- 隔离数据库演练完成一致性备份、迁移后完整性、数据保留、重复执行、强制失败事务回滚、备份恢复、版本回滚和恢复后完整性 8 项检查。
- 演练备份 11,182,080 bytes，恢复文件 SHA-256 与备份一致；源数据库和生产数据库写入均为 0。
- 未运行真实微信 E2E，未推送、未部署。

### 下一步

- Sprint 3 先完成可行动的 AI Job Match 与 Target/Reach/Safe 岗位梯次，再接通 JD 定制简历逐条确认和不可变新版本。
- staging/生产 baseline 登记、真实 AI 供应商抽样和生产发布仍由 Human 审批。

---

## 2026-09-04｜Sprint 3：三项高价值 AI 闭环

### 本次完成

- Job Match 在原有三维评分、优势与缺口之外，增加 Safe/Target/Reach/Blocked 梯次、是否值得投的明确决策以及 Sponsor/身份判断；公民身份等硬冲突固定进入 Blocked。
- 岗位详情将 canonical Job ID、申请 ID、公司、岗位和 JD 传入简历中心；创建优化方案前校验岗位与申请一致，缺省岗位时使用申请的 canonical Job ID。
- 简历中心明确显示当前真实简历版本，逐条展示原文、建议、理由及接受/拒绝状态；确认后创建不可变新版本，写入岗位关联并绑定回申请，历史比较和恢复入口继续保留。
- 面试空间新增公司×岗位×轮次 Brief，整理 JD 能力、公开面经、已核验 STAR 素材、轮次重点与反问清单，并明确缺失信息不由 AI 补造。
- 面试报告根据弱项生成专项复练计划和幂等 Today 任务深链；申请没有下一步或已有复练事项时才回写，避免覆盖用户其他计划。

### 技术决策

- 本批不新增 Job Match 数据库列；策略元数据兼容存入 `job_matches.dimensions._strategy`，API 输出时剥离，保持 `dimensions` 为纯数值对象。
- Safe 只表示当前条件匹配较稳，不代表录用保证；Sponsor 状态未知或证据不足时返回“核实后再投”，不包装为确定支持。
- Interview Brief 只使用申请 JD、公开面经和用户已核验经历，不生成不存在的公司事实、经历或指标。
- 不调用真实 AI 供应商、不运行真实微信 E2E、不操作生产数据库、支付或部署。

### 验证

- Sprint 3 专项测试 5/5，全量测试 170/170。
- `npm run check:release` 通过：AI 故障矩阵 7/7、外部请求 0、小程序媒体 191.2 KB、数据检查 Errors 0/Warnings 4。
- `npm run check:miniprogram`、JavaScript 语法检查和 `git diff --check` 通过。

### 遗留问题

- Target/Reach/Safe 阈值仍需在取得真实投递与面试结果后校准，当前不得解释为成功率。
- 真实 AI 供应商 staging 抽样、生产 migration baseline、服务器切流/回滚和真机高风险链路仍需 Human 审批。

### 下一步

- 进入 Sprint 4：建立可解释的 Career Competitiveness Score，并把低分项连接到真实 Today 任务。
- 基于真实七阶段漏斗生成动态计划和周复盘，同时保留用户确认、证据来源和回退边界。

---

## 2026-09-08｜Sprint 4：竞争力诊断与 AI 陪跑

### 本次完成

- 建立教育、经历、技能、项目、简历、面试、Networking 七维竞争力诊断；每维返回当前证据、具体差距和可执行入口，总分明确不代表个人能力或录用概率。
- 新增真实申请历史漏斗分析，识别岗位来源、投递数量、简历定制、面试转化、跟进停滞和执行节奏瓶颈，并据此动态生成 3/6/12 月计划。
- 每日幂等生成 3～5 个关键任务，优先覆盖临近面试、申请截止、当前瓶颈和最低分维度；任务存储在服务端，支持完成、延期 1～30 天和跨设备同步。
- 每周报告汇总岗位查看、匹配、简历确认、加入看板、确认投递、面试、Offer 和 Today 完成量；分母为零时显示“样本不足”，不生成伪成功率。
- 小程序资源中心新增“竞争力陪跑”入口，页面可查看七维诊断、一键加入 Today、完成/延期任务、周复盘和动态计划。
- 新增仅追加 migration，持久化每日诊断快照和每周报告，不改写或删除旧业务表。

### 技术决策

- 诊断使用数据库中可核验的画像、经历、简历版本、面试报告、联系人和申请状态，不调用外部 AI，也不根据缺失数据补造事实。
- `rejected` 计入历史已投递样本，因为拒信是已发生投递的结果；转换只描述账户已记录历史，不用于预测未来成功率。
- Today 延期复用 `task_date`，每日任务通过 `local_key` 和来源键幂等；`reminderAt` 是站内 Today 的 09:00 提示语义，不冒充微信订阅消息。
- migration 为纯新增表和索引；生产执行必须先完成备份、审批和现有 migration 流程。

### 验证

- Sprint 4 专项测试 5/5，migration 专项 5/5，全量测试 176/176。
- `npm run check:release` 通过：AI 故障矩阵 7/7、外部请求 0、小程序媒体 191.2 KB、数据检查 Errors 0/Warnings 4。
- `npm run check:miniprogram`、相关 JavaScript/JSON 静态检查和 `git diff --check` 通过。
- 未运行真实微信 E2E，未调用真实 AI，未操作生产数据库、真实支付、推送或部署。

### 遗留问题

- 七维评分阈值和漏斗瓶颈阈值需要真实匿名样本校准，当前分数只能解释“系统内证据完整度”。
- 跨设备数据由服务端保证最终一致；微信订阅消息、系统级推送和用户时区策略尚未接入。
- 生产 migration、真实用户灰度和周报指标对账仍需 Human 审批。

### 下一步

- 进入 Sprint 5：建立 Networking 联系人 CRM、五类可编辑话术、跟进提醒及“已联系→已回复→Coffee Chat→Referral”漏斗。
- 所有外联内容只生成草稿，不代替用户发送，也不虚构共同经历、校友关系或推荐资格。

---

## 2026-09-08｜Sprint 5：Networking Copilot MVP

### 本次完成

- 建立独立联系人 CRM，记录联系人、公司、岗位、渠道、联系方式、关系背景、阶段、最近联系、下次跟进、Referral 结果以及关联申请/简历/版本/岗位。
- 支持 Connect Note、Cold Message、Coffee Chat、Follow-up、Referral Request 五类中英文、正式/友好草稿；草稿保存后仍可编辑和复制。
- 未确认的共同背景不会进入草稿；Referral Request 至少在用户记录“已回复”后才能生成，文案明确由联系人自行判断是否推荐。
- “我已外部发送”需要二次确认，接口只记录用户报告的外部动作并返回 `sentBySystem=false`，不存在自动外发能力。
- 下次跟进会写入服务端 Today，完成 Today 提醒后同步清除联系人待跟进日期；联系人和草稿可跨设备读取。
- 建立“已联系→已回复→Coffee Chat→Referral”历史漏斗，样本不足时不计算比例，也不预测回复或 Referral 成功率。
- Referral 成功前必须关联本人正式申请和简历；结果同时保存 canonical Job ID、简历及版本引用。

### 技术决策

- 新版 Networking 使用独立 V4 表，不改写旧 `application_contacts`，旧申请详情接口和旧 `/api/ai/networking` 保持兼容。
- 本批草稿由可审计的本地规则基于账户画像和用户确认信息生成，`source=rules`；未向外部 AI 供应商发送联系人或用户资料。
- 联系人阶段变化写入追加式事件表；漏斗按曾到达的最高真实阶段计算，避免用户修正当前状态时抹掉历史证据。
- migration 只新增三张表和索引；生产应用仍必须走备份、显式目标、校验和及 Human 审批流程。

### 验证

- Sprint 5 专项测试 5/5，migration 专项 5/5，全量测试 182/182。
- `npm run check:release` 通过：AI 故障矩阵 7/7、外部请求 0、小程序媒体 191.2 KB、数据检查 Errors 0/Warnings 4。
- JavaScript/JSON 静态检查和 `git diff --check` 通过。
- 未运行真实微信 E2E，未调用真实 AI，未操作生产数据库、真实支付、外部联系人、推送或部署。

### 遗留问题

- 当前只提供站内 Today 跟进提醒；微信订阅消息、系统通知和用户时区策略尚未接入。
- 草稿为规则版 MVP，后续如接入真实 AI 必须沿用 PII 脱敏、用户确认、无虚构关系和供应商灰度门禁。
- 真实回复率、Coffee Chat 与 Referral 阈值需在取得匿名生产样本后校准。

### 下一步

- 进入 Sprint 6：先做 OA Copilot 的计划/计时/错题/统计，再完成证据导向 Project Builder 与 Job Trust Score。
- 项目成果只有用户确认真实完成后才能回写简历；岗位可信度必须展示证据与不确定性。

---

## 2026-09-08｜Sprint 6：OA、证据型项目与 Job Trust Score

### 本次完成

- OA Copilot 支持按公司、岗位、正式申请、题型、目标日期和周训练分钟建立计划；同一用户只允许一个进行中的计时练习。
- 练习完成前必须确认成绩、耗时和错题均为本人记录；错题按计划和题目键幂等更新，标记掌握前必须再次确认。
- 题型能力统计只读取本人确认的完成记录，输出正确率和平均每题耗时；没有样本时返回 `null` 并显示“不评估”。
- Project Builder 改为六类可审计本地规则模板，从岗位匹配差距或用户输入差距生成问题边界、数据来源、交付物、验收标准和四个里程碑。
- 每个里程碑必须填写证据并确认完成；所有里程碑完成后，项目仍需提交真实成果、可核验交付物和限制，并由本人确认真实完成。
- 只有已确认完成的项目才能写入 `career_experience_library`；简历描述中的数字必须已存在于完成证据中。
- Job Trust Score 由官网可验证性 25、信息新鲜度 25、发布时间 15、重复度 15、用户本人官网状态 20 组成，所有缺失证据和风险均显式展示。
- 岗位详情支持复制官网链接后由用户本人记录 active/closed/redirected/unavailable/unknown；系统不声称已自动联网核验。

### 技术决策

- 新增六张 Sprint 6 表和索引，migration 只做增量创建，不修改或删除旧表。
- OA 与 Project Builder 使用新的 V4 API；旧 OA/API 与旧 AI Project Builder 后端保持兼容，但新版页面不再调用旧 AI 接口或直接写本地 `onlineResume`。
- Project Builder 当前 `source=rules`，没有调用外部 AI，也没有发送画像、岗位或项目证据给第三方供应商。
- Job Trust Score 是证据聚合和行动提示，不是岗位真实性认证或录用建议；直链域名只作为信号。

### 验证

- Sprint 6 专项测试 7/7，migration 专项 5/5，全量测试 190/190。
- `npm run check:miniprogram` 通过，小程序媒体 191.2 KB，各分包均低于限制。
- JavaScript 语法检查、`git diff --check` 与 `npm run check:release` 通过；AI 故障矩阵 7/7、外部请求 0、数据检查 Errors 0 / Warnings 4（均为既有告警）。
- 未运行真实微信 E2E，未调用真实 AI，未操作生产数据库、真实支付、外部联系人、推送或部署。

### 遗留问题

- OA 题型统计阈值和训练节奏需要匿名真实样本校准，当前统计只陈述已记录样本。
- Project Builder 后续可补作品集展示和面试证据复用，但不能放松真实完成与数字证据约束。
- Job Trust 权重需要真实反馈校准；如未来接第三方核验源，必须展示来源、更新时间和失败降级。
- 生产 migration、真实用户灰度和真实支付仍需 Human 审批。

### 下一步

- Sprint 7 只先做商业化方案、权益账本、退款与监控设计；主体资质、商品、真实支付和退款方案获 Human 明确批准后，才允许进入真实支付沙箱或小流量灰度。

---

## 后续追加模板

## YYYY-MM-DD

### 本次完成

-

### 修改文件

-

### 技术决策

-

### 验证

-

### 遗留问题

-

### 下一步

-
