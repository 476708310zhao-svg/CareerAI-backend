// pages/campus-detail/campus-detail.js
const api = require('../../../utils/api.js');
const favUtil = require('../../../utils/favorites.js');
const { logoByName } = require('../../../utils/logo.js');
const reminders = require('../../../utils/reminders.js');

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

const RELATED_PAGE_SIZE = 12;

function nonEmpty(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function splitPositions(text, fallback) {
  const raw = String(text || fallback || '').trim();
  if (!raw) return [];
  const items = raw
    .split(/[、,，/｜|;；\s]+/)
    .map(item => item.trim())
    .filter(Boolean);
  return Array.from(new Set(items)).slice(0, 8);
}

function formatLocations(locations, region) {
  if (Array.isArray(locations) && locations.length) return locations.join(' / ');
  return region || '全国';
}

function compactUrl(url) {
  const value = String(url || '');
  if (value.length <= 34) return value;
  return value.slice(0, 31) + '...';
}

function formatUpdateDate(createdAt) {
  const text = String(createdAt || '');
  const match = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return '近期更新';
  return match[2] + '-' + match[3] + '更新';
}

Page({
  data: {
    detail: null,
    relatedList: [],
    relatedAll: [],
    relatedCursor: 0,
    isFavorited: false,
    isSubscribed: false,
    subscribing: false,
    notifyReady: false,
    notifyTemplateId: '',
    reminderTitle: '保存校招关注',
    reminderSub: '微信提醒未配置，先保存到关注列表',
    reminderAction: '保存',
    loadFailed: false,
    loadErrorText: ''
  },

  onLoad(options) {
    const id = parseInt(options.id, 10);
    if (!id || id < 1) {
      this.setData({ loadFailed: true, loadErrorText: '缺少有效的校招信息 ID' });
      wx.showToast({ title: '参数错误', icon: 'none' });
      return;
    }
    this._campusId = id;
    this.loadDetail(id);
  },

  loadDetail(id) {
    this.setData({ detail: null, loadFailed: false, loadErrorText: '' });

    api.getCampusDetail(id).then(res => {
      if (!res || res.code !== 0 || !res.data || Array.isArray(res.data)) {
        this.applySnapshotOrFail(id, res && res._source === 'timeout' ? '加载超时，请重试' : '校招信息已更新，请返回校招日历重新打开');
        return;
      }
      this.applyDetail(res.data, id);
    }).catch(() => {
      this.applySnapshotOrFail(id, '网络异常，请返回校招日历重新打开');
    });
  },

  applyDetail(raw, id, options) {
    const d = this.normalizeDetail(raw || {});
    wx.setNavigationBarTitle({ title: d._headline || '校招详情' });
    const isSubscribed = reminders.isCampusReminderLocalEnabled(id);
    this.setData({
      detail: d,
      loadFailed: false,
      loadErrorText: '',
      isFavorited: favUtil.isFavorited('campus', String(id)),
      isSubscribed
    });
    this.refreshReminderCopy();
    this.loadNotifyTemplateState();
    this.refreshServerReminderState(id);
    if (!(options && options.skipRelated)) this.loadRelated(d);
  },

  readCampusSnapshot(id) {
    try {
      return wx.getStorageSync('campusDetailSnapshot_' + String(id)) || null;
    } catch (e) {
      return null;
    }
  },

  applySnapshotOrFail(id, message) {
    const snapshot = this.readCampusSnapshot(id);
    if (snapshot && (snapshot.company || snapshot.positionName || snapshot.positionType)) {
      const raw = Object.assign({ id, source: '本地缓存' }, snapshot);
      this.applyDetail(raw, id, { skipRelated: true });
      wx.showToast({ title: '已显示缓存信息', icon: 'none' });
      return;
    }
    this.setData({
      detail: null,
      loadFailed: true,
      loadErrorText: message || '校招信息加载失败，请返回校招日历重新打开'
    });
    wx.showToast({ title: '加载失败', icon: 'none' });
  },

  retryLoad() {
    if (this._campusId) this.loadDetail(this._campusId);
  },

  backToCampusList() {
    wx.switchTab({ url: '/pages/campus/campus' });
  },

  normalizeDetail(d) {
    const locations = Array.isArray(d.locations) ? d.locations : [];
    const locStr = formatLocations(locations, d.region);
    const positionText = d.positionName || d.positionType || '校招岗位';
    const positions = splitPositions(positionText, d.positionType);
    const viewCount = Number(d.viewCount || 0);
    const startText = d.startDate || '暂无';
    const deadlineText = d.deadlineDate || '暂无';
    const sourceText = d.source || '公开招聘信息';
    const isDeadlineUrgent = !d.deadlineDate || d.deadlineDate === '尽快投递' || d.deadlineWindow === 'urgent' || d.deadlineWindow === '7d';
    const educationText = d.educationLevel || '以公告为准';
    const overseasText = d.overseasFriendly ? '留学生友好' : '以公告为准';
    const visaText = d.visaTag || '以公告为准';
    const subtitleParts = [
      d.company,
      d.gradYear ? `${d.gradYear}届` : '',
      d.recruitType,
      d.industry,
      locStr
    ].filter(nonEmpty);
    const shareTitle = `${d.company || ''} ${d.gradYear || ''}届${d.recruitType || ''}${positionText}招聘`;
    const detailSections = [
      {
        title: '一、招聘概览',
        paragraphs: [
          `${d.company || '该企业'}正在开放${d.gradYear || ''}届${d.recruitType || '校招'}机会，岗位方向为${positionText}，工作地点覆盖${locStr}。`
        ]
      },
      {
        title: '二、面向对象',
        paragraphs: [
          `主要面向${d.gradYear || '目标'}届毕业生，学历标签为${educationText}，身份/签证信息为${overseasText}、${visaText}。具体专业和毕业时间以官方公告为准。`
        ]
      },
      {
        title: '三、投递节奏',
        paragraphs: [
          `网申开始：${startText}；网申截止：${deadlineText}。${isDeadlineUrgent ? '建议看到后优先确认官方页面并尽快提交。' : '建议在截止前预留简历修改和测评时间。'}`
        ]
      },
      {
        title: '四、招聘岗位',
        paragraphs: [
          positions.length ? positions.join('、') : positionText
        ]
      }
    ];

    return {
      ...d,
      companyLogo: d.companyLogo || logoByName(d.company),
      _companyInitial: String(d.company || '').slice(0, 2) || '--',
      _typeStyle: TYPE_COLOR[d.recruitType] || TYPE_COLOR['春招'],
      _testStyle: WRITTEN_COLOR[d.writtenTest] || WRITTEN_COLOR['需要笔试'],
      _locStr: locStr,
      _headline: positionText,
      _subtitle: subtitleParts.join(' · '),
      _shareTitle: shareTitle.trim(),
      _viewText: `${viewCount || 0} 人次浏览`,
      _attentionText: viewCount >= 600 ? '关注热度较高' : '适合加入关注',
      _rankText: d.isHot ? '入选热门校招' : (viewCount >= 600 ? '浏览热度较高' : '适合持续关注'),
      _heroTags: [d.recruitType, d.gradYear ? `${d.gradYear}届` : '', d.industry, educationText, d.overseasFriendly ? '留学生友好' : '', visaText].filter(nonEmpty).slice(0, 5),
      _quickFacts: [
        { label: '网申截止', value: deadlineText, tone: isDeadlineUrgent ? 'highlight' : '' },
        { label: '工作城市', value: locStr },
        { label: '招聘类型', value: d.recruitType || '校招' },
        { label: '笔试安排', value: d.writtenTest || '以公告为准' },
        { label: '学历标签', value: educationText },
        { label: '签证信息', value: visaText }
      ],
      _basicRows: [
        { label: '网申开始', value: startText, tone: d.startDate ? '' : 'muted' },
        { label: '网申截止', value: deadlineText, tone: isDeadlineUrgent ? 'urgent' : '' },
        { label: '城市', value: locStr },
        { label: '毕业时间要求', value: `${d.gradYear || '目标'}届毕业生` },
        { label: '学历要求', value: educationText },
        { label: '留学生友好', value: overseasText },
        { label: '签证/身份', value: visaText },
        { label: '笔试安排', value: d.writtenTest || '以公告为准' },
        { label: '行业方向', value: d.industry || '综合' }
      ],
      _positions: positions.length ? positions : [positionText],
      _detailSections: detailSections,
      _announceShort: compactUrl(d.announceUrl),
      _applyShort: compactUrl(d.applyUrl),
      _sourceText: sourceText
    };
  },

  loadRelated(detail) {
    api.getCampusList({
      positionType: detail.positionType || '',
      recruitType: detail.recruitType || '',
      page: 0,
      pageSize: RELATED_PAGE_SIZE,
      timeout: 5000
    }).then(res => {
      if (!this.data.detail || String(this.data.detail.id) !== String(detail.id)) return;
      const rawList = res && res.code === 0 && res.data
        ? (Array.isArray(res.data) ? res.data : (res.data.list || []))
        : [];
      const relatedAll = rawList
        .filter(item => String(item.id) !== String(detail.id))
        .map(item => this.normalizeRelated(item))
        .slice(0, 10);
      this.setData({ relatedAll, relatedCursor: 0 }, () => this.refreshRelated());
    }).catch(() => {
      if (!this.data.detail || String(this.data.detail.id) !== String(detail.id)) return;
      this.setData({ relatedAll: [], relatedList: [], relatedCursor: 0 });
    });
  },

  normalizeRelated(item) {
    const locations = Array.isArray(item.locations) ? item.locations : [];
    const locLabel = locations.length ? locations.slice(0, 2).join(' / ') : (item.region || '全国');
    return {
      ...item,
      companyLogo: item.companyLogo || logoByName(item.company),
      _companyInitial: String(item.company || '').slice(0, 2) || '--',
      _headline: item.positionName || item.positionType || '校招岗位',
      _subtitle: [item.company, item.gradYear ? `${item.gradYear}届` : '', item.recruitType].filter(nonEmpty).join(' · '),
      _tags: [item.recruitType, item.region, locLabel].filter(nonEmpty).slice(0, 3),
      _updatedText: formatUpdateDate(item.createdAt),
      _viewText: item.viewCount || 0,
      _heatText: Number(item.viewCount || 0) >= 600 ? '热度较高' : '近期可投'
    };
  },

  refreshRelated() {
    const all = this.data.relatedAll || [];
    if (!all.length) {
      this.setData({ relatedList: [] });
      return;
    }
    const start = this.data.relatedCursor % all.length;
    const doubled = all.concat(all);
    const relatedList = doubled.slice(start, start + Math.min(5, all.length));
    this.setData({ relatedList });
  },

  changeRelated() {
    const all = this.data.relatedAll || [];
    if (all.length <= 1) return;
    this.setData({ relatedCursor: (this.data.relatedCursor + 5) % all.length }, () => this.refreshRelated());
  },

  loadNotifyTemplateState() {
    api.getNotifyTemplates().then(res => {
      if (!this.data.detail) return;
      const tplId = res && res.data && res.data.system_notice;
      this.setData({ notifyReady: !!tplId, notifyTemplateId: tplId || '' }, () => this.refreshReminderCopy());
    }).catch(() => {
      if (!this.data.detail) return;
      this.setData({ notifyReady: false, notifyTemplateId: '' }, () => this.refreshReminderCopy());
    });
  },

  refreshServerReminderState(id) {
    reminders.fetchReminders({
      sourceType: reminders.CAMPUS_SOURCE_TYPE,
      reminderType: reminders.CAMPUS_DEADLINE_TYPE,
      targetId: String(id)
    }).then(rows => {
      const row = (rows || []).find(item => item && item.enabled && String(item.targetId) === String(id));
      if (!row || !this.data.detail) return;
      reminders.saveCampusReminderLocal(this.data.detail, row);
      this.setData({ isSubscribed: true }, () => this.refreshReminderCopy());
    });
  },

  refreshReminderCopy() {
    const { detail, isSubscribed, subscribing, notifyReady } = this.data;
    const payload = detail ? reminders.buildCampusDeadlineReminder(detail) : {};
    const hasDate = !!payload.reminderDate;
    let reminderTitle = hasDate ? (notifyReady ? '订阅截止提醒' : '保存截止提醒') : '保存校招关注';
    let reminderSub = hasDate ? '截止前7/3/1天和当天提醒' : '截止日期待确认，先加入关注列表';
    let reminderAction = subscribing ? '处理中...' : (hasDate ? '设置提醒' : '关注');

    if (isSubscribed) {
      reminderTitle = hasDate ? '已设置截止提醒' : '已关注校招';
      reminderSub = hasDate ? '截止前7/3/1天和当天将提醒你' : '已保存到关注列表';
      reminderAction = '已设置';
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

  copyAnnounceUrl() {
    const url = this.data.detail && this.data.detail.announceUrl;
    if (!url) return;
    wx.setClipboardData({
      data: url,
      success: () => wx.showToast({ title: '公告链接已复制', icon: 'success' })
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
    if (!detail || this.data.subscribing) return;
    if (this.data.isSubscribed) {
      wx.showActionSheet({
        itemList: ['取消截止提醒'],
        success: ({ tapIndex }) => {
          if (tapIndex === 0) this.cancelReminder();
        },
        fail: () => {}
      });
      return;
    }
    const payload = reminders.buildCampusDeadlineReminder(detail);

    const saveLocalReminder = (message, record) => {
      const saved = record && (record.data || record);
      reminders.saveCampusReminderLocal(detail, saved || payload);
      this.setData({ isSubscribed: true, subscribing: false }, () => this.refreshReminderCopy());
      wx.showToast({ title: message || '已保存关注', icon: 'success' });
    };

    this.setData({ subscribing: true }, () => this.refreshReminderCopy());
    reminders.upsertCampusDeadlineReminder(detail, { withSubscribe: true })
      .then(record => saveLocalReminder(payload.reminderDate ? '已设置截止提醒' : '已关注校招', record))
      .catch(() => saveLocalReminder('已保存到本地'));
  },

  cancelReminder() {
    const detail = this.data.detail;
    if (!detail || this.data.subscribing) return;
    this.setData({ subscribing: true }, () => this.refreshReminderCopy());
    const done = () => {
      reminders.removeCampusReminderLocal(detail.id);
      this.setData({ isSubscribed: false, subscribing: false }, () => this.refreshReminderCopy());
      wx.showToast({ title: '已取消提醒', icon: 'none' });
    };
    reminders.disableCampusDeadlineReminder(detail.id).then(done).catch(done);
  },

  goRelated(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.redirectTo({ url: `/package-content/pages/campus-detail/campus-detail?id=${id}` });
  },

  onLogoError() {
    this.setData({ 'detail.companyLogo': '' });
  },

  onRelatedLogoError(e) {
    const index = e.currentTarget.dataset.index;
    if (index !== undefined) this.setData({ [`relatedList[${index}].companyLogo`]: '' });
  },

  onShareAppMessage() {
    const detail = this.data.detail || {};
    return {
      title: detail._shareTitle || `${detail.company || '校招机会'} · 职引`,
      path: `/package-content/pages/campus-detail/campus-detail?id=${detail.id || ''}`
    };
  }
});
