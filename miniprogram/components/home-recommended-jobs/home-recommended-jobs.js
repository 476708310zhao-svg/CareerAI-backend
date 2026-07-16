Component({
  properties: {
    jobs: { type: Array, value: [] },
    loading: { type: Boolean, value: false },
    error: { type: Boolean, value: false },
    personalization: { type: String, value: '' }
  },

  data: {
    skeletonRows: [1, 2, 3]
  },

  methods: {
    onSelect(e) {
      const index = Number(e.currentTarget.dataset.index);
      const job = this.data.jobs[index];
      if (job) this.triggerEvent('select', { id: job.id, title: job.title });
    },

    onMore() {
      this.triggerEvent('more');
    },

    onCompleteProfile() {
      this.triggerEvent('complete');
    },

    onRetry() {
      this.triggerEvent('retry');
    }
  }
});
