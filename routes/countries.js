// routes/countries.js
// GET /api/countries — 返回求职常用国家列表（flag + name + code）
// 优先走 restcountries.com，失败降级内置列表，24小时缓存

const express = require('express');
const axios   = require('axios');
const router  = express.Router();

const CACHE_TTL = 24 * 60 * 60 * 1000;

// 求职平台常用国家（alpha2 白名单）
const ALLOWED = new Set([
  'US','CA','GB','AU','SG','DE','FR','NL','JP','KR',
  'HK','NZ','IE','SE','CH','IN','AE','CN','MX','BR'
]);

// 内置兜底（restcountries 不可用时）
const FALLBACK = [
  { code:'US', name:'United States',   flag:'🇺🇸', api:'us' },
  { code:'CA', name:'Canada',          flag:'🇨🇦', api:'ca' },
  { code:'GB', name:'United Kingdom',  flag:'🇬🇧', api:'gb' },
  { code:'AU', name:'Australia',       flag:'🇦🇺', api:'au' },
  { code:'SG', name:'Singapore',       flag:'🇸🇬', api:'sg' },
  { code:'DE', name:'Germany',         flag:'🇩🇪', api:'de' },
  { code:'FR', name:'France',          flag:'🇫🇷', api:'fr' },
  { code:'NL', name:'Netherlands',     flag:'🇳🇱', api:'nl' },
  { code:'JP', name:'Japan',           flag:'🇯🇵', api:'jp' },
  { code:'KR', name:'South Korea',     flag:'🇰🇷', api:'kr' },
  { code:'HK', name:'Hong Kong',       flag:'🇭🇰', api:'hk' },
  { code:'NZ', name:'New Zealand',     flag:'🇳🇿', api:'nz' },
  { code:'IE', name:'Ireland',         flag:'🇮🇪', api:'ie' },
  { code:'SE', name:'Sweden',          flag:'🇸🇪', api:'se' },
  { code:'CH', name:'Switzerland',     flag:'🇨🇭', api:'ch' },
  { code:'IN', name:'India',           flag:'🇮🇳', api:'in' },
  { code:'AE', name:'UAE',             flag:'🇦🇪', api:'ae' },
  { code:'CN', name:'China',           flag:'🇨🇳', api:'cn' },
];

let _cache = null;
let _cacheTime = 0;

router.get('/', async (req, res) => {
  const now = Date.now();
  if (_cache && now - _cacheTime < CACHE_TTL) {
    return res.json({ source: 'cache', countries: _cache });
  }

  try {
    const { data } = await axios.get(
      'https://restcountries.com/v3.1/all?fields=name,cca2,flag',
      { timeout: 8000 }
    );
    const countries = data
      .filter(c => ALLOWED.has(c.cca2))
      .map(c => ({
        code: c.cca2,
        name: c.name.common,
        flag: c.flag,
        api:  c.cca2.toLowerCase()
      }))
      .sort((a, b) => {
        // 常用国家置顶
        const order = ['US','CA','GB','AU','SG','DE'];
        const ai = order.indexOf(a.code);
        const bi = order.indexOf(b.code);
        if (ai >= 0 && bi >= 0) return ai - bi;
        if (ai >= 0) return -1;
        if (bi >= 0) return  1;
        return a.name.localeCompare(b.name);
      });

    _cache = countries;
    _cacheTime = now;
    res.json({ source: 'live', countries });
  } catch (err) {
    res.json({ source: 'fallback', countries: FALLBACK });
  }
});

module.exports = router;
