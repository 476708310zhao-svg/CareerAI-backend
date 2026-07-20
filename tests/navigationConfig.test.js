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
const EXPECTED_TAB_LABELS = ['首页', '资源', '进度', 'AI Career', '我的'];

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

test('V4 TabBar uses Home, Resources, Progress, AI Career and Profile main-package pages', () => {
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
  const customSource = read('custom-tab-bar/index.js');
  const customPaths = Array.from(customSource.matchAll(/pagePath:\s*['"]([^'"]+)['"]/g)).map(match => match[1]);
  assert.deepEqual(customPaths, EXPECTED_TABS);
  const customLabels = Array.from(customSource.matchAll(/\btext:\s*['"]([^'"]+)['"]/g)).map(match => match[1]);
  assert.deepEqual(customLabels, EXPECTED_TAB_LABELS);
  const navigationSource = read('utils/navigation.js');
  EXPECTED_TABS.forEach(pagePath => {
    assert.ok(navigationSource.includes("'/" + pagePath + "'"), pagePath + ' missing from navigation helper');
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

test('resource hub exposes campus and preparation tools while home uses campus waterfall', () => {
  const resourceWxml = read('pages/resources/resources.wxml');
  const resourceJs = read('pages/resources/resources.js');
  const homeWxml = read('pages/index/index.wxml');
  const homeJs = read('pages/index/index.js');
  const campusWxml = read('components/home-campus-updates/home-campus-updates.wxml');

  assert.match(resourceWxml, /求职资源库/);
  assert.match(resourceJs, /\/pages\/campus\/campus/);
  assert.match(resourceJs, /\/pages\/experiences\/experiences/);
  assert.match(resourceJs, /\/package-career\/pages\/oa-bank\/oa-bank/);
  assert.doesNotMatch(homeWxml, /home-career-insights/);
  assert.doesNotMatch(homeJs, /buildNewsFeed|getNews|HOME_NEWS_CACHE_KEY/);
  assert.match(homeWxml, /items="\{\{campusWaterfall\}\}"/);
  assert.match(campusWxml, /class="waterfall"/);
});
