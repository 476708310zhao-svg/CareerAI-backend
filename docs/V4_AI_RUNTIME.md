# V4 AI 生产运行时说明

> 更新时间：2026-07-16
>
> 状态：代码接入完成，生产供应商密钥验收待执行

## 1. 覆盖范围

统一 AI 运行时已接入以下 V4 能力：

- AI Career 四个 Agent；
- 申请材料中心：定制简历、Cover Letter、Recruiter 消息、Follow-up 邮件；
- AI 简历逐条修改建议；
- 模拟面试单题评分和反馈。

所有保存或写入操作仍由原有服务端流程控制。AI 只能生成草稿和建议，不能绕过用户确认令牌、简历版本机制或申请材料确认接口。

## 2. 运行模式

### 规则降级模式

默认配置为 V4_AI_LIVE_ENABLED=false。此时不会发送外部模型请求，接口使用已测试的确定性规则结果，适合本地开发、自动化测试和供应商故障降级。

### 真实模型模式

配置供应商 API Key，并将 V4_AI_LIVE_ENABLED 设置为 true 后，运行时会复用项目现有的 Ark/DeepSeek 兼容客户端。

推荐生产配置：

```env
AI_PROVIDER=ark
ARK_API_KEY=由密钥管理系统注入
ARK_API_URL=https://ark.cn-beijing.volces.com/api/v3/chat/completions
ARK_MODEL=doubao-seed-2-1-pro-260628

V4_AI_LIVE_ENABLED=true
V4_AI_TIMEOUT_MS=20000
V4_AI_MAX_RETRIES=1
V4_AI_RETRY_DELAY_MS=200
```

不要把真实 API Key 写入 .env.example、Git 或日志。

## 3. 安全与真实性约束

- 请求外部模型前脱敏手机号、邮箱、证件号和银行卡号；
- Agent 上下文仅使用有限画像字段和当前申请快照；
- 模型无权直接执行数据库写操作；
- 简历建议必须准确引用原简历内容；
- 简历和申请材料出现无来源的新数字时自动拒绝模型结果并降级；
- AI 简历确认后创建新版本，不覆盖原版本；
- 申请材料仅保存 pending 草稿，用户确认后才关联申请；
- 面试评分只评价当前回答，不补写用户经历。

## 4. 超时、重试与降级

运行时统一识别以下错误：

- AI_CONFIG_MISSING：功能开关已开启，但供应商未配置；
- AI_TIMEOUT：模型请求超时；
- AI_NETWORK_ERROR：DNS、连接重置或网络不可达；
- AI_UPSTREAM_ERROR：供应商限流或服务端错误；
- AI_SCHEMA_INVALID：返回内容不是有效 JSON 或未通过业务校验；
- AI_REQUEST_REJECTED：供应商拒绝请求且不适合自动重试。

可重试错误最多自动重试 V4_AI_MAX_RETRIES 次。最终失败后：

- Agent 任务记录为 failed，保留降级内容，可由用户重试；
- 申请材料、简历建议和面试评分直接返回安全规则结果；
- generation 字段会标记 source、degraded、model、attempts、fallbackReason 和 errorCode。

## 5. 发布验收清单

- [x] 关闭真实模型时不发起外部请求
- [x] JSON 成功响应解析
- [x] 超时重试后安全降级
- [x] 非法 JSON 自动降级
- [x] 后端完整回归 73/73
- [ ] 测试环境配置真实供应商 Key
- [ ] 分别验证四个 Agent 的真实回答
- [ ] 验证四种申请材料的事实一致性
- [ ] 验证简历建议的原文引用与数字拦截
- [ ] 验证面试评分稳定性和中文反馈质量
- [ ] 执行供应商超时、429、5xx 和网络中断演练
- [ ] 观察调用耗时、错误率与额度消耗后再开启灰度

## 6. 回滚方式

无需回滚代码。将 V4_AI_LIVE_ENABLED 改为 false 并重启服务，即可立即切回确定性规则模式。
