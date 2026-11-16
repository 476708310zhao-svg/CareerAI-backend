# 资料导入与在线刷题：Phase 0 代码与文档发现

> 2026-10-20，只读代码审计与开发前基线。未检查生产数据库、私有对象存储或真实 PDF；这不是生产状态证明。后续执行计划见 `01_IMPLEMENTATION_PLAN_20261020.md`。

## 仓库与基线

- 在 `C:\Users\admin\Desktop\求职小程序\jobapp-server` 查询 `git rev-parse --show-toplevel`，实际返回 `D:/ChatGPT-Projects/求职小程序/jobapp-server`。后续开发命令从 **D 盘真实 Git 根目录**执行，符合 `AGENTS.md`；不在 C 盘别名目录开发。
- 分支 `codex/unified-release-20261015`，审计时 HEAD `ed3e052`。`DEVELOPMENT_STATUS.md`、`docs/WECHAT_PAGE_CONTENT_ACCESS_CN.md`、`miniprogram/app.json`、`miniprogram/page-meta.json`、`miniprogram/sitemap.json` 已有未提交修改；`docs/assessment-question-bank/` 是本次规划文档。没有清理、暂存或覆盖这些改动。
- 本地 `npm test`：559 项、557 通过、0 失败、2 项平台相关跳过，退出码 0；测试前后 `git status --short` 项目集合相同。未运行微信真机、生产迁移或真实付款测试。
- 外部开发包只有 Markdown、合成文本 JSON 和验收 CSV；**没有**提供真实授权 PDF。6 个 JSON 案例覆盖题后答案、文末答案、重复题号、缺答案、冲突答案和无处理权，但不能证明真实 PDF 的提取质量。

## 已核实的可用接口与复制位置

| 领域 | 仓库已存在的 API / 模式 | 开发时复制/对照的位置 |
|---|---|---|
| SQLite 迁移 | `readMigrations()`、`getMigrationStatus()`、`applyPendingMigrations()`；`NNNN_name.sql` 命名、checksum、逐版事务；支持 `-- @require-table` | `db/migrate.js:32-64,92-178`；只读参照 `db/migrations/0012_assessment_commerce.sql:1-54` 与 `0015_assessment_import_sources.sql:1-14`。下一版本号以落地时目录为准。 |
| 用户认证 | `authMiddleware` 将 JWT 用户写入 `req.user.userId`；敏感资源可在路由再次确认用户仍存在、设置 `Cache-Control: no-store` | `middleware/auth.js:19-36`、`routes/assessment.js:10-29`。 |
| 后台认证与授权 | `adminAuth` 核 JWT 的 admin 角色，然后由 `permissionForAdminPath()` 映射模块权限；`hasPermission()` 检查权限 | `middleware/adminAuth.js:8-27`、`utils/adminPermissions.js:1-19,43-91`、`routes/admin-assessment.js:8-25`。**新路径必须显式映射或增加路由级权限检查**。 |
| 标准响应 | `ok(res, data, message)`、`fail(res, message, status)`；成功 `{code:0,message,data}` | `utils/response.js:8-29`、`docs/API_RESPONSE_CONVENTION.md`。 |
| 会员读取 | `getMembership(userId)` 返回 `planCode`、`isMember`、合并后的 `entitlements`；场景包与退款撤权由商业服务计算 | `services/v4Membership.js:18-38`、`services/v4Commerce.js:42-57,170-174`。题集权益键需产品和代码双方明确定义，现有测评商品付款不自动授予。 |
| 后台原生 UI | 安全 DOM 构建、分页、请求世代、页面初始化及权限菜单 | `admin/js/assessment-products.js:24-100,399-424`、`admin/js/common.js:277-305,383-392`；页面状态样式可参照 `admin/assessment-products.html:59-73`。 |
| 小程序 API/状态 | `client.request({path,params,noCache,skipAuth})`、登录快照、账号切换与迟到响应保护 | `miniprogram/utils/api-assessment-resources.js:9-25,89-106`、`miniprogram/package-content/pages/assessment-list/assessment-list.js:22-67`；测试 `tests/assessmentFrontend.test.js:92-118,166-209,298-309`。 |
| 网站 API/视图 | `request(path, options)` 注入 token、处理 401 与账号变更；`showView`/`data-view` 负责视图切换 | `public/web/app.js:9-21,131,162`；资源占位位于 `public/web/index.html:28-31,47`、`public/web/p0-workspace.js:20-22`。 |
| 测试注册 | `tests/all.test.js` 集中加载模块；后台竞态测试和迁移测试已有模式 | `tests/all.test.js:54-60`、`tests/assessmentAdmin.test.js:95-172`、`tests/databaseMigrations.test.js`。 |

## 确认的缺口与反模式

- `db/migrations/0015_assessment_import_sources.sql` 是飞书记录到**测评商品**的来源绑定；不是 PDF blob、授权或批次导入。代码检索未见旧规划中的 `ResourceAsset` / `RightsGrant`、私有 COS/STS 批次上传、在线阅读票据，也未见客观题修订/题集/正式答题记录。后续需新建领域模块。
- `routes/upload.js:64-87,328-354` 的 PDF 上传用于简历；`utils/paths.js:16-18` 有 `DATA_DIR`/`UPLOAD_DIR`，但 `server.js:80-83` 把 `/uploads` 公开静态服务。**试卷及权利证据不得写入该公开目录，也不得返回简历式公开 URL**。
- 现有 `pdf-parse` 见 `routes/upload.js:116-127`，只能作为文本可提取性的参考；没有验证页内坐标、双栏读序和答案关联。不要把“简历能抽文字”写成“试卷能准确识题”。
- 现有 `admin/questions.html` 和 `db/database.js:135-150` 是面试问答表，旧公共接口 `routes/career-assets.js:161-181` 可返回答案；默认新增发布、可硬删。不能复用作含正确选项、审核、不可变版本的正式刷题库。
- 小程序 OA 题库 `miniprogram/package-career/pages/oa-bank/oa-practice-bank.js:1-35` 将答案放在客户端；`oa-bank.js:46-92` 客户端判分，`:200-210` 的成绩是用户自报。它是现有功能的回归基线，**不能**作为新服务端判分和错题本的数据源。
- `routes/v4/agents.js:15-43`、`scripts/dispatch_reminders.js` 有任务/并发经验，但没有发现可直接复用的 PDF 解析队列。新增 Worker 必须明确幂等、租约、失败重试和预算，不能在 HTTP 请求内长时间解析。
- `permissionForAdminPath()` 对未知路径返回 `null`，`adminAuth` 此时只验证管理员身份。题目内容审核与权利审核需要显式不同权限；不能只挂 `adminAuth` 就视为已经完成角色隔离。

## 仍待核实的外部事实

1. 首批 PDF 的合法处理、第三方 OCR/模型、公开题干/图片/答案和商业使用权；样本未提供，真实解析 PoC 未做。
2. 私有对象存储在实际部署中的 Bucket、Region、访问域名与成本；当前仓库未提供可复用的 COS 上传服务。第一编码批次可用仓库公开静态根以外的私有测试目录和存储接口开发，**不得据此开放生产 PDF 上传**。
3. 网站与小程序是否使用同一账号身份映射，及首期题集的正式权益编码。源码可提供模式，需用隔离环境与真机验证。
4. 生产服务当前运行版本、支付和商品状态以单独只读线上核验为准。本报告只引用本地源码及 2026-10-19 项目状态文档，不代替线上验收。
