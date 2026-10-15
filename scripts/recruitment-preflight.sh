#!/usr/bin/env bash
set -euo pipefail
umask 077

release_id="${1:?release id required}"
old_release="${2:?running release required}"
candidate="/www/wwwroot/zhiyincareer-main/releases/$release_id"
payload="/tmp/$release_id-jobs.js"
scratch="/tmp/$release_id-preflight"
port=4499

test ! -e "$candidate"
test -f "$payload"
test -f "$old_release/server.js"
test "$(readlink -f "/proc/$(pm2 pid jobapp-server | tail -1)/cwd")" = "$old_release"
test "$(sqlite3 /var/lib/jobapp-server/db/jobapp.db "SELECT enabled FROM feature_flags WHERE feature='recruitment'")" = 0
mkdir -p "$scratch/db" "$scratch/data" "$scratch/uploads"
sqlite3 /var/lib/jobapp-server/db/jobapp.db ".backup '$scratch/db/jobapp.db'"
sqlite3 "$scratch/db/jobapp.db" "UPDATE feature_flags SET enabled=1 WHERE feature='recruitment'"
cp /var/lib/jobapp-server/data/jobs.json "$scratch/data/jobs.json"
cp -a "$old_release" "$candidate"
cp "$payload" "$candidate/routes/jobs.js"
node --check "$candidate/routes/jobs.js"

cd "$candidate"
DB_PATH="$scratch/db/jobapp.db" DATA_DIR="$scratch/data" UPLOAD_DIR="$scratch/uploads" PORT="$port" NODE_ENV=production node server.js >"$scratch/server.log" 2>&1 &
preflight_pid=$!
cleanup() { kill "$preflight_pid" 2>/dev/null || true; wait "$preflight_pid" 2>/dev/null || true; }
trap cleanup EXIT

ready=false
for _ in $(seq 1 30); do
  if curl -fsS --max-time 2 "http://127.0.0.1:$port/api/health/ready" >"$scratch/ready.json" 2>/dev/null; then ready=true; break; fi
  sleep 1
done
test "$ready" = true
kill -0 "$preflight_pid"
curl -fsS --max-time 30 "http://127.0.0.1:$port/api/jobs/map?pageSize=100" >"$scratch/map.json"
curl -fsS --max-time 30 "http://127.0.0.1:$port/api/jobs?pageSize=20" >"$scratch/list.json"
node - "$scratch/map.json" "$scratch/list.json" <<'NODE'
const fs = require('fs');
const [map, list] = process.argv.slice(2).map(path => JSON.parse(fs.readFileSync(path, 'utf8')));
for (const [name, payload] of [['map', map], ['list', list]]) {
  if (payload.code !== 0 || !Array.isArray(payload.data?.list) || !payload.data.list.length) throw new Error(`${name} has no live jobs`);
  if (payload.data.list.some(job => !['fresh', 'aging'].includes(job.dataMeta?.freshness))) throw new Error(`${name} contains stale jobs`);
  console.log(`${name.toUpperCase()}_COUNT=${payload.data.list.length} SOURCE=${payload.data.source}`);
}
console.log(`DETAIL_ID=${list.data.list[0].id}`);
NODE
detail_id="$(node -p "require('$scratch/list.json').data.list[0].id")"
curl -fsS --max-time 15 "http://127.0.0.1:$port/api/jobs/$detail_id" >"$scratch/job-detail.json"
node - "$scratch/job-detail.json" <<'NODE'
const fs = require('fs');
const detail = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (detail.code !== 0 || !detail.data?.id) throw new Error('job detail unavailable');
console.log(`DETAIL_OK=${detail.data.id}`);
NODE
echo "CANDIDATE=$candidate"
echo "OLD_RELEASE=$old_release"
