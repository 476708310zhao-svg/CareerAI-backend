const DEFAULT_JOB_REMINDER_OFFSET_DAYS = 30;
const DEFAULT_JOB_REMINDER_LEAD_DAYS = [3, 1];

function normalizeDate(value) {
  const text = String(value || '').trim();
  const match = text.match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  if (!match) return '';
  const month = String(match[2]).padStart(2, '0');
  const day = String(match[3]).padStart(2, '0');
  const normalized = `${match[1]}-${month}-${day}`;
  const parsed = new Date(normalized + 'T00:00:00Z');
  if (Number.isNaN(parsed.getTime()) || dateKey(parsed) !== normalized) return '';
  return normalized;
}

function dateKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function defaultReminderDate(now) {
  const base = now ? new Date(now) : new Date();
  const target = new Date(base.getTime());
  target.setUTCDate(target.getUTCDate() + DEFAULT_JOB_REMINDER_OFFSET_DAYS);
  return dateKey(target);
}

function resolveJobReminderDate(item, now) {
  const data = item || {};
  const today = dateKey(now || new Date());
  const provided = [
    data.deadline,
    data.deadlineDate,
    data.applicationDeadline,
    data.validThrough,
    data.endDate,
    data.jobOfferExpiration
  ].map(normalizeDate).find(value => value && value >= today);
  return provided || defaultReminderDate(now);
}

function withJobReminderDefaults(item, now) {
  const deadline = resolveJobReminderDate(item, now);
  return Object.assign({}, item || {}, {
    deadline,
    reminderEnabled: true,
    reminderLeadDays: DEFAULT_JOB_REMINDER_LEAD_DAYS.slice(),
    reminderAuto: true
  });
}

function buildJobReminderPayload(item) {
  const data = item || {};
  return {
    sourceType: 'favorite_job',
    targetId: String(data.targetId || data.id || ''),
    reminderType: 'deadline',
    reminderDate: data.deadline || '',
    title: data.title || '',
    company: data.company || data.subtitle || '',
    jobTitle: data.title || '',
    leadDays: DEFAULT_JOB_REMINDER_LEAD_DAYS.slice(),
    enabled: true,
    payload: data
  };
}

module.exports = {
  DEFAULT_JOB_REMINDER_OFFSET_DAYS,
  DEFAULT_JOB_REMINDER_LEAD_DAYS,
  normalizeDate,
  defaultReminderDate,
  resolveJobReminderDate,
  withJobReminderDefaults,
  buildJobReminderPayload
};
