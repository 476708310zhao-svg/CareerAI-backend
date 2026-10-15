const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'miniprogram');
const EXPECTED_TABS = [
  'pages/index/index',
  'pages/jobs/jobs',
  'pages/ai-career/ai-career',
  'pages/resources/resources',
  'pages/profile/profile'
];
const EXPECTED_TAB_LABELS = ['首页', '机会', 'AI求职', '资源', '我的'];

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

test('TabBar places contextual AI between Jobs and Resources', () => {
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

test('secondary tabs lead with task content instead of redundant page headings', () => {
  const jobsWxml = read('pages/jobs/jobs.wxml');
  const applicationsWxml = read('pages/applications/applications.wxml');
  const resourcesWxml = read('pages/resources/resources.wxml');
  const profileWxml = read('pages/profile/profile.wxml');

  assert.doesNotMatch(jobsWxml, /class="jobs-head"|找到值得投入时间的机会/);
  for (const source of [applicationsWxml, resourcesWxml, profileWxml]) {
    assert.doesNotMatch(source, /class="page-head"/);
  }
  assert.doesNotMatch(applicationsWxml, /每次只推进一个明确节点/);
  assert.doesNotMatch(resourcesWxml, /只保留能直接帮你行动的内容/);
  assert.doesNotMatch(profileWxml, /管理个人档案与求职资产/);
  assert.equal(applicationsWxml.split('class="add-button"').length - 1, 1);
});

test('primary tabs remove redundant subtitle layers while preserving decision metadata', () => {
  const home = read('pages/index/index.wxml');
  const homeStyles = read('pages/index/index.wxss');
  const jobs = read('pages/jobs/jobs.wxml');
  const jobsStyles = read('pages/jobs/jobs.wxss');
  const ai = read('pages/ai-career/ai-career.wxml');
  const aiStyles = read('pages/ai-career/ai-career.wxss');
  const resources = read('pages/resources/resources.wxml');
  const resourceStyles = read('pages/resources/resources.wxss');
  const profile = read('pages/profile/profile.wxml');
  const profileStyles = read('pages/profile/profile.wxss');

  assert.doesNotMatch(home, /zy-home-head|zy-page-sub|zy-main-desc|class="zy-row-desc"/);
  assert.match(home, /class="zy-job-meta"/);
  assert.doesNotMatch(jobs, /campus-desc|result-sub/);
  assert.doesNotMatch(ai, /top-sub|drawer-tool-desc|recent-preview/);
  assert.doesNotMatch(resources, /section-sub|feature-desc|asset-desc/);
  assert.doesNotMatch(resources, /class="asset-stage"/);
  assert.doesNotMatch(profile, /identity-desc|identity-hint|section-sub|asset-meta|record-meta|service-desc/);
  assert.match(homeStyles, /\.zy-home-head,[\s\S]*display:\s*none\s*!important/);
  assert.match(jobsStyles, /\.campus-desc,\.result-sub\{display:none!important\}/);
  assert.match(aiStyles, /\.top-sub,\.drawer-tool-desc,\.recent-preview\s*\{\s*display:\s*none\s*!important/);
  assert.match(resourceStyles, /\.truth-card,[\s\S]*display:\s*none\s*!important/);
  assert.doesNotMatch(profileStyles, /\.record-meta/);
});

test('interview question bank reserves the measured fixed header height', () => {
  const wxml = read('pages/experiences/experiences.wxml');
  const js = read('pages/experiences/experiences.js');
  const styles = read('pages/experiences/experiences.wxss');

  assert.match(wxml, /style="\{\{spacerHeight \? 'height:' \+ spacerHeight \+ 'px' : ''\}\}"/);
  assert.match(js, /select\('\.fixed-header'\)[\s\S]*boundingClientRect/);
  assert.match(js, /setData\(\{ spacerHeight: height \}\)/);
  assert.match(styles, /\.header-spacer\.source-local\.with-ai\s*\{[\s\S]*height:\s*352rpx/);
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

test('application pipeline entry points use the main secondary progress page', () => {
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
  assert.match(legacyProgress, /safeNavigateTo\('\/pages\/applications\/applications'\)/);
});

test('home owns the progress entry and AI owns the third Tab', () => {
  const app = JSON.parse(read('app.json'));
  const homeWxml = read('pages/index/index.wxml');
  const progressWxml = read('pages/applications/applications.wxml');
  const progressJs = read('pages/applications/applications.js');
  const aiJs = read('pages/ai-career/ai-career.js');
  const aiWxml = read('pages/ai-career/ai-career.wxml');
  const customWxml = read('custom-tab-bar/index.wxml');
  const navigationJs = read('utils/navigation.js');

  assert.equal(app.tabBar.list[2].pagePath, 'pages/ai-career/ai-career');
  assert.equal(app.tabBar.list[2].text, 'AI求职');
  assert.equal(app.tabBar.list.some(item => item.pagePath === 'pages/applications/applications'), false);
  assert.match(homeWxml, /申请进度[\s\S]*data-url="\/pages\/applications\/applications"/);
  assert.match(progressWxml, /class="secondary-nav"/);
  assert.match(progressWxml, /bindtap="goBack"/);
  assert.match(progressJs, /goBack\(\)[\s\S]*safeNavigateBack/);
  assert.match(navigationJs, /function openAiTab\(context, options\)/);
  assert.match(aiJs, /_consumePendingTabContext/);
  assert.match(aiWxml, /keyboardHeight > 0 \? keyboardHeight : tabBarOffset/);
  assert.match(customWxml, /index === 2 \? 'tabbar-ai-item'/);
  assert.match(customWxml, /打开当前页面的上下文 AI/);
  assert.doesNotMatch(customWxml, /selected !== 2|goAiAssistant/);
});

test('application detail opens a contextual application package', () => {
  const detailJs = read('package-user/pages/application-detail/application-detail.js');
  const detailWxml = read('package-user/pages/application-detail/application-detail.wxml');
  const materialsJs = read('package-ai/pages/application-materials/application-materials.js');
  const materialsWxml = read('package-ai/pages/application-materials/application-materials.wxml');

  assert.match(detailJs, /application-materials\/application-materials\?applicationId=/);
  assert.match(detailJs, /openJdMatch\(\)/);
  assert.match(detailJs, /tempJobDetail/);
  assert.match(detailWxml, /申请包/);
  assert.match(detailWxml, /bindtap="openApplicationMaterials"/);
  assert.match(detailWxml, /bindtap="openJdMatch"/);
  assert.match(materialsJs, /_targetApplicationId/);
  assert.match(materialsJs, /findIndex\(item => String\(item\.id\) === this\._targetApplicationId\)/);
  assert.match(materialsWxml, /当前申请：\{\{targetApplicationLabel\}\}/);
});

test('career planning pages expose one plan with distinct diagnosis and execution views', () => {
  const plannerJs = read('package-career/pages/career-planner/career-planner.js');
  const plannerWxml = read('package-career/pages/career-planner/career-planner.wxml');
  const coachJs = read('package-career/pages/career-coach/career-coach.js');
  const coachWxml = read('package-career/pages/career-coach/career-coach.wxml');

  assert.match(plannerJs, /openCareerCoach\(\)/);
  assert.match(plannerJs, /openDailyBrief\(\)/);
  assert.match(plannerWxml, /把规划变成行动/);
  assert.match(plannerWxml, /进入竞争力陪跑/);
  assert.match(coachJs, /openCareerPlanner\(\)/);
  assert.match(coachJs, /openDailyBrief\(\)/);
  assert.match(coachWxml, /计划视图/);
  assert.match(coachWxml, /读取同一套求职数据/);
});

test('interview training keeps the application context through space, report and notebook practice', () => {
  const detailJs = read('package-user/pages/application-detail/application-detail.js');
  const spaceJs = read('package-ai/pages/interview-space/interview-space.js');
  const spaceWxml = read('package-ai/pages/interview-space/interview-space.wxml');
  const setupJs = read('package-ai/pages/interview-setup/interview-setup.js');
  const dialogJs = read('package-ai/pages/interview-dialog/interview-dialog.js');
  const reportJs = read('package-ai/pages/ai-report/ai-report.js');
  const reportWxml = read('package-ai/pages/ai-report/ai-report.wxml');
  const notebookJs = read('package-ai/pages/interview-notebook/interview-notebook.js');
  const questionDetailJs = read('package-content/pages/question-detail/question-detail.js');
  const starLibraryJs = read('package-content/pages/star-library/star-library.js');
  const experienceJs = read('pages/experiences/experiences.js');

  assert.match(detailJs, /applicationId=.*this\.data\.id/);
  assert.match(spaceJs, /applicationId\s*:\s*options\.applicationId/);
  assert.match(spaceJs, /openApplication\(\)/);
  assert.match(spaceJs, /cacheReport\(\)/);
  assert.match(spaceJs, /openUnifiedReport\(\)/);
  assert.match(spaceJs, /interviewContext/);
  assert.match(spaceWxml, /查看申请详情/);
  assert.match(spaceWxml, /查看完整面试报告/);
  assert.match(spaceWxml, /查看全部面试复盘/);
  assert.match(setupJs, /navigationParams\.applicationId/);
  assert.match(dialogJs, /applicationId: options\.applicationId/);
  assert.match(dialogJs, /ai-report\/ai-report\?id=/);
  assert.match(reportJs, /applicationId: report\.applicationId/);
  assert.match(reportJs, /openApplication\(\)/);
  assert.match(reportWxml, /关联申请/);
  assert.match(notebookJs, /item\.applicationId/);
  assert.doesNotMatch(questionDetailJs, /interviewContext/);
  assert.doesNotMatch(starLibraryJs, /interviewContext/);
  assert.doesNotMatch(experienceJs, /interviewContext/);
  assert.match(questionDetailJs, /autoQuestion=/);
  assert.match(experienceJs, /interview-setup\/interview-setup/);
});

test('home keeps one highest-priority action and the raised center AI inherits page context', () => {
  const customWxml = read('custom-tab-bar/index.wxml');
  const customJs = read('custom-tab-bar/index.js');
  const customWxss = read('custom-tab-bar/index.wxss');
  const homeWxml = read('pages/index/index.wxml');
  const homeJs = read('pages/index/index.js');

  assert.match(customWxml, /class="ai-float"/);
  assert.match(customWxml, /tabbar-ai-item/);
  assert.match(customJs, /applicationId/);
  assert.match(customJs, /openAiTab\(this\.buildAiContext\(\),/);
  assert.match(customWxss, /\.ai-float/);
  assert.match(customWxss, /\.custom-tabbar[\s\S]*right:\s*24rpx[\s\S]*left:\s*24rpx/);
  assert.match(customWxss, /\.tabbar-panel[\s\S]*border-radius:\s*38rpx/);
  assert.match(customWxss, /\.ai-float-core[\s\S]*top:\s*-30rpx[\s\S]*left:\s*50%[\s\S]*transform:\s*translateX\(-50%\)/);
  assert.doesNotMatch(customWxml, /ai-tab-label/);
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

  assert.match(homeWxml, /homeRecommendationsEnabled \? recommendJobs : latestJobs/);
  assert.match(homeWxml, /homeRecommendationsEnabled \? '为你推荐' : '最新机会'/);
  assert.match(homeJs, /home_recommendations/);
  assert.match(homeJs, /homeRecommendationsEnabled/);
  assert.match(homeJs, /fetchLatestJobs/);
  assert.match(homeWxml, /jd-match\/jd-match\?source=home/);
  assert.match(read('package-ai/pages/jd-match/jd-match.js'), /options\.source !== 'home'\) this\.loadJobPreset\(\)/);
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

test('campus cards describe the actual next action', () => {
  const campusWxml = read('pages/campus/campus.wxml');
  assert.match(campusWxml, /复制投递链接/);
  assert.match(campusWxml, /查看公告/);
  assert.match(campusWxml, /wx:if="\{\{item\.applyUrl\}\}"/);
});

test('AI Tab keeps a main-package resume helper while legacy AI remains compatible', () => {
  const mainHelper = path.join(ROOT, 'utils', 'resume-versions.js');
  const mainTabHelper = path.join(ROOT, 'utils', 'ai-resume-versions.js');
  const packageHelper = path.join(ROOT, 'package-ai', 'utils', 'resume-versions.js');
  const tabAssistantJs = read('pages/ai-career/ai-career.js');
  const assistantJs = read('package-ai/pages/ai-assistant/ai-assistant.js');
  const jdMatchJs = read('package-ai/pages/jd-match/jd-match.js');

  assert.equal(fs.existsSync(mainHelper), false);
  assert.equal(fs.existsSync(mainTabHelper), true);
  assert.equal(fs.existsSync(packageHelper), true);
  assert.match(tabAssistantJs, /require\('\.\.\/\.\.\/utils\/ai-resume-versions\.js'\)/);
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
  assert.match(resourceWxml, /精选资源/);
  assert.match(resourceJs, /笔试题库/);
  assert.match(resourceJs, /面试经验/);
  assert.match(resourceJs, /公司资料库/);
  assert.match(resourceJs, /我的收藏/);
  assert.match(resourceWxml, /我的已购/);
  assert.match(resourceWxml, /资料购买与交付能力尚未接入/);
  assert.equal(resourceJson.navigationStyle, 'custom');
  assert.doesNotMatch(resourceWxml, /category-scroll|type-scroll/);
  assert.match(resourceWxml, /搜索题库、面经或公司资料/);
  assert.match(resourceWxml, /目标上下文/);
  assert.match(resourceWxml, /不代表搜索筛选结果或已绑定申请/);
  assert.doesNotMatch(resourceWxml, /真实内容说明|class="truth-card"/);
  assert.doesNotMatch(resourceWxml, /适用阶段/);
  assert.match(resourceWxml, /aria-disabled="true"/);
  assert.doesNotMatch(resourceJs, /AI 求职规划|Offer 对比|Networking Copilot|薪酬查询/);
  assert.doesNotMatch(resourceWxml, /expert-card|AI 求职助手|workflow-nav/);
  assert.match(resourceWxss, /\.asset-list\s*\{/);
  assert.match(resourceJs, /\/pages\/campus\/campus/);
  assert.match(resourceJs, /\/pages\/experiences\/experiences/);
  assert.match(resourceJs, /\/package-career\/pages\/oa-bank\/oa-bank/);
});

test('home only loads visible campus digest through the unified API', () => {
  const homeWxml = read('pages/index/index.wxml');
  const homeJs = read('pages/index/index.js');
  const campusJs = read('pages/campus/campus.js');
  const campusDetailJs = read('package-content/pages/campus-detail/campus-detail.js');
  const campusWxml = read('components/home-campus-updates/home-campus-updates.wxml');

  assert.doesNotMatch(homeWxml, /home-career-insights/);
  assert.doesNotMatch(homeJs, /buildNewsFeed|getNews|HOME_NEWS_CACHE_KEY/);
  assert.doesNotMatch(homeWxml, /home-campus-updates/);
  assert.match(homeWxml, /campusDigest/);
  assert.match(homeJs, /getCampusList\(\{ sort: 'latest', deadlineWindow: 'open'/);
  assert.doesNotMatch(homeJs, /getFeishuCampusList|HOME_CAMPUS_CACHE|fetchCampusUpdates|loadCachedCampusUpdates/);
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

test('profile restores the approved records layout without record subtitles', () => {
  const profileWxml = read('pages/profile/profile.wxml');
  const profileWxss = read('pages/profile/profile.wxss');
  const profileJs = read('pages/profile/profile.js');
  assert.match(profileWxml, /我的记录/);
  assert.match(profileWxml, /我的收藏/);
  assert.doesNotMatch(profileWxml, /我的申请/);
  assert.doesNotMatch(profileWxml, /我的已购|资料权益暂未开放/);
  assert.match(profileWxml, /消息通知/);
  assert.match(profileWxml, /我的面经/);
  assert.match(profileWxml, /意见反馈/);
  assert.match(profileWxml, /membershipEnabled/);
  assert.match(profileWxml, /vip-banner/);
  assert.match(profileWxml, /解锁求职进阶能力/);
  assert.match(profileWxml, /账号与设置/);
  assert.match(profileWxml, /关于我们/);
  assert.doesNotMatch(profileWxml, /编辑与管理|项收藏|查看消息|管理我的发布|record-meta/);
  assert.doesNotMatch(profileWxml, /asset-card|求职工具|使用指南|bindtap="goTo(?:AIInterview|DailyBrief|ApplicationMaterials|InterviewNotebook|JobProgress|Interviews)"/);
  for (const handler of ['goToResumes', 'goToFavorites', 'goToMessages', 'goToMyExperiences', 'goToFeedback', 'goToAbout', 'goToSettings', 'goToVip']) {
    assert.equal(profileWxml.split('bindtap="' + handler + '"').length - 1, 1, handler + ' should appear once');
    assert.ok(profileJs.includes(handler + '('));
  }
  assert.equal(profileWxml.split('bindtap="goToPurchasedMaterials"').length - 1, 0);
  assert.equal(profileWxml.split('bindtap="goToSettings"').length - 1, 1);
  assert.match(profileWxml, /src="\/images\/profile-(?:resume|favorite|experience|message|settings|feedback)\.png"/);
  assert.match(profileJs, /resume-center\/resume-center/);
  assert.match(profileJs, /package-user\/pages\/my-experiences\/my-experiences/);
  assert.doesNotMatch(profileJs, /updateAssetHub|fetchRemoteMaterials|fetchRemoteReports|getResumes|fetchRemoteNotebook/);
  assert.match(profileWxss, /grid-template-columns:\s*repeat\(4,/);
});

test('application detail and AI report keep the next action explicit', () => {
  const detailJs = read('package-user/pages/application-detail/application-detail.js');
  const detailWxml = read('package-user/pages/application-detail/application-detail.wxml');
  const reportJs = read('package-ai/pages/ai-report/ai-report.js');
  const reportWxml = read('package-ai/pages/ai-report/ai-report.wxml');
  assert.match(detailJs, /primaryAction/);
  assert.match(detailJs, /handlePrimaryAction/);
  assert.match(detailWxml, /建议下一步/);
  assert.match(reportJs, /saveToApplication/);
  assert.match(reportJs, /addApplicationTask/);
  assert.match(reportWxml, /加入当前申请/);
  assert.match(reportWxml, /保存图片/);
  assert.doesNotMatch(reportWxml, /保存报告<\/view>/);
});
