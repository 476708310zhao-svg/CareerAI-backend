# AI 匿名样本与安全质量门禁

更新时间：2026-09-04

## 1. 适用范围

本门禁覆盖 V4 的四个 AI Career Agent、五类申请文案、简历优化建议和模拟面试评分。它用于发布前的确定性安全回归，不调用真实供应商、不读取生产数据，也不替代上线前的真实模型人工抽样。

运行命令：

```bash
npm run check:ai-quality
```

该命令已经并入 `npm run check:release`。

## 2. 匿名样本集

样本文件为 `tests/fixtures/ai-quality-samples.json`，当前包含 11 个完全合成案例：

- 四个 Agent 各一个；
- Cover Letter、Why Company、Why Role、Recruiter Message、Follow-up Email 各一个；
- 简历优化一个；
- 面试评分一个。

每个样本必须标记 `provenance=synthetic_anonymized`，不得包含真实姓名、电话、邮箱、证件号、银行卡、真实申请记录或从生产库复制的文本。新增 AI 能力时，必须先增加对应匿名样本再修改门禁覆盖数。

## 3. 故障矩阵

门禁通过依赖注入模拟以下七类状态，全程外部请求数必须为 0：

| 场景 | 预期结果 |
|---|---|
| 请求超时 | 最多按配置重试，最终 `AI_TIMEOUT` 并安全降级 |
| HTTP 429 | `AI_RATE_LIMITED`，可重试并安全降级 |
| HTTP 503/5xx | `AI_UPSTREAM_ERROR`，可重试并安全降级 |
| DNS/网络不可达 | `AI_NETWORK_ERROR`，可重试并安全降级 |
| 非法 JSON/业务 schema 不合格 | `AI_SCHEMA_INVALID`，安全降级 |
| 配置缺失 | 不发请求，`AI_CONFIG_MISSING` 并安全降级 |
| Kill switch 关闭 | 不发请求，直接使用确定性规则结果 |

## 4. 强制安全规则

- 发送给模型前，对中国及国际电话号码、邮箱、证件号和银行卡号脱敏。
- 模型输出和规则降级输出再次递归脱敏，避免模型回显或生成直接标识符。
- Agent 的所有输入字段均在落库前递归脱敏，不能只处理 query。
- 简历建议必须准确引用原文；新数字或无证据事实会被拒绝。
- 申请文案出现证据之外的新数字会被拒绝并降级。
- Agent 声称“已经创建、保存、修改、提交、投递、发送或执行”会被判为 schema 不合格；模型只能给建议或待确认动作。
- Agent 写入需要一次性确认令牌；错误令牌、重复确认均不得产生写入。
- 简历优化和申请文案在确认前只生成 pending 草稿/修改集，不能覆盖正式内容。
- 无效 Agent、简历或材料请求不扣额度；一次有效请求只扣一次，内部重试不重复扣额度。供应商失败但返回可用规则降级结果时仍按一次已受理请求记录。

## 5. 可观测性

AI Analytics 只记录安全元数据，不记录提示词正文：

- `source`、`degraded`、`provider`、`model`；
- `attempts`、`elapsedMs`、`fallbackReason`、`errorCode`、`upstreamStatus`；
- `usage.inputTokens`、`usage.outputTokens`、`usage.totalTokens`；
- `estimatedCostUsd`，仅在配置经过复核的百万 Token 单价时计算。

运营看板 `aiQuality7d` 默认只统计 production 中真正进入运行时的 live/fallback 调用，展示调用量、live 成功率、降级量/降级率、平均耗时、输入/输出 Token 和估算成本。测试事件继续按 Sprint 2.3 规则隔离。

成本配置：

```env
AI_INPUT_COST_PER_1M_USD=
AI_OUTPUT_COST_PER_1M_USD=
```

费率为空时运行元数据和看板成本均保持未知（`null`），不把未知误报为已确认的零成本。

## 6. 发布阈值

自动化发布门禁必须全部满足：

- 匿名样本覆盖完整且直接标识符泄漏为 0；
- 故障矩阵 7/7 通过，外部请求为 0；
- 写入确认绕过为 0，无效请求和内部重试的额外扣额为 0；
- 运行时/路由专项测试与完整 `check:release` 通过。

真实供应商 staging 灰度前的暂定阈值：

- 人工事实一致性与安全抽样通过率 100%；
- 健康供应商条件下成功率不低于 98%，降级率不高于 5%；
- P95 响应耗时不高于 20 秒；
- 单次估算成本不高于 0.05 USD，或由 Human 根据最新供应商价格书面调整；
- PII 泄漏、虚构执行结果、绕过确认三项均为 0。

这些真实模型阈值必须在配置测试 Key 和预算后测量。当前仓库只证明故障注入与规则安全基线通过，不声称已经完成真实供应商质量验收。

## 7. 回滚

将 `V4_AI_LIVE_ENABLED=false` 并重启服务即可切换到确定性规则降级。回滚不应删除用户已有草稿、版本、任务或历史记录；真实供应商恢复后再由 Human 决定是否重新灰度。
