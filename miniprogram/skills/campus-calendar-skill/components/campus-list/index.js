function getResultPayload(data) {
  const result = data && data.result ? data.result : {};
  return {
    structuredContent: result.structuredContent || {},
    meta: result._meta || {}
  };
}

Component({
  properties: {
    opportunities: { type: Array, value: [] },
    total: { type: Number, value: 0 },
    hasMore: { type: Boolean, value: false }
  },

  data: {
    opportunities: [],
    total: 0,
    hasMore: false
  },

  lifetimes: {
    created() {
      if (typeof wx === 'undefined' || !wx.modelContext) return;
      this._viewCtx = wx.modelContext.getViewContext(this);
      const modelCtx = wx.modelContext.getContext(this);
      const { NotificationType } = wx.modelContext;

      modelCtx.on(NotificationType.Result, (data) => {
        const { structuredContent, meta } = getResultPayload(data);
        const opportunities = meta.opportunities || structuredContent.opportunities || [];
        this.setData({
          opportunities,
          total: structuredContent.total || meta.total || opportunities.length,
          hasMore: !!(structuredContent.hasMore || meta.hasMore)
        });
      });
    }
  },

  methods: {
    openCampusDetail(e) {
      const id = e.currentTarget.dataset.id;
      if (!id) return;
      const url = '/package-content/pages/campus-detail/campus-detail?id=' + encodeURIComponent(id);
      if (this._viewCtx && typeof this._viewCtx.openDetailPage === 'function') {
        this._viewCtx.openDetailPage({ url });
      } else if (typeof wx !== 'undefined' && wx.navigateTo) {
        wx.navigateTo({ url });
      }
    },

    openCampusList() {
      const url = '/pages/campus/campus';
      if (typeof wx !== 'undefined' && wx.switchTab) {
        wx.switchTab({ url });
      } else if (this._viewCtx && typeof this._viewCtx.openDetailPage === 'function') {
        this._viewCtx.openDetailPage({ url });
      }
    }
  }
});
