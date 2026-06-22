function getResultPayload(data) {
  const result = data && data.result ? data.result : {};
  return {
    structuredContent: result.structuredContent || {},
    meta: result._meta || {}
  };
}

Component({
  properties: {
    experience: { type: Object, value: null }
  },

  data: {
    experience: null
  },

  lifetimes: {
    created() {
      if (typeof wx === 'undefined' || !wx.modelContext) return;
      this._viewCtx = wx.modelContext.getViewContext(this);
      const modelCtx = wx.modelContext.getContext(this);
      const { NotificationType } = wx.modelContext;

      modelCtx.on(NotificationType.Result, (data) => {
        const { structuredContent, meta } = getResultPayload(data);
        const experience = meta.experience || structuredContent.experience || null;
        this.setData({ experience });
        if (experience && experience.experienceId && this._viewCtx) {
          this._viewCtx.setRelatedPage({
            query: 'id=' + encodeURIComponent(experience.experienceId)
          });
        }
      });
    }
  },

  methods: {
    openExperienceDetail() {
      const experience = this.data.experience || this.properties.experience || {};
      if (!experience.experienceId) return;
      const url = '/package-content/pages/experience-detail/experience-detail?id=' + encodeURIComponent(experience.experienceId);
      if (this._viewCtx && typeof this._viewCtx.openDetailPage === 'function') {
        this._viewCtx.openDetailPage({ url });
      } else if (typeof wx !== 'undefined' && wx.navigateTo) {
        wx.navigateTo({ url });
      }
    }
  }
});
