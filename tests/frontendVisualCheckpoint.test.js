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

function contrastAgainstWhite(hex) {
  const rgb = hex.match(/[a-f\d]{2}/gi).map(value => parseInt(value, 16) / 255);
  const linear = rgb.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  return 1.05 / (luminance + 0.05);
}

function colorFor(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rule = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  assert.ok(rule, `missing ${selector} rule`);
  const color = rule[1].match(/(?:^|;)\s*color:\s*(#[a-f\d]{6})/i);
  assert.ok(color, `missing ${selector} text color`);
  return color[1].slice(1);
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
    '../../utils/navigation.js': {}, '../../utils/data-provenance.js': require('../miniprogram/utils/data-provenance.js'), '../../utils/api-v4.js': {},
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

test('home lifecycle only requests visible modules, without hidden banners or company modules', () => {
  const source = read('pages/index/index.js');
  const lifecycle = ['onLoad', 'onShow', 'onPullDownRefresh'].map(name => {
    const match = source.match(new RegExp(`${name}\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\n  \\},`));
    return match ? match[1] : '';
  }).join('\n');
  assert.doesNotMatch(lifecycle, /fetchBanners|fetchHotCompanies|fetchCampusUpdates|loadCachedCampusUpdates|scheduleDeferredHomeData/);
  assert.doesNotMatch(source.slice(source.indexOf('data:'), source.indexOf('onLoad()')), /bannerList|features:|aiSpotlight|hotCompanies|campusFeatured|campusUpdates/);
  assert.doesNotMatch(source, /BANNER_CACHE_KEY|HOT_COMPANIES_CACHE_KEY|HOME_CAMPUS_CACHE_KEY|getCompanies|fetchBanners|fetchHotCompanies|fetchCampusUpdates|loadCachedCampusUpdates/);
  assert.match(source, /fetchHomeCampusDigest/);
  assert.match(read('pages/index/index.wxml'), /zy-campus-section/);
});

test('home opportunity and campus cards only use current public API records', async () => {
  const now = Date.now();
  const daysAgo = days => new Date(now - days * 86400000).toISOString();
  let jobQuery;
  const page = loadPage('pages/index/index.js', {
    '../../utils/api.js': {
      getAggregatedJobs: async query => {
        jobQuery = query;
        return { data: [
          { job_id: 'older', job_title: '旧岗位', employer_name: 'A', job_posted_at_datetime_utc: daysAgo(90) },
          { job_id: 'fresh-2', job_title: '产品实习生', employer_name: 'B', job_posted_at_datetime_utc: daysAgo(2), dataMeta: { sourceCode: 'adzuna', sourceLabel: 'Adzuna', freshness: 'fresh', freshnessLabel: '近期更新' } },
          { job_id: 'fresh-1', job_title: '数据分析师', employer_name: 'C', job_posted_at_datetime_utc: daysAgo(1), dataMeta: { sourceCode: 'jsearch', sourceLabel: 'JSearch', freshness: 'fresh', freshnessLabel: '近期更新' } }
        ] };
      },
      getCampusList: async () => ({ code: 0, data: { list: [{ id: 'campus-1' }] } })
    },
    '../../utils/owner-storage.js': { capture: () => 'owner', isCurrent: () => true },
    '../../utils/date-time.js': { timestamp: value => Date.parse(value) || 0 },
    '../../utils/util.js': { formatSalaryRange: () => '' },
    '../../utils/data-provenance.js': require('../miniprogram/utils/data-provenance.js'),
    '../../utils/demo-data.js': { enabled: () => false }
  });
  page._visible = true;
  page.withCompanyLogos = jobs => jobs;
  page.rankCampusUpdates = () => [{ id: 'campus-1', title: '某公司校招', isUrgent: true, deadlineText: '3天后截止', updateTimestamp: now }];
  page.normalizeCampusUpdateSubtitle = () => '校招信息';

  await page.fetchLatestJobs();
  assert.equal(jobQuery.country, 'global');
  assert.deepEqual(Array.from(page.data.latestJobs, job => job.id), ['fresh-1', 'fresh-2']);
  assert.equal(page.data.latestJobs[0].sourceSummary, 'JSearch · 近期更新');
  await page.fetchHomeCampusDigest();
  assert.equal(page.data.campusDigest.length, 1);
  assert.equal(page.data.campusDigest[0].digestLabel, '即将截止');
  assert.match(read('pages/index/index.wxml'), /item\.sourceSummary/);
});

test('home visual fixture reflects the expanded page without silently replacing the approved PNG', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '.agents', 'skills',
    'zhiyin-miniprogram-pixel-replica', 'references', 'screens.json'), 'utf8'));
  const home = manifest.screens.home;
  assert.equal(home.baseline, 'assets/home-approved.png');
  assert.equal(home.baselineContentStatus, 'outdated-after-approved-home-density-expansion');
  assert.equal(manifest.defaults.maxGlobalShiftPx, 2);
  assert.equal(home.fixture.homeRecommendationsEnabled, false);
  assert.equal(home.fixture.latestJobs.length, 2);
  assert.equal(home.fixture.campusDigest.length, 1);
  assert.ok(home.fixture.latestJobs.every(item => item.sourceSummary));
  assert.ok(home.fixture.campusDigest.every(item => item.sourceSummary));
});

test('home cached recommendations disclose local-cache provenance', () => {
  const publishedAt = new Date(Date.now() - 2 * 86400000).toISOString();
  const cache = [1, 2, 3].map(id => ({
    id, title: `岗位 ${id}`, company: 'Acme', postedAtRaw: publishedAt,
    dataMeta: { sourceCode: 'jsearch', sourceLabel: 'JSearch', freshness: 'fresh', freshnessLabel: '近期更新' }
  }));
  const page = loadPage('pages/index/index.js', {
    '../../utils/owner-storage.js': { get: () => cache },
    '../../utils/data-provenance.js': require('../miniprogram/utils/data-provenance.js'),
    '../../utils/demo-data.js': { enabled: () => false }
  });
  page.withCompanyLogos = jobs => jobs;
  page.loadWorkbenchSummary = () => {};
  assert.equal(page.loadCachedOrMockJobs(), true);
  assert.equal(page.data.recommendJobs[0].dataMeta.sourceCode, 'cache');
  assert.equal(page.data.recommendJobs[0].sourceSummary, '本地缓存 · 近期更新');
  const stale = require('../miniprogram/utils/data-provenance.js').markCachedDataMeta(
    { sourceCode: 'jsearch', freshness: 'fresh', freshnessLabel: '近期更新', referenceAt: '2020-01-01T00:00:00Z' },
    { domain: 'job' }
  );
  assert.equal(stale.freshness, 'stale');
  assert.equal(stale.freshnessLabel, '可能过期');
});

test('resource hub shows every available asset without category tabs and keeps purchases disabled', () => {
  const source = read('pages/resources/resources.js');
  const wxml = read('pages/resources/resources.wxml');
  const wxss = read('pages/resources/resources.wxss');
  const config = JSON.parse(read('pages/resources/resources.json'));
  assert.equal((source.match(/category:\s*'/g) || []).length, 9);
  assert.match(source, /\[item\.title, item\.desc\]\.concat\(item\.tags \|\| \[\]\)/);
  assert.match(source, /types:\s*\['algorithm', 'frontend', 'system'\]/);
  assert.match(source, /FEATURED_IDS\.includes\(item\.id\)/);
  assert.match(wxml, /适用阶段/);
  assert.match(wxml, /目标上下文/);
  assert.match(wxml, /不代表搜索筛选结果或已绑定申请/);
  assert.match(wxml, /aria-disabled="true"/);
  assert.doesNotMatch(wxml, /category-scroll|type-scroll|selectCategory|selectQuestionType/);
  assert.match(wxml, /class="feature-grid"/);
  assert.match(wxss, /\.feature-card\s*\{[^}]*align-items:\s*center;[^}]*min-height:\s*108rpx/);
  assert.match(wxml, /class="asset-list"/);
  assert.match(wxml, /class="unavailable-card"/);
  assert.doesNotMatch(wxml, /class="resource-panel"/);
  assert.match(source, /listAssets/);
  assert.equal(config.navigationStyle, 'custom');

  const page = loadPage('pages/resources/resources.js', {
    '../../utils/navigation.js': {}, '../../utils/feature-flags.js': {}
  });
  page.onLoad({ category: 'written', type: 'frontend' });
  assert.equal(page.data.questionType, 'frontend');
  assert.equal(page.data.assets.length, 9);
  assert.deepEqual(Array.from(page.data.featuredAssets, item => item.id), ['campus', 'oa', 'experience', 'star']);
  assert.deepEqual(Array.from(page.data.listAssets, item => item.id), ['agency', 'algorithm', 'companies', 'news', 'favorite']);
  page.data.keyword = '系统设计';
  page.applyFilters();
  assert.deepEqual(Array.from(page.data.assets, item => item.id), ['algorithm']);
  assert.deepEqual(Array.from(page.data.listAssets, item => item.id), ['algorithm']);
  page.data.keyword = '不存在的内容';
  page.applyFilters();
  assert.equal(page.data.assets.length, 0);
  page.clearFilters();
  assert.equal(page.data.keyword, '');
  assert.equal(page.data.assets.length, 9);
  assert.equal(page.data.listAssets.length, 5);
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
    ['pages/resources/resources.wxss', ['.search-row', '.search-input', '.feature-card', '.asset-card', '.clear-button']],
    ['pages/profile/profile.wxss', ['.profile-identity', '.vip-banner', '.record-item', '.service-row']],
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

test('AI answer controls are named and retry stays a full touch target', () => {
  const wxml = read('pages/ai-career/ai-career.wxml');
  const css = read('pages/ai-career/ai-career.wxss');
  for (const [action, label] of [
    ['onCopyAnswer', '复制这条 AI 回答'],
    ['onSaveAnswer', '保存这条 AI 回答'],
    ['onContinueAsk', '继续追问这条 AI 回答'],
    ['onRetry', '重新发送上一条消息']
  ]) {
    const control = wxml.match(new RegExp(`<view[^>]*bindtap="${action}"[^>]*>`, 's'));
    assert.ok(control, `${action} must exist`);
    assert.match(control[0], /aria-role="button"/);
    assert.ok(control[0].includes(`aria-label="${label}"`));
  }
  assert.match(wxml, /class="sug-chip"[\s\S]*?aria-role="button"[\s\S]*?aria-label="发送追问：\{\{sug\}\}"/);
  expectMinTouch(css, '.retry-btn');
});

test('AI sidebar and application assistant controls remain named and touchable', () => {
  const wxml = read('pages/ai-career/ai-career.wxml');
  const css = read('pages/ai-career/ai-career.wxss');
  const tags = Array.from(wxml.matchAll(/<view\b[^>]*\bbindtap="[^"]+"[^>]*>/gs), match => match[0]);
  tags.forEach(tag => {
    if (/aria-hidden="true"/.test(tag)) return;
    assert.match(tag, /aria-role="button"/, tag);
    assert.match(tag, /aria-label=/, tag);
  });
  for (const selector of [
    '.context-switch', '.drawer-close', '.drawer-new', '.drawer-tool, .recent-chat',
    '.drawer-more', '.application-choice', '.application-empty, .application-resume-picker, .application-jd-input',
    '.question-type', '.application-generate', '.application-draft-btn', '.application-label-link'
  ]) expectMinTouch(css, selector);
  assert.match(wxml, /aria-selected="\{\{selectedQuestionType === item\.code\}\}"/);
  assert.match(wxml, /aria-disabled="\{\{!applicationJobs\.length \|\| !hasApplicationResume \|\| applicationGenerating\}\}"/);
});

test('home and AI secondary copy meets 4.5:1 contrast without changing layout', () => {
  const home = read('pages/index/index.wxss');
  const ai = read('pages/ai-career/ai-career.wxss');
  expectMinTouch(home, '.zy-search');
  expectMinTouch(home, '.zy-signal-link');
  expectMinTouch(home, '.zy-text-action');
  for (const selector of ['.zy-signal-link', '.zy-signal-label', '.zy-text-action', '.zy-job-meta']) {
    assert.ok(contrastAgainstWhite(colorFor(home, selector)) >= 4.5, selector);
  }
  for (const selector of ['.ai-notice', '.composer-context', '.saved-material-meta']) {
    assert.ok(contrastAgainstWhite(colorFor(ai, selector)) >= 4.5, selector);
  }
});

test('Tab labels and search placeholders meet 4.5:1 text contrast on white', () => {
  const cases = [
    ['custom-tab-bar/index.wxss', '.tabbar-text'],
    ['custom-tab-bar/index.wxss', '.tabbar-item.is-active .tabbar-text'],
    ['pages/index/index.wxss', '.zy-search-text'],
    ['pages/jobs/jobs.wxss', '.placeholder'],
    ['pages/resources/resources.wxss', '.placeholder'],
    ['pages/ai-career/ai-career.wxss', '.input-ph']
  ];
  for (const [file, selector] of cases) {
    assert.ok(contrastAgainstWhite(colorFor(read(file), selector)) >= 4.5, `${file} ${selector} text contrast`);
  }
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
  assert.doesNotMatch(css, /background(?:-color)?:[^;]*(?:#111827|#141b29|#172033|#25324d)/i);
  const tabCss = read('custom-tab-bar/index.wxss');
  assert.doesNotMatch(tabCss, /animation:[^;]*infinite/);
  assert.match(tabCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(tabCss, /\.ai-float-core[\s\S]*transition:\s*none/);
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
  assert.match(read('pages/resources/resources.wxml'), /class="unavailable-card"[^>]*aria-disabled="true"/);
  assert.match(read('pages/applications/applications.wxml'), /aria-label="公司名称，必填"/);
});

test('premium tab information architecture stays task-first and contextual', () => {
  const home = read('pages/index/index.wxml');
  assert.ok(home.indexOf('zy-search') < home.indexOf('zy-main-action'));
  assert.ok(home.indexOf('zy-main-action') < home.indexOf('zy-signal-panel'));
  assert.ok(home.indexOf('zy-main-action') < home.indexOf('今天还要做'));

  const jobs = read('pages/jobs/jobs.wxml');
  assert.ok(jobs.indexOf('search-card') < jobs.indexOf('campus-entry'));
  assert.ok(jobs.indexOf('campus-entry') < jobs.indexOf('control-row'));

  const applications = read('pages/applications/applications.wxml');
  assert.ok(applications.indexOf('建议下一步') < applications.indexOf('summary-card'));
  assert.ok(applications.indexOf('summary-card') < applications.indexOf('全部申请'));

  const resources = read('pages/resources/resources.wxml');
  const resourceHero = resources.indexOf('resource-hero');
  const resourceFeatured = resources.indexOf('精选资源');
  const resourceMore = resources.indexOf('content-section');
  assert.ok(resourceHero >= 0 && resourceFeatured >= 0 && resourceMore >= 0);
  assert.ok(resourceHero < resourceFeatured);
  assert.ok(resourceFeatured < resourceMore);
  assert.doesNotMatch(resources, /category-scroll|type-scroll/);

  const profile = read('pages/profile/profile.wxml');
  assert.ok(profile.indexOf('profile-identity') < profile.indexOf('我的记录'));
  assert.ok(profile.indexOf('我的记录') < profile.indexOf('service-card'));
  assert.match(profile, /vip-banner/);
  assert.doesNotMatch(profile, /我的已购|record-meta/);
  assert.match(profile, /账号与设置/);
  assert.equal(profile.split('bindtap="goToSettings"').length - 1, 1);

  const assistant = read('package-ai/pages/ai-assistant/ai-assistant.wxml');
  assert.ok(assistant.indexOf('context-bar') < assistant.indexOf('msg-scroll'));
  assert.match(assistant, /当前上下文：\{\{contextLabel\}\}/);
  assert.doesNotMatch(assistant, /thinking-steps|drawer-search/);
  assert.match(assistant, />复制</);
  assert.match(assistant, />保存</);
  assert.match(assistant, />继续追问</);

  const tabBar = read('custom-tab-bar/index.wxml');
  assert.match(tabBar, /ai-float-text">AI</);
  assert.match(tabBar, /打开当前页面的上下文 AI/);

  assert.doesNotMatch([home, applications, resources, profile].join('\n'), /TODAY|PIPELINE|LIBRARY|NEXT ACTION|ASSETS|ACCOUNT/);
});
