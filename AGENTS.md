# AGENTS.md

本文件用于约束多个 AI 同时维护项目时的分工、文件归属和交付流程。每次开发前先确认本次要改的是后端/API 项目还是微信开发者工具打开的小程序项目。

- 后端/API/后台项目目录：`C:\Users\admin\Desktop\求职小程序\jobapp-server`
- 微信开发者工具小程序目录：`C:\Users\admin\Desktop\求职小程序\求职小程序`

## 基本规则

- 开发前先读取 `AI功能清单开发.md` 和 `DEVELOPMENT_STATUS.md`，确认当前批次、负责人和文件范围。
- 不要在未沟通的情况下扫描或修改其它项目目录。
- 改后端路由、测试、README、协作文档时使用 `jobapp-server`。
- 改小程序页面、WXML/WXSS/JS、`miniprogram/utils` 时使用 `求职小程序`。
- 不要并发修改同一个文件。确需交叉修改时，先在 `DEVELOPMENT_STATUS.md` 标记占用范围。
- 不要在同一批提交里混入无关重构、格式化或 UI 大改。
- 高风险链路包括登录、支付、Webhook、上传、鉴权和数据库迁移。改动前必须单独列出风险和验证方式。
- 不提交 `.env`、数据库运行文件、`uploads/`、`node_modules/`、微信私有配置和真实密钥。

## 推荐分工

| 角色 | 主要职责 | 默认文件范围 |
|---|---|---|
| Codex | 提交推送、测试、协作文档、低风险后端工具抽取 | `tests/`、`README.md`、`AGENTS.md`、`DEVELOPMENT_STATUS.md`、低风险 `utils/` |
| AI1 Builder | 小程序页面迁移、样式整理、低风险功能实现 | `miniprogram/pages/`、`miniprogram/utils/`、`miniprogram/components/` |
| AI2 Reviewer | 方案设计、接口规范、README/DX、Review 高风险改动 | `docs/`、`README.md`、设计类 Markdown |
| Human | 产品和上线决策、支付/登录/职位数据源主线确认 | 需求、验收和风险决策 |

## 文件占用流程

1. 在 `DEVELOPMENT_STATUS.md` 的“当前文件占用”中写明负责人、文件和任务。
2. 只修改占用范围内的文件。
3. 修改完成后补充验证结果。
4. 提交后清理或更新占用状态。

## 提交流程

1. 执行 `git status --short --branch`，确认改动范围。
2. 运行与改动相关的测试；后端改动至少运行 `npm test`。
3. 提交信息使用动词开头，说明用户可感知的变化，例如 `Expand backend smoke tests`。
4. 推送前再次确认没有密钥、数据库文件或无关产物。

## 当前第二批边界

- 先做统一接口、补测试、降低维护成本。
- 暂不主动改支付和登录核心链路。
- 小程序直接请求迁移优先处理 `messages`、`feedback`、`news`。
- `job-detail` 和 `profile-edit` 涉及订阅消息、上传和复杂状态，暂缓。
