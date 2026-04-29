Component({
  properties: {
    value: { type: String, value: '' },
    placeholder: { type: String, value: '搜索...' },
    debounce: { type: Number, value: 400 }
  },
  data: {},
  lifetimes: {
    detached() { if (this._timer) clearTimeout(this._timer); }
  },
  methods: {
    onInput(e) {
      const val = e.detail.value;
      this.setData({ value: val });
      if (this._timer) clearTimeout(this._timer);
      this._timer = setTimeout(() => {
        this.triggerEvent('search', { value: val });
      }, this.properties.debounce);
    },
    onConfirm(e) {
      if (this._timer) clearTimeout(this._timer);
      this.triggerEvent('search', { value: e.detail.value });
    },
    onClear() {
      if (this._timer) clearTimeout(this._timer);
      this.setData({ value: '' });
      this.triggerEvent('search', { value: '' });
      this.triggerEvent('clear');
    }
  }
});
