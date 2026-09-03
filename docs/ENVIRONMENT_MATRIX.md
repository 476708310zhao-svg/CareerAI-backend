# 运行环境变量矩阵

> 基线：2026-09-03。任何检查都只输出变量名和状态，不输出变量值。

| 配置组 | Local | Test | Staging | Production |
|---|---|---|---|---|
| `NODE_ENV` | `development` | `test` | `production` | `production` |
| `PORT` | 4400 | 随机端口 | 4400 或隔离端口 | 4400 |
| `DB_PATH` / `DATA_DIR` / `UPLOAD_DIR` | 项目本地目录 | 临时隔离目录 | 独立共享目录 | `/var/lib/jobapp-server/*` |
| `JWT_SECRET` | 非生产开发值 | 测试专用值 | 强随机值，必填 | 强随机值，必填 |
| `WX_APP_ID` / `WX_APP_SECRET` | 可按需配置 | Stub | 必填 | 必填 |
| AI Provider Key | 可选，允许规则降级 | 禁用真实调用 | 质量验收时必填 | 至少一个，必填 |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | 本地账号 | 测试账号 | 强密码，必填 | 强密码，必填 |
| `CRON_SECRET` / `WEBHOOK_SECRET` | 可选 | 测试值 | 强随机值，必填 | 强随机值，必填 |
| `PAYMENT_ENABLED` | `false` | `false`/Mock | 默认 `false` | 未审批前必须 `false` |
| `REAL_PAYMENT_LAUNCH_APPROVED` | `false` | `false` | 默认 `false` | 仅书面审批后为 `true` |

发布门禁：

1. 测试使用临时数据库和临时上传目录，禁止指向生产共享数据。
2. `npm run preflight:runtime:strict` 同时执行生产启动变量校验与 readiness 检查。
3. 支付关闭时不要求支付密钥，也不会阻塞基础服务；支付开启时必须同时满足完整配置和人工放行开关。
4. GitHub `production` Environment 保存服务器、n8n 和应用 Secret；仓库、构建产物及日志不得保存明文。
5. 真实支付、生产迁移 apply、凭据轮换和公网切流均由 Human 授权。
