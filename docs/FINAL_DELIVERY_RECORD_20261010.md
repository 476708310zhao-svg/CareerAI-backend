# 职引功能简化与 AI 编排交付记录

> 记录日期：2026-10-10
> 已提交运行代码基线：`codex/v4-development` / `2fad29d14013dc813f11f5e5738c0095091e7c15`
> 当前状态：Checkpoint 1–9 已形成原子提交；Checkpoint 10 自动化候选门禁通过，本记录随本次文档提交生效，提交哈希以 Git 历史为准
> 发布状态：未部署、未上传微信版本、未推送远端

本文是本轮交付摘要，不是事实源的替代品。权威层级为：已提交的运行代码/schema 与最终门禁输出是事实依据；本文摘要交付边界；PRD 表达产品意图；Integration manifest 记录拆分历史；旧开发记录只用于追溯。

## 1. 已交付 checkpoint

| Checkpoint | 提交 | 交付边界 |
|---|---|---|
| 1 | `8dc78ec11d3abefa49acaf9ce96e03e77d9a6a2c` | AI conversation 正式 migration baseline |
| 2 | `55c6fb7737196ccd66864e50b2fb7c5b2aead6f7`、`8213523278ea1210ca312293d178ee6ccb61cdd2` | 申请工作流/工作台后端、北京时间与 Today 一致性 |
| 安全补丁 | `c3a92477e3ac21b547dec1f98684ca2d19dfadf3`、`313fac69361cda72081690e0d2448631c2bedd07` | 数据库测试与 acceptance 运行时隔离 |
| 3 | `2aefaf8d3386c57696475b5a13aca8573163595c` | 持久化、隔离、可取消的上下文 AI 会话 |
| 4 | `990ba67888112769b2b7e7492d7aaed8ce188af5` | Web 登录与申请工作台 P0 |
| 5 | `5eb22e924ac15802f09ce4e35134d22a5bd0e883` | 移动端岗位到申请推进闭环 |
| 6 | `e49ba03bd4c631fd568ef88fc24f207fbc5537b6` | 简历版本、申请材料与面试闭环 |
| 7 | `a88a2a9e6e3bcaf2f438f794384b0122ddd9d9bf` | 资源中心与个人资产中心 |
| 8 | `c1696ffb81a3afda5b7bb2d6b86b3c301b617007` | 首页减法、五 Tab 与导航收口 |
| 9 | `2fad29d14013dc813f11f5e5738c0095091e7c15` | 删除零引用共享组件及配置清理 |

Integration 0 是拆分、范围和数据库保护基线，不是单独的业务提交。Checkpoint 10 候选只同步文档与交付证据，不吸收仍留在工作区的业务预制改动。

## 2. 当前产品结构与边界

- 五个一级 Tab 为：首页、找岗位、进度、资源中心、我的。
- `application` 是主业务对象；申请工作台聚合下一步、任务、简历、材料、匹配证据、面试和时间线。
- 用户侧 AI 已收敛为统一上下文入口；旧四 Agent 名称只可作为内部路由概念，不再要求用户选择专家。
- 简历主入口为 Resume Center；旧简历和旧 AI 页面保留安全兼容跳转。
- 简历、材料、面试和本地敏感缓存按账号隔离；AI 写入、材料确认及面试跨对象影响需要明确确认。
- 资源中心是内容资产中心，“我的”是个人资产中心；“已购资料”只保留分类/入口和诚实空态，没有独立功能开关。本轮未交付真实测评资料商品、购买、支付、授权或退款闭环。
- `utils/featureFlags.js` 中 `recruitment`、`home_recommendations`、`membership`、`v4_interview`、`v4_ai_career`、`v4_membership` 的代码默认值均为 `false`。环境或数据库显式配置可以改变运行值。

## 3. 自动验证证据

2026-10-10 11:39（Asia/Shanghai），只包含已批准 checkpoint 与 7 份 CP10 文档的候选 tree `abdaccf0cdecccda635440546d039e48f88916c9` 完成自动化门禁。该值是 Git tree 证据，不是 branch commit。

- `npm test`：318/318 通过。
- `npm run check:acceptance`：30/30 通过。
- `npm run check:miniprogram`：通过，媒体包 192.3 KB，主包 0.99 MB。
- `npm run check:e2e-3.0`：4/4 通过，仅为 dry-run 预检，不是微信 UI 或真机 E2E。
- Migration `0001–0011` 连续；五 Tab、6 个 feature 代码默认值、Checkpoint 9 组件清理、材料工具路径、JS、JSON、diff、安全与引用等静态一致性检查通过。
- 主数据库 size、mtime 和 SHA-256 与保护基线一致；未执行 migration apply。

以上是自动化候选门禁的正式证据。微信开发者工具完整主链路、真机 E2E、生产部署、远端同步和真实支付仍未完成。

## 4. 数据库隔离证据

仓库正式 migration 序列当前为 `0001–0011`，最新文件是 `db/migrations/0011_application_material_types.sql`。目标环境必须使用正式 migration runner 核对 `schema_migrations`，确认全部已应用且 `pending=0`；禁止手工只执行单个 SQL。预发/生产尚未执行本轮核验，也未获得 migration apply 授权。

受保护主数据库基线：

| 属性 | 值 |
|---|---|
| Size | `13758464` bytes |
| Last write (UTC) | `2026-10-08T08:17:53.4291516Z` |
| SHA-256 | `B221AD658D1B24AECAB2F8C1E43F2749C44F979EF703DE35D92283A491C69D4B` |

最终门禁必须再次读取这三个值。任何变化都应停止交付并调查；不能用新的指纹覆盖本基线来放行。

## 5. 最终发布门禁

自动门禁必须针对只包含已批准 checkpoint 的干净快照：

```bash
npm test
npm run check:miniprogram
npm run check:acceptance
git diff --check
```

还必须完成：

- [x] 候选路径逐项审阅，确认没有混入剩余业务预制 diff。
- [x] 扫描候选文件中的凭据、Token、个人信息、数据库、日志、上传物和大文件。
- [x] 复核主数据库 size、mtime 与 SHA-256 均未变化。
- [x] 验证 Markdown 链接、仓库相对路径、命令和测试数字。
- [ ] 微信开发者工具完成五 Tab、首页、申请工作台、AI 历史/取消/确认、简历、材料、面试、资源和我的主链路回归。
- [ ] 真机验证登录失效、弱网、重复点击、重进页面、旧链接/分享参数和账号切换隔离。
- [ ] 产品、研发和测试确认开关、监控、回滚与发布负责人。

仓库已提供 `scripts/e2e-3.0-bot.js`、`miniprogram-automator` 和 `npm run check:e2e-3.0`；本机可发现微信开发者工具 CLI，2026-10-10 的 dry-run 预检 4/4 通过。本轮尚未运行真实 E2E，且该脚本不能替代真机登录、授权、支付和双账号场景。

## 6. 明确排除和未决项

- `artifacts/`：截图和日志属于本地验收产物，默认不入库。
- `DESIGN-IS-2026-10-08/`：设计审计工作包未纳入正式交付文档。
- `miniprogram/images/resource-agencies.png`、`resource-history.png`、`resource-news.png`：零代码引用，不入库；不擅自删除用户文件。
- `miniprogram/utils/campus-deadline.js` 与其调用/测试：存在真实依赖，但依赖均属于未交付业务预制 diff；后续必须源码、调用方和测试原子同行，不能只提交工具文件。
- `scripts/audit-mobile-api.js` 与 `docs/API_AUDIT_20260920.*`：脚本和记录互相依赖且包含正式环境巡检背景，本轮不纳入；若后续交付，必须先脱敏并以专用测试账号执行。
- `.env`、运行数据库、日志、`uploads/`、`miniprogram/project.private.config.json`：永不作为本轮交付物。
- 测评资料商业化：[`ASSESSMENT_RESOURCE_COMMERCE_PRD_20261008.md`](ASSESSMENT_RESOURCE_COMMERCE_PRD_20261008.md) 仅为后续规划，不代表商品、订单、支付或内容授权已上线。
- 远端同步：Checkpoint 11 尚未获授权；不得据旧的 ahead/behind 数字直接 pull、push 或处理远端分支。

## 7. 关联文档

- [功能简化与 AI 编排 PRD](PRODUCT_SIMPLIFICATION_AI_ORCHESTRATION_PRD_20261008.md)
- [Integration 0 Checkpoint 清单](INTEGRATION_0_CHECKPOINT_MANIFEST_20261008.md)
- [数据库迁移规则](DATABASE_MIGRATION_PLAN.md)
- [验收机器人说明](ACCEPTANCE_BOT.md)
