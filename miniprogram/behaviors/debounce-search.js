// behaviors/debounce-search.js — 搜索防抖
// 用法：
//   behaviors: [require('../../behaviors/debounce-search.js')]
//   调用 this._debounce(() => { ... }, 400)

module.exports = Behavior({
  lifetimes: {
    detached() {
      if (this._debounceTimer) clearTimeout(this._debounceTimer);
    }
  },
  methods: {
    _debounce(fn, delay) {
      if (this._debounceTimer) clearTimeout(this._debounceTimer);
      this._debounceTimer = setTimeout(fn, delay || 400);
    }
  }
});
