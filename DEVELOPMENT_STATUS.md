# DEVELOPMENT_STATUS

更新时间：2026-10-19

主项目目录：以 `git rev-parse --show-toplevel` 的结果为准。

小程序源码目录：仓库根目录下的 `miniprogram/`。

禁止在个人机器旧副本、Junction 别名或仓库外复制目录中开发、预览、部署或提交。

## 当前批次

### 2026-10-19 小程序主入口信息层级与视觉升级（代码完成）

- 文件归属（本轮完成并释放）：Codex；本记录、`miniprogram/app.wxss`、机会/AI 求职/资源/我的主入口样式与资源、机会 WXML、`miniprogram/components/c-job-card/*` 及两份视觉/导航专项测试。首页保留前一批已完成的今日计划、每日校招和最新机会排版。本轮未碰支付、招聘接口与运行数据，也未覆盖其他工作区改动。
- 目标：沿用已确认的蓝白浅色、白色卡片和语义色，将首屏行动、公司与职位、资源用途和个人记录分层；保持原有页面跳转及数据合同。
- 已完成：岗位卡公司/职位独立两行，地点与有来源的薪资分开显示；机会页补当前展示数量；资源卡补用途/阶段说明；“我的”身份信息回到白色卡片，会员已开通态改为浅色；AI 对话的关键说明文字增大；通用旧灰底与旧按钮色统一到现有蓝白 token。数据、导航和交互处理函数保持不变。
- 验证：视觉/导航/测评相关专项 76/76；`check:release` 全量 545 项中 543 通过、0 失败、2 项既有 Windows 跳过，AI 质量 7/7、小程序静态与包体通过、数据内容 0 错误/5 既有提示；WXSS 机械检查无发现，`git diff --check` 通过。尚未取得微信开发者工具 390×844 截图或真机视觉确认；未提交、上传、提审或发布。

### 2026-10-19 测评购买后端已部署并开放资料收款（真实9元支付待Human验收）

- 执行交接：Codex assessment_checkout_production_execute 现独占本记录及 `docs/ASSESSMENT_CHECKOUT_DEPLOY_20261019.md`。root 已确认 fresh 质量、反模式及 Linux 精确门禁504/504，并明确批准标准生产部署、健康后仅开放资料收款。最终提交 `43a312edc31f56d81e90ffb88df646f3742c14cf` 对应 tree `07c5583de9f79e205af7a8d2296ad4c1cd327d32`，只含四文件。
- 已完成在线完整备份 `/www/backups/zhiyincareer/jobapp-server_20261019_162208.n996Lw`：DB SHA256 `dd3a86b5e69b7d52c299984d55b75d2d7c152fe93e764fa5faaeba8e82195fae`，目录0700、六个备份产物0600，integrity=ok/FK=0/schema15/pending0；财务六表与原基线完全一致，旧current/PID2199936、env及Nginx哈希稳定。正式新release已从规范LF归档提取，2044个blob逐字节校验通过、依赖就绪。当前正在支付关闭下运行标准 `deploy.sh`，不预填切流、收款或真实付款结果。
- 实际结果：标准 `deploy.sh` 完成，正式目录 `assessment-checkout-20261019-07c5583de9f79e205af7a8d2296ad4c1cd327d32-lf` 已切为current；标准门禁504/504、0失败/0跳过，tracked2044个文件部署后字节仍一致。关闭支付的部署后内外readiness、财务六表、旧env/Nginx哈希均核验通过后，单独备份原env并仅修改 `MEMBERSHIP_PAYMENT_ENABLED=false`、`PAYMENT_ENABLED=true`、`REAL_PAYMENT_LAUNCH_APPROVED=true`；COMMERCE审批及其他配置值不变。只重启具名jobapp-server，激活PID2238810，实际进程三flag一致，生产env0600、新SHA256 `df2e0e4e8bc7c899414f4a9b62c97bf0c76a89f9ad2c6275e16a9115b5154ba1`。
- 当前内外接口：五份active商品900分、purchaseEnabled=true，首页开启且三项；会员enabled/available/configured/mock全false、availablePlanIds=[]，未登录已购/交付/管理商品均401，内外readiness=true。已交独立production_verify只读终验；不预填其签核或真实付款结果。未创建真实订单、未向生产发合成回调、未代付款/退款，未操作小程序上传/提审/发布；下一步Human亲自支付9元后再核对订单、真实通知和领取。
- 独立生产核验最终通过：current/PID、2044文件字节、仅三flag且其他env不变、schema与财务六表原基线、五商品可买/会员关闭、私有401及内外readiness均PASS。尚无本轮实单，真实9元回调与领取待Human亲自付款；执行者已完成并释放两份记录的文件占用，不再生产写入。

- Human 明确要求“继续做后端部署和真实支付验收”；小程序上传、提审与正式发布由 Human 自行执行，本轮禁止代操作。
- 文件归属（候选准备完成并释放）：Codex assessment_checkout_release_prepare 本轮仅修改本记录与 `docs/ASSESSMENT_CHECKOUT_DEPLOY_20261019.md`，并在 `.git/` 下生成候选索引/清单/归档。候选基线 `93afc1340a301269b13b94d2ccae7e49eaa8363b`，只选 `routes/payment.js`、`tests/assessmentPaymentCapability.test.js`、`.env.example` 和购买修复说明；现有未提交小程序、职位及其他业务改动均保留，不进入后端包。
- 高风险与门禁：资料收款开启不能同时打开会员/场景包；部署前先独立复核精确 tree，并以独立 DB/数据/上传目录在 Linux 运行 Release/Acceptance，禁止候选连接生产库或真实收费接口。真实支付需要用户亲自确认付款，合成回调不算真实验收；生产配置和切流另由 root 受控执行。
- 本阶段不提交/推送、不切流、不修改生产环境或支付开关；远程暂存写入须先报送路径及方案并获 root 确认。
- root 已批准新建独立远程暂存目录及 Linux 隔离门禁。Human 随后明确“直接开放全部用户购买资料，我自己支付9元验收”；不新增测试账号白名单，仍保持会员/场景包关闭，执行切流与开关待 root 完整门禁后交执行者。本轮回滚必须先关闭全局支付再回旧代码，防止旧代码忽略会员独立开关。
- 候选 tree `07c5583de9f79e205af7a8d2296ad4c1cd327d32`；LF归档SHA256 `71e639e9cae510ff6bc9a65dcc26d219b49d12eab909ed5f021ce23e5d5d60f0`。新Linux暂存目录 `assessment-checkout-preflight-20261019-07c5583de9f79e205af7a8d2296ad4c1cd327d32-lf` 测试前后2044 Git文件字节一致，无真实.env/根运行DB；独立隔离全量504/504（0失败/0跳过），AI7/7外部0，小程序197.1KB/主包1.05MB，数据0错误/5既有提示，Acceptance29通过/0失败/1既有提示/0跳过。fresh verification 独立SSH读取完整日志、逐项SHA和隔离路径后签核。隔离内部包含合成Mock情景，不是真实收费验收。
- 默认index保持空且字节SHA256 `919128801190c789fefb0acf278b0457357b5765c24fa41d420097b95915d483`；2074项原文件保护发现本人两份记录及其他线程并发首页/视觉四文件变化，仅记录未覆盖或回滚。候选仅四文件，不包含同期UI变化。此阶段未提交/推送、切流、修改生产env、开启支付或代发布小程序；远程证据目录 `/tmp/jobapp-assessment-checkout-check.kNnbVJ`，后续执行需 root 和fresh完整门禁通过。

### 2026-10-19 测评资料购买能力独立于会员 SKU（本地实现及独立专项完成，未部署收款）

- 文件归属（完成释放）：Codex assessment_checkout_implementation；仅 `routes/payment.js`、`tests/assessmentPaymentCapability.test.js`、`.env.example`、`docs/ASSESSMENT_RESOURCE_RELEASE_20261019.md` 与本记录。保留全部现有脏改动，不修改真实环境、运行数据库、生产配置或小程序 UI，不提交、推送、部署、上传、提审或发布。
- 高风险：资料真实虚拟支付不能被未配置的会员 SKU 误判为 Mock；资料配置缺失不能静默降级，不能因此打开会员销售或绕过全局 kill switch/真实支付审批。仅拆分内部能力判断与资料 provider 选择，不改微信支付参数和验签协议。
- 验证计划：隔离临时库覆盖全部会员 SKU 为空时资料真实 900 分下单与会员失败关闭、Mock 确认拒绝真实订单且订单/账本不变、签名回调/金额/SKU/数量/幂等校验、本人交付、停售/全局关闭后的历史领取及退款撤权；相关专项和独立全量发布门禁。所有测试不调用真实收费接口。
- 已实现：拆分基础 Provider 配置和资料真实渠道选择；资料真实 Provider 就绪后不会因会员缺 SKU 改走 Mock，缺本品 SKU/通知 Token 时也不降级。全局支付开关和真实支付审批仍有效，无协议改动。
- root 后续批准追加：生产现有会员 SKU 也非空，仅解除全局门禁可能同时打开会员；新增 `MEMBERSHIP_PAYMENT_ENABLED` 独立关闭会员/场景新销售，代码默认 true 保持兼容、示例推荐 false。关闭时服务端在任何写入前拒绝，配置接口反映关闭；资料与历史已付回调/领取不受该新开关影响。只修改示例，不修改真实环境；另增全 SKU 已配但会员开关关闭的隔离回归。
- 专项验证：`node --test tests/assessmentPaymentCapability.test.js tests/assessmentCommerce.test.js tests/sprint7Commerce.test.js` 45/45通过、0失败/0跳过；能力矩阵16场景、独立真实virtual合成闭环、会员销售关闭时七种套餐拒绝且订单/账本不变、默认兼容均通过。两份 JS 语法及五文件差异格式检查通过，仅既有换行提示。独立 full `check:release` 将由 fresh verification 执行，本条不预填结果；未触碰环境配置、运行/生产数据库、真实支付或小程序发布。实现范围完成，交由 root/fresh 审查，后续仅本记录待补独立结果。
- fresh 首轮反馈与本轮修复：完整套件父进程设置的可选会员 SKU 被能力测试子进程继承，导致“无会员 SKU”断言多出 trial；仅修测试 baseline 显式清空四个可选 SKU，并在“全部 SKU 已配/默认兼容”场景显式配置，未放宽断言或改运行逻辑。复跑专项45/45通过（0失败/0跳过）；既有 dirty `screens.json` 的 `maxGlobalShift=3` 与视觉测试期望2冲突仍保留不改，完整发布门禁尚未通过，需 fresh 再验证。本条为获 root 明确授权后的 fixture 修复记录。
- 最终独立结果：质量与反模式检查通过；fresh 在父进程注入四个可选 SKU 的污染条件下复验购买专项45/45通过（0失败/0跳过，3.44秒），AI7/7/外部请求0、小程序结构与包体积、数据检查均通过（数据0错误/5既有提示）。支付运行源码与首次冻结哈希一致，真实 `.env` 与主DB哈希始终未变。首轮全量527项/523通过/2失败/2跳过的证据保留；本轮购买fixture已修复并独立复验，但未重跑全量，既有视觉配置冲突仍在，不能声明完整发布门禁通过。仅交付本地代码，未部署、开启真实收款或代发布小程序。

### 2026-10-19 首页测评资料价格右上对齐（完成）

- 文件归属（完成释放）：Codex；仅调整 `miniprogram/pages/index/index.wxml`、`index.wxss` 的测评条目布局，补充 `tests/assessmentFrontend.test.js` 局部回归及本记录。保留其他已有改动，不修改数据、支付或其他首页模块，不上传、提审或发布。
- 布局：价格与标题置于同一行右侧，不压缩价格；长标题省略，摘要仍独立显示，保留原整行点击与无障碍标签。
- 验证：测评前端专项20/20通过；小程序结构与包体积检查通过；布局/最终机械扫描无发现，指定文件差异格式检查通过。仅源码与专项验证，未执行微信真机视觉或真实E2E验收，未提交推送或发布。

### 2026-10-19 测评资料小程序本地功能准备（精确验证完成，Human 自行发布）

- 文件归属（本阶段完成释放）：Codex mini_release_scope 维护本记录、新增 `docs/ASSESSMENT_MINIPROGRAM_RELEASE_20261019.md` 及 `.git/assessment-mini-release-20261019/` 私有候选/备份辅助材料；未修改其他功能或支付门禁。Human 最新明确只上线功能，小程序上传、提审、正式发布由自己操作，因此相关代发布及提交推送计划全部取消。
- 高风险与验证：上传只能来自唯一主项目根；共享文件逐 hunk 分离，保留 AI/简历/资讯/岗位等无关脏改动。根内受控覆盖前需记录全部受影响文件原始字节及 SHA-256，以排他锁和覆盖前哈希保护阻止并发写入；测试/上传后在 finally 恢复并逐字节核验，不创建外部可运行副本。精确 tree、独立门禁和微信阶段必须如实分别记录，不把上传等同审核通过或发布。
- 本地精确候选 tree `2a5d7c6d90fd6e5f5a9d9f66f724f5f050d2098a`（基线 `93afc134`、36文件测评最小闭包）通过独立质量审查和唯一主根内 `check:release`：525项、523通过、0失败、2项既有Windows跳过，AI7/7/外部请求0，小程序媒体197.1KB、主包估算1.06MB，数据0错误/5既有提示。该结果是本地精确候选验证，不表示小程序已上传或正式发布。
- 根内临时覆盖结束后1688项原文件SHA-256全部恢复，`.git/index`、`.env`、主DB字节不变，冲突0；保留898项差异原字节私有备份。D盘官方CLI仅查询登录、关闭当前项目以避免混入、恢复后按root授权重新打开同一项目；未preview、upload、提审、发布、提交推送、改变安全设置或开启收费。

### 2026-10-19 测评后台已部署、生产迁移及 5 份真实资料草稿已导入（收款与上架保持关闭）

- 本条为当前实际结果，优先于下方同日“准备中/未上线/待验收”等历史阶段记录；旧记录保留，不代表此次后端部署尚未完成。Codex assessment_backend_release_prepare 仅占用本状态与生产发布记录做本地收尾，不暂存、提交、推送，不再操作生产代码、数据库或其他功能。
- 已分开提交并推送：纯测试稳定性修复 `2d3931831db4e2462909bb34a7ad05e6da935888`；测评后端/管理后台 `93afc1340a301269b13b94d2ccae7e49eaa8363b`，精确树 `107448fc00abc6a25983eb106d23cae86aa05d79`。当前版本为 `/www/wwwroot/zhiyincareer-main/releases/assessment-20261019-107448fc00abc6a25983eb106d23cae86aa05d79-lf`，主进程 PID2199936；2044个Git文件字节与提交一致。旧6c候选及非规范换行候选为HOLD，不可部署，未重写迁移SQL。
- 精确 Linux 候选与标准部署均通过498/498测试、0失败/0跳过；AI7/7、外部请求0；Acceptance29通过/0失败/1条既有提示。独立只读验收、质量及反模式三项审查均通过；不能沿用更早 dirty 主工作区的530项结果替代这份精确版本证据。
- 实际顺序：在线完整备份→第一维护窗口仅迁移0012–0015（约6秒）→旧版恢复健康→标准部署新后台→第二维护窗口备份并导入（约4秒）→新版恢复健康。两窗口耗时不是全程对外中断测量，未声称总停机10秒。
- 生产 schema 共15项、pending=0、integrity=ok、外键错误0。京东、美团、百度、拼多多、小米5份均为草稿、900分、领取期限null、目录待审、对应SKU正确；复用4家原公司，仅新增拼多多公司77且公开不可见；共享四段文案与用户原文一致、版本1，只初始化一次。源表40行、跳过35空资料，生产只读重规划 unchanged5。
- 公网 readiness正常；管理后台静态资源200，未登录私有/管理接口401；测评公开商品0、五份商品详情404、拼多多公司404，原公开公司76家，首页关闭。`PAYMENT_ENABLED=false`；另两项审批标志未设置、按默认false，三项收费门禁实效关闭。未上架商品、未开启首页卡片、未上传/提审小程序、未真实付款。
- 历史财务六表校验保持：19笔订单、8项会员计划及四个空账本/退款/权益/告警表不变；原76家公司行内容完全不变。不可声称全85表不变：既有未修改的启动逻辑对15353条校招记录仅将空/null的`updated_at`补为`created_at`，健康探针亦会产生性能记录。
- 生产环境SHA256 `c7042d5596df290257ff947af7bd4ceda422c218fc12e95e636b7326a825eb8a`、Nginx SHA256 `b5dbf762f721770fde5d374ae496d2a983a83c6fdf00c6a4dea3242c24b7cfdc` 前后不变。五份验证备份、私有源权限及校验详情见 `docs/ASSESSMENT_PRODUCTION_RELEASE_20261019.md`。操作方确认只明确控制`jobapp-server`及既有部署脚本生成的候选，未修改cron、未操作其他具名应用或全局停止/重启/删除；常规`pm2 save`会保存全局当时观察到的状态，不保证其他项目不变，不把同期其他PM2变化归因于本发布或擅自恢复其他进程。
- 工作区保护：提交前后2064项文件哈希核验，其他小程序/AI/资讯/职位等 dirty 改动保留，未混入后端发布。草稿导入后回滚代码必须保留公司草稿过滤；恢复写入后不得用旧DB备份覆盖运行库。本条收尾文档仅本地更新，未加入已部署不可变版本。

### 2026-10-19 测评导入新增公司草稿的公开可见性修复（代码及专项完成，待独立候选验收）

- 文件归属（本修复完成并释放）：Codex assessment_import_company_privacy；`services/companyService.js`、`routes/companies.js`、`routes/v4/jobs.js` 的公司查询一行、新增 `tests/assessmentCompanyVisibility.test.js`、导入说明与本记录。测试总入口由发布准备负责人后续登记。
- 范围：只隐藏来源严格为 `assessment-feishu-import` 且状态不是 `published` 的新公司（含草稿、归档、空状态），公共公司列表/详情及用户职位详情不能读到，管理员仍可读取和编辑；不改变既有其他来源草稿或已发布公司的行为。保存或归档该导入公司时保留来源标记，明确 `data_status=published` 才解除草稿边界。
- 风险与验证：只读查询过滤及对应保存来源保护，不改 schema、认证或支付。所有回归使用系统临时隔离库，验证匿名查询不可绕过、后台可见、旧来源不受影响、普通编辑不发布、明确发布恢复可见及已有公司不触发种子导入。本 agent 不操作 SSH、运行库、生产迁移、提交或部署。
- 已完成：可见性参数采用服务端内部第二参数，不受 `req.query` 控制；公共公司列表的行数/分页和详情都在 SQL 阶段过滤，用户职位详情也强制该边界；后台默认全量读取不改。保存/归档时保留来源，显式发布后按既有规则转管理员来源。
- 专项验证：`node --test tests/assessmentCompanyVisibility.test.js tests/assessmentImport.test.js` 21/21通过（新增7、导入14），0失败/0跳过，8.41秒；4个JS语法检查及指定文件 `git diff --check` 通过。`.env` 与主DB SHA-256仍分别为 `75C448B454013134AB3385CD3B508D07B03227B8A3F0C3CB7B315AE4CB08EBBB`、`7772A4CAE8C5D43DB399E9F5FBE2E559D37201382819F678F83EB0D6933D0376`。未运行完整门禁；发布候选需纳入本修复后再独立验证，不能沿用修复前的530项结果。

### 2026-10-19 测评后台生产发布准备（已获备份核验、迁移、部署及 5 份草稿导入授权，执行前审查中）

- 当前占用：Codex assessment_backend_release_prepare 负责本条记录、`docs/ASSESSMENT_PRODUCTION_RELEASE_20261019.md`、发布范围说明及 `tests/all.test.js` 的第五个后端测评专项注册；独立 Git index 选择后端/管理后台闭包，保留其他 dirty 改动和默认 index，不提交推送。
- 授权边界：Human 已明确允许“备份核验后，升级生产数据库、部署测评后台，并导入这 5 份资料草稿”。支付开关、商品上架、首页主推及小程序上传/提审不在本次执行范围。
- 高风险与验证：生产数据库必须先停止写入、生成一致性备份并验证完整性/外键/版本，再应用0012–0015；导入另有独立备份与事务、同源幂等门禁。先审查独立 index 的精确后端树，再对同一不可变版本进行 Linux 预发布隔离验证，才能变更生产。共享支付/账号删除/退款改动须专项验证，环境支付开关前后保持关闭。
- 本条只登记占用与已获授权；尚未因此执行生产变更。旧批次中的“未获批准”描述属于当时的历史状态，不撤销本条明确新授权。
- 预发布调整：旧精确 Linux 候选490项489通过、1失败为日期抽样既有预期9次/实际8次；root 已明确另行批准两份纯测试 fixture 稳定性修复，单独准备测试修复树 T，再以相同两 blob 纳入最终 F，计划分为测试修复、测评两提交。新增测评导入公司草稿隐私闭包三份源码及7项测试也须纳入最终 F，旧530项 dirty 主工作区门禁不能替代 F 的新 Linux 验收。本条不预填尚未执行的最终成功结果。

### 2026-10-19 飞书真实测评资料与线上道具绑定准备（开发、独立审查及隔离验收完成，未上线）

- 文件归属（本批已完成并释放）：Codex assessment_real_import 负责新增 `services/assessmentImport.js`、`scripts/import_assessment_resources.js`、0015 migration、导入专项 tests、`tests/databaseMigrations.test.js`、`tests/all.test.js` 注册、公开 SKU profile、导入说明及本记录；assessment_payment_capability 负责 `routes/payment.js`、`routes/assessment.js`、`services/assessmentCommerce.js` 和新支付能力专项；assessment_candidate_scope 只新增 `docs/ASSESSMENT_RELEASE_SCOPE_20261019.md`；assessment_import_verify 只读执行主root最终门禁和独立审查。其他已有 dirty 改动保留，未修改线上开关。
- 支付风险控制：仅注入与实际下单一致的真实支付能力谓词；环境关闭/配置不完整时购买失败关闭，公开响应无密钥，既有会员/支付协议不变。SKU已发布不替代商户/会员SKU配置及真实回调验收，也不能当作开启全局收款门禁的批准。
- 发布隔离纠正：外部scratch的开发/测试已停止，不能作为发布源或最终验收依据。最终fresh门禁与导入演练均从唯一主root执行，系统临时目录只允许承载隔离测试数据。共享文件需逐hunk提取、无关功能排除，范围以 `docs/ASSESSMENT_RELEASE_SCOPE_20261019.md` 为准。
- 来源：用户飞书40行完整快照，5家公司有网盘资料；用户确认微信对应9元道具已发布线上，尚未独立核实平台。私有原文仅系统临时文件，禁止进入Git或公开投影。
- 高风险与验证：显式目标/环境、只读 dry-run、生产额外确认、在线备份与完整性校验后事务导入；稳定 Feishu record_id 唯一绑定，不覆盖手工商品；空链接跳过，多个或非HTTPS网盘地址拒绝；统一说明仅一次配置，商品默认草稿、未知目录标记待审、无虚构领取期限，不开启首页或支付。隔离临时库覆盖幂等、恶意输入、回滚、备份门禁、会员/历史订单保持；本agent不提交、发布、迁移运行库或开启收款。
- 已完成：新增0015独立私有来源绑定、纯注入DB导入服务、强门禁CLI及公开5SKU/profile；默认只读，apply先新建仓库外备份并验证，再事务重规划导入。只初始化显式提供且未配置的统一说明；同源幂等，冲突不覆盖手工，已上架来源变更拒绝。全部新商品草稿、9元、claimDays=null、contentNeedsReview=true，无私链公开投影，不选首页。
- 隔离验证：真实飞书40行快照在系统临时主库副本完成0012–0015迁移、dry-run、备份后导入5草稿/跳过35、重跑unchanged5；4家公司复用、拼多多仅最小草稿公司，完整性ok、外键0错误，主DB前后SHA-256一致。私密副本/备份仅系统临时目录，未入Git；使用说明见 `docs/ASSESSMENT_IMPORT_20261019.md`。本批未触碰运行/生产库，未提交推送、发布或开启收款。
- 实现专项最终：`node --test tests/assessmentImport.test.js tests/databaseMigrations.test.js` 28/28通过（导入14、迁移14），12.7秒；服务/CLI `node --check`、指定差异格式检查通过。`.env` SHA256仍为 `75C448B454013134AB3385CD3B508D07B03227B8A3F0C3CB7B315AE4CB08EBBB`、主DB仍为 `7772A4CAE8C5D43DB399E9F5FBE2E559D37201382819F678F83EB0D6933D0376`，与既有基线一致。
- 并行支付专项：assessment_payment_capability 报告 capability+commerce+admin 43/43通过；公开购买能力受原有环境/配置门禁约束，未改支付开关；新增专项已注册。
- 最终fresh主root门禁：`npm run check:release` 退出0，530项/528通过/0失败/2既有Windows跳过，65.34秒；AI7/7、外部请求0，小程序媒体197.1KB/主包估算1.10MB，数据0错误/5既有提示。`npm run check:acceptance -- --no-report` 29通过/0失败/1既有job-detail提示/0跳过；导入+迁移+支付能力独立专项41/41，0失败/0跳过，9.10秒。fresh反模式审查与质量审查均无发现，JS语法与`git diff --check`通过（仅既有LF/CRLF提示）。
- 证据范围与上线边界：上述门禁对应**包含其他未提交工作的整个主root工作区**，不是独立测评提交/隔离发布候选的验证结果；不能据此发布无关dirty改动。生产迁移、真实资料导入、人工内容/版权和链接核验、上架及首页选择、全局收费开关、真机支付与小程序发布均未执行；未把用户确认道具线上发布当作明确生产目标的独立迁移/导入或全局收费审批。
- 最终保护核验：fresh验证前后`.env`及主DB哈希与上列基线完全一致；本批无运行/生产库写入、提交、推送、部署、微信上传/提审或真实付款。

### 2026-10-19 道具批量上传图片修正（完成，用户已确认录入并发布线上）

- 当前占用：Codex；会话 outputs 下批量上传工作簿、5 张新制 200×200 PNG，以及获用户明确授权的服务器独立公开图片目录与对应 Nginx 图片路径规则；不改业务源码、数据库或支付开关，不替用户提交微信道具。
- 原因：微信实际上传要求确认图片必填；上一版空图片不合规。保留 5 个道具 ID、名称及 9 元价格，只补真实图片链接。
- 风险与验证：图片限定无私密内容的五张商品封面，均小于 200KB；独立路径仅允许微信来源 CORS，不放宽 API 或全站权限。修改前备份并比对 Nginx 配置指纹，验证配置后平滑加载，失败恢复；核验 PNG 尺寸/类型/体积、HTTPS GET/HEAD/CORS、原 API 和官网健康，再回读与渲染修正版工作簿。
- 已完成：5 张 PNG 已放入 `/var/lib/jobapp-server/uploads/assessment-products/20261019-094a/`；仅对应公开路径设置 `Access-Control-Allow-Origin: https://mp.weixin.qq.com`，允许 GET/HEAD/OPTIONS，无凭据跨域。图片均 200×200、9540–10280 字节，HTTPS GET/HEAD=200、OPTIONS=204、PNG 内容与本地哈希一致。原 API readiness=true、官网响应200、支付 enabled/available=false 未改变。
- 配置备份：`/www/server/panel/vhost/nginx/jobapp.conf.before-assessment-images-20261019-094a`，原 SHA256 `6e86d6cc45540791446235e98c5b71facb9db619a08f3f7782060946cbad5a58`；新配置 `b5dbf762f721770fde5d374ae496d2a983a83c6fdf00c6a4dea3242c24b7cfdc`。`nginx -t` 修改前后通过，平滑 reload 成功；未改业务代码、环境配置、运行数据库或支付门禁。
- 文件：会话 `outputs/assessment-batch-20261019-094a/` 已生成含真实图片链接的修正版 XLSX，保留原五列、5 个 ID 与每项数字价格9元；回读和渲染核查通过。未代用户上传、创建或发布微信道具；用户随后确认录入成功并已发布线上，本批未独立读取微信平台道具列表核验。图片托管或道具发布完成都不代表小程序商品已上架、收款已开启或真机支付已验收。

### 2026-10-19 测评资料统一说明（代码完成，未上线）

- 当前占用：Codex assessment_shared_instructions；`services/assessmentCommerce.js`、`routes/admin-assessment.js`、`utils/adminPermissions.js`（仅新接口映射）、0014 migration、后台测评商品HTML/JS/CSS、小程序测评详情JS、对应tests及共享说明文档。
- 范围：使用/领取/更新/售后四段说明全商品共享一次配置；真实文案待用户提供，初始留空；单品来源及领取天数保持原规则，统一9元与真实支付门禁不变。
- 风险与验证：迁移只创建空单例，未配置禁止新上架/新订单，未迁移结构化降级；共享版本校验与取消待付防止旧条款付款；已付快照/旧单领取不变。测试仅临时隔离数据库；本agent不执行运行/生产库迁移、部署、上传或提交推送。
- 已完成：后台新增一次配置四段文案的“统一说明”页签，单品表单不再重复填写；公开详情继承共享版本，新订单校验用户确认时的版本并存快照，设置变更关闭资料待付；已付快照与领取不变。0014 初始空，不自动播种业务承诺；用户确认文案（含温馨提示）另存 `docs/assessment-shared-instructions-20261019.json` 供显式运营配置，设计说明见 `docs/ASSESSMENT_SHARED_INSTRUCTIONS_20261019.md`。
- 验证：专项最终 59/59（资料服务21、后台6、前端19、迁移13），覆盖共享权限、无配置/未迁移、版本冲突、旧快照、迟到款及确认弹窗刷新竞争。`npm test` 497 项/495通过/0失败/2既有Windows跳过，耗时64.5秒；该全量在新增最后两项前端竞争测试前启动，最终前端19/19另行通过。4个JS语法检查及 `git diff --check` 通过。未发布、未启用支付、未操作运行数据库。
- 独立审查收尾：统一说明GET增加请求世代、切页失效和编辑版本保护，PUT保存期间锁定切页/重新加载，防止迟到GET覆盖新编辑或新保存；新增2项并发回归。服务端补精确私有网盘地址及去`pwd`后的分享地址在公开文案/封面/示例图的误放检查，新增1项回归；后台8/8、服务22/22通过。PRD更新V1.3，发布字段映射改为共享四说明一次配置；飞书40行/5家资料链接已读取但尚未导入/发布。
- 最终独立门禁：fresh `check:release` 退出0，502项/500通过/0失败/2既有Windows跳过，48.65秒；AI7/7、外部请求0，小程序媒体197.1KB/主包估算1.10MB，数据0错误/5既有提示，迁移13/13；Acceptance29通过/0失败/1既有job-detail提示；4个JS语法及`git diff --check`通过。质量复核2项竞态2/2解决，私链误放已有回归；`.env`及主数据库前后SHA-256与基线不变。用户四段正式文案已提供并存JSON，无需再索取；5家真实源已读未导入，当前提供支付ID配置指引并等待真实SKU，不发布、不改支付门禁。

### 2026-10-19 测评资料正式版与统一 9 元（代码完成，未上线）

- 当前占用：Codex assessment_nine_yuan_release；assessment 商品/订单服务、0013 迁移、后台商品定价、小程序正式接口/预览开关、相关测试与发布文档。
- 范围：测评资料单价统一 900 分，保留历史支付快照与账本；开发工具默认关闭示例，真实商品由后续飞书多维表格内容通过后台录入。
- 生效顺序：本条正式版默认关闭自动示例的规则覆盖下方较早的“开发工具只读预览”历史记录；只有模拟器显式设置 `assessmentPreviewMode=readonly-examples` 才启用只读样例，体验版/正式版/真机不启用。
- 风险与验证：价格迁移关闭旧金额待付订单，迟到款进入人工核对而非交付；隔离数据库覆盖迁移重复执行、历史保留、9 元下单、金额篡改、支付回调和退款。正式版与真实接口联调，不造公司或网盘，不执行生产迁移/发布/收款开通。
- 已完成：商品服务强制 900 分，后台只读 9 元；0013 将商品统一改价并仅关闭旧金额资料待付，历史已付/退款、快照、账本与会员价格不改；旧商品未迁移也无法新下单。默认关闭开发工具自动示例，真实商品为空时资源入口可进入准备中列表；首页待真实配置后展示主推三家。
- 验证：资料服务 18/18、前端 17/17、后台 5/5、预览隔离 8/8、迁移 12/12、会员商业 4/4，共 64/64 专项通过。只运行隔离测试，不触碰主库；真实支付、微信编译/真机、生产部署均未执行。发布准备与后续飞书字段见 `docs/ASSESSMENT_RESOURCE_RELEASE_20261019.md`。
- 最终独立门禁：`check:release` 退出码 0（63.1 秒），492 项/490 通过/0 失败/2 项 Windows 跳过；跳过项依赖 Linux shell，分别为生产备份缺库退出和切流健康/启动/TERM 回滚。AI 7/7、外部请求 0；小程序媒体 197.1 KB、主包估算 1.10 MB；数据 0 错误/5 既有提示；迁移 12/12；Acceptance `--no-report` 29 通过/0 失败/1 既有 job-detail 提示/0 跳过；差异格式检查退出码 0。质量及源码反模式审查无阻断。
- 测试稳定性修复：固定岗位源测试的日期采样，并覆盖 JP 请求重叠缓存场景；只修改测试 fixture，不改生产岗位源逻辑。
- 运行环境保护：`.env` SHA-256 `75C448B454013134AB3385CD3B508D07B03227B8A3F0C3CB7B315AE4CB08EBBB`、主数据库 SHA-256 `7772A4CAE8C5D43DB399E9F5FBE2E559D37201382819F678F83EB0D6933D0376` 前后不变。真实物料待用户提供；本轮未提交推送、发布、上传、生产迁移、微信开发者工具编译/真机或真实付款。

### 2026-10-19 测评资料开发工具只读预览（代码完成，待界面重新编译）

- 当前占用：Codex assessment_devtools_visibility；`miniprogram/utils/assessment-preview.js`、`app-config.js`、`api-assessment-resources.js`，首页及测评列表/详情的 JS/WXML，`tests/assessmentPreview.test.js`、`tests/all.test.js` 与本记录。
- 原因：小程序默认访问生产 API，测评资料公开首页和列表接口目前返回 404；首页空列表会隐藏模块。
- 范围：仅 develop + devtools 可使用有明确标记的本地示例资料，真实非空商品优先；示例禁止鉴权查询、下单和支付，不写数据库、不部署。
- 风险与验证：仅在支付入口增加示例拒绝保护，不改真实支付协议；专项验证环境隔离、真实数据优先、无订单/支付/埋点副作用以及既有前端和登录门禁回归。
- 已完成：开发工具空配置/接口缺失时展示示例公司 A/B/C 的 3 份资料；首页、列表、详情标记“开发预览·示例资料，暂不可购买”，价格标为示例价。真实非空数据优先，真机/体验版/正式版不启用示例；真实公司筛选不混入示例公司；私有订单/领取接口不降级。示例详情跳过购买查询，拒绝登录、下单及支付操作。
- 验证：测评前端 17/17 与新增预览 8/8 通过；首页视觉/校招/导航/登录专项共 61/61 通过；`check:miniprogram` 通过（媒体 197.1 KB，主包估算 1.10 MB）；`git diff --check` 通过。测试运行数据库仅在隔离临时目录。
- 联调事实：生产 `/api/v4/assessment-products/home` 与 `/api/v4/assessment-products` 当前仍返回 404，本轮未发布后端、未迁移生产数据库、未配置真实商品或真实收款；界面需在唯一 `miniprogram/` 项目重新编译确认。

### 2026-10-14 上线 P0/P1 修复与待验收项

- [x] 修复生产 HTTPS Nginx 的 `/api/` 路由，保留官网转发；公开 `/api/health/ready`、`/api/features`、`/api/campus` 返回 JSON 200，空参数登录请求返回预期 JSON 400。原配置已在服务器同目录备份，`nginx -t` 及 reload 成功。
- [x] 生产 `.env` 使用现有服务端校验器只读验证通过（未读取或展示密钥值）；AI 可用，ASR、短信和微信订阅模板仍未配置，应保持相关能力降级。
- [x] 发布脚本改为隔离快照预检、只读生产迁移状态门禁、候选/正式 PM2 进程身份验证与失败回滚；备份必须验证 SQLite、运行环境及 Nginx 配置，失败不生成成功标记；CI 执行发布门禁及 Acceptance。
- [x] 当前小程序首页/AI/导航的 P1 文案、触控目标、可访问语义、辅助文字对比度、缓存时效及会员失败关闭已修复；业务路由保持不变。
- [x] 本地最终 `check:release`：360 通过、1 个仅限 Linux 的测试跳过；Acceptance 30/30；差异无空白错误。
- [ ] 微信开发者工具自动化已确认 390×844 视口并导航到资源页，但截图调用在 30 秒及 60 秒两次超时，未取得可比对新图；真机登录验收也仍待完成。扩充后的首页内容与旧基准图冲突，不能将旧图的差异报告当作新方案通过。
- [x] 生产数据库已独立备份并完成 `0001–0011` 正式迁移；合并招聘版的后端提交 `e8194d7` 于 2026-10-14 通过 [Deploy Backend 工作流 38518198158](https://github.com/476708310zhao-svg/CareerAI-backend/actions/runs/38518198158) 上线。线上数据库完整性、招聘开关、岗位列表/地图/详情及公网 readiness 已验收；微信小程序体验版/提审不在本次发布范围。

### 2026-10-14 第三方职位源限流与全球国家选择（代码完成，未上线）

- 当前占用：Codex 在隔离工作树 `jobapp-server-merged-release-20261014` 的 `codex/job-sources-global-coverage-20261014` 分支修改 `routes/jobs.js`、`services/jobSourceGateway.js`、`utils/jobGeography.js`、职位专项测试、`.env.example`、`README.md`、`docs/JOB_CAMPUS_DATA_PROVENANCE_CONTRACT.md` 与本记录；主工作区原有招聘改动保持不动。
- 目标：为 JSearch、Adzuna、The Muse、RemoteOK 加入同键缓存/并发合并、上游 429/403 冷却和有界地图请求；明确国家搜索不再暗中回到美国。全球列表保留真实跨地区远程职位，地图按国家抽样并透明披露覆盖范围。
- [x] JSearch、Adzuna、The Muse、RemoteOK 及可选来源的进程内缓存、同键合并、请求间隔与 429/403 冷却；JSearch 默认每日 6 次上游调用的进程内保护。全球 Web 列表/地图/小程序聚合列表每日抽样两个国家并返回覆盖元数据；明确国家不混入其他市场岗位。小程序筛选增加更多常用国家及两位代码输入。
- [x] mock 验证上游限流、超时和跨国隔离；`check:release` 380 通过、2 项 Windows 环境性跳过，AI 质量检查通过，小程序静态检查通过，数据检查 0 错误/5 项既有提示；`check:acceptance -- --no-report` 29 通过、1 项既有职位详情提示、0 失败。
- [ ] 仍需真实供应商配额/密钥验收；线上后端未切流，微信小程序体验版/提审未执行。进程内预算重启会重置，若未来改为多实例需升级成共享配额存储。抽样不是全球完整职位库。

### 2026-10-10 已确认浅色原型正式落地（已完成）

- Codex 当前占用：`design-system/zhiyin-career/MASTER.md`、`miniprogram/app.wxss`、`miniprogram/custom-tab-bar/*`、五个一级页面、`miniprogram/components/c-job-card/*`、`miniprogram/package-ai/pages/ai-assistant/*`、`miniprogram/pages/profile/profile.js`、`miniprogram/pages/jobs/jobs.js` 与相关视觉/导航测试。
- 目标：严格按照 Human 已确认的六张蓝白浅色原型落地，移除大面积深色色块、英文装饰标题和遮挡 Tab 的 AI 入口；不改接口、登录、状态机或数据库。
- 状态：五个一级页面、悬浮 TabBar 与上下文 AI 已按确认原型完成正式代码落地；340/340 全量测试、30/30 Acceptance、AI 质量、数据内容、小程序静态与包体检查通过，主数据库 SHA-256 保持 `B221AD658D1B24AECAB2F8C1E43F2749C44F979EF703DE35D92283A491C69D4B`。微信开发者工具内视觉编译仍待 Human 点击执行。

### 2026-10-10 五 Tab 与上下文 AI 信息架构重构（已完成）

- Codex 当前占用：`miniprogram/app.wxss`、`miniprogram/custom-tab-bar/*`、`miniprogram/pages/index/*`、`pages/jobs/*`、`pages/applications/*`、`pages/resources/*`、`pages/profile/*`、`miniprogram/package-ai/pages/ai-assistant/*`、相关视觉/导航回归测试与 `design-system/zhiyin-career/`。
- 目标：保留已交付业务逻辑和数据隔离，重构为统一的高级、简洁、直接的移动端工作台。
- 状态：五个一级页面、悬浮 TabBar 与上下文 AI 已完成结构和视觉重构，提交 `0516208`；340/340 全量测试、30/30 Acceptance、AI 质量、数据内容、小程序静态与包体检查通过，主数据库指纹未变化。微信开发者工具服务端口关闭，CLI 无法代替界面执行编译，保留一次开发者工具内人工视觉验收。

### 2026-10-10 功能简化与 AI 编排 checkpoint 交付候选

- Integration 0 已建立工作区拆分、数据库保护和原子提交边界。
- Checkpoint 1–9 已形成独立提交，Checkpoint 10 开始前的已提交运行代码基线为 `2fad29d14013dc813f11f5e5738c0095091e7c15`；Checkpoint 10 文档候选的自动化门禁已通过，本记录随本次文档提交生效，提交哈希以 Git 历史为准。
- 当前小程序一级导航固定为：首页、找岗位、进度、资源中心、我的。首页聚焦单一主行动；资源中心承担内容资产，“我的”承担个人资产，不再展示旧四 Agent 选择器或旧简历主入口。
- 申请工作台、持久上下文 AI、移动申请、简历版本、申请材料和面试空间已按账号/申请隔离；AI 写入和跨对象影响保持预览、确认及幂等保护。
- 2026-10-10 11:39（Asia/Shanghai）候选 tree `abdaccf0cdecccda635440546d039e48f88916c9` 完成自动化门禁；该值是文档候选的 Git tree 证据，不是 branch commit。`npm test` 318/318、`check:acceptance` 30/30、`check:miniprogram` 通过（媒体 192.3 KB，主包 0.99 MB）；`check:e2e-3.0` 4/4 仅为 dry-run 预检。Migration `0001–0011`连续性、五 Tab、6 个 feature 默认值、Checkpoint 9 组件清理、材料工具路径与其他静态一致性检查通过；主数据库指纹未变，未执行 migration apply。
- 未完成/未授权：微信开发者工具完整主链路、真机 E2E、真实支付与测评资料商业化、生产部署、远端同步。
- 功能开关以代码和环境显式配置为准；`utils/featureFlags.js` 的所有已登记开关代码默认值均为 `false`。
- 工作区中的业务预制 diff、设计审计、截图/日志、零引用资源图、API 巡检和未完成依赖不属于已交付 checkpoint，详见 `docs/FINAL_DELIVERY_RECORD_20261010.md`。

### 2026-10-10 小程序质量与登录 404 修复

- [x] 移除职位页已经没有渲染使用的 `empty-state` 注册及四个组件文件，解决微信开发者工具“无使用或无依赖文件”告警。
- [x] 确认本地服务端挂载 `/api/users/login` 和 `/api/users/phone-login`，前端路径与代码契约一致。
- [x] 复现生产 `https://api.zhiyincareer.com/api/health` 与登录接口均被 Next.js 官网接管并返回 HTML 404，确认为线上 Nginx/API 路由冲突，不是微信 `code` 失效。
- [x] 小程序将误路由的 HTML 404 转换为“登录服务暂不可用”，不再直接展示 `HTTP 404`。
- [x] 仓库 `nginx.conf` 增加 `location ^~ /api/` 优先代理到 `127.0.0.1:4400`，避免同机官网路由抢占 API。
- [x] 专项 19/19、全量 338/338、Acceptance 30/30、AI 质量 7/7、`check:miniprogram` 与数据内容检查通过；主数据库 SHA-256 仍为 `B221AD658D1B24AECAB2F8C1E43F2749C44F979EF703DE35D92283A491C69D4B`。
- [x] 2026-10-14 已在服务器修复并重载活动 Nginx 站点配置，公开 `/api/health/ready` 恢复 JSON 200；真实微信授权登录仍需开发者工具/真机确认。
- [ ] 微信开发者工具重新扫描、登录真机验收、五个一级页面的产品结构视觉验收待 Human 执行。

事实层级固定为：已提交的运行代码/schema 与最终门禁输出是事实依据；`docs/FINAL_DELIVERY_RECORD_20261010.md` 是交付摘要；正式 PRD 表达产品意图；Integration manifest 记录 checkpoint 拆分历史。以下内容是历史快照，只用于追溯，不能覆盖上述事实依据。

2026-09-23 正式 API HTTPS 证书故障已恢复：`api.zhiyincareer.com` 的 Let's Encrypt 证书于 2026-09-20 17:23（北京时间）过期，导致微信开发者工具报 `ERR_CERT_DATE_INVALID`，请求未进入应用。已续签并由宝塔 Nginx 重新加载，新证书有效至 2026-12-22 07:56（北京时间）。生产 `/api/health`、`/api/health/ready` 均为 200，未登录访问 `/api/v4/applications/board` 返回预期 401，证明 TLS 与路由正常。服务器原来缺少 certbot timer/cron，现已安装 `/etc/cron.d/certbot-jobapp` 每日两次自动续期，`crond` active；Let's Encrypt staging 模拟续期及 Nginx reload hook 全部成功。未修改小程序代码或业务数据。

2026-09-20 Web P0：补齐 AI 会话恢复/历史/取消/切换隔离，小程序一次性电脑登录码、Web 手动新增申请、PDF 导入与在线简历版本编辑、任务新增/编辑/完成、面试日期及联系人，资源入口接真实工作区。Web 4/4（隔离 API 17/17），原工作台与 P0 Edge 浏览器验收通过；全量临时数据库发布检查 250/250、AI 7/7、小程序检查和数据检查错误 0。此前后台登录 401/429 在隔离数据中未复现。尚未真机双端验收、真实模型联调或生产部署；移动端 AI 历史迁移仍属 P1。


2026-09-20 “我的”按用户要求去重：移除资源中心已有的简历、JD、申请材料、模拟面试、每日简报、错题本、使用指南等入口及求职资产区；会员仅保留顶部入口，收藏和消息各保留一次，我的面经保留个人发布管理。账号服务收敛为反馈、关于、设置三行，删除失去用途的资产统计与远端加载。相关测试 45/45、`check:miniprogram`、定向 `git diff --check` 通过；浏览器静态排版覆盖四种屏宽与未登录/普通/会员状态，无横向溢出，尚未微信真机验收或发布。

2026-09-20 资源中心压缩为分类切换布局：四个求职阶段与“更多工具”一次展示一组，最多 6 个双列工具卡；AI 专家和专项咨询保持顶部，内容与服务改为一行四个入口。所有原有工具及带参数路由保留，切换后返回页面保留当前分类。专项测试 45/45、`check:miniprogram` 通过；使用真实页面数据和 WXSS 的浏览器静态排版检查覆盖 320/375/390/430 宽度与全部 5 个分类，约 1～1.22 屏，无横向溢出或标题裁切。静态预览不替代微信真机验收；未部署。

2026-09-18 按用户提供的旧版截图恢复“我的”页结构：保留求职资产卡、8 个求职工具（收藏、简历、模拟面试、每日简报、材料库、错题本、笔经面经等）和 5 个其他服务入口（反馈、指南、关于、会员权益、设置）。保留当前申请管线 Tab 路由修正和资源中心 Tab，不恢复独立 AI 专家 Tab。新增旧版模块回归断言，定向测试 44/44、`check:miniprogram` 通过，未进行真机验收。

2026-09-18 资源中心视觉层级优化：四个求职阶段使用更清晰的分段导航；每个主阶段的第一项作为主操作横跨整行；增加阶段提示语和更大的可点击卡片；低频“职业决策”改为“更多工具”，避免与主流程竞争；AI 专家入口保持在顶部。定向测试 43/43、`check:miniprogram` 通过，未进行微信真机验收。

2026-09-16 资源中心恢复为第 4 个 Tab，导航顺序为：首页、找岗位、进度、资源中心、我的。资源中心按“明确方向、准备简历、匹配投递、面试准备”四个流程组织工具，顶部提供 AI 专家统一入口；校招日历、AI 网申助手、JD 匹配、简历优化、模拟面试、面试复盘等均保留直接入口。首页恢复岗位、校招、AI 面试三个 Banner 轮播，后台数量不足时自动补齐。新增资源中心路由、工具去重和注册页测试；全量 237/237、`check:miniprogram` 通过，未部署、未进行微信真机验收。

2026-09-16 小程序申请详情可靠性收尾：增加加载失败重试；刷新保留未保存跟进草稿；仅 PATCH 修改字段，避免回写旧日期/长备注；保存防重、失败保留内容、保存期间继续编辑不丢失；可清除日期；状态更新携带服务端版本，冲突刷新并保留草稿；异步请求期间账号变化清空旧数据。“更新下一步”使用卡片选择器定位。新增 5 项行为测试，全量 234/234、`check:release` 通过；申请详情和面试空间标签嵌套检查通过，未做微信真机验收。

2026-09-15 职引 5.0 P0 首页与申请详情继续收敛：首页移除会员权益横幅，运营 Banner 仅保留岗位/校招相关内容，按用户反馈撤回重复新增的“今日待办”列表，保留原有“今日求职计划”卡；申请详情将下一步行动、截止日期、面试日期和短备注压缩为“下一步跟进”轻量卡片。专项 45/45、全量 229/229、`check:release` 通过，未运行真实微信 E2E。

2026-09-15 UI/UX 第二阶段已完成：申请详情按上下文提供单一“建议下一步”主操作；AI 面试报告可将复盘加入当前申请任务，并将相册导出明确命名为“保存图片”。已补充静态回归断言，未运行真实微信 E2E，未提交或部署。

Sprint 8“提醒可靠性、跨设备一致性与收藏请求统一”已完成代码和自动化验证。提醒使用唯一投递键、租约、失败重试、有界并发和结构化耗时；Today 改为跨设备增量合并并拒绝旧状态覆盖；收藏增加幂等 outbox、删除 tombstone，并统一进入小程序请求层。竞争力陪跑已补充响应完整性校验；收藏同步已兼容 iOS 对 SQLite 空格日期格式的限制。真实双设备/微信订阅消息 staging、生产 migration 和上线仍待 Human；未运行真实 E2E、未调用真实 AI、未部署。

## 已完成

| 日期 | 事项 | 文件 | 验证 |
|---|---|---|---|
| 2026-09-14 | 第四批功能收敛：将 AI 求职规划、竞争力陪跑和每日简报明确为同一计划的生成、诊断和执行视图，增加互相带上下文的入口说明，避免用户维护多套计划 | `miniprogram/package-career/pages/career-planner/career-planner.js`、`career-planner.wxml`、`career-planner.wxss`、`miniprogram/package-career/pages/career-coach/career-coach.js`、`career-coach.wxml`、`career-coach.wxss`、`tests/navigationConfig.test.js` | 全量 207/207、`check:miniprogram`、`git diff --check` 通过 |
| 2026-09-14 | 第三批功能收敛：申请详情新增 JD 匹配入口；匹配前自动写入当前岗位快照，用户可从申请上下文重新匹配，补齐岗位、简历、匹配和材料的申请包闭环 | `miniprogram/package-user/pages/application-detail/application-detail.js`、`application-detail.wxml`、`application-detail.wxss`、`tests/navigationConfig.test.js` | 全量 206/206、`check:miniprogram`、`git diff --check` 通过 |
| 2026-09-14 | 第二批功能收敛：申请详情新增“申请包”区域，提供关联简历与申请材料的上下文入口；申请材料页支持携带 `applicationId` 打开并自动选中对应申请，避免用户重新寻找岗位和申请记录 | `miniprogram/package-user/pages/application-detail/application-detail.js`、`application-detail.wxml`、`application-detail.wxss`、`miniprogram/package-ai/pages/application-materials/application-materials.js`、`application-materials.wxml`、`application-materials.wxss`、`tests/navigationConfig.test.js` | 全量 206/206、`check:miniprogram`、`git diff --check` 通过 |
| 2026-09-14 | 第一批功能收敛：将首页、个人中心、每日任务和使用指南中的旧“投递追踪/求职进度”入口统一指向主 Tab“申请管线”；旧页面默认兼容跳回主 Tab，仅本地记录详情保留兼容参数，暂不删除业务能力 | `miniprogram/pages/index/index.js`、`miniprogram/pages/profile/profile.js`、`miniprogram/utils/daily-tasks.js`、`miniprogram/package-user/pages/usage-guide/usage-guide.js`、`miniprogram/pages/applications/applications.js`、`miniprogram/package-user/pages/job-progress/job-progress.js`、`tests/navigationConfig.test.js` | 全量 205/205、`check:miniprogram`、`git diff --check` 通过 |
| 2026-09-14 | 按用户纠正恢复资源中心原有完整展示，撤回隐藏/展开交互；本轮转为评估功能本身的重叠与必要性，未执行功能合并或删除 | `miniprogram/pages/resources/resources.js`、`resources.wxml`、`resources.wxss` | 三个资源页文件已恢复至本轮修改前版本 |
| 2026-09-14 | 继续收口首页入口：移除与资源、进度和 AI 专家 Tab 重复的“核心求职工具”区，首页聚焦今日任务、运营信息和校招更新 | `miniprogram/pages/index/index.wxml`、`index.js` | `check:miniprogram`、导航回归通过 |
| 2026-09-11 | 精简个人中心信息架构：移除与资源中心重复的我的简历、模拟面试、笔经面经和使用指南入口；收藏、投递、面试记录继续从统计卡进入，快捷区收敛为消息、每日简报、申请材料和错题本 | `miniprogram/pages/profile/profile.wxml`、`profile.wxss` | `check:miniprogram`、导航回归 14/14 通过 |
| 2026-09-10 | 修复竞争力陪跑分包页面在 `lazyCodeLoading: requiredComponents` 下偶发将 AI 说明组件解析为 `wx://not-found`；页面改为显式声明主包组件依赖，并增加配置回归断言 | `miniprogram/package-career/pages/career-coach/career-coach.json`、`tests/sprint4CareerCoach.test.js` | Sprint 4 专项 6/6、全量 204/204、`check:release` 与微信官方 CLI preview 编译通过 |
| 2026-09-10 | 修复收藏同步将 SQLite UTC 时间直接传入 `new Date()` 导致部分 iOS 无法解析的警告；改为逐字段 UTC 解析，并兼容 ISO、日期和数字时间戳 | `miniprogram/utils/date-time.js`、`miniprogram/utils/favorites.js`、`tests/sprint8Reliability.test.js` | Sprint 8 专项 7/7、全量 204/204、`check:release` 通过；未运行真实 E2E |
| 2026-09-09 | 修复竞争力陪跑在 401、超时、网络错误、HTTP 错误或残缺响应下仍进入成功视图，造成分数、七维诊断、周报和计划全部空白的问题；登录失效改为重新登录，其余异常展示可重试错误 | `career-coach.js`、`career-coach-state.js`、`tests/sprint4CareerCoach.test.js` | Sprint 4 专项 6/6、全量 203/203、`check:release` 通过；未运行真实 E2E，生产后端仍需独立发布 |
| 2026-09-09 | Sprint 8：提醒派发增加唯一投递账本、租约、失败重试、有界并发、游标续跑和耗时埋点；Today 改为跨设备增量合并与更新时间冲突控制；收藏增加 outbox、操作回执、删除 tombstone 并迁入统一 API 客户端 | `routes/notify.js`、`scripts/dispatch_reminders.js`、Today 服务/首页、收藏路由与工具、`0006_sprint8_reliability.sql`、`tests/sprint8Reliability.test.js`、Sprint 8 文档 | 专项 6/6、Smoke 72/72、全量 202/202、小程序检查与 `git diff --check` 通过；真实微信请求 0，未运行真实 E2E，生产 migration 待 Human |
| 2026-09-08 | Sprint 7：定义 Free/Pro 与 JD 简历包、7 天面试冲刺包、秋招季度包；保持历史 planId 0～3 兼容；建立订单/支付/权益/额度/退款统一账本、权益 Grant、退款审批状态机、六类告警和 0% 商业灰度审批门禁；会员页增加场景包边界、权益/订单/退款入口 | `services/v4Commerce*.js`、支付/会员/管理路由、商业化 migration、小程序会员页、`tests/sprint7Commerce.test.js`、`docs/V4_SPRINT7_COMMERCE_GOVERNANCE.md` | Sprint 7 专项 4/4、migration 5/5、Smoke 71/71、全量 195/195、`check:release` 通过；AI 故障矩阵 7/7、外部请求 0、媒体 191.2 KB、Errors 0/Warnings 4；未运行真实 E2E |
| 2026-09-08 | Sprint 6：新增 OA 计划/计时/错题/能力统计；将旧项目生成页升级为真实岗位差距驱动的证据项目、四里程碑留证、完成证据和确认式经历库写入；岗位详情增加五项证据 Job Trust Score 与本人官网核验记录 | OA/Project/Job Trust V4 数据表、服务、路由和小程序页面，`tests/sprint6Copilots.test.js`、`docs/V4_SPRINT6_OA_PROJECTS_JOB_TRUST.md` | Sprint 6 专项 7/7、migration 5/5、全量 190/190、`check:release` 通过；AI 故障矩阵 7/7、外部请求 0、媒体 191.2 KB、Errors 0/Warnings 4；未运行真实 E2E |
| 2026-09-08 | Sprint 5：新增联系人 CRM、Connect Note/Cold Message/Coffee Chat/Follow-up/Referral Request 五类可编辑草稿、用户确认外部发送、跟进 Today 提醒和 Networking 真实漏斗；Referral 成功关联岗位、正式申请、简历及版本 | `services/v4Networking.js`、Networking V4 路由、新增 Networking migration、Today/竞争力关联、小程序 Networking Copilot、`tests/sprint5Networking.test.js`、`docs/V4_SPRINT5_NETWORKING_COPILOT.md` | Sprint 5 专项 5/5、migration 5/5、全量 182/182、`check:release` 通过；AI 故障矩阵 7/7、外部请求 0、媒体 191.2 KB、Errors 0/Warnings 4；未运行真实 E2E |
| 2026-09-08 | Sprint 4：新增七维 Career Competitiveness Score、证据/差距/行动入口、真实漏斗驱动的 3/6/12 月计划与周报告；每日幂等生成 3～5 个 Today 任务，支持完成、延期、跨设备同步和站内提醒 | `services/v4CareerCoach.js`、Career/Today 路由、新增诊断与周报 migration、小程序竞争力陪跑页、`tests/sprint4CareerCoach.test.js`、`docs/V4_SPRINT4_CAREER_COACH.md` | Sprint 4 专项 5/5、migration 5/5、全量 176/176、`check:release` 通过；AI 故障矩阵 7/7、外部请求 0、媒体 191.2 KB、Errors 0/Warnings 4；未运行真实 E2E |
| 2026-09-04 | Sprint 3：完成可行动岗位梯次与投递决策、Sponsor/身份限制说明；接通岗位 JD 到真实简历版本的逐条确认和不可变新版本；新增公司×岗位×轮次 Interview Brief、弱项专项复练及 Today/申请进度回写 | Job Match、V4 简历中心、面试服务，小程序岗位详情/简历中心/面试空间，`tests/sprint3AiLoops.test.js`、`docs/V4_SPRINT3_HIGH_VALUE_AI_LOOPS.md` | Sprint 3 专项 5/5、全量 170/170、`check:release` 通过；AI 质量矩阵 7/7、外部请求 0、媒体 191.2 KB、Errors 0/Warnings 4；未运行真实 E2E |
| 2026-09-04 | Sprint 2.5：建立 `schema_migrations`、顺序 SQL migration、SHA-256 漂移检测、baseline 结构前置检查与显式目标/备份/确认保护；在隔离副本验证备份、迁移、幂等、故障事务、恢复和回滚 | `db/migrate.js`、`db/backup.js`、`db/migrations/0001_current_schema_baseline.sql`、迁移/演练脚本、专项测试、`docs/DATABASE_MIGRATION_PLAN.md` | migration 专项 5/5、全量 165/165；隔离演练 8 项检查通过，11,182,080-byte 备份恢复 SHA-256 一致，生产写入 0；未运行真实 E2E |
| 2026-09-04 | Sprint 2.4：建立 11 个合成匿名 AI 样本和超时/429/5xx/断网/非法 JSON/配置缺失/kill switch 故障矩阵；增加递归 PII 脱敏、虚构执行拦截、确认写入和额度不多扣；记录耗时、Token、降级与可选成本并汇总到运营看板 | AI runtime/Agent/简历/文案/面试路由与服务、`utils/aiSafety.js`、匿名 fixtures/门禁辅助程序、质量脚本/测试、`docs/AI_QUALITY_GATE.md` | `check:release` 160/160 通过、AI 故障矩阵 7/7、媒体 191.2 KB、Errors 0/Warnings 4；外部请求 0，未运行真实 E2E |
| 2026-09-04 | Sprint 2.3：建立岗位查看、匹配、简历确认、加入看板、确认投递、进入面试、收到 Offer 七阶段漏斗；区分官网点击与真实投递、模拟训练与真实面试；统一服务端可信事件、版本化 `refs`/缺失引用质量标记，并默认从运营看板排除 demo/test/system | `utils/funnelAnalytics.js`、Analytics/职位/申请/简历路由与服务、运营看板、小程序埋点、`.env.example`、`docs/FUNNEL_ANALYTICS_CONTRACT.md`、专项与 smoke 测试 | `check:release` 156/156 通过、媒体 191.2 KB、Errors 0/Warnings 4；专项 4/4、smoke 67/67；未运行真实 E2E，未推送、未部署 |
| 2026-09-04 | Sprint 2.2：统一职位/校招 `dataMeta` 来源与新鲜度契约，修正正式职位主源优先级、历史职位伪造时间与分页复制，补齐校招短日期解析、明确截止过期、缓存/失败降级标记和小程序紧凑展示 | `utils/dataProvenance.js`、职位/校招路由与格式化器、小程序职位/校招适配和卡片、`docs/JOB_CAMPUS_DATA_PROVENANCE_CONTRACT.md`、专项与 smoke 测试 | `check:release` 151/151 通过、Errors 0/Warnings 4；未运行真实 E2E，未推送、未部署 |
| 2026-09-03 | Sprint 2 第一批：建立核心实体 `refs` 契约，统一官方岗位 ID 优先级、数值主键输出与申请 V4 状态；接通申请、简历、材料、面试、Today 和关键埋点引用 | `utils/coreEntityRefs.js`、`utils/applicationStatus.js`、V4 相关路由/服务、`docs/CORE_ENTITY_REFERENCE_CONTRACT.md`、专项与集成测试 | 143/143 tests 通过；`git diff --check` 通过；未运行真实 E2E，未改数据库结构，未推送、未部署 |
| 2026-09-03 | Sprint 1 仓库侧收口：将校招、申请文案、管理员限流、分享封面、审核 UI、测试和部署基线拆成可审查提交；统一 Node 20、4400、版本目录/current 软链接、共享数据、备份、PM2/Nginx 与手动生产发布；移除 n8n 默认密码和日志回显 | Git 提交 `35b8956` 至 `a9b92a6`、部署/安全文档 | `check:release` 137/137、媒体 191.2 KB、Errors 0/Warnings 4；完整 smoke 65/65、Shell/JS/JSON/YAML 静态校验和密钥扫描通过；未运行真实 E2E，未推送、未部署 |
| 2026-09-03 | Sprint 0 清理：完整归档旧备份、旧统一前小程序和 Banner 优化素材；同步 11 份历史开发文档到 Obsidian；注销旧部署工作树并保留独有部署分支；旧目录送入回收站 | `archives/cleanup-20260903/`、Obsidian `历史归档/2026-06旧版/`、Git worktree 元数据 | ZIP 15.54 MB、6,628 个条目可读取；11 份文档 SHA-256 校验一致；主项目分支/HEAD 不变；`check:miniprogram` 通过，微信预览正常 |
| 2026-09-03 | Sprint 0：确认 D 盘唯一主项目及旧目录 Junction；以 `codex/v4-development` 分支、`bcd6e8430710f374cf8dfab61dd319562c0a1b73` 为 Git 基线，恢复 1,588 个受 Git 跟踪的小程序文件，并从 Codex 历史日志恢复 8 月未提交的小程序增量（登录审核交互、AI 提示条、资源中心、校招刷新与文案、分享图及缓存）；恢复并压缩品牌 Logo | `miniprogram/`、`DEVELOPMENT_STATUS.md`、`DEVELOPMENT_LOG.md` | `npm run check:release` 通过：137/137 tests；媒体总量 191.2 KB；数据检查 Errors 0、Warnings 4；`git diff --check` 通过。未推送、未部署；用户已确认微信开发者工具预览正常 |
| 2026-08-25 | 修复微信分享卡片封面空白：移除首页失效的 404 线上图片，新增 5:4 包内分享封面；全局配置、后台配置、旧图片路径和客户端缓存统一迁移到新封面，并避免接口缓存继续下发旧地址 | 小程序分享工具/首页/图片资源、`utils/shareConfig.js`、`routes/share.js`、后台分享页与专项测试 | 全量测试 136/136、分享专项 2/2、`check:miniprogram` 通过；媒体总量 179.8 KB；微信预览因开发者工具登录过期未生成二维码 |
| 2026-08-12 | 将“申请材料库”收窄为“申请文案库”：移除整份简历 JSON 生成与展示，定制简历统一引导至简历中心；生成前强制选择有效简历并支持补充 JD，隐藏模型/提示词内部信息，历史定制简历记录不再进入文案列表 | `routes/v4/materials.js`、`routes/career-assets.js`、小程序 `application-materials`、材料工具与回归测试 | 待本批验证 |
| 2026-08-12 | 修复管理后台正确密码也会频繁被误封：后台登录限额改为按真实 IP + 用户名隔离，仅累计失败请求，成功登录不占用限额；同步重置并统一正式 `admin` 账号密码 | `middleware/rateLimit.js`、`server.js`、`tests/adminLoginRateLimit.test.js`与正式 `zhiyincareer-main` 实例 | 134/134 tests 通过；公网新密码连续登录 6 次均返回 200，第 6 次未再触发原 5 次误封，账号角色为 `super_admin` |
| 2026-08-10 | 修复生产校招已同步但首页仍显示旧批次：服务端按开放日期选取最新批次并禁止中间缓存，小程序每次进入首页强制刷新且携带新鲜度参数，同时升级本地缓存版本 | `routes/campus.js`、小程序 `utils/api-campus.js`、`pages/index/index.js`、部署工作流与校招回归测试 | 公网 API 已返回 2026-08-10 最新 28 条；校招内容测试 4/4、校招接口测试 2/2、`check:miniprogram` 通过 |
| 2026-08-10 | 将“职引睿选”新校招表同步到职引官网校招日历生产板块：修正生产定时任务的 Node 版本与共享数据库路径，增加校招专属配置白名单合并工具，并完成官网实际数据库全量同步 | `scripts/sync_feishu_server.js`、`scripts/run-campus-sync.sh`、`scripts/merge-campus-env.js`、`.env.example` 与校招回归测试 | 生产原始 11,513 条、有效 11,485 条、去重写入 11,467 条、数据库总计 11,498 条；131/131 tests、公网 API 与真实官网页面均显示 8 月 10 日最新内容 |
| 2026-08-10 | 统一缩小全端 AI 生成提示条：增加组件左右安全留白，压缩卡片高度、标签、字号与间距，修复长文案贴边拥挤；将模拟面试设置、面试对话和 AI 报告三处旧提示迁移为共享组件 | 小程序 `components/c-ai-disclosure`、3 个面试页面、审核检查与页面回归测试 | 全量测试 130/130、AI 提示专项 4/4、`check:miniprogram` 通过 |
| 2026-08-10 | 将校招数据源切换为“职引睿选”飞书主体下的新多维表格与指定视图；完成全量重爬并让首页、校招列表和详情统一读取后端同步数据，同时按开始时间自动推导招聘年度 | `.env.example`、`scripts/sync_feishu_server.js`、小程序 `pages/index`、`pages/campus`、`package-content/pages/campus-detail` 与校招回归测试 | 新表原始 11,485 条、有效 11,457 条、去重写入 11,439 条；全量测试 129/129、`check:miniprogram`、数据检查（错误 0）通过 |
| 2026-08-10 | 修复微信代码质量“图片和音频资源”误判理解：按开发者工具真实算法将编译包内媒体总量从 203.1 KB 降至 191.2 KB，并将本地检查由单文件 200 KB 修正为媒体总量严格小于 200 KB | `miniprogram/images/logo_google.png`、`scripts/check-miniprogram.js` | `check:miniprogram` 通过，媒体总量 191.2 KB / < 200 KB，主包约 1.00 MB |
| 2026-08-10 | 优化小程序登录审核交互：登录弹层增加显著关闭按钮和“暂不登录，先逛逛”入口；手机号授权被拒绝后立即退出弹层并返回当前页面，避免反复施压授权 | 小程序 `components/c-login-popup`、登录回归测试与小程序审核检查 | 全量测试 128/128、登录专项 4/4、`check:miniprogram` 通过 |
| 2026-08-10 | 重构资源中心排版：四个模块移除分组副标题，主标题改为蓝/绿/紫主题色胶囊；“内容与服务”由三行紧凑列表改为三张独立服务卡，并让页面底部延续浅蓝灰背景以消除白块 | 小程序 `pages/resources/resources.js`、`resources.wxml`、`resources.wxss` 与导航回归测试 | 资源中心回归 14/14、`check:miniprogram` 通过 |
| 2026-08-10 | 修复首页与校招页仍显示 6 月 9 日旧数据：优先读取已上线的飞书 2027 届校招源，完整映射中文字段、链接和同步日期；旧后端接口保留兜底并改为按更新时间排序，飞书记录详情支持直接打开；“新开”文案统一为“更新” | `db/database.js`、`db/formatters.js`、`routes/campus.js`、`routes/admin.js`、小程序校招数据适配/首页/列表/详情与测试 | 全量测试 127/127、`check:miniprogram`、数据检查（错误 0）通过；线上飞书内容源验证 33 条，首条毕马威记录公司、岗位、链接和 2026-07-09 同步日期映射正确 |
| 2026-08-04 | 修复统一搜索页职位长期停留在加载态：正式职位 API 与飞书人工职位源改为并行竞速，优先采用最先返回的非空结果；增加实时搜索序号和 12 秒加载兜底，防止慢速旧请求覆盖新关键词或无限转圈 | 小程序 `utils/api-jobs.js`、`package-user/pages/search/search.js` 与职位搜索回归测试 | 全量测试 125/125、`check:miniprogram`、数据检查（错误 0）通过；生产同链路搜索 `data analyst` 约 2 秒返回 10 个职位；微信开发者工具生成预览二维码成功 |
| 2026-08-04 | 按产品说明重构职位列表卡片与职位详情决策链路：新增统一职位展示适配层和复用卡片，收敛薪资、地点、标签、技能、AI 匹配、截止与投递状态；详情页依次展示核心信息、公司、匹配、条件、JD、要求、时间、公司介绍、相似职位和安全区固定操作栏，并保留收藏、详情跳转、外链投递、投递看板与 AI 分析 | 小程序 `utils/job-presenter.js`、`components/c-job-card/*`、`pages/jobs/*`、`package-user/pages/search/*`、`package-user/pages/job-detail/*` 与职位展示回归测试 | 全量测试 124/124、`check:miniprogram`、数据检查（错误 0）与微信开发者工具预览编译通过；主包 791.9 KB、`package-user` 451.4 KB |
| 2026-08-04 | 修复统一搜索页在防抖实时匹配时把每个输入片段写入搜索历史的问题：实时结果保持不变，历史仅记录用户点击搜索、键盘搜索或选择完整关键词的提交动作；加载时自动去重并清理已有连续前缀碎片 | 小程序 `package-user/pages/search/search.js` 与导航回归测试 | 全量测试 120/120、`check:miniprogram` 与数据检查通过；微信开发者工具预览编译成功，主包 777.7 KB |
| 2026-08-03 | 修复“我的简历”手动编辑弹层：恢复单行输入框可点击高度、光标及输入文字/占位符显示，统一工作、教育、项目、基本信息和技能表单 UI；保存时使用完整新对象更新，确保关闭弹层后内容立即回显 | 小程序 `package-career/pages/resume/resume.js`、`resume.wxml`、`resume.wxss` 与导航回归测试 | 全量测试 119/119、`check:miniprogram` 与数据检查通过；微信开发者工具预览编译成功，主包 777.7 KB |
| 2026-08-03 | 清理职位详情、职位列表、个人中心、公司详情等非 AI 专属页面的顶部 AI 说明；职位收藏改为静默开启截止提醒，优先使用岗位真实截止日，无截止日时默认收藏后 30 天，并提前 3 天和 1 天提醒 | 小程序普通页面 WXML、`utils/favorite-reminder.js`、`utils/favorites.js`、职位列表/详情、收藏夹与测试 | 全量测试 118/118、`check:miniprogram` 与数据检查通过；微信开发者工具预览编译成功，主包 777.7 KB |
| 2026-08-03 | 将 AI 求职规划从简短关键词清单升级为可执行方案：补充岗位结论与假设、能力差距、技能练习与证明、项目蓝图、阶段交付物与量化指标、6 个里程碑、每周执行节奏和风险预案；生成改为两部分并行 JSON 并增加完整度质量门禁 | `services/careerPlanGenerator.js`、`routes/ai.js`、小程序 `package-career/pages/career-planner/*` 与回归测试 | 全量测试 115/115、小程序检查与微信预览编译通过；真实方舟模型 43 秒生成，质量门禁 9/9；生产 readiness 与公网健康检查通过 |
| 2026-08-03 | 优化编辑资料页多选交互：已选地区、行业、岗位和技能时，将继续搜索缩短为卡片右上角“继续添加”按钮；毕业年份从固定标签改为 1970 年至未来 20 年的年份选择器 | 小程序 `package-user/pages/profile-edit/*` 与导航回归测试 | 导航回归 11/11、全量测试 111/111、`check:miniprogram` 通过；微信开发者工具预览编译成功，主包 776.6 KB |
| 2026-08-03 | 将隐藏的职业工具中心功能并入资源中心：新增 AI 求职规划、简历中心和 Offer 对比入口，复用已有薪酬查询与职业洞察入口；原职业工具中心收口为单一 AI 求职规划页 | 小程序 `pages/resources/*`、`package-career/pages/career-planner/*` 与导航回归测试 | 导航回归 10/10、全量测试 110/110、`check:miniprogram` 通过；微信开发者工具预览编译成功，主包 776.6 KB |
| 2026-08-03 | 隐藏“我的简历”页面及内部纵向滚动区域的滚动指示器，并将基本信息与个人优势合并为同一卡片 | 小程序 `package-career/pages/resume/resume.wxml`、`resume.wxss` 与导航回归测试 | 页面回归 10/10、`check:miniprogram` 通过；微信开发者工具预览编译成功，主包 776.0 KB |
| 2026-08-03 | 修复 AI 简历润色长期误走 `fallback-rules`、建议与原文相同、时间戳和个人隐私被当作优化内容的问题；完善降级标识并发布后端修复 | `services/v4AiRuntime.js`、`services/v4ResumeCenter.js`、小程序 `resume-center`、测试与 AI 运行文档 | `check:release` 通过，109/109 tests、内容错误 0；生产 readiness 全通过，DeepSeek 实测 `source=live`、无降级 |
| 2026-07-29 | 修复底部导航“进度”和“AI专家”未选中仍显示蓝色的问题，为两项补充独立灰色未选中图标，保留品牌蓝作为选中状态并增加防回归检查 | 小程序 `custom-tab-bar/index.js`、`app.json`、`images/*-muted.png` 与导航测试 | 导航测试 9/9、`check:miniprogram` 通过；微信开发者工具预览成功，主包 776.0 KB |
| 2026-07-29 | 修复上线审核阻断风险：面经、评论、回复和机构评价实行发布前人工审核，公开接口仅展示已通过内容；后台支持通过/驳回并保留审核日志，评论数与机构评分按审核状态联动；隐私政策同步虚拟支付、运营主体和社区审核规则 | `db/database.js`、UGC/API 路由、后台审核页、小程序提交反馈、隐私政策、测试与 `docs/UGC_MODERATION_RELEASE.md` | `check:release` 通过，105/105 tests、内容错误 0；微信开发者工具预览编译通过，主包 771.6 KB |
| 2026-07-29 | 将全端登录受限入口统一为当前页登录弹层，登录成功后自动继续原操作；登录弹层替换为压缩后的职引品牌 Logo | 小程序 `components/c-login-popup`、`behaviors/login-gate.js`、进度/AI 专家/岗位/简历/面经/机构/薪资/会员/设置/面试页面及回归测试 | `check:release` 通过，101/101 tests、内容错误 0；微信开发者工具预览编译通过，主包约 770.6 KB |
| 2026-07-20 | 按产品参考图重新制作资源中心：自定义导航、大标题、校招日历主视觉、横向双列工具卡和内容服务列表 | 小程序 `pages/resources`、回归测试与 V4 文档 | `check:release` 通过，91/91 tests、内容错误 0，主包约 0.96 MB |
| 2026-07-20 | 首页校招从双列瀑布流调整为单列最新信息流，每个岗位独占一行并按更新时间倒序；资源中心按求职任务重新分组并全面优化视觉层级 | 小程序 `pages/index`、`pages/resources`、`components/home-campus-updates`、测试与 V4 文档 | `check:release` 通过，91/91 tests、内容错误 0，主包约 0.96 MB |
| 2026-07-20 | 将“校招”一级 Tab 升级为资源中心，聚合题库、STAR、薪酬、公司、OA、AI 面试、技能路径、校招和资讯等入口；首页移除求职情报并改为最多 8 条校招日历双列瀑布流 | 小程序 `pages/resources`、`pages/index`、`components/home-campus-updates`、`custom-tab-bar`、导航调用、测试与 V4 文档 | `check:release` 通过，91/91 tests、内容错误 0，主包约 0.96 MB |
| 2026-07-17 | 修复线上 V4 Agent 路由未部署导致的 404：关闭未部署路由探测、切换旧 AI 通道、本机保存兼容任务、禁用兼容写操作，并接受 HTTP 201 等全部 2xx 写请求 | 小程序 `pages/ai-career`、`utils/app-config.js`、`utils/agent-compat.js`、`utils/api-client.js` 与回归测试 | `check:release` 通过，90/90 tests、内容错误 0，主包约 0.95 MB；生产 V4 后端仍需独立发布 |
| 2026-07-17 | 优化 V4 一级导航中文文案：`Today` 改为“首页”，承载校招日历的“岗位”改为“校招” | 小程序 `app.json`、`custom-tab-bar`、导航测试与 V4 文档 | `check:release` 通过，85/85 tests、内容错误 0，主包约 0.95 MB |
| 2026-07-17 | 恢复全局 AI 悬浮助手，并在首页恢复紧凑会员权益横幅；会员关闭时明确提示真实微信支付未开放 | 小程序 `custom-tab-bar`、`pages/index`、导航防回归测试与首页文档 | `check:release` 通过，85/85 tests、内容错误 0，主包约 0.95 MB |
| 2026-07-17 | 重构 AI Career 主页面 UI：紧凑顶部、2×2 Agent 网格、快捷提问、上下文编排、任务历史与结果弹层 | 小程序 `pages/ai-career`、`components/c-ai-disclosure` | `check:release` 通过，84/84 tests、内容错误 0，主包约 0.94 MB |
| 2026-07-17 | 修复求职进度线上响应异常：兼容旧响应、登录失效、本机记录回退与离线新增保存 | 小程序 `pages/applications`、`utils/application-workbench.js` | `check:release` 通过，84/84 tests、内容错误 0 |
| 2026-07-17 | 将“申请”升级为“求职进度”工作台：本周重点、申请漏斗、准备度、优先级排序、快捷入口与手动新增申请 | 小程序 `pages/applications`、`utils/application-workbench.js`、TabBar 与测试 | `check:release` 通过，82/82 tests、内容错误 0，主包约 0.92 MB |
| 2026-07-17 | 将 V4“岗位”一级 Tab 调整为直接承载校招日历，并迁移旧 `switchTab` 入口 | 小程序 `app.json`、`custom-tab-bar`、导航工具及岗位返回入口 | `check:release` 通过，79/79 tests、导航测试 3/3、内容错误 0 |
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
| 2026-05-11 | 超长 WXSS 初步整理，抽取高频颜色到全局 token 并替换首批页面硬编码 | 小程序 `app.wxss`、`pages/salary/salary.wxss`、`pages/jobs/jobs.wxss`、`pages/applications/applications.wxss` | WXSS token 引用检查 |
| 2026-05-11 | `salary.wxss` 精简第一轮，合并并删除尾部 readability 重复覆盖块 | 小程序 `pages/salary/salary.wxss` | WXSS 括号平衡检查 |
| 2026-05-11 | `salary.wxss` 精简第二轮，合并主要 kingkong polish 单 selector 覆盖块并删除重复 selector | 小程序 `pages/salary/salary.wxss` | WXSS 括号平衡检查，1480 行 |
| 2026-05-11 | `applications.wxss` 精简第一轮，合并头部、搜索、筛选、列表/FAB/弹窗部分覆盖样式 | 小程序 `pages/applications/applications.wxss` | WXSS 括号平衡检查，1163 行 |
| 2026-05-11 | `applications.wxss` 精简第二轮，合并卡片、流程、备注、Offer、表单和弹窗重复覆盖块 | 小程序 `pages/applications/applications.wxss` | WXSS 括号平衡检查，954 行，重复选择器 0 |
| 2026-05-11 | `jobs.wxss` 修复未闭合 `content` 编译错误，并合并主要尾部覆盖样式 | 小程序 `pages/jobs/jobs.wxss` | WXSS 括号平衡检查，1089 行 |
| 2026-05-11 | `index.wxss` 精简第一轮，合并首页搜索、Banner、功能宫格、列表卡片和新闻卡重复覆盖块 | 小程序 `pages/index/index.wxss` | WXSS 括号平衡检查，988 行，重复选择器 2 |
| 2026-05-11 | `experiences.wxss` 精简第一轮，合并题库页头部、Tab、筛选、统计和题目卡片重复覆盖块 | 小程序 `pages/experiences/experiences.wxss` | WXSS 括号平衡检查，980 行，重复选择器 0 |
| 2026-05-11 | `resume.wxss` 精简第一轮，合并简历诊断页 Tab、进度、按钮、空状态和 NLP 面板重复覆盖块 | 小程序 `pages/resume/resume.wxss` | WXSS 括号平衡检查，863 行，重复选择器 0 |
| 2026-05-12 | `agencies.wxss` 精简第一轮，合并机构评估页筛选、搜索、工具栏、卡片和对比条重复覆盖块 | 小程序 `pages/agencies/agencies.wxss` | WXSS 括号平衡检查，504 行，重复选择器 0 |
| 2026-05-12 | `project-builder.wxss` 精简第一轮，合并项目生成器 Hero、表单、轨道卡、芯片、按钮和结果卡重复覆盖块 | 小程序 `pages/project-builder/project-builder.wxss` | WXSS 括号平衡检查，450 行，重复选择器 0 |
| 2026-05-12 | `ai-assistant.wxss` 精简第一轮，合并 AI 助手页头部、消息气泡、快捷问题、建议和输入栏重复覆盖块 | 小程序 `pages/ai-assistant/ai-assistant.wxss` | WXSS 括号平衡检查，656 行，重复选择器 0 |
| 2026-05-12 | `profile.wxss` 精简第一轮，合并个人中心头部、统计、VIP、菜单和工作区重复覆盖块 | 小程序 `pages/profile/profile.wxss` | WXSS 括号平衡检查，355 行，重复选择器 0 |
| 2026-05-12 | `career-planner.wxss` 精简第一轮，合并职业规划页 Hero、表单、输入、提示、生成和阶段 Tab 重复覆盖块 | 小程序 `pages/career-planner/career-planner.wxss` | WXSS 括号平衡检查，474 行，重复选择器 0 |

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
| P2 | 超长 WXSS 初步整理 | Codex | 小程序 `app.wxss`、`pages/salary/salary.wxss`、`pages/jobs/jobs.wxss`、`pages/applications/applications.wxss` | 已完成 |
| P2 | 超长 WXSS 精简清理 | Codex | 小程序 `pages/salary/salary.wxss`、`pages/applications/applications.wxss`、`pages/jobs/jobs.wxss`、`pages/index/index.wxss`、`pages/experiences/experiences.wxss`、`pages/resume/resume.wxss`、`pages/agencies/agencies.wxss`、`pages/project-builder/project-builder.wxss`、`pages/ai-assistant/ai-assistant.wxss`、`pages/profile/profile.wxss`、`pages/career-planner/career-planner.wxss` | 已完成首批 |

## 当前文件占用

- Codex（2026-10-20，AI 求职助手流式问答修复，已完成并释放）：调整 `miniprogram/pages/ai-career/ai-career.js`、`miniprogram/package-ai/pages/ai-assistant/ai-assistant.js`、新增 `tests/aiAssistantStreaming.test.js`、登记至 `tests/all.test.js` 与本记录。将微信分块监听注册到 RequestTask，使回答在请求结束前显示；补齐跨分块 UTF-8 中文解码，保留原有错误回退。专项 8/8；`check:release` 557 项中 555 通过、0 失败、2 项既有 Windows 跳过，AI 质量与小程序检查通过，数据 0 错误/7 项既有提示。公网 readiness 200，但仅检查 AI 配置就绪，未实际代用户调用线上问答；未做微信真机预览或小程序上传发布，也未改 AI 服务配置、鉴权和生产部署。

- Codex（2026-10-20，今日求职计划移除待办副标题，已完成并释放）：调整 `miniprogram/pages/index/index.{wxml,wxss}`、`tests/frontendVisualCheckpoint.test.js` 与本记录。移除“优先处理”和次要待办描述，收紧待办行距；保留任务标题、状态、跳转和任务数据。首页/导航专项 45/45、`check:miniprogram` 和差异格式检查通过；未在微信开发者工具或真机预览，未发布。

- Codex（2026-10-20，首页校招区标题与查看全部样式，已完成并释放）：调整 `miniprogram/pages/index/index.{wxml,wxss}` 与本记录。删除标题下的更新说明，右侧统一为其他首页卡片的“查看全部”文本、箭头和样式，保留跳转及校招列表数据。首页/导航专项 45/45、`check:miniprogram` 和差异格式检查通过；未在微信开发者工具或真机预览，未发布。

- Codex（2026-10-20，修复微信代码质量主包冗余 JS，已完成并释放）：将 `miniprogram/utils/oa-practice-bank.js` 移到 `miniprogram/package-career/pages/oa-bank/oa-practice-bank.js`，更新同目录 OA 页引用与 `tests/oaPracticeBank.test.js`。题目与交互不变，主包已无该文件或旧引用。OA 专项 3/3、`check:miniprogram`、JS 语法和差异格式检查通过；未运行微信开发者工具质量复扫，未预览或发布。

- Codex（2026-10-19，“我的”七个详情入口升级，已完成并释放）：调整 `miniprogram/package-career/pages/resume-center/resume-center.{wxml,wxss}`、`miniprogram/package-user/pages/{favorites,messages,my-experiences,feedback,about,settings}/*.{js,wxml,wxss}` 中本轮涉及的页面、`tests/profileDetailPages.test.js`、`tests/all.test.js` 与本记录。统一蓝白卡片、信息层级、操作与空状态；消息总数与分类数改为基于完整列表，失败时给出重试并隐藏不准确数字；面经操作可点击且明确本机保存；反馈失败保留输入并提示重试；设置移除不生效的外观与推送开关。简历上传与服务端数据删除请求及确认逻辑未改，消息已读接口行为保持原样。页面、导航及消息相关专项 88/88、`check:miniprogram`、JS 语法与差异格式检查通过；未在微信开发者工具或真机预览，未上传或发布。

- Codex（2026-10-19，编辑资料表单减负，已完成并释放）：调整 `miniprogram/package-user/pages/profile-edit/profile-edit.{js,wxml,wxss}` 与本记录。取消首屏“缺少多项”进度施压，压缩身份卡；学历改为单行选择器，首屏保留基础资料、毕业年份、目标地区和目标岗位；常见选项仍可在搜索弹层选择，行业、求职类型、签证、技能及项目等字段归入默认收起的“其他资料”。原有值、保存/同步和头像上传链路保持不变，不改后端或生产数据。导航/资料隔离专项 34/34、小程序静态、JS 语法及差异格式检查通过；未在微信开发者工具或真机预览，未上传或发布。

- Codex（2026-10-19，测评资料详情页整体排版，已完成并释放）：调整 `miniprogram/package-content/pages/assessment-detail/assessment-detail.{wxml,wxss}` 与本记录。封面下的标题、公司届别、价格和摘要归入白色商品卡；介绍、目录、示例、领取及售后分区，订单状态改为提示卡，底部价格与主操作重新对齐。保留全部商品字段、购买/已购状态、领取入口和示例图预览，不改支付逻辑、商品数据或生产环境。测评页面/预览专项 29/29 与 `check:miniprogram` 通过；未在微信开发者工具或真机预览，未上传或发布。

- Codex（2026-10-19，测评资料列表/详情封面重新设计，已完成并释放）：调整 `miniprogram/package-content/pages/assessment-list/assessment-list.{wxml,wxss}`、`miniprogram/package-content/pages/assessment-detail/assessment-detail.{wxml,wxss}`、`miniprogram/package-content/assessment-shared.wxss`、`miniprogram/utils/api-assessment-resources.js`、`tests/assessmentFrontend.test.js` 与本记录。生产商品原图仅 200×200；列表改为 124×160rpx 竖版原生图形，详情改为全宽×340rpx 横版图形，按公司显示五种配色与清晰原生文字，避免原图放大裁切。保留原 `coverUrl` 数据供其它入口使用，不改商品、支付或生产数据。测评专项 51/51、小程序静态、JS 语法与差异格式检查通过；未在微信开发者工具或真机预览，未上传或发布。

- Codex（2026-10-19，测评资料列表卡片排版，已完成并释放）：调整 `miniprogram/package-content/pages/assessment-list/assessment-list.{wxml,wxss}` 与本记录；资料列表改为独立白色卡片，封面放大并完整显示，标题、公司届别、说明及价格分层，搜索和“我的已购”点击区域分开。保留原搜索、分页、已购状态及详情跳转。相关专项 28/28、小程序静态与差异格式检查通过；未在微信开发者工具或真机预览，未上传或发布。

- Codex（2026-10-19，我的页面会员权益卡片间距，已完成并释放）：调整 `miniprogram/pages/profile/profile.wxss` 与本记录；个人资料卡与会员卡之间补齐 24rpx 间距，与会员卡到“我的记录”保持一致。相关专项 45/45、小程序静态与差异格式检查通过；未在微信开发者工具或真机预览，未上传或发布。

- Codex（2026-10-19，OA 页面改为直接刷题，已完成并释放）：调整 `miniprogram/package-career/pages/oa-bank/oa-bank.{js,wxml,wxss}`、`miniprogram/pages/resources/resources.js`，新增 `miniprogram/utils/oa-practice-bank.js`、`tests/oaPracticeBank.test.js` 与本记录。首页可免登录直接练习 21 道原创通用模拟题（7 类各 3 题）、提交看解析、换题和重练；原训练计划、计时及本人记录保留在“训练记录”次级标签，模拟题成绩只在当前页面会话显示，不混入用户确认的服务端统计。资源入口描述同步修正。相关专项 64/64、小程序静态、JS 语法与差异格式检查通过；未在微信开发者工具或真机预览，未上传或发布。

- Codex（2026-10-19，资源中心“我的已购”卡片统一，已完成并释放）：调整 `miniprogram/pages/resources/resources.wxml`、`tests/frontendVisualCheckpoint.test.js` 与本记录；把“我的已购”放入“更多资源”的同一个白色列表卡，图标改用与“我的收藏”相同的可用态和行样式。相关专项 45/45、小程序静态与差异格式检查通过；未在微信开发者工具或真机预览，未上传或发布。

- Codex（2026-10-19，申请进度数字同行右对齐，已完成并释放）：调整 `miniprogram/pages/index/index.wxss`、`tests/frontendVisualCheckpoint.test.js` 与本记录；三项进度标签与数字同行，数字放在各自色块右端。相关专项 58/58、小程序静态与差异格式检查通过；未在微信开发者工具或真机预览，未上传或发布。

- Codex（2026-10-19，今日计划重复标题与申请进度对齐，已完成并释放）：调整 `miniprogram/pages/index/index.{wxml,wxss}`、`tests/frontendVisualCheckpoint.test.js` 与本记录；删除“今天有 X 项待办”重复行，将“申请进度”标题左对齐，保留右侧“查看全部”。相关专项 58/58、小程序静态与差异格式检查通过；未在微信开发者工具或真机预览，未上传或发布。

- Codex（2026-10-19，资源中心恢复标题式卡片，已完成并释放）：撤销上一轮在 `miniprogram/pages/resources/resources.{wxml,wxss}` 新增的精选资源阶段文案、更多资源说明及卡片增高/加大间距；保留可进入“我的已购”的功能入口。同步调整两份视觉/导航断言，专项 78/78、小程序静态与差异格式检查通过。未取得微信开发者工具或真机截图，未上传或发布。

- Codex（2026-10-19，今日计划卡片按最新截图调整，已完成并释放）：修改 `miniprogram/pages/index/index.{js,wxml,wxss}`、`tests/frontendVisualCheckpoint.test.js`、`tests/checkpoint8.test.js` 与本记录。移除顶部重复任务说明；申请进度标题居中，保留右侧查看全部；主按钮可点区域仍为 88rpx，蓝色可视部分缩至 68rpx；本地和同步任务不再只取前三项，首要任务下逐条显示其余事项完整标题、说明与完成状态。保留原数据隔离、状态更新和导航语义。相关专项 106/106、小程序静态与 JS/差异格式检查通过，WXSS 机械扫描无发现；未取得微信开发者工具或真机截图，未上传或发布。

- Codex（2026-10-19，今日计划与申请进度合并）：已完成 `miniprogram/pages/index/index.{wxml,wxss}`、首页/导航回归测试和视觉夹具本轮调整，文件占用已释放。参考线上旧卡片把原来两张卡合为一张：待办数与简短说明、可进入申请进度的三项统计、单条今日建议及紧凑主操作；首页不再逐条铺开两个次要待办。任务与进度数据及原导航逻辑继续复用。相关测试 56/56、小程序静态、JSON 与差异格式检查通过；尚未微信开发者工具或真机视觉验收，未提交或发布。

- Codex（2026-10-19，每日校招白色卡片外框）：已恢复首页每日校招整个模块的白底、边框、圆角与轻阴影，标题和岗位列表同处一张卡片内；保留公司/职位双行与彩色标签。`tests/frontendVisualCheckpoint.test.js` 增加外框回归检查，专项 15/15、小程序静态与差异格式检查通过；未做微信开发者工具或真机视觉验收，未提交或发布，文件占用已释放。

- Codex（2026-10-19，首页卡片视觉层级优化）：已完成 `miniprogram/pages/index/index.{js,wxml,wxss}`、首页/校招专项测试和视觉夹具本轮调整，文件占用已释放。每日校招参照线上样式采用区块标题加白色列表卡，保留公司与职位各一行，增加真实状态、行业和截止标签；最新机会改为公司、岗位、类型/地点和来源分层；今日任务、进度、常用功能及资料价格增加语义色。缺失明确截止日期不再误标“即将截止”。相关测试 68/68、小程序静态、JS 语法、JSON 和差异格式检查通过；旧首页 PNG 基准仍标记过时，未做微信开发者工具/真机视觉验收，未提交或发布。

- Codex（2026-10-19，首页最新机会展示 3 个岗位）：已完成 `miniprogram/pages/index/index.{js,wxml}`、首页视觉测试及视觉夹具的数量调整，文件占用已释放。最新机会从公开数据取最近 3 条有效岗位，页面最多展示 3 行；“为你推荐”已有 3 条数据时现在也展示完整 3 行。专项测试 15/15、小程序静态、JS 语法、JSON 与差异格式检查通过；未在微信开发者工具重新编译或发布。

- Codex（2026-10-19，职位详情描述显示）：已完成 `miniprogram/utils/job-presenter.js`、`miniprogram/package-user/pages/job-detail/job-detail.{js,wxml,wxss}` 和 `tests/jobPresentation.test.js` 的本轮修复，文件占用已释放。招聘源多层 HTML 实体解码并转为可读段落；长描述默认展示摘要，支持展开完整原文。专项测试 6/6、小程序静态检查、JS 语法和差异格式检查通过；尚未在微信开发者工具重新编译做真机视觉确认，未提交或发布。

- Codex 后端 review 修复（2026-10-19）：继续占用本次 assessment 后端/0012/专项测试/实施文档，必要扩展 `routes/users.js` 的账号注销数据库事务。风险：账号注销不得被历史订单阻断或先提交部分删除；已注销用户旧 token 不得领取；关闭订单迟到收款必须记账待人工核对且不发链接。验证：隔离数据库覆盖 pending/paid/refunded 注销、注销失败回滚、旧 token、合法迟到回调及凭据退款，禁止生产写入。

- Codex 团队（2026-10-19，测评资料 1.0 已完成本地开发）：已完成首页最多三家不同公司的运营推荐、资源中心/公司详情入口、资料列表与详情、单品支付、本人已购与网盘领取、后台商品/推荐/订单/人工退款记录，以及 0012 正式迁移文件。范围包括 `services/assessmentCommerce.js`、新增资料路由、现有支付/商业服务接入、`routes/users.js` 注销事务、`server.js`、后台权限、本次小程序/后台资料界面与相关测试；文件占用已释放。已复核服务端定价、签名/金额/SKU/provider、幂等、退款撤权、关闭订单迟到收款待核对、账号隔离与注销回滚；后台编辑乱序和过期已付订单的购买提示已修复。未提交、推送、部署或向主运行数据库应用迁移。

  最终集成：`check:release` 全量 478 项，475 通过、1 失败、2 项 Windows 跳过；唯一失败为实现前既有 `jobSourcesIntegration.test.js:17` JSearch actual 8 / expected 9，发布检查未标全绿。对比实现前 441 项（438/1/2），新增 37 项全部通过（资料后端 15、前端 17、后台 4、迁移 1），三个旧购买文案/资源数量断言已更新并通过。截断后补跑 AI 质量 7/7、小程序静态（媒体 197.1 KB、主包 1.09 MB）、数据检查（0 错误/5 既有提示）通过；迁移 11/11，Acceptance 29 通过/0 失败/1 既有岗位详情提示。独立后端与 UI review 对具体发现复核通过，非全系统审计或像素验收。`.env` 与 `db/jobapp.db` 测试前后 SHA-256 一致，均仅使用隔离临时测试库。详细接口、独立 review、指纹与上线步骤见 `docs/ASSESSMENT_RESOURCE_IMPLEMENTATION_20261019.md`。真实商品/支付 SKU/网盘及首页推荐仍需配置，生产迁移、部署、真实支付、DevTools 编译及真机/小程序视觉验收均未执行。

- Codex（2026-10-19，测评资料首页三公司入口开发 PRD）：已完成 `docs/ASSESSMENT_RESOURCE_COMMERCE_PRD_20261008.md` V1.1 与本记录本条。按用户截图规定首页岗位机会之后、每日校招之前展示最多三家不同公司的资料，每家一份主推商品；补齐运营排序、商品直达、独立异步加载、首页接口草案、后台配置、DEV-01–09 开发依赖与验收。按 impeccable 界面规划规范沿用现有圆角列表形式；代码围栏、JSON 示例和定向差异检查通过。本轮仅文档，未修改业务代码、运行支付或发布。
- Codex（2026-10-19，求职快讯标题精简与加载反馈）：已完成 `miniprogram/package-content/pages/news/news.{js,wxml,wxss}`、`miniprogram/pages/resources/resources.js`、新增 `tests/newsPageState.test.js`、`tests/all.test.js` 与本记录。移除求职快讯页副标题并收紧标题到搜索区的间距，资源入口名称统一为“求职快讯”；修复加载中误显示 0 条和空列表，请求失败且无缓存时提供重试。专项及相关测试 61/61、小程序静态、JS 语法与差异检查通过；新版微信预览待验，未提交、上传或发布。
- Codex（2026-10-19，测评资料 1.0 规划精简）：已完成 `docs/ASSESSMENT_RESOURCE_COMMERCE_PRD_20261008.md`、归档 `docs/archive/ASSESSMENT_RESOURCE_COMMERCE_EXPANDED_DRAFT_20261008.md` 与本记录中的本条。按用户最新需求改为独立入口、公司关联、商品详情、购买后网盘链接/提取码交付及最小已购记录；历史扩展草案保留，阅读器/练习/OA 联动后置。已核对现有公司和支付模式；Markdown 代码围栏、文档链接及定向差异检查通过。本轮仅文档，未运行业务测试、开发、开启支付、提交或发布。
- Codex（2026-10-19，AI 历史侧栏实机适配）：已完成 `miniprogram/pages/ai-career/ai-career.{js,wxml,wxss}`、`miniprogram/package-ai/pages/ai-assistant/ai-assistant.{js,wxml,wxss}` 与本记录。按用户实机截图修复侧栏顶部微信胶囊避让、底部手势区留白和空状态可读性；两套 AI 页面共用动态胶囊下缘计算，侧栏宽度加像素上限。相关测试 69/69、小程序静态与差异检查通过；仍需用户在微信开发者工具重新编译后核对真机视觉。未提交、上传或发布。
- Codex（2026-10-16 至 19，AI 对话原型落地）：已完成 `miniprogram/pages/ai-career/ai-career.{js,wxml,wxss}`、`miniprogram/package-ai/pages/ai-assistant/ai-assistant.{js,wxml,wxss}`、新建 `miniprogram/utils/ai-chat-sessions.js`、相关测试与本记录。按已确认原型实现对话主页、全高历史抽屉、输入框工具面板、任务上下文提示及账号隔离的多会话保存恢复；新增历史搜索、重命名、删除和回答重试。AI 页面专项 75/75、JS 语法、小程序静态与 `git diff --check` 通过。完整 `check:release` 中 434 通过、2 项 Windows 跳过、1 项既有岗位源集成测试失败（JSearch 期望调用 9 次、实际 8 次，单独运行同样失败）；本轮未修改岗位源。尚未取得新版微信开发者工具真实截图；未提交、上传或发布。
- Codex（2026-10-16，机会页岗位列表紧凑化）：已完成 `miniprogram/pages/jobs/jobs.{wxml,wxss}`、`miniprogram/components/c-job-card/c-job-card.{wxml,wxss}`、`tests/{jobPresentation,frontendVisualCheckpoint}.test.js` 与本记录。按用户截图移除搜索下方职位类别快捷标签和“推荐岗位”标题，仅机会页岗位卡使用紧凑样式并将招聘期限移入标签行；相关测试 48/48、全量 430 通过/2 项 Windows 跳过、小程序静态与差异检查通过。尚未取得新版微信开发者工具截图，未提交、上传或发布。
- Codex（2026-10-16，首页视觉层级优化）：已完成 `miniprogram/pages/index/index.{wxml,wxss}`、`tests/frontendVisualCheckpoint.test.js` 与本记录。今日计划去除重复标题和内嵌卡，保留一个全宽主行动与最多两条次要待办；页面左右留白改为 28rpx，普通卡片去阴影，快捷入口统一浅蓝底色，申请进度零值弱化，校招行去重复徽标。岗位、待办和校招的入口与动态数据保持原逻辑。相关测试 56/56、全量 430 通过/2 项 Windows 跳过、小程序静态及差异检查通过；尚未取得新版微信开发者工具真实编译截图，未提交、上传或发布。
- Codex（2026-10-16，电脑预览上传简历连接拒绝）：已完成 `miniprogram/utils/app-config.js`、`tests/loginGate.test.js` 与本记录。微信开发者工具控制台显示开发版指向 `127.0.0.1:4400` 且本机无监听；模拟器现默认访问生产 HTTPS，仅在开发工具中设置 `devApiMode=local` 后才走 4400，真机/体验版保持生产 HTTPS。配置专项 9/9、全量 430 通过/2 项 Windows 跳过、小程序静态与差异检查通过；需重新编译预览验证真实上传，未提交/发布。
- Codex（2026-10-16，简历优化真机快速网络失败复查）：已补充 `miniprogram/package-career/pages/resume-center/resume-center.{js,wxml,wxss}`、`tests/resumeAttachmentFirst.test.js` 与本记录。用户实测约 1–3 秒失败，排除原 20/50 秒超时；线上 readiness 200、未登录优化 POST 预期 401，说明公网路由存在，但不代表真机请求成功。开发版现显示安全截断的 `request:fail` 细节、错误类别及耗时，专项 9/9、全量 430 通过/2 项 Windows 跳过、小程序静态与差异检查通过；待真机或开发者工具网络日志复现后定位具体连接层错误，未提交/发布。
- Codex（2026-10-16，首页校招岗位单行展示）：已完成 `miniprogram/pages/index/index.wxss`、`tests/frontendVisualCheckpoint.test.js` 与本记录。仅将校招岗位行改为单行省略，保留完整无障碍名称和详情入口；专项 15/15、小程序静态检查及 `git diff --check` 通过。390×844 自动截图因开发者工具 `ws://127.0.0.1:9420` 连接失败而未取得，旧首页基准也已登记为内容过时，不能声明像素门禁通过。未提交、上传或发布。
- Codex（2026-10-16，首页校招卡片信息层级）：已完成 `miniprogram/pages/index/index.{js,wxml,wxss}`、`tests/frontendVisualCheckpoint.test.js`、`.agents/skills/zhiyin-miniprogram-pixel-replica/references/screens.json` 与本记录。首页卡片按公司／岗位／届数·批次·地点三层展示，去掉可见和无障碍名称中的飞书来源，不改来源数据、列表接口与详情跳转。微信开发者工具重新打开项目并编译后，模拟器实际校招记录的三层顺序与无来源文案已目视确认；相关 68/68，全量 430 通过/2 项 Windows 跳过，AI 质量、小程序静态及数据检查通过（0 错误/5 项既有提示），`git diff --check` 通过。旧首页原型图已登记为内容过时；重启前的旧模板 390×844 截图对旧基准差异 15.86%，重启后自动化端口未恢复，因此不能声称新版像素门禁通过。未提交、上传或发布。
- Codex（2026-10-16，简历 AI 优化反馈与超时）：已完成 `miniprogram/package-career/pages/resume-center/resume-center.{js,wxml,wxss}`、`miniprogram/utils/api-v4.js`、`services/v4ResumeCenter.js`、`tests/resumeAttachmentFirst.test.js` 与本记录。点击立即显示进度和按钮状态，失败弹出原因并保留页内提示；优化请求 50 秒，服务端模型单次 35 秒后走现有安全降级，避免客户端 20 秒先于服务端返回。AI 结果只生成待确认建议，不自动改原简历。专项 9/9、`check:release` 430 通过/2 项 Windows 跳过，AI 质量/小程序静态/数据检查通过（数据 0 错误、5 项既有提示），JS 语法和差异检查通过；真机视觉与线上模型仍待新版预览/发布后验收，未提交/发布。
- Codex（2026-10-16，首页今日待办与每日最新校招合并）：占用 `miniprogram/pages/index/index.{js,wxml,wxss}`、`tests/{checkpoint8,navigationConfig,frontendVisualCheckpoint,publicDataReliability,campusContent}.test.js` 与本记录。主行动与剩余待办合并为单卡，沿用原任务完成/跳转入口；求职动态换成接口最新校招批次的真实日期、总数及前三条。线上公开接口只读核对最新批次 2026-10-15 共 51 条；相关测试 81/81，全量 428 通过/2 项 Windows 跳过，小程序静态检查、AI 质量、数据检查（0 错误/5 条既有警告）通过。开发者工具 390×844 实图已取得并检查首屏，但旧 `home-approved.png` 已被登记为内容过时，本轮旧基准像素门禁 16.1% 未通过，不能声称与旧原型像素一致；待 Human 确认新首页基准。未提交、上传或发布。
- Codex（2026-10-16，AI 上下文侧栏与对话布局）：已完成 `miniprogram/pages/ai-career/ai-career.{js,wxml,wxss}`、`miniprogram/package-ai/pages/ai-assistant/ai-assistant.{js,wxml,wxss}` 的内容高度侧栏、紧凑工具菜单、空历史区隐藏、底栏遮挡修复及新对话清空确认；保留对话和工具业务路由。全量 428 通过/2 项 Windows 跳过、`check:miniprogram`、JS 语法和 `git diff --check` 通过；微信开发者工具真机视觉验收待执行，未提交/发布。
- Codex（2026-10-16，手机开发版登录网络连接失败）：占用 `miniprogram/utils/app-config.js`、`tests/loginGate.test.js` 与本记录。仅修正开发版 API 地址选择：真机使用线上 HTTPS，开发者工具模拟器保留本机接口；不更改登录协议、token 或后端。风险是环境识别错误导致请求进入错误环境；配置专项 9/9、全量 428 通过/2 项 Windows 跳过、小程序静态检查和线上 readiness 通过。真实微信手机登录仍需重新生成预览包后验收；未上传或发布。
- Codex（2026-10-15，公司资料空列表及开发版公开请求修复）：`miniprogram/utils/api-companies.js`、`miniprogram/package-user/pages/companies/companies.{js,wxml,wxss}`、`miniprogram/utils/{share,feature-flags}.js`、`tests/publicDataReliability.test.js`。开发版公开公司、分享配置和功能开关读取使用线上内容接口；公司请求失败显示可重试错误。线上公司接口核对为 76 家，专项 16/16、全量 428 通过/2 项 Windows 跳过、小程序静态检查通过；尚未微信预览或发布。
- Codex（2026-10-15，机构测评空列表修复）：`miniprogram/utils/api-agencies.js`、`miniprogram/pages/agencies/agencies.js`、`miniprogram/pages/agencies/agencies.wxml`。开发版公开机构读取改走线上内容接口，请求失败显示重试；线上接口核对为 56 家，`check:miniprogram` 与 JS 语法检查通过。尚未微信预览或发布。
- Codex 统一发布 AI 页面收尾与简历隔离（2026-10-15，完成待统一发布）：两个 AI 对话页停止无 token/部分 token 生成均直接结束，不触发备用 AI、不卡 loading；换号后有流/无流均清理旧对话、简历和申请材料 Page.data，异步旧结果不回填，同账号令牌轮换保留草稿。两套简历版本工具及 AI/JD/题目/职位/资料页只读账号作用域简历，不再认领无归属的旧全局 `onlineResume`；题目 AI 训练缓存、收藏/已做状态与 AI Tab 待消费上下文亦按账号隔离，并拦截迟到训练回包。专项 `releaseAuthConcurrency` 19/19、`aiResumeOwnerIsolation` 6/6；最终 `npm run check:release` 427 通过、2 项 Windows 环境跳过，AI/miniprogram 检查通过、data 0 错误 5 条既有警告；`npm run check:acceptance -- --no-report` 29 通过、1 条既有岗位种子警告。未提交/推送/部署。

- Codex 统一发布安全阻塞第二轮（2026-10-15，代码完成，待独立复核）：占用 `miniprogram/{app.js,utils/api-user.js,utils/auth-session.js,pages/ai-career/ai-career.js,package-ai/pages/ai-assistant/ai-assistant.js}`、新增 `tests/releaseAuthConcurrency.test.js`、`tests/all.test.js` 与本记录。两路 AI 直连流式请求固定发起时 token+登录世代，迟到 401/成功、待刷新的 delta 和备用通道均不得更新新会话，失效流从页面移除；静默校验只在明确 401 清理，临时网络/超时/429/500 保留有效登录态，兼容请求层已先清 token；微信/手机号登录共享最新尝试序号，登出/注销会令 pending 登录失效，旧回包不得覆盖新账号。第二轮专项 7/7；`check:release` 409 通过/2 Windows 环境跳过、AI 质量 7/7、小程序静态/包体和数据检查通过（0 错误/5 既有提示）；Acceptance 29 通过/1 既有岗位详情种子提示；`git diff --check HEAD` 通过。未做真实微信双账号/流式联调；未提交、推送、部署或执行旧 `recruitment-*.sh` 脚本。

- Codex 统一发布安全阻塞修复（2026-10-15，代码完成，待独立复核）：占用 `miniprogram/utils/{api-client,auth-session,api-user,api-feishu-content,api-jobs}.js`、`miniprogram/app.js`、登出/注销/AI 鉴权过期页面、`tests/{publicDataReliability,jobPresentation}.test.js` 与本记录。账号 GET 内存缓存、飞行中请求和限流按不含 JWT 的登录世代及端点隔离；旧账号迟到成功/401 不回填或清除新登录态；写请求默认不重放，显式幂等重试固定原账号且切号取消。第三方公开内容不带 Authorization；指定国家职位主源失败不使用无法验证国家的飞书兜底。高风险登录/鉴权与职位源专项 20/20 通过，含 A→B→A、迟到写成功、POST 不重放及跨路由 429；`check:release` 402 通过/2 Windows 跳过、AI 质量 7/7、小程序静态/包体、数据 0 错误/5 既有提示；Acceptance 29 通过/1 既有岗位详情种子提示；`git diff --check HEAD` 通过。未提交、推送、部署或执行旧 `recruitment-*.sh` 脚本。

- Codex merge_backend_impl（2026-10-14，隔离工作树 `codex/merged-backend-release-20261014`）：占用 `routes/jobs.js`、`scripts/healthcheck.js`、`services/feishuCompanyImport.js`、`deploy.sh`、`tests/releaseEngineering.test.js`、`tests/smoke.test.js`、`docs/JOB_CAMPUS_DATA_PROVENANCE_CONTRACT.md` 与本记录；选择性保留线上招聘版新增的近期岗位过滤、RemoteOK 地图覆盖及 Feishu 请求重试，同时保留目标版本全局岗位默认与发布安全门禁。历史岗位详情保留且标注时效风险、Feishu 非暂态错误不重试且错误信息脱敏、缺失共享配置拒绝发布，TCP 拒绝后的 readiness 重试已覆盖；文档说明全球产品定位不等于现有源覆盖全球本地职位。`check:release` 369 通过/2 Windows 跳过、Acceptance 29 通过/1 旧种子近期岗位不足的警告、Git Bash `bash -n deploy.sh` 与 `git diff --check` 均通过；仅本地合并，未提交、推送或部署。

- Codex 统一发布候选整合（2026-10-15，代码完成，待独立复核）：占用本轮现有 29 个已修改文件、5 个未跟踪文件及本记录；原工作区已保存为可恢复 stash `82a7839c6702472b782ace5dea35722bb93d6e15`（未 pop），从全球职位源后继 `531a201` 建立 `codex/unified-release-20261015`。冲突仅在本记录、`routes/jobs.js`、`tests/smoke.test.js`；状态记录保留双方历史，后两者采用较新的全球职位源实现，`tests/all.test.js` 保留新增两个专项注册。附件上传、登录隔离及公开数据由全量 393 通过/2 Windows 跳过、AI 质量 7/7、小程序包体/数据检查与 Acceptance 29 通过/1 既有近期岗位种子告警验证，`git diff --check HEAD` 通过。三份未跟踪招聘脚本含旧版一次性切流/删除逻辑，保留在工作区和 stash 中供追溯，不纳入统一发布入口或提交；不得执行。未提交、推送、部署、上传或写入生产库。

- Codex 发布候选整合预检（2026-10-15，待集成）：本轮仅占用本记录此行，梳理 29 个已修改及 5 个未跟踪文件；全球职位源分支 `531a201` 是当前 `362d395` 的后继，应以其为最终基底。当前脏版本的 `routes/jobs.js`、`tests/smoke.test.js` 是已在后继提交中加强的旧实现，不应覆盖新版本；`tests/all.test.js` 新增两个专项测试注册须保留。当前工作区 `check:release` 375 通过/2 Windows 跳过，AI 质量和小程序检查通过，内容 0 错误/5 既有警告，`git diff --check` 通过；忽略规则涵盖环境文件、数据库、上传物和微信私有配置，未发现新文件含常见私钥/API Token 形态。三份未跟踪招聘脚本为一次性上线操作记录，含定向删除与切流逻辑，需评估是否纳入发布提交但不得作为本次统一发布入口。未切分支、提交、推送、部署或上传；待独立验证后确定同版发布方案。

- Codex 公开数据可靠性修复（2026-10-15，代码完成）：修改 `miniprogram/utils/{app-config,api-client,api-campus,api-jobs}.js`、`miniprogram/pages/index/index.{js,wxml,wxss}`、新增 `tests/publicDataReliability.test.js` 并接入 `tests/all.test.js`。公开校招列表/筛选/详情与聚合岗位/详情从线上公开接口匿名读取，登录、简历和用户写入仍走开发环境本机服务；GET 缓存与限流按来源及鉴权范围隔离，匿名 401 不清除登录态。首页区分网络失败与真实空列表并支持立即重试，失败不缓存 5 分钟。线上公开接口只读抽样可返回数据；专项 6/6、全量 375 通过/2 Windows 跳过、`check:miniprogram` 与 `git diff --check` 通过。未运行微信开发者工具截图、未上传小程序、未提交/推送。

- Codex 资源页副标题精简（2026-10-15，代码完成）：仅修改 `miniprogram/pages/resources/resources.{wxml,wxss}`、`design-system/zhiyin-career/pages/resources.md`、资源页相关的 `tests/{navigationConfig,frontendVisualCheckpoint}.test.js` 与本记录此行。按 Human 截图移除资源列表及“我的已购”的可见副标题，并按再次澄清彻底去除资源卡片中的“适用阶段”文案（包含无障碍名称），保留资源名称与 104rpx 触控行高。相关测试 43/43、`check:miniprogram`、`git diff --check` 通过；开发者工具 CLI 已以唯一项目路径成功编译预览，总包 2.1 MB，未上传正式版；自动化端口 9420 不可连接，未取得模拟器截图，视觉验收待完成；未提交或发布。

- Codex Tab 文案调整（2026-10-14，已完成）：修改 `miniprogram/app.json`、`miniprogram/custom-tab-bar/index.js`、`tests/{checkpoint8,navigationConfig}.test.js`、`PRODUCT.md`、`design-system/zhiyin-career/pages/tabs-and-context-ai-pixel-spec.md` 与本记录；按 Human 审核要求仅将第二个 Tab 的“找岗位”改为“机会”，不更改页面标题、路由和业务逻辑。导航专项 41/41、`check:miniprogram` 与 `git diff --check` 通过；待开发者工具重新编译目视确认，未上传体验版或提交审核。

- Codex 修正简历附件动作（2026-10-14，代码完成）：修改 `miniprogram/package-career/pages/resume-center/resume-center.{js,wxml}`、`tests/resumeAttachmentFirst.test.js`、本记录。把“导入简历”和“AI 优化”分开；从历史版本恢复旧服务缺失的附件关联；创建前服务端复查，失败时禁止盲目创建。旧重复记录只标记不删除。专项 7/7、`npm run check:release` 通过（369 通过、2 Windows 跳过）；未运行微信开发者工具真实交互、未部署生产，本地 4400 旧进程仍需手动重启以加载后端幂等保护。

- Codex 附件优先简历中心（2026-10-14，代码完成）：修改 `miniprogram/package-career/pages/resume-center/`、`miniprogram/utils/api-v4.js`、`routes/v4/resumes.js`、`services/v4ResumeCenter.js`、`tests/resumeAttachmentFirst.test.js`、`tests/all.test.js`；接通 PDF 上传、解析、来源关联、AI 建议确认及浅色界面。扫描件不生成空简历；重复导入幂等；附件仅允许所属用户关联；AI 不改写附件元数据。专项 5/5、`npm run check:release` 通过（367 通过、2 Windows 跳过）；未做微信开发者工具真机/截图验收，未部署生产。本机 4400 旧服务重启受环境策略阻止，联调前需在原终端手动重启。

- Codex 招聘接口开放（2026-10-14）：占用 `routes/jobs.js`、`tests/smoke.test.js`、`scripts/recruitment-{preflight,cutover,cleanup}.sh` 与本记录此行。官网岗位列表和地图接入 RemoteOK，并排除过期职位；职位详情支持实时 ID。隔离快照预检列表 10 条、地图 99 条、详情 200；官网候选版同 ID 200。生产先备份数据库、核验 PM2 PID/物理目录后切流，启用 `recruitment` 单一开关，公网列表 10 条、地图 99 条且过期 0 条，详情 200。后端全量 362 通过/2 Windows 跳过；无数据库迁移。发布版本：后端 `recruitment-20261014-1791949367110`，官网 `recruitment-20261014-1791949367110-site-v2`。切流前数据库备份已保存至服务端 `/var/lib/jobapp-server/backups/`，无效候选版及预检快照已清理。

- Codex deploy_guard_impl（2026-10-14）：占用 `deploy.sh`、`scripts/backup-production.sh`、`scripts/verify-pm2-instance.js`、`tests/releaseEngineering.test.js` 与本记录此行；修复 PM2 JSON 静默输出，分别保留原始 `current` 链接与 PM2 实际物理版本，切流前复核旧 PID/4400 监听者。`current` 用同目录临时软链接及 `mv -Tf` 原子替换；切流期间的 EXIT/INT/TERM 守护可在失败或中断时分别恢复旧进程与旧链接，PM2 身份辅助脚本固定新版本绝对路径。Linux 隔离假 PM2 故障注入覆盖新进程启动失败、健康检查失败及 TERM，三种错位回滚均通过；临时测试目录已清理。本地/远端 `bash -n`、聚焦 7 通过/2 Windows 跳过、全量 362 通过/2 Windows 跳过、`check:release`、`git diff --check` 通过；未执行生产部署、提交或推送。

- Codex CI 收口（2026-10-14）：占用 `tests/sprint4CareerCoach.test.js`、`tests/sprint5Networking.test.js` 与本记录；Linux CI 的两条旧资源页文案断言与当前已确认的资源分类不一致，只更新断言到当前产品结构，不变更业务实现。

- Codex 视觉验收（2026-10-14）：占用 `.agents/skills/zhiyin-miniprogram-pixel-replica/scripts/capture-and-compare.js` 与本记录；开发者工具已登录且 automation 端口可连接，但固定 8/15 秒操作超时导致视口、fixture 或导航中断。本轮仅允许增加可配置等待时间，不更改基准 PNG、差异阈值或遮罩。

- Codex release 集成（2026-10-14）：占用 `.gitignore` 与本记录新增行，整理当前工作区安全提交；仅排除本地 `artifacts/` 运行数据及根目录微信开发者工具配置，保留业务代码和设计基准。

- Codex（2026-10-14）：按 Human 最新截图调整资源页，顺序接续已完成的 ui_impl 视觉改动；范围 `miniprogram/pages/resources/resources.{js,wxml,wxss}`、资源页相关断言所在 `tests/{frontendVisualCheckpoint,navigationConfig,mobileWorkflow,checkpoint7}.test.js` 与本记录。已移除资源分类切换条，在同页展示全部 9 个可用入口及未开放的“我的已购”，精选卡片改为图文同排并缩短；搜索覆盖全部资源，原有目标上下文与题型参数传递保留。相关回归 94/94、`check:miniprogram`、`git diff --check` 通过；待微信开发者工具视觉复核，未改底部主导航，未提交/发布。

- Codex ui_impl（2026-10-14）：占用 `miniprogram/pages/ai-career/ai-career.{wxml,wxss}`、`miniprogram/custom-tab-bar/index.wxss`、`miniprogram/pages/index/index.{js,wxml,wxss}`、`miniprogram/pages/{jobs,resources}/*.wxss`、`miniprogram/utils/{app-config,feature-flags,data-provenance}.js`、`tests/{checkpoint8,frontendVisualCheckpoint,campusContent}.test.js`、`.agents/skills/zhiyin-miniprogram-pixel-replica/references/screens.json` 与本记录此行；会员缓存/失败关闭、AI 侧栏与网申触控语义、辅助文字对比度和缓存时效修复完成。聚焦测试 37/37、`check:miniprogram`、Impeccable 检测（空结果）与 `git diff --check` 通过；390×844 微信截图叠加由发布验收执行，扩充内容与旧首页原型基准存在明确冲突。不占用发布脚本或 `tests/all.test.js`，未替换已确认原型图，未提交/推送。

- Codex release_impl（2026-10-13 至 14）：占用 `tests/checkpoint7.test.js`、`tests/releaseEngineering.test.js`、`tests/all.test.js`、`scripts/backup-production.sh`、`scripts/verify-pm2-instance.js`、`deploy.sh`、`server.js`、`.github/workflows/test.yml`、`.github/workflows/deploy.yml`、`docs/production-deploy.md` 与本记录顶部；已修复过期页面断言、备份失败误报、发布前隔离快照/只读迁移状态门禁、候选与切流监听进程身份校验/回滚及 CI。切流后从物理 release 执行 PM2，`/current` 别名拒绝冒充新实例。上轮全量测试 352 pass/1 Windows-only skip、Acceptance 30/30；最后一项修改后的聚焦测试 6 pass/1 Windows-only skip、Shell 语法与差异检查通过。生产 Nginx 实际配置路径须设置 GitHub production Environment 变量 `PRODUCTION_NGINX_CONFIG_PATH`。生产 migration 状态与真实 Linux 备份/部署仍待人工验证；公网 API 404 将阻止发布并触发回滚。未执行生产迁移 apply、生产部署、共享库写入或 Git 提交。

- Codex（2026-10-13）：首页内容密度优化代码完成，待 390×844 微信开发者工具截图验收，未提交/发布。范围 `miniprogram/pages/index/index.{js,wxml,wxss}`、`miniprogram/package-ai/pages/jd-match/jd-match.js`、对应导航/视觉/校招内容测试及本记录；增加常用功能、最多两条真实且近期发布的岗位、校招动态，保留当前蓝白视觉与原有业务入口。专项测试 46/46、`check:miniprogram`、布局检测与 `git diff --check` 通过；全量测试 346/347，唯一失败为既存 `checkpoint7.test.js:149` 仍断言“我的申请”，与当前“我的”页面结构冲突。开发者工具 CLI 服务端口关闭，尚未完成编译截图及原型叠加，不视作视觉验收通过。

- Codex（2026-10-13）：按首页截图收紧“今日重点”和“申请进度”卡片：主行动卡最小高度由 276rpx 调至 218rpx，进度卡由 226rpx 调至 174rpx；同步压缩内部留白，保留主按钮及“查看全部”的 88rpx 点按高度。`check:miniprogram`、首页视觉与导航专项 37/37、`git diff --check` 通过；尚待微信开发者工具实机视觉复核，未提交/发布。

- Codex（2026-10-10）：恢复小程序旧版视觉语言、悬浮 TabBar 与上下文 AI 入口。范围 `miniprogram/custom-tab-bar/*`、五个一级页面 WXSS、`components/c-job-card`、`package-ai/pages/ai-assistant/*` 及相关导航/视觉测试；保留五 Tab、申请工作流和数据库隔离，不回退业务结构。状态：代码完成；336/336 全量测试、30/30 Acceptance、`check:miniprogram` 与 `git diff --check` 通过，主数据库指纹未变；待微信开发者工具人工视觉验收。

2026-09-20 Codex：Web P0 完善（代码与隔离验收完成，未提交/部署），范围 `public/web/*`、AI 会话 service/route、新增 Web 登录衔接 service/route、`server.js`、V4 申请/简历路由、小程序设置页、隔离 API/浏览器测试与 Web 开发文档。风险：登录衔接仅允许已登录的小程序用户生成短期一次性凭证，不按未核验的邮箱/手机号合并账号；验证过期/重放/匿名拒绝。上传复用已有 PDF 文件头和大小检查；简历新版本验证归属与并发冲突，AI 验证跨申请/退出隔离。全部测试使用临时数据库，不调用真实模型，不修改生产数据。

- Codex（2026-09-20）：校招关注未展示在收藏的问题已修复；用户确认点击“加入关注/截止提醒”，原操作只存提醒。范围 `miniprogram/utils/favorites.js`、`miniprogram/package-content/pages/campus-detail/campus-detail.js`、`miniprogram/package-user/pages/favorites/favorites.js`、`tests/mobileWorkflow.test.js` 和本文件。关注成功或本地兜底均加入校招收藏，取消提醒保留收藏；进入收藏页导入本机旧关注及账号有效云端提醒，导入标记/删除 tombstone 防止取消收藏后反复恢复。默认展示最近收藏所属分类，异步刷新保留手动选择；排序使用 iOS 安全日期解析。专项 30/30、隔离库全量 250/250 与 `check:release` 通过，保留原 3 项支付静态提示。未执行真机 E2E、尚未发布；重新编译进入收藏页触发历史关注补入（仅本地保存且已清缓存的数据无法恢复）。

- Codex（2026-09-20）：微信上传检查“主包未使用 JS：utils/application-materials.js”已修复。该工具仅被 AI 助手与申请材料页使用，已迁移至 `miniprogram/package-ai/utils/application-materials.js`，同步两页引用及工具的公共 API 引用；范围为上述三个 JS 文件与本记录。仅调整分包归属，功能不变。导航/移动流程 45/45、小程序静态检查（含 require 路径）通过，主包估算降至 1.00 MB；待开发者工具重新编译复查上传质量检查，尚未上传。

- Codex（2026-09-20）：首页校招截止日期 `10.25` 的 iOS 解析警告已修复。范围 `miniprogram/pages/index/index.js`、新增 `miniprogram/utils/campus-deadline.js`、`tests/campusContent.test.js` 和本文件。优先使用接口规范日期；短日期按招聘年份/开始日期推断，兼容跨年、闰年，非法日期和非日期说明保持原文；按北京时间计算剩余天数，不把原始文本交给 Date。同步更新校招排序的 SQLite 时间解析、升级首页缓存版本。专项测试 54/54、小程序静态检查通过；未运行微信真机 E2E、未发布，重新编译后验证。

- Codex（2026-09-20）：小程序 API 排查修复已完成。范围 `services/v4TodayTasks.js`、相关测试、`miniprogram/utils/daily-tasks.js`、`util.js`、`jd-match.js`、`pages/index/index.js`、`components/home-campus-updates/*`、API 巡检脚本与记录。Today 跨天/重复键冲突已定点发布，官网精确 CORS 域名已补齐并备份。公网 58 项查询：56 正常、2 招聘关闭；Today 同步/重复请求均 200，历史保持正确。隔离库 `check:release` 243/243 及各检查通过。未改鉴权/支付核心或数据库结构；iOS 日期与 WXSS 修复在本地小程序，尚未发布。详见 `docs/API_AUDIT_20260920.md`。

- Codex（2026-09-20）：资源中心流程工具去掉文字图标、降低卡片高度，内容与服务改用历史时钟、资讯报纸、机构评分、指南书本四个本地图形图标。范围 `miniprogram/pages/resources/resources.{js,wxml,wxss}`、`miniprogram/images/resource-*.png` 和本文件；已完成，定向测试 45/45、`check:miniprogram` 通过（媒体 196.0 KB），20 组浏览器静态排版与图片解码检查通过，未进行微信真机验收、未发布。

- Codex（2026-09-20）：按用户补充要求恢复“我的简历”图标，个人记录改为四列（简历、收藏、消息、我的面经），直达现有简历页。范围 `miniprogram/pages/profile/profile.{js,wxml,wxss}`、`tests/navigationConfig.test.js` 和本文件；已完成，导航检查 23/23、`check:miniprogram` 通过，未发布。

- Codex（2026-09-20）：“我的”去除与资源中心重复的工具和资产入口，保留个人资料、会员、收藏、消息、我的面经与账号服务。范围 `miniprogram/pages/profile/profile.{js,wxml,wxss}`、`tests/navigationConfig.test.js` 和本文件；已完成，定向 45/45 和小程序检查通过，未发布。

- Codex（2026-09-20）：资源中心紧凑布局，将纵向全部展开改为分类切换、双列工具和四列服务入口。范围 `miniprogram/pages/resources/resources.{js,wxml,wxss}`、`tests/mobileWorkflow.test.js`、`tests/navigationConfig.test.js` 和本文件；已完成，专项测试 45/45、小程序静态检查和 20 组浏览器静态排版检查通过，未进行微信真机验收、未部署。

- Codex（2026-09-16）：恢复首页三个 Banner 轮播，并恢复首页会员权益入口（位于今日求职计划之后）；后台 Banner 不足时补齐岗位、校招、AI 面试默认 Banner。范围 `miniprogram/pages/index/index.js`、`index.wxml`、测试与文档；已完成，定向测试 43/43、`check:miniprogram` 通过。

2026-09-16—2026-09-18 Codex：`routes/ai-conversations.js`、`services/aiConversations.js`、`db/migrations/0007_ai_conversations.sql`、`server.js`、`public/web/app.js`、Web 隔离测试及开发文档。任务：Web AI 服务端会话、上下文和失败/取消恢复；已完成。

风险与验证：新增会话表仅增量建表，不改现有业务表；隔离库验证重复执行、事务、跨用户拒绝、重复 requestId 幂等、失败和取消状态、AI 结果未经确认不写入申请。`node --check`、Web 专项 4/4（含隔离 API 11/11）、数据库迁移 5/5、AI 质量 7/7 通过；旧 `/api/ai/assistant` 保持兼容。真实模型和生产部署待后续验收。

- Codex：按用户最新要求恢复第四位资源中心 Tab，并按求职流程整合 AI 专家工具。范围 `miniprogram/app.json`、`custom-tab-bar/index.js`、`utils/navigation.js`、`utils/util.js`、`package-ai/pages/ai-assistant/ai-assistant.js`、`pages/resources/*`、`tests/navigationConfig.test.js`、`tests/mobileWorkflow.test.js` 与 P0/5.0 规划文档；已完成，237/237 与 `check:release` 通过，未部署。

- Codex（2026-09-16）：首页 Banner 移至搜索下方、今日计划上方，间距改为 Banner 下方留白；范围 `miniprogram/pages/index/index.wxml`、`index.wxss` 和本文件；已完成，`check:miniprogram` 和定向 `git diff --check` 通过，未部署。

- Codex（2026-09-16）：申请详情加载/保存/状态更新可靠性；范围 `miniprogram/package-user/pages/application-detail/*`、`tests/mobileWorkflow.test.js`、本文件和 `docs/V5_P0_MOBILE_WORKFLOW_20260915.md`；已完成，全量 234/234 与发布检查通过，未提交、未部署。

- Codex：撤回重复首页待办卡；范围 `miniprogram/pages/index/index.{js,wxml,wxss}`、`tests/navigationConfig.test.js`、`docs/V5_P0_MOBILE_WORKFLOW_20260915.md` 和本文件；已完成，导航回归 21/21、`check:miniprogram` 和定向 `git diff --check` 通过，未提交、未部署。

5.0 P0 移动闭环（2026-09-15，Codex 本批已完成）：岗位列表/详情、公共岗位卡片、申请状态工具、进度页、我的资源入口及专项测试已完成，释放占用。本批仅复用现有 V4 API，未修改 Web、后端路由和数据库。

| 负责人 | 文件 | 任务 | 状态 |
|---|---|---|---|
| Codex | `routes/v4/applications.js`、`services/v4Application*.js`、`public/web/*`、Web 专项/浏览器测试、开发文档和修改记录 | Web 第二批（2026-09-15）：表格/看板、精确筛选/排序/分页、批量预览/更新/撤销、工作区聚合、关联隔离和安排保存 | 已完成本批；隔离 API 场景 7/7、前端数据检查 3/3、Edge 浏览器验收通过；发布检查 214/214、AI 矩阵 7/7、小程序检查通过；未做真实微信 E2E，未推送/部署 |
| Codex | `public/web/index.html`、`public/web/styles.css`、`public/web/app.js`、`server.js`、`routes/ai.js`、`tests/webWorkbench.test.js`、`docs/WEB_APPLICATION_WORKBENCH_DEVELOPMENT_PLAN_20260914.md`、`CHANGELOG_AI.md` | Web 用户侧首个可运行版本：登录/注册、工作台、申请看板首版、关键词/状态筛选、申请详情状态变更、Today 任务完成和 AI 专家连续问询；传递公司、岗位和申请标识并同步勾选开发文档 | 已完成；`node --check`、全量 209/209 tests、`git diff --check` 通过；真实浏览器/微信双端验收待 Human |
| Codex | `miniprogram/package-career/pages/career-coach/*`、`tests/sprint4CareerCoach.test.js`、开发记录 | 修复竞争力陪跑登录按钮只更新状态、未挂载登录弹层而无响应 | 已完成；专项 6/6、全量 204/204、发布检查和微信 CLI preview 通过 |
| Codex | `miniprogram/package-career/pages/career-coach/career-coach.json`、`tests/sprint4CareerCoach.test.js`、开发记录 | 修复竞争力陪跑分包页面在按需注入时将 AI 说明组件解析为 `wx://not-found` | 已完成；专项 6/6、全量 204/204、发布检查和微信 CLI preview 通过 |
| Codex | `miniprogram/utils/date-time.js`、`miniprogram/utils/favorites.js`、`tests/sprint8Reliability.test.js`、开发记录 | 修复收藏同步解析 SQLite 日期时的 iOS 兼容警告，并保持 UTC 排序语义 | 已完成；专项 7/7、全量 204/204 与发布检查通过；未运行真实 E2E，未部署 |
| Codex | `routes/notify.js`、`services/v4TodayTasks.js`、Sprint 8 schema/migration、收藏请求工具、专项测试和文档 | Sprint 8：提醒派发幂等与有界并发、Today 跨设备增量同步、收藏统一请求层与离线补传 | 已完成；全量 202/202 与发布检查通过；真实验收和生产 migration 待 Human，不推送、不部署 |
| Codex | 商业套餐/权益/额度账本、退款审计、运营告警、会员小程序页、Sprint 7 migration/测试/文档 | Sprint 7：Free/Pro/场景包、统一商业账本、Mock 支付与退款一致性、可暂停灰度及异常告警 | 已完成；195/195 tests 与 `check:release` 通过，真实支付与外部退款保持关闭，不运行真实 E2E，不推送、不部署，生产 migration 待 Human |
| Codex | OA/Project Builder/Job Trust V4 数据表、服务、路由、小程序页面、专项测试和文档 | Sprint 6：OA 计划/计时/错题/统计，证据导向项目里程碑/交付物/验收/真实成果确认，以及可追溯岗位可信度评分 | 已完成；190/190 tests 与 `check:release` 通过，不调用真实 AI，不运行真实 E2E，不推送、不部署，生产 migration 待 Human |
| Codex | Networking V4 数据表/服务/路由、Today 关联、小程序 Networking 页面、专项测试和文档 | Sprint 5：联系人 CRM、五类可编辑草稿、跟进提醒、Referral 漏斗及岗位/简历/申请关联 | 已完成；182/182 tests 与发布检查通过，只生成/保存/复制草稿，不自动外发，不调用真实 AI，不运行真实 E2E，不推送、不部署 |
| Codex | `miniprogram/package-career/pages/career-coach/*`、`tests/sprint4CareerCoach.test.js`、开发记录 | 修复竞争力陪跑将 401、网络错误和残缺响应误渲染为空白的问题 | 已完成；专项 6/6、全量 203/203 与发布检查通过；未运行真实 E2E，未部署 |
| Codex | Job Match、V4 简历中心/材料、面试空间/报告、Today 回写、小程序对应页面、专项测试与文档 | Sprint 3：可行动岗位分层、JD 定制简历确认式新版本、Interview Brief 与弱项复练闭环 | 已完成；170/170 tests 与发布检查通过，不调用真实 AI，不运行真实 E2E |
| Codex | `db/migrate.js`、`db/migrations/`、数据库迁移/备份演练脚本、相关测试与文档 | Sprint 2.5：建立 schema migration baseline，在隔离数据库验证备份、迁移、幂等、失败事务、恢复与回滚 | 已完成自动化与隔离演练；生产 baseline 登记待 Human，不运行真实 E2E |
| Codex | `services/v4AiRuntime.js`、`services/v4Agents.js`、AI 路由、`utils/aiSafety.js`、匿名样本/门禁辅助程序、测试/脚本/文档 | Sprint 2.4：AI 异常矩阵、PII/真实性/确认写入/额度质量门禁 | 已完成自动化基线；真实供应商 staging 抽样待 Human，不运行真实 E2E |
| Codex | `utils/funnelAnalytics.js`、Analytics/职位/简历/申请/面试路由与服务、运营漏斗、小程序埋点、相关测试/文档 | Sprint 2.3：统一求职漏斗事件与 `refs`，隔离 production/demo/test/system 数据 | 已完成；兼容式 Analytics 加列，不运行真实 E2E |
| Codex | `utils/dataProvenance.js`、职位/校招路由与格式化器、小程序职位/校招适配与相关测试/文档 | Sprint 2.2：统一数据来源、更新时间、过期与失败降级口径，停止伪造本地职位新鲜度 | 已完成；发布检查通过，未运行真实 E2E，未推送、未部署 |
| Codex | `utils/coreEntityRefs.js`、`utils/applicationStatus.js`、V4 核心数据路由/服务、相关测试和 Sprint 2 文档 | Sprint 2 第一批：统一核心对象关联 ID 与申请状态输出，修复岗位 ID 双轨造成的跨模块错链 | 已完成；默认不运行真实 E2E |
| Codex | `scripts/run-campus-sync.sh`、`scripts/merge-campus-env.js`、`.env.example`、校招同步脚本与测试 | 将新校招表持续同步至职引官网生产共享数据库，隔离营销飞书配置并修复定时任务 Node/数据库路径 | 已完成；生产写入 11,467 条，131/131 tests、公网 API 和真实官网页面显示 8 月 10 日最新记录 |
| Codex | 小程序 `components/c-ai-disclosure/*`、模拟面试设置/对话/报告页面、`tests/favoriteReminder.test.js`、`scripts/check-miniprogram.js` | 统一缩小所有 AI 提示条，增加左右安全留白并清理三处重复旧样式 | 已完成；130/130 tests、AI 提示专项 4/4、小程序检查通过 |
| Codex | `.env.example`、`scripts/sync_feishu_server.js`、小程序校招首页/列表/详情与相关测试 | 使用“职引睿选”飞书应用持续同步新校招 Base 指定视图，移除客户端旧飞书代理数据优先级，并修正招聘年度推导 | 已完成；新表全量同步写入 11,439 条，129/129 tests、小程序检查和数据检查通过 |
| Codex | `miniprogram/images/logo_google.png`、`scripts/check-miniprogram.js` | 按微信开发者工具实际规则压缩媒体总量，并增加一致的本地防回归检查 | 已完成；媒体总量 191.2 KB，`check:miniprogram` 通过 |
| Codex | 小程序 `components/c-login-popup/*`、`tests/loginGate.test.js`、`scripts/check-miniprogram.js` | 增加清晰有效的关闭/暂不登录路径，并在拒绝手机号授权后返回当前页面，修复登录环节审核问题 | 已完成；128/128 tests、登录专项 4/4、小程序检查通过 |
| Codex | 小程序 `pages/resources/resources.js`、`resources.wxml`、`resources.wxss` 与资源中心回归测试 | 移除四个模块副标题，统一主题色标题胶囊，并将“内容与服务”改为独立卡片布局、修复底部白块 | 已完成；资源中心回归 14/14、小程序检查通过 |
| Codex | 校招数据表/接口/格式化器、小程序校招数据适配/首页/列表/详情、相关测试 | 修复首页仍显示 6 月 9 日旧校招：接入更新的飞书校招源，统一按同步更新时间排序并兼容飞书记录详情 | 已完成；127/127 tests、小程序检查、数据检查与线上飞书详情映射验证通过 |
| Codex | 小程序 `utils/api-jobs.js`、`package-user/pages/search/search.js` 与搜索回归测试 | 修复职位搜索因飞书职位源超时而长期停留在加载态：正式职位 API 优先、飞书并行兜底，并防止实时搜索的旧请求覆盖新结果 | 已完成；125/125 tests、小程序检查、数据检查、生产同链路搜索与微信预览通过 |
| Codex | 小程序职位展示适配工具、`components/c-job-card`、`pages/jobs/*`、`package-user/pages/search/*`、`package-user/pages/job-detail/*` 与回归测试 | 按产品说明重构职位列表卡片和职位详情信息架构，统一薪资、截止、标签、技能、匹配及缺省字段展示，同时保留收藏、详情跳转、投递看板和 AI 匹配链路 | 已完成；124/124 tests、小程序检查、数据检查与微信预览编译通过 |
| Codex | 小程序 `package-user/pages/search/search.js` 与导航回归测试 | 保留搜索输入防抖实时匹配，但仅在用户主动提交搜索时写入历史，并清理历史中的连续输入前缀碎片 | 已完成；120/120 tests、小程序检查、数据检查与微信预览编译通过 |
| Codex | 小程序 `package-career/pages/resume/resume.js`、`resume.wxml`、`resume.wxss` 与回归测试 | 修复在线简历手动编辑弹层中单行输入框高度压缩、无法稳定聚焦/回显及保存后列表不立即显示的问题，并统一工作、教育、项目和基本信息表单 UI | 已完成；119/119 tests、小程序检查、数据检查与微信预览编译通过 |
| Codex | 小程序普通页面 AI 提示、`utils/favorites.js`、职位列表/详情与提醒回归测试 | 移除非 AI 专属页面的顶部 AI 说明；职位收藏不再弹设置对话框，并按岗位截止日或默认 30 天自动开启提前 3 天和 1 天提醒 | 已完成；118/118 tests、小程序检查、数据检查与微信预览编译通过 |
| Codex | `routes/ai.js`、职业规划生成服务、小程序 `package-career/pages/career-planner/*`、测试与文档 | 将 AI 求职规划从关键词清单升级为包含技能标准、项目证据、阶段交付物、量化指标、每周节奏和风险应对的可执行方案 | 已完成；115/115 tests、小程序检查、微信预览、真实模型质量门禁与生产部署健康检查通过 |
| Codex | 小程序 `package-user/pages/profile-edit/*`、导航回归测试 | 压缩编辑资料页多选项的继续搜索入口并移至卡片右上角；毕业年份改为宽范围年份选择器 | 已完成；导航回归、全量测试、小程序检查和微信预览编译通过 |
| Codex | 小程序 `pages/resources/*`、`package-career/pages/career-planner/*`、导航回归测试 | 将隐藏的职业工具中心缺失功能并入资源中心，补充 AI 求职规划、Offer 对比和简历中心入口，并将规划页收口为单一功能页 | 已完成；导航回归、全量测试、小程序检查和微信预览编译通过 |
| Codex | `miniprogram/package-career/pages/resume/resume.wxml`、`resume.wxss`、页面回归测试 | 隐藏“我的简历”页面滚动条，并合并基本信息与个人优势卡片 | 已完成；页面回归、小程序检查和微信预览编译通过 |
| Codex | `services/v4AiRuntime.js`、`services/v4ResumeCenter.js`、`miniprogram/package-career/pages/resume-center/*`、`tests/`、`DEVELOPMENT_STATUS.md` | 修复 AI 简历润色误走 fallback、原文与建议相同及敏感/无意义字段被推荐的问题 | 已完成；109/109 tests、发布检查和生产 AI 实测通过 |
| Codex | `miniprogram/custom-tab-bar/index.js`、`miniprogram/app.json`、两张灰色 Tab 图标与导航测试 | 区分“进度”“AI专家”的选中/未选中图标颜色，未选中统一灰色 | 已完成；导航测试与小程序检查通过 |
| Codex | UGC 数据表、面经/评论/回复/机构评价接口、管理后台审核页、隐私政策及审核测试文档 | 建立发布前人工审核、公开内容过滤、统计联动和审核日志；同步虚拟支付与公司主体隐私披露 | 已完成；105/105 tests、发布检查与微信预览通过 |
| Codex | `miniprogram/components/c-login-popup`、`miniprogram/behaviors/login-gate.js`、所有登录受限入口及登录回归测试 | 将未登录点击统一改为当前页登录弹层，登录成功后继续原操作；登录弹层替换职引品牌 Logo | 已完成；101/101 tests、发布检查与微信预览编译通过 |
| Codex | `miniprogram/package-ai/pages/daily-brief/*`、导航回归测试 | 移除求职日报旧绿色问候头部，按首页蓝白求职计划卡片重构概览、统计与内容模块；移除 AI 返回的单字“伪图标” | 已完成；98/98 tests、发布检查与微信预览编译通过 |
| Codex | `miniprogram/utils/resume-versions.js`、`miniprogram/package-ai/utils/resume-versions.js`、AI 助手/JD 匹配引用与导航测试 | 将仅供 AI 分包使用的简历版本工具迁出主包，修复微信代码质量“主包未使用 JS”提示 | 已完成；97/97 tests、发布检查与微信预览编译通过，主包减少约 3 KB |
| Codex | `utils/featureFlags.js`、管理后台功能开关/Banner 页面、小程序首页与功能开关客户端、测试 | 增加“首页推荐岗位”独立审核开关并默认隐藏；校正 Banner 展示比例和上传尺寸提示 | 已完成；95/95 tests、生产开关关闭、公网验证通过、微信开发版 4.0.2 已上传 |
| Codex | 生产服务器、`miniprogram/utils/app-config.js`、Agent 配置测试与运维文档 | 将正确 4.0 主项目部署到 4400，完成 V4 数据迁移、虚拟支付与 Nginx 收口，并启用小程序 V4 Agent | 已完成；公网 readiness/V4/职位/校招/支付/鉴权冒烟通过 |
| Codex | `AGENTS.md`、`DEVELOPMENT_STATUS.md`、`docs/`、运行检查脚本、薪资可信度相关文件、首页与 TabBar、测试 | 收口误用副本，确认桌面仓库为唯一 4.0 主项目，迁移有效上线能力并完成发布验证 | 已完成；93/93 tests、发布检查与微信预览通过 |
| Codex | 小程序 `pages/resources`、资源页测试与文档 | 按参考图重做自定义导航、校招主视觉和横向资源卡片 | 已完成；91/91 tests、发布检查通过 |
| Codex | 小程序 `pages/index`、`pages/resources`、`components/home-campus-updates`、校招排序测试与文档 | 首页校招改为每个岗位独占一行并按每日最新更新时间排序；重构资源中心 UI | 已完成；91/91 tests、发布检查通过 |
| Codex | 小程序 `pages/resources`、`pages/index`、`components/home-campus-updates`、`custom-tab-bar`、导航调用及相关测试/文档 | 将校招 Tab 改为资源中心，首页求职情报改为校招瀑布流 | 已完成；91/91 tests、发布检查通过 |
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
| Codex | 小程序 `app.wxss`、`pages/salary/salary.wxss`、`pages/jobs/jobs.wxss`、`pages/applications/applications.wxss` | 超长 WXSS 首批 token 化整理 | 已完成 |
| Codex | 小程序 `pages/salary/salary.wxss`、`pages/applications/applications.wxss`、`pages/jobs/jobs.wxss`、`pages/index/index.wxss`、`pages/experiences/experiences.wxss`、`pages/resume/resume.wxss`、`pages/agencies/agencies.wxss`、`pages/project-builder/project-builder.wxss`、`pages/ai-assistant/ai-assistant.wxss`、`pages/profile/profile.wxss`、`pages/career-planner/career-planner.wxss` | 超长 WXSS 重复覆盖块清理 | 已完成首批 |
| Codex | `utils/featureFlags.js`、`routes/features.js`、`server.js`、`.env.example`、`tests/smoke.test.js`、小程序全局配置/导航及职位相关页面 | 职位功能全局开关 | 已完成，40/40 smoke tests 与小程序检查通过 |
| Codex | `db/v4Schema.js`、`services/v4JobMatch.js`、`services/v4Profile.js`、`routes/v4/`、`server.js`、`tests/smoke.test.js`、`docs/V4_SPRINT1_BACKEND.md` | V4 Sprint 1 后端基座：画像、岗位匹配、申请状态历史 | 已完成，58/58 tests 通过 |
| Codex | `db/v4Schema.js`、`services/v4Sponsor.js`、`services/v4JobMatch.js`、`routes/v4/jobs.js`、`routes/v4/applications.js`、`tests/smoke.test.js`、`docs/V4_SPRINT1_BACKEND.md` | V4 第一优先级完善：Sponsor、资格匹配、CRM 看板与详情 | 已完成，60/60 tests 通过 |
| Codex | `db/v4Schema.js`、`routes/v4-admin.js`、`routes/v4/jobs.js`、`services/v4JobMatchStore.js`、`scripts/migrate_v4.js`、`package.json`、`server.js`、`tests/smoke.test.js` | V4 第一优先级收尾：Sponsor 核验审计、批量匹配、V3 迁移 | 已完成；正式迁移及二次 dry-run 成功，pending=0；迁移后 63/63 tests 通过 |
| Codex | 小程序 `utils/api-v4.js`、`package-user/pages/profile-edit`、`job-detail`、`applications` | V4 小程序首批接入：画像完整度、Sponsor 情报、三维匹配、云端 CRM 状态机 | 已完成；`check:miniprogram` 与 63/63 tests 通过 |
| Codex | 小程序 `pages/jobs`、`package-user/pages/application-detail`、`applications`、`app.json`，后台 `admin/sponsor-profiles.html`、`admin/js/common.js` | V4 小程序第二批：Sponsor 筛选、云端匹配、申请详情协作、后台 Sponsor 审核 | 已完成；`check:miniprogram`、63/63 tests、迁移 dry-run 通过；`check:data` 仅命中既有 `api-feishu-content.js` 乱码问题 |
| Codex | `routes/v4/jobs.js`、`routes/v4/applications.js`、`tests/smoke.test.js`、小程序 `pages/jobs`、`package-user/pages/application-detail`、`utils/api-feishu-content.js` | V4 第三批发布收尾：筛选一致性、详情状态流转、内容检查清零 | 已完成；`check:release` 通过、63/63 tests、内容错误 0、迁移 pending=0 |
| Codex | 微信开发者工具与 `scripts/acceptance-bot.js` 验收链路 | V4 联调阶段：开发者工具 E2E 与无 GUI 验收 | E2E 预检 4/4；安全验收 29/29；真实 E2E 已完成 10/11 场景，面试空间 mock 路由问题已修复 |
| Codex | `scripts/e2e-3.0-bot.js`、微信开发者工具自动化报告 | V4 真实 E2E 兼容修复 | 脚本语法已验证；按 Human 决定真实 E2E 暂停且非默认，用户已确认人工预览正常 |

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

## Sprint 2 开发占用（2026-07-14）

| 负责人 | 文件范围 | 任务 | 状态 |
|---|---|---|---|
| Codex | `db/v4Schema.js`、`routes/v4/resumes.js`、`routes/v4/materials.js`、`services/v4ResumeCenter.js`、`utils/aiQuota.js`、`tests/smoke.test.js`、小程序简历与申请材料中心 | Sprint 2 申请材料中心：经历库、简历版本、AI 修改确认、AI 申请助手与额度控制 | 已完成，65/65 tests 与小程序检查通过 |

## Sprint 2 完成记录（2026-07-14）

| 事项 | 文件 | 验证 |
|---|---|---|
| 经历库、五类简历、复制/重命名/归档/默认、岗位与申请关联、版本对比恢复 | `db/v4Schema.js`、`services/v4ResumeCenter.js`、`routes/v4/resumes.js` | 自动化回归通过 |
| AI 逐条确认、手动编辑、防直接覆盖、防虚构、模型/提示词留痕、额度统计 | `routes/v4/resumes.js`、`utils/aiQuota.js` | 自动化回归通过 |
| JD 定制简历、Cover Letter、Recruiter 消息、Follow-up 邮件及确认保存 | `routes/v4/materials.js`、小程序 `application-materials` | 自动化回归与小程序检查通过 |
| AI 简历中心页面与完整开发说明 | 小程序 `resume-center`、`docs/V4_SPRINT2_APPLICATION_MATERIALS.md` | 页面注册检查通过 |

## Sprint 4 开发占用（2026-07-14）

| 负责人 | 文件范围 | 任务 | 状态 |
|---|---|---|---|
| Codex | `db/v4Schema.js`、`routes/v4/interviews.js`、`routes/v4/agents.js`、`routes/v4/membership.js`、相关 services/scripts/admin/miniprogram/tests/docs | Sprint 4 面试闭环、统一 AI、埋点看板、会员商业化与上线工程 | 已完成，69/69 tests 与发布检查通过 |

## Sprint 4 完成记录（2026-07-14）

| 事项 | 验证 |
|---|---|
| 岗位面试空间自动创建、模拟/STAR 训练、四维评分、报告、趋势和 Today 任务 | 自动化闭环通过 |
| 四 Agent、上下文读取、历史、超时降级、重试、取消、敏感信息脱敏、写操作确认 | 自动化状态机通过 |
| 全链路标准事件、7 日留存、申请漏斗、AI 使用率和后台运营看板 | 管理接口测试通过 |
| 会员方案、AI/简历/面试配额、高级匹配、订阅到期降级、订单退款状态 | 权益接口测试通过；真实支付双开关保持关闭 |
| 正式迁移、回滚 dry-run、功能开关、API 文档、小程序检查、灰度与错误监控 | `pending=0`，回滚计划可生成，灰度 0%，错误 0 |
| 性能采样 | 用户主链路未发现慢请求；测试中的内部提醒派发为 1.0–1.5 秒，已纳入看板持续观察 |
## 首页信息架构优化占用（2026-07-16）

| 负责人 | 文件范围 | 任务 | 状态 |
|---|---|---|---|
| Codex | `miniprogram/pages/index`、`miniprogram/pages/applications`、`miniprogram/pages/ai-career`、`miniprogram/custom-tab-bar`、`routes/v4/today.js` | 完成首页工作台、Today 同步与 V4 五项一级导航 | 已完成；79/79 tests、小程序检查通过；真实 E2E 待复验 |


| 2026-09-14 | 完成官网 Web 与小程序重新分工规划：Web 作为申请管理主工作台，小程序作为提醒、快速更新和面试练习助手；明确申请管理 MVP、申请包、面试复盘的 Web 迁移顺序 | docs/WEB_MINIPROGRAM_PRODUCT_PLAN_20260914.md | 规划文档完成，未改运行代码 |

## 面试训练收敛阶段（2026-09-14）

| 事项 | 文件 | 验证 |
|---|---|---|
| 面试训练上下文串联：申请详情携带 `applicationId` 进入岗位面试空间；空间提供返回申请与复盘中心入口；AI 模拟面试将申请上下文写入报告和历史；报告错题复练保留申请上下文 | `miniprogram/package-user/pages/application-detail/application-detail.js`、`miniprogram/package-ai/pages/interview-space/*`、`interview-setup/*`、`interview-dialog/*`、`ai-report/*`、`interview-notebook/interview-notebook.js`、`tests/navigationConfig.test.js` | 208/208 tests，`check:miniprogram` 与 `git diff --check` 通过 |
| 面试素材入口上下文复用：岗位面试空间写入 interviewContext，题库、STAR 和模拟面试入口自动复用公司、岗位和申请 | miniprogram/package-ai/pages/interview-space/interview-space.js、miniprogram/package-ai/pages/interview-setup/interview-setup.js、miniprogram/pages/experiences/experiences.js、miniprogram/package-content/pages/star-library/star-library.js、miniprogram/package-content/pages/question-detail/question-detail.js、	ests/navigationConfig.test.js | 待本轮测试完成 |

## 小程序 UI/UX 收敛阶段（2026-09-15）

| 负责人 | 文件范围 | 任务 | 状态 |
|---|---|---|---|
| Codex | `miniprogram/app.wxss`、首页 Today 工作台、校招卡片、首页求职计划、非首屏 Logo、`tests/navigationConfig.test.js`、`docs/UI_UPGRADE_20260915.md` | 补齐全局设计 Token，修复首页完成态和任务落地动作，明确校招卡片操作，降低首页渐变差异并补充图片懒加载 | 已完成；211/211 tests、导航专项 20/20、`check:miniprogram` 和 `git diff --check` 通过；真机回归待 Human |

## Web 申请包操作阶段（2026-09-15）

| 负责人 | 文件范围 | 任务 | 状态 |
|---|---|---|---|
| Codex | `services/v4ApplicationWorkspace.js`、`routes/v4/applications.js`、`db/v4Schema.js`、`public/web/applications.js`、`public/web/applications.css` | 简历版本选择、JD 匹配、ATS 检查、申请材料编辑/归档、AI 草稿确认写入 | 已完成；`npm test` 215/215，通过 Web 隔离场景及语法检查 |

本阶段未进行真实微信双设备验收、生产部署或推送。当前剩余首期事项：Web 岗位创建入口、AI 通用回答确认写入备注/任务、双端人工验收。

## Web 岗位入口阶段（2026-09-15）

| 负责人 | 文件范围 | 任务 | 状态 |
|---|---|---|---|
| Codex | `public/web/app.js`、`public/web/styles.css` | Web 职位搜索、匹配分数展示、一键加入申请管线 | 已完成；沿用 V4 岗位与申请接口 |

## 职引 5.0 P0 小程序收敛阶段（2026-09-15）

| 负责人 | 文件范围 | 任务 | 状态 |
|---|---|---|---|
| Codex | `miniprogram/app.json`、`custom-tab-bar`、`utils/navigation.js`、`utils/util.js`、AI/申请页导航 | 小程序一级导航收敛为：首页、找岗位、进度、我的；AI 改为上下文页面，不再占用一级 Tab | 已完成；导航专项与全量 215 项测试通过 |
| Codex | `miniprogram/pages/jobs/*`、既有岗位图标 | 将校招日历作为找岗位模块入口保留，支持从岗位搜索页进入校招批次和截止日期列表 | 已完成；`check:miniprogram` 通过 |

### P0 第二批：移动申请闭环

- 岗位卡片增加待投递/查看进度；服务端成功后显示状态，重复点击合并请求，409 读取已有申请，只有感兴趣记录可以推进至待投递，不覆盖面试和 Offer。
- 统一移动状态展示，收藏和准备申请不再显示为已投递；详情页复制官方链接不再自动写已投递，也不再复制个人简历摘要。
- 收藏继续使用原收藏同步；详情页收藏不再额外写申请记录，避免覆盖已有进度。明确点击待投递才创建申请；已有记录保留。
- 进度页增加独立 OA 筛选、列表改状态（使用服务端合法流转与版本检查），移除漏斗、工具宫格和材料准备度展示。
- 空列表和网络失败分开；进度页拦截过期请求，登录失效退出加载态；手动新增失败保留表单和同一个 jobId 供重试。
- 我的增加完整资源目录入口；校招入口移出岗位页固定头部，避免遮挡；复用原岗位选中/未选中图标，移除重复搜索图。
- 验证：新增移动流程测试 14/14，`check:release` 通过，全量 229/229；小程序媒体 191.2 KB、主包估算 1.04 MB；数据检查错误 0，保留既有 4 条提示。未部署、未进行微信真机 E2E。
- 详情及剩余 P0 范围见 `docs/V5_P0_MOBILE_WORKFLOW_20260915.md`，不表示整个 5.0 P0 已全部完成。

## Web AI 申请上下文与确认写入（2026-09-15）

- 已完成：服务端读取本人申请状态、下一步及 JD 摘要；AI 回答可编辑预览后确认保存为申请备注或申请任务。
- 权限验证：必须显式 confirm；跨用户申请拒绝；备注/任务长度有上限。
- 最新验证：Web 专项 4/4（隔离 API 场景 9/9），Edge 浏览器验收通过。
- 最终全量回归 215/215，`check:release` 通过；同期导航约定已统一，小程序检查通过。
- 未推送、未部署、未进行真实微信双设备验收。
