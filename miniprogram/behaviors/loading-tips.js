// behaviors/loading-tips.js — AI 加载动画（tips 轮播）
// 用法：
//   behaviors: [require('../../behaviors/loading-tips.js')]
//   调用 this._startLoading(['提示1...', '提示2...'])
//   完成后调用 this._clearLoading()

module.exports = Behavior({
  data: {
    loadingTip: '',
    loadingStep: 0
  },
  lifetimes: {
    detached() { this._clearLoading(); }
  },
  methods: {
    _startLoading(tips, interval) {
      this._clearLoading();
      let step = 0;
      if (tips && tips.length) {
        this._safe ? this._safe({ loadingTip: tips[0], loadingStep: 0 })
                    : this.setData({ loadingTip: tips[0], loadingStep: 0 });
      }
      this._loadTimer = setInterval(() => {
        step = (step + 1) % tips.length;
        const data = { loadingStep: step, loadingTip: tips[step] };
        this._safe ? this._safe(data) : (!this._unmounted && this.setData(data));
      }, interval || 2200);
    },
    _clearLoading() {
      if (this._loadTimer) {
        clearInterval(this._loadTimer);
        this._loadTimer = null;
      }
    }
  }
});
