'use strict';

function validTimestamp(value) {
  return Number.isFinite(value) ? value : 0;
}

function timestamp(value) {
  if (value instanceof Date) return validTimestamp(value.getTime());
  if (typeof value === 'number') return validTimestamp(value);

  const text = String(value === undefined || value === null ? '' : value).trim();
  if (!text) return 0;
  if (/^\d+$/.test(text)) return validTimestamp(Number(text));

  // SQLite datetime('now') is UTC but uses a space separator, which some iOS
  // WebViews reject. Parse its fields directly to preserve UTC semantics.
  const sqlite = text.match(/^(\d{4})-(\d{2})-(\d{2})[ ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/);
  if (sqlite) {
    const milliseconds = Number(String(sqlite[7] || '').padEnd(3, '0')) || 0;
    return validTimestamp(Date.UTC(
      Number(sqlite[1]), Number(sqlite[2]) - 1, Number(sqlite[3]),
      Number(sqlite[4]), Number(sqlite[5]), Number(sqlite[6]), milliseconds
    ));
  }

  const dateOnly = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) return validTimestamp(Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])));

  const shanghaiLocal = text.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?$/);
  if (shanghaiLocal) {
    const year = Number(shanghaiLocal[1]);
    const month = Number(shanghaiLocal[2]);
    const day = Number(shanghaiLocal[3]);
    const hour = Number(shanghaiLocal[4] || 0);
    const minute = Number(shanghaiLocal[5] || 0);
    const second = Number(shanghaiLocal[6] || 0);
    const localEpoch = Date.UTC(year, month - 1, day, hour, minute, second);
    const check = new Date(localEpoch);
    if (check.getUTCFullYear() !== year || check.getUTCMonth() + 1 !== month || check.getUTCDate() !== day
      || check.getUTCHours() !== hour || check.getUTCMinutes() !== minute || check.getUTCSeconds() !== second) return 0;
    return localEpoch - 8 * 60 * 60 * 1000;
  }

  // Remaining accepted values must already be formats supported by iOS:
  // ISO 8601 with T, or yyyy/MM/dd with an optional time.
  if (!/^\d{4}-\d{2}-\d{2}T/.test(text) && !/^\d{4}\/\d{2}\/\d{2}(?: |$)/.test(text)) return 0;
  return validTimestamp(Date.parse(text));
}

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

function shanghaiDayParts(value) {
  const time = value === undefined ? Date.now() : timestamp(value);
  const explicitEpoch = value === 0 || value === '0'
    || (value instanceof Date && value.getTime() === 0);
  if (!Number.isFinite(time) || (time === 0 && !explicitEpoch)) return null;
  const date = new Date(time + SHANGHAI_OFFSET_MS);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  };
}

function shanghaiDayKey(value) {
  const parts = shanghaiDayParts(value);
  if (!parts) return '';
  return [parts.year, String(parts.month).padStart(2, '0'), String(parts.day).padStart(2, '0')].join('-');
}

function calendarDayParts(value) {
  if (value instanceof Date || typeof value === 'number') return shanghaiDayParts(value);
  const text = String(value || '').trim();
  // Plain dates and picker-style local datetimes are already Shanghai calendar
  // values. ISO datetimes with offsets must first cross the Shanghai zone.
  const shanghaiLocal = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?)?$/);
  if (shanghaiLocal) {
    const year = Number(shanghaiLocal[1]);
    const month = Number(shanghaiLocal[2]);
    const day = Number(shanghaiLocal[3]);
    const check = new Date(Date.UTC(year, month - 1, day));
    if (check.getUTCFullYear() === year && check.getUTCMonth() + 1 === month && check.getUTCDate() === day) {
      return { year, month, day };
    }
    return null;
  }
  return shanghaiDayParts(value);
}

function shanghaiDayDistance(value, now) {
  const target = calendarDayParts(value);
  const today = shanghaiDayParts(now === undefined ? Date.now() : now);
  if (!target || !today) return null;
  return Math.round((Date.UTC(target.year, target.month - 1, target.day)
    - Date.UTC(today.year, today.month - 1, today.day)) / 86400000);
}

module.exports = { timestamp, shanghaiDayParts, shanghaiDayKey, calendarDayParts, shanghaiDayDistance };
