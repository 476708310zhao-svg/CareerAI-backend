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
sudo mkdir -p /www/wwwroot/jobapp-server
sudo mkdir -p /var/lib/jobapp-server/db
sudo mkdir -p /var/lib/jobapp-server/uploads
sudo mkdir -p /var/lib/jobapp-server/data
sudo mkdir -p /var/log/jobapp-server
sudo mkdir -p /var/backups/jobapp-server
```

把代码部署到：

```bash
/www/wwwroot/jobapp-server
```

把数据库、上传文件、后台职位数据放到：

```bash
/var/lib/jobapp-server
```

## 3. 部署代码

```bash
cd /www/wwwroot
git clone <你的仓库地址> jobapp-server
cd /www/wwwroot/jobapp-server
npm ci --omit=dev
```

如果是已有目录：

```bash
cd /www/wwwroot/jobapp-server
git pull origin main
npm ci --omit=dev
```

## 4. 配置生产 .env

```bash
cp .env.example .env
nano .env
```

生产环境关键配置：

```bash
NODE_ENV=production
PORT=3001

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
cd /www/wwwroot/jobapp-server
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
cd /www/wwwroot/jobapp-server
sudo mkdir -p /var/log/jobapp-server
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

检查：

```bash
pm2 status
pm2 logs jobapp-server
curl http://127.0.0.1:3001/api/health
```

## 7. Nginx HTTPS 反向代理

域名示例：

```bash
api.zhiyincareer.com
```

Nginx 参考配置见项目根目录 `nginx.conf`。

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
bash /www/wwwroot/jobapp-server/scripts/backup-production.sh
```

每日 03:20 自动备份：

```bash
crontab -e
```

加入：

```cron
20 3 * * * APP_DATA_DIR=/var/lib/jobapp-server BACKUP_DIR=/var/backups/jobapp-server bash /www/wwwroot/jobapp-server/scripts/backup-production.sh >> /var/log/jobapp-server/backup.log 2>&1
```

## 9. 发布流程

每次上线：

```bash
cd /www/wwwroot/jobapp-server
bash scripts/backup-production.sh
git pull origin main
npm ci --omit=dev
npm test
pm2 reload ecosystem.config.cjs --update-env
curl https://api.zhiyincareer.com/api/health
```

## 10. 上线前核对

- `.env` 中没有示例值和占位符
- `NODE_ENV=production`
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
