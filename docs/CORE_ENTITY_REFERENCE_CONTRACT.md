# V4 核心实体引用与状态契约

> 生效日期：2026-09-03
>
> 适用范围：用户画像、岗位、申请、简历、面试、Today 任务及相关服务端埋点

## 1. 目标

V4 历史上同时存在客户端岗位 ID、官方岗位 ID、SQLite 主键和旧版状态字段。该契约在不立即迁移生产表的前提下，为 API 和埋点建立一个稳定的关联层，使“岗位 → 申请 → 简历 → 面试 → Today”可以从任意节点回溯。

本批采用兼容式收口：保留原有响应字段和埋点字段，新增统一 `refs`；不删除字段、不重写生产数据、不执行数据库 migration。

## 2. `refs` 固定结构

业务 API 返回完整结构，未知值保持 `null` 或空字符串：

```json
{
  "userId": 12,
  "jobId": "official-job-id",
  "applicationId": 34,
  "resumeId": 56,
  "resumeVersionId": 78,
  "interviewSpaceId": 90,
  "interviewSessionId": 91,
  "interviewReportId": 92,
  "todayTaskId": 93
}
```

| 字段 | 类型 | 规则 |
|---|---|---|
| `userId` | 正整数或 `null` | `users.id` |
| `jobId` | 字符串 | 优先官方 `source_job_id`，再使用 `job_id` |
| `applicationId` | 正整数或 `null` | `applications.id` |
| `resumeId` | 正整数或 `null` | `resumes.id` |
| `resumeVersionId` | 正整数或 `null` | `resume_versions_v4.id` |
| `interviewSpaceId` | 正整数或 `null` | `interview_spaces_v4.id` |
| `interviewSessionId` | 正整数或 `null` | `interview_sessions_v4.id` |
| `interviewReportId` | 正整数或 `null` | `interview_reports_v4.id` |
| `todayTaskId` | 正整数或 `null` | `today_tasks_v4.id` |

所有 SQLite 主键只输出正整数；空值、负数、小数或非数字值归一为 `null`。`jobId` 是外部业务标识，因此保持字符串，不能强制转成数字。

埋点 payload 继续保留既有顶层字段，同时增加紧凑版 `refs`；紧凑版会移除所有未知值，避免事件体积无意义增长。

## 3. Canonical Job ID

岗位唯一引用按以下优先级解析：

1. `sourceJobId`
2. `source_job_id`
3. `jobId`
4. `job_id`

例如旧记录 `{ job_id: "client-local-1", source_job_id: "official-1" }` 的 canonical Job ID 必须是 `official-1`。申请详情、简历关联、面试空间、报告、Today 任务和埋点均遵守同一规则。

## 4. 关系链

```text
User
 └─ Application ── canonical Job
     ├─ Resume ── Resume Version
     ├─ Interview Space
     │   └─ Interview Session
     │       └─ Interview Report
     │           └─ Today Task (source_type=interview_report)
     └─ AI Agent Task
         └─ Today Task (source_type=ai_agent)
```

Today 任务按来源恢复引用：

| `source_type` | `source_id` 指向 | 可恢复引用 |
|---|---|---|
| `interview_report` | `interview_reports_v4.id` | 报告、会话、空间、申请、岗位 |
| `ai_agent` | `ai_agent_tasks_v4.id` | 申请、岗位（任务有关联申请时） |
| `application` | `applications.id` | 申请、岗位、简历版本 |
| `home_local` | 客户端本地任务散列值 | 用户、Today 任务 |

## 5. 状态字段口径

不同实体不共用一套枚举；`status` 只描述当前实体自身生命周期。

| 实体 | 规范状态 | 说明 |
|---|---|---|
| 申请 | `interested`、`preparing`、`applied`、`oa`、`phone_screen`、`interview_1`、`interview_2`、`final`、`offer`、`rejected`、`withdrawn` | API 以 V4 状态为准；旧 `status/progress_status` 仅用于兼容映射与写回 |
| 面试会话 | `active`、`completed`、`cancelled` | 完成或取消后不可继续答题 |
| Today 任务 | `pending`、`completed` | `completed` 布尔值是 `status === "completed"` 的派生字段 |
| 简历 AI 修改方案 | `pending`、`confirmed`、`rejected` | 确认前不得生成或覆盖正式版本 |
| 申请文案草稿 | `pending`、`confirmed`、`rejected` | 确认前不得保存为正式申请材料 |
| AI Agent 任务 | `queued`、`running`、`awaiting_confirmation`、`completed`、`failed`、`cancelled` | 有写操作时必须进入 `awaiting_confirmation` |

申请状态转换继续由 V4 状态机限制；禁止客户端通过旧字段绕过合法转换。其他实体只能通过各自 API 完成状态变化，不能把一个实体的状态解释成另一个实体的进度。

## 6. 兼容与演进

- 旧字段暂时保留，客户端可以逐页迁移到 `refs`，无须同时发版。
- 本批不增加外键、不重命名表字段、不批量更新历史记录。
- 数据库迁移作为 Sprint 2 独立批次：先盘点孤儿记录和双轨 ID，再编写可重复 migration、dry-run、备份与回滚。
- 后续若移除旧字段，必须先证明线上客户端和埋点消费者均已使用 `refs`，并在独立版本中发布。

## 7. 验证要求

- 工具函数专项测试覆盖 ID 规范化、岗位 ID 优先级、完整/紧凑引用。
- 集成测试必须覆盖申请、简历关联、面试空间/会话/报告、Today 来源回溯。
- 默认执行专项单测、`npm run check:release`、静态检查和人工微信预览；真实微信 E2E 仅在 Human 明确要求时运行。
