# V4 Sprint 7 商业化治理与灰度说明

更新时间：2026-09-08

## 1. 本批边界

本批只完成商业化代码治理、本地 Mock 流程和审计能力，不代表真实支付已上线。未执行生产数据库 migration、真实微信支付、真实外部退款、真实用户放量、推送或部署。

## 2. 套餐与历史兼容

| planId | code | 类型 | 有效期 | 边界 |
|---:|---|---|---:|---|
| 0 | `pro_month` | Pro 订阅 | 30 天 | 完整 Pro 权益；保留历史语义 |
| 1 | `pro_quarter` | Pro 订阅 | 90 天 | 完整 Pro 权益；保留历史语义 |
| 2 | `pro_year` | Pro 订阅 | 365 天 | 完整 Pro 权益；保留历史语义 |
| 3 | `pro_trial_7d` | Pro 体验 | 7 天 | 完整 Pro 权益；保留历史语义 |
| 4 | `jd_resume_pack` | 场景包 | 30 天 | 5 个简历版本、10 次申请助手 |
| 5 | `interview_sprint_7d` | 场景包 | 7 天 | 20 次面试训练、每日 20 次 AI |
| 6 | `autumn_recruit_quarter` | 场景包 | 90 天 | 投递、简历、面试和 AI 组合额度 |

Free 默认保留每日 3 次 AI、3 个简历版本、每月 2 次面试等基础额度。场景包与 Free/Pro 的额度叠加，但场景包本身不把 `vip_level` 改为会员。

## 3. 统一账本

`commerce_ledger_v4` 是追加式审计账本，`idempotency_key` 唯一。当前事件包括：

- `order_created`
- `payment_confirmed`
- `entitlement_granted`
- `quota_used`
- `refund_requested` / `refund_approved` / `refund_rejected` / `refund_completed`
- `entitlement_revoked`
- `payment_callback_rejected`

订单与 `order_created` 同事务写入；支付确认、权益发放和退款事件使用稳定幂等键。支付回调重复到达不会重复创建 Grant 或重复记收入。

## 4. 权益 Grant

`entitlement_grants_v4` 以订单和套餐唯一，区分 `subscription` 与 `scenario`，状态为 active、expired 或 revoked。会员状态读取基础套餐后，再叠加有效场景包；过期或退款撤销的 Grant 不再参与配额计算。

旧订单兼容规则：planId 0～3 不改变含义；若历史 paid 订单缺少 Grant，校验时按已有会员到期日或订单日期补记，不重复延长已有 Grant。

## 5. 退款状态机

```text
用户确认并填写原因 → requested → 管理员 approved / rejected
                                      approved → completed
```

`completed` 需要同时满足：

1. 管理员已审核为 approved；
2. `confirmExternalRefund=true`；
3. 提供非空外部退款凭据；
4. 记录负金额账本；
5. 撤销对应 Grant 和订阅；
6. 重新计算用户会员状态。

系统当前不调用外部退款接口，只记录 Human 已经执行的外部结果。

## 6. 告警与运营

商业告警覆盖：数据库 readiness、15 分钟 5xx、AI 降级率、最近 cron 失败、15 分钟支付回调拒绝、24 小时内已支付但缺少支付/权益账本。告警可 acknowledged 或 resolved；持续信号不会抹掉确认状态，信号恢复后自动解决。

运营概览提供净账本金额、支付订单数、退款申请数、有效 Grant、额度事件和未解决告警。该面板始终明确：真实支付和外部退款没有由面板执行。

## 7. 灰度与回滚

- `rollout_config_v4.feature='commerce'` 默认 `percentage=0`、`status=paused`。
- 未设置 `COMMERCE_ROLLOUT_APPROVED=true` 时，任何大于 0% 的商业灰度请求返回 403。
- 支付关闭时 Free 功能和既有求职工作台继续工作。
- 暂停只需把商业灰度恢复为 0%；新增表不要求删除，保留审计证据。

## 8. 上线前 Human 门禁

- 主体资质、微信商户/虚拟支付资格和商品配置已审核；
- 套餐价格、权益、退款政策、客服流程和隐私披露已审核；
- 生产数据库已完成明确目标确认、备份、恢复验证和 migration checksum 审核；
- 沙箱支付、重复回调、金额不符、退款凭据和权益撤销均有证据；
- 先保持 0%，再进入 5% 小流量并观察 30～60 分钟；
- 5xx、readiness、AI 降级、cron、支付回调和权益异常告警有真实通知接收人；
- 任一关键异常可立即恢复 0%，不影响 Free 功能。

## 9. 本地验证

- Sprint 7 专项：4/4
- migration：5/5
- 服务端 Smoke：71/71
- 全量测试：195/195
- AI 故障矩阵：7/7，外部请求 0
- 小程序静态检查通过，媒体总量 191.2 KB
- 数据检查 Errors 0 / Warnings 4（既有本地/Mock/占位提示）
- 未运行真实微信 E2E
