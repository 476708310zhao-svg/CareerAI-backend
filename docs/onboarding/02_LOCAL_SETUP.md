# 本地启动与验证

以下命令在新克隆的仓库根目录执行。项目要求 Node.js `>=20 <25`，当前 GitHub CI 使用 Node.js 20；首次入项建议用 Node.js 20。不要复制其他人的整个工作树、`node_modules`、数据库或 `.env`。

## 1. 克隆并建立任务分支

```bash
git clone https://github.com/476708310zhao-svg/CareerAI-backend.git
cd CareerAI-backend
git fetch origin
git switch -c feat/onboarding-check origin/codex/release-20261116
git rev-parse --show-toplevel
node --version
npm ci
```

`feat/onboarding-check` 是首个入项任务的示例名称。后续按任务编号新建分支。不要从默认 `main` 直接开工，也不要在旧发布 worktree 中开发。

## 2. 创建仅供本机使用的环境

Windows PowerShell：`Copy-Item .env.example .env`。macOS/Linux：`cp .env.example .env`。`.env` 已被 Git 忽略，**不要提交或发给别人**。

打开 `.env`，至少核对以下本地项：

| 项 | 本地建议 |
| --- | --- |
| `NODE_ENV` | `development` |
| `ANALYTICS_DATA_CLASS` | `demo`；避免本地操作被标成生产分析数据 |
| `PORT` | 可用的本地端口，示例为 `4400` |
| `DB_PATH` / `DATA_DIR` / `UPLOAD_DIR` | 只指向个人本机的隔离目录，绝不指向生产共享目录 |
| `JWT_SECRET` / `ADMIN_PASSWORD` | 本地独立值，不复用任何线上值；不要写入提交或截图 |
| `PAYMENT_ENABLED` / `RECRUITMENT_FEATURE_ENABLED` / `V4_AI_LIVE_ENABLED` | 初次复现先设为 `false`，避免真实支付、职位源或模型调用 |

微信登录、AI、飞书、职位供应商和支付功能需要的测试凭据，只在具体任务需要时由维护者单独提供测试范围。不要把生产密钥填入本地示例配置。更完整的变量分组见 [环境矩阵](../ENVIRONMENT_MATRIX.md) 与 [`.env.example`](../../.env.example)。

## 3. 运行项目和检查

```bash
npm run dev
```

服务默认端口是 `4400`，实际以终端输出和 `.env` 为准。浏览器打开 `http://127.0.0.1:4400/web/`；健康接口为 `http://127.0.0.1:4400/api/health`。微信小程序任务在微信开发者工具中打开本仓库的 `miniprogram/`，测试 AppID 权限需由维护者按任务配置。

首个任务至少执行：

```bash
npm run check:miniprogram
npm run check:release
npm run check:acceptance -- --no-report
git status --short --branch
```

`check:release` 包含后端测试、AI 质量、小程序静态检查和数据检查；部分数据提醒不等于失败，应记录最终退出码和实际提醒数。CI 配置见 [test.yml](../../.github/workflows/test.yml)。微信预览、真机和生产接口检查是另外的门禁，不能用本地测试代替。

## 遇到阻塞时记录

提交 Node/npm 版本、系统、命令、退出码、删去密钥及个人信息后的错误摘要。不要上传 `.env`、数据库、真实简历、用户资料或含访问令牌的日志。
