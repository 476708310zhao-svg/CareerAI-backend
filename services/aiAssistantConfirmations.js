'use strict';

const TABLE = 'ai_assistant_confirmations';
const REQUIRED_COLUMNS = [
  'id', 'user_id', 'action_id', 'request_fingerprint', 'application_id',
  'conversation_id', 'turn_id', 'source_scope', 'action_target',
  'response_json', 'created_at'
];
const REQUIRED_FOREIGN_KEYS = new Map([
  ['user_id', 'users:id'],
  ['application_id', 'applications:id'],
  ['conversation_id', 'ai_conversations:id'],
  ['turn_id', 'ai_conversation_turns:id'],
]);

function migrationError(detail) {
  return new Error(`Database migration 0010 is required for AI confirmations: ${detail}`);
}

function assertSchema(db) {
  if (db.pragma('foreign_keys', { simple:true }) !== 1) throw migrationError('PRAGMA foreign_keys must be enabled');
  const table = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(TABLE);
  if (!table) throw migrationError(`missing table ${TABLE}`);
  const columns = new Set(db.prepare(`PRAGMA table_info(${TABLE})`).all().map(column => column.name));
  const missing = REQUIRED_COLUMNS.filter(column => !columns.has(column));
  if (missing.length) throw migrationError(`missing columns ${missing.join(',')}`);

  const uniqueIndexes = db.prepare(`PRAGMA index_list(${TABLE})`).all().filter(index => index.unique === 1);
  const hasOwnerActionUnique = uniqueIndexes.some(index => {
    const escaped = String(index.name).replace(/"/g, '""');
    const names = db.prepare(`PRAGMA index_info("${escaped}")`).all().map(column => column.name);
    return names.length === 2 && names[0] === 'user_id' && names[1] === 'action_id';
  });
  if (!hasOwnerActionUnique) throw migrationError('missing UNIQUE(user_id, action_id)');

  const foreignKeys = db.prepare(`PRAGMA foreign_key_list(${TABLE})`).all();
  for (const [column, destination] of REQUIRED_FOREIGN_KEYS) {
    const [targetTable, targetColumn] = destination.split(':');
    const match = foreignKeys.find(key => key.from === column && key.table === targetTable && key.to === targetColumn);
    if (!match || String(match.on_delete).toUpperCase() !== 'CASCADE') {
      throw migrationError(`missing cascading foreign key ${column}->${targetTable}.${targetColumn}`);
    }
  }
  return true;
}

function positiveCanonicalId(value) {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? value : null;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseActionId(value) {
  if (typeof value !== 'string') return null;
  const match = /^ai-save:([1-9]\d*):([1-9]\d*)$/.exec(value);
  if (!match) return null;
  const conversationId = positiveCanonicalId(match[1]);
  const turnId = positiveCanonicalId(match[2]);
  if (!conversationId || !turnId) return null;
  return { actionId:value, conversationId, turnId };
}

module.exports = { assertSchema, parseActionId, positiveCanonicalId, REQUIRED_COLUMNS };
