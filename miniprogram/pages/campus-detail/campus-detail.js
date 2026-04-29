// pages/campus-detail/campus-detail.js
const api = require('../../utils/api.js');
const favUtil = require('../../utils/favorites.js');

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
  data: { detail: null, isFavorited: false, isSubscribed: false, subscribing: false },

  onLoad(options) {
    const id = parseInt(options.id, 10);
    if (!id || id < 1) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      return;
    }
    api.getCampusDetail(id).then(res => {
      if (res && res.data) {
        const d = res.data;
        wx.setNavigationBarTitle({ title: d.company + ' · 校招详情' });
        const isSubscribed = !!wx.getStorageSync('campus_sub_' + id);
        this.setData({
          detail: {
            ...d,
            _typeStyle:   TYPE_COLOR[d.recruitType]   || TYPE_COLOR['春招'],
            _testStyle:   WRITTEN_COLOR[d.writtenTest] || WRITTEN_COLOR['需要笔试'],
            _locStr: (d.locations || []).join(' / ') || '全国',
          },
          isFavorited: favUtil.isFavorited('campus', String(id)),
          isSubscribed
        });
      }
    }).catch(() => {
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
  },

  goApply() {
    const url = this.data.detail && this.data.detail.applyUrl;
    if (!url) { wx.showToast({ title: '暂无投递链接', icon: 'none' }); return; }
    wx.navigateTo({ url: `/pages/webview/webview?url=${encodeURIComponent(url)}` });
  },

  copyApplyUrl() {
    const url = this.data.detail && this.data.detail.applyUrl;
    if (!url) return;
    wx.setClipboardData({ data: url, success: () => wx.showToast({ title: '链接已复制', icon: 'success' }) });
  },

  toggleFavorite() {
    const detail = this.data.detail;
    if (!detail) return;
    const isFavorited = favUtil.toggle('campus', {
      targetId: String(detail.id),
      title: detail.company,
      subtitle: detail.positionName || detail.positionType
    });
    this.setData({ isFavorited });
    wx.showToast({ title: isFavorited ? '已收藏' : '已取消收藏', icon: 'none' });
  },

  // 订阅截止提醒
  subscribeReminder() {
    const detail = this.data.detail;
    if (!detail || this.data.isSubscribed || this.data.subscribing) return;

    const doSubscribe = () => {
      this.setData({ subscribing: true });
      api.subscribeCampusReminder(detail.id, detail.company, detail.deadlineDate, detail.positionName || detail.positionType)
        .then(() => {
          wx.setStorageSync('campus_sub_' + detail.id, 1);
          this.setData({ isSubscribed: true, subscribing: false });
          wx.showToast({ title: '已订阅截止提醒', icon: 'success' });
        })
        .catch(() => {
          this.setData({ subscribing: false });
          // 即使后端失败，本地标记已订阅
          wx.setStorageSync('campus_sub_' + detail.id, 1);
          this.setData({ isSubscribed: true });
          wx.showToast({ title: '已设置本地提醒', icon: 'success' });
        });
    };

    // 尝试请求微信订阅消息授权
    api.getNotifyTemplates().then(res => {
      const tplId = res && res.data && res.data.system_notice;
      if (tplId) {
        wx.requestSubscribeMessage({
          tmplIds: [tplId],
          complete: () => doSubscribe()  // 不管用户是否同意，都继续
        });
      } else {
        doSubscribe();
      }
    }).catch(() => doSubscribe());
  }
});
