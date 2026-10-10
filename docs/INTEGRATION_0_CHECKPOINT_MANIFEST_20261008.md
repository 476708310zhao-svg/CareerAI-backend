# Integration 0 Checkpoint 清单（2026-10-08）

> 目的：把 2026-10-08 的大规模未提交工作区拆成可验证、可回退的原子 checkpoint，并记录后续交付状态。初始基线用于审计，不代表当前 HEAD；远端同步仍需单独授权。

本 manifest 是 checkpoint 拆分与执行历史，不是运行事实的替代品。当描述冲突时，以已提交的运行代码/schema 和最终门禁输出为事实依据；交付记录只做摘要，PRD 表达产品意图，旧记录只用于追溯。

## 1. 唯一仓库与冻结基线

- 唯一项目根目录：以 `git rev-parse --show-toplevel` 的结果为准
- 禁止使用：个人机器旧副本、Junction 别名或仓库外复制目录
- 分支：`codex/v4-development`
- HEAD：`c339d4005b250b2cdea6a394d2f65cf3c14ec561`
- 相对 `origin/codex/v4-development`：ahead 3 / behind 6。该结果来自**未执行 fetch 的本地 origin 引用**，只用于风险提示，不能代表远端实时状态。
- tracked modified：107
- tracked deleted：25
- untracked files：53
- individual changed paths：185
- staged：0
- tracked diff：132 files，`+2503/-3227`

基线约束：拆分期间不得批量格式化、统一换行符或顺手重构；所有命令都从 Git 返回的唯一项目根目录执行。

## 2. 已批准的取舍

| 项目 | 当前决定 | 执行规则 |
|---|---|---|
| 运行时代码、测试、PRD | 保留 | 按下文依赖顺序归入 checkpoint |
| `artifacts/` screenshots | 不入库 | 保持未跟踪；截图和日志仅作为本地验收产物，除非产品明确指定交付 |
| 原 17 个待确认项 | 已在 Checkpoint 9 解决 | 删除 4 个零引用共享组件的 16 个文件，并移除 `miniprogram/package-career/pages/project-builder/project-builder.json` 中未使用的 `c-button` 注册；保留仍有真实引用的 `c-button` 本体 |
| `recruitment` 默认 feature flag | 未调整 | `utils/featureFlags.js` 和已提交 `.env.example` 的默认值保持 `false`；工作区中预制的 `true` 改动不属于任何已交付 checkpoint |

17 个待确认项的原始口径如下；调用证据已在 Checkpoint 9 复核，结果由 `2fad29d14013dc813f11f5e5738c0095091e7c15` 固化：

- 16 个共享组件删除路径：`c-action-bar`、`c-ai-loading`、`c-search-bar`、`c-section-card` 四个组件目录中的 `.js`、`.json`、`.wxml`、`.wxss` 文件，共 16 个删除路径，已确认零引用并删除。
- 1 个配置修改 hunk：`miniprogram/package-career/pages/project-builder/project-builder.json` 中移除未使用的 `c-button` 注册；`c-button` 组件本体因仍有其他引用而保留。

## 3. 原子依赖组

以下边界用于判断哪些文件必须同行、哪些依赖必须延后；不允许按“已跟踪文件一次、未跟踪依赖另一次”机械拆分，也不代表每个列出文件都必须进入同一个 commit。checkpoint 1 的候选范围精确限定为下述两文件。

1. **迁移执行边界**
   - `db/migrations/0007_ai_conversations.sql`
   - `tests/databaseMigrations.test.js`
   - `db/migrate.js` 是正式迁移 API 的权威入口，除非验证证明 API 本身必须修改，否则只作为依赖依据，不进入首个原子 commit
   - 工作树已经恢复掉 `db/v4Schema.js` 直接读取/执行 0007 的旁路；当前相对 HEAD 的该文件 diff 仅包含材料类型扩展，归 checkpoint 6，checkpoint 1 不得暂存该文件
   - checkpoint 1 仍须验证完整启动链不存在直接读取或执行 migration SQL 的路径，0007 只能由正式 migration runner 应用
   - `tests/helpers/webApplicationFixture.cjs` 直接依赖 checkpoint 2–4 的 applications、AI conversations 和 web-session routes，因此不得进入 checkpoint 1 或 2；该跨域 fixture 与相关案例延后到 checkpoint 4 原子交付
2. **申请工作流 / 工作台后端**
   - `services/v4ApplicationWorkflow.js`
   - `services/v4ApplicationWorkspace.js`
   - `routes/v4/applications.js`
   - 对应可独立运行的服务端测试；不得为了 checkpoint 2 提前提交 `tests/helpers/webApplicationFixture.cjs`
3. **持久化 AI 会话**
   - `routes/ai-conversations.js`
   - `services/aiConversations.js`
   - `server.js` 中路由挂载
   - 对应迁移、测试与客户端调用
   - 注意：`services/aiConversations.js` 依赖申请工作台/工作流，因此不得早于依赖组 2
4. **Web 登录与 Web P0**
   - `routes/web-session.js`
   - `services/webSessionCodes.js`
   - `public/web/`
   - `server.js` 中路由及静态资源挂载
   - `tests/webWorkbench.test.js`、`tests/browser/`、`tests/helpers/webApplicationFixture.cjs` 及相关跨域案例；fixture 与所依赖的 checkpoint 2–4 路由在此作为原子交付联合验证
   - `tests/helpers/webApplicationFixture.cjs` 纳入前必须校验 `WEB_TEST_ISOLATED=1`，并确认 `DB_PATH`、`DATA_DIR`、`UPLOAD_DIR` 均已设置且解析后位于同一个隔离临时根目录；不满足时不得进入 checkpoint 4
5. **移动申请闭环**
   - `miniprogram/utils/application-state.js`
   - `miniprogram/utils/application-queue.js`
   - 岗位、申请列表/详情、进度及其导航/状态测试
   - 原候选中的 `miniprogram/utils/campus-deadline.js` 依赖仍未交付的首页/校招改动，最终未进入 Checkpoint 5；后续只能与调用方和测试原子同行
6. **申请材料工具迁移**
   - 删除 `miniprogram/utils/application-materials.js`
   - 新增 `miniprogram/package-ai/utils/application-materials.js`
   - 两个实际消费者的引用更新
   - `scripts/acceptance-bot.js` 的静态检查同步更新
   - 不得恢复旧主包文件来绕过验收
7. **首页组件删除**
   - `miniprogram/components/home-core-tools/*` 的删除
   - `miniprogram/pages/index/index.json`、`miniprogram/pages/index/index.wxml` 中引用移除
   - 必须在同一个 checkpoint 中验证

## 4. Checkpoint 顺序与完成条件

严格按以下顺序推进；前一项未通过门禁，不进入下一项。

| # | Checkpoint | 最小完成条件 | 专项验证 |
|---:|---|---|---|
| 1 | migration baseline | 0007 由正式 migration runner 管理；候选 commit **精确只包含** `db/migrations/0007_ai_conversations.sql` 与 `tests/databaseMigrations.test.js`，不包含 `db/v4Schema.js`、未跟踪 fixture 或 `scripts/acceptance-bot.js`；验证启动链不存在直接读取或执行 migration SQL 的路径 | 只运行 migration 单测：覆盖全新库；从已登记 0001–0006 的库升级时仅应用 0007；二次运行不再应用迁移且结果幂等；不要求 Web/工作台/AI fixture 冒烟 |
| 2 | application workflow/workspace backend | 工作流、工作台 service 与 applications 路由闭合；不得纳入跨域 Web fixture | 仅运行此时可独立执行的 application/workspace 测试，覆盖鉴权、跨用户隔离、状态流转与版本冲突；若现有测试依赖后续跨域 fixture，先拆分测试，否则书面延后至 checkpoint 4 联合验证 |
| 3 | persistent AI conversations | 会话 CRUD、上下文读取与申请工作台依赖闭合；不得提前纳入 Web session fixture | 仅运行此时可独立执行的 AI conversation 测试，覆盖跨用户隔离和持久化；若现有测试不能脱离 `tests/helpers/webApplicationFixture.cjs` 独立运行，先拆分测试，否则书面延后至 checkpoint 4 联合验证 |
| 4 | web login + Web P0 | Web session、静态工作台、服务端挂载、`tests/helpers/webApplicationFixture.cjs` 及其跨域案例闭合；fixture 纳入前确认 `WEB_TEST_ISOLATED=1`，且 `DB_PATH`、`DATA_DIR`、`UPLOAD_DIR` 位于同一个隔离临时根目录 | Web 专项、登录码过期/复用/越权、关键浏览器场景；联合验证 checkpoint 2–4 的 applications、AI conversations、web-session routes；对 fixture 的四项隔离配置做失败优先校验 |
| 5 | mobile application | 移动端状态、队列、截止日、岗位到申请闭环闭合 | `mobileWorkflow`、导航配置、小程序静态检查；重复点击与离线/重试 |
| 6 | resume/materials/interview | 简历、申请材料和面试上下文闭合；材料工具迁移及验收路径一致 | 相关单测、导航测试、acceptance 静态检查、小程序检查 |
| 7 | resources/profile | 资源中心、个人中心及内容入口闭合 | 导航、页面配置、资源图片引用与包体检查 |
| 8 | home/navigation | 首页、TabBar、导航和组件删除闭合 | 首页/导航专项、小程序检查；确认无已删除组件引用 |
| 9 | cleanup/artifact decisions | 逐项决定临时产物和待确认删除；未决项继续保持未暂存 | 未跟踪/删除清单复核；敏感文件与大文件扫描 |
| 10 | docs | PRD、实施说明、状态记录与真实代码一致 | 链接/路径检查；文档中的测试数字与实际结果一致 |
| 11 | sync | 所有本地 checkpoint 验证通过后再评估远端差异 | 先刷新远端信息，再做提交级冲突审查；未获授权不 pull/push |

## 5. 混合文件与 hunk-split 规则

以下文件承载多个 checkpoint，禁止整文件无差别暂存；先按 hunk 归属审查。

| 文件 | 拆分要求 |
|---|---|
| `db/v4Schema.js` | 工作树已无 0007 旁路执行 diff；当前相对 HEAD 的材料表 CHECK 扩展归 checkpoint 6，checkpoint 1 不得暂存该文件；仍需通过启动链静态检查确认不存在直接执行 migration SQL 的路径 |
| `server.js` | AI conversation 挂载归 checkpoint 3；Web session/静态站点挂载归 checkpoint 4；其他改动另行归属 |
| `routes/v4/applications.js` | 工作流/工作台后端归 checkpoint 2；与移动 UI 无关的变更不得混入 checkpoint 5 |
| `tests/all.test.js` | 只在对应专项测试文件已经归组后，按 checkpoint 加载入口拆分 |
| `scripts/acceptance-bot.js` | 材料工具新路径检查归 checkpoint 6；其他验收变化单独审查 |
| `miniprogram/app.json`、`miniprogram/utils/navigation.js` | 页面注册与导航改动按功能归组，首页/一级导航统一在 checkpoint 8 收口 |
| `miniprogram/package-career/pages/project-builder/project-builder.json` | 原 `usingComponents` 待确认 hunk 已在 Checkpoint 9 按引用证据解决；后续修改按新的功能归属单独评估 |
| `.env.example` | 先确认属于哪个可运行能力；不得夹带到纯文档或纯 UI checkpoint |

操作要求：生成候选 diff 后逐 hunk 阅读；发现同一 hunk 混合两个目标时，先重构为可独立验证的小改动，再考虑 checkpoint。

## 6. 每个 Checkpoint 的统一验证门禁

每个 checkpoint 都必须满足以下门禁并留下结果记录：

1. **范围门禁**：列出候选路径与依赖图，确认没有引用未纳入的未跟踪文件。
2. **差异门禁**：逐文件、逐 hunk 审阅；禁止 `git add -A`，禁止把 `artifacts/` 或其他未归属预制改动带入。原 17 个待确认项只能由已验证的 Checkpoint 9 提交承载，不得在后续 checkpoint 重复混入。
3. **语法门禁**：对修改的 JS 运行 `node --check`；对 JSON 做解析检查。
4. **专项门禁**：运行表格中对应测试，失败必须归因并修复，不能以“既有失败”直接放行。
5. **全量门禁**：专项通过后，只有在测试入口不要求尚未进入当前 checkpoint 的未跟踪跨域 fixture 时，才运行仓库现有全量测试及适用的 `check:miniprogram` / `check:release`。checkpoint 1 只要求 migration 单测；checkpoint 2、3 若被 `tests/helpers/webApplicationFixture.cjs` 阻断，应先拆分测试或书面延后至 checkpoint 4 联合验证，不得因此提前提交 fixture。
6. **数据库门禁**：涉及 schema 时，验证全新库迁移、已有库升级和重复执行；checkpoint 1 必须证明从已登记 0001–0006 的库升级时只应用 0007，二次运行不再应用迁移且结果幂等，并确认启动链不存在直接读取或执行 migration SQL 的路径；只验证当前 checkpoint 已纳入的测试数据库 helper 隔离，不得为此提前引入 `tests/helpers/webApplicationFixture.cjs`。checkpoint 4 纳入该 fixture 前，必须校验 `WEB_TEST_ISOLATED=1`，并确认 `DB_PATH`、`DATA_DIR`、`UPLOAD_DIR` 均存在且解析到同一个隔离临时根目录。
7. **静态引用门禁**：搜索旧路径、已删除组件和新增未跟踪依赖；结果必须为零或有书面例外。
8. **差异卫生门禁**：`git diff --check` 通过；不得批量改换行符，当前 LF/CRLF 风险保持隔离。
9. **安全门禁**：检查 `.env`、密钥、数据库文件、上传物、大体积二进制和用户数据未进入候选范围。
10. **回退门禁**：该 checkpoint 能以单一变更单元撤销，且不会留下启动时报错或断裂引用。

任一门禁不通过：停止该 checkpoint，记录阻断原因，不扩大修改范围到下一个 checkpoint。

## 7. 本清单执行状态

截至 2026-10-10，本地执行状态如下：

| Checkpoint | 状态 | 提交/证据 |
|---:|---|---|
| Integration 0 | 已完成 | 建立本清单、工作区边界和数据库保护基线；无独立业务提交 |
| 1 | 已完成 | `8dc78ec11d3abefa49acaf9ce96e03e77d9a6a2c` |
| 2 | 已完成 | `55c6fb7737196ccd66864e50b2fb7c5b2aead6f7`、`8213523278ea1210ca312293d178ee6ccb61cdd2` |
| 隔离安全补丁 | 已完成 | `c3a92477e3ac21b547dec1f98684ca2d19dfadf3`、`313fac69361cda72081690e0d2448631c2bedd07` |
| 3 | 已完成 | `2aefaf8d3386c57696475b5a13aca8573163595c` |
| 4 | 已完成 | `990ba67888112769b2b7e7492d7aaed8ce188af5` |
| 5 | 已完成 | `5eb22e924ac15802f09ce4e35134d22a5bd0e883` |
| 6 | 已完成 | `e49ba03bd4c631fd568ef88fc24f207fbc5537b6` |
| 7 | 已完成 | `a88a2a9e6e3bcaf2f438f794384b0122ddd9d9bf` |
| 8 | 已完成 | `c1696ffb81a3afda5b7bb2d6b86b3c301b617007` |
| 9 | 已完成 | `2fad29d14013dc813f11f5e5738c0095091e7c15` |
| 10 | 自动化门禁通过，本次文档提交落地后完成 | 2026-10-10 11:39（Asia/Shanghai）候选 tree `abdaccf0cdecccda635440546d039e48f88916c9` 通过自动化门禁；该 tree 不是 branch commit，提交哈希以 Git 历史为准 |
| 11 | 未开始 | 未获 `fetch`、`pull`、`push` 或部署授权；不得用 2026-10-08 的远端差异数字作当前结论 |

Checkpoint 9 最近一次记录为 `npm test` 318/318、`check:acceptance` 30/30、`check:miniprogram` 通过且媒体包 192.3 KB。该记录不替代 Checkpoint 10 后的最终候选快照复验。

Checkpoint 10 候选 tree 的正式自动化证据：`npm test` 318/318、`check:acceptance` 30/30、`check:miniprogram` 通过（媒体 192.3 KB，主包 0.99 MB）；`check:e2e-3.0` 4/4 仅为 dry-run 预检，不代表微信 UI 或真机 E2E。Migration `0001–0011`、五 Tab、6 个 feature 默认值、Checkpoint 9 组件清理、材料工具路径与其他静态一致性检查通过。主数据库指纹未变，未执行 migration apply。微信开发者工具完整主链路、真机 E2E、生产部署、远端同步和真实支付仍未完成。

当前已提交运行代码基线为 `2fad29d14013dc813f11f5e5738c0095091e7c15`。仓库正式 migration 序列已到 `db/migrations/0011_application_material_types.sql`；任何目标环境只能通过正式 migration runner 确认 `0001–0011` 全部已登记且 `pending=0`，不得手工只执行单个 SQL。预发/生产状态尚未验证，也未获得 apply 授权。

仍在工作区但不属于已交付 checkpoint 的内容包括：业务预制 diff、`artifacts/`、设计审计工作包、三张零引用资源图片、与未交付调用方绑定的 `miniprogram/utils/campus-deadline.js`、以及需脱敏后再评估的 API 巡检脚本/记录。精确排除决定和最终门禁见 `docs/FINAL_DELIVERY_RECORD_20261010.md`。
