const client = require('./api-client.js');
const config = require('./app-config.js');
const authSession = require('./auth-session.js');
const analytics = require('./analytics.js');
const { timestamp } = require('./date-time.js');
const preview = require('./assessment-preview.js');

const ROOT = '/package-content/pages/assessment-';
function unwrap(response) {
  if (response && response.code === 0 && !response._source) return response.data;
  const source = response && response._source;
  const status = response && response._status;
  const statusMessage = status === 410 ? '领取期限已结束，如需帮助请联系客服'
    : status === 404 ? '未找到资料或订单，请返回重新选择'
      : status === 409 ? '订单状态已变化，请刷新后重新查看' : '';
  const error = new Error(source === 'unauthorized' ? '登录已过期，请重新登录'
    : source === 'authChanged' ? '账号已切换，请重新加载'
      : statusMessage || (response && response.message) || '暂时无法加载，请稍后重试');
  error.code = source || (response && response.code) || 'REQUEST_FAILED';
  error.statusCode = status;
  throw error;
}
function get(path, params, anonymous) {
  return client.request({ path: '/api/v4/' + path, params: params || {},
    noCache: true, skipAuth: !!anonymous }).then(unwrap);
}
async function publicCatalogue(path, params) {
  try {
    const data = await get(path, params, true);
    if (preview.enabled() && (!data || !Array.isArray(data.items) || !data.items.length)) return preview.catalogue(params);
    return data;
  } catch (error) {
    if (preview.canFallback(error)) return preview.catalogue(params);
    throw error;
  }
}
function home() { return publicCatalogue('assessment-products/home', {}); }
function list(params) { return publicCatalogue('assessment-products', params || {}); }
function detail(id) {
  if (preview.enabled() && preview.isPreviewId(id)) {
    const product = preview.detail(id);
    if (product) return Promise.resolve({ product, preview: true });
    return Promise.reject(new Error('未找到示例资料'));
  }
  return get('assessment-products/' + encodeURIComponent(id), {}, true);
}
function purchases(params) { return get('assessment-purchases', params); }
function order(orderNo) { return get('assessment-orders/' + encodeURIComponent(orderNo)); }
function delivery(orderNo) { return get('assessment-orders/' + encodeURIComponent(orderNo) + '/delivery'); }
function createOrder(body) {
  if (preview.isPreviewId(body && body.productId)) return Promise.reject(new Error('开发预览资料暂不可购买'));
  return client.post({ path: '/api/v4/assessment-orders', body }).then(unwrap);
}
function price(cents) { return (Math.max(0, Number(cents) || 0) / 100).toFixed(2); }
function imageUrl(value) {
  const url = String(value || '').trim();
  if (/^https:\/\//i.test(url)) return url;
  if (/^\/(?:images|uploads|api\/logo)(?:\/|\?)/.test(url)) {
    return url.startsWith('/images/') ? url : config.API_BASE_URL + url;
  }
  return '';
}
function coverArt(product, companyNames) {
  const source = [companyNames, product.companyName, product.title].filter(Boolean).join(' ');
  const branded = [
    [/小米/, 'xiaomi', '小米'],
    [/拼多多/, 'pdd', '拼多多'],
    [/百度/, 'baidu', '百度'],
    [/美团/, 'meituan', '美团'],
    [/京东/, 'jd', '京东']
  ].find(([pattern]) => pattern.test(source));
  return { coverTone: branded ? branded[1] : 'default',
    coverCompany: branded ? branded[2] : String(companyNames || product.companyName || '校招').slice(0, 5) };
}
function productView(product) {
  const item = product || {};
  const companies = Array.isArray(item.companies) ? item.companies : [];
  const companyNames = companies.map(company => company.name).filter(Boolean).join('、');
  return Object.assign({}, item, {
    productId: String(item.productId || item.id || ''),
    priceText: price(item.priceCents),
    priceLabel: (item.preview ? '示例价 ¥' : '¥') + price(item.priceCents),
    coverUrl: imageUrl(item.coverUrl),
    companyNames,
    ...coverArt(item, companyNames),
    sampleImages: (Array.isArray(item.sampleImages) ? item.sampleImages : []).map(imageUrl).filter(Boolean)
  });
}
function listUrl(source, companyId) {
  return ROOT + 'list/assessment-list?source=' + encodeURIComponent(source || 'resources')
    + (companyId ? '&companyId=' + encodeURIComponent(companyId) : '');
}
function detailUrl(productId, source, companyId, position) {
  return ROOT + 'detail/assessment-detail?productId=' + encodeURIComponent(productId)
    + '&source=' + encodeURIComponent(source || 'resources')
    + (companyId ? '&companyId=' + encodeURIComponent(companyId) : '')
    + (position ? '&position=' + encodeURIComponent(position) : '');
}
function orderUrl(orderNo) { return ROOT + 'order/assessment-order?orderNo=' + encodeURIComponent(orderNo); }
function purchasesUrl() { return ROOT + 'purchases/assessment-purchases'; }
function track(name, data) {
  if (config.ASSESSMENT_PREVIEW_ENABLED || preview.isPreviewId(data && data.productId)) return;
  analytics.track(name, Object.assign({ eventVersion: 1 }, data || {}));
}
function capture() { return authSession.capture(wx); }
function current(snapshot) { return authSession.isCurrent(snapshot, wx); }
function validPurchase(item) {
  return item && item.status === 'paid' && item.deliveryStatus === 'ready'
    && (!item.expiresAt || timestamp(item.expiresAt) > Date.now());
}
function ownsProduct(item) { return !!item && (item.status === 'paid' || item.status === 'payment_review'); }
function purchaseState(item) {
  if (!item) return '';
  if (item.status === 'payment_review') return 'review';
  if (item.status === 'refunded') return 'refunded';
  if (item.status !== 'paid') return '';
  if (item.expiresAt && timestamp(item.expiresAt) <= Date.now()) return 'expired';
  return validPurchase(item) ? 'ready' : 'waiting';
}
function purchaseLabel(item) {
  return { ready: '领取资料', expired: '领取期限已结束', review: '付款待核对',
    waiting: '查看领取进度', refunded: '已退款' }[purchaseState(item)] || '查看订单';
}
module.exports = { home, list, detail, purchases, order, delivery, createOrder, price,
  imageUrl, productView, listUrl, detailUrl, orderUrl, purchasesUrl, track, capture, current,
  validPurchase, ownsProduct, purchaseState, purchaseLabel };
