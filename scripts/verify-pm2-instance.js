'use strict';

const fs = require('node:fs');
const path = require('node:path');

function verifiedPid(rows, name, releasePath) {
  const release = fs.realpathSync(releasePath);
  const expectedScript = fs.realpathSync(path.join(release, 'server.js'));
  const matches = Array.isArray(rows) ? rows.filter(item => item.name === name) : [];
  const row = matches.length === 1 ? matches[0] : null;
  const env = row && row.pm2_env;
  if (!env || env.status !== 'online' || !Number.isInteger(row.pid) || row.pid < 2 ||
      path.resolve(env.pm_exec_path) !== expectedScript ||
      path.resolve(env.pm_cwd) !== release ||
      fs.realpathSync(env.pm_exec_path) !== expectedScript ||
      fs.realpathSync(env.pm_cwd) !== release) {
    throw new Error('PM2 process is not the online instance for this release');
  }
  return row.pid;
}

if (require.main === module) {
  let input = '';
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      console.log(verifiedPid(JSON.parse(input), process.argv[2], process.argv[3]));
    } catch (error) {
      console.error(`[pm2-instance] ${error.message}`);
      process.exitCode = 1;
    }
  });
}

module.exports = { verifiedPid };
