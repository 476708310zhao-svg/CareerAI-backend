'use strict';

const fs = require('node:fs');
const path = require('node:path');

function verifiedRelease(rows, name) {
  const matches = Array.isArray(rows) ? rows.filter(item => item.name === name) : [];
  if (matches.length === 0) return null;
  const row = matches.length === 1 ? matches[0] : null;
  const env = row && row.pm2_env;
  if (!env || env.status !== 'online' || !Number.isInteger(row.pid) || row.pid < 2 ||
      typeof env.pm_exec_path !== 'string' || typeof env.pm_cwd !== 'string') {
    throw new Error('PM2 process is not the online instance for this release');
  }
  const release = fs.realpathSync(env.pm_cwd);
  const expectedScript = fs.realpathSync(path.join(release, 'server.js'));
  if (path.resolve(env.pm_cwd) !== release ||
      path.resolve(env.pm_exec_path) !== expectedScript ||
      fs.realpathSync(env.pm_exec_path) !== expectedScript ||
      expectedScript !== path.join(release, 'server.js')) {
    throw new Error('PM2 process is not the online instance for this release');
  }
  return release;
}

function verifiedPid(rows, name, releasePath) {
  const release = fs.realpathSync(releasePath);
  const expectedScript = fs.realpathSync(path.join(release, 'server.js'));
  const actualRelease = verifiedRelease(rows, name);
  const matches = Array.isArray(rows) ? rows.filter(item => item.name === name) : [];
  const row = matches.length === 1 ? matches[0] : null;
  if (actualRelease !== release || !row ||
      path.resolve(row.pm2_env.pm_exec_path) !== expectedScript) {
    throw new Error('PM2 process is not the online instance for this release');
  }
  return row.pid;
}

if (require.main === module) {
  let input = '';
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const rows = JSON.parse(input);
      if (process.argv[2] === '--release') {
        console.log(verifiedRelease(rows, process.argv[3]) || '');
      } else {
        console.log(verifiedPid(rows, process.argv[2], process.argv[3]));
      }
    } catch (error) {
      console.error(`[pm2-instance] ${error.message}`);
      process.exitCode = 1;
    }
  });
}

module.exports = { verifiedPid, verifiedRelease };
