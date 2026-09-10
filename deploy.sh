#!/bin/bash
# =============================================
# 留学生求职小程序 后端部署脚本
# 适用：OpenCloudOS 9.4 + 宝塔面板
# 部署路径：版本目录 + current 软链接，业务数据保存在独立共享目录。
# =============================================
set -e

APP_ROOT=/www/wwwroot/zhiyincareer-main
DEPLOY_DIR="$(pwd)"
DATA_ROOT=/var/lib/jobapp-server
PM2_NAME=jobapp-server

echo "🚀 开始部署求职小程序后端..."

# ── 1. 检查 Node.js ────────────────────────
if ! command -v node &> /dev/null; then
  echo "📦 安装 Node.js 20..."
  curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
  yum install -y nodejs
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(`.`)[0]')"
if [ "$NODE_MAJOR" -ne 20 ]; then
  echo "❌ 需要 Node.js 20，当前为 $(node -v)"
  exit 1
fi
echo "✅ Node.js: $(node -v)"

# ── 2. 检查 PM2 ─────────────────────────────
if ! command -v pm2 &> /dev/null; then
  npm install -g pm2
fi
echo "✅ PM2: $(pm2 -v)"

# ── 3. 准备共享配置与数据目录 ────────────────
SHARED_ENV="$DATA_ROOT/.env"
LEGACY_ENV="/www/wwwroot/jobapp-server/.env"
mkdir -p "$APP_ROOT/releases" "$DATA_ROOT/db" "$DATA_ROOT/uploads" "$DATA_ROOT/data" /var/log/jobapp-server

# ── 4. 校验当前版本目录 ─────────────────────
case "$DEPLOY_DIR" in
  "$APP_ROOT"/releases/*) ;;
  *) echo "❌ deploy.sh 必须在 $APP_ROOT/releases/<release> 中执行"; exit 1 ;;
esac

# ── 5. 链接共享 .env ────────────────────────
if [ -f "$LEGACY_ENV" ] && [ "$LEGACY_ENV" != "$SHARED_ENV" ] \
  && ! grep -Eq '^[[:space:]]*JWT_SECRET[[:space:]]*=[[:space:]]*[^[:space:]#]+' "$SHARED_ENV" 2>/dev/null \
  && grep -Eq '^[[:space:]]*JWT_SECRET[[:space:]]*=[[:space:]]*[^[:space:]#]+' "$LEGACY_ENV"; then
  cp "$LEGACY_ENV" "$SHARED_ENV"
  chmod 600 "$SHARED_ENV"
  echo "✅ 已从旧版部署目录迁移共享 .env 配置"
elif [ ! -f "$SHARED_ENV" ]; then
  cp "$DEPLOY_DIR/.env.example" "$SHARED_ENV"
  chmod 600 "$SHARED_ENV"
  echo ""
  echo "⚠️  首次部署：请编辑 .env 填入 API 密钥"
  echo "    nano $SHARED_ENV"
  echo ""
fi
ln -sfn "$SHARED_ENV" "$DEPLOY_DIR/.env"

# ── 6. 安装依赖 ──────────────────────────────
cd "$DEPLOY_DIR"
npm ci --omit=dev
CHECK_ROOT="$(mktemp -d /tmp/jobapp-release-check.XXXXXX)"
trap 'case "$CHECK_ROOT" in /tmp/jobapp-release-check.*) rm -rf -- "$CHECK_ROOT" ;; esac' EXIT
NODE_ENV=test \
DB_PATH="$CHECK_ROOT/jobapp.db" \
DATA_DIR="$CHECK_ROOT/data" \
UPLOAD_DIR="$CHECK_ROOT/uploads" \
PAYMENT_ENABLED=false \
npm run check:release
npm run migrate:v4
NODE_ENV=production npm run preflight:runtime:strict

# 在隔离端口启动同一版本，readiness 通过后才允许替换 current。
CANDIDATE_NAME=jobapp-server-candidate
CANDIDATE_PORT=4401
pm2 delete "$CANDIDATE_NAME" >/dev/null 2>&1 || true
PM2_APP_NAME="$CANDIDATE_NAME" PORT="$CANDIDATE_PORT" pm2 start ecosystem.config.cjs --only "$CANDIDATE_NAME"
if ! HEALTHCHECK_BASE_URL="http://127.0.0.1:$CANDIDATE_PORT" npm run healthcheck; then
  pm2 logs "$CANDIDATE_NAME" --nostream --lines 120 || true
  pm2 delete "$CANDIDATE_NAME" >/dev/null 2>&1 || true
  echo "❌ 候选版本 readiness 失败，未切换 current"
  exit 1
fi
pm2 delete "$CANDIDATE_NAME" >/dev/null 2>&1 || true

# Register daily Feishu campus calendar sync.
if command -v crontab &> /dev/null; then
  CAMPUS_SYNC_CRON="0 6 * * * /bin/bash $APP_ROOT/current/scripts/run-campus-sync.sh"
  REMINDER_DISPATCH_CRON="10 8 * * * /bin/bash $APP_ROOT/current/scripts/run-reminder-dispatch.sh"
  (crontab -l 2>/dev/null | grep -v "sync:campus" | grep -v "sync_feishu_server.js" | grep -v "run-campus-sync.sh" | grep -v "dispatch:reminders" | grep -v "dispatch_reminders.js" | grep -v "run-reminder-dispatch.sh"; echo "$CAMPUS_SYNC_CRON"; echo "$REMINDER_DISPATCH_CRON") | crontab -
  echo "Registered daily Feishu campus sync at 06:00"
  echo "Registered daily job reminder dispatch at 08:10"
else
  echo "crontab not found; configure manually against $APP_ROOT/current"
fi
echo "✅ 依赖安装完成"

# ── 7. 重启服务 ──────────────────────────────
PREVIOUS_RELEASE="$(readlink -f "$APP_ROOT/current" 2>/dev/null || true)"
ln -sfn "$DEPLOY_DIR" "$APP_ROOT/current"
cd "$APP_ROOT/current"
pm2 describe "$PM2_NAME" &> /dev/null \
  && pm2 reload ecosystem.config.cjs --update-env \
  || pm2 start ecosystem.config.cjs
pm2 save
if ! HEALTHCHECK_BASE_URL=http://127.0.0.1:4400 npm run healthcheck; then
  if [ -n "$PREVIOUS_RELEASE" ] && [ -d "$PREVIOUS_RELEASE" ]; then
    ln -sfn "$PREVIOUS_RELEASE" "$APP_ROOT/current"
    cd "$APP_ROOT/current"
    pm2 reload ecosystem.config.cjs --update-env
  fi
  echo "❌ 健康检查失败，已尝试回滚 current"
  exit 1
fi
echo "✅ PM2 进程已重启：$PM2_NAME"

# ── 8. 开机自启 ──────────────────────────────
pm2 startup systemd -u root --hp /root | tail -1 | bash || true

echo ""
echo "🎉 部署完成！"
echo "   服务：http://127.0.0.1:4400"
echo "   日志：pm2 logs $PM2_NAME"
echo "   健康：curl http://127.0.0.1:4400/api/health/ready"
