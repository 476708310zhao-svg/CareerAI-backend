'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..', 'miniprogram');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

function loadPage(relativePath, mocks = {}) {
  let page;
  const filename = path.join(root, relativePath);
  const context = {
    Page(value) { page = value; },
    wx: { getStorageSync() { return ''; } },
    getApp() { return { syncCustomTabBar() {}, setUnreadCount() {} }; },
    console: { warn() {}, log() {} },
    Date,
    Promise,
    setTimeout,
    clearTimeout,
    require(name) { return Object.prototype.hasOwnProperty.call(mocks, name) ? mocks[name] : {}; }
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  page.data = JSON.parse(JSON.stringify(page.data));
  page.setData = function setData(patch, callback) {
    Object.assign(this.data, patch);
    if (callback) callback();
  };
  return page;
}

function expectMinTouch(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rules = Array.from(css.matchAll(new RegExp(`${escaped}[^\\{]*\\{([^}]*)\\}`, 'g')));
  assert.ok(rules.length, `missing ${selector} style rule`);
  const heights = rules.flatMap(rule => Array.from(rule[1].matchAll(/min-height:\s*(\d+)rpx/g), match => Number(match[1])));
  assert.ok(heights.some(height => height >= 88), `${selector} touch height must be at least 88rpx`);
}

test('home renders one honest primary action and never repeats it in Today', () => {
  const home = read('pages/index/index.wxml');
  const homeJs = read('pages/index/index.js');
  assert.equal((home.match(/class="zy-main-action"/g) || []).length, 1);
  assert.doesNotMatch(home, /zy-progress-card|zy-progress-item|求职进展/);
  assert.match(home, /todaySecondaryTasks/);
  assert.match(homeJs, /title = nextTask\.title/);
  assert.match(homeJs, /String\(item\.id \|\| ''\) !== primaryTaskId/);
  assert.match(homeJs, /\.slice\(0, 2\)/);
  assert.doesNotMatch(homeJs, /title:\s*'今天有 3 项求职任务'/);

  const progressRows = [{ id: 42, company: 'Acme', jobTitle: '产品经理', deadline: '2026-10-12' }];
  const page = loadPage('pages/index/index.js', {
    '../../utils/job-progress.js': { getStats: () => ({ total: 1, active: 1, byStatus: {} }), getList: () => progressRows },
    '../../utils/daily-tasks.js': { getStats: tasks => ({ pending: tasks.filter(item => !item.done).length }) },
    '../../utils/owner-storage.js': { get: () => ({}) },
    '../../utils/feature-flags.js': { isRecruitmentUrl: () => false },
    '../../utils/api.js': {}, '../../utils/jd-match.js': {}, '../../utils/date-time.js': {},
    '../../utils/campus-deadline.js': {}, '../../utils/demo-data.js': { enabled: () => false },
    '../../utils/matcher.js': {}, '../../utils/util.js': {}, '../../utils/assets.js': {},
    '../../utils/navigation.js': {}, '../../utils/data-provenance.js': {}, '../../utils/api-v4.js': {},
    '../../utils/favorites.js': {}, '../../utils/browse-history.js': {}, '../../utils/unread-messages.js': {}
  });
  page.readLatestAtsScore = () => 0;
  page.data.todayTasks = [
    { id: 'interview_42', title: '准备 Acme 面试', desc: '复盘 JD', url: '?applicationId=42', priority: 'high', done: false, type: 'interview' },
    { id: 'resume', title: '检查简历', desc: '确认项目结果', url: '/resume', priority: 'medium', done: false },
    { id: 'jobs', title: '查看岗位', desc: '查看真实岗位', url: '/jobs', priority: 'low', done: false }
  ];
  page.loadWorkbenchSummary();
  assert.equal(page.data.workbench.title, '准备 Acme 面试');
  assert.match(page.data.workbench.meta, /Acme · 产品经理/);
  assert.match(page.data.workbench.meta, /截止 2026-10-12/);
  assert.deepEqual(Array.from(page.data.todaySecondaryTasks, item => item.id), ['resume', 'jobs']);
});

test('home lifecycle no longer requests hidden banner, feature, company or campus modules', () => {
  const source = read('pages/index/index.js');
  const lifecycle = ['onLoad', 'onShow', 'onPullDownRefresh'].map(name => {
    const match = source.match(new RegExp(`${name}\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\n  \\},`));
    return match ? match[1] : '';
  }).join('\n');
  assert.doesNotMatch(lifecycle, /fetchBanners|fetchHotCompanies|fetchCampusUpdates|loadCachedCampusUpdates|scheduleDeferredHomeData/);
  assert.doesNotMatch(source.slice(source.indexOf('data:'), source.indexOf('onLoad()')), /bannerList|features:|aiSpotlight|hotCompanies|campusFeatured|campusUpdates/);
  assert.doesNotMatch(source, /BANNER_CACHE_KEY|HOT_COMPANIES_CACHE_KEY|HOME_CAMPUS_CACHE_KEY|getCampusList|getCompanies|fetchBanners|fetchHotCompanies|fetchCampusUpdates|loadCachedCampusUpdates/);
});

test('resource hub exposes nine honest capabilities with real local search and disabled purchases', () => {
  const source = read('pages/resources/resources.js');
  const wxml = read('pages/resources/resources.wxml');
  const config = JSON.parse(read('pages/resources/resources.json'));
  assert.equal((source.match(/category:\s*'/g) || []).length, 9);
  assert.match(source, /\[item\.title, item\.desc\]\.concat\(item\.tags \|\| \[\]\)/);
  assert.match(source, /types:\s*\['algorithm', 'frontend', 'system'\]/);
  assert.match(source, /item\.types\.includes\(questionType\)/);
  assert.match(wxml, /适用阶段/);
  assert.match(wxml, /目标上下文/);
  assert.match(wxml, /不代表搜索筛选结果或已绑定申请/);
  assert.match(wxml, /aria-disabled="true"/);
  assert.doesNotMatch(wxml, /item\.disabled[^>]*bindtap=/);
  assert.equal(config.navigationStyle, undefined);

  const page = loadPage('pages/resources/resources.js', {
    '../../utils/navigation.js': {}, '../../utils/feature-flags.js': {}
  });
  page.onLoad({ category: 'written', type: 'frontend' });
  assert.deepEqual(Array.from(page.data.questionTypes, item => item.id), ['', 'oa', 'algorithm', 'frontend', 'system']);
  assert.deepEqual(Array.from(page.data.assets, item => item.id), ['algorithm']);
  for (const questionType of ['algorithm', 'frontend', 'system']) {
    page.data.keyword = '';
    page.data.questionType = questionType;
    page.applyFilters();
    assert.deepEqual(Array.from(page.data.assets, item => item.id), ['algorithm'], `${questionType} must map to the real programming bank`);
  }
  page.data.keyword = '系统设计';
  page.applyFilters();
  assert.deepEqual(Array.from(page.data.assets, item => item.id), ['algorithm']);
  page.data.keyword = '不存在的内容';
  page.applyFilters();
  assert.equal(page.data.assets.length, 0);
  page.clearFilters();
  assert.equal(page.data.keyword, '');
  assert.equal(page.data.questionType, '');
  assert.deepEqual(Array.from(page.data.assets, item => item.id), ['oa', 'algorithm']);
  page.data.questionType = 'system';
  page.selectCategory({ currentTarget: { dataset: { id: 'interview' } } });
  assert.deepEqual(Array.from(page.data.questionTypes, item => item.id), ['', 'behavior']);
  assert.equal(page.data.questionType, '');
  assert.deepEqual(Array.from(page.data.assets, item => item.id), ['experience', 'star']);
  page.selectQuestionType({ currentTarget: { dataset: { id: 'frontend' } } });
  assert.equal(page.data.questionType, '', 'a hidden unsupported chip cannot create an artificial empty state');
  page.selectCategory({ currentTarget: { dataset: { id: 'company' } } });
  assert.deepEqual(Array.from(page.data.assets, item => item.id), ['companies', 'news']);
});

test('job cards keep scores internal and present only verifiable evidence', () => {
  const presenter = require('../miniprogram/utils/job-presenter.js');
  const wxml = read('components/c-job-card/c-job-card.wxml');
  const view = presenter.presentJob({
    id: 7, title: 'Data Analyst', company: 'Acme', location: 'Shanghai', salary: '20k',
    matchScore100: 93, matchedSkills: ['SQL'], qualificationStatus: 'partial'
  });
  assert.deepEqual(view.matchEvidence, ['关键词覆盖：SQL', '部分资格待核实']);
  assert.doesNotMatch(wxml, /matchScore|匹配度|AI推荐|\+\s*['"]%/);
  assert.match(wxml, /暂无可验证匹配依据/);
  assert.match(wxml, /aria-role="button" aria-label="\{\{view\.accessibilityLabel\}\}"/);
  assert.match(wxml, /aria-pressed="\{\{view\.isSaved\}\}"/);
  assert.doesNotMatch(wxml, /♥|♡/);
});

test('critical controls on all five pages and the tab bar meet 88rpx touch targets', () => {
  const cases = [
    ['pages/index/index.wxss', ['.zy-main-action', '.zy-main-cta', '.zy-task', '.zy-task-check']],
    ['pages/jobs/jobs.wxss', ['.search-box', '.clear-button,.panel-close', '.filter-button', '.quick-chip,.history-chip,.filter-chip', '.history-clear', '.match-button', '.notice-action', '.campus-entry']],
    ['pages/applications/applications.wxss', ['.add-button', '.focus-row', '.filter', '.status-button', '.primary-button, .secondary-button', '.sheet-close', '.field-input']],
    ['pages/resources/resources.wxss', ['.search-row', '.search-input', '.category-chip, .type-chip', '.asset-card', '.clear-button']],
    ['pages/profile/profile.wxss', ['.identity-card', '.member-card', '.asset-tile', '.service-row']],
    ['custom-tab-bar/index.wxss', ['.tabbar-item']]
  ];
  cases.forEach(([file, selectors]) => {
    const css = read(file);
    selectors.forEach(selector => expectMinTouch(css, selector));
  });
  const app = read('app.wxss');
  assert.match(app, /--btn-height:\s*88rpx/);
  assert.match(app, /--btn-height-sm:\s*88rpx/);
});

test('visual styles keep readable body text, stable press feedback and finite loading motion', () => {
  const files = [
    'pages/index/index.wxss', 'pages/jobs/jobs.wxss', 'pages/applications/applications.wxss',
    'pages/resources/resources.wxss', 'pages/profile/profile.wxss',
    'components/c-job-card/c-job-card.wxss'
  ];
  const css = files.map(read).join('\n');
  assert.doesNotMatch(css, /font-size:\s*(?:1\d|2[0-3])rpx/);
  assert.doesNotMatch(css, /#7b879b|#7b8493/i);
  assert.doesNotMatch(css, /transform:\s*scale\(/);
  assert.doesNotMatch(css, /animation:[^;]*infinite/);
  const tabCss = read('custom-tab-bar/index.wxss');
  assert.match(tabCss, /animation:[^;]*infinite/);
  assert.match(tabCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(tabCss, /\.ai-float-core[\s\S]*animation:\s*none/);
  assert.doesNotMatch(read('app.wxss'), /!important/);
});

test('interactive controls expose accessible names and selected or pressed state', () => {
  const files = [
    'pages/index/index.wxml', 'pages/jobs/jobs.wxml', 'pages/applications/applications.wxml',
    'pages/resources/resources.wxml', 'pages/profile/profile.wxml',
    'components/c-job-card/c-job-card.wxml', 'custom-tab-bar/index.wxml'
  ];
  files.forEach(file => {
    const source = read(file);
    const tags = Array.from(source.matchAll(/<(view|button)[^>]*(?:bindtap|catchtap)="(?!stopModal)[^"]+"[^>]*>/g), match => match[0]);
    tags.forEach(tag => {
      assert.match(tag, /aria-label=/, `${file} control lacks aria-label: ${tag}`);
      if (tag.startsWith('<view')) assert.match(tag, /aria-role="button"/, `${file} view control lacks button role: ${tag}`);
    });
  });
  assert.match(read('custom-tab-bar/index.wxml'), /aria-selected="\{\{selected === index\}\}"/);
  assert.match(read('pages/jobs/jobs.wxml'), /aria-pressed="\{\{matchMode\}\}"/);
  assert.match(read('pages/applications/applications.wxml'), /aria-selected="\{\{activeGroup===item\.key\}\}"/);
  assert.match(read('pages/resources/resources.wxml'), /aria-selected="\{\{activeCategory===item\.id\}\}"/);
  assert.match(read('pages/applications/applications.wxml'), /aria-label="公司名称，必填"/);
});
