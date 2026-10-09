const navigation = require('../../utils/navigation.js');
const featureFlags = require('../../utils/feature-flags.js');

const CATEGORIES = [
  { id: 'assessment', title: '测评资料' }, { id: 'written', title: '笔试题库' },
  { id: 'interview', title: '面试经验' }, { id: 'company', title: '公司 / 行业' },
  { id: 'favorites', title: '我的收藏' }, { id: 'purchased', title: '我的已购' }
];
const ASSETS = [
  { id: 'agency', category: 'assessment', title: '求职机构测评与评价', desc: '查看真实机构信息、服务方向和用户评价', tags: ['机构', '测评', '留学求职'], url: '/pages/agencies/agencies' },
  { id: 'campus', category: 'assessment', title: '校招测评与截止日历', desc: '按企业和岗位查看校招、测评与截止节点', tags: ['校招', '测评', '公司'], url: '/pages/campus/campus' },
  { id: 'oa', category: 'written', title: 'OA 笔试题库', desc: '在线测评和笔试专项练习', tags: ['OA', '笔试', '测评'], url: '/package-career/pages/oa-bank/oa-bank', type: 'oa' },
  { id: 'algorithm', category: 'written', title: '算法与编程题库', desc: '算法、前端、后端和系统设计题型', tags: ['算法', '前端', '系统设计'], url: '/pages/experiences/experiences', type: 'algorithm' },
  { id: 'experience', category: 'interview', title: '面试经验与真题', desc: '搜索公司、岗位和高频面试问题', tags: ['面经', '公司', '岗位'], url: '/pages/experiences/experiences', type: 'behavior' },
  { id: 'star', category: 'interview', title: 'STAR 案例库', desc: '整理行为面试素材和复盘记录', tags: ['行为面试', 'STAR', '复盘'], url: '/package-content/pages/star-library/star-library', type: 'behavior' },
  { id: 'companies', category: 'company', title: '公司资料库', desc: '查看公司概况、行业和招聘岗位', tags: ['公司', '行业', '岗位'], url: '/package-user/pages/companies/companies' },
  { id: 'news', category: 'company', title: '行业与求职内容', desc: '行业动态、求职技巧、数据和政策', tags: ['行业', '资讯', '政策'], url: '/package-content/pages/news/news' },
  { id: 'favorite', category: 'favorites', title: '我的收藏', desc: '集中查看已收藏的职位、公司、面经与校招', tags: ['收藏', '职位', '面经'], url: '/package-user/pages/favorites/favorites' }
];

Page({
  data: {
    pageTop: 52, categories: CATEGORIES, activeCategory: 'assessment', assets: [],
    keyword: '', company: '', role: '', questionType: '', applicationId: '',
    questionTypes: [
      { id: '', title: '全部题型' }, { id: 'algorithm', title: '算法' },
      { id: 'frontend', title: '前端' }, { id: 'system', title: '系统设计' },
      { id: 'behavior', title: '行为面试' }
    ], emptyTitle: '', emptyDesc: ''
  },
  onLoad(options = {}) {
    this.syncPageTop();
    const category = CATEGORIES.some(item => item.id === options.category) ? options.category : 'assessment';
    this.setData({ activeCategory: category, company: String(options.company || ''),
      role: String(options.role || options.position || ''), questionType: String(options.type || ''),
      applicationId: String(options.applicationId || '') }, () => this.applyFilters());
  },
  onShow() {
    const tabBar = typeof this.getTabBar === 'function' ? this.getTabBar() : null;
    if (tabBar && typeof tabBar.syncState === 'function') tabBar.syncState();
    this.applyFilters();
  },
  syncPageTop() {
    try {
      const menu = wx.getMenuButtonBoundingClientRect && wx.getMenuButtonBoundingClientRect();
      const system = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      const statusBarHeight = Number(system && system.statusBarHeight) || 20;
      this.setData({ pageTop: menu && menu.top ? Math.max(statusBarHeight + 8, menu.top + 8) : statusBarHeight + 32 });
    } catch (error) {}
  },
  selectCategory(e) {
    const id = e.currentTarget.dataset.id;
    if (CATEGORIES.some(item => item.id === id)) this.setData({ activeCategory: id }, () => this.applyFilters());
  },
  onKeyword(e) { this.setData({ keyword: e.detail.value || '' }, () => this.applyFilters()); },
  onCompany(e) { this.setData({ company: e.detail.value || '' }); },
  onRole(e) { this.setData({ role: e.detail.value || '' }); },
  selectQuestionType(e) { this.setData({ questionType: e.currentTarget.dataset.id || '' }, () => this.applyFilters()); },
  applyFilters() {
    const category = this.data.activeCategory;
    if (category === 'purchased') {
      this.setData({ assets: [], emptyTitle: '已购资料暂未开放', emptyDesc: '当前版本尚未接入资料商品、订单和权益，不会展示虚构的已购数量。' });
      return;
    }
    const keyword = String(this.data.keyword || '').trim().toLowerCase();
    const assets = ASSETS.filter(item => item.category === category).filter(item => !keyword ||
      [item.title, item.desc].concat(item.tags || []).join(' ').toLowerCase().includes(keyword));
    this.setData({ assets, emptyTitle: '没有匹配的内容', emptyDesc: '换个关键词，或清除筛选后再试。' });
  },
  openAsset(e) {
    const item = ASSETS.find(asset => asset.id === e.currentTarget.dataset.id);
    if (!item || !featureFlags.allowNavigation(item.url)) return;
    const params = { keyword: this.data.keyword, company: this.data.company, role: this.data.role,
      applicationId: this.data.applicationId,
      type: this.data.questionType || item.type };
    const query = Object.keys(params).filter(key => params[key]).map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`).join('&');
    navigation.safeNavigateTo(item.url + (query ? `${item.url.includes('?') ? '&' : '?'}${query}` : ''));
  },
  clearFilters() { this.setData({ keyword: '', company: '', role: '', questionType: '' }, () => this.applyFilters()); },
  onShareAppMessage() { return { title: '职引资源中心｜题库、面经与公司内容', path: '/pages/resources/resources' }; }
});
