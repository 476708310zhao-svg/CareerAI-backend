// pages/campus/campus.js
const api = require('../../utils/api.js');
const { CAMPUS: MOCK_CAMPUS } = require('../../utils/mock-data');
const { logoByName } = require('../../utils/logo.js');

const REGION_LIST      = ['全部', '中国内地', '北美', '英国', '澳洲/新加坡', '欧洲'];
const RECRUIT_TYPE_LIST = ['全部', '春招', '秋招', '暑期实习'];
const TYPE_LIST        = ['全部', '技术', '产品', '数据', '运营', '金融', '咨询', '综合'];
const WRITTEN_TEST_LIST = ['全部', '含免笔试', '仅测评', '需要笔试'];

// 招聘类型标签颜色映射
const TYPE_COLOR = {
  '春招':   { bg: '#EEF2FF', color: '#4F46E5', border: '#C7D2FE' },
  '秋招':   { bg: '#FFF7ED', color: '#C2410C', border: '#FED7AA' },
  '暑期实习': { bg: '#F0FDF4', color: '#15803D', border: '#86EFAC' },
};

const WRITTEN_COLOR = {
  '仅测评':  { bg: '#ECFDF5', color: '#059669' },
  '含免笔试': { bg: '#EFF6FF', color: '#2563EB' },
  '需要笔试': { bg: '#FEF3C7', color: '#D97706' },
};

Page({
  data: {
    regionList: REGION_LIST,
    recruitTypeList: RECRUIT_TYPE_LIST,
    typeList: TYPE_LIST,
    writtenTestList: WRITTEN_TEST_LIST,

    currentRegion: '全部',
    currentRecruitType: '全部',
    currentType: '全部',
    currentWrittenTest: '全部',
    currentGradYear: '',   // '' = 全部届次

    gradYears: [],

    keyword: '',
    list: [],
    page: 0,
    pageSize: 20,
    total: 0,
    hasMore: true,
    loading: false,

    // 筛选面板是否展开
    filterExpanded: false,
    spacerHeight: 220
  },

  onLoad() {
    this._loadMeta();
    this.loadList(true);
    setTimeout(() => this._updateSpacerHeight(), 200);
  },

  onPullDownRefresh() {
    this.loadList(true, () => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) this.loadList(false);
  },

  _loadMeta() {
    api.getCampusMeta().then(res => {
      if (res && res.code === 0) {
        this.setData({ gradYears: res.data.gradYears || [] });
      }
    }).catch(() => {});
  },

  _updateSpacerHeight() {
    wx.createSelectorQuery()
      .select('.fixed-header')
      .boundingClientRect(rect => {
        if (rect && rect.height) this.setData({ spacerHeight: rect.height + 4 });
      })
      .exec();
  },

  loadList(reset, cb) {
    if (this.data.loading) return;
    const page = reset ? 0 : this.data.page;
    this.setData({ loading: true });

    api.getCampusList({
      region:       this.data.currentRegion,
      positionType: this.data.currentType,
      recruitType:  this.data.currentRecruitType,
      writtenTest:  this.data.currentWrittenTest,
      gradYear:     this.data.currentGradYear,
      keyword:      this.data.keyword,
      page,
      pageSize:     this.data.pageSize
    }).then(res => {
      if (!res || res.code !== 0 || !res.data) throw new Error('bad_response');
      const rawList = Array.isArray(res.data) ? res.data : (res.data.list || []);
      const total   = Array.isArray(res.data) ? rawList.length : (res.data.total || 0);
      const items = rawList.map(item => ({
        ...item,
        companyLogo:    item.companyLogo || logoByName(item.company),
        _typeStyle:     TYPE_COLOR[item.recruitType]    || TYPE_COLOR['春招'],
        _testStyle:     WRITTEN_COLOR[item.writtenTest] || WRITTEN_COLOR['需要笔试'],
        _locLabel:      this._fmtLocations(item.locations),
        _deadlineShort: this._fmtDeadline(item.deadlineDate),
      }));
      const merged = reset ? items : this.data.list.concat(items);
      this.setData({
        list: merged,
        total,
        page: page + 1,
        hasMore: items.length >= this.data.pageSize,
        loading: false
      });
      cb && cb();
    }).catch(() => {
      if (reset && this.data.list.length === 0) {
        const items = MOCK_CAMPUS.map(item => ({
          ...item,
          companyLogo:    item.companyLogo || logoByName(item.company),
          gradYear:       item.gradYear || item.recruitYear,
          positionName:   item.positionName || item.positionType || '',
          deadlineDate:   item.deadlineDate || item.deadlineMonth || '',
          startDate:      item.startDate || item.appOpenMonth || '',
          locations:      item.locations || [],
          industry:       item.industry || '',
          _typeStyle:     TYPE_COLOR[item.recruitType]    || TYPE_COLOR['春招'],
          _testStyle:     WRITTEN_COLOR[item.writtenTest] || WRITTEN_COLOR['需要笔试'],
          _locLabel:      item.region,
          _deadlineShort: item.deadlineMonth ? item.deadlineMonth.slice(5) : (item.deadlineDate || '尽快')
        }));
        this.setData({ list: items, total: items.length, hasMore: false, loading: false });
        wx.showToast({ title: '当前为演示数据', icon: 'none', duration: 1500 });
      } else {
        this.setData({ loading: false });
      }
      cb && cb();
    });
  },

  _fmtLocations(locs) {
    if (!locs || !locs.length) return '全国';
    if (locs.length <= 2) return locs.join(' · ');
    return locs.slice(0, 2).join(' · ') + ' +' + (locs.length - 2);
  },

  _fmtDeadline(d) {
    if (!d || d === '尽快投递') return '尽快';
    // 如果是 YYYY-MM-DD，取 MM/DD
    const m = d.match(/\d{4}-(\d{2})-(\d{2})/);
    if (m) return m[1] + '/' + m[2];
    return d;
  },

  // ── 切换地区 ────────────────────────────────────────────────────────────
  switchRegion(e) {
    const val = e.currentTarget.dataset.val;
    if (val === this.data.currentRegion) return;
    this.setData({ currentRegion: val });
    this._reload();
  },

  // ── 切换招聘类型 ─────────────────────────────────────────────────────────
  switchRecruitType(e) {
    const val = e.currentTarget.dataset.val;
    if (val === this.data.currentRecruitType) return;
    this.setData({ currentRecruitType: val });
    this._reload();
  },

  // ── 切换岗位类型 ─────────────────────────────────────────────────────────
  switchType(e) {
    const val = e.currentTarget.dataset.val;
    if (val === this.data.currentType) return;
    this.setData({ currentType: val });
    this._reload();
  },

  // ── 切换免笔试 ───────────────────────────────────────────────────────────
  switchWrittenTest(e) {
    const val = e.currentTarget.dataset.val;
    const next = val === this.data.currentWrittenTest ? '全部' : val;
    this.setData({ currentWrittenTest: next });
    this._reload();
  },

  // ── 届次选择 ─────────────────────────────────────────────────────────────
  showGradYearPicker() {
    const { gradYears } = this.data;
    const items = ['全部届次', ...gradYears.map(y => y + '届')];
    wx.showActionSheet({
      itemList: items,
      success: ({ tapIndex }) => {
        const val = tapIndex === 0 ? '' : gradYears[tapIndex - 1];
        if (val !== this.data.currentGradYear) {
          this.setData({ currentGradYear: val });
          this._reload();
        }
      }
    });
  },

  // ── 搜索 ─────────────────────────────────────────────────────────────────
  onSearchInput(e) {
    const val = e.detail.value.trim();
    this.setData({ keyword: val });
    if (this._searchTimer) clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => this._reload(), 400);
  },

  onSearchConfirm() {
    if (this._searchTimer) clearTimeout(this._searchTimer);
    this._reload();
  },

  clearSearch() {
    this.setData({ keyword: '' });
    this._reload();
  },

  _reload() {
    wx.pageScrollTo({ scrollTop: 0, duration: 0 });
    this.loadList(true);
  },

  toggleFilter() {
    const next = !this.data.filterExpanded;
    this.setData({ filterExpanded: next });
    setTimeout(() => this._updateSpacerHeight(), 50);
  },

  goToDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/campus-detail/campus-detail?id=${id}` });
  },

  // 直接跳投递链接
  goApply(e) {
    e.stopPropagation && e.stopPropagation();
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    wx.navigateTo({ url: `/pages/webview/webview?url=${encodeURIComponent(url)}` });
  },

  // logo 加载失败 → 清空 URL，让 wx:else 的文字占位符接管
  onLogoImgError(e) {
    const idx = e.currentTarget.dataset.index;
    if (idx !== undefined) {
      this.setData({ [`list[${idx}].companyLogo`]: '' });
    }
  }
});
