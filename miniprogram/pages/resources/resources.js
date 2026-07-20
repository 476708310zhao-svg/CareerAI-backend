const navigation = require('../../utils/navigation.js');

const FEATURED_RESOURCE = {
  id: 'campus',
  eyebrow: 'CAMPUS RECRUITMENT',
  title: '校招日历',
  desc: '每日更新网申岗位、开放时间与截止提醒',
  icon: '校',
  action: '查看最新校招',
  url: '/pages/campus/campus'
};

const RESOURCE_SECTIONS = [
  {
    id: 'interview',
    title: '面试与笔试',
    subtitle: '从真题练习到模拟面试',
    accent: 'blue',
    items: [
      { id: 'question', title: '面试题库', desc: '高频真题与岗位问题', icon: '题', tone: 'blue', url: '/pages/experiences/experiences' },
      { id: 'star', title: 'STAR 案例', desc: '整理行为面试素材', icon: 'S', tone: 'violet', url: '/package-content/pages/star-library/star-library' },
      { id: 'oa', title: 'OA 题库', desc: '笔试专项练习', icon: 'OA', tone: 'cyan', url: '/package-career/pages/oa-bank/oa-bank' },
      { id: 'mock', title: 'AI 模拟面试', desc: '按目标岗位训练', icon: 'AI', tone: 'indigo', url: '/package-ai/pages/interview-setup/interview-setup' }
    ]
  },
  {
    id: 'decision',
    title: '职业决策',
    subtitle: '查公司、看薪资、规划能力',
    accent: 'green',
    items: [
      { id: 'salary', title: '薪酬查询', desc: '了解岗位薪资区间', icon: '薪', tone: 'green', url: '/package-career/pages/salary/salary' },
      { id: 'company', title: '公司情报', desc: '公司与招聘信息', icon: '企', tone: 'amber', url: '/package-user/pages/companies/companies' },
      { id: 'insights', title: '职业洞察', desc: '探索岗位发展方向', icon: '察', tone: 'rose', url: '/package-career/pages/job-insights/job-insights' },
      { id: 'skills', title: '技能路径', desc: '规划岗位能力地图', icon: '技', tone: 'teal', url: '/package-career/pages/skill-pathways/skill-pathways' }
    ]
  }
];

const SERVICE_RESOURCES = [
  { id: 'news', title: '求职资讯', desc: '行业与求职内容', icon: '讯', tone: 'blue', url: '/package-content/pages/news/news' },
  { id: 'agencies', title: '机构测评', desc: '机构信息与评价', icon: '评', tone: 'violet', url: '/pages/agencies/agencies' },
  { id: 'guide', title: '使用指南', desc: '快速了解功能', icon: '指', tone: 'green', url: '/package-user/pages/usage-guide/usage-guide' }
];

Page({
  data: {
    featuredResource: FEATURED_RESOURCE,
    resourceSections: RESOURCE_SECTIONS,
    serviceResources: SERVICE_RESOURCES
  },

  onShow() {
    const tabBar = typeof this.getTabBar === 'function' ? this.getTabBar() : null;
    if (tabBar && typeof tabBar.syncState === 'function') tabBar.syncState();
  },

  openResource(e) {
    const url = e.currentTarget.dataset.url;
    if (url) navigation.safeNavigateTo(url);
  },

  onShareAppMessage() {
    return {
      title: '职引求职资源中心｜校招、题库、薪酬与职业探索',
      path: '/pages/resources/resources'
    };
  }
});
