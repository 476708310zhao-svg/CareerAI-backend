const { presentJob } = require('../../utils/job-presenter.js');

Component({
  properties: {
    job: { type: Object, value: {} },
    itemIndex: { type: Number, value: -1 },
    showMatch: { type: Boolean, value: true },
    compact: { type: Boolean, value: false },
    showQueue: { type: Boolean, value: false },
    queueBusy: { type: Boolean, value: false }
  },

  data: {
    view: presentJob({})
  },

  observers: {
    job(value) {
      this.setData({ view: presentJob(value || {}) });
    }
  },

  methods: {
    queueJob() {
      if (!this.data.view.id || this.data.queueBusy) return;
      this.triggerEvent('queue', { id: this.data.view.id, index: this.data.itemIndex });
    },
    openJob() {
      if (!this.data.view.id) return;
      this.triggerEvent('open', { id: this.data.view.id, index: this.data.itemIndex });
    },

    toggleFavorite() {
      if (!this.data.view.id) return;
      this.triggerEvent('favorite', { id: this.data.view.id, index: this.data.itemIndex });
    }
  }
});
