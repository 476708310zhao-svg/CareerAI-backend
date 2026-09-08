# V4 路线 Sprint 4：竞争力诊断与 AI 陪跑

> 完成日期：2026-09-08
> 说明：仓库中已有 2026-07 的 `V4_SPRINT4_API.md`，本文对应 2026-09 路线图里的“竞争力诊断与 AI 陪跑”。

## 交付范围

- Career Competitiveness Score：教育、经历、技能、项目、简历、面试、Networking 七维。
- 每维输出评分状态、可核验证据、具体差距和行动入口。
- 真实申请漏斗驱动的 3/6/12 月动态计划。
- 每日 3～5 个服务端 Today 任务，支持完成、延期 1～30 天和跨设备同步。
- 周报告汇总投入、历史转化、当前瓶颈和下周重点；样本不足时不计算比例。

## 评分与真实性边界

诊断只读取当前账户中的画像、已核验经历、简历版本和岗位关联、面试报告、联系人记录、申请状态及历史。总分衡量“系统内求职准备证据完整度”，不是个人能力、录用概率或成功率。

低分项必须同时返回：

1. `evidence`：当前系统实际记录了什么；
2. `gap`：缺什么或哪些证据仍不完整；
3. `action`：用户能打开并执行的任务入口。

`rejected` 计入历史已投递样本，因为拒绝是投递后的真实结果。转化率只描述账户内历史记录；分母为零时返回“样本不足”。

## API

- `GET /api/v4/career/dashboard`：一次返回诊断、动态计划、周报告、今日任务和延期任务。
- `GET /api/v4/career/diagnostic`
- `POST /api/v4/career/diagnostic/tasks`：把指定维度或前三个优先维度加入 Today。
- `GET /api/v4/career/plan`
- `GET /api/v4/career/weekly-report`
- `POST /api/v4/career/today/generate`
- `GET /api/v4/today/tasks`：读取前自动幂等补齐当天 Career Coach 任务。
- `POST /api/v4/today/tasks/:id/defer`：延期 1～30 天。

所有接口使用既有登录鉴权，用户只能读取或修改自己的数据。

## Today 生成顺序

候选任务按以下优先级去重并截取最多 5 个：

1. 7 天内的面试；
2. 3 天内的申请截止；
3. 当前真实漏斗瓶颈；
4. 七维诊断最低分项；
5. 申请进度、画像或证据整理兜底任务。

任务持久化在 `today_tasks_v4`。`local_key` 与来源键保证同一天重复加载不重复创建。延期复用 `task_date`；返回的 `reminderAt` 表示站内 Today 09:00 提示，不表示微信订阅消息已经发送。

## 数据库变更

Migration：`db/migrations/0002_career_coach_snapshots.sql`

- `career_diagnostics_v4`：按用户和日期保存最新诊断快照。
- `career_weekly_reports_v4`：按用户和周起始日期保存最新周报告。

本 migration 只新增表和索引，不修改或删除旧业务表。生产执行前仍须通过既有备份、显式目标、校验和与 Human 审批流程。

## 小程序入口

- 页面：`package-career/pages/career-coach/career-coach`
- 入口：资源中心“竞争力陪跑”
- 功能：七维诊断、单维/优先项转 Today、任务完成与延期、延期数量、周报告、历史转化和动态计划。

## 验证记录

- Sprint 4 专项：5/5。
- Migration 专项：5/5。
- 全量测试：176/176。
- `npm run check:release`：通过。
- AI 质量故障矩阵：7/7；外部请求：0。
- 小程序媒体：191.2 KB；数据检查：Errors 0 / Warnings 4（均为既有告警）。
- 未运行真实微信 E2E，未调用真实 AI，未操作生产数据库、真实支付、推送或部署。

## 后续

Sprint 5 进入 Networking Copilot MVP：联系人 CRM、五类可编辑话术、跟进提醒、Referral 漏斗及岗位/简历/正式投递关联。任何外联内容都只生成草稿，不代替用户向外部人员发送。
