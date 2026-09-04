const express = require('express');
const router = express.Router();
const analytics = require('../services/v4Analytics');
const { optionalAuth } = require('../middleware/auth');

const EVENT_RE = /^[a-z][a-z0-9_.:-]{1,80}$/i;

function safeText(value, max = 200) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

router.post('/events', optionalAuth, (req, res) => {
  const body = req.body || {};
  const eventName = safeText(body.eventName || body.event || body.name, 100);
  if (!EVENT_RE.test(eventName)) {
    return res.status(400).json({ code: -1, message: '事件名称无效' });
  }

  const payload = Object.assign({}, body.payload && typeof body.payload === 'object' ? body.payload : {}, {
    acquisitionSource: safeText(body.source, 80)
  });
  const result = analytics.track(
    req.user && req.user.userId,
    eventName,
    payload,
    safeText(body.route, 160),
    'client',
    { scene: safeText(body.scene, 80), dataClass: body.dataClass }
  );
  if (!result.inserted) {
    console.error('[analytics/events] write failed:', result.error);
    return res.json({ code: 0, message: 'ok', dropped: true });
  }

  res.json({ code: 0, message: 'ok', dropped: false });
});

router.get('/health', (_req, res) => {
  res.json({ code: 0, message: 'analytics ok' });
});

module.exports = router;
