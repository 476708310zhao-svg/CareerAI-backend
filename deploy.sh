#!/bin/bash
# =============================================
# 留学生求职小程序 后端部署脚本
# 适用：OpenCloudOS 9.4 + 宝塔面板
# 部署路径：版本目录 + current 软链接，业务数据保存在独立共享目录。
# =============================================
set -euo pipefail

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
mkdir -p "$APP_ROOT/releases" "$DATA_ROOT/db" "$DATA_ROOT/uploads" "$DATA_ROOT/data" /var/log/jobapp-server

# ── 4. 校验当前版本目录 ─────────────────────
case "$DEPLOY_DIR" in
  "$APP_ROOT"/releases/*) ;;
  *) echo "❌ deploy.sh 必须在 $APP_ROOT/releases/<release> 中执行"; exit 1 ;;
esac

# ── 5. 链接共享 .env ────────────────────────
if [ ! -f "$SHARED_ENV" ]; then
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
CANDIDATE_NAME="${PM2_NAME}-candidate-$$"
cleanup() {
  pm2 delete "$CANDIDATE_NAME" >/dev/null 2>&1 || true
  case "$CHECK_ROOT" in
    /tmp/jobapp-release-check.*) [ -d "$CHECK_ROOT" ] && rm -rf -- "$CHECK_ROOT" ;;
  esac
}
trap cleanup EXIT
NODE_ENV=test \
DB_PATH="$CHECK_ROOT/jobapp.db" \
DATA_DIR="$CHECK_ROOT/data" \
UPLOAD_DIR="$CHECK_ROOT/uploads" \
PAYMENT_ENABLED=false \
npm run check:release
NODE_ENV=test DB_PATH="$CHECK_ROOT/acceptance.db" \
DATA_DIR="$CHECK_ROOT/acceptance-data" UPLOAD_DIR="$CHECK_ROOT/acceptance-uploads" \
PAYMENT_ENABLED=false npm run check:acceptance -- --no-report

# Read migration state without opening the live database through db/database.js.
# Startup DDL and V4 dry-run must only run against a consistent private snapshot.
LIVE_DB="$DATA_ROOT/db/jobapp.db"
[ -f "$LIVE_DB" ] || { echo "❌ 生产数据库不存在，停止发布" >&2; exit 1; }
MIGRATION_STATUS="$(node scripts/migrate_database.js --db="$LIVE_DB" --status)"
printf '%s' "$MIGRATION_STATUS" | node -e '
  let input = "";
  process.stdin.on("data", chunk => { input += chunk; });
  process.stdin.on("end", () => {
    const status = JSON.parse(input);
    if (!status.trackingTableExists || status.pending.length > 0) {
      console.error(`❌ 生产 schema migration 未完成：pending=${status.pending.length}；须先获批并手动迁移`);
      process.exitCode = 1;
    }
  });
'
command -v sqlite3 >/dev/null 2>&1 || { echo "❌ 需要 sqlite3 创建隔离快照" >&2; exit 1; }
sqlite3 "$LIVE_DB" ".backup '$CHECK_ROOT/candidate.db'"
[ -s "$CHECK_ROOT/candidate.db" ] || { echo "❌ 候选数据库快照为空" >&2; exit 1; }
[ "$(sqlite3 "$CHECK_ROOT/candidate.db" 'PRAGMA integrity_check;')" = ok ] || {
  echo "❌ 候选数据库快照完整性校验失败" >&2
  exit 1
}
NODE_ENV=production DB_PATH="$CHECK_ROOT/candidate.db" \
DATA_DIR="$CHECK_ROOT/data" UPLOAD_DIR="$CHECK_ROOT/uploads" npm run migrate:v4
NODE_ENV=production DB_PATH="$CHECK_ROOT/candidate.db" \
DATA_DIR="$CHECK_ROOT/data" UPLOAD_DIR="$CHECK_ROOT/uploads" npm run preflight:runtime:strict

# 在隔离端口启动同一版本，readiness 通过后才允许替换 current。
pm2_release_pid() {
  pm2 jlist | node scripts/verify-pm2-instance.js "$1" "$2"
}
CANDIDATE_PORT=4401
command -v ss >/dev/null 2>&1 || { echo "❌ 缺少 ss，无法核验候选监听进程" >&2; exit 1; }
if ss -ltn "( sport = :$CANDIDATE_PORT )" | grep -q LISTEN; then
  echo "❌ 候选端口 $CANDIDATE_PORT 已被占用，停止发布" >&2
  exit 1
fi
NODE_ENV=production DB_PATH="$CHECK_ROOT/candidate.db" \
DATA_DIR="$CHECK_ROOT/data" UPLOAD_DIR="$CHECK_ROOT/uploads" \
PORT="$CANDIDATE_PORT" LISTEN_HOST=127.0.0.1 \
pm2 start server.js --name "$CANDIDATE_NAME" --no-autorestart
if ! HEALTHCHECK_BASE_URL="http://127.0.0.1:$CANDIDATE_PORT" npm run healthcheck; then
  pm2 logs "$CANDIDATE_NAME" --nostream --lines 120 || true
  pm2 delete "$CANDIDATE_NAME" >/dev/null 2>&1 || true
  echo "❌ 候选版本 readiness 失败，未切换 current"
  exit 1
fi
CANDIDATE_PID="$(pm2_release_pid "$CANDIDATE_NAME" "$DEPLOY_DIR")"
if ! ss -ltnp "( sport = :$CANDIDATE_PORT )" | grep -F "127.0.0.1:$CANDIDATE_PORT" | grep -Fq "pid=$CANDIDATE_PID,"; then
  echo "❌ readiness 响应不属于当前候选进程，停止发布" >&2
  exit 1
fi
if ! pm2 delete "$CANDIDATE_NAME" >/dev/null 2>&1; then
  echo "❌ 无法停止候选实例，停止发布" >&2
  exit 1
fi

echo "✅ 依赖安装完成"

# ── 7. 重启服务 ──────────────────────────────
PREVIOUS_RELEASE="$(readlink -f "$APP_ROOT/current" 2>/dev/null || true)"
rollback_release() {
  echo "❌ 发布检查失败，尝试恢复旧版本" >&2
  if [ -n "$PREVIOUS_RELEASE" ] && [ -d "$PREVIOUS_RELEASE" ]; then
    ln -sfn "$PREVIOUS_RELEASE" "$APP_ROOT/current" || return 1
    cd "$PREVIOUS_RELEASE" || return 1
    if pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
      pm2 reload ecosystem.config.cjs --update-env || return 1
    else
      pm2 start ecosystem.config.cjs || return 1
    fi
    HEALTHCHECK_BASE_URL=http://127.0.0.1:4400 npm run healthcheck || return 1
    OLD_PID="$(pm2_release_pid "$PM2_NAME" "$PREVIOUS_RELEASE")" || return 1
    ss -ltnp '( sport = :4400 )' | grep -Fq "pid=$OLD_PID," || return 1
    pm2 save || return 1
  else
    if [ -L "$APP_ROOT/current" ] && [ "$(readlink -f "$APP_ROOT/current")" = "$DEPLOY_DIR" ]; then
      rm -- "$APP_ROOT/current" || return 1
    fi
    if pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
      pm2 delete "$PM2_NAME" || return 1
    fi
  fi
}
[ ! -e "$APP_ROOT/current" ] || [ -L "$APP_ROOT/current" ] || {
  echo "❌ current 不是软链接，拒绝切换" >&2
  exit 1
}
ln -sfn "$DEPLOY_DIR" "$APP_ROOT/current"
cd "$DEPLOY_DIR"
if pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
  if ! pm2 reload ecosystem.config.cjs --update-env; then
    rollback_release || echo "❌ 自动回滚未完成，需人工处理" >&2
    exit 1
  fi
elif ! pm2 start ecosystem.config.cjs; then
  rollback_release || echo "❌ 自动回滚未完成，需人工处理" >&2
  exit 1
fi
if ! HEALTHCHECK_BASE_URL=http://127.0.0.1:4400 npm run healthcheck; then
  rollback_release || echo "❌ 自动回滚未完成，需人工处理" >&2
  exit 1
fi
if ! LIVE_PID="$(pm2_release_pid "$PM2_NAME" "$DEPLOY_DIR")" ||
   ! ss -ltnp '( sport = :4400 )' | grep -Fq "pid=$LIVE_PID,"; then
  echo "❌ 4400 监听进程不是本次发布的 PM2 实例" >&2
  rollback_release || echo "❌ 自动回滚未完成，需人工处理" >&2
  exit 1
fi
if ! curl -fsS --max-time 10 https://api.zhiyincareer.com/api/health/ready | node -e '
  let input = "";
  process.stdin.on("data", chunk => { input += chunk; });
  process.stdin.on("end", () => {
    try { if (JSON.parse(input).ready !== true) process.exitCode = 1; }
    catch { process.exitCode = 1; }
  });
'; then
  echo "❌ 公网 API 未就绪（可能仍被官网路由返回 404）" >&2
  rollback_release || echo "❌ 自动回滚未完成，需人工处理" >&2
  exit 1
fi
if ! pm2 save; then
  rollback_release || echo "❌ 自动回滚未完成，需人工处理" >&2
  exit 1
fi
echo "✅ PM2 进程已重启：$PM2_NAME"

echo ""
echo "🎉 部署完成！"
echo "   服务：http://127.0.0.1:4400"
echo "   日志：pm2 logs $PM2_NAME"
echo "   健康：curl http://127.0.0.1:4400/api/health/ready"
