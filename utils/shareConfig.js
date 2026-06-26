const db = require('../db/database');

const DEFAULT_ROUTE = '__default__';
const DEFAULT_TITLE = '职引 | 留学生求职与AI面试助手';
const DEFAULT_IMAGE = '/images/banner1.jpg';

const SHARE_PAGES = [
  { route: DEFAULT_ROUTE, page_name: '全局默认', title: DEFAULT_TITLE, image_url: DEFAULT_IMAGE, sort_order: 0 },
  { route: 'pages/index/index', page_name: '首页', title: DEFAULT_TITLE, image_url: DEFAULT_IMAGE, sort_order: 10 },
  { route: 'pages/jobs/jobs', page_name: '职位列表', title: '高薪岗位与校招机会 | 职引', image_url: DEFAULT_IMAGE, sort_order: 20 },
  { route: 'pages/experiences/experiences', page_name: '面试题库', title: '面试题库与真实面经 | 职引', image_url: DEFAULT_IMAGE, sort_order: 30 },
  { route: 'pages/campus/campus', page_name: '校招日历', title: '校招日历 | 职引', image_url: DEFAULT_IMAGE, sort_order: 40 },
  { route: 'pages/agencies/agencies', page_name: '求职机构', title: '求职机构测评 | 职引', image_url: DEFAULT_IMAGE, sort_order: 50 },
  { route: 'pages/profile/profile', page_name: '个人中心', title: DEFAULT_TITLE, image_url: DEFAULT_IMAGE, sort_order: 60 },
  { route: 'pages/privacy/privacy', page_name: '隐私政策', title: '隐私政策 | 职引', image_url: DEFAULT_IMAGE, sort_order: 70 },
  { route: 'package-ai/pages/ai-assistant/ai-assistant', page_name: 'AI求职助手', title: 'AI求职助手 | 职引', image_url: DEFAULT_IMAGE, sort_order: 100 },
  { route: 'package-ai/pages/ai-history/ai-history', page_name: 'AI历史记录', title: 'AI求职记录 | 职引', image_url: DEFAULT_IMAGE, sort_order: 110 },
  { route: 'package-ai/pages/ai-report/ai-report', page_name: 'AI面试报告', title: 'AI模拟面试报告 | 职引', image_url: DEFAULT_IMAGE, sort_order: 120 },
  { route: 'package-ai/pages/interview-setup/interview-setup', page_name: '模拟面试设置', title: 'AI模拟面试 | 职引', image_url: DEFAULT_IMAGE, sort_order: 130 },
  { route: 'package-ai/pages/interview-dialog/interview-dialog', page_name: '模拟面试对话', title: 'AI模拟面试 | 职引', image_url: DEFAULT_IMAGE, sort_order: 140 },
  { route: 'package-ai/pages/audio-review/audio-review', page_name: '语音复盘', title: '语音面试复盘 | 职引', image_url: DEFAULT_IMAGE, sort_order: 150 },
  { route: 'package-ai/pages/project-review/project-review', page_name: '项目复盘', title: '项目经历复盘 | 职引', image_url: DEFAULT_IMAGE, sort_order: 160 },
  { route: 'package-ai/pages/daily-brief/daily-brief', page_name: '每日简报', title: '求职每日简报 | 职引', image_url: DEFAULT_IMAGE, sort_order: 170 },
  { route: 'package-career/pages/resume/resume', page_name: '简历优化', title: '简历优化助手 | 职引', image_url: DEFAULT_IMAGE, sort_order: 200 },
  { route: 'package-career/pages/career-planner/career-planner', page_name: '求职规划', title: '求职规划 | 职引', image_url: DEFAULT_IMAGE, sort_order: 210 },
  { route: 'package-career/pages/project-builder/project-builder', page_name: '项目生成器', title: '项目经历生成器 | 职引', image_url: DEFAULT_IMAGE, sort_order: 220 },
  { route: 'package-career/pages/offer-compare/offer-compare', page_name: 'Offer对比', title: 'Offer对比工具 | 职引', image_url: DEFAULT_IMAGE, sort_order: 230 },
  { route: 'package-career/pages/salary/salary', page_name: '查薪资', title: '查薪资 | 职引', image_url: DEFAULT_IMAGE, sort_order: 240 },
  { route: 'package-career/pages/skill-pathways/skill-pathways', page_name: '技能路径', title: '技能成长路径 | 职引', image_url: DEFAULT_IMAGE, sort_order: 250 },
  { route: 'package-career/pages/job-insights/job-insights', page_name: '趋势洞察', title: '求职趋势洞察 | 职引', image_url: DEFAULT_IMAGE, sort_order: 260 },
  { route: 'package-career/pages/ats-optimize/ats-optimize', page_name: 'ATS优化', title: 'ATS简历优化 | 职引', image_url: DEFAULT_IMAGE, sort_order: 270 },
  { route: 'package-career/pages/networking/networking', page_name: 'Networking助手', title: 'Networking助手 | 职引', image_url: DEFAULT_IMAGE, sort_order: 280 },
  { route: 'package-career/pages/oa-bank/oa-bank', page_name: 'OA题库', title: 'OA题库 | 职引', image_url: DEFAULT_IMAGE, sort_order: 290 },
  { route: 'package-content/pages/experience-detail/experience-detail', page_name: '面经详情', title: '面经详情 | 职引', image_url: DEFAULT_IMAGE, sort_order: 300 },
  { route: 'package-content/pages/question-detail/question-detail', page_name: '题目详情', title: '面试题目详解 | 职引', image_url: DEFAULT_IMAGE, sort_order: 310 },
  { route: 'package-content/pages/star-library/star-library', page_name: 'STAR模板库', title: 'STAR面试答题模板 | 职引', image_url: DEFAULT_IMAGE, sort_order: 320 },
  { route: 'package-content/pages/news/news', page_name: '求职快讯', title: '求职快讯 | 职引', image_url: DEFAULT_IMAGE, sort_order: 330 },
  { route: 'package-content/pages/news-detail/news-detail', page_name: '快讯详情', title: '求职快讯 | 职引', image_url: DEFAULT_IMAGE, sort_order: 340 },
  { route: 'package-content/pages/campus-detail/campus-detail', page_name: '校招详情', title: '校招机会详情 | 职引', image_url: DEFAULT_IMAGE, sort_order: 350 },
  { route: 'package-content/pages/bigtech-jobs/bigtech-jobs', page_name: '大厂直招', title: '大厂直招入口 | 职引', image_url: DEFAULT_IMAGE, sort_order: 360 },
  { route: 'package-content/pages/webview/webview', page_name: '网页容器', title: DEFAULT_TITLE, image_url: DEFAULT_IMAGE, sort_order: 370 },
  { route: 'package-agency/pages/agency-detail/agency-detail', page_name: '机构详情', title: '求职机构详情 | 职引', image_url: DEFAULT_IMAGE, sort_order: 400 },
  { route: 'package-agency/pages/agency-compare/agency-compare', page_name: '机构对比', title: '求职机构对比 | 职引', image_url: DEFAULT_IMAGE, sort_order: 410 },
  { route: 'package-user/pages/applications/applications', page_name: '投递管理', title: '投递进度管理 | 职引', image_url: DEFAULT_IMAGE, sort_order: 500 },
  { route: 'package-user/pages/apply-form/apply-form', page_name: '申请表单', title: '职位申请 | 职引', image_url: DEFAULT_IMAGE, sort_order: 510 },
  { route: 'package-user/pages/profile-edit/profile-edit', page_name: '编辑资料', title: DEFAULT_TITLE, image_url: DEFAULT_IMAGE, sort_order: 520 },
  { route: 'package-user/pages/favorites/favorites', page_name: '收藏夹', title: '我的收藏 | 职引', image_url: DEFAULT_IMAGE, sort_order: 530 },
  { route: 'package-user/pages/messages/messages', page_name: '消息中心', title: '消息中心 | 职引', image_url: DEFAULT_IMAGE, sort_order: 540 },
  { route: 'package-user/pages/my-experiences/my-experiences', page_name: '我的面经', title: '我的面经 | 职引', image_url: DEFAULT_IMAGE, sort_order: 550 },
  { route: 'package-user/pages/settings/settings', page_name: '设置', title: DEFAULT_TITLE, image_url: DEFAULT_IMAGE, sort_order: 560 },
  { route: 'package-user/pages/feedback/feedback', page_name: '反馈', title: DEFAULT_TITLE, image_url: DEFAULT_IMAGE, sort_order: 570 },
  { route: 'package-user/pages/about/about', page_name: '关于我们', title: '关于职引', image_url: DEFAULT_IMAGE, sort_order: 580 },
  { route: 'package-user/pages/vip/vip', page_name: '会员中心', title: '职引会员 | AI求职加速', image_url: DEFAULT_IMAGE, sort_order: 590 },
  { route: 'package-user/pages/companies/companies', page_name: '企业库', title: '热门企业库 | 职引', image_url: DEFAULT_IMAGE, sort_order: 600 },
  { route: 'package-user/pages/company-detail/company-detail', page_name: '企业详情', title: '公司详情 | 职引', image_url: DEFAULT_IMAGE, sort_order: 610 },
  { route: 'package-user/pages/search/search', page_name: '全站搜索', title: '全站搜索 | 职引', image_url: DEFAULT_IMAGE, sort_order: 620 },
  { route: 'package-user/pages/job-detail/job-detail', page_name: '职位详情', title: '职位详情 | 职引', image_url: DEFAULT_IMAGE, sort_order: 630 }
];

function normalizeRoute(route) {
  const text = String(route || '').trim().replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
  return text === DEFAULT_ROUTE ? DEFAULT_ROUTE : text;
}

function cleanText(value, max = 120) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanImageUrl(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^https?:\/\//i.test(text)) return text.slice(0, 500);
  return ('/' + text.replace(/^\/+/, '')).slice(0, 500);
}

function rowToConfig(row) {
  return {
    id: row.id,
    route: row.route,
    pageName: row.page_name || '',
    title: row.title || '',
    imageUrl: row.image_url || '',
    isActive: !!row.is_active,
    sortOrder: row.sort_order || 0,
    updatedAt: row.updated_at || ''
  };
}

function seedShareConfigs() {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO share_configs (route, page_name, title, image_url, is_active, sort_order)
    VALUES (@route, @page_name, @title, @image_url, 1, @sort_order)
  `);
  const tx = db.transaction(() => {
    SHARE_PAGES.forEach(page => {
      const seed = page.route === DEFAULT_ROUTE ? page : { ...page, title: '', image_url: '' };
      stmt.run(seed);
    });
  });
  tx();
}

function listShareConfigs() {
  seedShareConfigs();
  return db.prepare('SELECT * FROM share_configs ORDER BY sort_order ASC, id ASC').all().map(rowToConfig);
}

function getPublicShareConfig() {
  seedShareConfigs();
  const rows = db.prepare(`
    SELECT * FROM share_configs
    WHERE is_active = 1
    ORDER BY sort_order ASC, id ASC
  `).all();
  const defaultRow = rows.find(row => row.route === DEFAULT_ROUTE);
  const defaultConfig = {
    title: (defaultRow && defaultRow.title) || DEFAULT_TITLE,
    imageUrl: (defaultRow && defaultRow.image_url) || DEFAULT_IMAGE
  };
  const routes = {};
  let updatedAt = defaultRow && defaultRow.updated_at || '';
  rows.forEach(row => {
    if (row.updated_at && row.updated_at > updatedAt) updatedAt = row.updated_at;
    if (row.route === DEFAULT_ROUTE) return;
    if (!row.title && !row.image_url) return;
    routes[row.route] = {
      title: row.title || '',
      imageUrl: row.image_url || '',
      pageName: row.page_name || ''
    };
  });
  return { default: defaultConfig, routes, updatedAt };
}

function createShareConfig(data) {
  seedShareConfigs();
  const route = normalizeRoute(data && data.route);
  if (!route || route === DEFAULT_ROUTE) throw new Error('页面路径不能为空');
  const pageName = cleanText(data.pageName || data.page_name || route, 60);
  const title = cleanText(data.title, 120);
  const imageUrl = cleanImageUrl(data.imageUrl || data.image_url);
  const sortOrder = parseInt(data.sortOrder ?? data.sort_order ?? 999, 10) || 999;
  const isActive = data.isActive === false || data.is_active === 0 ? 0 : 1;
  const result = db.prepare(`
    INSERT INTO share_configs (route, page_name, title, image_url, is_active, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(route, pageName, title, imageUrl, isActive, sortOrder);
  return rowToConfig(db.prepare('SELECT * FROM share_configs WHERE id=?').get(result.lastInsertRowid));
}

function updateShareConfig(id, data) {
  seedShareConfigs();
  const existing = db.prepare('SELECT * FROM share_configs WHERE id=?').get(id);
  if (!existing) return null;
  const pageName = cleanText(data.pageName || data.page_name || existing.page_name, 60);
  const title = cleanText(data.title, 120);
  const imageUrl = cleanImageUrl(data.imageUrl || data.image_url);
  const sortOrder = parseInt(data.sortOrder ?? data.sort_order ?? existing.sort_order, 10) || 0;
  const isActive = data.isActive === false || data.is_active === 0 ? 0 : 1;
  db.prepare(`
    UPDATE share_configs
    SET page_name=?, title=?, image_url=?, is_active=?, sort_order=?, updated_at=datetime('now')
    WHERE id=?
  `).run(pageName, title, imageUrl, isActive, sortOrder, id);
  return rowToConfig(db.prepare('SELECT * FROM share_configs WHERE id=?').get(id));
}

function deleteShareConfig(id) {
  seedShareConfigs();
  const existing = db.prepare('SELECT route FROM share_configs WHERE id=?').get(id);
  if (!existing) return false;
  if (SHARE_PAGES.some(page => page.route === existing.route)) {
    throw new Error('预置页面不能删除，可改为禁用');
  }
  return db.prepare('DELETE FROM share_configs WHERE id=?').run(id).changes > 0;
}

module.exports = {
  DEFAULT_ROUTE,
  DEFAULT_TITLE,
  DEFAULT_IMAGE,
  SHARE_PAGES,
  seedShareConfigs,
  listShareConfigs,
  getPublicShareConfig,
  createShareConfig,
  updateShareConfig,
  deleteShareConfig,
  normalizeRoute
};
