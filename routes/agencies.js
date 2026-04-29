const express = require('express');
const router  = express.Router();
const axios   = require('axios');
const db      = require('../db/database');
const { authMiddleware } = require('../middleware/auth');
const { writeLimiter, aiLimiter } = require('../middleware/rateLimit');
const { parseId } = require('../db/utils');
const { formatAgency, formatAgencyReview: formatReview } = require('../db/formatters');

const DEEPSEEK_URL = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/chat/completions';

// ─── 重新计算机构平均评分（评测增删后调用）────────────────────────────────────

function refreshRating(agencyId) {
  const stats = db.prepare(`
    SELECT COUNT(*) as cnt,
           AVG(rating_overall) as avg_overall
    FROM agency_reviews WHERE agency_id = ?
  `).get(agencyId);
  db.prepare(`
    UPDATE agencies SET rating_avg = ?, review_count = ? WHERE id = ?
  `).run(
    stats.avg_overall ? Math.round(stats.avg_overall * 10) / 10 : 0,
    stats.cnt,
    agencyId
  );
}

// ─── GET /api/agencies/compare ───────────────────────────────────────────────
// 批量获取机构完整信息用于对比（2~3 家，按 ids 顺序返回）
router.get('/compare', (req, res) => {
  const rawIds = (req.query.ids || '').split(',');
  const ids = rawIds.map(Number).filter(n => n > 0 && n <= 2147483647);
  if (ids.length < 2 || ids.length > 3) {
    return res.status(400).json({ code: -1, message: '请选择 2~3 家机构进行对比' });
  }

  const placeholders = ids.map(() => '?').join(',');
  const agencies = db.prepare(`SELECT * FROM agencies WHERE id IN (${placeholders})`).all(...ids);

  // 保持前端选择顺序
  const ordered = ids.map(id => agencies.find(a => a.id === id)).filter(Boolean);

  const result = ordered.map(agency => {
    const dims = db.prepare(`
      SELECT AVG(rating_effect) as effect, AVG(rating_value) as value,
             AVG(rating_service) as service
      FROM agency_reviews WHERE agency_id = ?
    `).get(agency.id);
    return {
      ...formatAgency(agency),
      ratingDims: {
        effect:  dims.effect  ? Math.round(dims.effect  * 10) / 10 : 0,
        value:   dims.value   ? Math.round(dims.value   * 10) / 10 : 0,
        service: dims.service ? Math.round(dims.service * 10) / 10 : 0
      }
    };
  });

  res.json({ code: 0, message: 'success', data: result });
});

// ─── GET /api/agencies ────────────────────────────────────────────────────────
// 机构列表（关键词 / 类型 / 城市 / 排序筛选 + 分页）
router.get('/', (req, res) => {
  const { keyword, type, city, sort, page = 1, pageSize = 15 } = req.query;
  const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(pageSize);
  const limit  = Math.min(50, Math.max(1, parseInt(pageSize)));

  let where  = [];
  let params = [];

  if (keyword) {
    where.push('(name LIKE ? OR description LIKE ? OR specialties LIKE ?)');
    const kw = `%${keyword}%`;
    params.push(kw, kw, kw);
  }
  if (type && type !== '全部') {
    where.push('type = ?');
    params.push(type);
  }
  if (city && city !== '全部') {
    where.push('city LIKE ?');
    params.push(`%${city}%`);
  }

  const whereSQL = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const sortMap = {
    rating:  'rating_avg DESC, review_count DESC',
    reviews: 'review_count DESC, rating_avg DESC',
    newest:  'created_at DESC'
  };
  const orderBy = sortMap[sort] || 'is_verified DESC, rating_avg DESC, review_count DESC';

  const total = db.prepare(`SELECT COUNT(*) as n FROM agencies ${whereSQL}`).get(...params).n;
  const rows  = db.prepare(`
    SELECT * FROM agencies ${whereSQL}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  res.json({
    code: 0, message: 'success',
    data:  rows.map(formatAgency),
    total, page: parseInt(page), pageSize: limit
  });
});

// ─── GET /api/agencies/:id ────────────────────────────────────────────────────
// 机构详情（含四维平均评分统计）
router.get('/:id', (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ code: -1, message: '参数无效' });

  const agency = db.prepare('SELECT * FROM agencies WHERE id = ?').get(id);
  if (!agency) return res.status(404).json({ code: -1, message: '机构不存在' });

  // 四维评分均值
  const dims = db.prepare(`
    SELECT AVG(rating_effect) as effect, AVG(rating_value) as value,
           AVG(rating_service) as service
    FROM agency_reviews WHERE agency_id = ?
  `).get(id);

  const detail = {
    ...formatAgency(agency),
    ratingDims: {
      effect:  dims.effect  ? Math.round(dims.effect  * 10) / 10 : 0,
      value:   dims.value   ? Math.round(dims.value   * 10) / 10 : 0,
      service: dims.service ? Math.round(dims.service * 10) / 10 : 0
    }
  };

  res.json({ code: 0, message: 'success', data: detail });
});

// ─── GET /api/agencies/:id/reviews ───────────────────────────────────────────
// 某机构评测列表（分页）
router.get('/:id/reviews', (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ code: -1, message: '参数无效' });

  const { page = 1, pageSize = 10 } = req.query;
  const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(pageSize);
  const limit  = Math.min(50, Math.max(1, parseInt(pageSize)));

  const total = db.prepare(
    'SELECT COUNT(*) as n FROM agency_reviews WHERE agency_id = ?'
  ).get(id).n;

  // JOIN users 获取昵称/头像（匿名时隐藏）
  const rows = db.prepare(`
    SELECT r.*, u.nickname as user_name, u.avatar as user_avatar
    FROM agency_reviews r
    LEFT JOIN users u ON r.user_id = u.id
    WHERE r.agency_id = ?
    ORDER BY r.created_at DESC
    LIMIT ? OFFSET ?
  `).all(id, limit, offset);

  res.json({
    code: 0, message: 'success',
    data: rows.map(formatReview),
    total, page: parseInt(page), pageSize: limit
  });
});

// ─── POST /api/agencies/:id/reviews ──────────────────────────────────────────
// 提交评测（每人每机构只能评一次）
router.post('/:id/reviews', writeLimiter, authMiddleware, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ code: -1, message: '参数无效' });

  const agency = db.prepare('SELECT id FROM agencies WHERE id = ?').get(id);
  if (!agency) return res.status(404).json({ code: -1, message: '机构不存在' });

  const {
    ratingOverall, ratingEffect = 0, ratingValue = 0, ratingService = 0,
    title = '', content, pros = '', cons = '', isAnonymous = false
  } = req.body;

  if (!ratingOverall || ratingOverall < 1 || ratingOverall > 5) {
    return res.status(400).json({ code: -1, message: '综合评分必须在 1~5 分之间' });
  }
  if (!content || content.trim().length < 10) {
    return res.status(400).json({ code: -1, message: '评测内容至少 10 个字' });
  }
  if (content.trim().length > 3000) {
    return res.status(400).json({ code: -1, message: '评测内容不能超过 3000 字' });
  }

  try {
    const result = db.prepare(`
      INSERT INTO agency_reviews
        (agency_id, user_id, rating_overall, rating_effect, rating_value, rating_service,
         title, content, pros, cons, is_anonymous)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, req.user.userId,
      ratingOverall, ratingEffect, ratingValue, ratingService,
      title.trim(), content.trim(), pros.trim(), cons.trim(),
      isAnonymous ? 1 : 0
    );

    refreshRating(id);

    const review = db.prepare(`
      SELECT r.*, u.nickname as user_name, u.avatar as user_avatar
      FROM agency_reviews r LEFT JOIN users u ON r.user_id = u.id
      WHERE r.id = ?
    `).get(result.lastInsertRowid);

    res.json({ code: 0, message: '评测提交成功', data: formatReview(review) });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ code: -1, message: '您已经评测过该机构' });
    }
    console.error(err); res.status(500).json({ code: -1, message: '服务器内部错误' });
  }
});

// ─── POST /api/agencies/:id/reviews/:reviewId/like ───────────────────────────
// 评测点赞
router.post('/:id/reviews/:reviewId/like', authMiddleware, (req, res) => {
  const reviewId = parseId(req.params.reviewId);
  if (!reviewId) return res.status(400).json({ code: -1, message: '参数无效' });

  const result = db.prepare(
    'UPDATE agency_reviews SET likes_count = likes_count + 1 WHERE id = ?'
  ).run(reviewId);

  if (result.changes === 0) return res.status(404).json({ code: -1, message: '评测不存在' });

  const { likes_count } = db.prepare(
    'SELECT likes_count FROM agency_reviews WHERE id = ?'
  ).get(reviewId);

  res.json({ code: 0, data: { likesCount: likes_count } });
});

// ─── DELETE /api/agencies/reviews/:reviewId ───────────────────────────────────
// 删除评测（仅本人）
router.delete('/reviews/:reviewId', authMiddleware, (req, res) => {
  const reviewId = parseId(req.params.reviewId);
  if (!reviewId) return res.status(400).json({ code: -1, message: '参数无效' });

  const review = db.prepare(
    'SELECT * FROM agency_reviews WHERE id = ? AND user_id = ?'
  ).get(reviewId, req.user.userId);

  if (!review) return res.status(404).json({ code: -1, message: '评测不存在或无权限删除' });

  db.prepare('DELETE FROM agency_reviews WHERE id = ?').run(reviewId);
  refreshRating(review.agency_id);

  res.json({ code: 0, message: '删除成功' });
});

// ─── POST /api/agencies/:id/ai-eval ──────────────────────────────────────────
// 触发 DeepSeek 生成 10 维结构化机构测评（AI 限速，需登录）
router.post('/:id/ai-eval', aiLimiter, authMiddleware, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ code: -1, message: '参数无效' });

  const agency = db.prepare('SELECT * FROM agencies WHERE id = ?').get(id);
  if (!agency) return res.status(404).json({ code: -1, message: '机构不存在' });

  // 已有 AI 测评且在 7 天内，直接返回缓存
  if (agency.ai_eval && agency.ai_eval_at) {
    const evalAge = Date.now() - new Date(agency.ai_eval_at).getTime();
    if (evalAge < 7 * 24 * 60 * 60 * 1000) {
      return res.json({ code: 0, message: '返回缓存测评', data: j(agency.ai_eval), cached: true });
    }
  }

  const prompt = `你现在是一名资深求职顾问，请基于公开信息和用户评价，生成一份关于【${agency.name}】的系统测评内容，覆盖北美/英国/中国市场。

请严格按以下 JSON 结构输出，不要有任何多余文字，只输出合法 JSON：
{
  "intro": {
    "founded": "成立时间",
    "headquarters": "总部地点",
    "mainBusiness": "主要业务简述",
    "targetClients": "主要客群"
  },
  "services": {
    "formats": ["项目形式列表"],
    "courseContent": "课程/服务内容描述",
    "intensity": "辅导强度说明"
  },
  "pricing": {
    "china": "国内价格区间",
    "northAmerica": "北美价格区间",
    "uk": "英国价格区间"
  },
  "targetUsers": ["适用人群标签，如：留学生", "转码人群", "应届生"],
  "strengths": ["优势亮点1（可量化）", "优势亮点2"],
  "weaknesses": ["存在问题1", "存在问题2"],
  "employmentEffect": "实际就业效果描述，举例行业/岗位/公司层级",
  "comparisons": [
    { "name": "对比机构1", "difference": "主要差异点" },
    { "name": "对比机构2", "difference": "主要差异点" },
    { "name": "对比机构3", "difference": "主要差异点" }
  ],
  "score": 8.0,
  "recommended": true,
  "recommendReason": "推荐理由说明"
}`;

  try {
    const result = await axios.post(
      DEEPSEEK_URL,
      {
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.5,
        stream: false
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 90000
      }
    );

    const raw = result.data.choices?.[0]?.message?.content || '';

    // 提取 JSON（防止 DeepSeek 在前后加 ```json 标记）
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(502).json({ code: -1, message: 'AI 返回格式异常，请重试' });
    }
    const evalData = JSON.parse(jsonMatch[0]);

    // 持久化到数据库
    db.prepare(`
      UPDATE agencies SET ai_eval = ?, ai_eval_at = datetime('now') WHERE id = ?
    `).run(JSON.stringify(evalData), id);

    res.json({ code: 0, message: 'AI 测评生成成功', data: evalData, cached: false });
  } catch (err) {
    if (err instanceof SyntaxError) {
      return res.status(502).json({ code: -1, message: 'AI 返回内容解析失败，请重试' });
    }
    const status = err.response?.status || 500;
    if (err.code === 'ECONNABORTED') {
      return res.status(504).json({ code: -1, message: 'AI 响应超时，请重试' });
    }
    if (status === 402) {
      return res.status(402).json({ code: -1, message: 'DeepSeek 余额不足' });
    }
    console.error(err); res.status(500).json({ code: -1, message: '服务器内部错误' });
  }
});

// ─── POST /api/agencies/batch-info ───────────────────────────────────────────
// 批量查询收藏机构最新评分（供收藏夹刷新用）
router.post('/batch-info', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ code: -1, message: 'ids 不能为空' });
  }
  const safeIds = ids.map(Number).filter(n => n > 0 && n <= 2147483647);
  if (safeIds.length === 0) return res.json({ code: 0, data: [] });

  const placeholders = safeIds.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT id, name, logo, type, rating_avg, review_count, is_verified
    FROM agencies WHERE id IN (${placeholders})
  `).all(...safeIds);

  res.json({ code: 0, data: rows });
});

module.exports = router;
