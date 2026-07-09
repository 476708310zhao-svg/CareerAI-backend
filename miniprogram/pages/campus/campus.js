// pages/campus/campus.js
const api = require('../../utils/api.js');
const demoData = require('../../utils/demo-data');
const { logoByName } = require('../../utils/logo.js');
const reminders = require('../../utils/reminders.js');
const CAMPUS_LIST_CACHE_KEY = 'cachedCampusList_v2';
const CAMPUS_LIST_CACHE_TTL = 30 * 60 * 1000;

const REGION_LIST      = ['全部', '中国内地', '北美', '英国', '澳洲/新加坡', '欧洲'];
const RECRUIT_TYPE_LIST = ['全部', '春招', '秋招', '暑期实习'];
const TYPE_LIST        = ['全部', '技术', '产品', '数据', '运营', '金融', '咨询', '综合'];
const WRITTEN_TEST_LIST = ['全部', '含免笔试', '仅测评', '需要笔试'];
const INDUSTRY_LIST    = ['全部', '互联网', '金融', '咨询', '新能源', '通信/硬件', '国央企'];
const EDUCATION_LIST   = ['全部', '本科及以上', '硕士友好', '博士/科研'];
const VISA_LIST        = ['全部', '有签证信息', 'Sponsor友好', '需核实'];
const DEADLINE_LIST    = ['全部', '7天内', '30天内', '仍可投', '已截止'];
const VISA_VALUE_MAP = {
  '有签证信息': 'info',
  'Sponsor友好': 'support',
  '需核实': 'verify'
};
const DEADLINE_VALUE_MAP = {
  '7天内': '7d',
  '30天内': '30d',
  '仍可投': 'open',
  '已截止': 'expired'
};

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
    industryList: INDUSTRY_LIST,
    educationList: EDUCATION_LIST,
    visaList: VISA_LIST,
    deadlineList: DEADLINE_LIST,

    currentRegion: '全部',
    currentRecruitType: '全部',
    currentType: '全部',
    currentWrittenTest: '全部',
    currentIndustry: '全部',
    currentEducation: '全部',
    currentVisa: '全部',
    currentDeadline: '全部',
    currentOverseasFriendly: false,
    currentGradYear: '',   // '' = 全部届次

    gradYears: [],
    activeFilterCount: 0,

    keyword: '',
    list: [],
    page: 0,
    pageSize: 20,
    total: 0,
    hasMore: true,
    loading: false,

    // 筛选面板是否展开
    filterExpanded: false,
    spacerHeight: 220,
    subscribingId: ''
  },

  onLoad() {
    this._serverCampusReminderMap = {};
    const hasCache = this.loadCachedList();
    clearTimeout(this._initialLoadTimer);
    this._initialLoadTimer = setTimeout(() => {
      this._loadMeta();
      this.loadList(true);
    }, hasCache ? 220 : 80);
    this.refreshReminderState();
    setTimeout(() => this._updateSpacerHeight(), 200);
  },

  onShow() {
    const app = getApp();
    if (app && typeof app.syncCustomTabBar === 'function') app.syncCustomTabBar();

    if (!this._loadedOnce) {
      this._loadedOnce = true;
      return;
    }
    clearTimeout(this._returnRefreshTimer);
    this._returnRefreshTimer = setTimeout(() => this.loadList(true), 180);
    this.refreshReminderState();
  },

  onUnload() {
    clearTimeout(this._initialLoadTimer);
    clearTimeout(this._returnRefreshTimer);
    clearTimeout(this._searchTimer);
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
        const data = res.data || {};
        const industries = Array.isArray(data.industries) && data.industries.length ? data.industries : INDUSTRY_LIST.slice(1);
        this.setData({
          gradYears: data.gradYears || [],
          industryList: ['全部', ...industries.filter(Boolean)]
        });
      }
    }).catch(() => {});
  },

  _cacheKey() {
    return [
      'campus',
      this.data.currentRegion || '',
      this.data.currentRecruitType || '',
      this.data.currentType || '',
      this.data.currentWrittenTest || '',
      this.data.currentIndustry || '',
      this.data.currentEducation || '',
      this.data.currentVisa || '',
      this.data.currentDeadline || '',
      this.data.currentOverseasFriendly ? 'overseas' : '',
      this.data.currentGradYear || '',
      this.data.keyword || ''
    ].join('|');
  },

  loadCachedList() {
    try {
      const cached = wx.getStorageSync(CAMPUS_LIST_CACHE_KEY);
      if (!cached || cached.key !== this._cacheKey() || (Date.now() - (cached.t || 0)) > CAMPUS_LIST_CACHE_TTL) return false;
      if (!Array.isArray(cached.list) || cached.list.length === 0) return false;
      this.setData({
        list: cached.list,
        total: cached.total || cached.list.length,
        page: 1,
        hasMore: cached.hasMore !== false,
        loading: false
      });
      return true;
    } catch (e) {
      return false;
    }
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
      industry:     this.data.currentIndustry,
      educationLevel: this.data.currentEducation,
      overseasFriendly: this.data.currentOverseasFriendly ? '1' : '',
      visa:         VISA_VALUE_MAP[this.data.currentVisa] || '',
      deadlineWindow: DEADLINE_VALUE_MAP[this.data.currentDeadline] || '',
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
        _companyInitial: String(item.company || '').slice(0, 2) || '--',
        _typeStyle:     TYPE_COLOR[item.recruitType]    || TYPE_COLOR['春招'],
        _testStyle:     WRITTEN_COLOR[item.writtenTest] || WRITTEN_COLOR['需要笔试'],
        _locLabel:      this._fmtLocations(item.locations),
        _deadlineShort: this._fmtDeadline(item.deadlineDate),
        _startMonth:    item.startDate ? String(item.startDate).slice(0, 7) : '-',
        _deadlineTone:  this._deadlineTone(item),
        _isSubscribed:  this._isCampusSubscribed(item.id),
        _identityTags:  this._identityTags(item)
      }));
      const merged = reset ? items : this.data.list.concat(items);
      this.setData({
        list: merged,
        total,
        page: page + 1,
        hasMore: items.length >= this.data.pageSize,
        loading: false
      });
      if (reset) {
        try {
          wx.setStorageSync(CAMPUS_LIST_CACHE_KEY, {
            key: this._cacheKey(),
            list: merged,
            total,
            hasMore: items.length >= this.data.pageSize,
            t: Date.now()
          });
        } catch (e) {}
      }
      cb && cb();
    }).catch(() => {
      if (reset && this.data.list.length === 0 && demoData.enabled()) {
        const items = demoData.getList('CAMPUS').map(item => ({
          ...item,
          companyLogo:    item.companyLogo || logoByName(item.company),
          _companyInitial: String(item.company || '').slice(0, 2) || '--',
          gradYear:       item.gradYear || item.recruitYear,
          positionName:   item.positionName || item.positionType || '',
          deadlineDate:   item.deadlineDate || item.deadlineMonth || '',
          startDate:      item.startDate || item.appOpenMonth || '',
          locations:      item.locations || [],
          industry:       item.industry || '',
          _typeStyle:     TYPE_COLOR[item.recruitType]    || TYPE_COLOR['春招'],
          _testStyle:     WRITTEN_COLOR[item.writtenTest] || WRITTEN_COLOR['需要笔试'],
          _locLabel:      item.region,
          _deadlineShort: item.deadlineMonth ? item.deadlineMonth.slice(5) : (item.deadlineDate || '尽快'),
          _startMonth:    item.startDate || item.appOpenMonth ? String(item.startDate || item.appOpenMonth).slice(0, 7) : '-',
          _deadlineTone:  this._deadlineTone(item),
          _isSubscribed:  this._isCampusSubscribed(item.id),
          _identityTags:  this._identityTags(item)
        }));
        this.setData({ list: items, total: items.length, hasMore: false, loading: false });
        wx.showToast({ title: '已加载推荐内容', icon: 'none', duration: 1500 });
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

  _deadlineTone(item) {
    const status = item && item.deadlineStatus;
    if (status === '已截止') return 'expired';
    if (status === '30天内截止') return 'soon';
    if (status === '尽快投递' || status === '今日截止' || /天内截止/.test(String(status || ''))) return 'urgent';
    return '';
  },

  _identityTags(item) {
    const tags = [];
    if (item.educationLevel) tags.push({ text: item.educationLevel, type: 'education' });
    if (item.overseasFriendly) tags.push({ text: '留学生友好', type: 'overseas' });
    if (item.visaTag && item.visaTag !== '国内岗位') tags.push({ text: item.visaTag, type: item.visaStatus || 'visa' });
    if (item.deadlineStatus) tags.push({ text: item.deadlineStatus, type: this._deadlineTone(item) || 'deadline' });
    return tags.slice(0, 4);
  },

  _isCampusSubscribed(id) {
    if (!id && id !== 0) return false;
    const key = String(id);
    const serverMap = this._serverCampusReminderMap || {};
    return !!(serverMap[key] && serverMap[key].enabled) || reminders.isCampusReminderLocalEnabled(id);
  },

  refreshReminderState() {
    reminders.fetchReminders({
      sourceType: reminders.CAMPUS_SOURCE_TYPE,
      reminderType: reminders.CAMPUS_DEADLINE_TYPE
    }).then(rows => {
      const map = {};
      (rows || []).forEach(row => {
        if (!row || !row.enabled || !row.targetId) return;
        map[String(row.targetId)] = row;
        reminders.saveCampusReminderLocal({ id: row.targetId }, row);
      });
      this._serverCampusReminderMap = map;
      this._applyReminderState();
    });
  },

  _applyReminderState() {
    const list = (this.data.list || []).map(item => ({
      ...item,
      _isSubscribed: this._isCampusSubscribed(item.id)
    }));
    if (list.length) this.setData({ list });
  },

  _activeFilterCount(patch) {
    const data = Object.assign({}, this.data, patch || {});
    const keys = [
      'currentRegion',
      'currentRecruitType',
      'currentType',
      'currentWrittenTest',
      'currentIndustry',
      'currentEducation',
      'currentVisa',
      'currentDeadline'
    ];
    let count = keys.reduce((sum, key) => sum + (data[key] && data[key] !== '全部' ? 1 : 0), 0);
    if (data.currentGradYear) count += 1;
    if (data.currentOverseasFriendly) count += 1;
    if (data.keyword) count += 1;
    return count;
  },

  _setFilters(patch) {
    const next = Object.assign({}, patch || {});
    next.activeFilterCount = this._activeFilterCount(next);
    this.setData(next, () => this._reload());
  },

  // ── 切换地区 ────────────────────────────────────────────────────────────
  switchRegion(e) {
    const val = e.currentTarget.dataset.val;
    if (val === this.data.currentRegion) return;
    this._setFilters({ currentRegion: val });
  },

  // ── 切换招聘类型 ─────────────────────────────────────────────────────────
  switchRecruitType(e) {
    const val = e.currentTarget.dataset.val;
    if (val === this.data.currentRecruitType) return;
    this._setFilters({ currentRecruitType: val });
  },

  // ── 切换岗位类型 ─────────────────────────────────────────────────────────
  switchType(e) {
    const val = e.currentTarget.dataset.val;
    if (val === this.data.currentType) return;
    this._setFilters({ currentType: val });
  },

  // ── 切换免笔试 ───────────────────────────────────────────────────────────
  switchWrittenTest(e) {
    const val = e.currentTarget.dataset.val;
    const next = val === this.data.currentWrittenTest ? '全部' : val;
    this._setFilters({ currentWrittenTest: next });
  },

  switchIndustry(e) {
    const val = e.currentTarget.dataset.val;
    if (val === this.data.currentIndustry) return;
    this._setFilters({ currentIndustry: val });
  },

  switchEducation(e) {
    const val = e.currentTarget.dataset.val;
    const next = val === this.data.currentEducation ? '全部' : val;
    this._setFilters({ currentEducation: next });
  },

  switchVisa(e) {
    const val = e.currentTarget.dataset.val;
    const next = val === this.data.currentVisa ? '全部' : val;
    this._setFilters({ currentVisa: next });
  },

  switchDeadline(e) {
    const val = e.currentTarget.dataset.val;
    const next = val === this.data.currentDeadline ? '全部' : val;
    this._setFilters({ currentDeadline: next });
  },

  toggleOverseasFriendly() {
    this._setFilters({ currentOverseasFriendly: !this.data.currentOverseasFriendly });
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
          this._setFilters({ currentGradYear: val });
        }
      }
    });
  },

  // ── 搜索 ─────────────────────────────────────────────────────────────────
  onSearchInput(e) {
    const val = e.detail.value.trim();
    this.setData({ keyword: val, activeFilterCount: this._activeFilterCount({ keyword: val }) });
    if (this._searchTimer) clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => this._reload(), 400);
  },

  onSearchConfirm() {
    if (this._searchTimer) clearTimeout(this._searchTimer);
    this._reload();
  },

  clearSearch() {
    this._setFilters({ keyword: '' });
  },

  resetFilters() {
    this._setFilters({
      currentRegion: '全部',
      currentRecruitType: '全部',
      currentType: '全部',
      currentWrittenTest: '全部',
      currentIndustry: '全部',
      currentEducation: '全部',
      currentVisa: '全部',
      currentDeadline: '全部',
      currentOverseasFriendly: false,
      currentGradYear: '',
      keyword: '',
      activeFilterCount: 0
    });
  },

  _reload() {
    clearTimeout(this._initialLoadTimer);
    clearTimeout(this._returnRefreshTimer);
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
    const item = (this.data.list || []).find(row => String(row.id) === String(id));
    if (item) {
      try { wx.setStorageSync('campusDetailSnapshot_' + String(id), item); } catch (err) {}
    }
    wx.navigateTo({ url: `/package-content/pages/campus-detail/campus-detail?id=${id}` });
  },

  subscribeFromCard(e) {
    const index = e.currentTarget.dataset.index;
    const item = this.data.list[index];
    if (!item || !item.id) return;
    if (item._isSubscribed || this._isCampusSubscribed(item.id)) {
      wx.showActionSheet({
        itemList: ['取消截止提醒'],
        success: ({ tapIndex }) => {
          if (tapIndex === 0) this.cancelReminderFromCard(item, index);
        },
        fail: () => {}
      });
      return;
    }
    const id = String(item.id);
    this.setData({ subscribingId: id });
    const payload = reminders.buildCampusDeadlineReminder(item);
    const finish = (title, record) => {
      const saved = record && (record.data || record);
      if (saved && saved.enabled) {
        this._serverCampusReminderMap = Object.assign({}, this._serverCampusReminderMap, {
          [String(item.id)]: saved
        });
      }
      reminders.saveCampusReminderLocal(item, saved || payload);
      this.setData({
        [`list[${index}]._isSubscribed`]: true,
        subscribingId: ''
      });
      wx.showToast({ title: title || '已保存提醒', icon: 'success' });
    };
    reminders.upsertCampusDeadlineReminder(item, { withSubscribe: true })
      .then(record => finish(payload.reminderDate ? '已设置截止提醒' : '已关注校招', record))
      .catch(() => finish('已保存到本地'));
  },

  cancelReminderFromCard(item, index) {
    if (!item || !item.id) return;
    const id = String(item.id);
    this.setData({ subscribingId: id });
    const done = () => {
      const nextMap = Object.assign({}, this._serverCampusReminderMap || {});
      delete nextMap[id];
      this._serverCampusReminderMap = nextMap;
      reminders.removeCampusReminderLocal(id);
      this.setData({
        [`list[${index}]._isSubscribed`]: false,
        subscribingId: ''
      });
      wx.showToast({ title: '已取消提醒', icon: 'none' });
    };
    reminders.disableCampusDeadlineReminder(id).then(done).catch(done);
  },

  // 直接跳投递链接
  goApply(e) {
    e.stopPropagation && e.stopPropagation();
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    wx.setClipboardData({
      data: url,
      success: () => {
        wx.showModal({
          title: '投递链接已复制',
          content: '外部投递页面无法在小程序内直接打开，链接已复制到剪贴板，请在手机浏览器中粘贴打开。',
          showCancel: false,
          confirmText: '知道了',
        });
      },
    });
  },

  // logo 加载失败 → 清空 URL，让 wx:else 的文字占位符接管
  onLogoImgError(e) {
    const idx = e.currentTarget.dataset.index;
    if (idx !== undefined) {
      this.setData({ [`list[${idx}].companyLogo`]: '' });
    }
  }
});
