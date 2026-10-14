'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { verifiedPid, verifiedRelease } = require('../scripts/verify-pm2-instance');

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
  assert.match(script, /pm2 jlist --silent > "\$DEST\/pm2-processes\.json"/);
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
  assert.match(script, /pm2 jlist --silent \| node "\$DEPLOY_DIR\/scripts\/verify-pm2-instance\.js" "\$1" "\$2"/);
  assert.match(script, /pm2 jlist --silent \| node "\$DEPLOY_DIR\/scripts\/verify-pm2-instance\.js" --release "\$PM2_NAME"/);
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
    assert.equal(verifiedRelease([physical], 'jobapp-server'), release);
    assert.equal(verifiedRelease([], 'jobapp-server'), null);
    assert.throws(() => verifiedRelease([physical, physical], 'jobapp-server'));
    const symlinked = {
      ...physical,
      pm2_env: { ...physical.pm2_env, pm_exec_path: path.join(alias, 'server.js'), pm_cwd: alias },
    };
    assert.throws(() => verifiedPid([symlinked], 'jobapp-server', release));
    assert.throws(() => verifiedRelease([symlinked], 'jobapp-server'));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('PM2 release CLI accepts only JSON and reports the actual release, not current', () => {
  const row = {
    name: 'jobapp-server', pid: 4242,
    pm2_env: { status: 'online', pm_exec_path: path.join(root, 'server.js'), pm_cwd: root },
  };
  const cli = path.join(root, 'scripts/verify-pm2-instance.js');
  const valid = spawnSync(process.execPath, [cli, '--release', 'jobapp-server'], {
    input: JSON.stringify([row]), encoding: 'utf8',
  });
  assert.equal(valid.status, 0);
  assert.equal(valid.stdout.trim(), root);
  const prefixed = spawnSync(process.execPath, [cli, '--release', 'jobapp-server'], {
    input: `PM2 warning\n${JSON.stringify([row])}`, encoding: 'utf8',
  });
  assert.notEqual(prefixed.status, 0);
});

test('release switch rolls back on PM2, private or public readiness failures before saving PM2 state', () => {
  const script = read('deploy.sh');
  assert.match(script, /npm run check:acceptance -- --no-report/);
  assert.match(script, /rollback_release\(\) \{/);
  assert.match(script, /PREVIOUS_LINK_TARGET="\$\(readlink -- "\$APP_ROOT\/current"\)"/);
  assert.match(script, /PREVIOUS_PM2_RELEASE="\$\(pm2_release_path\)"/);
  assert.match(script, /PREVIOUS_PM2_PID="\$\(pm2_release_pid "\$PM2_NAME" "\$PREVIOUS_PM2_RELEASE"\)"/);
  assert.match(script, /baseline_unchanged \|\| \{/);
  assert.match(script, /CUTOVER_ACTIVE=1\s+if ! switch_current_link "\$DEPLOY_DIR"; then[\s\S]*cd "\$DEPLOY_DIR"\s+if ! pm2 start ecosystem\.config\.cjs/);
  assert.doesNotMatch(script, /ln -sfn "\$DEPLOY_DIR" "\$APP_ROOT\/current"\s+cd "\$APP_ROOT\/current"/);
  assert.match(script, /cd "\$PREVIOUS_PM2_RELEASE"[\s\S]*pm2 start ecosystem\.config\.cjs/);
  assert.match(script, /OLD_PID="\$\(pm2_release_pid "\$PM2_NAME" "\$PREVIOUS_PM2_RELEASE"\)"/);
  assert.match(script, /local process_ok=1 link_ok=1[\s\S]*"\$\(pm2_release_pid "\$PM2_NAME" "\$PREVIOUS_PM2_RELEASE"\)" = "\$PREVIOUS_PM2_PID"/);
  assert.match(script, /switch_current_link "\$PREVIOUS_LINK_TARGET"/);
  assert.match(script, /mktemp -d "\$APP_ROOT\/\.current-switch\.XXXXXX"/);
  assert.match(script, /mv -Tf -- "\$temp_dir\/current" "\$APP_ROOT\/current"/);
  assert.match(script, /trap cleanup EXIT/);
  assert.match(script, /trap 'exit 130' INT/);
  assert.match(script, /trap 'exit 143' TERM/);
  assert.match(script, /if \[ "\$CUTOVER_ACTIVE" -eq 1 \]; then[\s\S]*rollback_release/);
  assert.match(script, /if ! pm2 delete "\$PM2_NAME"; then\s+exit 1/);
  assert.match(script, /if ! pm2 start ecosystem\.config\.cjs; then\s+exit 1/);
  assert.doesNotMatch(script, /pm2 reload ecosystem\.config\.cjs/);
  assert.match(script, /if ! HEALTHCHECK_BASE_URL=http:\/\/127\.0\.0\.1:4400 npm run healthcheck; then\s+exit 1/);
  assert.match(script, /LIVE_PID="\$\(pm2_release_pid "\$PM2_NAME" "\$DEPLOY_DIR"\)"/);
  assert.match(script, /ss -ltnp '\( sport = :4400 \)' \| grep -Fq "pid=\$LIVE_PID,"/);
  assert.match(script, /readlink -f "\$APP_ROOT\/current"\)" != "\$DEPLOY_DIR"[\s\S]*exit 1/);
  assert.match(script, /4400 监听进程不是本次发布的 PM2 实例[\s\S]*exit 1/);
  assert.match(script, /https:\/\/api\.zhiyincareer\.com\/api\/health\/ready/);
  assert.match(script, /if ! pm2 save; then\s+exit 1\s+fi\s+CUTOVER_ACTIVE=0/);
  assert.doesNotMatch(script, /crontab -/);
  assert.doesNotMatch(script, /pm2 startup/);
});

test('cutover restores divergent current and PM2 baselines after start, health or TERM failure', {
  skip: process.platform === 'win32' ? 'Linux shell and symlink behavior is required' : false,
}, () => {
  const deploy = read('deploy.sh');
  const section = (start, end) => {
    const startAt = deploy.indexOf(start);
    const endAt = deploy.indexOf(end, startAt + start.length);
    assert.ok(startAt >= 0 && endAt > startAt, `missing deploy section: ${start}`);
    return deploy.slice(startAt, endAt);
  };
  const cleanup = section('CUTOVER_ACTIVE=0\ncleanup() {', 'NODE_ENV=test \\');
  const identity = section('pm2_release_pid() {', 'CANDIDATE_PORT=4401');
  const cutover = deploy.slice(deploy.indexOf('# ── 7. 重启服务'));
  const quote = value => `'${value.replace(/'/g, `'\\''`)}'`;
  const fakeCli = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const name = path.basename(process.argv[1]);
const args = process.argv.slice(2);
const file = process.env.FAKE_PM2_STATE;
const state = JSON.parse(fs.readFileSync(file, 'utf8'));
const save = () => fs.writeFileSync(file, JSON.stringify(state));
const event = value => { state.events.push(value); save(); };
if (name === 'pm2') {
  if (args[0] === 'jlist') {
    if (!args.includes('--silent')) process.stdout.write('PM2 warning\\n');
    process.stdout.write(JSON.stringify(state.release ? [{ name: 'jobapp-server', pid: state.pid,
      pm2_env: { status: 'online', pm_cwd: state.release,
        pm_exec_path: path.join(state.release, 'server.js') } }] : []));
  } else if (args[0] === 'describe') {
    process.exit(state.release ? 0 : 1);
  } else if (args[0] === 'delete') {
    if (args[1] === 'jobapp-server') {
      event('delete:' + path.basename(state.release || 'none'));
      state.release = null; state.pid = null; save();
    }
  } else if (args[0] === 'start') {
    const release = process.cwd();
    if (path.basename(release) === 'new' && state.failure === 'start') {
      event('start:new:failed'); process.exit(1);
    }
    state.release = release; state.pid = ++state.nextPid;
    event('start:' + path.basename(release));
    if (path.basename(release) === 'new' && state.failure === 'term') {
      process.kill(process.ppid, 'SIGTERM');
    }
  } else if (args[0] === 'save') {
    state.savedRelease = state.release; event('save');
  }
} else if (name === 'ss') {
  process.stdout.write('State Recv-Q Send-Q Local Address:Port Peer Address:Port Process\\n');
  if (state.release) process.stdout.write('LISTEN 0 128 127.0.0.1:4400 0.0.0.0:* users:(("node",pid=' + state.pid + ',fd=1))\\n');
} else if (name === 'npm') {
  if (state.failure === 'health' && path.basename(process.cwd()) === 'new') process.exit(1);
  if (state.release !== process.cwd()) process.exit(1);
} else if (name === 'curl') {
  process.stdout.write('{"ready":true}');
}
`;
  for (const failure of ['start', 'health', 'term']) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), `jobapp-cutover-${failure}-`));
    try {
      const releases = path.join(directory, 'releases');
      const old = path.join(releases, 'pm2-old');
      const stale = path.join(releases, 'link-old');
      const next = path.join(releases, 'new');
      const bin = path.join(directory, 'bin');
      for (const place of [old, stale, next, bin, path.join(next, 'scripts')]) fs.mkdirSync(place, { recursive: true });
      for (const place of [old, next]) {
        fs.writeFileSync(path.join(place, 'server.js'), '');
        fs.writeFileSync(path.join(place, 'ecosystem.config.cjs'), '');
      }
      fs.copyFileSync(path.join(root, 'scripts/verify-pm2-instance.js'), path.join(next, 'scripts/verify-pm2-instance.js'));
      fs.symlinkSync(stale, path.join(directory, 'current'));
      for (const name of ['pm2', 'ss', 'npm', 'curl']) {
        const executable = path.join(bin, name);
        fs.writeFileSync(executable, fakeCli, { mode: 0o755 });
      }
      const stateFile = path.join(directory, 'state.json');
      fs.writeFileSync(stateFile, JSON.stringify({ release: old, pid: 4242, nextPid: 5000,
        savedRelease: old, failure, events: [] }));
      const harness = path.join(directory, 'harness.sh');
      fs.writeFileSync(harness, `#!/usr/bin/env bash\nset -euo pipefail\nAPP_ROOT=${quote(directory)}\nDEPLOY_DIR=${quote(next)}\nPM2_NAME=jobapp-server\nCHECK_ROOT=${quote(path.join(directory, 'check'))}\nCANDIDATE_NAME=jobapp-server-candidate-test\n${cleanup}\n${identity}\n${cutover}`);
      const result = spawnSync('bash', [harness], {
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, FAKE_PM2_STATE: stateFile },
        encoding: 'utf8', timeout: 15000,
      });
      assert.notEqual(result.status, 0, `${failure}: cutover unexpectedly passed`);
      assert.equal(fs.readlinkSync(path.join(directory, 'current')), stale, `${failure}: current was not restored`);
      const final = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      assert.equal(final.release, old, `${failure}: actual PM2 release was not restored`);
      assert.equal(final.savedRelease, old, `${failure}: PM2 saved state was not restored`);
      assert.ok(final.events.includes('start:pm2-old'), `${failure}: old PM2 release did not restart`);
      assert.deepEqual(fs.readdirSync(directory).filter(name => name.startsWith('.current-switch.')), []);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }
});

test('CI runs the full safe release and acceptance checks on pushed branches', () => {
  const workflow = read('.github/workflows/test.yml');
  assert.match(workflow, /on: \[push, pull_request\]/);
  assert.match(workflow, /npm run check:release/);
  assert.match(workflow, /npm run check:acceptance -- --no-report/);
});
