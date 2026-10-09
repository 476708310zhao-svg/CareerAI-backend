Component({
  properties: {
    plan: {
      type: Object,
      value: {}
    }
  },

  methods: {
    onPrimary() {
      const url = this.data.plan && this.data.plan.primaryUrl;
      if (url) this.triggerEvent('action', { url });
    }
  }
});
