function getResultPayload(data) {
  const result = data && data.result ? data.result : {};
  return {
    structuredContent: result.structuredContent || {},
    meta: result._meta || {}
  };
}

const MARKET_NAMES = { us: '美国', gb: '英国', cn: '中国内地', hk: '香港', ca: '加拿大',
  au: '澳大利亚', sg: '新加坡', jp: '日本', de: '德国', fr: '法国' };
const SOURCE_NAMES = { jsearch: 'JSearch', adzuna: 'Adzuna', hk_csb: '香港政府',
  cn_official: '企业官网', remoteok: 'RemoteOK', themuse: 'The Muse' };

function coverageLabel(coverage) {
  if (!coverage || coverage.mode !== 'sampled' || !Array.isArray(coverage.countries)) return '';
  return '本次全球抽样：' + coverage.countries.map(code => MARKET_NAMES[code] || code).join('、');
}

function sourceSummary(statuses) {
  if (!Array.isArray(statuses) || !statuses.length) return '';
  return '岗位来源：' + statuses.map(item => {
    const label = SOURCE_NAMES[item.source] || item.source;
    const region = item.country === 'global' ? '' : `·${MARKET_NAMES[item.country] || item.country}`;
    const result = item.reason === 'not_configured' ? '未配置'
      : item.status === 'unavailable' ? '暂不可用' : `${Number(item.count) || 0} 条`;
    return `${label}${region} ${result}${item.partialFailures ? `（${item.partialFailures} 家暂不可用）` : ''}`;
  }).join('；');
}

Component({
  properties: {
    jobs: { type: Array, value: [] },
    total: { type: Number, value: 0 },
    hasMore: { type: Boolean, value: false },
    query: { type: Object, value: {} }
  },

  data: {
    jobs: [],
    total: 0,
    hasMore: false,
    query: {},
    sourceUnavailable: false,
    emptyMessage: '', coverageLabel: '', partialLabel: '', sourceSummary: ''
  },

  lifetimes: {
    created() {
      if (typeof wx === 'undefined' || !wx.modelContext) return;
      this._modelCtx = wx.modelContext.getContext(this);
      this._viewCtx = wx.modelContext.getViewContext(this);
      const { NotificationType } = wx.modelContext;

      this._modelCtx.on(NotificationType.Result, (data) => {
        const { structuredContent, meta } = getResultPayload(data);
        const jobs = meta.jobs || structuredContent.jobs || [];
        const query = structuredContent.query || {};
        const sourceStatus = structuredContent.sourceStatus || meta.sourceStatus || [];
        this.setData({
          jobs,
          query,
          total: structuredContent.total || meta.total || jobs.length,
          hasMore: !!(structuredContent.hasMore || meta.hasMore),
          sourceUnavailable: !!(structuredContent.sourceUnavailable || meta.sourceUnavailable),
          emptyMessage: structuredContent.emptyMessage || meta.emptyMessage || '',
          coverageLabel: coverageLabel(structuredContent.coverage || meta.coverage),
          sourceSummary: sourceSummary(sourceStatus),
          partialLabel: sourceStatus.some(item => item.status === 'unavailable')
            ? '部分岗位来源暂不可用，结果可能不完整' : ''
        });
      });
    }
  },

  methods: {
    onViewAll() {
      if (typeof wx === 'undefined' || !wx.switchTab) return;
      const query = this.data.query || {};
      try {
        wx.setStorageSync('jobSearchSkillPendingQuery', {
          keyword: String(query.keyword || '').slice(0, 120),
          country: String(query.country || 'global'),
          jobType: String(query.jobType || ''),
          updatedWithinDays: Number(query.updatedWithinDays) || 0,
          createdAt: Date.now()
        });
      } catch (error) {}
      wx.switchTab({ url: '/pages/jobs/jobs' });
    },
    sendDetailMessage(jobId) {
      if (!this._modelCtx || !jobId) return false;
      this._modelCtx.sendFollowUpMessage({
        content: [
          { type: 'text', text: '查看职位详情' },
          {
            type: 'api/call',
            data: {
              name: 'getJobDetail',
              arguments: { jobId }
            }
          }
        ]
      });
      return true;
    },

    onJobTap(e) {
      const jobId = e.currentTarget.dataset.id;
      if (!this.sendDetailMessage(jobId) && typeof wx !== 'undefined' && wx.showToast) {
        wx.showToast({ title: '请在对话中继续查看详情', icon: 'none' });
      }
    }
  }
});
