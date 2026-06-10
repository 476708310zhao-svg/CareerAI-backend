#!/usr/bin/env bash
set -euo pipefail

cd /www/wwwroot/jobapp-server
mkdir -p logs
exec >> /www/wwwroot/jobapp-server/logs/campus-sync.log 2>&1

export DB_PATH=/www/wwwroot/jobapp-server/db/jobapp.db

npm run sync:campus
