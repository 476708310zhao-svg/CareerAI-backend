# V4 Sprint 4：面试闭环与上线工程

## 岗位专属面试空间

- 申请进入 `phone_screen`、`interview_1`、`interview_2`、`final` 时自动创建空间。
- 空间包含公司、岗位、面试时间、轮次、准备完成度、公司历史面经、高频题、算法题、行为题和岗位专项题。
- `GET /api/v4/interviews/spaces`
- `GET/PATCH /api/v4/interviews/spaces/:id`

## AI 面试与能力报告

- `POST /api/v4/interviews/spaces/:id/sessions`：开始模拟面试或 STAR 训练。
- `POST /api/v4/interviews/sessions/:id/answers`：提交单题并获得内容、结构、表达、岗位匹配评分。
- `POST /api/v4/interviews/sessions/:id/complete`：生成总体报告。
- `POST /api/v4/interviews/sessions/:id/cancel`
- `GET /api/v4/interviews/reports|trends|today-tasks`
- 报告最低维度自动转为 Today 补强任务。

## AI Career 四 Agent

- `job_advisor`：AI 岗位顾问
- `application_assistant`：AI 申请助手
- `interview_coach`：AI 面试教练
- `career_planner`：AI 职业规划师

任务接口为 `GET/POST /api/v4/agents/tasks` 和 `retry|cancel|confirm` 操作。状态机为 `queued -> running -> completed / failed / awaiting_confirmation / cancelled`。手机号、邮箱、证件号和银行卡号在进入 Agent 上下文前脱敏；写操作必须使用用户确认令牌。

## 埋点与运营看板

已补齐画像、岗位浏览/匹配、加入申请、官方投递、状态变更、简历优化、申请材料、面试训练、Today 任务、会员查看/购买和 Agent 使用事件。

- `GET /admin/api/v4/operations/dashboard`
- 输出 7 日活跃、7 日留存、岗位到申请漏斗、AI 使用率、会员订单、慢接口与错误事件。
- 管理后台 `dashboard.html` 已接入 V4 运营卡片。

## 会员与配额

- `GET /api/v4/membership/plans|status|orders`
- 免费版默认：AI Agent 每日 3 次、每份简历 3 个版本、每月 2 次面试训练。
- Pro 包含高级岗位匹配、更高简历版本和训练额度。
- 到期会员查询权益时自动降级并同步订阅状态。
- 真实支付使用 `PAYMENT_ENABLED` 和 `REAL_PAYMENT_LAUNCH_APPROVED` 双开关；后者默认 `false`。

## 上线工程

- 正向迁移：`npm run migrate:v4 -- --apply`
- 回滚预检：`npm run rollback:v4`
- 正式回滚：`npm run rollback:v4 -- --apply --confirm=ROLLBACK_V4`
- 灰度：`npm run rollout:v4 -- 5 --apply`，只允许 `0/5/20/50/100`。
- 功能开关：`v4_interview`、`v4_ai_career`、`v4_membership`，默认关闭。
- API 性能慢请求阈值 800ms；未处理错误写入 `error_events_v4`。

## 新增核心数据表

`interview_spaces_v4`、`interview_sessions_v4`、`interview_answers_v4`、`interview_reports_v4`、`today_tasks_v4`、`ai_agent_tasks_v4`、`membership_plans_v4`、`user_subscriptions_v4`、`quota_usage_v4`、`payment_refunds_v4`、`rollout_config_v4`、`error_events_v4`、`api_performance_v4`。
