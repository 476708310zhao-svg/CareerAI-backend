const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildRecordQuery, transform } = require('../scripts/sync_feishu_server');

const ROOT = path.join(__dirname, '..');
const { CAMPUS_KEYS, mergeCampusEnv } = require('../scripts/merge-campus-env');

test('campus sync reads the configured Feishu view', () => {
  const query = new URLSearchParams(buildRecordQuery('next-page'));
  assert.equal(query.get('view_id'), 'vewh2m8QIt');
  assert.equal(query.get('page_token'), 'next-page');
  assert.equal(query.get('page_size'), '500');
});

test('campus sync maps the new table fields and derives recruit year from start date', () => {
  const item = transform({
    fields: {
      '公司': '中微公司-登峰计划',
      '岗位': '资深工艺研发工程师',
      '开始时间': 1786204800000,
      '届次': ['2027届'],
      '工作地点': ['上海', '广州'],
      '招聘类型': ['秋招提前批'],
      '投递链接': 'https://example.com/apply',
      '公告链接': 'https://example.com/notice',
      '截止日期': '招满为止',
      '公司行业': ['半导体'],
      '是否免笔试': ['仅测评'],
      '学历要求': ['博士起']
    }
  });

  assert.equal(item.company, '中微公司-登峰计划');
  assert.equal(item.position_name, '资深工艺研发工程师');
  assert.equal(item.start_date, '2026-08-09');
  assert.equal(item.recruit_year, 2026);
  assert.equal(item.grad_year, 2027);
  assert.deepEqual(JSON.parse(item.locations), ['上海', '广州']);
  assert.equal(item.apply_url, 'https://example.com/apply');
  assert.equal(item.announce_url, 'https://example.com/notice');
});

test('home campus feed bypasses stale client and intermediary caches', () => {
  const apiSource = fs.readFileSync(path.join(ROOT, 'miniprogram/utils/api-campus.js'), 'utf8');
  const homeSource = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/index/index.js'), 'utf8');

  assert.match(apiSource, /_fresh:\s*Date\.now\(\)/);
  assert.match(homeSource, /onShow\(\)[\s\S]*?fetchCampusUpdates\(\{ force: true \}\)/);
});

test('campus deployment only replaces campus-specific Feishu settings', () => {
  const source = CAMPUS_KEYS.map((key, index) => `${key}=career-${index}`).join('\n');
  const target = [
    'PAYMENT_SECRET=keep-payment',
    'FEISHU_APP_ID=keep-marketing',
    'FEISHU_CAMPUS_APP_ID=old-career'
  ].join('\n');
  const merged = mergeCampusEnv(source, target);

  assert.match(merged, /PAYMENT_SECRET=keep-payment/);
  assert.match(merged, /FEISHU_APP_ID=keep-marketing/);
  CAMPUS_KEYS.forEach((key, index) => {
    assert.match(merged, new RegExp(`${key}=career-${index}`));
  });
});
