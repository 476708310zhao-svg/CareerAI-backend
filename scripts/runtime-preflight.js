require('dotenv').config();
const { buildRuntimeReadiness } = require('../utils/runtimeReadiness');

const strict = process.argv.includes('--strict');
const result = buildRuntimeReadiness({ strict });

for (const check of result.checks) {
  const label = check.ready ? 'PASS' : check.required ? 'FAIL' : 'WARN';
  console.log(`[${label}] ${check.name}${check.detail ? ` - ${check.detail}` : ''}`);
}

console.log(`[preflight] ${result.status}`);
if (!result.ready) process.exitCode = 1;
