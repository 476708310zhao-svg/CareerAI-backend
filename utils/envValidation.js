const PLACEHOLDER_PATTERNS = [
  /^$/,
  /^your[_-]/i,
  /^test[_-]/i,
  /change[_-]?in[_-]?production/i,
  /change_this/i,
  /please[_-]?fill/i,
  /请填写/,
  /你的小程序/,
  /你的/,
  /yourdomain\.com/i,
];

function envValue(name) {
  return String(process.env[name] || '').trim();
}

function isMissing(name) {
  const value = envValue(name);
  return PLACEHOLDER_PATTERNS.some(pattern => pattern.test(value));
}

function requireEnv(names, label) {
  const missing = names.filter(isMissing);
  if (missing.length > 0) {
    throw new Error(`[env] ${label} missing required env vars: ${missing.join(', ')}`);
  }
}

function warnOptionalGroup(names, label) {
  const missing = names.filter(isMissing);
  if (missing.length > 0 && missing.length < names.length) {
    console.warn(`[env] ${label} is partially configured; missing: ${missing.join(', ')}`);
  } else if (missing.length === names.length) {
    console.warn(`[env] ${label} is not configured; related production feature should remain disabled.`);
  }
}

function validateStartupEnv() {
  const isProduction = process.env.NODE_ENV === 'production';
  if (!isProduction) return;

  requireEnv(['NODE_ENV'], 'runtime');
  requireEnv(['JWT_SECRET'], 'auth');
  requireEnv(['ALLOWED_ORIGIN'], 'browser admin CORS');
  requireEnv(['WX_APP_ID', 'WX_APP_SECRET'], 'WeChat login');
  requireEnv(['WXPAY_MCH_ID', 'WXPAY_API_KEY', 'WXPAY_APP_ID', 'WXPAY_NOTIFY_URL'], 'WeChat Pay');
  requireEnv(['ADMIN_USERNAME', 'ADMIN_PASSWORD'], 'admin console');
  requireEnv(['WEBHOOK_SECRET'], 'deployment webhook');

  warnOptionalGroup(['DEEPSEEK_API_KEY'], 'AI service');
  warnOptionalGroup(['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'], 'email service');
  warnOptionalGroup(['TENCENT_SECRET_ID', 'TENCENT_SECRET_KEY', 'TENCENT_ASR_APPID'], 'Tencent ASR');
  warnOptionalGroup([
    'TENCENT_SECRET_ID',
    'TENCENT_SECRET_KEY',
    'TENCENT_SMS_APP_ID',
    'TENCENT_SMS_SIGN_NAME',
    'TENCENT_SMS_TEMPLATE_ID',
  ], 'Tencent SMS');
  warnOptionalGroup(['WX_TPL_APPLICATION', 'WX_TPL_INTERVIEW', 'WX_TPL_SYSTEM'], 'WeChat subscribe templates');
}

module.exports = { isMissing, validateStartupEnv };
