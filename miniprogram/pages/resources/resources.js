const navigation = require('../../utils/navigation.js');

const PRIMARY_RESOURCES = [
  { id: 'interview', title: '面试题库', desc: '真题与高频问题', icon: '题', tone: 'blue', url: '/pages/experiences/experiences' },
  { id: 'star', title: 'STAR 案例', desc: '沉淀行为面试素材', icon: 'STAR', tone: 'violet', url: '/package-content/pages/star-library/star-library' },
  { id: 'salary', title: '薪酬查询', desc: '了解岗位薪资区间', icon: '薪', tone: 'green', url: '/package-career/pages/salary/salary' },
  { id: 'company', title: '公司情报', desc: '公司与招聘信息', icon: '企', tone: 'amber', url: '/package-user/pages/companies/companies' }
];

const RESOURCE_SECTIONS = [
  {
    id: 'advance',
    title: '求职进阶',
    subtitle: '针对笔试、面试和能力提升',
    items: [
      { id: 'oa', title: 'OA 题库', desc: '笔试准备与专项练习', icon: 'OA', tone: 'blue', url: '/package-career/pages/oa-bank/oa-bank' },
      { id: 'mock', title: 'AI 模拟面试', desc: '按目标岗位进行训练', icon: 'AI', tone: 'violet', url: '/package-ai/pages/interview-setup/interview-setup' },
      { id: 'skills', title: '技能路径', desc: '规划目标岗位能力地图', icon: '技', tone: 'green', url: '/package-career/pages/skill-pathways/skill-pathways' },
      { id: 'insights', title: '职业洞察', desc: '探索岗位与发展方向', icon: '察', tone: 'amber', url: '/package-career/pages/job-insights/job-insights' }
    ]
  },
  {
    id: 'opportunities',
    title: '机会与服务',
    subtitle: '找机会，也找到可信的求职支持',
    items: [
      { id: 'campus', title: '校招日历', desc: '查看网申、截止与招聘动态', icon: '校', tone: 'blue', url: '/pages/campus/campus' },
      { id: 'news', title: '求职资讯', desc: '集中查看行业和求职内容', icon: '讯', tone: 'violet', url: '/package-content/pages/news/news' },
      { id: 'agencies', title: '机构测评', desc: '浏览机构信息与用户评价', icon: '评', tone: 'green', url: '/pages/agencies/agencies' },
      { id: 'guide', title: '使用指南', desc: '快速了解产品功能', icon: '指', tone: 'amber', url: '/package-user/pages/usage-guide/usage-guide' }
    ]
  }
];

Page({
  data: {
    primaryResources: PRIMARY_RESOURCES,
    resourceSections: RESOURCE_SECTIONS
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
      title: '职引求职资源库｜题库、校招、薪酬与职业探索',
      path: '/pages/resources/resources'
    };
  }
});
