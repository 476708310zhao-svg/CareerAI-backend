# 测评资料首页展示启用记录（2026-10-19）

## 授权与范围

Human 明确授权“开启首页展示，按后台排序取前 3 家”。本次仅配置生产数据库 `assessment_home_config` 的 `id=1` 行，不发布小程序、不修改商品、公司、价格、资料内容、网盘交付、支付门禁或环境配置。

后台商品排序实际为 `sort_order ASC, id DESC`。当前五份商品排序均为 0，因此选择：

| 展示位置 | 公司 | 商品 ID | 公司 ID | 价格 |
|---|---|---|---|---|
| 1 | 小米集团 | 5 | 33 | 9 元 |
| 2 | 拼多多 | 4 | 77 | 9 元 |
| 3 | 百度 | 3 | 32 | 9 元 |

这是按执行时后台排序生成的三条运营配置；现有产品不会在以后修改商品排序时自动重选首页资料。

## 执行方式与保护

- 正常运营接口为 `PUT /admin/api/v4/assessment-home`，最终调用正式 `services/assessmentCommerce.js` 的 `saveHome`。本轮没有可用的后台登录会话或专用运营 CLI，经 root 明确确认，使用已授权的生产 SSH 运维入口调用同一正式服务，不伪造 token，不修改权限或鉴权。
- 从当前生产 release 执行，显式指定 `/var/lib/jobapp-server/db/jobapp.db`；先用只读数据库预检正式服务，确认加载成功。将该显式数据库连接注入精确解析的 `db/database.js` 模块缓存，避免加载数据库启动初始化逻辑。该方式为本次受控运维替代，不声称已有同样的项目测试注入实例。
- 生成完整在线 SQLite 备份并验证 `integrity_check=ok`、外键错误 0；目录权限 0700、备份和记录权限 0600。
- 在 `BEGIN IMMEDIATE` 事务内确认首页配置仍与备份一致，然后调用 `saveHome` 原有商品在售、关联关系、公司和商品去重校验。事务提交前后其余 94 张表内容哈希完全一致；只新增首页配置行。
- 环境文件 SHA-256 前后保持 `c7042d5596df290257ff947af7bd4ceda422c218fc12e95e636b7326a825eb8a`。没有停止或重启进程、升级后端、迁移数据库、修改 Nginx 或开启收款。

## 备份与回退

- 备份：`/www/backups/zhiyincareer/assessment-home-20261019.4Jq3fr/before-home-enable.db`
- SHA-256：`63538eb5ec4f8d286a69ea93305fca1dc742a92cfc24711da4bd896583851b8c`
- 原首页配置：无 `id=1` 行。
- 原配置快照：同目录 `previous-home.json`。
- 变更及保护表哈希记录：同目录 `change-report.json`。
- 如需回退，先核对当前行仍等于本次记录，再在事务内删除本次新增的 `id=1` 配置行，或通过正式后台关闭首页。不可将整库备份覆盖已继续运行的生产数据库，不得覆盖后续运营人员的新配置。

## 公网验证结果

- `GET /api/v4/assessment-products/home`：HTTP 200，`enabled=true`，三条资料顺序为小米集团、拼多多、百度，价格均 900 分，`purchaseEnabled` 均为 `false`；无网盘链接、提取码或支付 SKU 字段。
- `GET /api/payment/config`：HTTP 200，`enabled=false`、`available=false`、`mock=false`。
- `GET /api/health/ready`：HTTP 200，`ready=true`。

上述只证明后台首页配置已生效，不代表小程序代码已上传、提审或发布，也不代表真实付款及交付已验收。
