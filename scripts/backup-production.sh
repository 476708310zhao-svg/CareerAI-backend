#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${APP_NAME:-jobapp-server}"
APP_DATA_DIR="${APP_DATA_DIR:-/var/lib/jobapp-server}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/jobapp-server}"
TS="$(date +%Y%m%d_%H%M%S)"
DEST="$BACKUP_DIR/${APP_NAME}_${TS}"

mkdir -p "$DEST"

if command -v sqlite3 >/dev/null 2>&1 && [ -f "$APP_DATA_DIR/db/jobapp.db" ]; then
  sqlite3 "$APP_DATA_DIR/db/jobapp.db" ".backup '$DEST/jobapp.db'"
else
  cp -a "$APP_DATA_DIR/db/jobapp.db"* "$DEST/" 2>/dev/null || true
fi

if [ -d "$APP_DATA_DIR/uploads" ]; then
  tar -czf "$DEST/uploads.tar.gz" -C "$APP_DATA_DIR" uploads
fi

if [ -d "$APP_DATA_DIR/data" ]; then
  tar -czf "$DEST/data.tar.gz" -C "$APP_DATA_DIR" data
fi

find "$BACKUP_DIR" -maxdepth 1 -type d -name "${APP_NAME}_*" -mtime +14 -exec rm -rf {} +

echo "Backup created: $DEST"
