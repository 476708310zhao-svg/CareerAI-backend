const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const reminder = require('../miniprogram/utils/favorite-reminder.js');
const ROOT = path.join(__dirname, '..', 'miniprogram');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('job favorites use a real future deadline or a 30-day default with 3-day and 1-day reminders', () => {
  const now = new Date('2026-08-03T12:00:00Z');
  assert.equal(reminder.resolveJobReminderDate({ deadline: '2026-08-20' }, now), '2026-08-20');
  assert.equal(reminder.resolveJobReminderDate({ deadlineDate: '2026/08/16' }, now), '2026-08-16');
  assert.equal(reminder.normalizeDate('2026-02-31'), '');
  assert.equal(reminder.resolveJobReminderDate({ deadline: '2026-07-01' }, now), '2026-09-02');
  assert.equal(reminder.resolveJobReminderDate({}, now), '2026-09-02');

  const favorite = reminder.withJobReminderDefaults({ targetId: 'job-1', title: 'Data Analyst' }, now);
  assert.equal(favorite.reminderEnabled, true);
  assert.equal(favorite.reminderAuto, true);
  assert.deepEqual(favorite.reminderLeadDays, [3, 1]);
  assert.deepEqual(reminder.buildJobReminderPayload(favorite).leadDays, [3, 1]);
});

test('ordinary pages do not show the global AI disclosure while dedicated AI tools keep it', () => {
  const ordinaryPages = [
    'package-user/pages/job-detail/job-detail.wxml',
    'package-user/pages/applications/applications.wxml',
    'package-user/pages/company-detail/company-detail.wxml',
    'package-user/pages/vip/vip.wxml',
    'package-user/pages/about/about.wxml',
    'package-content/pages/question-detail/question-detail.wxml',
    'package-content/pages/experience-detail/experience-detail.wxml',
    'pages/jobs/jobs.wxml',
    'pages/experiences/experiences.wxml',
    'pages/agencies/agencies.wxml',
    'pages/profile/profile.wxml'
  ];
  ordinaryPages.forEach(page => assert.doesNotMatch(read(page), /<c-ai-disclosure\b/, page));

  [
    'package-ai/pages/ai-assistant/ai-assistant.wxml',
    'package-ai/pages/interview-space/interview-space.wxml',
    'package-career/pages/career-planner/career-planner.wxml',
    'package-career/pages/ats-optimize/ats-optimize.wxml'
  ].forEach(page => assert.match(read(page), /<c-ai-disclosure\b/, page));
});

test('AI disclosure stays compact and inset while legacy interview notices use the shared component', () => {
  const styles = read('components/c-ai-disclosure/c-ai-disclosure.wxss');
  assert.match(styles, /:host\s*\{[\s\S]*?padding:\s*0 14rpx/);
  assert.match(styles, /\.ai-disclosure-text\s*\{[\s\S]*?flex:\s*1[\s\S]*?min-width:\s*0/);
  assert.match(styles, /\.ai-disclosure-text\s*\{[\s\S]*?font-size:\s*20rpx/);

  [
    'package-ai/pages/interview-setup/interview-setup.wxml',
    'package-ai/pages/interview-dialog/interview-dialog.wxml',
    'package-ai/pages/ai-report/ai-report.wxml'
  ].forEach(page => {
    const wxml = read(page);
    assert.match(wxml, /<c-ai-disclosure\b/, page);
    assert.doesNotMatch(wxml, /class="ai-(?:disclosure|generated-notice)"/, page);
  });
});

test('job detail favorite action stays compact and delegates automatic reminders to the shared favorite utility', () => {
  const detail = read('package-user/pages/job-detail/job-detail.js');
  const favorites = read('utils/favorites.js');

  assert.doesNotMatch(detail, /promptFavoriteReminder|已加入收藏|去设置/);
  assert.match(detail, /deadline:\s*this\.data\.job\.deadline/);
  assert.match(favorites, /withJobReminderDefaults/);
  assert.match(favorites, /upsertReminder\(favoriteReminder\.buildJobReminderPayload/);
});
