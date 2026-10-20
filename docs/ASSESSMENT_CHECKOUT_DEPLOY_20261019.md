# 测评资料购买后端部署与真实验收

日期：2026-10-19（Asia/Shanghai）。当前结果：精确后端已完成标准部署并仅开放资料真实收款；真实9元付款、真实微信通知与本人网盘领取尚待Human验收。以下准备过程为阶段历史，以末尾实际执行结果为准。

## 授权与边界

Human 要求继续后端部署和真实支付验收。微信小程序上传、提审和正式发布均由 Human 自行执行；本轮不代操作。真实购买应由 Human 在设备端确认，不能用 Mock 确认、合成通知或数据库改状态代替实际支付。

后续明确授权：“直接开放全部用户购买资料，我自己支付9元验收”。因此不增加测试账号白名单；仅开放资料新销售，会员与场景包保持关闭。该授权不等于真实付款已经成功。

## 精确候选

基线为 `93afc1340a301269b13b94d2ccae7e49eaa8363b`。只选择购买能力拆分所需的四个文件：

- `routes/payment.js`：资料真实渠道独立于会员 SKU；会员/场景包销售可显式关闭。
- `tests/assessmentPaymentCapability.test.js`：能力矩阵、合成签名通知、本人交付与退款撤权隔离测试。
- `.env.example`：只增加示例 `MEMBERSHIP_PAYMENT_ENABLED=false`，不包含真实凭据。
- `docs/ASSESSMENT_RESOURCE_RELEASE_20261019.md`：仅包含购买修复增量说明。

不选择本记录、旧部署记录、开发状态历史、任何未提交小程序/AI/简历/资讯/职位或视觉阈值变更。通过 `.git/` 下独立 `GIT_INDEX_FILE` 从 HEAD 组装候选；真实 index 不变，用户工作文件不覆盖。不建立仓库外可运行副本。规范归档以 `git -c core.autocrlf=false archive` 从候选 tree 生成，逐个 Git blob 核对字节哈希。

## 高风险控制

1. 全局收款门禁只会在部署代码、凭据/通知配置核验和会员隔离方案通过后受控开启；候选准备阶段不改生产 `.env`。
2. 必须明确 `MEMBERSHIP_PAYMENT_ENABLED=false`，否则部署前已有会员 SKU 可能令全局开启同时开放会员/场景包。`COMMERCE_ROLLOUT_APPROVED` 保持原状态，不借本轮放量其他商品。
3. 候选测试仅使用独立临时 DB、DATA_DIR、UPLOAD_DIR，所有收款/审批门禁关闭、Mock 显式关闭；不用生产凭据，不链接共享 `.env`，不执行候选对生产的迁移或读写。
4. 切流前先按现有标准脚本完整备份并验证数据库、环境及实际 Nginx 配置。迁移 pending 必须为 0，本次无新增 schema；发布失败只回滚代码/进程，不在恢复写入后覆盖运行 DB。
5. 真实验收前记录财务表行数/规范行哈希和目标商品 900 分/SKU/共享说明，之后只允许预期测试订单与相应账本增加。禁止输出用户资料、完整网盘地址、提取码、密钥或完整令牌。
6. 先在全局支付关闭时部署新代码并确认健康，再按 root 受控执行开启 `PAYMENT_ENABLED` 与 `REAL_PAYMENT_LAUNCH_APPROVED`，明确 `MEMBERSHIP_PAYMENT_ENABLED=false`，其余环境项不改。若回滚旧代码，必须先关闭全局 `PAYMENT_ENABLED` 并核验生效，旧代码并不认识会员独立销售开关，禁止保持全局开启直接回滚。
7. PM2 可能继承旧 `PAYMENT_ENABLED=false`，而 dotenv 默认不覆盖进程环境。实际开关核验必须读取仅 `jobapp-server` 的三项有效 flag 并检查商品 `purchaseEnabled`，不能只看配置文件或全局 PM2 dump。若继承值冲突，只针对该具名应用显式传相同三 flag、`restart --update-env`，其余环境和具名进程不变，不打印 raw env/jlist。会员关闭后 `/api/payment/config.enabled=false` 是预期；资料可购买应以五商品 `purchaseEnabled=true` 为准，不能为让会员 available=true 而开会员。

## 候选证据（Linux 隔离门禁已执行）

- tree：`07c5583de9f79e205af7a8d2296ad4c1cd327d32`，四文件增量；2044 个跟踪 Git blob。
- 规范 LF tar SHA-256：`71e639e9cae510ff6bc9a65dcc26d219b49d12eab909ed5f021ce23e5d5d60f0`。
- 本地私有证据目录：`.git/assessment-checkout-release-20261019/`，包含 alt index、diff、完整逐文件 SHA-256 与原工作文件快照；默认 index SHA-256 保持 `919128801190c789fefb0acf278b0457357b5765c24fa41d420097b95915d483`。
- 初次逐 blob 生成方式已停止，改为 `ls-tree` 与 `cat-file --batch` 批量读取；2074 项原文件核验仅发现本人持有的状态/本记录及同期其他线程的首页/视觉四文件变化。未改写、覆盖或回滚同期用户变更，且均不在候选差异内；不以“全工作区字节不变”表述。
- 服务器暂存目录：`/www/wwwroot/zhiyincareer-main/releases/assessment-checkout-preflight-20261019-07c5583de9f79e205af7a8d2296ad4c1cd327d32-lf`；测试前后2044项字节哈希与候选 Git blob 全部一致，目录没有真实 `.env`。
- 隔离证据目录：`/tmp/jobapp-assessment-checkout-check.kNnbVJ`，含 `npm-ci.log`、`check-release.log`、`acceptance.log`。`check:release` 和 `check:acceptance -- --no-report` 均退出0；精确 Linux 全量504/504通过、0失败/0跳过（47797.258575ms）；AI7/7、外部请求0，小程序媒体197.1KB/主包估算1.05MB，数据0错误/5项既有提示；Acceptance29通过/0失败/1项既有提示/0跳过。fresh verification 已独立 SSH 读取完整摘要、2044项 SHA BAD0、没有 `.env`（含symlink）及根运行DB，并核对受保护 `/tmp` 测试库；不是 dirty 工作区测试结果。
- 外层命令以 `env -i`、关闭支付/审批/Mock、独立 DB/DATA_DIR/UPLOAD_DIR 启动；测试内部既有隔离 runtime 会显式启用合成 Mock 情景及测试凭据，Acceptance 包含隔离 Mock 下单确认。上述不是生产 Mock 启用、真实微信支付或外部真实扣款，不能把“外层 false”误写为整个测试过程从未启用 Mock。
- 首次暂存尝试 shell quoting 失败于空目录参数，未创建目标目录；修正为 shell 单引号安全传参后新建唯一目标，后续上传及哈希校验成功。未重试或改写既有生产 release。

## 待执行门禁与计划路径

### 实际执行交接与备份

root 确认 fresh 质量、反模式及 Linux 精确504/504测试后，将本记录与开发状态唯一写入权交给 assessment_checkout_production_execute，并先批准备份/正式release准备，随后批准标准部署及健康后仅资料收款开启。提交 `43a312edc31f56d81e90ffb88df646f3742c14cf`（parent `93afc134`）对应本记录精确 tree；已单独推送，不触发自动部署。

在线完整备份目录 `/www/backups/zhiyincareer/jobapp-server_20261019_162208.n996Lw`，目录0700，DB/env/Nginx/PM2快照/上传归档/数据归档均0600。DB 39903232字节、SHA256 `dd3a86b5e69b7d52c299984d55b75d2d7c152fe93e764fa5faaeba8e82195fae`；integrity=ok、FK=0、schema15、pending0，六财务表行数与规范哈希均与此前19订单基线一致。配置备份与活动文件哈希一致，上传和数据tar均可完整列出。标准脚本使用 `cp -a` 保留源模式，故额外仅对新备份目录六个已知文件收紧为0600，未改源配置权限或内容。

切流前guard已确认旧current/PID2199936及环境 `c7042d5596df290257ff947af7bd4ceda422c218fc12e95e636b7326a825eb8a`、Nginx `b5dbf762f721770fde5d374ae496d2a983a83c6fdf00c6a4dea3242c24b7cfdc` 未漂移；五份active商品均900分。正式新目录 `/www/wwwroot/zhiyincareer-main/releases/assessment-checkout-20261019-07c5583de9f79e205af7a8d2296ad4c1cd327d32-lf` 独立创建，没有移动/覆盖preflight证据；同一规范LF归档及2044个blob哈希校验通过，依赖独立安装。已开始全局支付false下的标准部署；此处不预填切流或收费完成。

- 先提交 tree/diff/逐文件 blob SHA-256 清单给 root 和 fresh 复核者，不提交或推送。
- root 确认远程暂存方案后，仅创建 `/www/wwwroot/zhiyincareer-main/releases/assessment-checkout-preflight-20261019-<tree>-lf` 新目录；拒绝覆盖已有目录、拒绝修改 current 或既有发布目录。
- 规范归档上传并逐项比对 2044 个跟踪文件的 Git blob 哈希，安装 Node 20 依赖；隔离测试临时目录使用 `/tmp/jobapp-assessment-checkout-check.XXXXXX`。
- `NODE_ENV=test`，隔离 DB/DATA_DIR/UPLOAD_DIR，`PAYMENT_ENABLED=false`、`REAL_PAYMENT_LAUNCH_APPROVED=false`、`COMMERCE_ROLLOUT_APPROVED=false`、`ENABLE_MOCK_PAYMENT=false`，执行 `npm run check:release` 和 `npm run check:acceptance -- --no-report`。不加载生产 `.env`、不启动 PM2、不执行 deploy.sh。
- 所有门禁及 fresh 质量/反模式/验证复核通过后，由 root 安排提交同步、标准备份/切流、受控开关和用户真机付款验收。本阶段不预填通过结果。

## 标准部署与资料收款实际结果

- 提交 `43a312edc31f56d81e90ffb88df646f3742c14cf`、tree `07c5583de9f79e205af7a8d2296ad4c1cd327d32` 已按root明确GO从正式独立目录执行标准 `deploy.sh`，全局支付false下完成新候选快照、迁移status、strict runtime、PM2身份校验、readiness及current原子切流。没有新增migration apply。
- 标准部署全量504/504、0失败/0跳过，耗时46061.94095ms；脚本退出0，部署前后2044个tracked文件字节与精确Git blob全部相同。服务器日志 `/www/backups/zhiyincareer/assessment-checkout-deploy-20261019.nHWrhr.log`，0600。正式current `/www/wwwroot/zhiyincareer-main/releases/assessment-checkout-20261019-07c5583de9f79e205af7a8d2296ad4c1cd327d32-lf`；支付关闭的部署后PID2237214，内外readiness正常、六财务表与19订单基线相同、env/Nginx旧哈希不变。
- 激活前独立备份 `/www/backups/zhiyincareer/assessment-checkout-flags-20261019.9cRZJA/before.env`，父目录0700、文件0600；原SHA256 `c7042d5596df290257ff947af7bd4ceda422c218fc12e95e636b7326a825eb8a`。只修改 `MEMBERSHIP_PAYMENT_ENABLED=false`、`PAYMENT_ENABLED=true`、`REAL_PAYMENT_LAUNCH_APPROVED=true`；逐键比较确认其余配置包括COMMERCE审批原值不变，保持virtual现网env0及原有凭据/通知Token，未显示密钥。
- env原子更换为0600，新SHA256 `df2e0e4e8bc7c899414f4a9b62c97bf0c76a89f9ad2c6275e16a9115b5154ba1`。只针对具名jobapp-server传入同样三个flag并 `restart --update-env`，随后实际 `/proc/<pid>/environ` 三值完全一致，PID2238810，当前目录正确。健康后执行现有例行 `pm2 save` 持久化状态；这会保存全局观察到的PM2快照，不表示保证其他项目并发状态完全未变，未重启或恢复其他具名应用。
- 内网4400与公网均readiness=true；五份商品价格900分、purchaseEnabled=true，首页enabled且3项；会员config enabled/available/configured/mock全false、availablePlanIds=[]；匿名 `/api/v4/assessment-purchases`、`/api/v4/assessment-orders/test/delivery`、`/admin/api/v4/assessment-products` 均401。没有会员或场景包新销售放量。
- 执行者已通知独立production_verify开始最终只读验收。真实支付仍未发生；不创建实单、不向生产发送合成支付通知或改库造支付状态、不自动扣款/退款，也不上传/提审/发布小程序。Human应自行真机支付9元，再提供订单号或结果供核对真实通知、900分到账、本人领取和账本一致性。

后置脚本初稿把支付尚关闭时可见的历史套餐ID数组误当成销售开放，以及误用少了v4前缀的后台URL；仅修正私有核验脚本的断言和已存在路由路径后复验，未更改已部署运行源码、真实订单或生产鉴权规则。这两次探针报错不是运行系统错误，不以其替代最终独立签核。

### 独立生产终验

assessment_checkout_production_verify 独立只读验收最终PASS，root已确认：current/PID与2044个文件字节、仅三个支付flag改变且其他env不变、schema完整性及财务六表旧基线、五份900分商品可购买、会员销售关闭、私有接口401与内外readiness均通过。尚无本轮实单，真实9元支付、微信真实通知与本人领取待Human亲自付款，不能将本次后端终验称为真实支付闭环已验收。

执行者已完成并释放本记录及开发状态的占用；不再生产写入，小程序上传/提审/发布仍由Human自行执行。
