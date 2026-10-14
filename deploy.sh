#!/bin/bash
# =============================================
# 留学生求职小程序 后端部署脚本
# 适用：OpenCloudOS 9.4 + 宝塔面板
# 部署路径：版本目录 + current 软链接，业务数据保存在独立共享目录。
# =============================================
set -euo pipefail

APP_ROOT=/www/wwwroot/zhiyincareer-main
DEPLOY_DIR="$(pwd -P)"
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
[ -s "$SHARED_ENV" ] || {
  echo "❌ 共享生产配置 $SHARED_ENV 缺失或为空，停止发布；不得从 .env.example 自动生成" >&2
  exit 1
}
ln -sfn "$SHARED_ENV" "$DEPLOY_DIR/.env"

# ── 6. 安装依赖 ──────────────────────────────
cd "$DEPLOY_DIR"
npm ci --omit=dev
CHECK_ROOT="$(mktemp -d /tmp/jobapp-release-check.XXXXXX)"
CANDIDATE_NAME="${PM2_NAME}-candidate-$$"
CUTOVER_ACTIVE=0
cleanup() {
  local status=$?
  trap - EXIT INT TERM
  if [ "$CUTOVER_ACTIVE" -eq 1 ]; then
    [ "$status" -ne 0 ] || status=1
    if ! rollback_release; then
      echo "❌ 自动回滚未完成，需人工处理" >&2
    fi
  fi
  pm2 delete "$CANDIDATE_NAME" >/dev/null 2>&1 || true
  case "$CHECK_ROOT" in
    /tmp/jobapp-release-check.*) [ -d "$CHECK_ROOT" ] && rm -rf -- "$CHECK_ROOT" ;;
  esac
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
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
  pm2 jlist --silent | node "$DEPLOY_DIR/scripts/verify-pm2-instance.js" "$1" "$2"
}
pm2_release_path() {
  pm2 jlist --silent | node "$DEPLOY_DIR/scripts/verify-pm2-instance.js" --release "$PM2_NAME"
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
[ ! -e "$APP_ROOT/current" ] || [ -L "$APP_ROOT/current" ] || {
  echo "❌ current 不是软链接，拒绝切换" >&2
  exit 1
}
PREVIOUS_LINK_TARGET=""
if [ -L "$APP_ROOT/current" ]; then
  PREVIOUS_LINK_TARGET="$(readlink -- "$APP_ROOT/current")"
fi
PREVIOUS_PM2_RELEASE="$(pm2_release_path)"
PREVIOUS_PM2_PID=""
if [ -n "$PREVIOUS_PM2_RELEASE" ]; then
  case "$PREVIOUS_PM2_RELEASE" in
    "$APP_ROOT"/releases/*) ;;
    *) echo "❌ PM2 实际版本不在受管发布目录，停止切流" >&2; exit 1 ;;
  esac
  [ -f "$PREVIOUS_PM2_RELEASE/ecosystem.config.cjs" ] || {
    echo "❌ PM2 实际旧版本缺少启动配置，无法保证回滚" >&2
    exit 1
  }
  PREVIOUS_PM2_PID="$(pm2_release_pid "$PM2_NAME" "$PREVIOUS_PM2_RELEASE")"
  ss -ltnp '( sport = :4400 )' | grep -Fq "pid=$PREVIOUS_PM2_PID," || {
    echo "❌ 4400 监听者不是已记录的旧 PM2 实例，停止切流" >&2
    exit 1
  }
elif ss -ltn '( sport = :4400 )' | grep -q LISTEN; then
  echo "❌ 4400 被非受管进程占用，停止切流" >&2
  exit 1
fi

baseline_unchanged() {
  if [ -n "$PREVIOUS_LINK_TARGET" ]; then
    [ -L "$APP_ROOT/current" ] && [ "$(readlink -- "$APP_ROOT/current")" = "$PREVIOUS_LINK_TARGET" ] || return 1
  else
    [ ! -e "$APP_ROOT/current" ] && [ ! -L "$APP_ROOT/current" ] || return 1
  fi
  [ "$(pm2_release_path)" = "$PREVIOUS_PM2_RELEASE" ] || return 1
  if [ -n "$PREVIOUS_PM2_RELEASE" ]; then
    [ "$(pm2_release_pid "$PM2_NAME" "$PREVIOUS_PM2_RELEASE")" = "$PREVIOUS_PM2_PID" ] || return 1
  fi
}
baseline_unchanged || { echo "❌ 切流前 current 或 PM2 基线发生变化" >&2; exit 1; }

switch_current_link() {
  local target="$1" temp_dir
  temp_dir="$(mktemp -d "$APP_ROOT/.current-switch.XXXXXX")" || return 1
  if ! ln -s -- "$target" "$temp_dir/current"; then
    rmdir -- "$temp_dir" || true
    return 1
  fi
  if ! mv -Tf -- "$temp_dir/current" "$APP_ROOT/current"; then
    rm -- "$temp_dir/current" || true
    rmdir -- "$temp_dir" || true
    return 1
  fi
  rmdir -- "$temp_dir" || return 1
  [ -L "$APP_ROOT/current" ] && [ "$(readlink -- "$APP_ROOT/current")" = "$target" ]
}

rollback_release() {
  echo "❌ 发布检查失败，恢复原链接和原 PM2 实际版本" >&2
  local process_ok=1 link_ok=1
  # A failed link switch or PM2 delete may leave the original process untouched.
  # Preserve its PID instead of causing an unnecessary second outage.
  if [ -n "$PREVIOUS_PM2_RELEASE" ] &&
     [ "$(pm2_release_path)" = "$PREVIOUS_PM2_RELEASE" ] &&
     [ "$(pm2_release_pid "$PM2_NAME" "$PREVIOUS_PM2_RELEASE")" = "$PREVIOUS_PM2_PID" ] &&
     ss -ltnp '( sport = :4400 )' | grep -Fq "pid=$PREVIOUS_PM2_PID,"; then
    :
  else
    if pm2 describe "$PM2_NAME" >/dev/null 2>&1 && ! pm2 delete "$PM2_NAME"; then
      process_ok=0
    fi
    if [ "$process_ok" -eq 1 ] && [ -n "$PREVIOUS_PM2_RELEASE" ]; then
      if ! cd "$PREVIOUS_PM2_RELEASE" || ! pm2 start ecosystem.config.cjs ||
         ! HEALTHCHECK_BASE_URL=http://127.0.0.1:4400 npm run healthcheck; then
        process_ok=0
      else
        OLD_PID="$(pm2_release_pid "$PM2_NAME" "$PREVIOUS_PM2_RELEASE")" || process_ok=0
        if [ "$process_ok" -eq 1 ] &&
           ! ss -ltnp '( sport = :4400 )' | grep -Fq "pid=$OLD_PID,"; then
          process_ok=0
        fi
      fi
    elif [ "$process_ok" -eq 1 ] && ss -ltn '( sport = :4400 )' | grep -q LISTEN; then
      process_ok=0
    fi
  fi
  if [ -n "$PREVIOUS_LINK_TARGET" ]; then
    switch_current_link "$PREVIOUS_LINK_TARGET" || link_ok=0
  elif [ -L "$APP_ROOT/current" ] && [ "$(readlink -f "$APP_ROOT/current")" = "$DEPLOY_DIR" ]; then
    rm -- "$APP_ROOT/current" || link_ok=0
  elif [ -e "$APP_ROOT/current" ] || [ -L "$APP_ROOT/current" ]; then
    link_ok=0
  fi
  if [ "$process_ok" -eq 1 ]; then
    pm2 save || process_ok=0
  fi
  [ "$process_ok" -eq 1 ] && [ "$link_ok" -eq 1 ]
}

CUTOVER_ACTIVE=1
if ! switch_current_link "$DEPLOY_DIR"; then
  exit 1
fi
if [ -n "$PREVIOUS_PM2_RELEASE" ]; then
  if ! pm2 delete "$PM2_NAME"; then
    exit 1
  fi
fi
cd "$DEPLOY_DIR"
if ! pm2 start ecosystem.config.cjs; then
  exit 1
fi
if ! HEALTHCHECK_BASE_URL=http://127.0.0.1:4400 npm run healthcheck; then
  exit 1
fi
if ! LIVE_PID="$(pm2_release_pid "$PM2_NAME" "$DEPLOY_DIR")" ||
   ! ss -ltnp '( sport = :4400 )' | grep -Fq "pid=$LIVE_PID,"; then
  echo "❌ 4400 监听进程不是本次发布的 PM2 实例" >&2
  exit 1
fi
if [ ! -L "$APP_ROOT/current" ] || [ "$(readlink -f "$APP_ROOT/current")" != "$DEPLOY_DIR" ]; then
  echo "❌ current 未指向本次发布版本" >&2
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
  exit 1
fi
if ! pm2 save; then
  exit 1
fi
CUTOVER_ACTIVE=0
echo "✅ PM2 进程已重启：$PM2_NAME"

echo ""
echo "🎉 部署完成！"
echo "   服务：http://127.0.0.1:4400"
echo "   日志：pm2 logs $PM2_NAME"
echo "   健康：curl http://127.0.0.1:4400/api/health/ready"
