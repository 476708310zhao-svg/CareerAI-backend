# PROJECT HANDOFF

> 最后更新：2026-09-03。唯一主项目：`D:\ChatGPT-Projects\求职小程序\jobapp-server`。

## 项目一句话介绍

职引是面向北美 STEM 留学生的微信 AI 求职工作台，覆盖求职画像、Sponsor/岗位匹配、申请 CRM、简历和申请文案、面试训练、Today 任务、内容资源及运营后台。

## 当前版本

- V4/4.0 内测及灰度前收口。
- 分支 `codex/v4-development`；Sprint 1 代码提交截至 `a9b92a6`，最终 HEAD 以 Git 为准。
- 2026-09-03 恢复基线：137/137 tests 和 `check:release` 通过，小程序媒体 191.2 KB，微信开发者工具可正常预览。
- Sprint 0 恢复结果及此前后端改动已按主题拆分提交；仍未推送、未部署。
- 旧部署工作树已正确注销，旧目录已归档后送入回收站；部署分支 `codex/deploy-feishu-main` 仍保留。

## 当前技术栈

- 微信原生小程序：JS/CommonJS + WXML + WXSS，主包/分包，自定义 TabBar。
- Node.js + Express 4。
- SQLite + `better-sqlite3`。
- 原生 HTML/CSS/JS 管理后台。
- 火山方舟/豆包、DeepSeek 兼容 AI 客户端。
- Linux + PM2 + Nginx + GitHub Actions + cron。

## 当前已经完成

- V4 画像、Sponsor、岗位匹配和申请 CRM。
- 经历库、多版本简历、AI 建议确认和申请文案草稿。
- 面试空间、训练报告、AI Career 四 Agent、Today 任务。
- 校招飞书同步、企业/资源/资讯/题库/机构模块。
- UGC 发布前审核和运营后台。
- 会员/配额/订单数据结构、Mock 与虚拟支付代码门禁。
- 137 项测试、发布检查、E2E 静态预检、迁移/回滚/灰度脚本。

## 当前正在开发

Sprint 1 仓库侧已经收口。下一阶段应进入 Sprint 2 数据闭环与质量基线；在触碰生产前，Human 还需完成服务器切流/回滚演练、生产严格预检、n8n 凭据轮换和真机高风险链路验收。

## 当前最重要的 5 个任务

1. Human：在服务器执行候选版本 readiness、`current` 切换与自动回滚演练。
2. Human：配置 GitHub `production` Environment，并轮换 n8n 已暴露凭据、检查旧日志。
3. Human：在真实生产配置上保存严格预检证据，继续保持支付关闭。
4. Human：真机验证登录、文件选择、订阅消息与支付不可用状态；真实 E2E 非默认。
5. 开发：进入 Sprint 2，统一核心对象关联、数据来源/过期规则、埋点和 AI 质量基线。

## 当前存在的问题

- P0：仓库发布基线尚未在真实服务器执行切流和回滚演练。
- P0：n8n 新凭据尚未由 Human 配置与轮换，旧 Actions 日志需人工评估。
- P0：真机高风险链路验收未闭环；真实 E2E 根据 Human 决定暂停。
- P1：生产严格预检证据待授权环境生成；支付审批开关必须继续关闭。
- P1：AI 供应商异常演练、外部告警和跨设备提醒验证未完成。
- P1：提醒派发慢请求样本约 2.1 秒。
- P1：基础数据库 migration 机制尚未统一。

## 重要文件入口

- 长期上下文：`PROJECT_CONTEXT.md`
- 快速交接：`HANDOFF.md`
- 可执行任务：`TODO.md`
- 开发流水：`DEVELOPMENT_LOG.md`、`DEVELOPMENT_STATUS.md`
- 协作规则：`AGENTS.md`
- 后端入口：`server.js`
- 依赖和命令：`package.json`
- V4 状态：`docs/V4_UPDATE_AND_FEATURE_LIST.md`
- 生产就绪：`docs/PRODUCTION_READINESS_AND_MONITORING.md`

## 数据库入口

- 连接和基础表：`db/database.js`
- V4 表：`db/v4Schema.js`
- 旧数据格式转换：`db/formatters.js`
- V4 迁移/回滚：`scripts/migrate_v4.js`、`scripts/rollback_v4.js`
- 运行数据库和备份均不得提交 Git。

## API 入口

- 注册与健康检查：`server.js`
- 通用 API：`routes/`
- V4 API：`routes/v4/index.js`
- 管理 API：`routes/admin.js`、`routes/v4-admin.js`
- 小程序客户端：`miniprogram/utils/api-client.js`、`miniprogram/utils/api-*.js`

## UI 组件入口

- 全局样式：`miniprogram/app.wxss`
- 主导航：`miniprogram/custom-tab-bar/`
- 公共组件：`miniprogram/components/`
- 登录门禁：`miniprogram/components/c-login-popup/`、`miniprogram/behaviors/login-gate.js`
- 职位卡：`miniprogram/components/c-job-card/`
- AI 披露：`miniprogram/components/c-ai-disclosure/`

## 环境配置

- 示例：`.env.example`；真实 `.env` 已忽略，禁止读取值后写入文档或提交。
- 核心分组：`JWT_*`、`WX_*`、`AI_/ARK_/DEEPSEEK_*`、`FEISHU_*`、`PAYMENT_/VIRTUAL_PAY_/WXPAY_*`、`SMTP_*`、`TENCENT_*`、`DB_PATH/DATA_DIR/UPLOAD_DIR`。
- 小程序生产 API：`miniprogram/utils/app-config.js`。
- 严格检查：`npm run preflight:runtime:strict`。

## 开发时不要破坏的内容

- 只在 D 盘唯一主项目开发；`archives/cleanup-20260903/` 仅用于历史恢复，不作为开发目录。
- 不要 reset/checkout/删除当前未提交改动。
- 不要提前删除 `/api/users/resumes` 兼容入口；历史约定至少保留到 2026-11-09。
- 不要把 AI 输出直接写入简历/申请/Today，必须经过用户确认。
- 不要启用真实支付或 `REAL_PAYMENT_LAUNCH_APPROVED`，除非 Human 明确审批。
- 不要把 demo fixture 打开到生产。
- 不要在无备份、无 dry-run 情况下迁移数据库。
- 不要提交 `.env`、数据库、uploads、微信私有配置、密钥或证书。

## 当前技术约定

- 新 API 默认 `{ code, message, data }`；支付、健康、Webhook、SSE 和部分旧接口是受控例外。
- 页面网络请求优先走 `api-*.js` 和 `api-client.js`。
- `data/jobs.json` 是唯一的本地职位数据源。
- V4 数据变更必须幂等；正式回滚需显式确认。
- UGC 默认 pending，人工批准后公开。
- AI 先脱敏、校验、有限重试，失败安全降级；写操作必须确认。
- 发布候选至少运行 `npm run check:release`，数据库修改先运行 `npm run migrate:v4` dry-run。
- 默认不运行真实微信 E2E；除非 Human 明确要求，否则使用专项测试、发布检查、静态检查和人工预览。

## 下一步建议

仓库侧直接进入 Sprint 2“数据闭环与质量基线”。生产相关动作先由 Human 完成上述四项验收，不要擅自推送、部署、切流或轮换凭据。

## 新 Codex 接手说明

先执行只读检查：

```powershell
git status --short --branch
git diff --stat
```

然后从 `TODO.md` 选择单个任务，阅读相关代码和 diff。高风险操作必须先列出影响、验证和回滚。任何“历史已完成”都要通过当前代码、当前测试和当前环境重新验证。

# 给下一位 AI 开发助手

在开始任何代码修改之前：

1. 阅读 PROJECT_CONTEXT.md
2. 阅读 HANDOFF.md
3. 阅读 TODO.md
4. 查看最近 DEVELOPMENT_LOG.md
5. 检查 git status
6. 阅读与当前任务有关的代码
7. 再开始修改

禁止仅根据聊天描述直接修改代码。

代码实际状态永远高于历史聊天记录。
