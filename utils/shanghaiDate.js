'use strict';

const TIME_ZONE = 'Asia/Shanghai';
const DAY_MS = 86400000;
const DAY_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const SHANGHAI_DAY_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

function validDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new RangeError('Invalid date');
  return date;
}

function shanghaiDayKey(value = new Date()) {
  const parts = Object.fromEntries(SHANGHAI_DAY_FORMATTER.formatToParts(validDate(value))
    .filter(part => part.type !== 'literal')
    .map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function utcTimestampToShanghaiDayKey(value) {
  if (value instanceof Date || typeof value === 'number') return shanghaiDayKey(value);
  const text = String(value === undefined || value === null ? '' : value).trim();
  if (!text) throw new RangeError(`Invalid UTC timestamp: ${value}`);
  let normalized = text;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) normalized = `${text}T00:00:00Z`;
  else if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(text)) {
    normalized = `${text.replace(' ', 'T')}Z`;
  }
  try {
    return shanghaiDayKey(normalized);
  } catch (error) {
    throw new RangeError(`Invalid UTC timestamp: ${value}`);
  }
}

function dayKeyEpoch(dayKey) {
  const match = DAY_KEY_PATTERN.exec(String(dayKey || ''));
  if (!match) throw new RangeError(`Invalid calendar day: ${dayKey}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const epoch = Date.UTC(year, month - 1, day);
  const value = new Date(epoch);
  if (value.getUTCFullYear() !== year || value.getUTCMonth() !== month - 1 || value.getUTCDate() !== day) {
    throw new RangeError(`Invalid calendar day: ${dayKey}`);
  }
  return epoch;
}

function addCalendarDays(dayKey, amount) {
  const days = Number(amount);
  if (!Number.isInteger(days)) throw new RangeError(`Invalid calendar day offset: ${amount}`);
  return new Date(dayKeyEpoch(dayKey) + days * DAY_MS).toISOString().slice(0, 10);
}

function calendarDayDifference(targetDayKey, baseDayKey) {
  return (dayKeyEpoch(targetDayKey) - dayKeyEpoch(baseDayKey)) / DAY_MS;
}

function shanghaiWeekRange(value = new Date()) {
  const dayKey = shanghaiDayKey(value);
  const weekday = new Date(dayKeyEpoch(dayKey)).getUTCDay();
  const mondayOffset = -((weekday + 6) % 7);
  const start = addCalendarDays(dayKey, mondayOffset);
  return { start, end: addCalendarDays(start, 6) };
}

module.exports = {
  TIME_ZONE,
  shanghaiDayKey,
  utcTimestampToShanghaiDayKey,
  addCalendarDays,
  calendarDayDifference,
  shanghaiWeekRange
};
