#!/usr/bin/env bash
set -euo pipefail
umask 077

release_id="${1:?release id required}"
failed_site_id="${2:?failed site release id required}"
good_site_id="${3:?active site release id required}"
failed_site="/www/wwwroot/zhiyincareer-next-production/releases/$failed_site_id"
good_site="/www/wwwroot/zhiyincareer-next-production/releases/$good_site_id"
backup="/var/lib/jobapp-server/backups/$release_id-before.db"

test "$(readlink -f /www/wwwroot/zhiyincareer-next-production/current)" = "$good_site"
test "$(readlink -f "/proc/$(pm2 pid zhiyincareer-next-production | tail -1)/cwd")" = "$good_site"
test "$(readlink -f /www/wwwroot/zhiyincareer-main/current)" = "/www/wwwroot/zhiyincareer-main/releases/$release_id"
test -f "/tmp/$release_id-cutover/jobapp-before.db"
test ! -e "$backup"
test -d /var/lib/jobapp-server/backups
install -m 600 "/tmp/$release_id-cutover/jobapp-before.db" "$backup"
test "$(sqlite3 "$backup" 'PRAGMA integrity_check')" = ok

if [[ -d "$failed_site" ]]; then
  test ! -L "$failed_site"
  test "$(readlink -f "$failed_site")" = "$failed_site"
  rm -rf -- "$failed_site"
fi
for scratch in "/tmp/$release_id-preflight" "/tmp/$release_id-cutover" "/tmp/$failed_site_id-preflight" "/tmp/$good_site_id-preflight"; do
  test -d "$scratch"
  test ! -L "$scratch"
  test "$(readlink -f "$scratch")" = "$scratch"
done
rm -rf -- "/tmp/$release_id-preflight" "/tmp/$release_id-cutover" "/tmp/$failed_site_id-preflight" "/tmp/$good_site_id-preflight"
rm -f -- "/tmp/$release_id-jobs.js" "/tmp/$release_id-preflight.sh" "/tmp/$release_id-cutover.sh" "/tmp/$failed_site_id.tar.gz" "/tmp/$good_site_id.tar.gz" "/tmp/$failed_site_id-preflight.sh" "/tmp/$good_site_id-preflight.sh"
echo "SECURE_BACKUP=$backup"
echo 'UNUSED_PREFLIGHT_AND_FAILED_SITE_REMOVED=1'
