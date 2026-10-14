'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { verifiedPid } = require('../scripts/verify-pm2-instance');

const root = path.join(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('production backup fails closed and verifies a consistent SQLite copy plus runtime config', () => {
  const script = read('scripts/backup-production.sh');
  assert.match(script, /\[ -f "\$DB_SOURCE" \] \|\|/);
  assert.match(script, /command -v sqlite3/);
  assert.match(script, /\.backup '\$DEST\/jobapp\.db'/);
  assert.match(script, /PRAGMA integrity_check/);
  assert.match(script, /\$APP_DATA_DIR\/\.env/);
  assert.match(script, /NGINX_CONFIG_PATH/);
  assert.match(script, /readlink -f -- "\$NGINX_CONFIG_PATH"/);
  assert.match(script, /pm2 jlist/);
  assert.match(script, /\.incomplete/);
  assert.doesNotMatch(script, /cp -a "\$APP_DATA_DIR\/db\/jobapp\.db"\*/);
});

test('production backup exits before creating a success artifact when the source database is absent', {
  skip: process.platform === 'win32' ? 'Linux deployment shell is not available on Windows' : false,
}, () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jobapp-backup-negative-'));
  try {
    const result = spawnSync('bash', [path.join(root, 'scripts/backup-production.sh')], {
      env: { ...process.env, APP_DATA_DIR: path.join(directory, 'source'), BACKUP_DIR: path.join(directory, 'backup') },
      encoding: 'utf8',
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /database missing/);
    assert.doesNotMatch(result.stdout, /Backup created/);
    assert.equal(fs.existsSync(path.join(directory, 'backup')), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('production candidate never uses the live database for startup or runtime preflight', () => {
  const script = read('deploy.sh');
  const server = read('server.js');
  assert.match(script, /migrate_database\.js --db="\$LIVE_DB" --status/);
  assert.match(script, /status\.pending\.length > 0/);
  assert.match(script, /sqlite3 "\$LIVE_DB" "\.backup '\$CHECK_ROOT\/candidate\.db'"/);
  assert.match(script, /DB_PATH="\$CHECK_ROOT\/candidate\.db"[\s\S]*npm run preflight:runtime:strict/);
  assert.match(script, /DB_PATH="\$CHECK_ROOT\/candidate\.db"[\s\S]*pm2 start server\.js/);
  assert.match(script, /ss -ltn "\( sport = :\$CANDIDATE_PORT \)" \| grep -q LISTEN/);
  assert.match(script, /LISTEN_HOST=127\.0\.0\.1/);
  assert.match(server, /listenHost \? app\.listen\(listenPort, listenHost, onListen\) : app\.listen\(listenPort, onListen\)/);
  assert.match(script, /pm2 jlist \| node scripts\/verify-pm2-instance\.js "\$1" "\$2"/);
  assert.match(script, /grep -Fq "pid=\$CANDIDATE_PID,"/);
  assert.doesNotMatch(script, /^NODE_ENV=production npm run preflight:runtime:strict$/m);
  assert.doesNotMatch(script, /^PM2_APP_NAME=.*pm2 start ecosystem\.config\.cjs/m);
});

test('PM2 instance identity rejects stale releases, offline processes and duplicate names', () => {
  const row = {
    name: 'jobapp-server', pid: 4242,
    pm2_env: { status: 'online', pm_exec_path: path.join(root, 'server.js'), pm_cwd: root },
  };
  assert.equal(verifiedPid([row], 'jobapp-server', root), 4242);
  assert.throws(() => verifiedPid([{ ...row, pm2_env: { ...row.pm2_env, status: 'errored' } }], 'jobapp-server', root));
  assert.throws(() => verifiedPid([{ ...row, pm2_env: { ...row.pm2_env, pm_exec_path: path.join(root, 'tests', 'all.test.js') } }], 'jobapp-server', root));
  assert.throws(() => verifiedPid([{ ...row, pm2_env: { ...row.pm2_env, pm_cwd: path.join(root, 'tests') } }], 'jobapp-server', root));
  assert.throws(() => verifiedPid([row, row], 'jobapp-server', root));
});

test('PM2 instance identity accepts a physical release but rejects its current symlink alias', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jobapp-pm2-release-'));
  try {
    const release = path.join(directory, 'release');
    const alias = path.join(directory, 'current');
    fs.mkdirSync(release);
    fs.writeFileSync(path.join(release, 'server.js'), '');
    try {
      fs.symlinkSync(release, alias, process.platform === 'win32' ? 'junction' : 'dir');
    } catch (error) {
      if (error.code === 'EPERM' || error.code === 'EACCES') return t.skip('symlink creation is unavailable');
      throw error;
    }
    const physical = {
      name: 'jobapp-server', pid: 4242,
      pm2_env: { status: 'online', pm_exec_path: path.join(release, 'server.js'), pm_cwd: release },
    };
    assert.equal(verifiedPid([physical], 'jobapp-server', release), 4242);
    const symlinked = {
      ...physical,
      pm2_env: { ...physical.pm2_env, pm_exec_path: path.join(alias, 'server.js'), pm_cwd: alias },
    };
    assert.throws(() => verifiedPid([symlinked], 'jobapp-server', release));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('release switch rolls back on PM2, private or public readiness failures before saving PM2 state', () => {
  const script = read('deploy.sh');
  assert.match(script, /npm run check:acceptance -- --no-report/);
  assert.match(script, /rollback_release\(\) \{/);
  assert.match(script, /ln -sfn "\$DEPLOY_DIR" "\$APP_ROOT\/current"\s+cd "\$DEPLOY_DIR"/);
  assert.doesNotMatch(script, /ln -sfn "\$DEPLOY_DIR" "\$APP_ROOT\/current"\s+cd "\$APP_ROOT\/current"/);
  assert.match(script, /OLD_PID="\$\(pm2_release_pid "\$PM2_NAME" "\$PREVIOUS_RELEASE"\)"/);
  assert.match(script, /if ! pm2 reload ecosystem\.config\.cjs --update-env; then\s+rollback_release/);
  assert.match(script, /elif ! pm2 start ecosystem\.config\.cjs; then\s+rollback_release/);
  assert.match(script, /if ! HEALTHCHECK_BASE_URL=http:\/\/127\.0\.0\.1:4400 npm run healthcheck; then\s+rollback_release/);
  assert.match(script, /LIVE_PID="\$\(pm2_release_pid "\$PM2_NAME" "\$DEPLOY_DIR"\)"/);
  assert.match(script, /ss -ltnp '\( sport = :4400 \)' \| grep -Fq "pid=\$LIVE_PID,"/);
  assert.match(script, /4400 监听进程不是本次发布的 PM2 实例[\s\S]*rollback_release/);
  assert.match(script, /https:\/\/api\.zhiyincareer\.com\/api\/health\/ready/);
  assert.match(script, /if ! pm2 save; then\s+rollback_release/);
  assert.doesNotMatch(script, /crontab -/);
  assert.doesNotMatch(script, /pm2 startup/);
});

test('CI runs the full safe release and acceptance checks on pushed branches', () => {
  const workflow = read('.github/workflows/test.yml');
  assert.match(workflow, /on: \[push, pull_request\]/);
  assert.match(workflow, /npm run check:release/);
  assert.match(workflow, /npm run check:acceptance -- --no-report/);
});
