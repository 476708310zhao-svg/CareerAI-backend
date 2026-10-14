#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${APP_NAME:-jobapp-server}"
APP_DATA_DIR="${APP_DATA_DIR:-/var/lib/jobapp-server}"
BACKUP_DIR="${BACKUP_DIR:-/www/backups/zhiyincareer}"
DB_SOURCE="$APP_DATA_DIR/db/jobapp.db"
NGINX_CONFIG_PATH="${NGINX_CONFIG_PATH:-}"
TS="$(date +%Y%m%d_%H%M%S)"

umask 077
[ -f "$DB_SOURCE" ] || { echo "Backup failed: database missing: $DB_SOURCE" >&2; exit 1; }
command -v sqlite3 >/dev/null 2>&1 || { echo "Backup failed: sqlite3 is required for an online SQLite backup" >&2; exit 1; }
[ -n "$NGINX_CONFIG_PATH" ] && [ -f "$NGINX_CONFIG_PATH" ] || {
  echo "Backup failed: set NGINX_CONFIG_PATH to the active Nginx vhost config" >&2
  exit 1
}
NGINX_CONFIG_REAL_PATH="$(readlink -f -- "$NGINX_CONFIG_PATH")"
[ -f "$NGINX_CONFIG_REAL_PATH" ] || { echo "Backup failed: Nginx vhost symlink target is missing" >&2; exit 1; }
command -v pm2 >/dev/null 2>&1 || { echo "Backup failed: pm2 is required to capture the active process config" >&2; exit 1; }
mkdir -p "$BACKUP_DIR"
DEST="$(mktemp -d "$BACKUP_DIR/${APP_NAME}_${TS}.XXXXXX")"
touch "$DEST/.incomplete"

sqlite3 "$DB_SOURCE" ".backup '$DEST/jobapp.db'"
[ -s "$DEST/jobapp.db" ] || { echo "Backup failed: empty database backup" >&2; exit 1; }
[ "$(sqlite3 "$DEST/jobapp.db" 'PRAGMA integrity_check;')" = ok ] || {
  echo "Backup failed: database integrity_check did not return ok" >&2
  exit 1
}

[ -f "$APP_DATA_DIR/.env" ] || { echo "Backup failed: shared .env missing" >&2; exit 1; }
cp -a -- "$APP_DATA_DIR/.env" "$DEST/shared.env"
cp -a -- "$NGINX_CONFIG_REAL_PATH" "$DEST/nginx-vhost.conf"
[ -s "$DEST/shared.env" ] && [ -s "$DEST/nginx-vhost.conf" ] || {
  echo "Backup failed: shared .env or Nginx config is empty" >&2
  exit 1
}
pm2 jlist --silent > "$DEST/pm2-processes.json"
[ -s "$DEST/pm2-processes.json" ] || { echo "Backup failed: empty PM2 process snapshot" >&2; exit 1; }
node -e '
  const rows = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  if (!Array.isArray(rows) || !rows.some(row =>
    row.name === process.argv[2] && row.pm2_env && row.pm2_env.status === "online" &&
    Number.isInteger(row.pid) && row.pid > 1)) {
    throw new Error("online PM2 process is missing from backup");
  }
' "$DEST/pm2-processes.json" "$APP_NAME"

if [ -d "$APP_DATA_DIR/uploads" ]; then
  tar -czf "$DEST/uploads.tar.gz" -C "$APP_DATA_DIR" uploads
fi

if [ -d "$APP_DATA_DIR/data" ]; then
  tar -czf "$DEST/data.tar.gz" -C "$APP_DATA_DIR" data
fi

rm -- "$DEST/.incomplete"

# Keep older backups for manual review; retention must never remove the only verified copy.

echo "Backup created: $DEST"
