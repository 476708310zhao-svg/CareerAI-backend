const db = require('../db/database');
const { EVENT_VERSION, inferDataClass, prepareFunnelPayload } = require('../utils/funnelAnalytics');

function sanitize(value) {
  const text = JSON.stringify(value || {})
    .replace(/\b1[3-9]\d{9}\b/g, '[phone]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig, '[email]')
    .replace(/\b\d{15,18}[0-9X]\b/ig, '[id]');
  return text.length > 8000 ? JSON.stringify({ truncated: true }) : text;
}

function userMarker(userId) {
  if (!userId) return {};
  try {
    return db.prepare('SELECT email, nickname FROM users WHERE id=?').get(userId) || {};
  } catch (error) {
    return {};
  }
}

function track(userId, eventName, payload = {}, route = '', source = 'server', options = {}) {
  try {
    const dataClass = inferDataClass({
      environment: process.env.ANALYTICS_DATA_CLASS,
      explicit: options.dataClass || payload.dataClass,
      source,
      payload,
      user: userMarker(userId)
    });
    const result = db.prepare(`
      INSERT INTO analytics_events
        (user_id,event_name,route,source,scene,payload,data_class,is_test,event_version)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(
      userId || null, String(eventName).slice(0, 100), String(route).slice(0, 160),
      String(source || 'server').slice(0, 80), String(options.scene || '').slice(0, 80), sanitize(payload),
      dataClass, dataClass === 'test' ? 1 : 0,
      Number(options.eventVersion || payload.eventVersion || EVENT_VERSION) || EVENT_VERSION
    );
    return { inserted: true, id: Number(result.lastInsertRowid), dataClass };
  } catch (e) {
    return { inserted: false, error: e.message };
  }
}

function trackFunnel(userId, eventName, payload = {}, route = '', options = {}) {
  return track(userId, eventName, prepareFunnelPayload(userId, eventName, payload), route, 'server', options);
}

module.exports = { track, trackFunnel, sanitize };
