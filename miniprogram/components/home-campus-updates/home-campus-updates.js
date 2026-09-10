Component({
  properties: {
    items: { type: Array, value: [] },
    total: { type: Number, value: 0 },
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

    onSelect(e) {
      const id = e.currentTarget.dataset.id;
      if (id) this.triggerEvent('select', { id });
    },

    onLogoError(e) {
      const id = e.currentTarget.dataset.id;
      if (id) this.triggerEvent('logoerror', { id });
    }
  }
});
