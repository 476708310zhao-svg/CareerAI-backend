# 求职漏斗埋点契约

更新时间：2026-09-04
事件版本：`1`

## 1. 目标与统计边界

本契约用于追踪用户从查看岗位到收到 Offer 的真实求职进展。运营漏斗只信任服务端产生的 canonical 事件，并以独立用户数作为阶段人数；客户端行为事件可用于产品分析，但不能直接证明用户已经完成投递、进入真实招聘面试或收到 Offer。

默认运营口径为最近 30 天的 production 数据。它是窗口内各阶段独立用户数的横截面对比，不是严格的同 cohort 转化或渠道归因模型。

## 2. 七阶段 canonical 事件

| 顺序 | 事件 | 触发条件 | 必需引用 |
|---|---|---|---|
| 1 | `job_viewed` | 已登录用户成功取得岗位详情 | `jobId` |
| 2 | `job_matched` | 普通或高级岗位匹配成功完成 | `jobId` |
| 3 | `resume_optimized` | 用户确认 AI 修改并生成不可变的新简历版本 | `resumeId`、`resumeVersionId` |
| 4 | `application_added` | 岗位加入申请看板 | `jobId`、`applicationId` |
| 5 | `application_submitted` | 申请状态首次进入已投递/OA 阶段 | `jobId`、`applicationId` |
| 6 | `interview_reached` | 申请状态首次进入电话面、一面、二面或终面阶段 | `jobId`、`applicationId` |
| 7 | `offer_received` | 申请状态进入 Offer | `jobId`、`applicationId` |

`resume_optimized` 可以关联 `jobId` 和 `applicationId`，但二者不是事件成立的硬性条件；用户可能先优化通用简历，再创建申请。

## 3. 容易混淆的事件

- `official_apply_clicked`：只证明用户点击了官方招聘链接，不等于完成投递。
- `interview_training_started`、`interview_training_completed` 等：只表示模拟训练，不等于进入真实招聘面试。
- `application_status_changed`：用于状态审计，不直接作为漏斗阶段统计。
- `advanced_job_matched`：保留高级匹配产品行为分析；同一次成功匹配还会产生 canonical `job_matched`。
- 旧 `resume_suggestions_accepted`：由 `resume_optimized` 替代；新代码不再写入。

## 4. 事件结构

每条 canonical 事件必须包含：

- `source=server`；
- `event_version=1`，payload 同时包含 `eventVersion=1`；
- `payload.funnelStage` 与事件名一致；
- `payload.refs`，使用核心实体引用契约中的规范 ID；
- `payload.missingRefs`，列出该阶段缺失的必需引用，完整事件为空数组。

`refs` 只保存存在的核心 ID，不填充空字符串。服务端继续对 payload 中的手机号、邮箱和证件号做脱敏，并限制序列化长度；漏斗 payload 不应放入简历正文、聊天原文或其他不必要的个人信息。

## 5. 数据分类与隔离

| `data_class` | 用途 | 默认运营看板 |
|---|---|---|
| `production` | 真实用户和正式业务数据 | 包含 |
| `demo` | 演示 fallback、mock/default 标识数据 | 排除 |
| `test` | smoke、test、fixture 和自动化测试账号 | 排除 |
| `system` | 系统任务或非用户业务事件 | 排除 |

服务端可通过 `ANALYTICS_DATA_CLASS` 为整个运行实例显式指定分类。测试环境必须设置为 `test`，演示实例必须设置为 `demo`。小程序启用 `ENABLE_DEMO_FALLBACK` 时，客户端事件自动标为 demo；常规 `local-*` 业务 ID 不会被误判为演示数据。

运营接口默认 `dataClass=production`，管理员可显式选择 `demo`、`test`、`system` 或 `all` 排查数据质量。非法参数回退到 production。

## 6. 看板指标

- `users`：阶段内去重后的 `user_id` 数量，是主漏斗人数。
- `events`：阶段的原始服务端事件数，用于发现重复触发和异常流量。
- `conversionFromPrevious`：当前阶段 users / 上一阶段 users。
- `analyticsQuality.missingRefs`：选定分类中必需引用不完整的 canonical 事件数。
- `analyticsQuality.dataClasses`：近 30 天各数据分类的事件量，用于检查污染。

用户可能跨窗口进入后续阶段或跳过某一步，因此相邻转化率偶尔可能超过 100%。需要严格归因时，应另建按用户、起始时间和渠道锁定的 cohort 查询，不能修改本契约的事件含义。

## 7. 兼容与后续治理

Analytics 表本批采用幂等加列兼容旧数据库，旧记录按 production 读取，不删除、不回填和不改写业务表。Sprint 2.5 将这些字段纳入正式 migration baseline，并补备份恢复演练。

生产上线后应以只读方式抽样核对申请状态历史与 canonical 事件，确认去重、留存、AI 使用率和分类准确性；任何导出都必须遵守最小字段、权限控制和脱敏要求。
