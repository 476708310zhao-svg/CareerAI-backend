function getResultPayload(data) {
  const result = data && data.result ? data.result : {};
  return {
    structuredContent: result.structuredContent || {},
    meta: result._meta || {}
  };
}

Component({
  properties: {
    experiences: { type: Array, value: [] },
    total: { type: Number, value: 0 },
    usedSimilarFallback: { type: Boolean, value: false }
  },

  data: {
    experiences: [],
    total: 0,
    usedSimilarFallback: false
  },

  lifetimes: {
    created() {
      if (typeof wx === 'undefined' || !wx.modelContext) return;
      this._modelCtx = wx.modelContext.getContext(this);
      const { NotificationType } = wx.modelContext;

      this._modelCtx.on(NotificationType.Result, (data) => {
        const { structuredContent, meta } = getResultPayload(data);
        const experiences = meta.experiences || structuredContent.experiences || [];
        this.setData({
          experiences,
          total: structuredContent.total || meta.total || experiences.length,
          usedSimilarFallback: !!(structuredContent.usedSimilarFallback || meta.usedSimilarFallback)
        });
      });
    }
  },

  methods: {
    sendDetailMessage(experienceId) {
      if (!this._modelCtx || !experienceId) return false;
      this._modelCtx.sendFollowUpMessage({
        content: [
          { type: 'text', text: '查看面经详情' },
          {
            type: 'api/call',
            data: {
              name: 'getInterviewExperienceDetail',
              arguments: { experienceId }
            }
          }
        ]
      });
      return true;
    },

    onExperienceTap(e) {
      const experienceId = e.currentTarget.dataset.id;
      if (!this.sendDetailMessage(experienceId) && typeof wx !== 'undefined' && wx.showToast) {
        wx.showToast({ title: '请在对话中继续查看详情', icon: 'none' });
      }
    }
  }
});
