function getResultPayload(data) {
  const result = data && data.result ? data.result : {};
  return {
    structuredContent: result.structuredContent || {},
    meta: result._meta || {}
  };
}

Component({
  properties: {
    job: { type: Object, value: null }
  },

  data: {
    job: null
  },

  lifetimes: {
    created() {
      if (typeof wx === 'undefined' || !wx.modelContext) return;
      this._viewCtx = wx.modelContext.getViewContext(this);
      const modelCtx = wx.modelContext.getContext(this);
      const { NotificationType } = wx.modelContext;

      modelCtx.on(NotificationType.Result, (data) => {
        const { structuredContent, meta } = getResultPayload(data);
        const job = meta.job || structuredContent.job || null;
        this.setData({ job });
        if (job && job.jobId && this._viewCtx) {
          this._viewCtx.setRelatedPage({
            query: 'id=' + encodeURIComponent(job.jobId)
          });
        }
      });
    }
  },

  methods: {
    openJobDetail() {
      const job = this.data.job || this.properties.job || {};
      if (!job.jobId) {
        if (typeof wx !== 'undefined' && wx.showToast) {
          wx.showToast({ title: '职位信息暂不可用', icon: 'none' });
        }
        return;
      }

      const url = '/package-user/pages/job-detail/job-detail?id=' + encodeURIComponent(job.jobId);
      if (this._viewCtx && typeof this._viewCtx.openDetailPage === 'function') {
        this._viewCtx.openDetailPage({ url });
      } else if (typeof wx !== 'undefined' && wx.navigateTo) {
        wx.navigateTo({ url });
      }
    }
  }
});
