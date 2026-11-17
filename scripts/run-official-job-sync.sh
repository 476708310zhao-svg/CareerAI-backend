#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/www/wwwroot/zhiyincareer-main/current}"
LOG_DIR="${LOG_DIR:-/var/log/jobapp-server}"
DB_PATH="${OFFICIAL_JOB_SYNC_DB_PATH:?Set OFFICIAL_JOB_SYNC_DB_PATH to the verified database path}"

cd "$APP_DIR"
mkdir -p "$LOG_DIR"
exec >> "$LOG_DIR/official-job-sync.log" 2>&1

if [ ! -f "$DB_PATH" ]; then
  echo "[$(date '+%F %T')] official job sync database missing: $DB_PATH"
  exit 1
fi
if ! command -v flock >/dev/null 2>&1; then
  echo "[$(date '+%F %T')] flock is required for single-instance official job sync"
  exit 1
fi

exec 9>"$LOG_DIR/official-job-sync.lock"
if ! flock -n 9; then
  echo "[$(date '+%F %T')] previous official job sync is still running"
  exit 0
fi

NODE_BIN_DIR="${NODE_BIN_DIR:-/root/.nvm/versions/node/v20.20.2/bin}"
if [ ! -x "$NODE_BIN_DIR/node" ]; then
  NODE_BIN_DIR="$(dirname "$(command -v node)")"
fi
export PATH="$NODE_BIN_DIR:$PATH"

echo "[$(date '+%F %T')] official job sync started with $(node -v)"
node scripts/sync_official_jobs.js --run --db="$DB_PATH"
echo "[$(date '+%F %T')] official job sync finished"
