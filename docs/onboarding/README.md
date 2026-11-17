# 新成员入项包

更新日期：2026-11-17。仓库：[CareerAI-backend](https://github.com/476708310zhao-svg/CareerAI-backend)。本仓库是**公开仓库**，包含后端、Web 工作台、管理后台和微信小程序。

## 按顺序阅读

1. [当前状态与代码基线](01_CURRENT_STATE.md)：先区分 Git 代码、生产后端与微信小程序版本。
2. [本地启动与验证](02_LOCAL_SETUP.md)：克隆、安装依赖、配置本地环境和运行检查。
3. [协作与提交约定](03_COLLABORATION.md)：分支、文件占用、PR、审查和发布边界。
4. [第一项入项任务及后续任务模板](04_FIRST_TASK.md)：可以直接分配的环境复现任务。
5. [维护者交付清单](05_OWNER_CHECKLIST.md)：由仓库维护者填写和执行，不在仓库记录任何密码或令牌。

代码入口与运行细节参见仓库根目录的 [README](../../README.md)；AI 与多人修改规则见 [AGENTS.md](../../AGENTS.md)。历史过程记录在 [DEVELOPMENT_STATUS.md](../../DEVELOPMENT_STATUS.md)，它不是当前开发基线的替代品。

## 开始开发前需要收到

- GitHub 仓库访问权限，以及明确的 PR 目标分支和审阅人。
- 一项写清目标、文件范围和验收标准的任务。第一项可用 [ONBOARD-01](04_FIRST_TASK.md)。
- 仅在任务需要时提供独立的测试账号、测试 AppID 或测试服务配置；通过受控渠道发放，不放进 Git、PR、Issue 或截图。

本包不提供生产密钥、生产数据库、真实用户资料或生产部署权限。发现环境与文档不符时，先在任务或 PR 中记录实际命令和错误，不要自行补用生产配置。

## 可直接转发的入项消息

> 你好，项目仓库是 https://github.com/476708310zhao-svg/CareerAI-backend 。请先阅读 `docs/onboarding/README.md`，本次从 `codex/release-20261116` 建任务分支，不从默认 `main` 开发。第一项任务是 `docs/onboarding/04_FIRST_TASK.md` 中的 ONBOARD-01：独立复现本地环境和检查，记录结果，并修正文档中可复现的问题。PR 目标是 `codex/release-20261116`；审阅人和仓库权限会单独通知。请勿在 Issue、PR 或提交中放入 `.env`、令牌、数据库或真实用户资料。
