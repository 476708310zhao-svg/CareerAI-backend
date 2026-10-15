# 后端正式环境部署

适用架构：Node.js + Express + SQLite + PM2 + Nginx HTTPS 反向代理。

## 1. 服务器准备

推荐配置：

- Ubuntu 22.04 / Debian 12 / OpenCloudOS 9
- Node.js 20 LTS
- Nginx
- PM2
- 2C2G 起步，磁盘 40GB+

安装基础依赖：

```bash
sudo apt update
sudo apt install -y git nginx sqlite3
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

## 2. 目录规划

代码目录和业务数据分离：

```bash
sudo mkdir -p /www/wwwroot/zhiyincareer-main/releases
sudo mkdir -p /var/lib/jobapp-server/db
sudo mkdir -p /var/lib/jobapp-server/uploads
sudo mkdir -p /var/lib/jobapp-server/data
sudo mkdir -p /var/log/jobapp-server
sudo mkdir -p /www/backups/zhiyincareer
```

每次把代码部署到新的不可变版本目录：

```bash
/www/wwwroot/zhiyincareer-main/releases/<run-id>-<commit>
```

把数据库、上传文件、后台职位数据放到：

```bash
/var/lib/jobapp-server
```

当前线上版本统一由以下软链接指向：

```bash
/www/wwwroot/zhiyincareer-main/current
```

## 3. 部署代码

推荐在 GitHub Actions 中手动触发 `Deploy Backend`。工作流会上传独立版本、备份共享数据、运行发布检查和严格预检，再切换 `current`。推送 `main` 不会自动发布。在当前服务器的 GitHub `production` Environment 中，将 `PRODUCTION_NGINX_CONFIG_PATH` 设置为 `/www/server/panel/vhost/nginx/jobapp.conf`；脚本会跟随软链接备份实际目标文件，未设置或文件不存在将中止发布。其他环境须重新核对各自实际生效的 vhost 路径。

上线前人工只读核对迁移状态：

```bash
node scripts/migrate_database.js --db=/var/lib/jobapp-server/db/jobapp.db --status
```

`pending` 必须为 0。若仍有待迁移项，停止发布；生产 migration apply 需另行审批、验证备份后手动执行。

服务器上手动执行时，先把完整代码上传到一个新版本目录，再运行：

```bash
cd /www/wwwroot/zhiyincareer-main/releases/<release>
chmod +x deploy.sh scripts/*.sh
NGINX_CONFIG_PATH=/www/server/panel/vhost/nginx/jobapp.conf APP_DATA_DIR=/var/lib/jobapp-server BACKUP_DIR=/www/backups/zhiyincareer bash scripts/backup-production.sh
bash deploy.sh
```

## 4. 配置生产 .env

```bash
cp .env.example /var/lib/jobapp-server/.env
chmod 600 /var/lib/jobapp-server/.env
nano /var/lib/jobapp-server/.env
```

生产环境关键配置：

```bash
NODE_ENV=production
PORT=4400

DATA_DIR=/var/lib/jobapp-server/data
UPLOAD_DIR=/var/lib/jobapp-server/uploads
DB_PATH=/var/lib/jobapp-server/db/jobapp.db

JWT_SECRET=<随机长字符串>
ALLOWED_ORIGIN=https://api.zhiyincareer.com,https://mp.weixin.qq.com

WX_APP_ID=<小程序 AppID>
WX_APP_SECRET=<小程序 AppSecret>

ADMIN_USERNAME=<后台管理员账号>
ADMIN_PASSWORD=<强密码>

WEBHOOK_SECRET=<GitHub webhook secret>

PAYMENT_ENABLED=false
# 虚拟支付正式上线时改为 true，并填写以下 VIRTUAL_PAY_* 配置：
PAYMENT_PROVIDER=virtual
MEMBERSHIP_FEATURE_ENABLED=true
VIRTUAL_PAY_ENV=0
VIRTUAL_PAY_CURRENCY=CNY
VIRTUAL_PAY_MODE=short_series_goods
VIRTUAL_PAY_OFFER_ID=<微信虚拟支付 Offer ID>
VIRTUAL_PAY_APP_KEY=<微信虚拟支付现网 AppKey>
VIRTUAL_PAY_SANDBOX_APP_KEY=
VIRTUAL_PAY_MONTH_PRODUCT_ID=<月卡道具 productId>
VIRTUAL_PAY_QUARTER_PRODUCT_ID=<季卡道具 productId>
VIRTUAL_PAY_YEAR_PRODUCT_ID=<年卡道具 productId>
VIRTUAL_PAY_NOTIFY_TOKEN=<微信消息推送 Token>
```

生产启动会强校验 `NODE_ENV=production` 下的必要变量。`PAYMENT_ENABLED=true` 时必须填写完整虚拟支付变量；虚拟支付参数未补齐前请保持 `PAYMENT_ENABLED=false`，避免正式环境出现半配置状态。

## 5. 初始化数据

首次部署如果需要导入种子数据：

```bash
cd /www/wwwroot/zhiyincareer-main/current
NODE_ENV=production node db/seed.js
```

如果你已有本地数据库，需要迁移：

```bash
scp db/jobapp.db root@your-server:/var/lib/jobapp-server/db/jobapp.db
scp -r uploads/* root@your-server:/var/lib/jobapp-server/uploads/
scp data/jobs.json root@your-server:/var/lib/jobapp-server/data/jobs.json
```

## 6. PM2 启动

```bash
cd /www/wwwroot/zhiyincareer-main/current
sudo mkdir -p /var/log/jobapp-server
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

检查：

```bash
pm2 status
pm2 logs jobapp-server
curl http://127.0.0.1:4400/api/health/ready
```

## 7. Nginx HTTPS 反向代理

域名示例：

```bash
api.zhiyincareer.com
```

Nginx 参考配置见项目根目录 `nginx.conf`。

2026-10-14 线上核验记录：实际生效的 vhost 为 `/www/server/panel/vhost/nginx/jobapp.conf`，变更前的同目录备份为 `/www/server/panel/vhost/nginx/jobapp.conf.before-api-route-20261014`。该 vhost 的 `location ^~ /api/` 将普通 API 代理到 `127.0.0.1:4400`，与既有 `/api/v4/` 规则及指向 `3102` 的 Next.js 官网同时保留。`nginx -t` 通过并已 reload；公网 `/api/health/ready`、`/api/features`、`/api/campus` 均返回 200 JSON，畸形登录 POST 返回 400 JSON，官网首页返回 200 HTML。这些结果证明 API 请求不再被官网路由接管，但不代替真实微信登录验收。

2026-10-14 管理后台 404 修复：同一 vhost 新增 HTTPS `location ^~ /admin/`，将登录页、后台静态资源及 `/admin/api/*` 转发到 `127.0.0.1:4400`；`/admin` 规范化跳转到 `/admin/`，HTTP 后台路径跳转 HTTPS。后台上传资源 `/uploads/` 也转发到 Node。变更前备份为 `/www/server/panel/vhost/nginx/jobapp.conf.before-admin-route-20261014-1640`。`nginx -t` 通过并 reload 后，公网 `/admin/`、`/admin/memberships.html`、后台 CSS/JS 均为 200；未登录 `/admin/api/memberships` 为预期的 401 JSON；`/api/health/ready` 与官网首页仍为 200。尚未使用真实管理员凭据测试登录和会员操作。与 Next.js 官网共用域名时必须保留这些高优先级后台路由，不可仅保留 `location /`。

申请 SSL 后检查：

```bash
curl https://api.zhiyincareer.com/api/health
```

小程序后台必须配置：

- request 合法域名：`https://api.zhiyincareer.com`
- uploadFile 合法域名：`https://api.zhiyincareer.com`
- downloadFile 合法域名：`https://api.zhiyincareer.com`

## 8. 备份

手动备份：

```bash
NGINX_CONFIG_PATH=/www/server/panel/vhost/nginx/jobapp.conf bash /www/wwwroot/zhiyincareer-main/current/scripts/backup-production.sh
```

每日 03:20 自动备份：

```bash
crontab -e
```

加入：

```cron
20 3 * * * NGINX_CONFIG_PATH=/www/server/panel/vhost/nginx/jobapp.conf APP_DATA_DIR=/var/lib/jobapp-server BACKUP_DIR=/www/backups/zhiyincareer bash /www/wwwroot/zhiyincareer-main/current/scripts/backup-production.sh >> /var/log/jobapp-server/backup.log 2>&1
```

## 9. 发布流程

每次上线：

```bash
cd /www/wwwroot/zhiyincareer-main/releases/<release>
NGINX_CONFIG_PATH=/www/server/panel/vhost/nginx/jobapp.conf APP_DATA_DIR=/var/lib/jobapp-server BACKUP_DIR=/www/backups/zhiyincareer bash scripts/backup-production.sh
bash deploy.sh
curl -fsS https://api.zhiyincareer.com/api/health/ready
```

以上 Nginx 路径仅适用于已核验的当前服务器；更换服务器或 vhost 时须重新确定实际生效路径。发布脚本不会修改 crontab 或重复执行 `pm2 startup`；首次安装开机自启和定时任务须按本手册单独配置。发布脚本先在隔离库运行 Release/Acceptance，随后只读查生产迁移状态；候选服务仅绑定 `127.0.0.1:4401`、连接隔离快照。切流后内网及公网 `/api/health/ready` 都必须返回就绪；任何一步失败将尝试恢复旧 `current` 和 PM2 配置。公网 404 不能靠重试登录解决。

如果公网探针返回 Next.js HTML 404，而内网 `127.0.0.1:4400` 正常，先核对 `nginx -T` 中 `api.zhiyincareer.com` 的实际 vhost、`location ^~ /api/` 和 upstream 是否指向 `127.0.0.1:4400`。确认配置差异、备份实际文件并经上线审批后，执行 `nginx -t`；仅在校验通过后人工 reload Nginx。发布脚本不会自动重写 Nginx。

## 10. 上线前核对

- `.env` 中没有示例值和占位符
- `NODE_ENV=production`
- `PORT=4400`
- `DB_PATH` 指向 `/var/lib/jobapp-server/db/jobapp.db`
- `UPLOAD_DIR` 指向 `/var/lib/jobapp-server/uploads`
- `DATA_DIR` 指向 `/var/lib/jobapp-server/data`
- 虚拟支付发货通知地址是 HTTPS，推荐 `https://api.zhiyincareer.com/api/payment/virtual-notify`
- 未补齐虚拟支付参数前，`PAYMENT_ENABLED=false`
- 开通虚拟支付后，`/api/payment/config` 返回 `data.provider=virtual`、`data.available=true` 且 `data.mock=false`
- Nginx 证书有效
- 微信小程序后台合法域名已配置
- PM2 已设置开机自启
- 备份 cron 已配置
- `current` 指向本次发布版本，上一版本目录仍保留
