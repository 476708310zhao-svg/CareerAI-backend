# 测评资料发布范围与隔离审计记录

日期：2026-10-19。基线：`c5bd1887b9b418abfc18d341e30904f573b2defc`。

本文件只记录本次测评资料相对基线的最小依赖范围，不是发布授权，也不表示已经迁移、部署、上传小程序或开启收费。

## 唯一项目目录与隔离纠正

唯一项目根目录为 `D:\ChatGPT-Projects\求职小程序\jobapp-server`。后续开发、测试、发布必须从该目录执行，并遵守 `AGENTS.md`。

曾按父任务指示建立临时隔离副本 `C:\Users\admin\AppData\Local\Temp\jobapp-assessment-candidate-03eb722f89d6487ebe4adf1539589a94`，用于 HEAD 归档与测评 hunk 分离。父任务复核唯一目录规则后已明确纠正：该副本仅保留为隔离审计材料，**不可运行后续开发测试，不可用作发布源**。不得把此前临时副本的专项测试结果作为主项目的最终发布验收。未删除该材料，未提交或推送。

临时副本没有 `.git`、真实 `.env`、运行数据库或真实网盘源；`node_modules` 为依赖目录 junction。最初 Windows tar 中文路径解压失败，随后 ZIP 解压完成；期间纯测评测试文件被仍在完成的解压覆盖，后已刷新并专项复测。此过程不修改主项目业务代码或数据库，也不应再继续作为候选工作目录。

## 纯测评文件范围

以下当前增量属于测评功能，仍需发布前独立审查最终版本：

- 后端：`services/assessmentCommerce.js`、`routes/assessment.js`、`routes/admin-assessment.js`。
- 支付/生命周期接入：`routes/payment.js`、`routes/users.js`、`services/v4Commerce.js`、`server.js`、`utils/adminPermissions.js`。
- 数据结构：`db/migrations/0012_assessment_commerce.sql`、`0013_assessment_fixed_nine_yuan.sql`、`0014_assessment_shared_instructions.sql`；后续 0015 导入迁移以导入任务最终清单为准。
- 后台：`admin/assessment-products.html`、`admin/css/assessment-products.css`、`admin/js/assessment-products.js`、`admin/js/common.js` 菜单项。
- 小程序：`utils/api-assessment-resources.js`、`utils/assessment-preview.js`、`package-content/assessment-shared.wxss`、`package-content/pages/assessment-{list,detail,purchases,order}/` 四页四件套、`app.json` 四项注册。
- 公司详情：`miniprogram/package-user/pages/company-detail/company-detail.{js,wxml,wxss}` 当前增量为测评展示与请求生命周期管理。
- 测试：`assessmentCommerce.test.js`、`assessmentFrontend.test.js`、`assessmentAdmin.test.js`、`assessmentPreview.test.js`、`assessmentPaymentCapability.test.js`；`databaseMigrations.test.js` 测评迁移/fixture；`checkpoint7.test.js` 和 `mobileWorkflow.test.js` 当前资源入口断言增量。
- 导入服务、CLI、0015、导入测试和非私密运营 profile 以导入任务收尾报告为准；真实网盘源不得提交。

已有 HEAD 已包含上述新增代码依赖的鉴权、登录门禁、支付客户端、导航、日期工具、商业账本、analytics、safe-page，以及 document/company/chevron/bookmark 等图标，无须带入其他 AI、资讯或岗位功能。

## 共享文件必须挑选 hunk

| 文件 | 保留 | 排除 |
|---|---|---|
| `miniprogram/pages/index/index.js` | assessmentResources import、assessmentProducts/assessmentPreview、生命周期调用、fetch/open/logo 方法、请求世代保护 | 校招 latestDay、pageSize3、campusDigestTotal/DateLabel、排序、positionTitle、logo 等增量 |
| `index.wxml` | 岗位区之后、校招区之前的完整测评资料区块 | Today、申请进度、常用功能、校招重排 |
| `index.wxss` | assessment row/相邻分割线/price 三条规则 | 全局色、圆角、间距、Today、校招样式；HEAD 无 home-brand 变量，新 price 应自行使用明确颜色或 fallback |
| `pages/resources/resources.js` | assessment import、ASSETS 商品入口、openPurchases | 新闻标题改名 |
| `resources.wxml` | 已购入口启用 | 当前 diff 无其他功能 |
| `utils/app-config.js` | develop+devtools+显式 readonly-examples 才启用的默认关闭预览及 export | 全局默认生产 API/devApiMode 的非测评变更，除非单独纳入明确发布范围 |
| `tests/all.test.js` | assessment 和导入测试注册 | AI chat/news 新注册 |
| `tests/navigationConfig.test.js` | resource hub 中 purchasesUrl、openPurchases 与名称断言 | 首页、AI、校招断言 |
| `tests/frontendVisualCheckpoint.test.js` | 资源数 9→10、列表加入 assessment-products、已购入口/无障碍断言 | 首页/校招 fixture、AI/岗位/触控断言 |
| `DEVELOPMENT_STATUS.md` | 本批占用与真实结果 | 不用旧记录替代本批验收 |

`feature-flags.js`、`share.js` 的 CONTENT_API 改动不是测评依赖。`loginGate.test.js` 的全局默认 API 测试随该额外范围选择；默认不纳入测评。日期采样稳定性 fixture 是独立测试修复，不能悄悄混入测评发布范围。

## 必须排除的其他工作

AI 助手/会话、简历、资讯、公司列表、机构、岗位卡片/页面、api-v4/api-companies/api-agencies、resume service 及其测试、视觉 screens.json、招聘脚本等当前 dirty 改动不属于本测评闭包。真实网盘 JSON、临时源、数据库、uploads、环境与密钥均不入库。

## 支付与生产阻断

本次后台生产发布的新增必要边界：`services/companyService.js`、`routes/companies.js` 和 `routes/v4/jobs.js` 仅增加测评导入来源未发布公司的公共查询过滤/编辑来源保留；新增 `tests/assessmentCompanyVisibility.test.js` 注册为第五个后端测评专项。除该一行公司查询外，不纳入其他职位变更。后台仍能查看、编辑公司，明确发布后才进入公共列表。

独立测试修复已由 root 另行批准：`tests/jobSourcesIntegration.test.js` 与 `tests/helpers/jobSourcesProbe.cjs` 的日期抽样 fixture 固定。旧精确 Linux 候选490项489通过、1项既有预期9次/实际8次失败，因此用单独的测试修复树 T（HEAD+两测试文件）先提交，最终测评树 F 包含相同两 blob，测评提交以 T 为父从而不混合这两项。没有职位运行代码改动；最终 F 必须独立通过 Linux 全部门禁，不能沿用旧树或 dirty 工作区结果。

1. 5 个资料 SKU 已发布不等于服务已能收费。当前资料复用全局 payment readiness，virtual readiness 仍要求非 optional 会员月/季/年 SKU。不得以资料 SKU 成功替代配置验证。
2. `PAYMENT_ENABLED`、`REAL_PAYMENT_LAUNCH_APPROVED` 全局开启可能同时开放会员/场景包创建订单；不能作为“只测评”开关。`COMMERCE_ROLLOUT_APPROVED` 当前保护灰度后台写入，不是每个 checkout 的实际 gate。未获新决定时保持这些门禁不变，不擅自设计或启用新开关。
3. 公开 `purchaseEnabled` 已有专项修正：通过与实际资料下单一致的能力判断显式注入，服务默认 fail-closed，历史已付领取不受影响。须从主项目独立复验，不能仅以源码或临时副本为证据。
4. 生产迁移仍按 `DATABASE_MIGRATION_PLAN.md`：显式数据库目标、停止写入、一致性备份及验证、Human 独立审批、production-approved、迁移后 integrity/FK/schema 版本/健康检查；不能把参数视为审批。
5. 真实支付验收仍需覆盖 9 元到账、取消/重复点击、重复及迟到回调、本人领取、跨账号拒绝、已购恢复和退款撤权。客户端支付成功不是到账凭据。

后续 fresh verifier 的发布门禁与导入演练一律从唯一主项目执行；只允许临时隔离数据库，不指向主运行库或生产库。
