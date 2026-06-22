// pages/campus-detail/campus-detail.js
const api = require('../../../utils/api.js');
const favUtil = require('../../../utils/favorites.js');

const TYPE_COLOR = {
  '春招': { bg: '#EEF2FF', color: '#4F46E5', border: '#C7D2FE' },
  '秋招': { bg: '#FFF7ED', color: '#C2410C', border: '#FED7AA' },
  '暑期实习': { bg: '#F0FDF4', color: '#15803D', border: '#86EFAC' },
};
const WRITTEN_COLOR = {
  '仅测评': { bg: '#ECFDF5', color: '#059669' },
  '含免笔试': { bg: '#EFF6FF', color: '#2563EB' },
  '需要笔试': { bg: '#FEF3C7', color: '#D97706' },
};

Page({
  data: {
    detail: null,
    isFavorited: false,
    isSubscribed: false,
    subscribing: false,
    notifyReady: false,
    notifyTemplateId: '',
    reminderTitle: '保存校招关注',
    reminderSub: '微信提醒未配置，先保存到关注列表',
    reminderAction: '保存'
  },

  onLoad(options) {
    const id = parseInt(options.id, 10);
    if (!id || id < 1) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      return;
    }

    api.getCampusDetail(id).then(res => {
      if (!res || !res.data) return;
      const d = res.data;
      wx.setNavigationBarTitle({ title: d.company + ' · 校招详情' });
      const isSubscribed = !!wx.getStorageSync('campus_sub_' + id);
      this.setData({
        detail: {
          ...d,
          _companyInitial: String(d.company || '').slice(0, 2) || '--',
          _typeStyle: TYPE_COLOR[d.recruitType] || TYPE_COLOR['春招'],
          _testStyle: WRITTEN_COLOR[d.writtenTest] || WRITTEN_COLOR['需要笔试'],
          _locStr: (d.locations || []).join(' / ') || '全国',
        },
        isFavorited: favUtil.isFavorited('campus', String(id)),
        isSubscribed
      });
      this.refreshReminderCopy();
      this.loadNotifyTemplateState();
    }).catch(() => {
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
  },

  loadNotifyTemplateState() {
    api.getNotifyTemplates().then(res => {
      const tplId = res && res.data && res.data.system_notice;
      this.setData({ notifyReady: !!tplId, notifyTemplateId: tplId || '' }, () => this.refreshReminderCopy());
    }).catch(() => {
      this.setData({ notifyReady: false, notifyTemplateId: '' }, () => this.refreshReminderCopy());
    });
  },

  refreshReminderCopy() {
    const { isSubscribed, subscribing, notifyReady } = this.data;
    let reminderTitle = notifyReady ? '订阅截止日期提醒' : '保存校招关注';
    let reminderSub = notifyReady ? '截止前7天 · 截止当天 · 岗位更新' : '微信提醒未配置，先保存到关注列表';
    let reminderAction = subscribing ? '处理中...' : (notifyReady ? '订阅' : '保存');

    if (isSubscribed) {
      reminderTitle = notifyReady ? '已订阅截止提醒' : '已保存关注';
      reminderSub = notifyReady ? '截止前7天和当天将提醒你' : '已保存到站内/本地记录';
      reminderAction = notifyReady ? '已订阅' : '已保存';
    }

    this.setData({ reminderTitle, reminderSub, reminderAction });
  },

  goApply() {
    const url = this.data.detail && this.data.detail.applyUrl;
    if (!url) {
      wx.showToast({ title: '暂无投递链接', icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: url,
      success: () => {
        wx.showModal({
          title: '投递链接已复制',
          content: '外部投递页面暂不在小程序内打开。请在手机浏览器中粘贴链接继续申请。',
          showCancel: false,
          confirmText: '知道了',
        });
      },
    });
  },

  copyApplyUrl() {
    const url = this.data.detail && this.data.detail.applyUrl;
    if (!url) return;
    wx.setClipboardData({
      data: url,
      success: () => wx.showToast({ title: '链接已复制', icon: 'success' })
    });
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

  subscribeReminder() {
    const detail = this.data.detail;
    if (!detail || this.data.isSubscribed || this.data.subscribing) return;

    const saveLocalReminder = (message) => {
      wx.setStorageSync('campus_sub_' + detail.id, 1);
      this.setData({ isSubscribed: true, subscribing: false }, () => this.refreshReminderCopy());
      wx.showToast({ title: message || '已保存关注', icon: 'success' });
    };

    const doSubscribe = (localOnly) => {
      this.setData({ subscribing: true }, () => this.refreshReminderCopy());
      api.subscribeCampusReminder(detail.id, detail.company, detail.deadlineDate, detail.positionName || detail.positionType)
        .then(() => saveLocalReminder(localOnly ? '已保存到站内提醒' : '已订阅提醒'))
        .catch(() => saveLocalReminder('已保存到本地'));
    };

    const tplId = this.data.notifyTemplateId;
    if (!tplId) {
      doSubscribe(true);
      return;
    }

    wx.requestSubscribeMessage({
      tmplIds: [tplId],
      complete: () => doSubscribe(false)
    });
  }
});
