const crypto = require('crypto');
const db = require('../db/database');
const { ALL_ADMIN_PERMISSIONS, normalizePermissions } = require('./adminPermissions');

const KEY_LEN = 32;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, KEY_LEN).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  if (!password || !stored) return false;
  if (!stored.startsWith('scrypt$')) return stored === password;
  const [, salt, expected] = stored.split('$');
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, Buffer.from(expected, 'hex').length);
  try {
    return crypto.timingSafeEqual(actual, Buffer.from(expected, 'hex'));
  } catch (_) {
    return false;
  }
}

function publicAccount(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    display_name: row.display_name || '',
    role: row.role || 'operator',
    permissions: normalizePermissions(row.permissions),
    is_active: row.is_active ? 1 : 0,
    last_login_at: row.last_login_at || '',
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function ensureEnvAdminAccount() {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) return null;

  const existing = db.prepare('SELECT * FROM admin_accounts WHERE username = ?').get(username);
  const permissions = JSON.stringify(['*']);
  if (!existing) {
    const info = db.prepare(`
      INSERT INTO admin_accounts (username, password_hash, display_name, role, permissions, is_active)
      VALUES (?, ?, ?, 'super_admin', ?, 1)
    `).run(username, hashPassword(password), '超级管理员', permissions);
    return db.prepare('SELECT * FROM admin_accounts WHERE id = ?').get(info.lastInsertRowid);
  }

  if (existing.role !== 'super_admin' || existing.permissions !== permissions || !existing.is_active) {
    db.prepare(`
      UPDATE admin_accounts
      SET role='super_admin', permissions=?, is_active=1, updated_at=datetime('now')
      WHERE id=?
    `).run(permissions, existing.id);
  }
  return db.prepare('SELECT * FROM admin_accounts WHERE username = ?').get(username);
}

function findByUsername(username) {
  ensureEnvAdminAccount();
  return db.prepare('SELECT * FROM admin_accounts WHERE username = ?').get(username);
}

function login(username, password) {
  const account = findByUsername(username);
  if (!account || !account.is_active || !verifyPassword(password, account.password_hash)) return null;
  db.prepare("UPDATE admin_accounts SET last_login_at=datetime('now') WHERE id=?").run(account.id);
  return publicAccount(db.prepare('SELECT * FROM admin_accounts WHERE id=?').get(account.id));
}

function listAccounts(keyword = '') {
  ensureEnvAdminAccount();
  const k = `%${keyword}%`;
  const rows = keyword
    ? db.prepare(`
        SELECT * FROM admin_accounts
        WHERE username LIKE ? OR display_name LIKE ? OR role LIKE ?
        ORDER BY role='super_admin' DESC, created_at DESC
      `).all(k, k, k)
    : db.prepare(`
        SELECT * FROM admin_accounts
        ORDER BY role='super_admin' DESC, created_at DESC
      `).all();
  return rows.map(publicAccount);
}

function getAccount(id) {
  return publicAccount(db.prepare('SELECT * FROM admin_accounts WHERE id=?').get(id));
}

function createAccount(data) {
  const username = String(data.username || '').trim();
  const password = String(data.password || '');
  if (!username || username.length < 3) throw new Error('账号至少需要 3 个字符');
  if (!password || password.length < 6) throw new Error('密码至少需要 6 位');
  const role = data.role === 'super_admin' ? 'super_admin' : 'operator';
  const permissions = role === 'super_admin' ? ['*'] : normalizePermissions(data.permissions);
  if (role !== 'super_admin' && permissions.length === 0) throw new Error('请至少选择一个权限');

  const info = db.prepare(`
    INSERT INTO admin_accounts (username, password_hash, display_name, role, permissions, is_active)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    username,
    hashPassword(password),
    String(data.display_name || '').trim(),
    role,
    JSON.stringify(permissions),
    data.is_active === 0 ? 0 : 1
  );
  return getAccount(info.lastInsertRowid);
}

function updateAccount(id, data, currentAdmin = {}) {
  const existing = db.prepare('SELECT * FROM admin_accounts WHERE id=?').get(id);
  if (!existing) return null;
  const isSelf = currentAdmin.id === id;
  const role = data.role === 'super_admin' ? 'super_admin' : 'operator';
  const permissions = role === 'super_admin' ? ['*'] : normalizePermissions(data.permissions);
  if (role !== 'super_admin' && permissions.length === 0) throw new Error('请至少选择一个权限');
  const nextActive = isSelf ? 1 : (data.is_active === 0 ? 0 : 1);

  db.prepare(`
    UPDATE admin_accounts
    SET display_name=?, role=?, permissions=?, is_active=?, updated_at=datetime('now')
    WHERE id=?
  `).run(
    String(data.display_name || '').trim(),
    role,
    JSON.stringify(permissions),
    nextActive,
    id
  );

  if (data.password) {
    if (String(data.password).length < 6) throw new Error('密码至少需要 6 位');
    db.prepare("UPDATE admin_accounts SET password_hash=?, updated_at=datetime('now') WHERE id=?")
      .run(hashPassword(String(data.password)), id);
  }
  return getAccount(id);
}

function deleteAccount(id, currentAdmin = {}) {
  const existing = db.prepare('SELECT * FROM admin_accounts WHERE id=?').get(id);
  if (!existing) return false;
  if (currentAdmin.id === id) throw new Error('不能删除当前登录账号');
  if (existing.role === 'super_admin') {
    const count = db.prepare('SELECT COUNT(*) as c FROM admin_accounts WHERE role="super_admin" AND is_active=1').get().c;
    if (count <= 1) throw new Error('至少保留一个可用的超级管理员');
  }
  return db.prepare('DELETE FROM admin_accounts WHERE id=?').run(id).changes > 0;
}

module.exports = {
  ALL_ADMIN_PERMISSIONS,
  ensureEnvAdminAccount,
  login,
  listAccounts,
  getAccount,
  createAccount,
  updateAccount,
  deleteAccount,
  publicAccount
};
