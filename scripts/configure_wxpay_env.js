#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find(item => item.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function parseEnvFile(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const values = {};
  raw.split(/\r?\n/).forEach(line => {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) return;
    values[match[1]] = match[2].trim();
  });
  return values;
}

function backupFile(file, backupDir) {
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const target = path.join(backupDir, `.env.before-wxpay-${stamp}`);
  fs.copyFileSync(file, target);
  return target;
}

function upsertEnvValues(envFile, updates) {
  const raw = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '';
  const lines = raw.split(/\r?\n/);
  const seen = new Set();
  const next = lines.map(line => {
    const match = line.match(/^(\s*)([A-Z0-9_]+)(\s*=)(.*)$/);
    if (!match) return line;
    const key = match[2];
    if (!Object.prototype.hasOwnProperty.call(updates, key)) return line;
    seen.add(key);
    return `${key}=${updates[key]}`;
  });

  Object.keys(updates).forEach(key => {
    if (!seen.has(key)) next.push(`${key}=${updates[key]}`);
  });

  fs.writeFileSync(envFile, next.join('\n').replace(/\n+$/g, '') + '\n', 'utf8');
}

function copyCerts(srcDir, destDir) {
  const copied = [];
  if (!srcDir || !fs.existsSync(srcDir)) return copied;
  fs.mkdirSync(destDir, { recursive: true });
  fs.readdirSync(srcDir, { withFileTypes: true }).forEach(entry => {
    if (!entry.isFile()) return;
    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);
    fs.copyFileSync(src, dest);
    fs.chmodSync(dest, 0o600);
    copied.push(entry.name);
  });
  return copied;
}

function redacted(value) {
  const text = String(value || '');
  if (text.length <= 6) return '***';
  return `${text.slice(0, 3)}***${text.slice(-3)}`;
}

function main() {
  const appDir = argValue('app-dir', '/www/wwwroot/jobapp-server');
  const secretFile = argValue('secret', '/tmp/wxpay-secret.env');
  const certSrc = argValue('cert-src', '/tmp/wechatpay-certs');
  const certDest = argValue('cert-dest', '/var/lib/jobapp-server/certs/wechatpay');
  const backupDir = argValue('backup-dir', '/var/backups/jobapp-server');
  const envFile = path.join(appDir, '.env');

  if (!fs.existsSync(secretFile)) throw new Error(`secret file not found: ${secretFile}`);
  if (!fs.existsSync(envFile)) throw new Error(`env file not found: ${envFile}`);

  const secret = parseEnvFile(secretFile);
  const required = ['WXPAY_MCH_ID', 'WXPAY_API_KEY', 'WXPAY_APP_ID', 'WXPAY_NOTIFY_URL'];
  const missing = required.filter(key => !secret[key]);
  if (missing.length) throw new Error(`missing required keys: ${missing.join(', ')}`);
  if (secret.WXPAY_API_KEY.length !== 32) {
    throw new Error(`WXPAY_API_KEY must be 32 characters, got ${secret.WXPAY_API_KEY.length}`);
  }
  if (!/^https:\/\//.test(secret.WXPAY_NOTIFY_URL)) {
    throw new Error('WXPAY_NOTIFY_URL must use https');
  }

  const backup = backupFile(envFile, backupDir);
  upsertEnvValues(envFile, {
    WXPAY_MCH_ID: secret.WXPAY_MCH_ID,
    WXPAY_API_KEY: secret.WXPAY_API_KEY,
    WXPAY_APP_ID: secret.WXPAY_APP_ID,
    WXPAY_NOTIFY_URL: secret.WXPAY_NOTIFY_URL
  });
  const certFiles = copyCerts(certSrc, certDest);

  try { fs.unlinkSync(secretFile); } catch (err) {}

  console.log(JSON.stringify({
    ok: true,
    envFile,
    backup,
    paymentProviderPreserved: true,
    wxpay: {
      mchId: redacted(secret.WXPAY_MCH_ID),
      appId: redacted(secret.WXPAY_APP_ID),
      apiV2KeyLength: secret.WXPAY_API_KEY.length,
      notifyUrl: secret.WXPAY_NOTIFY_URL
    },
    certDest,
    certFiles
  }, null, 2));
}

try {
  main();
} catch (err) {
  console.error('[configure_wxpay_env] failed:', err.message || err);
  process.exitCode = 1;
}
