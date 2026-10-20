const isolatedRuntime = require('./helpers/isolatedTestRuntime.cjs');
isolatedRuntime.install();
isolatedRuntime.prepare();

const test = require('node:test');
const assert = require('node:assert/strict');
isolatedRuntime.registerCleanup(test);
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { campusDeadlineMeta } = require('../miniprogram/utils/campus-deadline');
const { buildRecordQuery, transform } = require('../scripts/sync_feishu_server');

const ROOT = path.join(__dirname, '..');
const { CAMPUS_KEYS, mergeCampusEnv } = require('../scripts/merge-campus-env');
const { formatCampus } = require('../db/formatters');

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

test('home shows a compact campus digest while campus API requests stay fresh', () => {
  const apiSource = fs.readFileSync(path.join(ROOT, 'miniprogram/utils/api-campus.js'), 'utf8');
  const homeSource = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/index/index.js'), 'utf8');
  const homeMarkup = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/index/index.wxml'), 'utf8');

  assert.match(apiSource, /_fresh:\s*Date\.now\(\)/);
  assert.match(homeSource, /getCampusList\(\{ sort: 'latest', latestDay: '1', deadlineWindow: 'open'/);
  assert.match(homeMarkup, /campusDigest/);
  assert.match(homeMarkup, /每日最新校招/);
  assert.doesNotMatch(homeSource, /fetchCampusUpdates|loadCachedCampusUpdates|HOME_CAMPUS_CACHE_KEY/);
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

test('campus formatter normalizes compact deadlines and exposes provenance', () => {
  const compactYear = formatCampus({
    id: 901,
    company: '示例科技',
    start_date: '2026-05-01',
    deadline_date: '26.6.30',
    source: '飞书校招日历',
    updated_at: '2026-06-01 09:00:00'
  });
  const inferredYear = formatCampus({
    id: 902,
    company: '跨年招聘',
    start_date: '2026-10-01',
    deadline_date: '4.30',
    source: '综合公开信息',
    updated_at: '2026-10-01 09:00:00'
  });
  const invalidDate = formatCampus({
    id: 903,
    company: '错误日期',
    start_date: '2026-01-01',
    deadline_date: '2026-02-31',
    source: '综合公开信息'
  });

  assert.equal(compactYear.deadlineDateNormalized, '2026-06-30');
  assert.equal(compactYear.deadlineWindow, 'expired');
  assert.equal(compactYear.dataMeta.sourceCode, 'campus_feishu');
  assert.equal(compactYear.dataMeta.freshness, 'expired');
  assert.equal(inferredYear.deadlineDateNormalized, '2027-04-30');
  assert.equal(invalidDate.deadlineDateNormalized, '');
});

test('campus list and detail show source and freshness metadata', () => {
  const listJs = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/campus/campus.js'), 'utf8');
  const listWxml = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/campus/campus.wxml'), 'utf8');
  const detailJs = fs.readFileSync(path.join(ROOT, 'miniprogram/package-content/pages/campus-detail/campus-detail.js'), 'utf8');
  const detailWxml = fs.readFileSync(path.join(ROOT, 'miniprogram/package-content/pages/campus-detail/campus-detail.wxml'), 'utf8');
  const homeWxml = fs.readFileSync(path.join(ROOT, 'miniprogram/components/home-campus-updates/home-campus-updates.wxml'), 'utf8');

  assert.match(listJs, /markCachedDataMeta/);
  assert.match(listWxml, /item\._sourceSummary/);
  assert.match(detailJs, /_freshnessReason/);
  assert.match(detailWxml, /detail\._freshnessText/);
  assert.match(homeWxml, /item\._sourceSummary/);
});

test('home campus deadlines accept compact dates without platform string parsing', () => {
  class IOSDate extends Date {
    constructor(...args) {
      assert.notEqual(typeof args[0], 'string', 'raw date strings must not reach Date');
      super(...args);
    }
    static parse() { throw new Error('raw date strings must not reach Date.parse'); }
  }
  const context = { module: { exports: {} }, Date: IOSDate };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'miniprogram/utils/campus-deadline.js'), 'utf8'), context);
  const meta = context.module.exports.campusDeadlineMeta;
  const now = Date.UTC(2026, 8, 20);
  for (const value of ['10.25', '10/25', '10-25', '2026.10.25', '26.10.25', '2026-10-25', '2026/10/25', '10月25日']) {
    assert.equal(meta(value, {}, now).text, '10-25截止', value);
    assert.equal(meta(value, {}, now).isSoon, false, value);
  }
  for (const value of ['招满为止', '长期招聘', '待定', '13.25', '2.30', '2026-02-29', '2026-02-31']) {
    assert.equal(meta(value, {}, now).text, value);
    assert.equal(meta(value, {}, now).isSoon, false);
  }
  assert.equal(meta('', {}, now).text, '尽快投递');
});

test('home campus deadlines respect recruitment year, leap years and Shanghai day boundaries', () => {
  const now = Date.UTC(2026, 8, 20);
  assert.equal(campusDeadlineMeta('10.25', { recruitYear: 2025 }, now).text, '已截止');
  assert.equal(campusDeadlineMeta('4.30', { startDate: '2026-10-01' }, now).text, '04-30截止');
  assert.equal(campusDeadlineMeta('2.29', { recruitYear: 2028 }, now).text, '02-29截止');
  assert.equal(campusDeadlineMeta('2026-09-19', {}, now).text, '已截止');
  assert.equal(campusDeadlineMeta('2026-09-27', {}, now).text, '7天后截止');
  assert.equal(campusDeadlineMeta('2026-09-28', {}, now).isSoon, false);
  assert.equal(campusDeadlineMeta('10.25', {}, Date.UTC(2026, 9, 24, 15, 59)).text, '1天后截止');
  assert.equal(campusDeadlineMeta('10.25', {}, Date.UTC(2026, 9, 24, 16)).text, '今日截止');
});

test('home campus cards use normalized deadlines and preserve context for legacy data', () => {
  let page;
  const calls = [];
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'miniprogram/pages/index/index.js'), 'utf8'), {
    Page: value => { page = value; },
    require: name => {
      if (name.endsWith('/demo-data.js')) return { enabled: () => false };
      if (name.endsWith('/date-time.js')) return require('../miniprogram/utils/date-time');
      if (name.endsWith('/campus-deadline.js')) return { campusDeadlineMeta: (value, context) => {
        calls.push({ value, context });
        return value ? { text: '04-30截止', isSoon: false } : { text: '尽快投递', isSoon: true };
      } };
      if (name.endsWith('/data-provenance.js')) return require('../miniprogram/utils/data-provenance');
      return {};
    }
  });
  const item = { id: 1, company: '示例', companyLogo: '/logo.png', deadlineDate: '4.30',
    deadlineDateNormalized: '2027-04-30', startDate: '2026-10-01', recruitYear: 2026,
    updatedAt: '2026-09-20 09:03:56' };
  const card = page.formatCampusUpdateItem(item);
  assert.equal(calls[0].value, '2027-04-30');
  assert.equal(card.updateTimestamp, Date.UTC(2026, 8, 20, 9, 3, 56));
  assert.match(card.sourceSummary, /^来源待核实 · (近期更新|建议复核|可能过期)$/);
  page.formatCampusUpdateItem({ ...item, deadlineDateNormalized: '' });
  assert.equal(calls[1].value, '4.30');
  assert.equal(calls[1].context.startDate, '2026-10-01');
  assert.equal(calls[1].context.recruitYear, 2026);
  const noDeadline = page.formatCampusUpdateItem({ ...item, deadlineDateNormalized: '', deadlineDate: '' });
  assert.equal(noDeadline.isUrgent, false);
  assert.equal(noDeadline.badgeText, '新更新');
});
