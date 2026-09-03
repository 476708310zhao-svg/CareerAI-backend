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
