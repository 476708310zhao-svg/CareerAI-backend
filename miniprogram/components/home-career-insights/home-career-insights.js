Component({
  properties: {
    insights: { type: Array, value: [] },
    loading: { type: Boolean, value: false },
    error: { type: Boolean, value: false }
  },

  data: {
    skeletonRows: [1, 2]
  },

  methods: {
    onSelect(e) {
      const index = Number(e.currentTarget.dataset.index);
      const item = this.data.insights[index];
      if (item) this.triggerEvent('select', { item });
    },

    onMore() {
      this.triggerEvent('more');
    },

    onRetry() {
      this.triggerEvent('retry');
    }
  }
});
