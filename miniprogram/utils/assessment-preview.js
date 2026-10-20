const config = require('./app-config.js');
const LABEL = '开发预览·示例资料，暂不可购买';
function enabled() { return config.ASSESSMENT_PREVIEW_ENABLED === true; }
function isPreviewId(id) { return String(id || '').startsWith('preview-'); }
function products() {
  return ['A', 'B', 'C'].map((letter, index) => ({
    productId: 'preview-assessment-' + letter.toLowerCase(),
    companyId: 'preview-company-' + letter.toLowerCase(),
    companyName: '示例公司' + letter,
    companies: [{ id: 'preview-company-' + letter.toLowerCase(), name: '示例公司' + letter }],
    title: '校招测评资料（示例）', summary: '展示资料介绍、目录与购买入口的开发示例',
    seasonLabel: '开发预览', priceCents: 900, position: index + 1,
    status: 'preview', preview: true, previewLabel: LABEL,
    description: '仅用于微信开发者工具查看商品页面效果，不代表真实公司、商品或测评内容。',
    catalogText: '示例目录：\n1. 测评准备说明\n2. 题型介绍\n3. 练习资料说明',
    claimInstructions: '示例资料不提供网盘链接，也不会创建订单或发起支付。',
    sampleImages: []
  }));
}
function catalogue(params = {}) {
  const keyword = String(params.keyword || '').trim().toLowerCase();
  const companyId = String(params.companyId || '');
  const filtered = products().filter(item => (!companyId || item.companyId === companyId)
    && (!keyword || (item.companyName + item.title + item.summary).toLowerCase().includes(keyword)));
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.max(1, Math.min(200, Number(params.pageSize) || 40));
  return { enabled: true, preview: true, previewLabel: LABEL, total: filtered.length,
    items: filtered.slice((page - 1) * pageSize, page * pageSize) };
}
function detail(id) { return products().find(item => item.productId === String(id)); }
function canFallback(error) {
  return enabled() && (!!error && ([404, 503].includes(Number(error.statusCode))
    || ['networkError', 'NETWORK_ERROR', 'SERVICE_ROUTE_UNAVAILABLE'].includes(error.code)));
}
module.exports = { LABEL, enabled, isPreviewId, catalogue, detail, canFallback };
