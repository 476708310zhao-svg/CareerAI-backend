const DAY_MS = 86400000;

// 校招日期按北京时间的日历日计算，不把原始文本传给 Date/Date.parse。
function campusDeadlineMeta(value, context = {}, now = Date.now()) {
  const text = String(value || '').trim();
  if (!text || text === '尽快投递') return { text: text || '尽快投递', isSoon: true };
  const today = new Date(now + 8 * 60 * 60 * 1000);
  const normalized = text.replace(/年|月/g, '-').replace(/日$/, '');
  const full = normalized.match(/^(\d{4}|\d{2})[./-](\d{1,2})[./-](\d{1,2})$/);
  const short = normalized.match(/^(\d{1,2})[./-](\d{1,2})$/);
  if (!full && !short) return { text, isSoon: false };

  let year, month, day;
  if (full) {
    year = Number(full[1]) + (full[1].length === 2 ? 2000 : 0);
    month = Number(full[2]);
    day = Number(full[3]);
  } else {
    month = Number(short[1]);
    day = Number(short[2]);
    const start = String(context.startDate || '').match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})(?:$|[ T])/);
    const recruitYear = Number(context.recruitYear);
    year = start ? Number(start[1])
      : (Number.isInteger(recruitYear) && recruitYear >= 1000 && recruitYear <= 9999 ? recruitYear : today.getUTCFullYear());
    // 与校招接口保持一致：秋季开始、次年春季截止的无年份日期跨年。
    if (start && Number(start[2]) - month >= 6) year += 1;
  }
  const target = Date.UTC(year, month - 1, day);
  const parsed = new Date(target);
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() + 1 !== month || parsed.getUTCDate() !== day) {
    return { text, isSoon: false };
  }
  const todayDate = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const days = Math.round((target - todayDate) / DAY_MS);
  if (days < 0) return { text: '已截止', isSoon: false };
  if (days === 0) return { text: '今日截止', isSoon: true };
  if (days <= 7) return { text: days + '天后截止', isSoon: true };
  return { text: String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0') + '截止', isSoon: false };
}

module.exports = { campusDeadlineMeta };
