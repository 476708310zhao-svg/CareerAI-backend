# V4 Sprint 1 后端基座

## 本批范围

本批实现 V4 核心闭环的后端起点，不改动登录、支付、小程序页面和 V3 既有接口。

### 用户画像

- `GET /api/v4/profile`：读取 V4 求职画像。首次读取会从 V3 用户教育和求职偏好迁移初始值。
- `PUT /api/v4/profile`：更新学校、专业、毕业年份、签证、Sponsor 需求、目标岗位、城市、技能和项目。
- `GET /api/v4/profile/completion`：返回完成度和缺失字段。

所有接口需要 `Authorization: Bearer <token>`。

### 岗位匹配

- `POST /api/v4/jobs/:id/match`：计算并保存岗位匹配结果。
- `GET /api/v4/jobs/:id/match`：读取最近一次匹配结果。

结果包含：

- `qualificationStatus`：`eligible`、`partial`、`ineligible`
- `score`：0–100
- `dimensions`：资格、技能、岗位与项目三个分项
- `qualificationReasons`、`strengths`、`gaps`、`actions`
- `recommendation`：`priority`、`recommended`、`cautious`、`not_recommended`

匹配结果以用户、岗位、画像版本和 JD 指纹为唯一键，重复计算不会产生重复记录。

资格层已覆盖工作授权、Citizen Required、Sponsor、目标地区、最低学历、毕业年份和专业相关性。技能与项目层仍保持确定性规则，后续可在不改变接口结构的情况下接入 AI 语义分析。

### Sponsor 岗位资料

- `GET /api/v4/jobs`：返回带匹配摘要和 Sponsor 资料的岗位列表，支持 `optFriendly`、`stemFriendly`、`h1bSponsor`、`internationalStudentFriendly`、`excludeCitizenRequired` 筛选。
- `GET /api/v4/jobs/:id/sponsor`：读取岗位 Sponsor 资料和证据。
- `GET /api/v4/jobs/:id/detail`：聚合岗位、Sponsor、匹配、公司和当前申请记录。

V3 `visaSponsored` 会迁移为带来源、可信度和证据的 Sponsor 资料；推断结果不伪装成官方确认数据。

后台核验接口使用现有管理员 JWT 和 `jobs` 权限：

- `GET /admin/api/v4/sponsor-profiles`
- `PUT /admin/api/v4/sponsor-profiles/:jobId`
- `GET /admin/api/v4/sponsor-profiles/:jobId/history`

每次人工核验都会写入 `job_sponsor_history`，保存修改前后数据、操作者和备注。

批量匹配：

- `POST /api/v4/jobs/matches/recalculate`：按 `jobIds` 或前 100 个岗位重新计算。
- `GET /api/v4/jobs/matches/summary`：返回用户最近匹配结果的平均分和资格分布。

### 申请状态

- `PATCH /api/v4/applications/:id/status`
- `GET /api/v4/applications/:id/history`

状态路径：

`interested → preparing → applied → oa / phone_screen / interview_1 → interview_2 → final → offer`

分支状态为 `rejected`、`withdrawn`。非法跨级更新返回 HTTP 409，并给出当前允许的下一状态。状态更新和历史写入位于同一数据库事务中。

CRM 接口：

- `GET /api/v4/applications/board`：准备申请、已申请、面试中、Offer、已关闭分组与统计。
- `POST /api/v4/applications`：从岗位创建申请记录并初始化历史。
- `GET /api/v4/applications/:id/detail`：聚合申请、历史、联系人、任务、材料和匹配结果。
- `PATCH /api/v4/applications/:id`：更新截止时间、面试时间、笔记、简历版本、下一步动作和 Cover Letter。
- `POST /api/v4/applications/:id/contacts`：添加申请联系人。
- `POST /api/v4/applications/:id/tasks`：添加下一步任务。
- `PATCH /api/v4/applications/:id/tasks/:taskId`：完成或恢复任务。

## 数据库变化

新增三张表，均通过 `CREATE TABLE IF NOT EXISTS` 幂等创建：

- `user_profiles`
- `job_matches`
- `application_history`
- `job_sponsor_profiles`
- `application_contacts`
- `application_tasks`
- `job_sponsor_history`

V4 行为埋点继续复用现有 `analytics_events`，避免创建重复的 `user_events` 表。

本批不删除或重命名任何 V3 字段；申请状态会同时写入 V3 可识别的兼容状态。

## V3 → V4 数据迁移

默认命令只输出迁移计划，不写数据库：

```bash
npm run migrate:v4
```

确认备份和计划后显式执行：

```bash
npm run migrate:v4 -- --apply
```

迁移会初始化尚无 V4 记录的用户画像、岗位 Sponsor 资料和申请状态历史。重复执行不会重复创建历史记录。

## 验证

```bash
npm test
```

测试覆盖画像迁移和更新、完成度、可解释岗位匹配、匹配缓存、合法/非法申请状态变更及历史记录。

验证结果（2026-07-13）：完整 `npm test` 通过，63 项测试全部成功，0 失败。

真实本地数据正式迁移已于 2026-07-13 执行：5 个用户画像、3 份申请历史完成初始化，80 个岗位 Sponsor 资料保持完整；迁移输出中全部 `pending` 归零。

迁移前备份：`db/backups/jobapp_pre_v4_20260713_165708.db`（6,107,136 bytes）。

迁移后二次 dry-run 已确认用户、岗位和申请全部 `pending=0`；随后完整运行 63 项测试，全部通过。
