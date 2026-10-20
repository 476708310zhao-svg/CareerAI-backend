const api = require('../../../utils/api-assessment-resources.js');
const navigation = require('../../../utils/navigation.js');
const loginGate = require('../../../behaviors/login-gate.js');
Page({
  behaviors: [loginGate],
  data: { items: [], loading: false, loadingMore: false, error: '', moreError: '', loggedIn: false, page: 0, hasMore: false },
  onShow() { this._active = true; this.load(); },
  onHide() { this.clearPrivate(); },
  onUnload() { this.clearPrivate(); },
  clearPrivate() { this._active = false; this._request = (this._request || 0) + 1; this._loadingPage = false;
    this.setData({ items: [], loading: false, loadingMore: false, error: '', moreError: '', page: 0, hasMore: false }); },
  onPullDownRefresh() { return this.load().finally(() => wx.stopPullDownRefresh()); },
  load() { return this.loadPage(1, false); },
  loadMore() {
    if (this._loadingPage || !this.data.hasMore) return;
    return this.loadPage(this.data.page + 1, true);
  },
  async loadPage(page, append) {
    if (append && !api.current(this._ownerSession)) return this.load();
    const request = this._request = (this._request || 0) + 1;
    const session = api.capture();
    if (!append) this._ownerSession = session;
    this._loadingPage = true;
    this.setData({ loggedIn: !!session.token, items: append ? this.data.items : [],
      error: '', moreError: '', loading: !!session.token && !append, loadingMore: !!session.token && append,
      page: append ? this.data.page : 0, hasMore: append ? this.data.hasMore : false });
    if (!session.token) { this._loadingPage = false; return; }
    try {
      const data = await api.purchases({ page, pageSize: 20 });
      if (!this._active || request !== this._request) return;
      if (!api.current(session)) { this.setData({ loading: false, loadingMore: false, items: [], loggedIn: !!api.capture().token, error: '登录状态已变化，请重新加载' }); return; }
      const incoming = (data.items || []).map(item => Object.assign({}, item, {
        priceText: api.price(item.amount === undefined ? item.priceCents : item.amount),
        claimable: api.validPurchase(item),
        statusLabel: api.purchaseLabel(item)
      }));
      const items = (append ? this.data.items : []).concat(incoming);
      this.setData({ items, page, hasMore: items.length < Number(data.total || items.length), loading: false, loadingMore: false });
    } catch (error) {
      if (this._active && request === this._request) {
        if (!api.current(session)) this.setData({ items: [], loading: false, loadingMore: false,
          loggedIn: !!api.capture().token, error: '登录状态已变化，请重新加载' });
        else this.setData({ loading: false, loadingMore: false, [append ? 'moreError' : 'error']: error.message });
      }
    } finally { if (request === this._request) this._loadingPage = false; }
  },
  login() { this.ensureAuthenticated('登录后查看已购买的测评资料', () => this.load()); },
  openOrder(event) {
    if (!api.current(this._ownerSession)) { this.load(); return; }
    navigation.safeNavigateTo(api.orderUrl(event.currentTarget.dataset.orderNo));
  },
  browse() { navigation.safeNavigateTo(api.listUrl('purchases')); }
});
