// behaviors/safe-page.js — 防止页面卸载后 setData 报错
// 适用于 Page() 和 Component()，统一提供 _safe / _safeSetData 方法
module.exports = Behavior({
  lifetimes: {
    attached() { this._unmounted = false; },
    detached() { this._unmounted = true; }
  },
  pageLifetimes: {},
  methods: {
    // Page() 的 onLoad / onUnload 也会自动合并
    onLoad() { this._unmounted = false; },
    onUnload() { this._unmounted = true; },

    _safe(data) {
      if (!this._unmounted) this.setData(data);
    },
    _safeSetData(data, cb) {
      if (this._unmounted) return;
      this.setData(data, cb);
    }
  }
});
