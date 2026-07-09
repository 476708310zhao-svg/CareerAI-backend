const express = require('express');
const router = express.Router();
const db = require('../db/database');

const EVENT_RE = /^[a-z][a-z0-9_.:-]{1,80}$/i;

function safeText(value, max = 200) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function safePayload(value) {
  const source = value && typeof value === 'object' ? value : {};
  const json = JSON.stringify(source);
  return json.length > 8000 ? JSON.stringify({ truncated: true }) : json;
}

router.post('/events', (req, res) => {
  const body = req.body || {};
  const eventName = safeText(body.eventName || body.event || body.name, 100);
  if (!EVENT_RE.test(eventName)) {
    return res.status(400).json({ code: -1, message: '事件名称无效' });
  }

  try {
    db.prepare(`
      INSERT INTO analytics_events (user_id, event_name, route, source, scene, payload)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      req.user && req.user.userId ? req.user.userId : null,
      eventName,
      safeText(body.route, 160),
      safeText(body.source, 80),
      safeText(body.scene, 80),
      safePayload(body.payload)
    );
  } catch (err) {
    console.error('[analytics/events] write failed:', err.message);
    return res.json({ code: 0, message: 'ok', dropped: true });
  }

  res.json({ code: 0, message: 'ok', dropped: false });
});

router.get('/health', (_req, res) => {
  res.json({ code: 0, message: 'analytics ok' });
});

module.exports = router;
