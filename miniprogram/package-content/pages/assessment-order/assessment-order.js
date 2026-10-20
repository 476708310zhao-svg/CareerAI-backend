const api = require('../../../utils/api-assessment-resources.js');
const navigation = require('../../../utils/navigation.js');
const loginGate = require('../../../behaviors/login-gate.js');
const STATUS = { pending: '支付结果确认中', paid: '已付款', closed: '订单已关闭',
  payment_review: '已收到付款，待人工核对',
  cancelled: '订单已取消', refunded: '订单已退款', refunding: '退款处理中', expired: '订单已过期', failed: '支付未完成' };
Page({
  behaviors: [loginGate],
  data: { order: null, delivery: null, loading: false, error: '', deliveryError: '',
    loggedIn: false, confirming: false, copying: false, statusLabel: '' },
  onLoad(options = {}) { this._orderNo = String(options.orderNo || ''); },
  onShow() { this._active = true; this.load(); },
  onHide() { this.stop(); },
  onUnload() { this.stop(); },
  stop() {
    this._active = false;
    this._request = (this._request || 0) + 1;
    this.cancelDelay();
    this.setData({ order: null, delivery: null, copying: false, loading: false, confirming: false, error: '', deliveryError: '' });
  },
  cancelDelay() { clearTimeout(this._pollTimer); if (this._pollResolve) this._pollResolve(false); this._pollResolve = null; },
  delay() { return new Promise(resolve => { this._pollResolve = resolve; this._pollTimer = setTimeout(() => { this._pollResolve = null; resolve(true); }, 1500); }); },
  async load() {
    this.cancelDelay();
    const request = this._request = (this._request || 0) + 1;
    const session = api.capture();
    const live = () => this._active && request === this._request && api.current(session);
    this.setData({ loggedIn: !!session.token, order: null, delivery: null, error: '', deliveryError: '', loading: !!session.token, confirming: false });
    if (!session.token) return;
    if (!this._orderNo) { this.setData({ loading: false, error: '订单号不完整，请从我的已购重新进入' }); return; }
    try {
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const result = await api.order(this._orderNo);
        if (!live()) { this.clearChangedSession(request); return; }
        const order = result.order;
        if (!order || String(order.orderNo) !== this._orderNo) throw new Error('未找到可查看的订单');
        this.setData({ order: Object.assign({}, order, { priceText: api.price(order.amount === undefined ? order.priceCents : order.amount) }),
          statusLabel: STATUS[order.status] || '订单处理中', loading: false,
          confirming: order.status === 'pending' && attempt < 5 });
        if (order.status === 'paid') {
          await this.loadDelivery(session, request);
          return;
        }
        if (order.status !== 'pending' || attempt === 5) return;
        if (!(await this.delay()) || !live()) return;
      }
    } catch (error) {
      if (live()) this.setData({ loading: false, confirming: false, error: error.message });
      else this.clearChangedSession(request);
    }
  },
  clearChangedSession(request) {
    if (this._active && request === this._request) this.setData({ order: null, delivery: null,
      loading: false, confirming: false, loggedIn: !!api.capture().token, error: '登录状态已变化，请重新加载订单' });
  },
  async loadDelivery(session, request) {
    try {
      const delivery = await api.delivery(this._orderNo);
      if (!this._active || request !== this._request) return;
      if (!api.current(session)) { this.clearChangedSession(request); return; }
      this._deliverySession = session;
      this.setData({ delivery, deliveryError: '', confirming: false });
      api.track('assessment_delivery_view', { productId: this.data.order.productId, orderNo: this._orderNo });
    } catch (error) {
      if (this._active && request === this._request) {
        this.setData({ delivery: null, deliveryError: error.message, confirming: false });
        if (!api.current(session)) this.clearChangedSession(request);
      }
    }
  },
  async copyDelivery() {
    if (this.data.copying || !this.data.delivery || !api.current(this._deliverySession)) {
      if (!this.data.copying) this.load();
      return;
    }
    const session = api.capture();
    const request = this._request;
    this.setData({ copying: true });
    try {
      // Recheck entitlement before every copy, including a refund or a corrected link.
      const delivery = await api.delivery(this._orderNo);
      if (!this._active || request !== this._request || !api.current(session)) { this.clearChangedSession(request); return; }
      if (!delivery.link) throw new Error('领取链接暂未配置，请联系客服');
      this.setData({ delivery });
      const text = '资料：' + delivery.title + '\n链接：' + delivery.link
        + (delivery.extractionCode ? '\n提取码：' + delivery.extractionCode : '')
        + (delivery.usageInstructions ? '\n使用说明：' + delivery.usageInstructions : '');
      wx.setClipboardData({ data: text, success: () => {
        if (!this._active || !api.current(session)) return;
        api.track('assessment_delivery_copy', { orderNo: this._orderNo, productId: this.data.order.productId });
        wx.showToast({ title: '领取信息已复制', icon: 'success' });
      }, fail: () => { if (this._active && api.current(session)) wx.showToast({ title: '复制失败，请重试', icon: 'none' }); } });
    } catch (error) {
      if (this._active && request === this._request) this.setData({ delivery: null, deliveryError: error.message });
    } finally { if (this._active && request === this._request) this.setData({ copying: false }); }
  },
  login() { this.ensureAuthenticated('登录后查看本人订单并领取资料', () => this.load()); },
  openProduct() { if (this.data.order) navigation.safeNavigateTo(api.detailUrl(this.data.order.productId, 'order')); },
  openPurchases() { navigation.safeNavigateTo(api.purchasesUrl()); },
  contactSupport() { navigation.safeNavigateTo('/package-user/pages/feedback/feedback'); }
});
