require('dotenv').config();
const { validateStartupEnv } = require('../utils/envValidation');
const { buildRuntimeReadiness } = require('../utils/runtimeReadiness');
const db = require('../db/database');
const { getMigrationStatus } = require('../db/migrate');

const strict = process.argv.includes('--strict');
if (strict) process.env.NODE_ENV = 'production';
const migrationsRequired = strict || process.env.NODE_ENV === 'production';

let startupReady = true;
try {
  validateStartupEnv();
  console.log('[PASS] production_env');
} catch (error) {
  startupReady = false;
  console.log(`[FAIL] production_env - ${String(error.message || error).slice(0, 240)}`);
}

const result = buildRuntimeReadiness({ strict });
let migrationsReady = false;
try {
  const migrations = getMigrationStatus(db);
  migrationsReady = migrations.pending.length === 0;
  const pending = migrations.pending.map(item => item.version).join(',');
  console.log(`[${migrationsReady ? 'PASS' : migrationsRequired ? 'FAIL' : 'WARN'}] schema_migrations${pending ? ` - pending: ${pending}` : ''}`);
} catch (error) {
  console.log(`[${migrationsRequired ? 'FAIL' : 'WARN'}] schema_migrations - ${String(error.message || error).slice(0, 240)}`);
}

for (const check of result.checks) {
  const label = check.ready ? 'PASS' : check.required ? 'FAIL' : 'WARN';
  console.log(`[${label}] ${check.name}${check.detail ? ` - ${check.detail}` : ''}`);
}

const ready = startupReady && result.ready && (!migrationsRequired || migrationsReady);
console.log(`[preflight] ${ready ? result.status : 'not_ready'}`);
if (!ready) process.exitCode = 1;
