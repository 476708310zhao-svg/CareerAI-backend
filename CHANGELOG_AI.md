# AI 修改记录

本文件记录 AI 参与的主要代码改动、验证结果和后续注意事项，便于多 AI 协作时快速接手。

## 2026-10-10

### 功能简化与 AI 编排 Checkpoint 1–10

- Checkpoint 1–9 已拆分为原子提交，覆盖 migration baseline、申请工作台、持久上下文 AI、Web P0、移动申请、简历/材料/面试闭环、资源/我的资产化、首页/五 Tab 导航以及零引用组件清理。
- 安全补丁将数据库测试与 acceptance runtime 固定到隔离临时目录，避免自动化测试触碰主数据库。
- 用户侧 AI 收敛为统一上下文入口；简历主入口统一为 Resume Center；资源中心和我的分别承担内容资产与个人资产。
- 2026-10-10 11:39（Asia/Shanghai），Checkpoint 10 自动化候选门禁已通过：候选 tree 为 `abdaccf0cdecccda635440546d039e48f88916c9`（Git tree 证据，不是 branch commit），`npm test` 318/318、`check:miniprogram` 通过（媒体 192.3 KB，主包 0.99 MB）、`check:acceptance` 30/30。
- `check:e2e-3.0` 4/4 仅为 dry-run 预检，不代表微信 UI 或真机 E2E已通过。Migration `0001–0011`、五 Tab、6 个 feature 默认值、Checkpoint 9 组件清理和材料工具路径等静态一致性检查通过；主数据库指纹未变且未执行 apply。
- Checkpoint 10 本记录随本次文档提交生效，提交哈希以 Git 历史为准。微信开发者工具完整主链路、真机 E2E、生产部署、远端同步和真实支付仍未完成。
- 测评资料购买 PRD 仅为后续规划；本轮未交付真实商品、订单、支付、Grant 或退款链路，不得对外宣称已上线。
- 事实判定以已提交的运行代码/schema 和最终门禁输出为准；交付记录是摘要，PRD 表达意图，manifest 记录拆分历史，旧记录只用于追溯。

## 2026-09-15

### Web 申请表格、批量操作与申请包聚合

- 申请表格与看板支持状态筛选、公司/岗位搜索、排序、分页和多选；保留 OA 与已结束记录，连续输入不重建输入框。
- 新增批量状态预览、原子提交与 10 分钟内撤销，复用单条状态服务、面试空间和漏斗事件；状态/历史版本不一致时整批拒绝，避免旧页面覆盖新状态。
- 新增 `/api/v4/applications/:id/workspace`，聚合现有简历版本、材料、匹配、版本绑定的历史 ATS 风险、联系人、任务与面试摘要。修复空 `client_id` 和其他申请的明确材料关联混入详情的问题。
- Web 详情支持保存截止日期、下一步行动和备注；退出清空页面数据，申请详情切换避免旧响应覆盖。
- 验证：Web 数据行为 3/3、独立数据库 API 场景 7/7、Edge 浏览器验收通过；`check:release` 全量 214/214、AI 矩阵 7/7、外部请求 0、小程序检查通过、内容错误 0。截图在 `artifacts/web-workbench/`。
- 仍待开发：简历版本选择、材料编辑/确认、服务端 AI 上下文与跨端历史、独立 Offer 条款；真实微信双设备验收和上线尚未进行。未新增 migration，未推送或部署。

## 2026-09-14

### Web 用户侧工作台首个可运行版本

- 内容：新增 `public/web/` 用户侧 Web 页面和样式，提供登录/注册、工作台、申请管线看板首版、申请详情抽屉和 AI 专家流式问询入口；根路径、`/web/` 路径统一进入 Web 工作台，继续保留 `/admin` 管理后台和 `/api/*` 接口。
- 增量：申请管线增加公司/岗位关键词与状态筛选；申请详情支持按服务端状态机更新申请状态；工作台 Today 任务支持完成并刷新。
- AI：Web 专家保留最近 20 条对话，并将当前公司、岗位和申请标识传给后端上下文。
- 数据：复用 `/api/users/web-login`、`/api/users/web-register`、`/api/v4/career/dashboard`、`/api/v4/applications/board`、`/api/v4/applications/:id/detail` 和 `/api/ai/assistant`，不新增第二套申请数据。
- 验证：`node --check public/web/app.js`、`node --check server.js`、全量 209/209 tests、`git diff --check` 通过。
- 注意：当前为首版骨架，申请表格批量操作、申请包深度编辑、AI 确认写入和真实浏览器/双端验收尚未完成。

## 2026-09-10

### 修复竞争力陪跑组件加载失败

- 内容：在竞争力陪跑分包页面中显式声明 `c-ai-disclosure`，避免启用 `lazyCodeLoading: requiredComponents` 时组件依赖偶发被运行时降级为 `wx://not-found`；新增页面配置回归断言。
- 验证：Sprint 4 专项 6/6、全量 204/204、`npm run check:release` 和微信开发者工具官方 CLI preview 均通过。
- 注意：开发者工具若仍保留旧运行缓存，请点击一次“编译”或重新打开项目。

### 修复收藏日期在部分 iOS 无法解析

- 内容：新增小程序日期解析工具，对 SQLite `yyyy-MM-dd HH:mm:ss` 时间按 UTC 逐字段解析；收藏合并和排序不再直接调用不兼容的 `new Date(value)`。
- 验证：Sprint 8 专项 7/7、全量 204/204、`npm run check:release` 通过；未运行真实 E2E。
- 注意：微信开发者工具需重新编译，警告中的“不再提醒”只隐藏提示，并不会修复代码。

## 2026-09-09

### 修复竞争力陪跑空白仪表盘

- 内容：
  - 增加仪表盘响应状态和结构校验，不再把 401、超时、断网、限流、HTTP 错误或残缺响应当成有效数据。
  - 登录失效展示重新登录；服务异常展示可重试错误，并清空可能残留的旧诊断、周报、计划和任务状态。
  - 增加失败降级、残缺响应及完整成功响应回归覆盖。
- 验证：Sprint 4 专项 6/6、全量 203/203、`npm run check:release` 通过；未运行真实 E2E、未调用真实 AI。
- 注意：前端已避免伪空白，但正式显示真实内容仍要求生产后端发布包含 `/api/v4/career/dashboard` 的版本。

### Sprint 8 提醒可靠性与跨设备一致性（2026-09-09）

- 内容：
  - 提醒派发增加唯一投递账本、租约、失败重试、日期窗口扫描、游标续跑、有界并发和结构化耗时。
  - Today 同步改为跨设备增量合并，使用客户端更新时间拒绝旧状态覆盖，并保护请求飞行期间的新本地操作。
  - 收藏增加幂等 outbox、操作回执和删除 tombstone；收藏工具与页面请求统一进入 `api-client`。
  - 截止日期变化生成新的 delivery key，微信失败重试不会重复创建站内消息。
- 验证：Sprint 8 专项 6/6、Smoke 72/72、全量 202/202、小程序检查和 diff 检查通过；真实微信请求 0，未运行真实 E2E。
- 注意：新增 migration 只创建表/索引；生产应用、真实双设备和微信订阅消息 staging 仍需 Human 审批与验收。未推送、未部署。

## 2026-09-08

### Sprint 7 商业化治理与 Mock 灰度准备

- 内容：
  - 保持月卡、季卡、年卡和体验会员的历史 planId 0～3 语义，在 4～6 新增 JD 简历包、7 天面试冲刺包和秋招季度包。
  - 新增幂等追加商业账本及场景包/订阅权益 Grant，覆盖订单、支付确认、权益、配额、退款和权益撤销。
  - 退款必须由本人明确确认并填写原因，管理员按申请→批准/拒绝→完成推进；完成必须记录已执行的外部退款凭据，随后撤销对应权益并重算会员状态。
  - 新增 readiness、5xx、AI 降级、cron、支付回调和权益异常告警，以及商业运营概览和告警确认/解决接口。
  - 小程序会员页展示 Free/Pro/场景包边界、当前权益包、订单和退款入口；场景包支付成功不会写入本地完整 VIP 状态。
- 验证：Sprint 7 专项 4/4、migration 5/5、Smoke 71/71、全量 195/195、`npm run check:release` 通过；AI 故障矩阵 7/7，外部请求 0；未运行真实 E2E。
- 注意：商业灰度默认 0%，提高比例必须显式设置 Human 审批标记；真实支付、外部退款、生产 migration、推送和部署均未执行。

### Sprint 6 OA、证据型项目与 Job Trust Score

- 内容：
  - 新增按公司、岗位和题型的 OA 训练计划、单一进行中计时练习、错题本及题型能力统计；成绩、耗时和错题均需本人确认，无样本时不推断能力。
  - Project Builder 改为本地规则生成的证据型项目计划，包含岗位差距、四个里程碑、数据来源、交付物和验收标准。
  - 里程碑完成必须留证，项目完成必须提供真实成果和交付物；只有本人确认的已完成项目才能写入经历库，未在证据中出现的数字会被拒绝。
  - 岗位详情增加 Job Trust Score，以官网链接信号、新鲜度、发布时间、重复度和用户本人官网状态组成 100 分辅助证据，并明确展示风险和不确定性。
- 验证：Sprint 6 专项 7/7、migration 5/5、全量 190/190、`npm run check:release` 通过；AI 质量矩阵 7/7，外部请求 0；未运行真实 E2E。
- 注意：官网/ATS 域名只是直链信号，系统没有替用户联网验证；生产 migration、真实用户灰度、真实支付和部署仍需 Human 审批。

### Sprint 5 Networking Copilot MVP

- 内容：
  - 新增联系人 CRM、真实阶段历史、联系方式/渠道、最近联系、下次跟进及岗位/申请/简历版本关联。
  - 支持 Connect Note、Cold Message、Coffee Chat、Follow-up、Referral Request 五类中英文可编辑规则草稿；未确认共同背景不会进入草稿。
  - 用户二次确认后才记录本人外部发送，系统不执行外发；跟进日期同步到 Today，完成提醒会清除待跟进状态。
  - 新增无伪成功率 Networking 漏斗；Referral 成功必须关联正式申请和简历。
- 验证：Sprint 5 专项 5/5、migration 5/5、全量 182/182、`npm run check:release` 通过；AI 质量矩阵 7/7，外部请求 0；未运行真实 E2E。
- 注意：当前草稿 `source=rules`，没有把联系人或用户资料发送给外部 AI；生产 migration、真实用户灰度和系统级通知仍需 Human 审批。

### Sprint 4 竞争力诊断与 AI 陪跑

- 内容：
  - 新增教育、经历、技能、项目、简历、面试和 Networking 七维证据评分，每维提供证据、差距和 Today 行动入口。
  - 基于真实申请状态与历史识别漏斗瓶颈，生成动态 3/6/12 月计划和不制造伪成功率的周报告。
  - 每日幂等生成 3～5 个服务端 Today 任务，支持完成、延期 1～30 天、跨设备同步和站内提醒时间。
  - 新增诊断/周报纯增量 migration、Career API、资源中心入口和小程序“竞争力陪跑”页面。
- 验证：Sprint 4 专项 5/5、migration 5/5、全量 176/176、`npm run check:release` 通过；AI 质量矩阵 7/7，外部请求 0；未运行真实 E2E。
- 注意：竞争力分数衡量系统内可核验证据，不是个人能力或录用概率；生产 migration、真实用户灰度和系统级推送仍需 Human 审批。

## 2026-09-04

### Sprint 3 三项高价值 AI 闭环

- 内容：
  - Job Match 增加 Safe/Target/Reach/Blocked 梯次、是否值得投的明确决策及可追溯 Sponsor/身份判断。
  - 岗位详情把 JD、岗位与申请上下文带入简历中心；用户选择真实简历当前版本并逐条确认后，系统创建不可变新版本并绑定回申请。
  - 面试空间增加公司×岗位×轮次 Brief；报告把弱项转成带专项深链的 Today 复练任务，并避免覆盖用户已有其他下一步。
- 验证：Sprint 3 专项 5/5、全量 170/170、`npm run check:release` 通过；AI 质量矩阵 7/7，外部请求 0；未运行真实 E2E。
- 注意：分层是申请资源配置建议，不是录用概率；Sponsor 未知必须核实，公民身份等硬冲突不能包装成 Reach。

### Sprint 2.5 数据库 migration baseline

- 内容：
  - 新增带事务、版本、SHA-256 和 baseline 前置结构检查的通用 migration runner。
  - 新增显式目标/备份/确认保护、只读状态命令和 SQLite 一致性 backup/restore 工具。
  - 新增隔离数据库的一键备份、迁移、幂等、故障回滚、恢复演练。
- 验证：migration 专项 5/5、全量测试 165/165；隔离演练 8 项检查通过，生产写入 0；未运行真实 E2E。
- 注意：生产 baseline 登记必须在 Human 审批和已验证备份之后执行；现有启动期 DDL 暂时保留为兼容兜底。

## 2026-05-09

### 第一批安全修复记录入库

- 提交：`2adbb1a Add security smoke tests and AI roadmap`
- 内容：
  - 新增 `AI功能清单开发.md`
  - 新增基础 `tests/smoke.test.js`
- 验证：`npm test` 通过，4/4。

### 第二批 P1 文档与测试

- 提交：`01f0608 Expand smoke tests and collaboration docs`
- 内容：
  - 新增 `AGENTS.md`
  - 新增 `DEVELOPMENT_STATUS.md`
  - 补充 `README.md`
  - 扩展后端 smoke tests
- 验证：`npm test` 通过，11/11。

### P1 决策实施

- 提交：`bcdc35b Fix Adzuna content-type as header not query param`
- 内容：
  - `data/jobs.json` 固定为唯一本地职位数据源
  - AI 助手/规划/工作流增加免费次数和 VIP 权限边界
  - `/api/users/resumes` 标记 deprecated
  - 新增支付 Mock 阶段说明
- 验证：`npm test` 通过，13/13。

### P1 AI 响应治理

- 提交：`240535b Complete P1 AI response governance`
- 内容：
  - AI 参数错误和上游错误统一为 `{ code, message, data }`
  - `career-plan`、`project-builder`、`workflow` 增加最小 JSON schema 校验
- 验证：`npm test` 通过，15/15。

### P2 上传安全与 CI

- 提交：`6e668c0 Extract shared upload security checks`
- 内容：
  - 新增 `utils/uploadSecurity.js`
  - 头像上传和后台 Banner 上传复用 MIME/magic bytes 校验
  - 新增 `.github/workflows/test.yml`
- 验证：`npm test` 通过，16/16。

## 协作注意事项

- 后端项目目录：`C:\Users\admin\Desktop\求职小程序\jobapp-server`
- 小程序项目目录：`C:\Users\admin\Desktop\求职小程序\求职小程序`
- 已有 deploy workflow 属于用户既有工作流，除非明确要求，不要修改。
- 真实微信支付上线前只保持 Mock 模式验证流程。
- `/api/users/resumes` 保留 6 个月兼容窗口，2026-11-09 后再评估下线。

## 2026-06-22

### 职位功能全局开关

- 新增 `RECRUITMENT_FEATURE_ENABLED` 服务端环境变量和 `/api/features` 公开状态接口。
- 关闭时统一拦截职位、职位聚合和一键申请接口，保留 Banner、校招、公司资料及个人网申记录接口。
- 小程序启动时同步并缓存开关状态，动态隐藏职位 Tab、首页岗位区域和职位收藏。
- 招聘相关页面增加直接访问守卫，旧分享链接或缓存路径会返回首页。
- 验证：后端 smoke tests 40/40 通过；小程序 JS 语法检查和包体检查通过。

## 2026-09-15 Web 申请包操作阶段

- 工作区返回用户可用的简历版本，选择时校验归属并同步申请关联。
- 申请详情接入 JD 匹配、ATS 检查，ATS 报告按当前岗位和简历版本保存。
- Cover Letter、Why Company、Why Role、Recruiter Message、Follow-up Email 支持编辑、归档。
- AI 申请材料支持生成、预览、手动修改、确认写入和拒绝；扩展旧数据库草稿类型约束并保留数据。
- 验证：`npm test` 215/215；`node --test tests/webWorkbench.test.js` 通过（含隔离子进程 8 项场景）。

## 2026-09-15 Web 岗位入口

- Web「职位」页接入 V4 岗位搜索，支持公司/岗位关键词查询与匹配分展示。
- 用户可从岗位结果一键加入申请管线，重复申请由服务端返回冲突提示。
- 加入后直接打开申请详情抽屉，保持岗位上下文。

## 2026-09-15 Web AI 确认写入

- AI 专家读取本人申请的服务端状态、下一步和 JD 摘要，联系方式脱敏。
- AI 回答支持编辑预览、确认追加到申请备注或创建申请任务；接口校验确认、归属和长度。
- Web 专项 4/4、隔离 API 场景 9/9、Edge 浏览器验收通过；最终 `check:release` 通过，215/215。
