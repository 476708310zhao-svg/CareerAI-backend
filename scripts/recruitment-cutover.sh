#!/usr/bin/env bash
set -euo pipefail
umask 077

release_id="${1:?release id required}"
site_id="${2:?site release id required}"
old_backend="${3:?old backend process release required}"
old_backend_link="${4:?old backend current release required}"
old_site="${5:?old site process release required}"
expected_backend_pid="${6:?backend PID required}"
expected_site_pid="${7:?site PID required}"
backend="/www/wwwroot/zhiyincareer-main/releases/$release_id"
site="/www/wwwroot/zhiyincareer-next-production/releases/$site_id"
backend_link=/www/wwwroot/zhiyincareer-main/current
site_link=/www/wwwroot/zhiyincareer-next-production/current
database=/var/lib/jobapp-server/db/jobapp.db
scratch="/tmp/$release_id-cutover"
backend_switched=false
site_switched=false
flag_opened=false

switch_link() {
  local link="$1" target="$2" next="$1.next-$release_id"
  ln -s "$target" "$next"
  mv -Tf "$next" "$link"
}

rollback() {
  local exit_code=$?
  trap - ERR INT TERM HUP
  set +e
  if [[ "$flag_opened" == true ]]; then
    sqlite3 "$database" "BEGIN IMMEDIATE; UPDATE feature_flags SET enabled=0,updated_at=CURRENT_TIMESTAMP WHERE feature='recruitment'; COMMIT;"
  fi
  if [[ "$site_switched" == true ]]; then
    pm2 delete zhiyincareer-next-production >/dev/null 2>&1
    switch_link "$site_link" "$old_site"
    cd "$old_site"
    HOSTNAME=127.0.0.1 PORT=3102 NODE_ENV=production pm2 start server.js --name zhiyincareer-next-production >/dev/null 2>&1
  fi
  if [[ "$backend_switched" == true ]]; then
    pm2 delete jobapp-server >/dev/null 2>&1
    switch_link "$backend_link" "$old_backend_link"
    cd "$old_backend"
    pm2 start ecosystem.config.cjs >/dev/null 2>&1
  fi
  pm2 save >/dev/null 2>&1
  echo "CUTOVER_FAILED=$exit_code ROLLBACK_ATTEMPTED=1" >&2
  exit "$exit_code"
}
trap rollback ERR INT TERM HUP

test -f "$backend/server.js"
test -f "$backend/routes/jobs.js"
test -f "$site/server.js"
test -f "$site/.next/BUILD_ID"
test "$(pm2 pid jobapp-server | tail -1)" = "$expected_backend_pid"
test "$(pm2 pid zhiyincareer-next-production | tail -1)" = "$expected_site_pid"
test "$(readlink -f "/proc/$expected_backend_pid/cwd")" = "$old_backend"
test "$(readlink -f "/proc/$expected_site_pid/cwd")" = "$old_site"
test "$(readlink -f "$backend_link")" = "$old_backend_link"
test "$(readlink -f "$site_link")" = "$old_site"
test "$(sqlite3 "$database" "SELECT enabled FROM feature_flags WHERE feature='recruitment'")" = 0
mkdir -p "$scratch"
sqlite3 "$database" ".backup '$scratch/jobapp-before.db'"
test "$(sqlite3 "$scratch/jobapp-before.db" 'PRAGMA integrity_check')" = ok

pm2 delete jobapp-server >"$scratch/backend-stop.log" 2>&1
backend_switched=true
cd "$backend"
pm2 start ecosystem.config.cjs >"$scratch/backend-start.log" 2>&1
test "$(readlink -f "/proc/$(pm2 pid jobapp-server | tail -1)/cwd")" = "$backend"
ready=false
for _ in $(seq 1 30); do
  if curl -fsS --max-time 2 http://127.0.0.1:4400/api/health/ready >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
test "$ready" = true
switch_link "$backend_link" "$backend"
echo BACKEND_CUTOVER_OK=1

pm2 delete zhiyincareer-next-production >"$scratch/site-stop.log" 2>&1
site_switched=true
cd "$site"
HOSTNAME=127.0.0.1 PORT=3102 NODE_ENV=production pm2 start server.js --name zhiyincareer-next-production >"$scratch/site-start.log" 2>&1
test "$(readlink -f "/proc/$(pm2 pid zhiyincareer-next-production | tail -1)/cwd")" = "$site"
ready=false
for _ in $(seq 1 30); do
  if curl -fsS --max-time 2 http://127.0.0.1:3102/jobs >"$scratch/jobs.html" 2>/dev/null; then ready=true; break; fi
  sleep 1
done
test "$ready" = true
switch_link "$site_link" "$site"
echo SITE_CUTOVER_OK=1

changed="$(sqlite3 "$database" "BEGIN IMMEDIATE; UPDATE feature_flags SET enabled=1,updated_at=CURRENT_TIMESTAMP WHERE feature='recruitment' AND enabled=0; SELECT changes(); COMMIT;")"
test "$changed" = 1
flag_opened=true

curl -fsS --max-time 30 'http://127.0.0.1:4400/api/jobs/map?pageSize=100' >"$scratch/map.json"
curl -fsS --max-time 30 'http://127.0.0.1:4400/api/jobs?pageSize=20' >"$scratch/list.json"
node - "$scratch/map.json" "$scratch/list.json" <<'NODE'
const fs = require('fs');
for (const path of process.argv.slice(2)) {
  const payload = JSON.parse(fs.readFileSync(path, 'utf8'));
  if (payload.code !== 0 || !Array.isArray(payload.data?.list) || !payload.data.list.length) throw new Error(`${path}: empty recruitment data`);
  if (payload.data.list.some(job => !['fresh', 'aging'].includes(job.dataMeta?.freshness))) throw new Error(`${path}: stale recruitment data`);
  console.log(`CHECKED_${path.endsWith('map.json') ? 'MAP' : 'LIST'}=${payload.data.list.length}`);
}
NODE
job_id="$(node -p "require('$scratch/list.json').data.list[0].id")"
curl -fsS --max-time 15 "http://127.0.0.1:4400/api/jobs/$job_id" >"$scratch/detail.json"
node - "$scratch/detail.json" <<'NODE'
const fs = require('fs');
const payload = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (payload.code !== 0 || !payload.data?.id) throw new Error('job detail missing');
NODE
curl -fsS --max-time 15 "http://127.0.0.1:3102/jobs/$job_id" >"$scratch/detail.html"
grep -Fq "$job_id" "$scratch/detail.html"
curl -fsS --max-time 15 'https://www.zhiyincareer.com/backend/api/jobs?pageSize=20' >"$scratch/public-list.json"
node - "$scratch/public-list.json" <<'NODE'
const fs = require('fs');
const payload = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (payload.code !== 0 || !payload.data?.list?.length) throw new Error('public recruitment API empty');
console.log(`PUBLIC_LIST=${payload.data.list.length}`);
NODE
curl -fsS --max-time 15 "https://www.zhiyincareer.com/jobs/$job_id" >/dev/null
pm2 save >"$scratch/pm2-save.log" 2>&1
trap - ERR INT TERM HUP
echo "RECRUITMENT_OPEN=1 DETAIL_ID=$job_id"
echo "BACKEND_RELEASE=$backend"
echo "SITE_RELEASE=$site"
