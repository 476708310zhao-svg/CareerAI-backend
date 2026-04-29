#!/bin/bash
# =============================================
# 留学生求职小程序 后端部署脚本
# 适用：OpenCloudOS 9.4 + 宝塔面板
# 部署路径：/www/wwwroot/jobapp-server（与旧版一致，Nginx 无需改动）
# =============================================
set -e

DEPLOY_DIR=/www/wwwroot/jobapp-server
PM2_NAME=jobapp-server

echo "🚀 开始部署求职小程序后端..."

# ── 1. 检查 Node.js ────────────────────────
if ! command -v node &> /dev/null; then
  echo "📦 安装 Node.js 18..."
  curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -
  yum install -y nodejs
fi
echo "✅ Node.js: $(node -v)"

# ── 2. 检查 PM2 ─────────────────────────────
if ! command -v pm2 &> /dev/null; then
  npm install -g pm2
fi
echo "✅ PM2: $(pm2 -v)"

# ── 3. 备份旧版 .env（保留真实密钥）──────────
if [ -f "$DEPLOY_DIR/.env" ]; then
  echo "💾 已检测到旧版 .env，保留密钥..."
  cp "$DEPLOY_DIR/.env" /tmp/jobapp_env_backup
fi

# ── 4. 上传新代码到部署目录 ─────────────────
mkdir -p $DEPLOY_DIR
# 将当前目录文件同步到服务器（本地运行此脚本时跳过，手动 scp 或 git pull）
# 示例：scp -r ./* root@your-server:$DEPLOY_DIR/

# ── 5. 还原 .env ────────────────────────────
if [ -f /tmp/jobapp_env_backup ]; then
  cp /tmp/jobapp_env_backup "$DEPLOY_DIR/.env"
  echo "✅ .env 已还原"
elif [ ! -f "$DEPLOY_DIR/.env" ]; then
  cp "$DEPLOY_DIR/.env.example" "$DEPLOY_DIR/.env"
  echo ""
  echo "⚠️  首次部署：请编辑 .env 填入 API 密钥"
  echo "    nano $DEPLOY_DIR/.env"
  echo ""
fi

# ── 6. 安装依赖 ──────────────────────────────
cd $DEPLOY_DIR
npm install --production
echo "✅ 依赖安装完成"

# ── 7. 重启服务 ──────────────────────────────
pm2 describe $PM2_NAME &> /dev/null \
  && pm2 restart $PM2_NAME \
  || pm2 start server.js --name $PM2_NAME
pm2 save
echo "✅ PM2 进程已重启：$PM2_NAME"

# ── 8. 开机自启 ──────────────────────────────
pm2 startup systemd -u root --hp /root | tail -1 | bash || true

echo ""
echo "🎉 部署完成！"
echo "   服务：http://127.0.0.1:3001"
echo "   日志：pm2 logs $PM2_NAME"
echo "   健康：curl http://127.0.0.1:3001/api/health"
