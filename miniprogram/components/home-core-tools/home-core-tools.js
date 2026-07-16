Component({
  properties: {
    tools: {
      type: Array,
      value: []
    }
  },

  methods: {
    onSelect(e) {
      const index = Number(e.currentTarget.dataset.index);
      const tool = this.data.tools[index];
      if (tool && tool.url) this.triggerEvent('select', { url: tool.url, id: tool.id });
    }
  }
});
