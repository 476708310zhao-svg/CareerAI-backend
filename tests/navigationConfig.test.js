const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'miniprogram');
const EXPECTED_TABS = [
  'pages/index/index',
  'pages/resources/resources',
  'pages/applications/applications',
  'pages/ai-career/ai-career',
  'pages/profile/profile'
];
const EXPECTED_TAB_LABELS = ['首页', '资源', '进度', 'AI专家', '我的'];

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

test('V4 TabBar uses Home, Resources, Progress, AI Expert and Profile main-package pages', () => {
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

test('global AI floating entry and home membership banner remain available', () => {
  const customWxml = read('custom-tab-bar/index.wxml');
  const customJs = read('custom-tab-bar/index.js');
  const homeWxml = read('pages/index/index.wxml');
  const homeJs = read('pages/index/index.js');

  assert.match(customWxml, /class="ai-float"/);
  assert.match(customWxml, /catchtap="goAiAssistant"/);
  assert.match(customJs, /goAiAssistant\(\)/);
  assert.match(customJs, /package-ai\/pages\/ai-assistant\/ai-assistant/);
  assert.match(homeWxml, /class="membership-benefit-banner/);
  assert.match(homeWxml, /真实微信支付暂未开放/);
  assert.match(homeJs, /openMembershipBenefits\(\)/);
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

test('home workbench always uses the Today tasks headline across local login states', () => {
  const homeJs = read('pages/index/index.js');

  assert.match(homeJs, /const title = `今天有 \$\{pendingTaskCount\} 项求职任务`/);
  assert.match(homeJs, /primaryText = stats\.todayInterviews \? '准备今日面试' : '查看今日任务'/);
  assert.match(homeJs, /package-ai\/pages\/daily-brief\/daily-brief/);
  assert.doesNotMatch(homeJs, /let title = '完成你的求职档案'/);
  assert.doesNotMatch(homeJs, /title = '先完善简历，再开始精准匹配'/);
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

test('resume page hides scroll indicators and keeps profile details in one card', () => {
  const resumeWxml = read('package-career/pages/resume/resume.wxml');
  const resumeWxss = read('package-career/pages/resume/resume.wxss');

  assert.match(
    resumeWxml,
    /class="section-card profile-summary-card"[\s\S]*基本信息[\s\S]*profile-card-divider[\s\S]*个人优势/
  );
  assert.doesNotMatch(
    resumeWxml,
    /<scroll-view(?=[^>]*scroll-y)(?![^>]*show-scrollbar="\{\{false\}\}")/
  );
  assert.match(resumeWxss, /page::-webkit-scrollbar/);
  assert.match(resumeWxss, /\.profile-card-divider/);
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

test('resource hub groups tools by task while home uses a latest campus list', () => {
  const resourceWxml = read('pages/resources/resources.wxml');
  const resourceJs = read('pages/resources/resources.js');
  const resourceJson = JSON.parse(read('pages/resources/resources.json'));
  const homeWxml = read('pages/index/index.wxml');
  const homeJs = read('pages/index/index.js');
  const campusWxml = read('components/home-campus-updates/home-campus-updates.wxml');

  assert.match(resourceWxml, /资源中心/);
  assert.match(resourceJs, /面试与笔试/);
  assert.match(resourceJs, /职业决策/);
  assert.match(resourceWxml, /内容与服务/);
  assert.equal(resourceJson.navigationStyle, 'custom');
  assert.match(resourceWxml, /class="calendar-art"/);
  assert.match(resourceWxml, /class="tool-copy"/);
  assert.doesNotMatch(resourceWxml, /intro-mark/);
  assert.match(resourceJs, /\/pages\/campus\/campus/);
  assert.match(resourceJs, /\/pages\/experiences\/experiences/);
  assert.match(resourceJs, /\/package-career\/pages\/oa-bank\/oa-bank/);
  assert.doesNotMatch(homeWxml, /home-career-insights/);
  assert.doesNotMatch(homeJs, /buildNewsFeed|getNews|HOME_NEWS_CACHE_KEY/);
  assert.match(homeWxml, /items="\{\{campusLatestUpdates\}\}"/);
  assert.match(homeJs, /latestDay:\s*'1'/);
  assert.match(homeJs, /b\.updateTimestamp\s*-\s*a\.updateTimestamp/);
  assert.match(campusWxml, /class="campus-list"/);
  assert.match(campusWxml, /每日最新校招/);
  assert.doesNotMatch(campusWxml, /waterfall-column/);
});
