'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');
const {backupDatabase} = require('../db/backup');
const {getMigrationStatus} = require('../db/migrate');
const importer = require('../services/assessmentImport');
const PROJECT_ROOT = path.resolve(__dirname,'..');

function fail(code) { throw Object.assign(new Error(code), {code}); }
function samePath(left,right) { return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right; }
function inProject(candidate) {
  const relative = path.relative(PROJECT_ROOT,candidate);
  return !relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}
function existingAbsolute(value,code) {
  if (!value || !path.isAbsolute(value)) fail(code);
  try {
    const resolved = fs.realpathSync(value);
    if (!fs.statSync(resolved).isFile()) fail(code);
    return resolved;
  } catch (_) { fail(code); }
}
function loadJson(filePath) {
  try {
    if (fs.statSync(filePath).size > 10 * 1024 * 1024) fail('JSON_INPUT_TOO_LARGE');
    return JSON.parse(fs.readFileSync(filePath,'utf8').replace(/^\uFEFF/,''));
  } catch (error) { fail(error.code === 'JSON_INPUT_TOO_LARGE' ? error.code : 'INVALID_JSON_INPUT'); }
}
function readArguments(argv) {
  const options = {}, booleans = new Set(['apply','production-approved','maintenance-confirmed']);
  const allowed = new Set(['db','source','profile','instructions','target','confirm','confirm-target','backup',...booleans]);
  for (const argument of argv) {
    const match = argument.match(/^--([a-z-]+)(?:=(.*))?$/s);
    if (!match || !allowed.has(match[1]) || Object.hasOwn(options,match[1])) fail('INVALID_OR_DUPLICATE_ARGUMENT');
    if (booleans.has(match[1])) {
      if (match[2] !== undefined) fail('INVALID_BOOLEAN_ARGUMENT');
      options[match[1]] = true;
    } else {
      if (!match[2]) fail('ARGUMENT_VALUE_REQUIRED');
      options[match[1]] = match[2];
    }
  }
  return options;
}
async function main(argv = process.argv.slice(2), output = value => console.log(JSON.stringify(value,null,2))) {
  const options = readArguments(argv);
  if (!['local','staging','production'].includes(options.target)) fail('EXPLICIT_TARGET_ENVIRONMENT_REQUIRED');
  if (process.env.NODE_ENV === 'production' && options.target !== 'production') fail('PRODUCTION_TARGET_CANNOT_BE_DOWNGRADED');
  const dbPath = existingAbsolute(options.db,'EXPLICIT_DATABASE_FILE_REQUIRED');
  const sourcePath = existingAbsolute(options.source,'EXPLICIT_PRIVATE_SOURCE_FILE_REQUIRED');
  if (inProject(sourcePath)) fail('PRIVATE_SOURCE_MUST_STAY_OUTSIDE_PROJECT');
  const profilePath = existingAbsolute(options.profile,'EXPLICIT_PROFILE_FILE_REQUIRED');
  const instructionsPath = options.instructions ? existingAbsolute(options.instructions,'EXPLICIT_INSTRUCTIONS_FILE_REQUIRED') : null;
  const snapshot = loadJson(sourcePath), profile = loadJson(profilePath), instructions = instructionsPath ? loadJson(instructionsPath) : null;
  if (options.apply) {
    if (options.confirm !== 'IMPORT_ASSESSMENT_DRAFTS') fail('EXPLICIT_IMPORT_CONFIRMATION_REQUIRED');
    if (!options['confirm-target'] || !samePath(options['confirm-target'],dbPath)) fail('EXACT_RESOLVED_DATABASE_CONFIRMATION_REQUIRED');
    // A command-line flag documents an operator decision; it is not itself
    // Human authorization. Obtain separate production approval before running.
    if (options.target === 'production' && (!options['production-approved'] || !options['maintenance-confirmed'])) fail('PRODUCTION_APPROVAL_AND_MAINTENANCE_REQUIRED');
    if (!options.backup || !path.isAbsolute(options.backup)) fail('NEW_EXTERNAL_BACKUP_PATH_REQUIRED');
    const backupPath = path.resolve(options.backup);
    if (inProject(backupPath) || fs.existsSync(backupPath) || samePath(backupPath,dbPath)) fail('NEW_EXTERNAL_BACKUP_PATH_REQUIRED');
    // Resolve an existing parent to prevent a symlink/junction from redirecting
    // an apparently external backup into the repository.
    let ancestor = path.dirname(backupPath);
    while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
    if (inProject(fs.realpathSync(ancestor))) fail('NEW_EXTERNAL_BACKUP_PATH_REQUIRED');
  }
  // Read-only for validation, including apply preflight: no implicit migrations.
  const readonlyDb = new Database(dbPath,{readonly:true,fileMustExist:true});
  try {
    if (getMigrationStatus(readonlyDb).pending.length) fail('APPLY_FORMAL_MIGRATIONS_SEPARATELY_FIRST');
    if (readonlyDb.pragma('integrity_check',{simple:true}) !== 'ok' || readonlyDb.pragma('foreign_key_check').length) fail('TARGET_DATABASE_INTEGRITY_FAILED');
    const plan = importer.planImport(readonlyDb,snapshot,profile,instructions);
    if (!options.apply) {
      const result = {database:dbPath,target:options.target,...importer.summarize(plan)};
      output(result);
      return result;
    }
  } finally { readonlyDb.close(); }
  const backupPath = path.resolve(options.backup);
  await backupDatabase(dbPath,backupPath);
  const backupDb = new Database(backupPath,{readonly:true,fileMustExist:true});
  try {
    if (backupDb.pragma('integrity_check',{simple:true}) !== 'ok' || backupDb.pragma('foreign_key_check').length || getMigrationStatus(backupDb).pending.length) fail('BACKUP_DATABASE_VERIFICATION_FAILED');
  } finally { backupDb.close(); }
  const backupSha256 = crypto.createHash('sha256').update(fs.readFileSync(backupPath)).digest('hex');
  const db = new Database(dbPath,{fileMustExist:true});
  try {
    db.pragma('foreign_keys=ON');
    const result = {database:dbPath,target:options.target,backup:backupPath,backupSha256,...importer.applyImport(db,snapshot,profile,{instructions})};
    output(result);
    return result;
  } finally { db.close(); }
}

if (require.main === module) main().catch(error => {
  // SQLite / JSON / URL errors can embed private file contents. Only emit our
  // closed error-code vocabulary, never raw provider messages or stack traces.
  const code = typeof error.code === 'string' && /^[A-Z][A-Z0-9_]{2,80}$/.test(error.code) ? error.code : 'ASSESSMENT_IMPORT_FAILED';
  console.error(`[assessment-import] ${code}`);
  process.exitCode = 1;
});
module.exports = {main,readArguments};
