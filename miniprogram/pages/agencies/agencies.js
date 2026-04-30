// pages/agencies/agencies.js
const api = require('../../utils/api');
const { AGENCIES: MOCK_AGENCIES } = require('../../utils/mock-data');

const TYPE_LIST = ['全部', '猎头', '背景提升', '简历优化', '面试培训', '留学咨询', '综合'];

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
  return { ...item, initial: _getInitials(item.name), logoColor: _pickLogoColor(item.name), logoFailed: false };
}

const SORT_OPTIONS = [
  { label: '综合排序', value: '' },
  { label: '评分最高', value: 'rating' },
  { label: '评测最多', value: 'reviews' },
  { label: '最新入驻', value: 'newest' }
];

Page({
  data: {
    typeList: TYPE_LIST,
    currentType: '全部',
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
    this.loadList(true);
  },

  onPullDownRefresh() {
    this.loadList(true, () => wx.stopPullDownRefresh());
  },

  onUnload() {
    clearTimeout(this.searchTimer);
  },

  // ── 加载列表 ──────────────────────────────────────────────────────────────
  loadList(reset = false, cb) {
    if (this.data.loading) return;
    const page = reset ? 1 : this.data.page;

    this.setData({ loading: true });

    const params = { page, pageSize: this.data.pageSize };
    if (this.data.currentType !== '全部') params.type = this.data.currentType;
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
      cb && cb();
    }).catch(() => {
      // API 不可达时（真机调试局域网问题等）加载兜底数据
      if (reset && this.data.list.length === 0) {
        this.setData({ list: MOCK_AGENCIES.map(_enrichItem), total: MOCK_AGENCIES.length, hasMore: false, loading: false });
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

  // ── 切换类型 ─────────────────────────────────────────────────────────────
  switchType(e) {
    const type = e.currentTarget.dataset.type;
    if (type === this.data.currentType) return;
    this.setData({ currentType: type });
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
      url: `/pages/agency-compare/agency-compare?ids=${compareIds.join(',')}`
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
    wx.navigateTo({ url: `/pages/agency-detail/agency-detail?id=${id}` });
  },

  onLogoError(e) {
    const idx = e.currentTarget.dataset.idx;
    this.setData({ [`list[${idx}].logoFailed`]: true });
  }
});
