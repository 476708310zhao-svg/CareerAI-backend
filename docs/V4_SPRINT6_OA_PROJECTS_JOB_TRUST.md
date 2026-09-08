# V4 路线 Sprint 6：OA、证据型项目与 Job Trust Score

> 完成日期：2026-09-08

## 交付范围

- OA Copilot：公司/岗位/题型训练计划、计时练习、错题本和题型能力统计。
- Evidence Project Builder：真实岗位差距、四个里程碑、数据来源、交付物、验收标准和完成证据。
- Job Trust Score：官网链接信号、信息新鲜度、发布时间、重复度、用户本人官网状态、风险与不确定性。

## 真实性边界

OA 正确数、总题数、耗时和错题只有在 `confirmSelfReported=true` 时才能保存并进入统计。没有已确认样本时，正确率和平均耗时返回 `null`，页面显示“不评估”。错题标记掌握需要 `confirmReviewed=true`。

Project Builder 生成的是计划，不是经历。里程碑完成必须填写 `evidenceNote` 并确认；项目完成必须满足四个里程碑全部完成且至少提交一项真实成果和一项可核验交付物。写入经历库需要再次确认，简历描述中的数字必须已出现在完成证据中。

Job Trust Score 仅聚合已有证据。系统会识别 HTTP/HTTPS 链接、来源与域名信号，但不会联网代替用户确认岗位有效。用户记录官网状态前必须确认本人已打开官网；缺失数据、过期、重复和状态风险都会明确展示。

## OA Copilot

支持题型：算法与编程、数理与图表、言语理解、逻辑推理、情景判断、Case Study、专业知识。

API：

- `GET /api/v4/oa/dashboard`
- `POST /api/v4/oa/plans`
- `PATCH /api/v4/oa/plans/:id`
- `POST /api/v4/oa/plans/:id/sessions`
- `POST /api/v4/oa/sessions/:id/complete`
- `POST /api/v4/oa/sessions/:id/abandon`
- `PATCH /api/v4/oa/mistakes/:id`

## Evidence Project Builder

规则模板覆盖数据、产品、工程、咨询、市场和运营六个方向，保存 `source=rules`，不调用外部 AI。项目可关联正式申请和岗位；画像完整时会合并真实 Job Match 差距，没有画像时仍可使用用户手填差距。

四个默认里程碑：

1. 定义问题与证据边界；
2. 建立基线与最小方案；
3. 完成核心交付物；
4. 按验收标准复核。

API：

- `GET /api/v4/projects/dashboard`
- `POST /api/v4/projects`
- `PATCH /api/v4/projects/:id/milestones/:milestoneId`
- `POST /api/v4/projects/:id/complete`
- `POST /api/v4/projects/:id/export-experience`

## Job Trust Score

| 证据项 | 上限 | 说明 |
|---|---:|---|
| 官网可验证性 | 25 | 用户本人已核对、官网/ATS 直链信号、普通链接或缺失 |
| 信息新鲜度 | 25 | 基于来源和已有更新时间，不用抓取时间冒充发布时间 |
| 发布时间 | 15 | 已知发布时间得完整证据分；缺失时明确标记 unknown |
| 重复度 | 15 | 同公司、岗位、地点的重复记录会降低分数并提示 |
| 官网状态记录 | 20 | 只读取用户本人记录的 active/closed/redirected/unavailable/unknown |

总分限制在 0～100。页面同时展示证据完整度、风险、推荐动作和以下提示：评分不能证明岗位真实、有效或一定适合投递。

API：

- `GET /api/v4/jobs/:id/trust`
- `POST /api/v4/jobs/:id/trust/observations`

## 数据库变更

Migration：`db/migrations/0004_sprint6_oa_projects_job_trust.sql`

- `oa_training_plans_v4`
- `oa_practice_sessions_v4`
- `oa_mistakes_v4`
- `career_projects_v4`
- `career_project_milestones_v4`
- `job_trust_observations_v4`

Migration 只新增表和索引。生产执行必须使用既有备份、显式目标、校验和及 Human 审批流程。

## 小程序

- `package-career/pages/oa-bank/oa-bank`：计划、计时、本人结果确认、错题复习、无样本不评估。
- `package-career/pages/project-builder/project-builder`：项目计划、里程碑留证、真实完成确认和经历库写入。
- `package-user/pages/job-detail/job-detail`：五项 Trust 证据、风险、官网链接和本人核验记录。

旧 Project Builder 页面中的外部 AI 生成、虚构量化成果和直接写本地简历路径已移除。

## 验证记录

- Sprint 6 专项：7/7。
- Migration 专项：5/5。
- 全量测试：190/190。
- `npm run check:release`：通过；AI 故障矩阵 7/7，外部请求 0，数据检查 Errors 0 / Warnings 4（均为既有告警）。
- `npm run check:miniprogram`：通过；媒体 191.2 KB，各分包低于限制。
- 未运行真实微信 E2E，未调用真实 AI，未操作生产数据库、真实支付、推送或部署。

## 后续

Sprint 7 的商业化灰度必须先取得 Human 对主体资质、商品、支付与退款方案的明确审批。审批前仅做方案、账本、监控和 Mock 验证，不开启真实支付或生产切流。
