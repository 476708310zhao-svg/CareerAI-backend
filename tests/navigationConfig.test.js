const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'miniprogram');
const EXPECTED_TABS = [
  'pages/index/index',
  'pages/jobs/jobs',
  'pages/applications/applications',
  'pages/resources/resources',
  'pages/profile/profile'
];
const EXPECTED_TAB_LABELS = ['首页', '找岗位', '进度', '资源中心', '我的'];

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function walkJs(directory, output = []) {
  fs.readdirSync(directory, { withFileTypes: true }).forEach(entry => {
    if (entry.name === 'miniprogram_npm') return;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) walkJs(target, output);
    else if (entry.isFile() && entry.name.endsWith('.js')) output.push(target);
  });
  return output;
}

function literalSwitchTargets(source) {
  const targets = [];
  const patterns = [
    /wx\.switchTab\s*\(\s*\{[\s\S]{0,180}?url\s*:\s*['"]([^'"]+)['"]/g,
    /safeSwitchTab\s*\(\s*['"]([^'"]+)['"]/g
  ];
  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(source))) targets.push(match[1].replace(/^\//, ''));
  });
  return targets;
}

test('V5 TabBar restores Resources fourth between Progress and Profile', () => {
  const app = JSON.parse(read('app.json'));
  const tabPaths = app.tabBar.list.map(item => item.pagePath);
  assert.deepEqual(tabPaths, EXPECTED_TABS);
  assert.deepEqual(app.tabBar.list.map(item => item.text), EXPECTED_TAB_LABELS);
  EXPECTED_TABS.forEach(pagePath => {
    assert.ok(app.pages.includes(pagePath), pagePath + ' must be declared in the main package');
    assert.ok(fs.existsSync(path.join(ROOT, pagePath + '.js')), pagePath + '.js must exist');
    assert.ok(fs.existsSync(path.join(ROOT, pagePath + '.wxml')), pagePath + '.wxml must exist');
  });
});

test('custom TabBar and navigation helper stay aligned with app.json', () => {
  const app = JSON.parse(read('app.json'));
  const customSource = read('custom-tab-bar/index.js');
  const customPaths = Array.from(customSource.matchAll(/pagePath:\s*['"]([^'"]+)['"]/g)).map(match => match[1]);
  assert.deepEqual(customPaths, EXPECTED_TABS);
  const customLabels = Array.from(customSource.matchAll(/\btext:\s*['"]([^'"]+)['"]/g)).map(match => match[1]);
  assert.deepEqual(customLabels, EXPECTED_TAB_LABELS);
  const navigationSource = read('utils/navigation.js');
  EXPECTED_TABS.forEach(pagePath => {
    assert.ok(navigationSource.includes("'/" + pagePath + "'"), pagePath + ' missing from navigation helper');
  });
  app.tabBar.list.forEach(item => {
    assert.notEqual(
      item.iconPath,
      item.selectedIconPath,
      item.pagePath + ' must use different inactive and active icons'
    );
  });
});

test('feature flags never change the five-tab topology', () => {
  const customSource = read('custom-tab-bar/index.js');

  assert.doesNotMatch(customSource, /getVisibleTabList|isRecruitmentEnabled|filter\(item => item\.pagePath/);
  assert.match(customSource, /const list = FULL_TAB_LIST/);
  assert.match(read('app.json'), /"pagePath":\s*"pages\/jobs\/jobs"/);
  assert.match(read('utils/navigation.js'), /'\/pages\/jobs\/jobs'/);
});

test('literal switchTab calls only target configured TabBar pages', () => {
  const allowed = new Set(EXPECTED_TABS);
  const invalid = [];
  walkJs(ROOT).forEach(file => {
    literalSwitchTargets(fs.readFileSync(file, 'utf8')).forEach(target => {
      if (!allowed.has(target)) invalid.push(path.relative(ROOT, file) + ' -> ' + target);
    });
  });
  assert.deepEqual(invalid, []);
});

test('application pipeline entry points use the main progress Tab', () => {
  const entrySources = [
    read('pages/index/index.js'),
    read('utils/daily-tasks.js'),
    read('package-user/pages/usage-guide/usage-guide.js')
  ];
  entrySources.forEach(source => {
    assert.match(source, /\/pages\/applications\/applications/);
    assert.doesNotMatch(source, /package-user\/pages\/job-progress\/job-progress/);
  });
  // The legacy page remains referenced only by the local-record compatibility path and share config.
  assert.match(read('pages/applications/applications.js'), /package-user\/pages\/job-progress\/job-progress/);
  const legacyProgress = read('package-user/pages/job-progress/job-progress.js');
  assert.match(legacyProgress, /options\.legacy !== '1'/);
  assert.match(legacyProgress, /safeSwitchTab\('\/pages\/applications\/applications'\)/);
});




test('home keeps one highest-priority action and the floating AI inherits page context', () => {
  const customWxml = read('custom-tab-bar/index.wxml');
  const customJs = read('custom-tab-bar/index.js');
  const customWxss = read('custom-tab-bar/index.wxss');
  const homeWxml = read('pages/index/index.wxml');
  const homeJs = read('pages/index/index.js');

  assert.match(customWxml, /class="ai-float"/);
  assert.match(customWxml, /catchtap="goAiAssistant"/);
  assert.match(customJs, /goAiAssistant\(\)/);
  assert.match(customJs, /applicationId/);
  assert.match(customJs, /package-ai\/pages\/ai-assistant\/ai-assistant/);
  assert.match(customWxss, /\.ai-float/);
  assert.match(customWxss, /\.tabbar-panel[\s\S]*border-radius:\s*34rpx/);
  assert.equal((homeWxml.match(/class="zy-main-action"/g) || []).length, 1);
  assert.ok(homeWxml.indexOf('class="zy-main-action"') < homeWxml.indexOf('今天还要做'));
  assert.doesNotMatch(homeWxml, /\sautoplay(?:\s|>)/);
  assert.doesNotMatch(homeWxml, /today-task-card|todayTaskPreview|banner-wrap|membership-benefit-banner/);
  assert.doesNotMatch(homeWxml, /zy-progress-card|zy-progress-item|求职进展/);
  assert.match(homeWxml, /todaySecondaryTasks/);
  assert.match(homeJs, /title = nextTask\.title/);
  assert.match(homeJs, /buildPrimaryTaskMeta\(nextTask, applications\)/);
  assert.match(homeJs, /String\(item\.id \|\| ''\) !== primaryTaskId/);
  assert.match(homeJs, /\.slice\(0, 2\)/);
});

test('contextual AI shows inherited application context and remains directly reachable from application detail', () => {
  const assistantJs = read('package-ai/pages/ai-assistant/ai-assistant.js');
  const assistantWxml = read('package-ai/pages/ai-assistant/ai-assistant.wxml');
  const detailJs = read('package-user/pages/application-detail/application-detail.js');
  const detailWxml = read('package-user/pages/application-detail/application-detail.wxml');

  assert.match(assistantJs, /_applyRouteContext\(options\)/);
  assert.match(assistantJs, /contextApplicationId/);
  assert.match(assistantJs, /currentPage/);
  assert.match(assistantWxml, /AI 帮我推进/);
  assert.match(assistantWxml, /当前上下文：\{\{contextLabel\}\}/);
  assert.match(assistantWxml, /placeholder="\{\{composerPlaceholder\}\}"/);
  assert.match(detailWxml, /bindtap="openContextAi"/);
  assert.match(detailWxml, /让 AI 帮我推进这条申请/);
  assert.match(detailJs, /applicationId:\s*this\.data\.id/);
  assert.match(detailJs, /ai-assistant\/ai-assistant/);
});

test('home recommendations are controlled by an independent public feature flag', () => {
  const homeWxml = read('pages/index/index.wxml');
  const homeJs = read('pages/index/index.js');
  const featureClient = read('utils/feature-flags.js');

  assert.match(homeWxml, /recruitmentEnabled && homeRecommendationsEnabled/);
  assert.match(homeJs, /home_recommendations/);
  assert.match(homeJs, /homeRecommendationsEnabled/);
  assert.match(featureClient, /home_recommendations/);
});

test('home workbench distinguishes no application, next task and honest empty states', () => {
  const homeJs = read('pages/index/index.js');

  assert.match(homeJs, /const nextTask = \(this\.data\.todayTasks \|\| \[\]\)\.find/);
  assert.match(homeJs, /title = nextTask\.title/);
  assert.match(homeJs, /if \(!hasApplications\)/);
  assert.match(homeJs, /'找到第一个目标岗位'/);
  assert.match(homeJs, /'暂时没有待处理事项'/);
  assert.match(homeJs, /primaryUrl = '\/pages\/jobs\/jobs'/);
  assert.doesNotMatch(homeJs, /'今日任务已完成'/);
  assert.doesNotMatch(homeJs, /Math\.max\(1, Number\(taskStats\.pending/);
  assert.doesNotMatch(homeJs, /let title = '完成你的求职档案'/);
  assert.doesNotMatch(homeJs, /title = '先完善简历，再开始精准匹配'/);
});

test('global design tokens cover the shared component aliases', () => {
  const appStyles = read('app.wxss');
  [
    '--brand', '--brand-dark', '--brand-shadow', '--bg-panel', '--bg-raised',
    '--border', '--text-primary', '--text-secondary', '--text-muted', '--btn-height',
    '--btn-height-sm', '--r-pill', '--color-brand', '--color-ink', '--color-ink-2',
    '--color-ink-3', '--color-ink-4', '--color-line-soft', '--color-surface-muted',
    '--color-success-tint', '--color-warning-soft', '--color-danger-soft', '--shadow-action'
  ].forEach(token => assert.match(appStyles, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:')));
});


test('resume version helper stays inside the AI subpackage instead of bloating the main package', () => {
  const mainHelper = path.join(ROOT, 'utils', 'resume-versions.js');
  const packageHelper = path.join(ROOT, 'package-ai', 'utils', 'resume-versions.js');
  const assistantJs = read('package-ai/pages/ai-assistant/ai-assistant.js');
  const jdMatchJs = read('package-ai/pages/jd-match/jd-match.js');

  assert.equal(fs.existsSync(mainHelper), false);
  assert.equal(fs.existsSync(packageHelper), true);
  assert.match(assistantJs, /require\('\.\.\/\.\.\/utils\/resume-versions\.js'\)/);
  assert.match(jdMatchJs, /require\('\.\.\/\.\.\/utils\/resume-versions\.js'\)/);
});

test('legacy resume route is a lightweight compatibility redirect to resume center', () => {
  const resumeWxml = read('package-career/pages/resume/resume.wxml');
  const resumeJs = read('package-career/pages/resume/resume.js');
  assert.match(resumeJs, /ALLOWED_QUERY_KEYS/);
  assert.match(resumeJs, /resume-center\/resume-center/);
  assert.match(resumeJs, /redirectTo/);
  assert.match(resumeJs, /fail:[\s\S]*showToast/);
  assert.doesNotMatch(resumeJs, /_saveResume|saveWorkExp|dailyBriefCache/);
  assert.match(resumeWxml, /正在打开简历中心/);
});

test('search keeps live matching but records history only after an explicit submit', () => {
  const searchJs = read('package-user/pages/search/search.js');
  const searchWxml = read('package-user/pages/search/search.wxml');

  assert.match(searchWxml, /bindinput="onInput"[^>]*bindconfirm="doSearch"/);
  assert.match(searchWxml, /class="search-btn" bindtap="doSearch"/);
  assert.match(searchJs, /setTimeout\(\(\) => \{[\s\S]*?executeSearch\(false\)/);
  assert.match(searchJs, /doSearch\(\) \{[\s\S]*?executeSearch\(true\)/);
  assert.match(searchJs, /executeSearch\(recordHistory\)[\s\S]*?if \(recordHistory\) this\.saveSearchHistory\(kw\)/);
  assert.match(searchJs, /function normalizeSearchHistory\(list\)/);
  assert.doesNotMatch(searchJs, /this\._searchTimer = setTimeout\(\(\) => \{\s*if \([^}]+this\.doSearch\(\)/);
});

test('profile editor keeps multi-select search compact and allows any graduation year in range', () => {
  const profileWxml = read('package-user/pages/profile-edit/profile-edit.wxml');
  const profileJs = read('package-user/pages/profile-edit/profile-edit.js');
  const profileWxss = read('package-user/pages/profile-edit/profile-edit.wxss');

  assert.match(profileWxml, /class="compact-select-trigger"/);
  assert.match(profileWxml, /继续添加/);
  assert.doesNotMatch(profileWxml, /继续搜索添加地区|继续搜索添加行业/);
  assert.match(profileWxml, /mode="date"[\s\S]*fields="year"[\s\S]*bindchange="onGradYearChange"/);
  assert.doesNotMatch(profileWxml, /wx:for="\{\{gradYearOptions\}\}"/);
  assert.match(profileJs, /gradYearStart: '1970-01-01'/);
  assert.match(profileJs, /gradYearEnd: `\$\{CURRENT_YEAR \+ 20\}-12-31`/);
  assert.match(profileJs, /onGradYearChange\(e\)/);
  assert.match(profileWxss, /\.selection-summary/);
  assert.match(profileWxss, /\.year-picker/);
});

test('career planner renders evidence, outcomes, weekly rhythm and risk controls', () => {
  const plannerWxml = read('package-career/pages/career-planner/career-planner.wxml');
  const plannerJs = read('package-career/pages/career-planner/career-planner.js');
  const plannerWxss = read('package-career/pages/career-planner/career-planner.wxss');

  assert.match(plannerWxml, /规划结论/);
  assert.match(plannerWxml, /掌握标准/);
  assert.match(plannerWxml, /本阶段产出与验收/);
  assert.match(plannerWxml, /每周执行节奏/);
  assert.match(plannerWxml, /风险预警与应对/);
  assert.match(plannerJs, /skill_actions/);
  assert.match(plannerJs, /project_blueprints/);
  assert.match(plannerJs, /success_metrics/);
  assert.match(plannerWxss, /\.skill-action-card/);
  assert.match(plannerWxss, /\.routine-card/);
  assert.match(plannerWxss, /\.risk-card/);
});

test('daily brief follows the home workbench visual language without the legacy green header', () => {
  const dailyWxml = read('package-ai/pages/daily-brief/daily-brief.wxml');
  const dailyWxss = read('package-ai/pages/daily-brief/daily-brief.wxss');

  assert.match(dailyWxml, /class="brief-hero"/);
  assert.match(dailyWxml, /今日求职计划/);
  assert.match(dailyWxml, /class="hero-metrics"/);
  assert.doesNotMatch(dailyWxml, /class="hl-icon"|\{\{item\.icon\}\}/);
  assert.doesNotMatch(dailyWxml, /class="date-header"/);
  assert.doesNotMatch(dailyWxml, /class="stats-summary"/);
  assert.match(dailyWxss, /linear-gradient\(145deg, #ffffff 0%, #f5f9ff 100%\)/);
  assert.doesNotMatch(dailyWxss, /#064E3B|#065F46/);
});

test('resource hub presents content assets and gated purchased state instead of a tool hall', () => {
  const resourceWxml = read('pages/resources/resources.wxml');
  const resourceJs = read('pages/resources/resources.js');
  const resourceWxss = read('pages/resources/resources.wxss');
  const resourceJson = JSON.parse(read('pages/resources/resources.json'));

  assert.match(resourceWxml, /求职准备资源/);
  assert.match(resourceJs, /测评资料/);
  assert.match(resourceJs, /笔试题库/);
  assert.match(resourceJs, /面试经验/);
  assert.match(resourceJs, /公司 \/ 行业/);
  assert.match(resourceJs, /我的收藏/);
  assert.match(resourceJs, /我的已购/);
  assert.match(resourceWxml, /资料购买与交付能力尚未接入/);
  assert.equal(resourceJson.navigationStyle, undefined);
  assert.match(resourceWxml, /class="category-scroll"/);
  assert.match(resourceWxml, /搜索标题、标签或内容说明/);
  assert.match(resourceWxml, /目标上下文/);
  assert.match(resourceWxml, /不代表搜索筛选结果或已绑定申请/);
  assert.match(resourceWxml, /关于资料权益/);
  assert.match(resourceWxml, /适用阶段/);
  assert.match(resourceWxml, /aria-disabled="true"/);
  assert.doesNotMatch(resourceJs, /AI 求职规划|Offer 对比|Networking Copilot|薪酬查询/);
  assert.doesNotMatch(resourceWxml, /expert-card|AI 求职助手|workflow-nav/);
  assert.match(resourceWxss, /\.asset-list\s*\{/);
  assert.match(resourceJs, /\/pages\/campus\/campus/);
  assert.match(resourceJs, /\/pages\/experiences\/experiences/);
  assert.match(resourceJs, /\/package-career\/pages\/oa-bank\/oa-bank/);
});

test('home avoids hidden campus requests while the campus page keeps the unified API', () => {
  const homeWxml = read('pages/index/index.wxml');
  const homeJs = read('pages/index/index.js');
  const campusJs = read('pages/campus/campus.js');
  const campusDetailJs = read('package-content/pages/campus-detail/campus-detail.js');
  const campusWxml = read('components/home-campus-updates/home-campus-updates.wxml');

  assert.doesNotMatch(homeWxml, /home-career-insights/);
  assert.doesNotMatch(homeJs, /buildNewsFeed|getNews|HOME_NEWS_CACHE_KEY/);
  assert.doesNotMatch(homeWxml, /home-campus-updates|campusLatestUpdates/);
  assert.doesNotMatch(homeJs, /getFeishuCampusList|getCampusList|HOME_CAMPUS_CACHE|fetchCampusUpdates|loadCachedCampusUpdates/);
  assert.doesNotMatch(campusJs, /getFeishuCampusList/);
  assert.match(campusJs, /api\.getCampusList/);
  assert.doesNotMatch(campusDetailJs, /getFeishuCampusDetail/);
  assert.match(campusDetailJs, /api\.getCampusDetail/);
  assert.doesNotMatch(campusDetailJs, /\^rec\[a-z0-9\]\+\$/i);
  assert.match(campusWxml, /class="campus-list"/);
  assert.match(campusWxml, /每日最新校招/);
  assert.match(campusWxml, /持续更新/);
  assert.doesNotMatch(campusWxml, /今日上新/);
  assert.doesNotMatch(campusWxml, /waterfall-column/);
});
