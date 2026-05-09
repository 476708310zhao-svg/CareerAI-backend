# CareerAI Full Stack

CareerAI 留学生求职助手全栈代码仓库，包含 Node.js 后端、管理后台静态页和微信小程序端。

## 当前项目目录

```text
C:\Users\admin\Desktop\求职小程序\jobapp-server
```

后续开发前请先确认当前工作目录是上面这个项目目录，避免误扫或误改其它仓库。

## 目录结构

```text
.
├── server.js              # 后端入口
├── routes/                # API 路由
├── middleware/            # 鉴权、限流等中间件
├── services/              # 业务服务
├── db/                    # 数据库初始化与工具
├── data/                  # 种子/静态数据
├── scripts/               # 数据同步脚本
├── admin/                 # 管理后台静态页面
└── miniprogram/           # 微信小程序端
```

旧根目录下还存在 `ai.js`、`app.js`、`jobs.js`、`rateLimit.js` 等历史文件。日常开发优先看 `server.js`、`routes/`、`middleware/`、`services/`、`db/`、`admin/` 和 `miniprogram/`，不要在未确认用途前继续扩展旧入口文件。

## 本地开发

```bash
npm install
cp .env.example .env
npm run dev
```

默认服务端口为 `3000`，可通过 `.env` 中的 `PORT` 调整。启动后常用检查接口：

```bash
curl http://127.0.0.1:3000/api/health
```

小程序端请在微信开发者工具中打开 `miniprogram/` 目录。

## 测试

```bash
npm test
```

当前测试使用 Node.js 内置 test runner，测试文件位于 `tests/*.test.js`。后端改动提交前至少运行 `npm test`。

## 环境变量

复制 `.env.example` 为 `.env` 后按需填写：

| 变量 | 用途 | 本地是否必填 |
|---|---|---|
| `PORT` | 后端监听端口 | 否 |
| `JWT_SECRET` | 用户鉴权 JWT 签名 | 是 |
| `JWT_EXPIRES_IN` | JWT 过期时间 | 否 |
| `WX_APP_ID` / `WX_APP_SECRET` | 微信登录和手机号能力 | 使用微信登录时必填 |
| `DEEPSEEK_API_KEY` / `DEEPSEEK_API_URL` | AI 功能 | 使用 AI 时必填 |
| `RAPID_API_KEY` / `RAPID_API_HOST` / `RAPID_API_URL` | JSearch 职位搜索 | 使用真实职位搜索时必填 |
| `WEBHOOK_SECRET` | GitHub Webhook 签名 | 部署 Webhook 必填 |
| `WXPAY_MCH_ID` / `WXPAY_API_KEY` / `WXPAY_APP_ID` / `WXPAY_NOTIFY_URL` | 微信支付 | 真实支付必填，缺失时为 Mock 模式 |
| `ALLOWED_ORIGIN` | 浏览器管理后台跨域来源 | 浏览器访问时按需配置 |

不要提交 `.env` 或任何真实密钥。`ALLOWED_ORIGIN` 需要配置精确来源，多个来源用逗号分隔。

## 管理后台

管理后台静态文件位于 `admin/`，通过后端服务直接访问。后台 API 主要在 `routes/admin.js`，文件较大，后续拆分前不要把无关后台功能继续塞入同一批改动。

## 微信小程序

小程序代码位于 `miniprogram/`。API 工具已拆到 `miniprogram/utils/api-*.js`，新页面请求优先走统一 API 工具，避免直接新增 `wx.request`。

## 多 AI 协作

- 开发前阅读 `AI功能清单开发.md`、`AGENTS.md` 和 `DEVELOPMENT_STATUS.md`。
- 修改前在 `DEVELOPMENT_STATUS.md` 标记文件占用。
- 不要多个 AI 同时修改同一个文件。
- 第二批优化优先做统一接口、补测试、降低维护成本，暂不主动改支付和登录核心链路。

## 提交规则

不要提交 `.env`、`node_modules/`、`uploads/`、数据库运行文件、微信私有配置和密钥文件。
