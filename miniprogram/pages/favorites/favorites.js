// pages/favorites/favorites.js
const favUtil = require('../../utils/favorites.js');
const TAB_KEYS = ['job', 'experience', 'company', 'agency', 'campus'];

Page({
  data: {
    currentTab: 0,
    tabs: ['职位', '面经', '公司', '机构', '校招'],
    favorites: { job: [], experience: [], company: [], agency: [], campus: [] },
    totalFavorites: 0,
    currentEmpty: {},
    emptyStates: [
      { emoji: '📌', title: '还没有收藏的职位', desc: '看到心动岗位时点一下收藏，之后可以在这里集中对比和投递。', btn: '去浏览职位', action: 'jobs' },
      { emoji: '📖', title: '还没有收藏的面经', desc: '收藏高价值面经，面试前可以快速回看重点问题和经验。', btn: '去浏览面经', action: 'experiences' },
      { emoji: '🏢', title: '还没有收藏的公司', desc: '把目标公司先收进来，方便后续比较岗位、地点和投递节奏。', btn: '去浏览公司', action: 'companies' },
      { emoji: '🧭', title: '还没有收藏的机构', desc: '收藏感兴趣的求职机构，后续可以统一筛选和对比服务。', btn: '去浏览机构', action: 'agencies' },
      { emoji: '🗓️', title: '还没有收藏的校招', desc: '收藏关键校招日程，避免错过网申、笔试和面试节点。', btn: '去看校招', action: 'campus' }
    ],
    currentList: [],   // 当前 tab 经排序后的列表
    sortOrder: 'desc', // 'desc' 最新 | 'asc' 最早
    batchMode: false,
    selectedIds: [],
    allSelected: false
  },

  onShow() {
    this.loadFavorites();
  },

  loadFavorites() {
    const favorites = favUtil.getAll();
    const totalFavorites = TAB_KEYS.reduce((sum, key) => sum + (favorites[key] || []).length, 0);
    this.setData({ favorites, totalFavorites }, () => {
      this._refreshList();
    });
  },

  // 根据当前 tab + 排序刷新 currentList
  _refreshList() {
    const typeKey = TAB_KEYS[this.data.currentTab];
    let list = (this.data.favorites[typeKey] || []).slice();

    // 按收藏时间排序
    list.sort((a, b) => {
      const ta = new Date(a.createdAt || 0).getTime();
      const tb = new Date(b.createdAt || 0).getTime();
      return this.data.sortOrder === 'desc' ? tb - ta : ta - tb;
    });

    const allSelected = list.length > 0 && list.every(i => this.data.selectedIds.includes(i.targetId));
    this.setData({
      currentList: list,
      allSelected,
      currentEmpty: this.data.emptyStates[this.data.currentTab] || this.data.emptyStates[0]
    });
  },

  switchTab(e) {
    this.setData({
      currentTab: e.currentTarget.dataset.index,
      batchMode: false,
      selectedIds: []
    }, () => {
      this._refreshList();
    });
  },

  setSortOrder(e) {
    const order = e.currentTarget.dataset.order;
    if (order === this.data.sortOrder) return;
    this.setData({ sortOrder: order }, () => {
      this._refreshList();
    });
  },

  // ── 批量删除 ──
  toggleBatchMode() {
    this.setData({ batchMode: !this.data.batchMode, selectedIds: [], allSelected: false });
  },

  toggleSelect(e) {
    const id = e.currentTarget.dataset.targetid;
    let selected = this.data.selectedIds.slice();
    const idx = selected.indexOf(id);
    if (idx >= 0) {
      selected.splice(idx, 1);
    } else {
      selected.push(id);
    }
    const allSelected = this.data.currentList.length > 0 &&
      this.data.currentList.every(i => selected.includes(i.targetId));
    this.setData({ selectedIds: selected, allSelected });
  },

  toggleSelectAll() {
    if (this.data.allSelected) {
      this.setData({ selectedIds: [], allSelected: false });
    } else {
      const allIds = this.data.currentList.map(i => i.targetId);
      this.setData({ selectedIds: allIds, allSelected: true });
    }
  },

  batchDelete() {
    if (this.data.selectedIds.length === 0) {
      wx.showToast({ title: '请先选择要删除的项', icon: 'none' });
      return;
    }
    wx.showModal({
      title: `确认删除 ${this.data.selectedIds.length} 项？`,
      content: '删除后无法恢复',
      success: (res) => {
        if (!res.confirm) return;
        const typeKey = TAB_KEYS[this.data.currentTab];
        this.data.selectedIds.forEach(id => favUtil.remove(typeKey, id));
        this.setData({ batchMode: false, selectedIds: [], allSelected: false });
        this.loadFavorites();
        wx.showToast({ title: '已删除', icon: 'success' });
      }
    });
  },

  // ── 单项取消收藏 ──
  removeFavorite(e) {
    const { type, targetid } = e.currentTarget.dataset;
    wx.showModal({
      title: '确认取消收藏？',
      success: (res) => {
        if (res.confirm) {
          favUtil.remove(type, targetid);
          this.loadFavorites();
          wx.showToast({ title: '已取消收藏', icon: 'none' });
        }
      }
    });
  },

  // ── 跳转详情 ──
  goToDetail(e) {
    const item = e.currentTarget.dataset.item;
    const typeKey = TAB_KEYS[this.data.currentTab];
    if (typeKey === 'job') {
      wx.navigateTo({ url: `/pages/job-detail/job-detail?id=${item.targetId}` });
    } else if (typeKey === 'experience') {
      wx.navigateTo({ url: `/pages/experience-detail/experience-detail?id=${item.targetId}` });
    } else if (typeKey === 'company') {
      wx.navigateTo({ url: `/pages/company-detail/company-detail?id=${item.targetId}` });
    } else if (typeKey === 'agency') {
      wx.navigateTo({ url: `/pages/agency-detail/agency-detail?id=${item.targetId}` });
    } else {
      wx.navigateTo({ url: `/pages/campus-detail/campus-detail?id=${item.targetId}` });
    }
  },

  // ── 空状态 CTA ──
  goToJobs() {
    wx.switchTab({ url: '/pages/jobs/jobs' });
  },

  goToExperiences() {
    wx.switchTab({ url: '/pages/experiences/experiences' });
  },

  browseCurrent() {
    const action = this.data.currentEmpty.action;
    if (action === 'experiences') {
      this.goToExperiences();
      return;
    }
    if (action === 'companies') {
      wx.navigateTo({ url: '/pages/companies/companies' });
      return;
    }
    if (action === 'agencies') {
      wx.navigateTo({ url: '/pages/agencies/agencies' });
      return;
    }
    if (action === 'campus') {
      wx.navigateTo({ url: '/pages/campus/campus' });
      return;
    }
    this.goToJobs();
  }
});
