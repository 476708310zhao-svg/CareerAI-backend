// pages/messages/messages.js
const { getMessages, markMessageRead, markAllMessagesRead } = require('../../../utils/api-messages.js');
const unreadMessages = require('../../../utils/unread-messages.js');

Page({
  data: {
    currentTab: 0,
    tabs: ['全部', '申请通知', '互动消息', '系统通知'],
    tabCounts: [0, 0, 0, 0],
    unreadTotal: 0,
    messages: [],
    filteredMessages: [],
    loading: false,
    syncError: false,
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
    // 一次读取全部消息，分类只在本页筛选；总数与未读数始终代表全部消息。
    getMessages()
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
          this.setData({ messages, syncError: false });
          this.filterMessages();
          this.updateMessageStats(messages);
          this._syncTabBarBadge(unreadCount);
          unreadMessages.set(unreadCount);
          getApp().globalData.unreadCount = unreadCount;
        } else {
          this._loadLocalFallback(true);
        }
      })
      .catch(() => {
        this.setData({ loading: false });
        this._loadLocalFallback(true);
      });
  },

  // 未登录可读本机旧消息；登录态同步失败时不展示未绑定账号的旧记录。
  _loadLocalFallback(syncError = false) {
    // 登录态同步失败时不能展示未绑定账号的旧本机消息。
    const messages = (syncError ? [] : (wx.getStorageSync('userMessages') || [])).map(m => ({
      ...m, icon: m.icon || this._typeIcon(m.type)
    }));
    messages.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    this.setData({ messages, loading: false, syncError });
    this.filterMessages();
    const unread = messages.filter(m => !m.isRead).length;
    this.updateMessageStats(messages);
    if (!syncError) this._syncTabBarBadge(unread);
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
    this.setData({ currentTab: Number(e.currentTarget.dataset.index) }, () => this.filterMessages());
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
      unreadMessages.set(unread);

      // 同步到后端
      const token = wx.getStorageSync('token');
      if (token) {
        markMessageRead(msg.id).catch(() => {});
      } else {
        wx.setStorageSync('userMessages', messages);
      }
    }

    // 根据类型跳转
    if (msg.type === 'application') {
      wx.navigateTo({ url: '/pages/applications/applications' });
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
    unreadMessages.set(0);

    if (token) {
      markAllMessagesRead().catch(() => {});
    } else {
      wx.setStorageSync('userMessages', messages);
    }
    wx.showToast({ title: '已全部标记已读', icon: 'none' });
  },

  goApplications() {
    wx.navigateTo({ url: '/pages/applications/applications' });
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
