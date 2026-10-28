'use strict';

// The deployment workflow backs up the shared environment before invoking
// this script. Never print either credential or an upstream request object.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

async function rotateKey({ envPath, nextKey, axios, dotenv }) {
  if (!/^[A-Za-z0-9_-]{30,128}$/.test(String(nextKey || ''))) {
    throw new Error('New JSearch key is missing or invalid');
  }
  const stat = fs.lstatSync(envPath);
  if (!stat.isFile()) throw new Error('Shared environment is not a regular file');
  const source = fs.readFileSync(envPath, 'utf8');
  if ((source.match(/^RAPID_API_KEY=.*$/gm) || []).length !== 1) {
    throw new Error('Shared environment must contain exactly one RAPID_API_KEY entry');
  }
  const oldKey = dotenv.parse(source).RAPID_API_KEY;

  const response = await axios.get('https://jsearch.p.rapidapi.com/search-v2', {
    params: { query: 'software engineer jobs in United States', country: 'us', num_pages: 1 },
    headers: { 'X-RapidAPI-Key': nextKey, 'X-RapidAPI-Host': 'jsearch.p.rapidapi.com' },
    timeout: 20000
  });
  const jobs = response.data?.data?.jobs;
  if (response.status !== 200 || !Array.isArray(jobs)) {
    throw new Error('New JSearch key did not return valid jobs');
  }
  if (oldKey === nextKey) return { changed: false, jobCount: jobs.length };

  const updated = source.replace(/^RAPID_API_KEY=.*$/m, `RAPID_API_KEY=${nextKey}`);
  const tempPath = `${envPath}.jsearch-${process.pid}-${Date.now()}.tmp`;
  try {
    fs.writeFileSync(tempPath, updated, { mode: 0o600, flag: 'wx' });
    const tempStat = fs.statSync(tempPath);
    if (tempStat.uid !== stat.uid || tempStat.gid !== stat.gid) fs.chownSync(tempPath, stat.uid, stat.gid);
    fs.chmodSync(tempPath, 0o600);
    fs.renameSync(tempPath, envPath);
  } finally {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  }
  if (dotenv.parse(fs.readFileSync(envPath, 'utf8')).RAPID_API_KEY !== nextKey) {
    throw new Error('JSearch key write verification failed');
  }
  return { changed: true, jobCount: jobs.length };
}

async function main() {
  const runtimeDir = process.env.JSEARCH_RUNTIME_DIR || process.cwd();
  const runtimeRequire = createRequire(path.join(runtimeDir, 'server.js'));
  const result = await rotateKey({
    envPath: '/var/lib/jobapp-server/.env',
    nextKey: process.env.JSEARCH_RAPID_API_KEY,
    axios: runtimeRequire('axios'),
    dotenv: runtimeRequire('dotenv')
  });
  console.log(`Production JSearch key ${result.changed ? 'updated' : 'already matches'}; HTTP 200; jobs=${result.jobCount}`);
}

if (require.main === module) {
  main().catch(error => {
    console.error(`JSearch credential update failed: ${error.response?.status || error.code || error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { rotateKey };
