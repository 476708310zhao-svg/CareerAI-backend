'use strict';

const express = require('express');
const crypto  = require('crypto');
const { exec } = require('child_process');
const path    = require('path');

const router = express.Router();
const SCRIPT = path.join(__dirname, '../scripts/deploy-frontend.sh');

router.post('/deploy', (req, res) => {
  const secret = process.env.WEBHOOK_SECRET || '';

  // 验证 GitHub 签名
  if (secret) {
    const sig = req.headers['x-hub-signature-256'];
    if (!sig) return res.status(401).json({ error: 'missing signature' });
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(req.rawBody || '').digest('hex');
    try {
      if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
        return res.status(401).json({ error: 'invalid signature' });
      }
    } catch {
      return res.status(401).json({ error: 'signature error' });
    }
  }

  // 只处理推送到 main 分支的事件
  const payload = req.body || {};
  if (payload.ref !== 'refs/heads/main') {
    return res.json({ message: 'not main branch, skipped' });
  }

  // 立即响应，异步执行构建
  res.json({ message: 'deploy triggered' });
  console.log('[Webhook] Deploy triggered by push to main');

  exec(`bash "${SCRIPT}"`, { timeout: 300000 }, (err, stdout, stderr) => {
    if (err) console.error('[Webhook] Deploy failed:', err.message, stderr);
    else     console.log('[Webhook] Deploy done:', stdout.slice(-200));
  });
});

module.exports = router;
