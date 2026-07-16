const db = require('../db/database');

function sanitize(value) {
  const text = JSON.stringify(value || {})
    .replace(/\b1[3-9]\d{9}\b/g, '[phone]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig, '[email]')
    .replace(/\b\d{15,18}[0-9X]\b/ig, '[id]');
  return text.length > 8000 ? JSON.stringify({ truncated: true }) : text;
}

function track(userId, eventName, payload = {}, route = '', source = 'server') {
  try {
    db.prepare('INSERT INTO analytics_events (user_id,event_name,route,source,payload) VALUES (?,?,?,?,?)')
      .run(userId || null, String(eventName).slice(0, 100), String(route).slice(0, 160), source, sanitize(payload));
  } catch (e) {}
}

module.exports = { track, sanitize };
