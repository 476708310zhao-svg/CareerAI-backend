# CareerAI Full Stack

CareerAI 留学生求职助手全栈代码仓库，包含 Node.js 后端、管理后台静态页和微信小程序端。

## 当前项目目录

本仓库是后端、Web 工作台、管理后台和微信小程序共用的唯一项目。执行命令前使用
`git rev-parse --show-toplevel` 确认项目根目录；微信开发者工具打开根目录下的
`miniprogram/`。不要使用个人机器上的旧副本或把本机绝对路径写入交付文档。

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

## 当前产品结构（2026-10-10）

- 小程序保留五个一级 Tab：`首页`、`找岗位`、`进度`、`资源中心`、`我的`。
- 一条 `application` 是求职推进的主对象；申请工作台关联简历版本、申请材料、面试空间、任务和时间线。
- 用户侧只提供统一的上下文 AI 入口；岗位顾问、申请助手、面试教练和职业规划属于内部能力路由。
- 简历主入口统一到 Resume Center；旧页面只保留兼容跳转，不作为新功能入口。
- 资源中心定位为内容资产中心；“我的”定位为个人资产中心。“我的已购”当前只保留分类/入口和诚实空态，没有独立功能开关；真实商品、订单、支付和授权不属于本轮交付。

本轮 checkpoint、提交、验证证据和未决门禁见
[`docs/FINAL_DELIVERY_RECORD_20261010.md`](docs/FINAL_DELIVERY_RECORD_20261010.md)。

旧根目录下还存在 `ai.js`、`app.js`、`jobs.js`、`rateLimit.js` 等历史文件。日常开发优先看 `server.js`、`routes/`、`middleware/`、`services/`、`db/`、`admin/` 和 `miniprogram/`，不要在未确认用途前继续扩展旧入口文件。

## 本地开发

```bash
npm install
cp .env.example .env
npm run dev
```

默认服务端口为 `4400`；如果 `.env` 中设置了 `PORT`，以该值为准。启动后终端会打印实际端口。Web 工作台访问：

```text
http://127.0.0.1:4400/web/
```

若终端打印的是其他端口，将 URL 中的端口替换为实际值。根路径 `/` 也会打开 Web 工作台。启动后常用检查接口：

```bash
curl http://127.0.0.1:4400/api/health
```

小程序端请在微信开发者工具中打开 `miniprogram/` 目录。

## 测试

```bash
npm test
npm run check:miniprogram
npm run check:acceptance
```

当前测试使用 Node.js 内置 test runner，测试文件位于 `tests/*.test.js`。发布候选必须在不包含本地预制改动的干净快照中运行上述三项；微信开发者工具和真机回归是独立人工门禁，不能由静态检查代替。

GitHub Actions 已新增 `.github/workflows/test.yml`，在 push/PR 到 `main` 时运行：

```bash
npm ci
npm test
```

## 环境变量

复制 `.env.example` 为 `.env` 后按需填写：

| 变量 | 用途 | 本地是否必填 |
|---|---|---|
| `PORT` | 后端监听端口 | 否 |
| `JWT_SECRET` | 用户鉴权 JWT 签名 | 是 |
| `JWT_EXPIRES_IN` | JWT 过期时间 | 否 |
| `WX_APP_ID` / `WX_APP_SECRET` | 微信登录和手机号能力 | 使用微信登录时必填 |
| `AI_PROVIDER` / `ARK_API_KEY` / `ARK_API_URL` / `ARK_MODEL` | AI 功能（火山方舟/豆包） | 使用 AI 时必填 |
| `AI_API_KEY` / `AI_API_URL` / `AI_MODEL` | AI 通用覆盖配置 | 可选 |
| `DEEPSEEK_API_KEY` / `DEEPSEEK_API_URL` / `DEEPSEEK_MODEL` | DeepSeek 兼容配置 | 切回 DeepSeek 时填写 |
| `RAPID_API_KEY` / `RAPID_API_HOST` / `RAPID_API_URL` | JSearch 职位搜索 | 使用真实职位搜索时必填 |
| `JSEARCH_DAILY_REQUEST_BUDGET` | JSearch 进程内每日请求保护上限，默认 6；应按订阅配额调整 | 可选 |
| `ADZUNA_APP_ID` / `ADZUNA_APP_KEY` | Adzuna 已支持国家的职位搜索 | 使用该来源时填写 |
| `THE_MUSE_API_KEY` | The Muse 注册应用的 API key；未配置则不请求该来源 | 使用该来源时填写 |
| `RECRUITMENT_FEATURE_ENABLED` | 职位功能总开关，代码默认 `false`；经产品决策后可显式开启 | 否 |
| `WEBHOOK_SECRET` | GitHub Webhook 签名 | 部署 Webhook 必填 |
| `PAYMENT_ENABLED` / `PAYMENT_PROVIDER` | 会员支付开关和支付方式 | 支付上线时配置 |
| `REAL_PAYMENT_LAUNCH_APPROVED` / `COMMERCE_ROLLOUT_APPROVED` | 真实支付与商业灰度 Human 审批门禁，默认 `false` | 资质、商品与退款方案审批后配置 |
| `VIRTUAL_PAY_*` | 小程序虚拟支付 | `PAYMENT_PROVIDER=virtual` 时必填 |
| `WXPAY_MCH_ID` / `WXPAY_API_KEY` / `WXPAY_APP_ID` / `WXPAY_NOTIFY_URL` | 普通微信支付 JSAPI | `PAYMENT_PROVIDER=wxpay` 时必填 |
| `ALLOWED_ORIGIN` | 浏览器管理后台跨域来源 | 浏览器访问时按需配置 |

不要提交 `.env` 或任何真实密钥。`ALLOWED_ORIGIN` 需要配置精确来源，多个来源用逗号分隔。

职位接口可用 `country=global` 或 ISO 两位国家代码（例如 `jp`、`de`、`br`）；小程序筛选面板提供常用国家选择及两位代码输入。明确国家时只返回该国来源或标明可在该国投递的远程岗位，不会静默改搜美国；`global` 的 Web 列表、地图和小程序聚合列表是轮换国家样本加跨地区远程职位，不保证所有国家同时有结果。JSearch 请求预算和冷却均为当前服务进程内保护，调整配额后需重启；供应商的实际配额与授权仍须单独核实。详见 [职位来源契约](docs/JOB_CAMPUS_DATA_PROVENANCE_CONTRACT.md)。

### 职位功能开关

在服务端 `.env` 中设置：

```dotenv
RECRUITMENT_FEATURE_ENABLED=false
```

重启后端后，小程序会从 `/api/features` 同步状态。关闭时会隐藏职位列表、详情、搜索和一键申请入口，并拒绝对应服务端接口；Banner、校招日历、热门公司、公司资料和用户手动维护的网申进度仍正常开放。恢复为 `true` 并重启后即可重新开放职位功能，管理后台的职位数据维护能力不受此开关影响。

## 支付模式

支付支持两种方式：

- `PAYMENT_PROVIDER=virtual`：小程序虚拟支付，道具直购模式。后端创建订单并返回 `wx.requestVirtualPayment` 所需的 `signData`、`paySig`、`signature`，微信发货通知到 `/api/payment/virtual-notify` 或 `/api/payment/notify` 后发放对应 Pro 或场景包权益。
- `PAYMENT_PROVIDER=wxpay`：普通微信支付 JSAPI v2，保留兼容旧链路。

未配置完整真实支付变量时，本地可通过 `ENABLE_MOCK_PAYMENT=true` 使用 Mock 模式，覆盖下单、模拟确认、订单校验、权益发放、订单/账本和审核式退款；Mock 不执行外部支付或退款。

真实微信支付分阶段上线：营业执照、微信商户资质、商品和退款方案完成后，再单独评审并配置真实支付参数；商业灰度从 0% 提高还要求 `COMMERCE_ROLLOUT_APPROVED=true`。详细治理见 `docs/V4_SPRINT7_COMMERCE_GOVERNANCE.md`。

## 管理后台

管理后台静态文件位于 `admin/`，通过后端服务直接访问。后台 API 主要在 `routes/admin.js`，文件较大，后续拆分前不要把无关后台功能继续塞入同一批改动。

## 微信小程序

小程序代码位于 `miniprogram/`。API 工具已拆到 `miniprogram/utils/api-*.js`，新页面请求优先走统一 API 工具，避免直接新增 `wx.request`。

## 多 AI 协作

- 开发前阅读 `AI功能清单开发.md`、`AGENTS.md` 和 `DEVELOPMENT_STATUS.md`。
- 重要修改同步记录到 `CHANGELOG_AI.md`。
- 修改前在 `DEVELOPMENT_STATUS.md` 标记文件占用。
- 不要多个 AI 同时修改同一个文件。
- 第二批优化优先做统一接口、补测试、降低维护成本，暂不主动改支付和登录核心链路。

## 数据库变更

数据库已建立 `schema_migrations` 和 `db/migrations/*.sql` 基线。查询状态必须显式指定数据库，且只读不写：

```bash
npm run migrate:db -- --db="./tmp/jobapp.db" --status
```

apply 必须同时提供已验证备份和确认口令；生产 apply 还需要 Human 上线审批。隔离的备份、迁移、失败事务和恢复演练使用 `npm run rehearse:db-migrations`。完整规则见 `docs/DATABASE_MIGRATION_PLAN.md`。现有启动期 DDL 暂时作为兼容兜底，新增表、字段和索引必须先写 migration，禁止继续在业务路由中增加建表逻辑。

## 提交规则

不要提交 `.env`、`node_modules/`、`uploads/`、数据库运行文件、微信私有配置和密钥文件。
## AI Provider

The backend uses an OpenAI-compatible chat completions client for AI features.
For Volcengine Ark / Doubao, set:

```dotenv
AI_PROVIDER=ark
ARK_API_KEY=YOUR_ARK_API_KEY_HERE
ARK_API_URL=https://ark.cn-beijing.volces.com/api/v3/chat/completions
ARK_MODEL=doubao-seed-2-1-pro-260628
```

`AI_API_KEY`, `AI_API_URL`, and `AI_MODEL` can be used as generic overrides.
DeepSeek remains supported with `AI_PROVIDER=deepseek`, `DEEPSEEK_API_KEY`,
`DEEPSEEK_API_URL`, and `DEEPSEEK_MODEL`.
