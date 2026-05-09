# DEVELOPMENT_STATUS

更新时间：2026-05-09

项目目录：`C:\Users\admin\Desktop\求职小程序\jobapp-server`

## 当前批次

第二批优化：统一接口、补测试、降低维护成本。避免主动改动支付、登录等高风险核心链路。

## 已完成

| 日期 | 事项 | 文件 | 验证 |
|---|---|---|---|
| 2026-05-09 | 提交并推送第一批安全修复记录和基础 smoke tests | `AI功能清单开发.md`、`tests/smoke.test.js` | `npm test` 通过，4/4 |
| 2026-05-09 | 新增多 AI 协作规则 | `AGENTS.md` | 文档检查 |
| 2026-05-09 | 新增开发状态跟踪 | `DEVELOPMENT_STATUS.md` | 文档检查 |
| 2026-05-09 | 补充 README 开发、测试、环境变量和协作说明 | `README.md` | 文档检查 |
| 2026-05-09 | 扩展后端 smoke tests，覆盖登录、支付 Mock、上传异常和公开列表 | `tests/smoke.test.js` | `npm test` 通过，11/11 |

## 进行中

| 优先级 | 任务 | 负责人 | 文件范围 | 状态 |
|---|---|---|---|---|
| P1 | 统一小程序直接请求第一批页面 | AI1 Builder | `miniprogram/pages/messages/`、`miniprogram/pages/feedback/`、`miniprogram/pages/news/`、`miniprogram/utils/` | 待开始 |
| P1 | 简历 API 去重方案 | AI2 Reviewer | `docs/` 或设计文档 | 待开始 |
| P1 | API 响应格式规范 | AI2 Reviewer | `docs/`、`miniprogram/utils/api-client.js` | 待开始 |

## 当前文件占用

| 负责人 | 文件 | 任务 | 状态 |
|---|---|---|---|
| Codex | `README.md` | 补充开发说明 | 已完成 |
| Codex | `AGENTS.md` | 建立协作规则 | 已完成 |
| Codex | `DEVELOPMENT_STATUS.md` | 建立状态记录 | 已完成 |
| Codex | `tests/smoke.test.js` | 扩展后端 smoke tests | 已完成 |

## 待决策

| 事项 | 决策人 | 说明 |
|---|---|---|
| 职位数据源主线 | Human | 当前存在 JSON 与 SQLite 双轨，需要决定主数据源。 |
| AI 会员边界 | Human | 免费次数、VIP 权限和后端限流需要产品确认。 |
| 简历 API 废弃节奏 | AI2 + Human | 建议保留 `/api/resumes`，将 `/api/users/resumes` 标记为兼容旧接口。 |

## 验证命令

```bash
npm test
```

当前测试覆盖：

- `/api/health`
- `/api/jobs`
- `/api/banners`
- `/api/companies`
- `/api/applications` 匿名拒绝
- `/api/payment/orders` 匿名拒绝
- `/api/users/web-register` 密码哈希
- `/api/users/web-login`
- `/api/payment/create-order` Mock 下单
- `/api/payment/mock-confirm`
- `/api/payment/verify/:orderNo`
- `/api/upload/avatar` 伪 MIME 拒绝
- `/webhook/deploy` 缺签名拒绝
