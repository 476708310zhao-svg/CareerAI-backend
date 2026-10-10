const navigation = require('../../utils/navigation.js');
const featureFlags = require('../../utils/feature-flags.js');

const CATEGORIES = [
  { id: 'assessment', title: '精选' }, { id: 'written', title: '笔试题库' },
  { id: 'interview', title: '面试经验' }, { id: 'company', title: '公司 / 行业' },
  { id: 'favorites', title: '我的收藏' }, { id: 'purchased', title: '我的已购', disabled: true }
];
const QUESTION_TYPES = [
  { id: '', title: '全部题型', categories: ['written', 'interview'] },
  { id: 'oa', title: 'OA', categories: ['written'] },
  { id: 'algorithm', title: '算法', categories: ['written'] },
  { id: 'frontend', title: '前端', categories: ['written'] },
  { id: 'system', title: '系统设计', categories: ['written'] },
  { id: 'behavior', title: '行为面试', categories: ['interview'] }
];
const questionTypesFor = category => QUESTION_TYPES.filter(item => item.categories.includes(category));
const ASSETS = [
  { id: 'agency', category: 'assessment', mark: '评', title: '求职机构评价', stage: '选择求职服务前', action: '查看机构方向与真实评价，辅助自行判断', desc: '查看已接入的机构信息、服务方向和用户评价', tags: ['机构', '评价', '留学求职'], types: [], url: '/pages/agencies/agencies' },
  { id: 'campus', category: 'assessment', mark: '历', title: '校招与截止日历', stage: '发现机会与规划时间', action: '查看公开校招批次、测评与截止节点', desc: '按企业和岗位浏览校招、测评与截止日期', tags: ['校招', '日历', '公司'], types: [], url: '/pages/campus/campus' },
  { id: 'oa', category: 'written', mark: '题', title: 'OA 笔试题库', stage: '网申与测评准备', action: '进入在线测评和笔试专项练习', desc: '练习已接入的 OA 与通用笔试题型', tags: ['OA', '笔试', '测评'], types: ['oa'], url: '/package-career/pages/oa-bank/oa-bank' },
  { id: 'algorithm', category: 'written', mark: '编', title: '算法与编程题库', stage: '技术笔试准备', action: '按题型练习算法、前端与系统设计内容', desc: '浏览算法、前端、后端和系统设计题型', tags: ['算法', '前端', '系统设计'], types: ['algorithm', 'frontend', 'system'], url: '/pages/experiences/experiences' },
  { id: 'experience', category: 'interview', mark: '面', title: '面试经验与真题', stage: '面试准备', action: '搜索公司、岗位和高频面试问题', desc: '查看已发布的面试经验与题目内容', tags: ['面经', '公司', '岗位'], types: ['behavior'], url: '/pages/experiences/experiences' },
  { id: 'star', category: 'interview', mark: '例', title: 'STAR 案例库', stage: '行为面试准备', action: '整理行为案例并复盘表达结构', desc: '管理自己的 STAR 素材与复盘记录', tags: ['行为面试', 'STAR', '复盘'], types: ['behavior'], url: '/package-content/pages/star-library/star-library' },
  { id: 'companies', category: 'company', mark: '企', title: '公司资料库', stage: '公司研究', action: '查看公司概况、行业和公开招聘岗位', desc: '浏览已接入的公司与行业信息', tags: ['公司', '行业', '岗位'], types: [], url: '/package-user/pages/companies/companies' },
  { id: 'news', category: 'company', mark: '读', title: '行业与求职内容', stage: '方向研究', action: '阅读行业动态、求职技巧与政策信息', desc: '查看已发布的行业、数据和政策内容', tags: ['行业', '资讯', '政策'], types: [], url: '/package-content/pages/news/news' },
  { id: 'favorite', category: 'favorites', mark: '藏', title: '我的收藏', stage: '持续整理', action: '查看你真实收藏的职位、公司、面经与校招', desc: '集中管理当前账号已经收藏的内容', tags: ['收藏', '职位', '面经'], types: [], url: '/package-user/pages/favorites/favorites' }
];

Page({
  data: {
    categories: CATEGORIES, activeCategory: 'assessment', assets: [],
    keyword: '', company: '', role: '', questionType: '', applicationId: '',
    questionTypes: [], emptyTitle: '', emptyDesc: ''
  },
  onLoad(options = {}) {
    const category = CATEGORIES.some(item => item.id === options.category && !item.disabled) ? options.category : 'assessment';
    const questionTypes = questionTypesFor(category);
    const requestedType = String(options.type || '');
    const questionType = questionTypes.some(item => item.id === requestedType) ? requestedType : '';
    this.setData({ activeCategory: category, company: String(options.company || ''),
      role: String(options.role || options.position || ''), questionType, questionTypes,
      applicationId: String(options.applicationId || '') }, () => this.applyFilters());
  },
  onShow() {
    const tabBar = typeof this.getTabBar === 'function' ? this.getTabBar() : null;
    if (tabBar && typeof tabBar.syncState === 'function') tabBar.syncState();
    this.applyFilters();
  },
  selectCategory(e) {
    const id = e.currentTarget.dataset.id;
    if (CATEGORIES.some(item => item.id === id && !item.disabled)) {
      this.setData({ activeCategory: id, questionType: '', questionTypes: questionTypesFor(id) }, () => this.applyFilters());
    }
  },
  onKeyword(e) { this.setData({ keyword: e.detail.value || '' }, () => this.applyFilters()); },
  selectQuestionType(e) {
    const id = e.currentTarget.dataset.id || '';
    if ((this.data.questionTypes || []).some(item => item.id === id)) this.setData({ questionType: id }, () => this.applyFilters());
  },
  applyFilters() {
    const category = this.data.activeCategory;
    const keyword = String(this.data.keyword || '').trim().toLowerCase();
    const questionType = String(this.data.questionType || '');
    const assets = ASSETS.filter(item => item.category === category)
      .filter(item => !questionType || !['written', 'interview'].includes(category) || item.types.includes(questionType))
      .filter(item => !keyword || [item.title, item.desc].concat(item.tags || []).join(' ').toLowerCase().includes(keyword));
    this.setData({ assets, emptyTitle: '没有匹配的内容', emptyDesc: '换个关键词，或清除筛选后再试。' });
  },
  openAsset(e) {
    const item = ASSETS.find(asset => asset.id === e.currentTarget.dataset.id);
    if (!item || !featureFlags.allowNavigation(item.url)) return;
    const params = { keyword: this.data.keyword, company: this.data.company, role: this.data.role,
      applicationId: this.data.applicationId,
      type: this.data.questionType || item.types[0] || '' };
    const query = Object.keys(params).filter(key => params[key]).map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`).join('&');
    navigation.safeNavigateTo(item.url + (query ? `${item.url.includes('?') ? '&' : '?'}${query}` : ''));
  },
  clearFilters() { this.setData({ keyword: '', questionType: '' }, () => this.applyFilters()); },
  onShareAppMessage() { return { title: '职引资源中心｜题库、面经与公司内容', path: '/pages/resources/resources' }; }
});
