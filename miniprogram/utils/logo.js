// utils/logo.js
// 统一生成公司 Logo URL，优先走后端代理缓存
// 用法：const { logoUrl } = require('../../utils/logo');
//       src="{{logoUrl('google.com')}}"  或  src="{{logoByName('字节跳动')}}"

const config = require('./config.js');
const BASE   = config.API_BASE_URL;

// 公司名 → 主域名（与后端 NAME_TO_DOMAIN 保持同步，用于纯前端预填）
const NAME_TO_DOMAIN = {
  '字节跳动': 'bytedance.com', '腾讯': 'tencent.com',
  '阿里巴巴': 'alibaba.com',  '淘天集团': 'taobao.com',
  '京东': 'jd.com',           '美团': 'meituan.com',
  '百度': 'baidu.com',        '网易': 'netease.com',
  '滴滴出行': 'didiglobal.com','华为': 'huawei.com',
  '小米': 'mi.com',           '快手': 'kuaishou.com',
  'bilibili': 'bilibili.com', '拼多多': 'pinduoduo.com',
  '顺丰科技': 'sf-express.com','招商银行': 'cmbchina.com',
  '中国银行': 'boc.cn',       '吉利汽车集团': 'geely.com',
  '比亚迪': 'byd.com',        '蔚来': 'nio.com',
  '高盛': 'goldmansachs.com', '麦肯锡': 'mckinsey.com',
  'google': 'google.com',     'meta': 'meta.com',
  'microsoft': 'microsoft.com','amazon': 'amazon.com',
  'apple': 'apple.com',       'netflix': 'netflix.com',
  'nvidia': 'nvidia.com',     'openai': 'openai.com',
  'goldman sachs': 'goldmansachs.com',
  'goldman sachs london': 'goldmansachs.com',
  'jane street': 'janestreet.com',
  'jane street london': 'janestreet.com',
  'two sigma': 'twosigma.com','citadel': 'citadel.com',
  'mckinsey usa': 'mckinsey.com',
  'bcg波士顿咨询': 'bcg.com', 'deloitte uk': 'deloitte.com',
  'kpmg uk': 'kpmg.com',      'barclays': 'barclays.com',
  'amazon uk': 'amazon.co.uk','国泰基金': 'gtfund.com',
};

/**
 * 用域名生成后端代理 logo URL
 * @param {string} domain  如 'google.com'
 * @returns {string}
 */
function logoUrl(domain) {
  if (!domain) return '/images/default-company.png';
  return `${BASE}/api/logo?domain=${encodeURIComponent(domain)}`;
}

/**
 * 用公司名生成后端代理 logo URL（先本地查域名，查不到则让后端处理）
 * @param {string} name  如 '字节跳动' / 'Google'
 * @returns {string}
 */
function logoByName(name) {
  if (!name) return '/images/default-company.png';
  const key    = name.toLowerCase().trim();
  const domain = NAME_TO_DOMAIN[key] || NAME_TO_DOMAIN[name.trim()];
  if (domain) return logoUrl(domain);
  // 让后端用 name 参数做模糊映射
  return `${BASE}/api/logo?name=${encodeURIComponent(name)}`;
}

module.exports = { logoUrl, logoByName };
