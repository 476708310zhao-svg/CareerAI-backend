// routes/exchange.js
// GET /api/exchange-rates?base=USD
// 代理 open.er-api.com（完全免费，无需 key），1小时内存缓存

const express = require('express');
const axios   = require('axios');
const router  = express.Router();

const CACHE_TTL = 60 * 60 * 1000; // 1 小时
const _cache = {};

// 支持的目标货币
const SUPPORTED = ['USD', 'CNY', 'CAD', 'GBP', 'EUR', 'JPY', 'AUD', 'SGD', 'HKD'];

router.get('/', async (req, res) => {
  const base = (req.query.base || 'USD').toUpperCase();
  if (!SUPPORTED.includes(base)) {
    return res.status(400).json({ error: 'Unsupported base currency' });
  }

  const now = Date.now();
  if (_cache[base] && now - _cache[base].time < CACHE_TTL) {
    return res.json({ source: 'cache', base, rates: _cache[base].rates, updatedAt: _cache[base].updatedAt });
  }

  try {
    const { data } = await axios.get(`https://open.er-api.com/v6/latest/${base}`, { timeout: 8000 });
    if (data.result !== 'success') throw new Error('API error');

    const rates = {};
    SUPPORTED.forEach(cur => { if (data.rates[cur]) rates[cur] = data.rates[cur]; });

    _cache[base] = { rates, time: now, updatedAt: data.time_last_update_utc || new Date().toISOString() };
    res.json({ source: 'live', base, rates, updatedAt: _cache[base].updatedAt });
  } catch (err) {
    // 降级：返回固定汇率（2025年参考值）
    const fallback = {
      USD: { USD:1, CNY:7.25, CAD:1.37, GBP:0.79, EUR:0.92, JPY:152, AUD:1.54, SGD:1.34, HKD:7.82 },
      CNY: { USD:0.138, CNY:1, CAD:0.189, GBP:0.109, EUR:0.127, JPY:20.97, AUD:0.212, SGD:0.185, HKD:1.079 }
    };
    const rates = fallback[base] || fallback['USD'];
    res.json({ source: 'fallback', base, rates, updatedAt: '2025-01-01' });
  }
});

module.exports = router;
