// pages/messages/messages.js
const { getMessages, markMessageRead, markAllMessagesRead } = require('../../../utils/api-messages.js');

Page({
  data: {
    currentTab: 0,
    tabs: ['全部', '申请通知', '互动消息', '系统通知'],
    tabCounts: [0, 0, 0, 0],
    unreadTotal: 0,
    messages: [],
    filteredMessages: [],
    loading: false,
    quickActions: [
      { title: '查看网申进度', desc: '跟进待初筛、面试中、Offer 状态', type: 'applications' },
      { title: '开始 AI 面试', desc: '生成练习记录和能力反馈', type: 'interview' }
    ]
  },

  onLoad() {
    this._didInitialShow = false;
    this.loadMessages();
  },

  onShow() {
    if (!this._didInitialShow) {
      this._didInitialShow = true;
      return;
    }
    clearTimeout(this._refreshTimer);
    this._refreshTimer = setTimeout(() => this.loadMessages(), 120);
  },

  onUnload() {
    clearTimeout(this._refreshTimer);
  },

  // ─── 从后端拉取消息 ──────────────────────────────────────────────────────────
  loadMessages() {
    const token = wx.getStorageSync('token');
    if (!token) {
      // 未登录：生成本地消息兜底
      this._loadLocalFallback();
      return;
    }

    this.setData({ loading: true });
    const { type } = this._currentType();

    getMessages(type)
      .then((res) => {
        this.setData({ loading: false });
        if (res && res.code === 0) {
          const { list, unreadCount } = res.data;
          // 将后端字段映射为页面字段
          const messages = list.map(m => ({
            id: m.id, type: m.type,
            title: m.title, content: m.content,
            isRead: m.isRead, createdAt: this._formatTime(m.createdAt),
            icon: this._typeIcon(m.type)
          }));
          this.setData({ messages });
          this.filterMessages();
          this.updateMessageStats(messages);
          this._syncTabBarBadge(unreadCount);
          wx.setStorageSync('unreadMessages', unreadCount);
          getApp().globalData.unreadCount = unreadCount;
        } else {
          this._loadLocalFallback();
        }
      })
      .catch(() => {
        this.setData({ loading: false });
        this._loadLocalFallback();
      });
  },

  // 降级：未登录或网络失败时读本地 Storage
  _loadLocalFallback() {
    const messages = (wx.getStorageSync('userMessages') || []).map(m => ({
      ...m, icon: m.icon || this._typeIcon(m.type)
    }));
    messages.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    this.setData({ messages, loading: false });
    this.filterMessages();
    const unread = messages.filter(m => !m.isRead).length;
    this.updateMessageStats(messages);
    this._syncTabBarBadge(unread);
  },

  // ─── Tab 与筛选 ──────────────────────────────────────────────────────────────
  _currentType() {
    const typeMap = ['', 'application', 'interaction', 'system'];
    return { type: typeMap[this.data.currentTab] };
  },

  filterMessages() {
    const { type } = this._currentType();
    const filtered = type
      ? this.data.messages.filter(m => m.type === type)
      : this.data.messages;
    this.setData({ filteredMessages: filtered });
  },

  updateMessageStats(messages) {
    const counts = [
      messages.length,
      messages.filter(m => m.type === 'application').length,
      messages.filter(m => m.type === 'interaction').length,
      messages.filter(m => m.type === 'system').length
    ];
    this.setData({
      tabCounts: counts,
      unreadTotal: messages.filter(m => !m.isRead).length
    });
  },

  switchTab(e) {
    this.setData({ currentTab: e.currentTarget.dataset.index });
    this.loadMessages();
  },

  // ─── 点击消息：标记已读 + 跳转 ──────────────────────────────────────────────
  tapMessage(e) {
    const msg = this.data.filteredMessages[e.currentTarget.dataset.index];
    if (!msg) return;

    if (!msg.isRead) {
      // 乐观更新 UI
      const messages = this.data.messages.map(m => m.id === msg.id ? { ...m, isRead: true } : m);
      this.setData({ messages });
      this.filterMessages();
      const unread = messages.filter(m => !m.isRead).length;
      this.updateMessageStats(messages);
      this._syncTabBarBadge(unread);
      wx.setStorageSync('unreadMessages', unread);

      // 同步到后端
      const token = wx.getStorageSync('token');
      if (token) {
        markMessageRead(msg.id).catch(() => {});
      }
    }

    // 根据类型跳转
    if (msg.type === 'application') {
      wx.switchTab({ url: '/pages/applications/applications' });
    } else if (msg.type === 'interaction') {
      wx.navigateTo({ url: '/pages/experiences/experiences' });
    }
  },

  // ─── 全部已读 ────────────────────────────────────────────────────────────────
  markAllRead() {
    const token = wx.getStorageSync('token');
    const messages = this.data.messages.map(m => ({ ...m, isRead: true }));
    this.setData({ messages });
    this.filterMessages();
    this.updateMessageStats(messages);
    this._syncTabBarBadge(0);
    wx.setStorageSync('unreadMessages', 0);

    if (token) {
      markAllMessagesRead().catch(() => {});
    }
    wx.showToast({ title: '已全部标记已读', icon: 'none' });
  },

  // ─── 清空消息（仅清本地显示，不删后端数据）──────────────────────────────────
  clearMessages() {
    wx.showModal({
      title: '清空消息',
      content: '确定要清空所有消息吗？',
      success: (res) => {
        if (res.confirm) {
          this.setData({ messages: [], filteredMessages: [] });
          this.updateMessageStats([]);
          wx.removeStorageSync('userMessages');
          wx.setStorageSync('unreadMessages', 0);
          this._syncTabBarBadge(0);
          wx.showToast({ title: '已清空', icon: 'success' });
        }
      }
    });
  },

  goApplications() {
    wx.switchTab({ url: '/pages/applications/applications' });
  },

  goInterview() {
    wx.navigateTo({ url: '/package-ai/pages/interview-setup/interview-setup' });
  },

  handleQuickAction(e) {
    const type = e.currentTarget.dataset.type;
    if (type === 'applications') {
      this.goApplications();
    } else if (type === 'interview') {
      this.goInterview();
    }
  },

  // ─── 工具方法 ────────────────────────────────────────────────────────────────
  _syncTabBarBadge(count) {
    getApp().setUnreadCount(count);
  },

  _typeIcon(type) {
    const map = {
      application: '/images/application.png',
      interaction: '/images/experience-active.png',
      system:      '/images/home-active.png'
    };
    return map[type] || '/images/home-active.png';
  },

  _formatTime(str) {
    if (!str) return '';
    try {
      const d = new Date(str);
      const now = new Date();
      const diff = now - d;
      if (diff < 60000)      return '刚刚';
      if (diff < 3600000)    return Math.floor(diff / 60000) + '分钟前';
      if (diff < 86400000)   return Math.floor(diff / 3600000) + '小时前';
      if (diff < 604800000)  return Math.floor(diff / 86400000) + '天前';
      return str.slice(0, 10);
    } catch(e) { return str; }
  }
});
