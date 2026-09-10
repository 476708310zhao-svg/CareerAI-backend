const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('all public UGC types use pending-by-default API writes and approved-only reads', () => {
  const experiences = read('routes/experiences.js');
  const comments = read('routes/comments.js');
  const agencies = read('routes/agencies.js');

  assert.match(experiences, /moderation_status[\s\S]{0,120}'pending'/);
  assert.match(experiences, /moderation_status = 'approved'/);
  assert.match(comments, /comments[\s\S]{0,180}moderation_status = 'approved'/);
  assert.match(comments, /comment_replies[\s\S]{0,180}moderation_status = 'approved'/);
  assert.match(comments, /VALUES[\s\S]{0,120}'pending'/);
  assert.match(agencies, /agency_reviews[\s\S]{0,180}moderation_status = 'approved'/);
  assert.match(agencies, /VALUES[\s\S]{0,120}'pending'/);
});

test('admin console supports approving and rejecting every public UGC type', () => {
  const adminRoutes = read('routes/admin.js');
  const adminPermissions = read('utils/adminPermissions.js');
  const experienceAdmin = read('admin/experiences.html');
  const commentAdmin = read('admin/comments.html');
  const agencyAdmin = read('admin/agencies.html');

  assert.match(adminRoutes, /experiences\/:id\/moderation/);
  assert.match(adminRoutes, /comments\/:kind\/:id\/moderation/);
  assert.match(adminRoutes, /agency-reviews\/:id\/moderation/);
  assert.match(adminRoutes, /content_moderation_logs/);
  assert.match(adminPermissions, /comment-replies[\s\S]{0,80}comments/);
  [experienceAdmin, commentAdmin, agencyAdmin].forEach(source => {
    assert.match(source, /待审核/);
    assert.match(source, /approved/);
    assert.match(source, /rejected/);
  });
});

test('privacy disclosure matches active virtual payment and pre-publication moderation', () => {
  const privacy = read('miniprogram/pages/privacy/privacy.wxml');
  const privacyData = read('miniprogram/pages/privacy/privacy.js');

  assert.doesNotMatch(privacy, /支付能力：当前暂未开放/);
  assert.match(privacy, /微信小程序虚拟支付/);
  assert.match(privacy, /先进入待审核状态，审核通过后才会公开展示/);
  assert.match(privacyData, /成都职引睿选科技有限公司/);
});
