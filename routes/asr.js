// routes/asr.js — 语音转文字（腾讯云 ASR 一句话识别）
const express = require('express');
const multer  = require('multer');
const https   = require('https');
const crypto  = require('crypto');
const path    = require('path');
const fs      = require('fs');

const router  = express.Router();
const { aiLimiter } = require('../middleware/rateLimit');

// ── 临时存储上传的音频文件 ──────────────────────────────────────
const upload = multer({
  dest: path.join(__dirname, '../uploads/asr_tmp/'),
  limits: { fileSize: 5 * 1024 * 1024 },  // 5MB
  fileFilter(_req, file, cb) {
    const ok = ['audio/mp3', 'audio/mpeg', 'audio/wav', 'audio/silk', 'audio/webm', 'application/octet-stream'].includes(file.mimetype);
    cb(null, ok);
  }
});

// ── 腾讯云 ASR 调用 ────────────────────────────────────────────
// 配置方式：在 .env 中设置：
//   TENCENT_SECRET_ID=your_secret_id
//   TENCENT_SECRET_KEY=your_secret_key
//   TENCENT_ASR_APPID=your_appid       (数字 AppId，不是 mini-program AppId)
// 如未配置则走 mock 模式返回固定提示文本
function buildTC3Signature({ secretId, secretKey, service, host, action, version, region, body }) {
  const timestamp = Math.floor(Date.now() / 1000);
  const date      = new Date(timestamp * 1000).toISOString().slice(0, 10);

  const credentialScope    = `${date}/${service}/tc3_request`;
  const hashedRequestPayload = crypto.createHash('sha256').update(body).digest('hex');
  const canonicalRequest   = `POST\n/\n\ncontent-type:application/json\nhost:${host}\n\ncontent-type;host\n${hashedRequestPayload}`;
  const stringToSign       = `TC3-HMAC-SHA256\n${timestamp}\n${credentialScope}\n${crypto.createHash('sha256').update(canonicalRequest).digest('hex')}`;

  const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
  const secretDate    = hmac('TC3' + secretKey, date);
  const secretService = hmac(secretDate, service);
  const secretSigning = hmac(secretService, 'tc3_request');
  const signature     = crypto.createHmac('sha256', secretSigning).update(stringToSign).digest('hex');

  return {
    authorization: `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=content-type;host, Signature=${signature}`,
    timestamp: String(timestamp),
  };
}

function callTencentASR(audioBase64, engModelType) {
  return new Promise((resolve, reject) => {
    const secretId  = process.env.TENCENT_SECRET_ID;
    const secretKey = process.env.TENCENT_SECRET_KEY;
    const appId     = process.env.TENCENT_ASR_APPID;

    if (!secretId || !secretKey || !appId) {
      // Mock mode — no credentials configured
      return resolve({ text: '[ASR未配置] 请在.env中设置 TENCENT_SECRET_ID / TENCENT_SECRET_KEY / TENCENT_ASR_APPID', mock: true });
    }

    const host    = 'asr.tencentcloudapi.com';
    const service = 'asr';
    const action  = 'SentenceRecognition';
    const version = '2019-06-14';
    const region  = 'ap-guangzhou';

    const params = {
      ProjectId:     0,
      SubServiceType: 2,
      EngSerViceType: engModelType || '16k_zh',
      SourceType:    1,               // 1 = base64
      VoiceFormat:   'mp3',
      UsrAudioKey:   'wx_' + Date.now(),
      Data:          audioBase64,
      DataLen:       Buffer.from(audioBase64, 'base64').length,
    };

    const body = JSON.stringify(params);
    const { authorization, timestamp } = buildTC3Signature({ secretId, secretKey, service, host, action, version, region, body });

    const options = {
      hostname: host,
      path:     '/',
      method:   'POST',
      headers:  {
        'Content-Type':       'application/json',
        'X-TC-Action':        action,
        'X-TC-Version':       version,
        'X-TC-Timestamp':     timestamp,
        'X-TC-Region':        region,
        'Authorization':      authorization,
        'Content-Length':     Buffer.byteLength(body),
      },
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.Response && json.Response.Result) {
            resolve({ text: json.Response.Result });
          } else {
            const errMsg = json.Response?.Error?.Message || '识别失败';
            reject(new Error(errMsg));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── POST /api/asr/transcribe ─────────────────────────────────────
// Body: multipart form-data, field "audio" = audio file
router.post('/transcribe', aiLimiter, upload.single('audio'), async (req, res) => {
  let tmpPath = null;
  try {
    if (!req.file) return res.status(400).json({ error: '缺少音频文件' });
    tmpPath = req.file.path;

    const audioBuffer = fs.readFileSync(tmpPath);
    const audioBase64  = audioBuffer.toString('base64');
    const engModel     = req.body.engModel || '16k_zh';

    const result = await callTencentASR(audioBase64, engModel);

    res.json({ success: true, text: result.text, mock: result.mock || false });
  } catch (err) {
    console.error('[ASR] transcribe error:', err.message);
    res.status(500).json({ error: 'ASR 识别失败', detail: err.message });
  } finally {
    // Clean up temp file
    if (tmpPath) {
      try { fs.unlinkSync(tmpPath); } catch (_) {}
    }
  }
});

// ── GET /api/asr/config ──────────────────────────────────────────
// Returns whether ASR is properly configured (without exposing secrets)
router.get('/config', (_req, res) => {
  const configured = !!(process.env.TENCENT_SECRET_ID && process.env.TENCENT_SECRET_KEY && process.env.TENCENT_ASR_APPID);
  res.json({ configured, message: configured ? 'ASR 已配置' : 'ASR 未配置，将使用 mock 模式' });
});

module.exports = router;
