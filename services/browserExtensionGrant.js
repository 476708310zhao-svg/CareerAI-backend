'use strict';

const crypto = require('node:crypto');
const db = require('../db/database');
const { getProfile } = require('./v4Profile');

const ALLOWED_HOSTS = new Set(['boards.greenhouse.io', 'job-boards.greenhouse.io', 'jobs.lever.co']);
const FIELD_KEYS = new Set(['email', 'phone', 'school', 'major', 'degree', 'graduationYear', 'city', 'skills']);

function migrationAvailable() {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get()
    && db.prepare("SELECT 1 FROM schema_migrations WHERE version='0028'").get()
    && db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='browser_extension_grants'").get());
}

function normalizeHost(value) {
  const host = String(value || '').trim().toLowerCase().replace(/\.$/, '');
  if (!ALLOWED_HOSTS.has(host)) throw Object.assign(new Error('暂不支持该招聘网站'), { status: 400 });
  return host;
}

function normalizeFields(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > FIELD_KEYS.size) {
    throw Object.assign(new Error('请至少选择一项且不要超过允许字段范围'), { status: 400 });
  }
  const fields = [...new Set(value.map(item => String(item || '').trim()))];
  if (fields.some(field => !FIELD_KEYS.has(field))) throw Object.assign(new Error('字段选择无效'), { status: 400 });
  return fields;
}

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }

function create(userId, applicationId, input = {}) {
  if (!migrationAvailable()) throw Object.assign(new Error('浏览器插件授权暂不可用'), { status: 503 });
  const host = normalizeHost(input.boardHost);
  const fields = normalizeFields(input.fields);
  const application = db.prepare("SELECT id FROM applications WHERE id=? AND user_id=? AND COALESCE(archived_at,'')='' ").get(applicationId, userId);
  if (!application) throw Object.assign(new Error('申请记录不存在或已归档'), { status: 404 });
  const active = db.prepare("SELECT COUNT(*) AS count FROM browser_extension_grants WHERE user_id=? AND application_id=? AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at>datetime('now')").get(userId, applicationId).count;
  if (active >= 10) throw Object.assign(new Error('该申请的有效授权数量已达上限，请撤销或等待过期'), { status: 429 });
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = sha256(token);
  const inserted = db.prepare(`INSERT INTO browser_extension_grants
    (user_id,application_id,token_hash,board_host,field_scope,expires_at)
    VALUES(?,?,?,?,?,datetime('now','+5 minutes'))`).run(userId, applicationId, tokenHash, host, JSON.stringify(fields));
  return { grantId: Number(inserted.lastInsertRowid), token, boardHost: host, fields,
    expiresInSeconds: 300, issuedAt: new Date().toISOString() };
}

function revoke(userId, applicationId, grantId) {
  if (!migrationAvailable()) throw Object.assign(new Error('浏览器插件授权暂不可用'), { status: 503 });
  const result = db.prepare(`UPDATE browser_extension_grants SET revoked_at=datetime('now')
    WHERE id=? AND user_id=? AND application_id=? AND consumed_at IS NULL AND revoked_at IS NULL`).run(grantId, userId, applicationId);
  if (!result.changes) throw Object.assign(new Error('授权不存在或已使用'), { status: 404 });
  return { revoked: true };
}

function consume(token, boardHost) {
  if (!migrationAvailable()) throw Object.assign(new Error('授权暂不可用'), { status: 503 });
  const normalizedHost = normalizeHost(boardHost);
  const digest = sha256(String(token || ''));
  return db.transaction(() => {
    const grant = db.prepare(`SELECT * FROM browser_extension_grants WHERE token_hash=?
      AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at>datetime('now')`).get(digest);
    if (!grant || grant.board_host !== normalizedHost) throw Object.assign(new Error('授权无效、已过期或与当前网站不匹配'), { status: 401 });
    const claimed = db.prepare(`UPDATE browser_extension_grants SET consumed_at=datetime('now')
      WHERE id=? AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at>datetime('now')`).run(grant.id);
    if (!claimed.changes) throw Object.assign(new Error('授权已使用'), { status: 409 });
    const profile = getProfile(grant.user_id, true) || {};
    const user = db.prepare('SELECT email,phone FROM users WHERE id=?').get(grant.user_id) || {};
    const values = {
      email: user.email || '', phone: user.phone || '', school: profile.school || '', major: profile.major || '',
      degree: profile.degree || '', graduationYear: profile.graduationYear || '', city: profile.city || '',
      skills: Array.isArray(profile.skills) ? profile.skills.join(', ') : ''
    };
    const fields = JSON.parse(grant.field_scope);
    return { grantId: grant.id, applicationId: grant.application_id, boardHost: grant.board_host,
      fields: fields.map(key => ({ key, value: values[key] || '' })).filter(item => item.value), consumedAt: new Date().toISOString() };
  }).immediate();
}

module.exports = { ALLOWED_HOSTS, FIELD_KEYS, migrationAvailable, normalizeHost, normalizeFields, create, revoke, consume };
