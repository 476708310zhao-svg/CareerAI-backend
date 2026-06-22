// pages/agencies/agencies.js
const api = require('../../utils/api');
const { logoUrl } = require('../../utils/logo');
const demoData = require('../../utils/demo-data');
const AGENCY_LIST_CACHE_TTL = 30 * 60 * 1000;

const REGION_LIST = ['全部地区', '北美', '美国', '加拿大', '英国', '中国内地', '新加坡', '澳洲', '香港', '线上'];
const REGION_KEYWORDS = {
  '北美': ['北美', '美国', '加拿大', '纽约', '旧金山', '湾区', '西雅图', '多伦多', '温哥华', '硅谷', '洛杉矶'],
  '美国': ['美国', '纽约', '旧金山', '湾区', '西雅图', '硅谷', '洛杉矶'],
  '加拿大': ['加拿大', '多伦多', '温哥华'],
  '英国': ['英国', '伦敦'],
  '中国内地': ['中国', '国内', '全国', '北京', '上海', '深圳', '广州', '杭州', '内地'],
  '新加坡': ['新加坡'],
  '澳洲': ['澳洲', '澳大利亚', '悉尼', '墨尔本'],
  '香港': ['香港'],
  '线上': ['线上', '在线', '远程']
};

const LOGO_COLORS = [
  'rgba(102,126,234,0.85)', 'rgba(240,147,251,0.85)', 'rgba(79,172,254,0.85)',
  'rgba(67,233,123,0.85)',  'rgba(250,112,154,0.85)', 'rgba(161,140,209,0.85)',
  'rgba(252,203,144,0.85)', 'rgba(224,195,252,0.85)', 'rgba(246,211,101,0.85)',
  'rgba(137,247,254,0.85)', 'rgba(253,219,146,0.85)', 'rgba(150,251,196,0.85)',
];
function _pickLogoColor(name) {
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return LOGO_COLORS[Math.abs(h) % LOGO_COLORS.length];
}
function _getInitials(name) {
  if (!name) return '?';
  const eng = name.match(/[A-Za-z]+/g);
  if (eng && eng.length >= 2) return (eng[0][0] + eng[1][0]).toUpperCase();
  if (eng) return eng[0].slice(0, 2).toUpperCase();
  const cjk = name.match(/[一-鿿]/g);
  if (cjk) return cjk.slice(0, 2).join('');
  return name.slice(0, 2).toUpperCase();
}
function _enrichItem(item) {
  return {
    ...item,
    initial:       _getInitials(item.name),
    logoColor:     _pickLogoColor(item.name),
    logoFailed:    false,
    logoProxyUrl:  item.logoDomain ? logoUrl(item.logoDomain) : '',
  };
}
function _matchesRegion(item, region) {
  if (!region || region === '全部地区') return true;
  const words = REGION_KEYWORDS[region] || [region];
  const text = [item.city, item.description, item.services, item.specialties]
    .flat()
    .filter(Boolean)
    .join(' ');
  return words.some(word => text.indexOf(word) !== -1);
}
function _filterMockAgencies(data, filters) {
  const keyword = (filters.keyword || '').trim().toLowerCase();
  return data.filter(item => {
    if (!_matchesRegion(item, filters.region)) return false;
    if (!keyword) return true;
    const searchable = [item.name, item.description, item.type, item.city, item.specialties]
      .flat()
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return searchable.indexOf(keyword) !== -1;
  });
}

const SORT_OPTIONS = [
  { label: '综合排序', value: '' },
  { label: '评分最高', value: 'rating' },
  { label: '评测最多', value: 'reviews' },
  { label: '最新入驻', value: 'newest' }
];

Page({
  data: {
    regionList: REGION_LIST,
    currentRegion: '全部地区',
    keyword: '',

    // 排序
    sortOptions: SORT_OPTIONS,
    currentSort: '',
    currentSortLabel: '综合排序',

    // 对比模式
    compareMode: false,
    compareIds: [],      // 已选 id 数组（最多 3 个）
    compareSel: {},      // { [id]: true } 快速查找

    list: [],
    total: 0,
    page: 1,
    pageSize: 15,
    hasMore: true,
    loading: false
  },

  onLoad() {
    const hasCache = this.loadCachedList();
    clearTimeout(this._initialLoadTimer);
    this._initialLoadTimer = setTimeout(() => this.loadList(true), hasCache ? 220 : 80);
  },

  onShow() {
    const app = getApp();
    if (app && typeof app.syncCustomTabBar === 'function') app.syncCustomTabBar();
  },

  onPullDownRefresh() {
    this.loadList(true, () => wx.stopPullDownRefresh());
  },

  onUnload() {
    clearTimeout(this._initialLoadTimer);
    clearTimeout(this.searchTimer);
  },

  // ── 加载列表 ──────────────────────────────────────────────────────────────
  _cacheKey() {
    return [
      'agencies',
      this.data.currentRegion || 'all',
      this.data.keyword || '',
      this.data.currentSort || ''
    ].join('|');
  },

  loadCachedList() {
    try {
      const cached = wx.getStorageSync('cachedAgencyList');
      if (!cached || cached.key !== this._cacheKey() || (Date.now() - (cached.t || 0)) > AGENCY_LIST_CACHE_TTL) return false;
      if (!Array.isArray(cached.list) || cached.list.length === 0) return false;
      this.setData({
        list: cached.list,
        total: cached.total || cached.list.length,
        page: 2,
        hasMore: cached.hasMore !== false,
        loading: false
      });
      return true;
    } catch (e) {
      return false;
    }
  },

  loadList(reset = false, cb) {
    if (this.data.loading) return;
    const page = reset ? 1 : this.data.page;

    this.setData({ loading: true });

    const params = { page, pageSize: this.data.pageSize };
    if (this.data.currentRegion !== '全部地区') params.region = this.data.currentRegion;
    if (this.data.keyword) params.keyword = this.data.keyword;
    if (this.data.currentSort) params.sort = this.data.currentSort;

    api.getAgencies(params).then(res => {
      if (res.code !== 0) throw new Error(res.message);
      const enriched = res.data.map(_enrichItem);
      const newList = reset ? enriched : [...this.data.list, ...enriched];
      this.setData({
        list: newList,
        total: res.total,
        page: page + 1,
        hasMore: newList.length < res.total,
        loading: false
      });
      if (reset) {
        try {
          wx.setStorageSync('cachedAgencyList', {
            key: this._cacheKey(),
            list: newList,
            total: res.total,
            hasMore: newList.length < res.total,
            t: Date.now()
          });
        } catch (e) {}
      }
      cb && cb();
    }).catch(() => {
      if (reset && this.data.list.length === 0 && demoData.enabled()) {
        const fallback = _filterMockAgencies(demoData.getList('AGENCIES'), {
          region: this.data.currentRegion,
          keyword: this.data.keyword
        }).map(_enrichItem);
        this.setData({ list: fallback, total: fallback.length, hasMore: false, loading: false });
      } else {
        this.setData({ loading: false });
      }
      cb && cb();
    });
  },

  loadMore() {
    if (!this.data.hasMore || this.data.loading) return;
    this.loadList(false);
  },

  onReachBottom() {
    this.loadMore();
  },

  switchRegion(e) {
    const region = e.currentTarget.dataset.region;
    if (region === this.data.currentRegion) return;
    this.setData({ currentRegion: region });
    this.loadList(true);
  },

  // ── 搜索 ─────────────────────────────────────────────────────────────────
  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value });
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.loadList(true);
    }, 450);
  },

  onSearch() {
    clearTimeout(this.searchTimer);
    this.loadList(true);
  },

  clearSearch() {
    clearTimeout(this.searchTimer);
    this.setData({ keyword: '' });
    this.loadList(true);
  },

  // ── 排序 ─────────────────────────────────────────────────────────────────
  showSortSheet() {
    const items = SORT_OPTIONS.map(o => o.label);
    wx.showActionSheet({
      itemList: items,
      success: (res) => {
        const selected = SORT_OPTIONS[res.tapIndex];
        if (selected.value === this.data.currentSort) return;
        this.setData({
          currentSort: selected.value,
          currentSortLabel: selected.label
        });
        this.loadList(true);
      }
    });
  },

  // ── 对比模式 ─────────────────────────────────────────────────────────────
  toggleCompareMode() {
    const entering = !this.data.compareMode;
    this.setData({
      compareMode: entering,
      compareIds: [],
      compareSel: {}
    });
    if (entering) {
      wx.showToast({ title: '最多选择 3 家机构', icon: 'none', duration: 1500 });
    }
  },

  toggleSelect(e) {
    const id = e.currentTarget.dataset.id;
    const { compareIds, compareSel } = this.data;

    if (compareSel[id]) {
      // 取消选中
      const newIds = compareIds.filter(i => i !== id);
      const newSel = { ...compareSel };
      delete newSel[id];
      this.setData({ compareIds: newIds, compareSel: newSel });
    } else {
      if (compareIds.length >= 3) {
        wx.showToast({ title: '最多选择 3 家', icon: 'none' });
        return;
      }
      this.setData({
        compareIds: [...compareIds, id],
        compareSel: { ...compareSel, [id]: true }
      });
    }
  },

  startCompare() {
    const { compareIds } = this.data;
    if (compareIds.length < 2) {
      wx.showToast({ title: '请至少选择 2 家机构', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: `/package-agency/pages/agency-compare/agency-compare?ids=${compareIds.join(',')}`
    });
  },

  // ── 卡片点击（对比模式选择 / 普通模式跳转）──────────────────────────────
  onCardTap(e) {
    if (this.data.compareMode) {
      this.toggleSelect(e);
    } else {
      this.goDetail(e);
    }
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/package-agency/pages/agency-detail/agency-detail?id=${id}` });
  },

  onLogoError(e) {
    const idx = e.currentTarget.dataset.idx;
    this.setData({ [`list[${idx}].logoFailed`]: true });
  }
});
