Component({
  properties: {
    featured: { type: Object, value: null },
    updates: { type: Array, value: [] },
    loading: { type: Boolean, value: false },
    ready: { type: Boolean, value: false },
    dateLabel: { type: String, value: '今日更新' }
  },

  data: {
    skeletonRows: [1, 2, 3]
  },

  methods: {
    onMore() {
      this.triggerEvent('more');
    },

    onFeatured() {
      const featured = this.data.featured;
      if (featured && featured.id) this.triggerEvent('select', { id: featured.id });
    },

    onUpdate(e) {
      const index = Number(e.currentTarget.dataset.index);
      const item = this.data.updates[index];
      if (item && item.id) this.triggerEvent('select', { id: item.id });
    },

    onLogoError() {
      this.triggerEvent('logoerror', { type: 'featured' });
    }
  }
});
