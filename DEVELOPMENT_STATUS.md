# DEVELOPMENT_STATUS

更新时间：2026-05-09

后端项目目录：`C:\Users\admin\Desktop\求职小程序\jobapp-server`

小程序项目目录：`C:\Users\admin\Desktop\求职小程序\求职小程序`

## 当前批次

第二批 P1 优化已完成，P2 正在进行：降低维护成本、补工程化和测试覆盖。继续避免主动改动支付、登录等高风险核心链路。

## 已完成

| 日期 | 事项 | 文件 | 验证 |
|---|---|---|---|
| 2026-05-09 | 提交并推送第一批安全修复记录和基础 smoke tests | `AI功能清单开发.md`、`tests/smoke.test.js` | `npm test` 通过，4/4 |
| 2026-05-09 | 新增多 AI 协作规则 | `AGENTS.md` | 文档检查 |
| 2026-05-09 | 新增开发状态跟踪 | `DEVELOPMENT_STATUS.md` | 文档检查 |
| 2026-05-09 | 补充 README 开发、测试、环境变量和协作说明 | `README.md` | 文档检查 |
| 2026-05-09 | 扩展后端 smoke tests，覆盖登录、支付 Mock、上传异常和公开列表 | `tests/smoke.test.js` | `npm test` 通过，11/11 |
| 2026-05-09 | 迁移第一批小程序直接请求到统一 API 模块 | 小程序 `messages`、`feedback`、`news` 页面与 `utils/api-*` | `rg` 无残留，`node --check` 通过 |
| 2026-05-09 | 输出简历 API 去重方案 | `docs/RESUME_API_DEDUP_PLAN.md` | 文档检查 |
| 2026-05-09 | 输出 API 响应格式规范 | `docs/API_RESPONSE_CONVENTION.md` | 文档检查 |
| 2026-05-09 | 固定 `data/jobs.json` 为唯一本地职位数据源，停止创建/导入/读取 SQLite `jobs` 双轨 | `db/database.js`、`db/seed.js`、`routes/applications.js`、`services/companyService.js`、`utils/jobData.js` | `node --check` |
| 2026-05-09 | 增加 AI 免费次数和 VIP 工作流限制 | `routes/ai.js`、`utils/aiQuota.js`、`db/database.js` | `node --check` |
| 2026-05-09 | 标记 `/api/users/resumes` deprecated，前端保持 `/api/resumes` 主入口 | `routes/users.js`、`docs/RESUME_API_DEDUP_PLAN.md` | smoke test |
| 2026-05-09 | 记录支付三阶段上线策略，当前仅 Mock 模式验证 | `docs/PAYMENT_ROLLOUT_PLAN.md` | 文档检查 |
| 2026-05-09 | 完成 AI 响应格式分批治理，补最小 JSON schema 校验和标准错误格式 | `routes/ai.js`、`tests/smoke.test.js`、`docs/API_RESPONSE_CONVENTION.md` | `npm test` 通过，15/15 |
| 2026-05-09 | 抽取上传安全工具，头像和后台 Banner 复用 MIME 与 magic bytes 校验 | `utils/uploadSecurity.js`、`routes/upload.js`、`routes/admin.js` | `npm test` 通过，16/16 |
| 2026-05-09 | 新增后端测试 CI workflow | `.github/workflows/test.yml` | workflow 检查 |
| 2026-05-09 | 补充 P2 上传测试、AI 修改记录和数据库迁移治理方案 | `tests/smoke.test.js`、`CHANGELOG_AI.md`、`docs/DATABASE_MIGRATION_PLAN.md`、`README.md` | `npm test` 通过，18/18 |
| 2026-05-11 | 抽取后台 jobs.json 存储和分页工具，降低 `routes/admin.js` 维护成本 | `utils/adminJobsStore.js`、`utils/pagination.js`、`routes/admin.js` | `npm test` 通过，19/19 |

## 进行中

| 优先级 | 任务 | 负责人 | 文件范围 | 状态 |
|---|---|---|---|---|
| P1 | 简历 API 实施迁移 | AI1 Builder | `routes/users.js`、`routes/resumes.js`、小程序简历调用 | 已完成，旧接口保留 6 个月 |
| P1 | API 响应格式分批实施 | AI1 Builder | `routes/ai.js`、小程序 `utils/api-*` | 已完成首批，支付/健康/Webhook 保持例外 |
| P2 | 上传安全工具抽取 | Codex | `utils/uploadSecurity.js`、`routes/upload.js`、`routes/admin.js` | 已完成 |
| P2 | GitHub Actions 测试 | Codex | `.github/workflows/test.yml` | 已完成 |
| P2 | README/DX 补齐 | Codex | `README.md`、`CHANGELOG_AI.md` | 已完成 |
| P2 | 数据库迁移治理方案 | Codex | `docs/DATABASE_MIGRATION_PLAN.md` | 已完成 |
| P2 | 后台管理维护成本降低 | Codex | `routes/admin.js`、`utils/adminJobsStore.js`、`utils/pagination.js` | 已完成 |

## 当前文件占用

| 负责人 | 文件 | 任务 | 状态 |
|---|---|---|---|
| Codex | `README.md` | 补充开发说明 | 已完成 |
| Codex | `AGENTS.md` | 建立协作规则 | 已完成 |
| Codex | `DEVELOPMENT_STATUS.md` | 建立状态记录 | 已完成 |
| Codex | `tests/smoke.test.js` | 扩展后端 smoke tests | 已完成 |
| Codex | 小程序 `messages`、`feedback`、`news` 页面与 `utils/api-*` | 统一请求迁移 | 已完成 |
| Codex | `docs/RESUME_API_DEDUP_PLAN.md` | 简历 API 去重方案 | 已完成 |
| Codex | `docs/API_RESPONSE_CONVENTION.md` | API 响应格式规范 | 已完成 |
| Codex | 职位本地数据源相关后端文件 | 删除 SQLite `jobs` 双轨读取 | 已完成 |
| Codex | AI 配额相关后端文件 | 助手/规划/工作流权限限制 | 已完成 |
| Codex | `routes/ai.js`、`tests/smoke.test.js` | AI schema 与错误格式首批治理 | 已完成 |
| Codex | `utils/uploadSecurity.js`、`routes/upload.js`、`routes/admin.js` | 上传安全工具抽取 | 已完成 |
| Codex | `.github/workflows/test.yml` | 后端测试 CI | 已完成 |
| Codex | `README.md`、`CHANGELOG_AI.md`、`docs/DATABASE_MIGRATION_PLAN.md`、`tests/smoke.test.js` | P2 文档和上传测试补齐 | 已完成 |
| Codex | `routes/admin.js`、`utils/adminJobsStore.js`、`utils/pagination.js`、`tests/smoke.test.js` | 后台 jobs 存储和分页工具抽取 | 已完成 |

## 待决策

| 事项 | 决策人 | 说明 |
|---|---|---|
| 真实微信支付上线 | Human | 当前仅 Mock 模式验证流程，有营业执照和商户资质后再进入真实支付灰度。 |

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
- `/api/users/resumes` deprecated 标记
- `/api/ai/workflow` VIP 拒绝
- `/api/ai/chat` 参数错误标准响应
- `/api/ai/project-builder` 参数错误标准响应
- `/admin/api/upload/banner` 伪 MIME 拒绝
- `/admin/api/upload/banner` 非图片 MIME 拒绝
- `/admin/api/jobs` 读取 jobs.json 列表
- `/api/upload/avatar` 正常 PNG 上传
- `/api/payment/create-order` Mock 下单
- `/api/payment/mock-confirm`
- `/api/payment/verify/:orderNo`
- `/api/upload/avatar` 伪 MIME 拒绝
- `/webhook/deploy` 缺签名拒绝
