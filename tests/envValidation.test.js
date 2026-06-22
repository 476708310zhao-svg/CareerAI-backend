const test = require('node:test');
const assert = require('node:assert/strict');

const { isMissing, validateStartupEnv } = require('../utils/envValidation');

const REQUIRED_ENV = {
  NODE_ENV: 'production',
  JWT_SECRET: 'a7f7e0a93bd84e6cbdbcc46df08d5c2ef9cfae5b1d0d4f8cb7580bf7a7a56d41',
  ALLOWED_ORIGIN: 'https://admin.zhiyincareer.com',
  WX_APP_ID: 'wx1234567890abcdef',
  WX_APP_SECRET: 'wechat_secret_value',
  PAYMENT_ENABLED: 'true',
  WXPAY_MCH_ID: '1234567890',
  WXPAY_API_KEY: '0123456789abcdef0123456789abcdef',
  WXPAY_APP_ID: 'wx1234567890abcdef',
  WXPAY_NOTIFY_URL: 'https://api.zhiyincareer.com/api/payment/notify',
  ADMIN_USERNAME: 'admin',
  ADMIN_PASSWORD: 'ConsoleStrong2026!',
  CRON_SECRET: '83d3f2675a7a4f0cab7a2d43e47226f2',
  WEBHOOK_SECRET: '7f9a6c2e85b54bd5a67a803cdef479a8',
};

function withEnv(values, fn) {
  const previous = {};
  const keys = new Set([...Object.keys(REQUIRED_ENV), ...Object.keys(values)]);
  for (const key of keys) {
    previous[key] = process.env[key];
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      process.env[key] = values[key];
    } else {
      delete process.env[key];
    }
  }
  try {
    fn();
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

function silenceWarnings(fn) {
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    fn();
  } finally {
    console.warn = originalWarn;
  }
}

test('isMissing detects empty and placeholder production values', () => {
  withEnv({
    EMPTY_VALUE: '',
    WX_PLACEHOLDER: '你的小程序AppID',
    PASSWORD_PLACEHOLDER: 'change_this_admin_password',
    VALID_VALUE: 'real_value',
  }, () => {
    assert.equal(isMissing('EMPTY_VALUE'), true);
    assert.equal(isMissing('WX_PLACEHOLDER'), true);
    assert.equal(isMissing('PASSWORD_PLACEHOLDER'), true);
    assert.equal(isMissing('VALID_VALUE'), false);
  });
});

test('production startup validation rejects missing required env vars', () => {
  withEnv({
    ...REQUIRED_ENV,
    WX_APP_SECRET: '你的小程序AppSecret',
  }, () => {
    assert.throws(
      () => validateStartupEnv(),
      /WeChat login missing required env vars: WX_APP_SECRET/
    );
  });
});

test('production startup validation accepts complete required env vars', () => {
  withEnv(REQUIRED_ENV, () => {
    silenceWarnings(() => {
      assert.doesNotThrow(() => validateStartupEnv());
    });
  });
});

test('production startup validation rejects placeholder-like JWT secret', () => {
  withEnv({
    ...REQUIRED_ENV,
    JWT_SECRET: 'jobapp_super_secret_key_change_in_production_2026',
  }, () => {
    assert.throws(
      () => validateStartupEnv(),
      /auth missing required env vars: JWT_SECRET/
    );
  });
});

test('production startup validation rejects weak admin password', () => {
  withEnv({
    ...REQUIRED_ENV,
    ADMIN_PASSWORD: 'admin_password',
  }, () => {
    assert.throws(
      () => validateStartupEnv(),
      /admin console missing required env vars: ADMIN_PASSWORD|ADMIN_PASSWORD is too weak/
    );
  });
});

test('production startup validation allows disabled payment without WXPAY vars', () => {
  const env = Object.assign({}, REQUIRED_ENV, {
    PAYMENT_ENABLED: 'false',
    WXPAY_MCH_ID: '',
    WXPAY_API_KEY: '',
    WXPAY_APP_ID: '',
    WXPAY_NOTIFY_URL: '',
  });

  withEnv(env, () => {
    silenceWarnings(() => {
      assert.doesNotThrow(() => validateStartupEnv());
    });
  });
});
