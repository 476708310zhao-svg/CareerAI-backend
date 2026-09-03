#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');

const CAMPUS_KEYS = [
  'FEISHU_CAMPUS_APP_ID',
  'FEISHU_CAMPUS_APP_SECRET',
  'FEISHU_CAMPUS_BASE_TOKEN',
  'FEISHU_CAMPUS_TABLE_ID',
  'FEISHU_CAMPUS_VIEW_ID'
];

function parseEnv(content) {
  const values = new Map();
  String(content || '').split(/\r?\n/).forEach(line => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match) values.set(match[1], match[2]);
  });
  return values;
}

function mergeCampusEnv(sourceContent, targetContent) {
  const incoming = parseEnv(sourceContent);
  const missing = CAMPUS_KEYS.filter(key => !incoming.has(key) || !incoming.get(key));
  if (missing.length) {
    throw new Error(`Missing required campus environment keys: ${missing.join(', ')}`);
  }

  const remaining = new Set(CAMPUS_KEYS);
  const lines = String(targetContent || '').split(/\r?\n/).map(line => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
    const key = match && match[1];
    if (!key || !remaining.has(key)) return line;
    remaining.delete(key);
    return `${key}=${incoming.get(key)}`;
  });

  for (const key of CAMPUS_KEYS) {
    if (remaining.has(key)) lines.push(`${key}=${incoming.get(key)}`);
  }

  return `${lines.join('\n').replace(/\n+$/, '')}\n`;
}

function main() {
  const sourceArg = process.argv[2] || '';
  const sourcePath = sourceArg === '-' ? '-' : path.resolve(sourceArg);
  const targetPath = path.resolve(process.argv[3] || '');
  if (!process.argv[2] || !process.argv[3]) {
    throw new Error('Usage: node scripts/merge-campus-env.js <source-env> <target-env>');
  }

  const sourceContent = fs.readFileSync(sourcePath === '-' ? 0 : sourcePath, 'utf8');
  const targetContent = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, 'utf8') : '';
  fs.writeFileSync(targetPath, mergeCampusEnv(sourceContent, targetContent), { mode: 0o600 });
  fs.chmodSync(targetPath, 0o600);
  console.log(`Updated campus environment keys: ${CAMPUS_KEYS.join(', ')}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { CAMPUS_KEYS, mergeCampusEnv, parseEnv };
