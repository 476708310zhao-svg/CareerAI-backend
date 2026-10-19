# 测评后台生产发布执行记录

日期：2026-10-19。基线：`c5bd1887b9b418abfc18d341e30904f573b2defc`。

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

准备中：本文件建立时尚未生成候选提交、上传版本、变更生产数据库、切流或导入。完成各步骤后由实际执行者追加证据；本记录不预填成功结果。
