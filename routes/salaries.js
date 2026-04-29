const express = require('express');
const router = express.Router();
const axios  = require('axios');
const db = require('../db/database');
const { authMiddleware } = require('../middleware/auth');
const { formatSalary: format } = require('../db/formatters');
const { parsePage, pageResult } = require('../db/paginate');
const { aiLimiter } = require('../middleware/rateLimit');

const DEEPSEEK_URL = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/chat/completions';
const RAPID_BASE   = process.env.RAPID_API_URL    || 'https://jsearch.p.rapidapi.com';
const RAPID_HEADERS = {
  'X-RapidAPI-Key':  process.env.RAPID_API_KEY  || '',
  'X-RapidAPI-Host': process.env.RAPID_API_HOST || 'jsearch.p.rapidapi.com'
};
function _validRapidKey() {
  const k = process.env.RAPID_API_KEY || '';
  return k.length >= 30 && !/\s/.test(k);
}

// ─── 市场薪资聚合（优先级：本地DB → RapidAPI → DeepSeek AI）─────────────────
// GET /api/salaries/market?job_title=...&location=...&company=...&region=NA
router.get('/market', aiLimiter, async (req, res) => {
  const { job_title = '', location = '', company = '', region = 'NA' } = req.query;
  if (!job_title.trim()) return res.status(400).json({ error: '请填写职位名称' });

  const isCN = region === 'CN';
  const currency = isCN ? 'CNY' : 'USD';
  const curYear = new Date().getFullYear();

  // ① 优先用本地用户提交数据（≥5条才可信）
  try {
    const dbRows = db.prepare(
      `SELECT total_compensation, base_salary, bonus, stock FROM salaries
       WHERE position LIKE ? AND currency = ? ORDER BY created_at DESC LIMIT 100`
    ).all(`%${job_title}%`, currency);

    if (dbRows.length >= 5) {
      const vals = dbRows.map(r => r.total_compensation).sort((a, b) => a - b);
      const pct  = (p) => vals[Math.min(vals.length - 1, Math.floor(vals.length * p / 100))];
      const avg  = vals.reduce((s, v) => s + v, 0) / vals.length;
      return res.json({ data: [{
        job_title, company_name: company || '', location,
        min_salary: pct(10), max_salary: pct(90),
        median_salary: pct(50), p25_salary: pct(25), p75_salary: pct(75),
        currency, data_source: 'community', sample_size: vals.length,
        trend: null, breakdown: null
      }]});
    }
  } catch (e) { console.error('[market/db]', e.message); }

  // ② 尝试 RapidAPI（有有效 Key 时）
  if (_validRapidKey()) {
    try {
      const r = await axios.get(`${RAPID_BASE}/estimated-salary`, {
        params: { job_title, location: location || (isCN ? '北京' : 'United States'),
                  location_type: 'ANY', years_of_experience: 'ALL' },
        headers: RAPID_HEADERS, timeout: 8000
      });
      const d = r.data?.data?.[0];
      if (d && (d.min_salary || d.job_min_salary)) {
        return res.json({ data: [{
          job_title: d.job_title || job_title,
          company_name: company || '', location: d.location || location,
          min_salary:    d.min_salary    || d.job_min_salary,
          max_salary:    d.max_salary    || d.job_max_salary,
          median_salary: d.median_salary || (d.min_salary + d.max_salary) / 2,
          p25_salary: null, p75_salary: null,
          currency, data_source: 'rapidapi', trend: null, breakdown: null
        }]});
      }
    } catch (e) { console.warn('[market/rapid]', e.message); }
  }

  // ③ DeepSeek AI 生成真实估算
  const companyPart = company ? `公司：${company}，` : '';
  const prompt = isCN
    ? `你是薪资数据专家。请根据中国劳动力市场真实数据，为以下岗位提供年度薪资估算。
岗位：${job_title}，${companyPart}地区：${location || '北京/上海'}，货币：CNY（人民币年薪）。

只输出JSON，不含任何其他内容：
{"min_salary":180000,"median_salary":280000,"max_salary":450000,"p25_salary":220000,"p75_salary":360000,"currency":"CNY","trend":[{"year":${curYear-4},"salary":0},{"year":${curYear-3},"salary":0},{"year":${curYear-2},"salary":0},{"year":${curYear-1},"salary":0},{"year":${curYear},"salary":0}],"breakdown":{"base_pct":75,"bonus_pct":15,"equity_pct":10},"market_note":"简短市场说明（20字以内）"}`
    : `You are a compensation data expert. Provide realistic salary estimates for the US job market.
Role: ${job_title}, ${companyPart}Location: ${location || 'United States'}, Currency: USD (annual total compensation).

Output JSON only, no other content:
{"min_salary":100000,"median_salary":160000,"max_salary":240000,"p25_salary":130000,"p75_salary":200000,"currency":"USD","trend":[{"year":${curYear-4},"salary":0},{"year":${curYear-3},"salary":0},{"year":${curYear-2},"salary":0},{"year":${curYear-1},"salary":0},{"year":${curYear},"salary":0}],"breakdown":{"base_pct":65,"bonus_pct":15,"equity_pct":20},"market_note":"Brief market note (under 20 words)"}`;

  try {
    const aiRes = await axios.post(DEEPSEEK_URL,
      { model: 'deepseek-chat', messages: [{ role: 'user', content: prompt }],
        temperature: 0.3, max_tokens: 600, stream: false },
      { headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`, 'Content-Type': 'application/json' },
        timeout: 25000 }
    );
    const raw = aiRes.data?.choices?.[0]?.message?.content?.trim() || '';
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('AI未返回JSON');
    const parsed = JSON.parse(match[0]);

    return res.json({ data: [{
      job_title, company_name: company || '', location: location || (isCN ? '中国' : 'United States'),
      min_salary:    parsed.min_salary,
      max_salary:    parsed.max_salary,
      median_salary: parsed.median_salary,
      p25_salary:    parsed.p25_salary,
      p75_salary:    parsed.p75_salary,
      currency:      parsed.currency || currency,
      data_source:   'ai',
      trend:         parsed.trend    || null,
      breakdown:     parsed.breakdown || null,
      market_note:   parsed.market_note || ''
    }]});
  } catch (err) {
    console.error('[market/ai]', err.message);
    return res.status(502).json({ error: 'AI估算失败，请稍后重试' });
  }
});

// ─── 列表（公司/职位/地点筛选+分页）─────────────────────────────────────────
router.get('/', (req, res) => {
  try {
    const { company, position, location } = req.query;
    const { page, pageSize, offset } = parsePage(req.query);
    let where = '1=1';
    const params = [];

    if (company)  { where += ' AND company LIKE ?';  params.push(`%${company}%`); }
    if (position) { where += ' AND position LIKE ?'; params.push(`%${position}%`); }
    if (location) { where += ' AND location LIKE ?'; params.push(`%${location}%`); }

    const total = db.prepare(`SELECT COUNT(*) as c FROM salaries WHERE ${where}`).get(...params).c;
    const rows  = db.prepare(`SELECT * FROM salaries WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
                    .all(...params, pageSize, offset);

    res.json({ code: 0, message: 'success', data: pageResult(rows.map(format), total, page, pageSize) });
  } catch (error) {
    console.error(error); res.status(500).json({ code: -1, message: '服务器内部错误' });
  }
});

// ─── 统计（平均薪资、最高最低、真实分位点）─────────────────────────────────────
router.get('/statistics', (req, res) => {
  try {
    const { position, currency } = req.query;
    let where = '1=1';
    const params = [];
    if (position) { where += ' AND position LIKE ?'; params.push(`%${position}%`); }
    if (currency) { where += ' AND currency = ?'; params.push(currency); }

    const stats = db.prepare(`
      SELECT
        COUNT(*) as count,
        AVG(total_compensation) as avg,
        MAX(total_compensation) as max,
        MIN(total_compensation) as min,
        AVG(base_salary) as avgBase,
        AVG(bonus) as avgBonus,
        AVG(stock) as avgStock
      FROM salaries WHERE ${where}
    `).get(...params);

    // 真实分位点：从 DB 取所有值排序后按索引计算（T-7修复）
    const allVals = db.prepare(
      `SELECT total_compensation FROM salaries WHERE ${where} ORDER BY total_compensation`
    ).all(...params).map(r => r.total_compensation);

    const percentile = (arr, p) => {
      if (!arr.length) return 0;
      const idx = Math.min(arr.length - 1, Math.floor(arr.length * p / 100));
      return Math.round(arr[idx]);
    };

    res.json({ code: 0, message: 'success', data: {
      count:    stats.count,
      avgTotal: Math.round(stats.avg  || 0),
      maxTotal: Math.round(stats.max  || 0),
      minTotal: Math.round(stats.min  || 0),
      avgBase:  Math.round(stats.avgBase  || 0),
      avgBonus: Math.round(stats.avgBonus || 0),
      avgStock: Math.round(stats.avgStock || 0),
      p25: percentile(allVals, 25),
      p50: percentile(allVals, 50),
      p75: percentile(allVals, 75)
    }});
  } catch (error) {
    console.error(error); res.status(500).json({ code: -1, message: '服务器内部错误' });
  }
});

// ─── 提交薪资（需登录，匿名存储）─────────────────────────────────────────────
router.post('/', authMiddleware, (req, res) => {
  try {
    const { company, position, location, yearsOfExperience, baseSalary, bonus, stock, currency } = req.body;
    if (!position || !position.trim()) {
      return res.status(400).json({ code: -1, message: '职位名称不能为空' });
    }
    const base = parseFloat(baseSalary) || 0;
    const bon  = parseFloat(bonus)      || 0;
    const stk  = parseFloat(stock)      || 0;
    if (base <= 0) return res.status(400).json({ code: -1, message: '基础薪资必须大于 0' });

    const tc = base + bon + stk;
    const result = db.prepare(`
      INSERT INTO salaries (company, position, location, years_of_experience, base_salary, bonus, stock, total_compensation, currency)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      company  || '匿名公司',
      position.trim(),
      location || '',
      parseInt(yearsOfExperience) || 0,
      base, bon, stk, tc,
      currency || 'CNY'
    );
    res.json({ code: 0, message: 'success', data: { id: result.lastInsertRowid } });
  } catch (error) {
    console.error(error); res.status(500).json({ code: -1, message: '服务器内部错误' });
  }
});

module.exports = router;
