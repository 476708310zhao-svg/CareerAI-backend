const notebook = require('../../../utils/interview-notebook.js');

function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function statusLabel(status) {
  if (status === 'mastered') return '已掌握';
  if (status === 'unknown') return '不会';
  return '已保存';
}

function formatItem(item, dailyIds) {
  const status = item.status || 'saved';
  return Object.assign({}, item, {
    status,
    statusLabel: statusLabel(status),
    dateLabel: formatDate(item.updatedAt || item.createdAt || item.addedAt),
    inDailyPractice: dailyIds.has(String(item.id))
  });
}

Page({
  data: {
    items: [],
    dailyItems: [],
    filteredItems: [],
    activeTab: 'all',
    keyword: '',
    stats: {
      total: 0,
      unknown: 0,
      mastered: 0,
      daily: 0
    },
    tabs: [],
    showReference: false,
    referenceTitle: '',
    referenceAnswer: ''
  },

  onLoad(options = {}) {
    if (options.tab) this.setData({ activeTab: options.tab });
    this.loadNotebook();
  },

  onShow() {
    this.loadNotebook();
  },

  onPullDownRefresh() {
    this.loadNotebook();
    wx.stopPullDownRefresh();
  },

  loadNotebook() {
    this.renderNotebook(notebook.readList(), notebook.getDailyPractice());
    Promise.all([
      notebook.fetchRemoteNotebook(),
      notebook.fetchRemoteDailyPractice()
    ]).then(([items, daily]) => {
      this.renderNotebook(items, daily);
    });
  },

  renderNotebook(items, daily) {
    const dailyRaw = Array.isArray(daily) ? daily : notebook.getDailyPractice();
    const dailyIds = new Set(dailyRaw.map(item => String(item.id)));
    const source = (Array.isArray(items) ? items : notebook.readList()).map(item => formatItem(item, dailyIds));
    const sourceById = {};
    source.forEach(item => { sourceById[String(item.id)] = item; });
    const dailyItems = dailyRaw.map(item => formatItem(Object.assign({}, item, sourceById[String(item.id)] || {}), dailyIds));
    const stats = notebook.getStats();
    const tabs = [
      { code: 'all', label: '全部', count: stats.total },
      { code: 'daily', label: '每日练习', count: stats.daily },
      { code: 'unknown', label: '不会', count: stats.unknown },
      { code: 'mastered', label: '已掌握', count: stats.mastered }
    ];
    this.setData({ items: source, dailyItems, stats, tabs }, () => this.applyFilter());
  },

  applyFilter() {
    const tab = this.data.activeTab;
    const keyword = String(this.data.keyword || '').trim().toLowerCase();
    let list = tab === 'daily'
      ? this.data.dailyItems
      : this.data.items.filter(item => tab === 'all' || item.status === tab);
    if (keyword) {
      list = list.filter(item => {
        const haystack = [item.title, item.answer, item.category, item.difficulty].join(' ').toLowerCase();
        return haystack.includes(keyword);
      });
    }
    this.setData({ filteredItems: list });
  },

  setTab(e) {
    this.setData({ activeTab: e.currentTarget.dataset.tab || 'all' }, () => this.applyFilter());
  },

  onSearchInput(e) {
    this.setData({ keyword: e.detail.value || '' }, () => this.applyFilter());
  },

  clearSearch() {
    this.setData({ keyword: '' }, () => this.applyFilter());
  },

  findItem(id) {
    return this.data.items.concat(this.data.dailyItems).find(item => String(item.id) === String(id));
  },

  practice(e) {
    const item = this.findItem(e.currentTarget.dataset.id);
    if (!item) return;
    wx.navigateTo({
      url: '/package-ai/pages/interview-dialog/interview-dialog?autoQuestion=' + encodeURIComponent(item.title)
    });
  },

  markUnknown(e) {
    const item = this.findItem(e.currentTarget.dataset.id);
    if (!item) return;
    notebook.mark(item, 'unknown');
    this.loadNotebook();
    wx.showToast({ title: '已标记不会', icon: 'success' });
  },

  markMastered(e) {
    const item = this.findItem(e.currentTarget.dataset.id);
    if (!item) return;
    notebook.mark(item, 'mastered');
    this.loadNotebook();
    wx.showToast({ title: '已标记掌握', icon: 'success' });
  },

  addDaily(e) {
    const item = this.findItem(e.currentTarget.dataset.id);
    if (!item) return;
    notebook.addDailyPractice(item);
    this.loadNotebook();
    wx.showToast({ title: '已加入每日练习', icon: 'success' });
  },

  removeDaily(e) {
    const id = e.currentTarget.dataset.id;
    notebook.removeDailyPractice(id);
    this.loadNotebook();
    wx.showToast({ title: '已移出复习清单', icon: 'none' });
  },

  removeItem(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '移除错题',
      content: '移除后不会影响题库原题，确定移出错题本吗？',
      confirmText: '移除',
      confirmColor: '#DC2626',
      success: (res) => {
        if (!res.confirm) return;
        notebook.remove(id);
        notebook.removeDailyPractice(id);
        this.loadNotebook();
        wx.showToast({ title: '已移除', icon: 'none' });
      }
    });
  },

  showReference(e) {
    const item = this.findItem(e.currentTarget.dataset.id);
    if (!item) return;
    this.setData({
      showReference: true,
      referenceTitle: item.title,
      referenceAnswer: notebook.buildReferenceAnswer(item)
    });
  },

  closeReference() {
    this.setData({ showReference: false, referenceTitle: '', referenceAnswer: '' });
  },

  goQuestionBank() {
    wx.switchTab({ url: '/pages/experiences/experiences' });
  },

  goInterview() {
    wx.navigateTo({ url: '/package-ai/pages/interview-setup/interview-setup' });
  }
});
