#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/www/wwwroot/zhiyincareer-main/current}"
LOG_DIR="${LOG_DIR:-/var/log/jobapp-server}"
cd "$APP_DIR"
mkdir -p "$LOG_DIR"
exec >> "$LOG_DIR/campus-sync.log" 2>&1

DB_PATH="${CAMPUS_SYNC_DB_PATH:-${DB_PATH:-/var/lib/jobapp-server/db/jobapp.db}}"
export DB_PATH
NODE_BIN_DIR="${NODE_BIN_DIR:-/root/.nvm/versions/node/v20.20.2/bin}"

if [ ! -x "$NODE_BIN_DIR/node" ]; then
  NODE_BIN_DIR="$(dirname "$(command -v node)")"
fi

export PATH="$NODE_BIN_DIR:$PATH"

echo "[$(date '+%F %T')] campus sync using node: $(node -v), npm: $(npm -v)"
npm run sync:campus
