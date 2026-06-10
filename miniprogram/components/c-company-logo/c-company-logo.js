Component({
  externalClasses: ['custom-class'],

  properties: {
    logo: { type: null, value: '' },
    name: { type: String, value: '' },
    fallback: { type: String, value: '' },
    size: { type: String, value: 'md' },
    lazyLoad: { type: Boolean, value: false }
  },

  data: {
    failed: false,
    initial: 'C'
  },

  observers: {
    logo() {
      this.setData({ failed: false });
    },
    'name,fallback': function() {
      this.updateInitial();
    }
  },

  lifetimes: {
    attached() {
      this.updateInitial();
    }
  },

  methods: {
    updateInitial() {
      const fallback = String(this.data.fallback || '').trim();
      const name = String(this.data.name || '').trim();
      const source = fallback || name || 'C';
      const initial = source.slice(0, 2).toUpperCase();
      this.setData({ initial });
    },

    handleError() {
      this.setData({ failed: true });
      this.triggerEvent('error');
    }
  }
});
