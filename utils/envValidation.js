const PLACEHOLDER_PATTERNS = [
  /^$/,
  /^your[_-]/i,
  /^test[_-]/i,
  /change[_-]?in[_-]?production/i,
  /change_this/i,
  /please[_-]?(rotate|change|replace)/i,
  /please[_-]?fill/i,
  /do[_-]?not[_-]?use/i,
  /default[_-]?(secret|password|key)?/i,
  /请填写/,
  /你的小程序/,
  /你的/,
  /yourdomain\.com/i,
];

const COMMON_WEAK_PASSWORD_PATTERNS = [
  /^admin$/i,
  new RegExp('^admin' + '123$', 'i'),
  new RegExp('^admin[_-]?' + 'password$', 'i'),
  new RegExp('^' + 'password', 'i'),
  new RegExp('123' + '456'),
  /qwerty/i,
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

function requireStrongEnv(name, label, minLength) {
  requireEnv([name], label);
  const value = envValue(name);
  if (value.length < minLength) {
    throw new Error(`[env] ${label} env var ${name} is too short; require at least ${minLength} characters`);
  }
}

function requireStrongAdminPassword() {
  requireEnv(['ADMIN_USERNAME', 'ADMIN_PASSWORD'], 'admin console');
  const password = envValue('ADMIN_PASSWORD');
  if (password.length < 12) {
    throw new Error('[env] admin console env var ADMIN_PASSWORD is too short; require at least 12 characters');
  }
  if (COMMON_WEAK_PASSWORD_PATTERNS.some(pattern => pattern.test(password))) {
    throw new Error('[env] admin console env var ADMIN_PASSWORD is too weak for production');
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

function warnOptionalAny(names, label) {
  if (names.some(name => !isMissing(name))) return;
  console.warn(`[env] ${label} is not configured; related production feature should remain disabled.`);
}

function isFlagEnabled(name, defaultValue = true) {
  const value = envValue(name).toLowerCase();
  if (!value) return defaultValue;
  return !['0', 'false', 'off', 'no', 'disabled'].includes(value);
}

function validateStartupEnv() {
  const isProduction = process.env.NODE_ENV === 'production';
  if (!isProduction) return;

  requireEnv(['NODE_ENV'], 'runtime');
  requireStrongEnv('JWT_SECRET', 'auth', 48);
  requireEnv(['ALLOWED_ORIGIN'], 'browser admin CORS');
  requireEnv(['WX_APP_ID', 'WX_APP_SECRET'], 'WeChat login');
  if (isFlagEnabled('PAYMENT_ENABLED', true)) {
    const paymentProvider = envValue('PAYMENT_PROVIDER').toLowerCase();
    if (['virtual', 'virtual-pay', 'wechat-virtual', 'wechat_virtual'].includes(paymentProvider)) {
      requireEnv([
        'VIRTUAL_PAY_OFFER_ID',
        'VIRTUAL_PAY_APP_KEY',
        'VIRTUAL_PAY_MONTH_PRODUCT_ID',
        'VIRTUAL_PAY_QUARTER_PRODUCT_ID',
        'VIRTUAL_PAY_YEAR_PRODUCT_ID',
        'VIRTUAL_PAY_NOTIFY_TOKEN',
      ], 'WeChat virtual payment');
    } else {
      requireEnv(['WXPAY_MCH_ID', 'WXPAY_API_KEY', 'WXPAY_APP_ID', 'WXPAY_NOTIFY_URL'], 'WeChat Pay');
    }
  }
  requireStrongAdminPassword();
  requireStrongEnv('CRON_SECRET', 'internal task auth', 32);
  requireStrongEnv('WEBHOOK_SECRET', 'deployment webhook', 32);

  warnOptionalAny(['AI_API_KEY', 'ARK_API_KEY', 'VOLCENGINE_API_KEY', 'DOUBAO_API_KEY', 'DEEPSEEK_API_KEY'], 'AI service');
  warnOptionalGroup(['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'], 'email service');
  warnOptionalGroup(['TENCENT_SECRET_ID', 'TENCENT_SECRET_KEY', 'TENCENT_ASR_APPID'], 'Tencent ASR');
  warnOptionalGroup([
    'TENCENT_SECRET_ID',
    'TENCENT_SECRET_KEY',
    'TENCENT_SMS_APP_ID',
    'TENCENT_SMS_SIGN_NAME',
    'TENCENT_SMS_TEMPLATE_ID',
  ], 'Tencent SMS');
  warnOptionalGroup([
    'WX_TPL_APPLICATION',
    'WX_TPL_INTERVIEW',
    'WX_TPL_SYSTEM',
    'WX_TPL_PAYMENT_SUCCESS',
    'WX_TPL_PAYMENT_REMINDER',
  ], 'WeChat subscribe templates');
}

module.exports = { isMissing, validateStartupEnv, isFlagEnabled };
