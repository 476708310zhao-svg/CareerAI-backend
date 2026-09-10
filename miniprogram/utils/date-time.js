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
  if (dateOnly) {
    return validTimestamp(Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])));
  }

  // Remaining accepted values must already be formats supported by iOS:
  // ISO 8601 with T, or yyyy/MM/dd with an optional time.
  if (!/^\d{4}-\d{2}-\d{2}T/.test(text) && !/^\d{4}\/\d{2}\/\d{2}(?: |$)/.test(text)) return 0;
  return validTimestamp(Date.parse(text));
}

module.exports = { timestamp };
