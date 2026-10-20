const api = require('../../../utils/api-assessment-resources.js');
const payments = require('../../../utils/api-payment.js');
const navigation = require('../../../utils/navigation.js');
const loginGate = require('../../../behaviors/login-gate.js');
Page({
  behaviors: [loginGate],
  data: { product: null, loading: true, error: '', paying: false, purchaseChecking: false,
    purchaseError: '', purchasedOrderNo: '', purchaseState: '', canBuy: false },
  onLoad(options = {}) {
    this._productId = String(options.productId || options.id || '');
    this._source = String(options.source || 'resources');
    this._companyId = String(options.companyId || '');
    this._position = Number(options.position) || undefined;
  },
  onShow() { this._active = true; this.load(); },
  onHide() { this.stop(); },
  onUnload() { this.stop(); },
  stop() {
    this._active = false;
    this._request = (this._request || 0) + 1;
    this._purchaseRun = (this._purchaseRun || 0) + 1;
    this.setData({ purchasedOrderNo: '', purchaseState: '', purchaseChecking: false, paying: false, purchaseError: '' });
  },
  async load() {
    const request = this._request = (this._request || 0) + 1;
    this.setData({ loading: true, error: '', purchasedOrderNo: '', purchaseState: '', purchaseError: '' });
    if (!this._productId) { this.setData({ loading: false, error: '资料信息不完整，请返回重新选择' }); return; }
    try {
      const data = await api.detail(this._productId);
      if (!this._active || request !== this._request) return;
      const product = api.productView(data.product);
      if (!product.productId) throw new Error('该资料暂时无法查看');
      this.setData({ product, loading: false, canBuy: !product.preview && product.status === 'active' && product.purchaseEnabled !== false });
      if (product.preview) return;
      api.track('assessment_product_view', { productId: this._productId, source: this._source,
        companyId: this._companyId, position: this._position });
      await this.checkPurchase();
    } catch (error) { if (this._active && request === this._request) this.setData({ loading: false, error: error.message }); }
  },
  async checkPurchase() {
    if (this.isPreview()) return;
    const run = this._purchaseRun = (this._purchaseRun || 0) + 1;
    const session = api.capture();
    this.setData({ purchasedOrderNo: '', purchaseState: '', purchaseError: '', purchaseChecking: !!session.token });
    if (!session.token) return;
    try {
      const data = await api.purchases({ productId: this._productId, ownedOnly: 1, page: 1, pageSize: 200 });
      if (!this._active || run !== this._purchaseRun) return;
      if (!api.current(session)) { this.setData({ purchaseChecking: false, purchasedOrderNo: '', purchaseError: '登录状态已变化，请重新核实购买记录' }); return; }
      const orders = (data.items || []).filter(item => String(item.productId) === this._productId && api.ownsProduct(item));
      const purchased = orders.find(item => item.status === 'paid') || orders.find(item => item.status === 'payment_review');
      this.setData({ purchasedOrderNo: purchased ? purchased.orderNo : '',
        purchaseState: api.purchaseState(purchased), purchaseChecking: false });
    } catch (error) {
      if (this._active && run === this._purchaseRun) this.setData({ purchaseChecking: false, purchasedOrderNo: '', purchaseError: error.message });
    }
  },
  onCoverError() { this.setData({ 'product.coverUrl': '' }); },
  previewImage(event) { const images = this.data.product.sampleImages || []; if (images.length) wx.previewImage({ current: images[event.currentTarget.dataset.index], urls: images }); },
  purchase() {
    if (this.isPreview()) return;
    if (this.data.paying || this.data.purchaseChecking || !this.data.product) return;
    if (this.data.purchaseError) { this.checkPurchase(); return; }
    this.ensureAuthenticated('登录后购买并领取测评资料', () => this.confirmPurchase());
  },
  async confirmPurchase() {
    if (this.isPreview()) return;
    await this.checkPurchase();
    if (!this._active || this.data.purchaseError || this.data.purchaseChecking) return;
    if (this.data.purchasedOrderNo) { navigation.safeNavigateTo(api.orderUrl(this.data.purchasedOrderNo)); return; }
    if (!this.data.canBuy) { wx.showToast({ title: '该资料暂未开放购买', icon: 'none' }); return; }
    const session = api.capture();
    const product = this.data.product;
    wx.showModal({ title: '确认购买', content: product.title + '\n实付 ¥' + product.priceText + '\n付款后领取网盘链接和提取码。', confirmText: '确认购买',
      success: result => { if (result.confirm && this._active && api.current(session)) this.pay(session,product); } });
  },
  async pay(session,quotedProduct) {
    if (this.isPreview()) return;
    if (this.data.paying || !this._active || !api.current(session)) return;
    const run = this._purchaseRun = (this._purchaseRun || 0) + 1;
    const live = () => this._active && run === this._purchaseRun && api.current(session);
    const product = quotedProduct || this.data.product;
    if (!this._orderKey || !api.current(this._orderSession)) {
      this._orderSession = session;
      this._orderKey = 'assessment-' + Date.now() + '-' + Math.random().toString(36).slice(2, 14);
    }
    this.setData({ paying: true });
    try {
      const result = await api.createOrder({ productId: this._productId,
        expectedPriceCents: product.priceCents, expectedInstructionsVersion: product.instructionsVersion, idempotencyKey: this._orderKey,
        source: this._source, companyId: this._companyId || undefined });
      if (!live()) return;
      const order = result.order;
      if (!order || !order.orderNo) throw new Error('订单创建失败，请重试');
      api.track('assessment_order_created_client', { productId: this._productId, orderNo: order.orderNo, source: this._source });
      if (!result.alreadyPurchased && !api.ownsProduct(order)) {
        await this.requestPayment(result.payment || {}, order);
        if (!live()) return;
      }
      navigation.safeNavigateTo(api.orderUrl(order.orderNo));
    } catch (error) {
      if (!live()) return;
      const message = String(error.errMsg || error.message || '支付未完成，请重试');
      wx.showToast({ title: /cancel/i.test(message) ? '已取消支付，可稍后重试' : message, icon: 'none' });
      const code = error.body && error.body.code;
      if (error.statusCode === 409 || code === 'PRICE_CHANGED') { this._orderKey = ''; this.load(); }
    } finally {
      if (this._active && run === this._purchaseRun) {
        this.setData({ paying: false });
        if (!api.current(session)) {
          this._orderKey = '';
          this.setData({ purchasedOrderNo: '', purchaseState: '', purchaseError: '登录状态已变化，请重新核实购买记录' });
        }
      }
    }
  },
  requestPayment(payment, order) {
    if (this.isPreview()) return Promise.reject(new Error('开发预览资料暂不可购买'));
    if (payment.mock) {
      return new Promise((resolve, reject) => wx.showModal({ title: '测试支付', content: '当前为测试支付，不会产生真实扣款。是否完成模拟付款？', confirmText: '模拟付款',
        success: result => result.confirm ? resolve() : reject(new Error('cancel')), fail: reject }))
        .then(() => {
          if (!this._active || !api.current(this._orderSession)) throw new Error('账号已切换，请重新操作');
          return payments.mockConfirmPay(order.orderNo);
        });
    }
    if (payment.provider === 'virtual' || payment.paymentProvider === 'virtual') {
      if (typeof wx.requestVirtualPayment !== 'function') return Promise.reject(new Error('请升级微信后再购买'));
      const params = payment.virtualPayment || { mode: payment.mode, signData: payment.signData,
        paySig: payment.paySig, signature: payment.signature };
      return new Promise((resolve, reject) => wx.requestVirtualPayment(Object.assign({}, params, { success: resolve, fail: reject })));
    }
    if (!payment.timeStamp || !payment.paySign) return Promise.reject(new Error(payment.message || '支付暂未开放，请稍后再试'));
    return new Promise((resolve, reject) => wx.requestPayment({ timeStamp: payment.timeStamp,
      nonceStr: payment.nonceStr, package: payment.package, signType: payment.signType || 'MD5',
      paySign: payment.paySign, success: resolve, fail: reject }));
  },
  isPreview() { return !!(this.data.product && this.data.product.preview) || String(this._productId || '').startsWith('preview-'); },
  openPurchases() { navigation.safeNavigateTo(api.purchasesUrl()); }
});
