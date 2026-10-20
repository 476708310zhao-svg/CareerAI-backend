# 测评后台生产发布执行记录

日期：2026-10-19。基线：`c5bd1887b9b418abfc18d341e30904f573b2defc`。

当前结果：后端与管理后台已部署，生产0012–0015迁移、5份真实资料草稿导入及独立验收已完成；商品仍未上架，收款、首页主推及小程序发布均未开放。下文选取流程中的“后续/准备”描述保留为执行前历史，以末尾实际结果为准。本次收尾只改本地文档，不改已部署不可变代码，也未再次暂存、提交或推送。

## 本次授权与不变边界

Human 明确允许“备份核验后，升级生产数据库、部署测评后台，并导入这 5 份资料草稿”。执行目标为既有 `api.zhiyincareer.com` 后端，生产数据库 `/var/lib/jobapp-server/db/jobapp.db`，代码版本目录 `/www/wwwroot/zhiyincareer-main/releases/`。

本次不是开启收款、上架商品、开启首页测评卡片或上传/提审微信小程序的授权。`PAYMENT_ENABLED`、`REAL_PAYMENT_LAUNCH_APPROVED`、`COMMERCE_ROLLOUT_APPROVED` 保持原值关闭；五份资料保持草稿、900分、目录待审、领取天数空，网盘私链不进入 Git 或公开响应。

## 精确发布范围

仅选择后端与管理后台及所需迁移、导入工具和验证：

- 运行代码：`server.js`、`routes/{assessment,admin-assessment,payment,users,companies}.js`、`routes/v4/jobs.js`、`services/{assessmentCommerce,assessmentImport,v4Commerce,companyService}.js`、`utils/adminPermissions.js`。新增公司边界仅隐藏测评导入来源且未发布的公司，保留后台可见性；不带入其他公司或职位功能。
- 管理后台：`admin/assessment-products.html`、`admin/css/assessment-products.css`、`admin/js/{assessment-products,common}.js`。
- 迁移：`db/migrations/0012_assessment_commerce.sql`、`0013_assessment_fixed_nine_yuan.sql`、`0014_assessment_shared_instructions.sql`、`0015_assessment_import_sources.sql`。
- 导入：`scripts/import_assessment_resources.js`、公开 `docs/assessment-import-profile-20261019.json`、用户确认的 `docs/assessment-shared-instructions-20261019.json`；真实飞书源仅置于受控私有路径。
- 验证：`tests/{assessmentCommerce,assessmentAdmin,assessmentImport,assessmentPaymentCapability,assessmentCompanyVisibility,databaseMigrations}.test.js`；`tests/all.test.js` 仅在 HEAD 基础添加五个后端专项注册，不注册未发布的小程序测试。
- 文档：本记录、测评 PRD/实现/导入/共享说明/发布范围文档及开发状态。本次不携带任何小程序源码、AI/简历/新闻/职位的 dirty 改动或对应测试改动。

`routes/users.js` 的账号删除事务调整是测评订单/用户外键接入所需：先完成数据库事务，再移除简历文件；失败保留文件和账号。测试 `assessmentCommerce` 覆盖跨账号、注销及回滚；不借此携带其他 AI 会话测试。

预发布发现的独立测试稳定性修复单独提交：`tests/jobSourcesIntegration.test.js`、`tests/helpers/jobSourcesProbe.cjs`。旧精确候选的 Linux 门禁490项中489通过、1失败，失败是日期驱动国家抽样造成的既有预期9次/实际8次；修复只固定测试进程的抽样国家，并覆盖日本请求重叠缓存，不改运行时职位逻辑。先准备 HEAD 加这两个文件的测试树 T，再准备同时包含相同两个 blob 和测评功能的最终树 F；后续提交顺序为测试修复 T → 测评 F，使测评提交不混入独立测试修复。旧候选及 dirty 主工作区通过记录均属历史，最终 F 须重新通过精确 Linux 门禁。

## 隔离选取方式

所有本地命令从唯一项目根目录执行。使用独立 `GIT_INDEX_FILE`，以 `git read-tree HEAD` 初始化，按精确清单 `git add -- <paths>`；只对 `tests/all.test.js` 使用 `git hash-object -w --stdin` 生成 HEAD 加五条 require 的单独 blob，再 `git update-index --cacheinfo` 录入。`git write-tree` 仅生成候选 tree，不移动分支、不形成提交或推送。

选择前后核对真实 index SHA-256、`git diff --cached`、已有全部工作区文件哈希；除本条文档/状态所有权内的新增记录，用户改动应完全相同。通过 `git diff <HEAD> <tree>` 验证目录、逐文件 diff、秘密/私链排除及精确测试注册。默认 index 不用于本次选取，不通过 stash/reset/checkout 临时更换用户文件。

后续只有 fresh 独立审查确认后才允许生成选定树的提交并推送；同一不可变提交的 archive 上传到服务器新版本目录，按 `production-deploy.md` 在 Linux 部署暂存环境执行预发布隔离门禁。不能用 dirty 主工作区测试通过来证明精确候选通过。

## 生产执行顺序与证据要求

1. 只读核验当前 release、进程、Nginx、支付关闭与 schema0001–0011，确定回滚目标。
2. 审查精确候选树并在不可变 Linux release 暂存目录完成发布和 Acceptance 隔离验证；尚未切流，不运行生产写入。
3. 先保持旧 PM2 主进程在线，按现有备份脚本生成并核验完整生产备份（脚本要求主进程在线），覆盖数据库、环境及 Nginx；然后进入短维护窗口，停止明确的主进程并通过打开文件/连接检查确认没有数据库写入者，再创建不覆盖的最终静默 SQLite 备份，验证完整性、外键与迁移版本。记录路径和 SHA-256，不输出密钥、用户数据或网盘地址。
4. 第一停止写入窗口只应用0012–0015，使用明确生产目标及已获授权标志；确认 pending=0、integrity=ok、FK=0及历史/会员数据未变。此时不导入资料或新公司，核验后重启旧版本并确认健康，建立标准部署需要的在线基线。旧版本尚无新增公司草稿过滤，禁止在旧版本运行期间先导入拼多多草稿。
5. 走不可变新版本的标准候选健康、正式切流及失败代码回滚流程，保留旧 release 和所有备份；不修改 Nginx 业务规则或支付环境。只有新版本及公司草稿过滤代码上线并健康后，才进入第二个短维护窗口：停止新主进程并确认无其他写入者，生成、验证部署后的静默数据库备份；导入器先脱敏 dry-run，再按其独立备份门禁事务导入5草稿/跳过35空行/统一说明一次初始化，重跑应 unchanged5，首页为空/关闭。核验后重启新版本，检查公开拼多多草稿不可见、测评公开商品为0。
6. 两个维护窗口分别保留自己的备份和核验检查点。任一窗口恢复线上写入后，不用之前的旧数据库备份覆盖运行库，避免丢弃新数据；部署失败只按流程回滚代码/进程。草稿导入后若需回滚代码，目标必须仍保留公司草稿过滤能力，不能重新暴露拼多多草稿。数据库恢复不是自动发布回滚步骤，任何独立恢复都需停止写入并重新确认范围。
7. 验收 readiness、公网公开测评空列表、未授权后台及本人领取鉴权、管理后台资源、五个草稿与价格/SKU/来源绑定、统一说明、订单/会员历史不变、支付仍关闭。不得把后台部署称为小程序已发布或真实收费已验收。

## 执行状态

已完成本次获批的后端部署、生产迁移和草稿导入。管理入口：[测评资料后台](https://api.zhiyincareer.com/admin/assessment-products.html)。以下记录为实际执行及独立只读验收证据，不代表商品上架、真实支付验收或小程序发布。

### 版本与精确门禁

- 两项提交均已推送：测试修复 `2d3931831db4e2462909bb34a7ad05e6da935888`；测评后端 `93afc1340a301269b13b94d2ccae7e49eaa8363b`，精确树 `107448fc00abc6a25983eb106d23cae86aa05d79`。
- `current` 对应 `/www/wwwroot/zhiyincareer-main/releases/assessment-20261019-107448fc00abc6a25983eb106d23cae86aa05d79-lf`；主进程 PID2199936。规范LF归档SHA256为 `1824e5429d6f2a091063955a0b161e23140b2d3f2306e3de1c110440b7b57e4a`，2044个Git文件字节均与提交一致。旧6c候选及非规范换行候选标记HOLD，不可部署；未重写迁移SQL，只有规范LF版本对应上述提交。
- 精确 Linux 候选和标准部署门禁均为498/498通过、0失败/0跳过；AI7/7、外部请求0；Acceptance29通过、0失败、1条既有提示。独立只读验收、质量及反模式三项复核均通过；旧候选失败及 dirty 工作区测试仍仅为历史证据。
- 提交前后2064项文件哈希保护核验通过，其他小程序、AI、资讯、职位等未提交工作保留，不随本次后端提交发布。

### 实际维护顺序

在线完整备份后，第一维护窗口停止旧主进程、确认无其他数据库写入者、核验静默备份，再仅迁移0012–0015；约6秒后旧版恢复健康，此时尚未创建拼多多草稿。随后标准部署新后台。第二维护窗口停止新主进程、核验部署后备份及CLI备份，事务导入5份草稿并初始化共享说明；约4秒后新版恢复健康。两个数值不是全程对外中断测量，不能相加声称总停机10秒。

### 已验证备份

下列SQLite备份均按相应执行门禁校验；路径与哈希仅用于本地运维记录，未公开业务数据。

| 检查点 | 绝对路径 | SHA-256 |
|---|---|---|
| 迁移前在线完整备份中的DB | `/www/backups/zhiyincareer/jobapp-server_20261019_152130.w3KZtS/jobapp.db` | `62e96c98d2ede93b00d2f6fba20c898caf70566ed1dd0aaf00f1a5b14b6bf65c` |
| 第一窗口静默迁移前 | `/www/backups/zhiyincareer/assessment-migrate-20261019.eTvAKH/quiesced-before-migration.db` | `bd7a31dfd74a24fe0587b29912c9a3994f3ff32d336e1449fc909346ca1f4603` |
| 标准部署在线完整备份中的DB | `/www/backups/zhiyincareer/jobapp-server_20261019_152535.gr6Zl3/jobapp.db` | `74469ac5c6e87ebfa68b9ee9a17e1091837b41d8431a7eb2bfcee77997cd8186` |
| 第二窗口部署后导入前 | `/www/backups/zhiyincareer/assessment-import-20261019.ag7aTh/quiesced-postdeploy-before-import.db` | `db1325962ce28aa9a66a1b12dd1feb39d1a4b4f64e67a320d37bbff533a882fc` |
| CLI验证的独立导入前备份 | `/www/backups/zhiyincareer/assessment-import-20261019.ag7aTh/cli-verified-before-import.db` | `efb6863d23581e432c4c417f032257e32b8bde55d2f2e1074e2a1305897385aa` |

私有输入 `/var/lib/jobapp-server/private-imports/assessment-20261019.N7VULf/source.json`，12953字节，SHA256 `272d916c7e2126a4da40ffcd020372c84e1c3dcc0b908d30a526135ff23daac3`；受控父目录0700、文件0600。真实分享地址、提取码、密钥和源内容未放入Git、静态资源或此文档。

### 导入与线上验收

- schema15项、pending=0、integrity=ok、外键错误0。源表40行，35行无资料跳过；京东、美团、百度、拼多多、小米5份草稿各900分，对应SKU正确，领取天数null、内容待审标记1，来源绑定及指纹5项一致。复用4家原公司，仅新增拼多多公司77；原76家公司行内容不变。
- 用户四段共享说明与原文精确一致，版本1、完整配置且只初始化一次；生产只读重规划为unchanged5，无重复导入。未对用户资料网盘内容、版权及可下载性作额外保证，仍需运营核验后另行上架。
- 公网readiness正常；后台HTML/CSS/JS为200，匿名私有及管理接口为401；公开商品0、5份详情404、拼多多公司404，公开公司仍76家；首页关闭。
- `PAYMENT_ENABLED` 明确为false，`REAL_PAYMENT_LAUNCH_APPROVED`、`COMMERCE_ROLLOUT_APPROVED` 未设置并使用默认false，三项门禁实效保持关闭。未创建真实付款、未上架或设置首页主推、未上传/提审微信小程序。
- 生产环境SHA256 `c7042d5596df290257ff947af7bd4ceda422c218fc12e95e636b7326a825eb8a`、Nginx SHA256 `b5dbf762f721770fde5d374ae496d2a983a83c6fdf00c6a4dea3242c24b7cfdc` 未改变。操作方确认明确PM2写入仅停止/重启`jobapp-server`、既有部署脚本生成的`jobapp-server-candidate-$$`管理及健康恢复后的`pm2 save`；未全局停止/重启/删除，未操作其他具名应用，未修改cron/crond、Nginx或环境内容。`pm2 save`会保存全局当前观察到的状态，可能连同同期其他应用变化一起持久化，不能据此保证全服务器或其他项目状态不变；不推断其他PM2漂移原因，也不擅自恢复其他进程。

### 历史数据保护与回滚边界

六项财务表在迁移、导入及独立验收保持原行数和规范行哈希：

| 表 | 行数 | SHA-256 |
|---|---:|---|
| `orders` | 19 | `d233c81bc5cc92eb8efdb0652c4b25ac55681ae3fef75e358a26df19922cbf69` |
| `membership_plans_v4` | 8 | `eff33462a3d4b0db74e36d7620712c453e1e5b4a7c94ec0d15c6b528c0e83881` |
| `commerce_ledger_v4`、`payment_refunds_v4`、`entitlement_grants_v4`、`commerce_alerts_v4` | 各0 | `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945` |

不声称全部85表未变：未修改的既有 `db/database.js` 启动逻辑将15353条校招记录的空/null `updated_at` 补为 `created_at`，仅该列变化；健康流量也会产生 `api_performance` 指标记录。这些观测与六表财务保护证据分开记录，不把数据库文件哈希变化误判为财务变化。

恢复写入后不使用旧备份覆盖运行库。草稿导入后，代码回滚目标也必须保留公司草稿过滤；不能回滚到会暴露拼多多草稿的旧版本。任何独立数据库恢复需另行停止写入并确认范围。本次收尾只更新本地两份记录，不向已部署不可变目录追加文件。
