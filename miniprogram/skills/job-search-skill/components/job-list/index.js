function getResultPayload(data) {
  const result = data && data.result ? data.result : {};
  return {
    structuredContent: result.structuredContent || {},
    meta: result._meta || {}
  };
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
    query: {}
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
        this.setData({
          jobs,
          query,
          total: structuredContent.total || meta.total || jobs.length,
          hasMore: !!(structuredContent.hasMore || meta.hasMore)
        });
      });
    }
  },

  methods: {
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
