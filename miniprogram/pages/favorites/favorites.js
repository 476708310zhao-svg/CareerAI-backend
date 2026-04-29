// pages/favorites/favorites.js
const favUtil = require('../../utils/favorites.js');
const TAB_KEYS = ['job', 'experience', 'company', 'agency', 'campus'];

Page({
  data: {
    currentTab: 0,
    tabs: ['职位', '面经', '公司', '机构', '校招'],
    favorites: { job: [], experience: [], company: [], agency: [], campus: [] },
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
    this.setData({ favorites }, () => {
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
    this.setData({ currentList: list, allSelected });
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
  }
});
