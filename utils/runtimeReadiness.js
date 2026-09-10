const db = require('../db/database');
const { isFlagEnabled, isMissing } = require('./envValidation');

const AI_KEY_NAMES = [
  'AI_API_KEY',
  'ARK_API_KEY',
  'VOLCENGINE_API_KEY',
  'DOUBAO_API_KEY',
  'DEEPSEEK_API_KEY',
];

function hasAnyConfigured(names) {
  return names.some(name => !isMissing(name));
}

function paymentConfigNames() {
  const provider = String(process.env.PAYMENT_PROVIDER || '').trim().toLowerCase();
  if (['virtual', 'virtual-pay', 'wechat-virtual', 'wechat_virtual'].includes(provider)) {
    return [
      'VIRTUAL_PAY_OFFER_ID',
      'VIRTUAL_PAY_APP_KEY',
      'VIRTUAL_PAY_MONTH_PRODUCT_ID',
      'VIRTUAL_PAY_QUARTER_PRODUCT_ID',
      'VIRTUAL_PAY_YEAR_PRODUCT_ID',
      'VIRTUAL_PAY_NOTIFY_TOKEN',
    ];
  }
  return ['WXPAY_MCH_ID', 'WXPAY_API_KEY', 'WXPAY_APP_ID', 'WXPAY_NOTIFY_URL'];
}

function checkDatabase() {
  try {
    db.prepare('SELECT 1 AS ok').get();
    return { name: 'database', ready: true, required: true };
  } catch (error) {
    return {
      name: 'database',
      ready: false,
      required: true,
      detail: String(error.message || error).slice(0, 160),
    };
  }
}

function checkRequiredGroup(name, names, required) {
  const missing = names.filter(isMissing);
  return {
    name,
    ready: missing.length === 0,
    required,
    detail: missing.length ? `missing: ${missing.join(', ')}` : undefined,
  };
}

function buildRuntimeReadiness(options = {}) {
  const strict = options.strict === true;
  const production = process.env.NODE_ENV === 'production';
  const enforceProductionConfig = production || strict;
  const paymentEnabled = isFlagEnabled('PAYMENT_ENABLED', true);
  const aiRequired = strict || isFlagEnabled('AI_REQUIRED', false);

  const checks = [
    checkDatabase(),
    checkRequiredGroup('authentication', ['JWT_SECRET'], enforceProductionConfig),
    checkRequiredGroup('wechat_login', ['WX_APP_ID', 'WX_APP_SECRET'], enforceProductionConfig),
    {
      name: 'ai_provider',
      ready: hasAnyConfigured(AI_KEY_NAMES),
      required: aiRequired,
      detail: hasAnyConfigured(AI_KEY_NAMES) ? undefined : 'no AI provider key configured',
    },
  ];

  if (paymentEnabled) {
    checks.push(checkRequiredGroup('payment', paymentConfigNames(), enforceProductionConfig));
    checks.push({
      name: 'payment_launch_approval',
      ready: isFlagEnabled('REAL_PAYMENT_LAUNCH_APPROVED', false),
      required: enforceProductionConfig,
      detail: isFlagEnabled('REAL_PAYMENT_LAUNCH_APPROVED', false)
        ? undefined
        : 'REAL_PAYMENT_LAUNCH_APPROVED is disabled',
    });
  } else {
    checks.push({
      name: 'payment',
      ready: true,
      required: false,
      detail: 'PAYMENT_ENABLED is disabled',
    });
  }

  const failedRequired = checks.filter(check => check.required && !check.ready);
  const failedOptional = checks.filter(check => !check.required && !check.ready);
  return {
    ready: failedRequired.length === 0,
    status: failedRequired.length > 0 ? 'not_ready' : failedOptional.length > 0 ? 'degraded' : 'ready',
    checkedAt: new Date().toISOString(),
    checks,
  };
}

module.exports = { buildRuntimeReadiness };
