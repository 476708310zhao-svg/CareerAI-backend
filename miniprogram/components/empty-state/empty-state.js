// components/empty-state/empty-state.js
Component({
  properties: {
    emoji:   { type: String, value: '📭' },
    title:   { type: String, value: '暂无数据' },
    desc:    { type: String, value: '' },
    btnText: { type: String, value: '' }
  },

  methods: {
    _onBtnTap() {
      this.triggerEvent('action');
    }
  }
});
