#!/usr/bin/env bash
set -euo pipefail

cd /www/wwwroot/jobapp-server
mkdir -p logs
exec >> /www/wwwroot/jobapp-server/logs/campus-sync.log 2>&1

DB_PATH="${DB_PATH:-/var/lib/jobapp-server/db/jobapp.db}"
if [ ! -f "$DB_PATH" ]; then
  DB_PATH=/www/wwwroot/jobapp-server/db/jobapp.db
fi
export DB_PATH
NODE_BIN_DIR="${NODE_BIN_DIR:-/root/.nvm/versions/node/v20.20.2/bin}"

if [ ! -x "$NODE_BIN_DIR/node" ]; then
  NODE_BIN_DIR="$(dirname "$(command -v node)")"
fi

export PATH="$NODE_BIN_DIR:$PATH"

echo "[$(date '+%F %T')] campus sync using node: $(node -v), npm: $(npm -v)"
npm run sync:campus
