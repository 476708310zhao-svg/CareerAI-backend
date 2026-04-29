Component({
  properties: {
    loading: { type: Boolean, value: false },
    tips: { type: Array, value: ['AI 正在分析...', '正在生成结果...', '即将完成...'] },
    interval: { type: Number, value: 2200 }
  },
  data: {
    tip: '',
    step: 0
  },
  observers: {
    loading(val) {
      if (val) this._start();
      else this._stop();
    }
  },
  lifetimes: {
    detached() { this._stop(); }
  },
  methods: {
    _start() {
      this._stop();
      const tips = this.properties.tips;
      if (!tips.length) return;
      let step = 0;
      this.setData({ tip: tips[0], step: 0 });
      this._timer = setInterval(() => {
        step = (step + 1) % tips.length;
        this.setData({ tip: tips[step], step });
      }, this.properties.interval);
    },
    _stop() {
      if (this._timer) {
        clearInterval(this._timer);
        this._timer = null;
      }
    }
  }
});
