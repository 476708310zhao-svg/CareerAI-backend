// pages/messages/messages.js
const config  = require('../../utils/config.js');
const API_BASE = config.API_BASE_URL;

Page({
  data: {
    currentTab: 0,
    tabs: ['全部', '申请通知', '互动消息', '系统通知'],
    messages: [],
    filteredMessages: [],
    loading: false
  },

  onLoad() {
    this.loadMessages();
  },

  onShow() {
    this.loadMessages();
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

    wx.request({
      url: API_BASE + '/api/messages' + (type ? `?type=${type}` : ''),
      method: 'GET',
      header: { 'Authorization': 'Bearer ' + token },
      success: (res) => {
        this.setData({ loading: false });
        if (res.statusCode === 200 && res.data.code === 0) {
          const { list, unreadCount } = res.data.data;
          // 将后端字段映射为页面字段
          const messages = list.map(m => ({
            id: m.id, type: m.type,
            title: m.title, content: m.content,
            isRead: m.isRead, createdAt: this._formatTime(m.createdAt),
            icon: this._typeIcon(m.type)
          }));
          this.setData({ messages });
          this.filterMessages();
          this._syncTabBarBadge(unreadCount);
          wx.setStorageSync('unreadMessages', unreadCount);
          getApp().globalData.unreadCount = unreadCount;
        } else {
          this._loadLocalFallback();
        }
      },
      fail: () => {
        this.setData({ loading: false });
        this._loadLocalFallback();
      }
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
      this._syncTabBarBadge(unread);
      wx.setStorageSync('unreadMessages', unread);

      // 同步到后端
      const token = wx.getStorageSync('token');
      if (token) {
        wx.request({
          url: `${API_BASE}/api/messages/${msg.id}/read`,
          method: 'PUT',
          header: { 'Authorization': 'Bearer ' + token },
          fail: () => {}
        });
      }
    }

    // 根据类型跳转
    if (msg.type === 'application') {
      wx.navigateTo({ url: '/pages/applications/applications' });
    } else if (msg.type === 'interaction') {
      wx.switchTab({ url: '/pages/experiences/experiences' });
    }
  },

  // ─── 全部已读 ────────────────────────────────────────────────────────────────
  markAllRead() {
    const token = wx.getStorageSync('token');
    const messages = this.data.messages.map(m => ({ ...m, isRead: true }));
    this.setData({ messages });
    this.filterMessages();
    this._syncTabBarBadge(0);
    wx.setStorageSync('unreadMessages', 0);

    if (token) {
      wx.request({
        url: API_BASE + '/api/messages/read-all',
        method: 'PUT',
        header: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        fail: () => {}
      });
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
          wx.removeStorageSync('userMessages');
          wx.setStorageSync('unreadMessages', 0);
          this._syncTabBarBadge(0);
          wx.showToast({ title: '已清空', icon: 'success' });
        }
      }
    });
  },

  // ─── 工具方法 ────────────────────────────────────────────────────────────────
  _syncTabBarBadge(count) {
    if (count > 0) {
      wx.setTabBarBadge({ index: 4, text: count > 99 ? '99+' : String(count) });
    } else {
      wx.removeTabBarBadge({ index: 4 });
    }
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
