const api = require('../../../utils/api-assessment-resources.js');
const navigation = require('../../../utils/navigation.js');
Page({
  data: { keyword: '', companyId: '', items: [], loading: true, loadingMore: false,
    error: '', moreError: '', loggedIn: false, page: 0, hasMore: false, preview: false },
  onLoad(options = {}) {
    this._active = true;
    this._source = String(options.source || 'resources');
    this.setData({ companyId: String(options.companyId || '') });
  },
  onShow() { this._active = true; this.load(); },
  onHide() { this._active = false; this._request = (this._request || 0) + 1; this._loadingPage = false; this.setData({ items: [], loadingMore: false, page: 0, hasMore: false }); },
  onUnload() { this._active = false; this._request = (this._request || 0) + 1; },
  onPullDownRefresh() { return this.load().finally(() => wx.stopPullDownRefresh()); },
  onKeyword(event) { this.setData({ keyword: event.detail.value || '' }); },
  clearSearch() { this.setData({ keyword: '' }); this.load(); },
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
    const live = () => this._active && request === this._request && api.current(session);
    if (!append) this._searchParams = { keyword: this.data.keyword.trim(), companyId: this.data.companyId };
    this._loadingPage = true;
    this.setData({ loading: !append, loadingMore: !!append, error: '', moreError: '',
      preview: append ? this.data.preview : false,
      loggedIn: !!session.token, items: append ? this.data.items : [],
      page: append ? this.data.page : 0, hasMore: append ? this.data.hasMore : false });
    try {
      const data = await api.list(Object.assign({}, this._searchParams, { page, pageSize: 40 }));
      if (!live()) {
        if (this._active && request === this._request) this.load();
        return;
      }
      let incoming = (data.items || []).map(api.productView);
      const previous = append ? this.data.items : [];
      this.setData({ items: previous.concat(incoming), loading: false, preview: data.preview === true });
      const realProductIds = incoming.filter(item => !item.preview).map(item => item.productId);
      if (session.token && realProductIds.length) {
        try {
          // Restrict the ownership query to this catalogue page, excluding refund history.
          const purchased = await api.purchases({ productIds: realProductIds.join(','),
            ownedOnly: 1, page: 1, pageSize: 200 });
          if (!live()) {
            if (this._active && request === this._request) this.load();
            return;
          }
          const ownership = new Map((purchased.items || []).filter(api.ownsProduct).map(item => [String(item.productId), item]));
          incoming = incoming.map(item => Object.assign({}, item, { purchased: ownership.has(item.productId),
            ownershipLabel: ownership.has(item.productId) && ownership.get(item.productId).status === 'payment_review' ? '付款待核对' : '已购买' }));
        } catch (error) {
          if (live()) this.setData({ loggedIn: !!api.capture().token });
          else if (this._active && request === this._request) this.load();
        }
      }
      if (!live()) return;
      const items = previous.concat(incoming);
      this.setData({ items, page, hasMore: items.length < Number(data.total || items.length), loadingMore: false });
    } catch (error) {
      if (live()) this.setData({ loading: false, loadingMore: false, [append ? 'moreError' : 'error']: error.message });
      else if (this._active && request === this._request) this.load();
    } finally { if (request === this._request) this._loadingPage = false; }
  },
  onImageError(event) { this.setData({ ['items[' + event.currentTarget.dataset.index + '].coverUrl']: '' }); },
  openProduct(event) {
    const id = event.currentTarget.dataset.id;
    const product = this.data.items.find(item => item.productId === id);
    if (!product || !product.preview) api.track('assessment_product_click', { productId: id, companyId: this.data.companyId, source: this._source });
    navigation.safeNavigateTo(api.detailUrl(id, this._source, this.data.companyId));
  },
  openPurchases() { navigation.safeNavigateTo(api.purchasesUrl()); }
});
