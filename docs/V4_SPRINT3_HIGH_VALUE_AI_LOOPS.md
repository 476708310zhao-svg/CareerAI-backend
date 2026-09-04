# V4 Sprint 3 高价值 AI 闭环

> 完成日期：2026-09-04
> 范围：Job Match、JD 定制简历、Interview Brief 与弱项复练
> 边界：未调用真实 AI、未运行微信 E2E、未推送、未部署、未操作生产数据或真实支付

## 1. 阶段结果

Sprint 3 将已有的评分、简历版本和模拟面试能力连接成三条可行动链路：

1. 岗位 → 匹配结论 → 投递资源配置；
2. 岗位/JD → 真实简历版本 → 逐条确认 → 不可变新版本 → 申请绑定；
3. 公司/岗位/轮次 → Interview Brief → 模拟报告 → 弱项复练 → Today/求职进度。

所有 AI 结果仍是辅助建议。岗位梯次不是录用概率，Sponsor 未知不能解释为支持，简历内容和写入动作必须由用户确认。

## 2. Job Match 契约

### 2.1 新增输出

| 字段 | 含义 |
|---|---|
| `tier` | `safe`、`target`、`reach` 或 `blocked` |
| `tierLabel` / `tierNote` | 用户可读梯次和边界说明 |
| `decision.code` | `apply`、`verify_then_apply`、`improve_then_apply` 或 `skip` |
| `decision.worthApplying` | `true`、`false` 或 `verify` |
| `decision.summary` | 结合总分、资格、技能与 Sponsor 证据的投递建议 |
| `sponsorAssessment` | 状态、标签、理由、来源和置信度 |

### 2.2 关键规则

- 公民身份等明确硬冲突必须进入 `blocked`，不能包装成 Reach。
- Safe 只表示当前条件较稳，不代表录用保证。
- Sponsor 证据未知或不足时使用 `verify_then_apply`。
- 已持有授权且不需要 Sponsor 时明确输出 `not_required`。
- 持久化时把策略写入 `job_matches.dimensions._strategy`；API 格式化后删除该内部键，外部 `dimensions` 仍只包含数值维度。
- 汇总接口直接按持久化后的 `tier` 计数，避免重复推导造成阈值漂移。

## 3. JD 定制简历闭环

### 3.1 用户流程

1. 用户在岗位详情查看 Job Match 并选择“去优化简历”。
2. 小程序通过 `pendingResumeOptimization` 携带 `jobId`、`applicationId`、公司、岗位和 JD。
3. 简历中心展示目标上下文，要求用户选择一份真实简历，并显示当前版本 ID。
4. 后端基于该简历的当前不可变版本生成建议；每条包含原文、建议内容和具体理由。
5. 默认拒绝全部建议，用户逐条接受或继续手动编辑。
6. 用户确认后创建新版本，不覆盖来源版本；同时记录岗位关联并把新版本绑定回申请。
7. 用户仍可查看、比较或恢复历史版本；恢复操作同样创建新版本。

### 3.2 一致性与写入保护

- 若请求的 `jobId` 与 `applicationId` 对应岗位不一致，返回 `409 JOB_APPLICATION_MISMATCH`。
- 未显式传 `jobId` 时，使用申请记录的 canonical Job ID。
- JD 优先使用显式上下文；缺失时读取申请岗位快照。
- 只有确认接口执行新版本、岗位关联和申请绑定写入，且在同一数据库事务内完成。

## 4. Interview Brief 与复练闭环

### 4.1 Brief 输出

- `companyFocus`：公司理解、岗位动机和真实成果准备；
- `jdCapabilities`：从保存的 JD/申请信息提取的能力重点；
- `roundFocus`：电话筛选、一面、二面、终面或 HR 的差异化重点；
- `historicalPatterns`：已保存的公开面经题型；
- `starMaterials`：用户经历库中已核验的经历和项目证据；
- `reverseQuestions`：可用于反问的业务、团队与流程问题；
- `evidenceNotice`：明确缺失信息不会由 AI 补造。

### 4.2 弱项复练

- 报告根据低分维度生成 `practicePlan` 和专项深链。
- Today 任务使用 `task_type=interview_repractice` 和唯一 `local_key`，防止重复写入。
- 深链携带面试空间 ID 与 `focus` 维度，用户可直接进入专项复练。
- 申请 `next_action` 仅在为空或原本就是复练任务时更新；用户已有其他下一步时保持原值。

## 5. 验收证据

- Sprint 3 专项：5/5；
- 全量测试：170/170；
- `npm run check:release`：通过；
- AI 故障矩阵：7/7，外部请求 0；
- 小程序媒体：191.2 KB；
- 数据内容检查：Errors 0，Warnings 4（均为既有项）；
- `git diff --check`：通过。

## 6. Sprint 4 接口点

下一阶段建议复用本批已有证据，不再平行创建另一套评分：

- 从 Job Match 的资格、技能和项目维度聚合岗位侧差距；
- 从简历版本、已核验经历和面试报告聚合材料与表达差距；
- 从七阶段漏斗和 Today 完成情况计算真实行为进度；
- Career Competitiveness Score 的每个低分项必须返回证据、差距、行动入口和更新时间；
- 所有自动计划先生成候选任务，仍由用户确认或按已有安全规则写入。
