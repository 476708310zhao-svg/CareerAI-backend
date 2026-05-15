// services/sms.js — 腾讯云短信服务封装（TC3-HMAC-SHA256，无需额外 SDK）
const axios  = require('axios');
const crypto = require('crypto');

const SECRET_ID   = process.env.TENCENT_SECRET_ID   || '';
const SECRET_KEY  = process.env.TENCENT_SECRET_KEY  || '';
const SMS_APP_ID  = process.env.TENCENT_SMS_APP_ID  || '';
const SIGN_NAME   = process.env.TENCENT_SMS_SIGN_NAME   || '';
const TEMPLATE_ID = process.env.TENCENT_SMS_TEMPLATE_ID || '';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const ENDPOINT = 'sms.tencentcloudapi.com';
const REGION   = 'ap-guangzhou';

function hmac256(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest();
}
function hash256hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * 发送短信验证码
 * @param {string} phone  11 位大陆手机号
 * @param {string} code   6 位验证码
 */
async function sendSmsCode(phone, code) {
  // 未配置密钥 → 开发模式，仅打印
  if (!SECRET_ID || !SECRET_KEY || !SMS_APP_ID || !SIGN_NAME || !TEMPLATE_ID) {
    if (IS_PRODUCTION) {
      throw new Error('腾讯短信未完成生产配置');
    }
    console.log(`[SMS Dev] Phone: ${phone}  Code: ${code}`);
    return { dev: true };
  }

  const action    = 'SendSms';
  const version   = '2021-01-11';
  const algorithm = 'TC3-HMAC-SHA256';
  const timestamp = Math.floor(Date.now() / 1000);
  const date      = new Date(timestamp * 1000).toISOString().slice(0, 10);

  const body = JSON.stringify({
    PhoneNumberSet:    [`+86${phone}`],
    SmsSdkAppId:       SMS_APP_ID,
    SignName:          SIGN_NAME,
    TemplateId:        TEMPLATE_ID,
    TemplateParamSet:  [code],
  });

  // Step 1: Canonical Request
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${ENDPOINT}\n`;
  const signedHeaders    = 'content-type;host';
  const canonicalRequest = [
    'POST', '/', '',
    canonicalHeaders,
    signedHeaders,
    hash256hex(body),
  ].join('\n');

  // Step 2: String to Sign
  const credentialScope = `${date}/sms/tc3_request`;
  const stringToSign = [
    algorithm,
    String(timestamp),
    credentialScope,
    hash256hex(canonicalRequest),
  ].join('\n');

  // Step 3: Derived Signing Key → Signature
  const secretDate    = hmac256('TC3' + SECRET_KEY, date);
  const secretService = hmac256(secretDate, 'sms');
  const secretSigning = hmac256(secretService, 'tc3_request');
  const signature     = crypto.createHmac('sha256', secretSigning).update(stringToSign).digest('hex');

  // Step 4: Authorization
  const authorization =
    `${algorithm} Credential=${SECRET_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const { data } = await axios.post(`https://${ENDPOINT}`, body, {
    headers: {
      Authorization:    authorization,
      'Content-Type':   'application/json; charset=utf-8',
      Host:             ENDPOINT,
      'X-TC-Action':    action,
      'X-TC-Timestamp': String(timestamp),
      'X-TC-Version':   version,
      'X-TC-Region':    REGION,
    },
    timeout: 8000,
  });

  if (data.Response?.Error) {
    throw new Error(data.Response.Error.Message || data.Response.Error.Code);
  }

  const status = data.Response?.SendStatusSet?.[0];
  if (status && status.Code !== 'Ok') {
    throw new Error(status.Message || status.Code);
  }

  return { ok: true };
}

module.exports = { sendSmsCode };
