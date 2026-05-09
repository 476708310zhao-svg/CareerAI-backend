# API 响应格式规范

更新时间：2026-05-09

## 标准格式

业务 API 默认返回：

```json
{
  "code": 0,
  "message": "success",
  "data": {}
}
```

失败默认返回：

```json
{
  "code": -1,
  "message": "错误说明"
}
```

后端优先使用 `utils/response.js` 中的 `ok(res, data, message)` 和 `fail(res, message, status)`。

## HTTP 状态码约定

| 场景 | HTTP 状态码 | body |
|---|---:|---|
| 成功 | 200 | `{ code: 0, message, data }` |
| 参数错误 | 400 | `{ code: -1, message }` |
| 未登录或 token 无效 | 401 | `{ code: -1, message }` |
| 无权限 | 403 | `{ code: -1, message }` |
| 资源不存在 | 404 | `{ code: -1, message }` |
| 频率限制 | 429 | `{ code: -1, message }` |
| 服务端错误 | 500 | `{ code: -1, message }` |

## 允许例外

以下接口可暂时保留现有格式，但新增调用方需要在前端 API 模块里做适配：

| 接口 | 当前格式 | 原因 |
|---|---|---|
| `/api/payment/*` | `{ error }`、`{ mock, orderNo }`、`{ orders }` 等 | 支付链路高风险，先不在第二批改行为 |
| `/api/news` | `{ source, articles }` | 前端已按 NewsAPI 代理结构消费 |
| `/api/ai/chat` | 成功时透传 DeepSeek 原始结构 | 面试/题库等旧调用依赖原始 `choices` 结构 |
| `/api/ai/assistant` | 成功时使用 SSE 流 | 流式接口按 SSE 协议返回，建立连接前的参数错误使用标准格式 |
| `/webhook/deploy` | Webhook 专用响应 | 面向 GitHub 回调，不是小程序业务 API |
| `/api/health` | `{ status, message, time }` | 健康检查接口，便于运维直接读取 |

## 前端调用约定

- 页面层不直接写 `wx.request`。
- 小程序页面通过 `miniprogram/utils/api-*.js` 调业务接口。
- `api-*.js` 内部统一使用 `api-client.js`。
- 对允许例外的后端响应，在对应 `api-*.js` 中适配，不把特殊格式扩散到页面。

## 分批治理建议

1. 新增接口必须使用标准格式。
2. 低风险读取接口优先迁移到 `ok/fail`。
3. 支付、登录、AI 等高风险链路单独建任务，不和普通格式化混在同一批。
4. 每次迁移后补 smoke test 或页面手工回归记录。

## 已完成首批

- AI 参数校验错误统一为 `{ code, message, data }`。
- AI 上游超时、额度不足、服务异常统一为 `{ code, message, data }`。
- `career-plan`、`project-builder`、`workflow` 增加最小 JSON schema 校验。
- 支付、健康检查、Webhook 继续保留例外格式。
