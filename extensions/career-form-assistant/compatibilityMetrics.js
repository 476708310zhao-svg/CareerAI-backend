(() => {
  'use strict';
  const HOSTS = new Set(['boards.greenhouse.io', 'job-boards.greenhouse.io', 'jobs.lever.co', 'jobs.ashbyhq.com']);
  const STATES = new Set(['supported', 'partial', 'unsupported']);
  const REASONS = new Set(['candidate_fields_found', 'no_compatible_fields', 'partial_field_coverage',
    'no_authorized_field_match', 'page_changed_or_partial_fill']);
  const WINDOW_DAYS = 7;
  const MIN_SAMPLE = 5;
  const ALERT_FAILURE_RATE = 0.6;

  function dayKey(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
  }

  function update(log, host, status, reason, now = new Date()) {
    if (!HOSTS.has(host) || !STATES.has(status) || !REASONS.has(reason)) return Array.isArray(log) ? log : [];
    const day = dayKey(now);
    if (!day) return Array.isArray(log) ? log : [];
    const cutoff = new Date(now.getTime() - (WINDOW_DAYS - 1) * 86400000).toISOString().slice(0, 10);
    const next = (Array.isArray(log) ? log : []).filter(item => HOSTS.has(item?.siteId)
      && dayKey(item?.date) >= cutoff && dayKey(item?.date) <= day).map(item => {
      const row = { siteId: item.siteId, date: dayKey(item.date), totalCount: 0, supportedCount: 0,
        partialCount: 0, unsupportedCount: 0, reasons: Object.create(null), updatedAt: day };
      ['totalCount', 'supportedCount', 'partialCount', 'unsupportedCount'].forEach(key => {
        row[key] = Number.isSafeInteger(item[key]) && item[key] >= 0 ? item[key] : 0;
      });
      if (item.reasons && typeof item.reasons === 'object') Object.entries(item.reasons).forEach(([key, value]) => {
        if (REASONS.has(key) && Number.isSafeInteger(value) && value >= 0) row.reasons[key] = value;
      });
      return row;
    });
    let row = next.find(item => item.siteId === host && item.date === day);
    if (!row) {
      row = { siteId: host, date: day, totalCount: 0, supportedCount: 0, partialCount: 0,
        unsupportedCount: 0, reasons: Object.create(null), updatedAt: now.toISOString() };
      next.push(row);
    }
    row.totalCount += 1;
    row[`${status}Count`] += 1;
    row.reasons[reason] = (row.reasons[reason] || 0) + 1;
    row.updatedAt = now.toISOString();
    return next.slice(-HOSTS.size * WINDOW_DAYS);
  }

  function summarize(log, now = new Date()) {
    const cutoff = new Date(now.getTime() - (WINDOW_DAYS - 1) * 86400000).toISOString().slice(0, 10);
    const groups = new Map();
    (Array.isArray(log) ? log : []).forEach(row => {
      if (!HOSTS.has(row?.siteId) || dayKey(row?.date) < cutoff || dayKey(row?.date) > dayKey(now)) return;
      const total = Number.isSafeInteger(row.totalCount) && row.totalCount >= 0 ? row.totalCount : 0;
      const supported = Number.isSafeInteger(row.supportedCount) && row.supportedCount >= 0 ? row.supportedCount : 0;
      const partial = Number.isSafeInteger(row.partialCount) && row.partialCount >= 0 ? row.partialCount : 0;
      const unsupported = Number.isSafeInteger(row.unsupportedCount) && row.unsupportedCount >= 0 ? row.unsupportedCount : 0;
      const group = groups.get(row.siteId) || { siteId: row.siteId, samples: 0, failures: 0, reasons: Object.create(null) };
      group.samples += total;
      group.failures += partial + unsupported;
      if (row.reasons && typeof row.reasons === 'object') Object.entries(row.reasons).forEach(([reason, count]) => {
        if (REASONS.has(reason) && Number.isSafeInteger(count) && count > 0) group.reasons[reason] = (group.reasons[reason] || 0) + count;
      });
      groups.set(row.siteId, group);
    });
    return [...groups.values()].map(group => ({ ...group,
      failureRate: group.samples ? group.failures / group.samples : 0,
      alert: group.samples >= MIN_SAMPLE && group.failures / group.samples >= ALERT_FAILURE_RATE
    }));
  }

  const api = Object.freeze({ update, summarize,
    windowDays: WINDOW_DAYS, minimumSample: MIN_SAMPLE, alertFailureRate: ALERT_FAILURE_RATE,
    hosts: Object.freeze([...HOSTS]), states: Object.freeze([...STATES]), reasons: Object.freeze([...REASONS]) });
  globalThis.ZhiyinCompatibilityMetrics = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
