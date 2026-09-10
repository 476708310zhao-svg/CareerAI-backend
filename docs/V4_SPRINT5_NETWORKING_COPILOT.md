# V4 路线 Sprint 5：Networking Copilot MVP

> 完成日期：2026-09-08

## 交付范围

- 联系人 CRM：公司、岗位、渠道、联系方式、关系背景、当前阶段、最近联系、下次跟进和备注。
- 五类可编辑草稿：Connect Note、Cold Message、Coffee Chat、Follow-up、Referral Request。
- 服务端跟进提醒：下次跟进日期自动写入 Today，支持跨设备同步和完成。
- 真实漏斗：已联系、已回复、Coffee Chat、Referral。
- Referral 结果关联 canonical Job、正式申请、简历和不可变简历版本。

## 真实性与外发边界

- 草稿只读取当前账户画像、联系人资料、目标岗位和用户明确输入的请求。
- `relationshipContext` 只有在 `contextVerified=true` 时才会进入草稿；未经确认的校友、共同经历或关系不会被采用。
- Referral Request 至少要在联系人阶段达到“已回复”后才能生成。
- 草稿会明确把是否推荐的决定权留给联系人，不声称用户已获得推荐。
- 系统只生成、保存和复制草稿。`mark-sent` 必须传入 `confirmExternalSend=true`，且返回 `sentBySystem=false`；接口不会向 LinkedIn、邮箱或其他外部渠道发送消息。

当前 MVP 的草稿来源为 `rules`，未调用外部 AI 供应商，也没有上传联系人或用户资料。后续若启用模型生成，必须继续执行 PII 脱敏、无虚构关系、用户确认、额度和灰度门禁。

## 联系人阶段

`prospect → contacted → replied → coffee_chat → referral`

另有 `closed` 表示结束跟进。每次阶段更新追加写入 `networking_events_v4`；漏斗按联系人曾达到的最高阶段统计。分母为零时返回“样本不足”，漏斗不用于预测回复率或 Referral 成功率。

## API

- `GET /api/v4/networking/dashboard`
- `GET /api/v4/networking/contacts`
- `POST /api/v4/networking/contacts`
- `PATCH /api/v4/networking/contacts/:id`
- `POST /api/v4/networking/contacts/:id/stage`
- `GET /api/v4/networking/drafts`
- `POST /api/v4/networking/contacts/:id/drafts`
- `PATCH /api/v4/networking/drafts/:id`
- `POST /api/v4/networking/drafts/:id/mark-sent`
- `POST /api/v4/networking/contacts/:id/referral`

所有资源按登录用户隔离。已标记外部发送的草稿不可覆盖；需要修改时创建新版本。

## Today 提醒

设置 `nextFollowUpAt` 后，服务端在 `today_tasks_v4` 创建 `source_type=networking_contact` 的任务并带联系人页面深链。修改日期会替换尚未完成的旧提醒；完成 Today 任务后会同步清空联系人待跟进日期。该能力是站内 Today 提醒，不表示微信订阅消息已经发送。

## Referral 关联

`outcome=referred` 前必须存在本人拥有的正式申请和简历。服务端校验并保存：

- `application_id`
- `job_id`
- `resume_id`
- `resume_version_id`

记录 Referral 不会自动修改申请状态，也不会声称已经完成正式投递。

## 数据库变更

Migration：`db/migrations/0003_networking_copilot.sql`

- `networking_contacts_v4`
- `networking_drafts_v4`
- `networking_events_v4`

Migration 只新增表和索引，不删除、截断或修改旧业务表。旧 `application_contacts` 和 `/api/ai/networking` 保持兼容。

## 小程序

- 页面：`package-career/pages/networking/networking`
- 入口：资源中心“Networking Copilot”
- 功能：联系人新增/编辑、申请和简历关联、阶段更新、Referral 结果、真实漏斗、五类草稿、编辑/保存/复制、本人外部发送确认和跟进日期。

## 验证记录

- Sprint 5 专项：5/5。
- Migration 专项：5/5。
- 全量测试：182/182。
- `npm run check:release`：通过。
- AI 质量故障矩阵：7/7；外部请求：0。
- 小程序媒体：191.2 KB；数据检查：Errors 0 / Warnings 4（均为既有告警）。
- 未运行真实微信 E2E，未调用真实 AI，未操作生产数据库、真实支付、外部联系人、推送或部署。

## 后续

Sprint 6 进入 OA Copilot、证据导向 Project Builder 和 Job Trust Score。任何项目成果必须由用户确认真实完成后才能回写简历；岗位可信度结论必须展示证据和不确定性。
