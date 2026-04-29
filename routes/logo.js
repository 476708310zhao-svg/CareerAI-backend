// routes/logo.js
// 公司 Logo 代理缓存服务
// GET /api/logo?domain=google.com
// GET /api/logo?name=字节跳动
//
// 流程：本地缓存命中 → 直接返回；未命中 → 从 Clearbit 抓取 → 存本地 → 返回
// 缓存目录：uploads/logos/  （文件名 = domain.png）

const express  = require('express');
const axios    = require('axios');
const fs       = require('fs');
const path     = require('path');
const router   = express.Router();

const CACHE_DIR = path.join(__dirname, '../uploads/logos');
const FALLBACK  = path.join(__dirname, '../uploads/logos/_fallback.png');

// 公司名 → 主域名 映射（支持中英文）
const NAME_TO_DOMAIN = {
  // 中国大厂
  '字节跳动': 'bytedance.com', 'bytedance': 'bytedance.com',
  '腾讯': 'tencent.com',       'tencent': 'tencent.com',
  '阿里巴巴': 'alibaba.com',   'alibaba': 'alibaba.com',
  '淘天集团': 'taobao.com',    '淘宝': 'taobao.com',
  '京东': 'jd.com',            'jd': 'jd.com',
  '美团': 'meituan.com',       'meituan': 'meituan.com',
  '百度': 'baidu.com',         'baidu': 'baidu.com',
  '网易': 'netease.com',       'netease': 'netease.com',
  '滴滴': 'didiglobal.com',    '滴滴出行': 'didiglobal.com',
  '华为': 'huawei.com',        'huawei': 'huawei.com',
  '小米': 'mi.com',            'xiaomi': 'mi.com',
  'oppo': 'oppo.com',          'vivo': 'vivo.com',
  '快手': 'kuaishou.com',      'kuaishou': 'kuaishou.com',
  'bilibili': 'bilibili.com',  'b站': 'bilibili.com',
  '爱奇艺': 'iqiyi.com',       '优酷': 'youku.com',
  '拼多多': 'pinduoduo.com',   '抖音': 'tiktok.com',
  '顺丰': 'sf-express.com',    '顺丰科技': 'sf-express.com',
  '招商银行': 'cmbchina.com',  '中国银行': 'boc.cn',
  '工商银行': 'icbc.com.cn',   '建设银行': 'ccb.com',
  '平安': 'pingan.com',        '蚂蚁集团': 'antgroup.com',
  '高盛': 'goldmansachs.com',  '摩根': 'jpmorgan.com',
  '麦肯锡': 'mckinsey.com',    'bcg': 'bcg.com', 'bcg波士顿咨询': 'bcg.com',
  '普华永道': 'pwc.com',       '德勤': 'deloitte.com',
  'kpmg': 'kpmg.com',          '安永': 'ey.com',
  '吉利': 'geely.com',         '吉利汽车集团': 'geely.com',
  '比亚迪': 'byd.com',         '蔚来': 'nio.com',
  // 北美大厂
  'google': 'google.com',      'meta': 'meta.com',
  'microsoft': 'microsoft.com','amazon': 'amazon.com',
  'apple': 'apple.com',        'netflix': 'netflix.com',
  'nvidia': 'nvidia.com',      'openai': 'openai.com',
  'uber': 'uber.com',          'airbnb': 'airbnb.com',
  'salesforce': 'salesforce.com', 'oracle': 'oracle.com',
  'ibm': 'ibm.com',            'intel': 'intel.com',
  'twitter': 'twitter.com',    'linkedin': 'linkedin.com',
  // 金融
  'jpmorgan': 'jpmorgan.com',  'citadel': 'citadel.com',
  'jane street': 'janestreet.com', 'jane street london': 'janestreet.com',
  'two sigma': 'twosigma.com', 'goldman sachs': 'goldmansachs.com',
  'goldman sachs london': 'goldmansachs.com', 'barclays': 'barclays.com',
  'morgan stanley': 'morganstanley.com', '摩根士丹利': 'morganstanley.com',
  '国泰基金': 'gtfund.com',
  // 咨询
  'mckinsey usa': 'mckinsey.com', 'deloitte uk': 'deloitte.com',
  'kpmg uk': 'kpmg.com',
  // 英国大厂
  'amazon uk': 'amazon.co.uk',
};

function domainFromName(name) {
  const key = (name || '').toLowerCase().trim();
  return NAME_TO_DOMAIN[key] || NAME_TO_DOMAIN[name.trim()] || null;
}

function cacheFile(domain) {
  return path.join(CACHE_DIR, domain.replace(/[^a-z0-9.-]/gi, '_') + '.png');
}

// 确保缓存目录存在
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

// GET /api/logo
router.get('/', async (req, res) => {
  let { domain, name, size = 128 } = req.query;

  // name → domain
  if (!domain && name) {
    domain = domainFromName(name);
  }

  if (!domain) {
    return serveFallback(res);
  }

  domain = domain.toLowerCase().trim();
  const file = cacheFile(domain);

  // 缓存命中
  if (fs.existsSync(file)) {
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=2592000'); // 30天
    return res.sendFile(file);
  }

  // 从 Clearbit 拉取
  const url = `https://logo.clearbit.com/${domain}?size=${size}`;
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 8000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    const contentType = response.headers['content-type'] || 'image/png';
    const buf = Buffer.from(response.data);

    // 写入缓存
    fs.writeFileSync(file, buf);

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=2592000');
    res.send(buf);
  } catch (err) {
    // Clearbit 找不到 → 返回兜底图
    serveFallback(res);
  }
});

function serveFallback(res) {
  // 返回 404 让小程序 binderror 触发，显示本地占位图
  res.status(404).end();
}

module.exports = router;
