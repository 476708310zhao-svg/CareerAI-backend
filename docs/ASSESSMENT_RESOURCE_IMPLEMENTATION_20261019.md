# 测评资料 1.0 开发与接入记录

日期：2026-10-19。依据 `ASSESSMENT_RESOURCE_COMMERCE_PRD_20261008.md` V1.1。当前为本地开发交付：未提交、推送、部署或向主运行数据库应用迁移；未创建任何真实商品和首页热门数据。

正式版增补：按最新需求，测评资料统一售价 **9 元（900 分）**；用户已提供飞书源表及统一文案，商品尚未录入，未发布。后台价格只读，服务端拒绝其它价格，开发工具默认使用真实接口且不自动补示例。完整准备与字段映射见 `ASSESSMENT_RESOURCE_RELEASE_20261019.md`；下方“前阶段验证记录”保留历史事实，不能作为本轮最终门禁结果。

本轮最终门禁：独立 `check:release` 退出码 0，492 项中 490 通过、0 失败、2 项依赖 Linux shell 的 Windows 跳过；AI 7/7（外部请求 0），小程序媒体 197.1 KB/主包估算 1.10 MB，数据检查 0 错误/5 既有提示；迁移 12/12，Acceptance 29 通过/0 失败/1 既有 job-detail 提示/0 跳过。`.env` 和主数据库 SHA-256 前后不变，独立质量审查及源码反模式核查无阻断；详见新发布记录。此前岗位测试的日期采样已固定并补重叠缓存场景，未改生产岗位逻辑。代码完成尚未上线，真实物料、微信编译/真机及真实付款仍待后续接入。

## 交付范围

首页展示运营配置的最多三家不同公司的主推资料，资源中心、公司详情通向统一的资料列表/详情；单品支付后通过本人订单领取网盘地址、提取码，已购可以再次领取。后台可维护商品、首页推荐、查询订单、重试交付、记录外部已完成的人工退款。

不需要求职申请，不增加站内阅读器、练习、学习资产或 AI。页面、后台文件与具体交互以本次提交候选源码为准。

## 实际接口

统一响应 `{code:0,message,data}`，失败使用适当 HTTP 状态及 `{code,message,data:null}`。资料与订单列表支持 `page`、`pageSize`，默认 200 条、最大 200 条，返回真实 `total`。

| 方法与路径 | 权限 | data |
|---|---|---|
| GET `/api/v4/assessment-products/home` | 匿名 | `{enabled,items}`，最多三家不同公司/商品 |
| GET `/api/v4/assessment-products?keyword=&companyId=&page=&pageSize=` | 匿名 | `{items,total,page,pageSize}`，仅在售 |
| GET `/api/v4/assessment-products/:id` | 匿名 | `{product}`，草稿 404，下架可看详情 |
| POST `/api/v4/assessment-orders` | 用户 | `{order,alreadyPurchased,reused,payment}` |
| GET `/api/v4/assessment-orders/:orderNo` | 本人 | `{order}` |
| GET `/api/v4/assessment-purchases?productId=&productIds=&ownedOnly=1&page=&pageSize=` | 本人 | `{items,total,page,pageSize}`，默认含已支付、待人工核对及已退款记录；ownedOnly=1仅有效付款/待核对 |
| GET `/api/v4/assessment-orders/:orderNo/delivery` | 本人有效已付款 | `{orderNo,title,driveName,link,extractionCode,usageInstructions,expiresAt}` |
| POST `/api/payment/mock-confirm` | 本人，非生产显式 Mock | 复用原 `{orderNo}` 请求与支付确认 |
| POST `/api/payment/notify`、`/api/payment/virtual-notify` | 原渠道签名 | 原有通知接口，增加资料分支 |
| GET/POST `/admin/api/v4/assessment-products` | memberships 或 * | `{items,total,page,pageSize}` / `{product}` |
| GET/PATCH `/admin/api/v4/assessment-products/:id` | 同上 | `{product}` |
| GET/PUT `/admin/api/v4/assessment-instructions` | 同上 | 共享四项说明、`version/configured`；PUT须`expectedVersion`，所有商品只配置一次 |
| GET/PUT `/admin/api/v4/assessment-home` | 同上 | `{enabled,items:[{companyId,productId,sortOrder}]}` |
| GET `/admin/api/v4/assessment-companies` | 同上 | `{items:[{id,name,logo}]}`，读取真实公司 |
| GET `/admin/api/v4/assessment-orders` | 同上 | `{items,total,page,pageSize}`，支持 keyword/status/productId/userId |
| POST `/admin/api/v4/assessment-orders/:orderNo/retry-delivery` | 同上 | 无请求体，幂等补建已付款交付，返回 `{order}` |
| POST `/admin/api/v4/assessment-orders/:orderNo/refund-completed` | 同上 | 外部退款凭据，返回 `{order,refund,already}` |

公开商品字段：`id/productId,title,coverUrl,summary,description,catalogText,sampleImages,seasonLabel,priceCents,status,sortOrder,companies,companyIds,usageInstructions,claimInstructions,updateInstructions,afterSalesInstructions,sourceDescription,claimDays,deliveryMethod,updatedAt`。公司数组为 `{id,name,logo}`。后台商品额外包含 `driveName,driveUrl,extractionCode,virtualProductId`。

商品状态为 `draft/active/inactive`；商品统一定价为 900 分，历史订单金额保持原始记录。私密领取字段不出现在首页、公开商品、订单与已购列表中。订单、领取和后台响应设置 `Cache-Control: no-store`。

下单请求为 `{productId,expectedPriceCents,expectedInstructionsVersion,idempotencyKey,source,companyId}`；`idempotencyKey` 至少八个字符。服务端只接受已保存为 900 分的在售商品，新订单及支付参数均为 900 分，报价或共享说明版本不同返回 409 要求刷新重新确认；数量固定一份，不接受客户端实付金额。公开详情返回 `instructionsVersion/purchaseEnabled`，统一说明未配置禁止新售；已有未退款购买返回原订单和 `alreadyPurchased=true`，不重新收费。有效待付订单在 30 分钟内复用；下架、支付 SKU 或统一说明变化关闭旧待付订单。

订单公开字段为 `orderNo,productId,title,coverUrl,amount,priceCents,status,provider,createdAt,paidAt,deliveryStatus,expiresAt`，后台订单额外有 `userId`。订单状态 `pending/paid/cancelled/payment_review/refunded`，交付状态 `pending/ready/review/revoked`；领取期限以 `expiresAt` 判断，超期领取返回 410。`productIds` 支持逗号分隔的最多 200 个商品 ID；详情按 `productId&ownedOnly=1` 查询，列表批量查询当前页商品，避免已退款历史或前 200 条截断导致误判。

`payment` 嵌套原支付结构：Mock `{provider:'mock',mock:true,orderNo,amount}`；virtual 包含 `mode,signData,paySig,signature,virtualPayment`；wxpay 包含 `appId,timeStamp,nonceStr,package,signType,paySign`。小程序支付返回并不代表已发货，领取仍以服务端订单与授权校验为准。

## 数据库与正式接入

新增 migration `0012_assessment_commerce.sql`，只新增六张商品/公司关联/首页配置/资料订单扩展/交付/操作审计表，复用现有 `orders` 与 `commerce_ledger_v4`。`orders.plan_id=-1` 只是资料类型标记，真实 `product_id` 保存在资料订单扩展中，不与会员套餐 ID 混用，不发放 VIP。

正式定价迁移 `0013_assessment_fixed_nine_yuan.sql` 将全部资料商品改为 900 分，并关闭非 900 分的资料待付订单。已支付、已退款订单、购买快照、交付和账本金额不重写；会员及其它商品不改价。旧订单迟到款仍须按原金额和签名验证，进入 `payment_review`，不发放资料。

`0014_assessment_shared_instructions.sql` 创建版本0空共享单例，不自动复制单品文案或播种业务承诺，并关闭资料待付；已付快照不变。四说明在后台统一维护，使用用户已确认文案显式配置；飞书每行不需重复四列。未应用0014时公开列表/详情、共享设置和商品保存返回受控503，首页隐藏，历史订单领取仍可用。统一文案修改带后台乐观版本，所有新订单快照保留确认时四说明及版本。共享审计以product_id=0表示商品集合，详见共享说明文档。

资料订单扩展的历史 `user_id` 与原订单一致保留，不建立阻断注销的用户外键。注销会将个人业务数据删除和最终账号删除放在同一事务，数据库事务成功后再移除简历文件；会计订单仍保留。资料私有接口除验证 JWT 外还检查账号仍存在，注销前签发的旧 token 返回 401。账号删除后到账的合法资料付款记为待人工核对，账本使用空用户引用；管理员仍可记录外部退款凭据，该凭据保存在原商业账本中。

源码启动不会自动运行 0012/0013/0014。无 0012 时，首页接口返回 `{enabled:false,items:[]}`，其他资料接口返回可处理的 503；0013 未应用前，非 900 分的旧商品不会出现在公开列表/首页，也不能创建新订单。迁移没有种子商品和推荐配置，不能把测试公司或网盘地址当真实商品上线。

正式或 staging 接入必须沿用 `DATABASE_MIGRATION_PLAN.md` 的显式目标与备份流程。以下命令只作说明，本轮没有对运行库执行：

```powershell
npm run migrate:db -- --db="D:\explicit-target\jobapp.db" --status
npm run migrate:db -- --db="D:\explicit-target\jobapp.db" --backup="D:\verified-backup\jobapp.pre-0013.db" --apply --confirm=APPLY_SCHEMA_MIGRATIONS
```

生产环境仍需原发布流程的审批与 `--production-approved`；该参数不能替代审批。失败后按原手册从已验证一致性备份恢复，不反向删除历史订单。

## 运营配置步骤

1. 完成 0012/0013/0014 后，以有 `memberships` 或 `*` 权限的管理员打开测评资料管理，在“统一说明”一次配置使用/领取/更新/售后文案。
2. 新建商品：名称、封面、摘要、介绍、目录、来源说明；关联真实公司。价格只读为 ¥9.00，由服务端固定 900 分，示例图可选；共享四段自动继承，不逐商品重复填写。
3. 填写 HTTPS 网盘链接、网盘名称、可选提取码；领取天数为空表示无平台领取截止时间，填写正整数则自付款时间计算。对用户的实际承诺必须在购买前说明中写清。
4. 校验内容与链接后设为 `active`。上架字段缺失会被服务端拒绝。
5. 首页推荐启用后，选最多三组公司和对应在售商品并排序；公司和商品均不可重复。没有配置或下架过滤后为空时隐藏首页区块。
6. 链接纠错修改同一商品的网盘配置后，历史有效购买会读取修正后的链接；历史订单标题、价格、使用条款、领取天数保持购买快照。实质不同的资料包应新建商品。
7. 人工退款已在外部完成后，记录 `confirmExternalRefund=true,externalReference,note`。该接口只记录退款结果、账本并撤销再次领取，绝不执行银行/微信资金退款。复制或下载过的网盘内容不能撤回。

## 支付接入与风险验证

资料使用现有 provider 配置、虚拟支付签名、JSAPI 下单、同一回调和 Mock 确认。保持 `PAYMENT_ENABLED`、`REAL_PAYMENT_LAUNCH_APPROVED` 与原生产配置门禁；生产中即便设置 `ENABLE_MOCK_PAYMENT=true` 仍拒绝 Mock。

真实 virtual 需要原渠道必需配置及每份资料的 `virtualProductId`；该 SKU 必须在微信后台配置并与服务端分价一致。资料分支额外要求 `VIRTUAL_PAY_NOTIFY_TOKEN` 已配置；通知校验签名、stored provider、商品 SKU、数量一份、精确金额、交易号，不满足时不交付。JSAPI 复用原商户配置并核对通知商户与 appid。真实渠道商品和支付价格仍须实测验收，本轮未发生真实支付。

同一用户有效购买不重复收费；重复回调不重复记账/交付；不同订单不能重用交易号；退款后迟到回调不得恢复领取。匿名及其他账号不能查看私有订单或领取；商品变为下架不撤销历史有效购买。支付已发生但旧订单被关闭等异常应人工核对原渠道交易，系统不会伪造付款或自动发货。

已取消订单在原金额、原 SKU、正确渠道和有效签名下迟到收款，转为 `payment_review`，返回成功通知 ACK，幂等记录 `payment_confirmed` 金额账本和 `assessment_payment_review` 核对事件，并进入商业告警。该状态不生成交付、不允许后台重试发货、同一商品不再次收费；用户查看订单并联系客服，管理员核实后在外部退款，再用已有凭据接口记录完成并转 `refunded`。该流程不自动退款、不自动恢复授权，已退款订单不因后续通知恢复。

## 前阶段验证记录（历史，正式定价专项见新发布记录）

本轮后端运行了隔离专项：

```powershell
node --test tests/assessmentCommerce.test.js tests/databaseMigrations.test.js tests/sprint7Commerce.test.js
```

结果：30/30 通过，包括资料 15 项、迁移 11 项、既有商业 4 项。覆盖 Mock 全链路、真实签名构造的 virtual/wxpay 通知（仅本机隔离 Express 路由，无真实 provider 请求）、错误签名/SKU/数量/金额/provider、幂等/跨账号/退款/过期、无 schema 首页空态、分页与批量商品筛选、XSS 输入及生产禁 Mock。review 追加了关闭订单迟到收款/幂等记账/禁止发货/凭据退款，以及 pending/paid/refunded 三种订单注销、旧 token 拒绝和注销失败原子回滚。0012 升级测试确认旧订单逐字段保留、无伪商品、重复执行为零，测试数据库位于系统临时目录。

最终集成复验：`check:release` 全量 478 项，475 通过、1 失败、2 项 Windows 跳过；唯一失败仍为实现前既有 `tests/jobSourcesIntegration.test.js:17` JSearch actual 8 / expected 9，未把发布检查标为全绿。与实现前 441 项（438/1/2）相比，新增 37 项全部通过（后端 15、前端 17、后台 4、迁移 1）；三项旧购买文案/资源数量断言已更新并通过。截断后补跑 AI 质量 7/7、小程序静态（媒体 197.1 KB、主包 1.09 MB）、数据检查（0 错误/5 既有提示）通过；迁移 11/11，Acceptance 29 通过/0 失败/1 既有岗位详情提示，使用 `--no-report`。

独立后端 review 的注销、迟到收款、分页发现已修复并复验（15/15，另含超 200 条分页/退款历史、合法签名回调与凭据退款场景）；独立 UI review 的编辑请求乱序、过期已付订单误导购买发现已修复（前端 17/17、后台 4/4），后台截图核查正常。新增鉴权、私密字段投影、`no-store`/`noCache`、无私密持久缓存及无新增启动 DDL 已核查。这些结论限于本轮场景，不代表全系统安全审计或小程序像素验收。

数据库写入测试均使用隔离临时库；测试前后 SHA-256 不变：`.env` 为 `75C448B454013134AB3385CD3B508D07B03227B8A3F0C3CB7B315AE4CB08EBBB`，`db/jobapp.db` 为 `7772A4CAE8C5D43DB399E9F5FBE2E559D37201382819F678F83EB0D6933D0376`。定向差异检查通过；用户既有 AI、岗位、快讯等脏工作树差异不计为本轮资料开发。

本地开发已完成，未提交、推送、部署或向主运行库/生产库应用 0012/0013；真实支付、DevTools 编译及真机/小程序视觉验收未执行。正式接入仍需备份、显式迁移及配置真实商品、9 元支付 SKU、网盘交付信息和首页推荐。
