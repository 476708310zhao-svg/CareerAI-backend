// routes/glassdoor.js
// GET /api/glassdoor/overview?company=Google   — 公司评分 + 关键指标
// GET /api/glassdoor/reviews?company=Google&page=1 — 员工评价列表

const express = require('express');
const axios   = require('axios');
const router  = express.Router();

const HOST        = process.env.GLASSDOOR_RAPID_HOST || 'glassdoor.p.rapidapi.com';
const RAPID_KEY   = process.env.RAPID_API_KEY || '';
const CACHE_OV    = 60 * 60 * 1000;      // overview 1小时缓存
const CACHE_RV    = 2  * 60 * 60 * 1000; // reviews  2小时缓存

const _ovCache = {};   // key → { data, time }
const _rvCache = {};

function rapidHeaders() {
  return { 'X-RapidAPI-Key': RAPID_KEY, 'X-RapidAPI-Host': HOST };
}

// ── 搜索公司并返回第一条 employer info ────────────────────────────────────────
async function findEmployer(companyName) {
  const { data } = await axios.get(`https://${HOST}/employers/find`, {
    params:  { query: companyName, country: 'US', page: 1, pageSize: 1 },
    headers: rapidHeaders(),
    timeout: 8000
  });
  const employers = (data?.data?.employers?.employer) || [];
  if (!employers.length) throw new Error('not found');
  return employers[0];
}

// ── GET /api/glassdoor/overview ───────────────────────────────────────────────
router.get('/overview', async (req, res) => {
  const company = (req.query.company || '').trim();
  if (!company) return res.status(400).json({ error: 'company required' });

  const now = Date.now();
  const ck  = company.toLowerCase();
  if (_ovCache[ck] && now - _ovCache[ck].time < CACHE_OV) {
    return res.json({ source: 'cache', data: _ovCache[ck].data });
  }

  if (!RAPID_KEY) {
    return res.json({ source: 'no_key', data: null });
  }

  try {
    const emp = await findEmployer(company);
    const overview = {
      employerId:        emp.id,
      name:              emp.name              || company,
      overallRating:     emp.overallRating      || null,
      reviewCount:       emp.numberOfRatings    || 0,
      recommendPct:      emp.recommendToFriendRating != null
                           ? Math.round(emp.recommendToFriendRating * 100) : null,
      ceoApprovalPct:    emp.ceoRating != null
                           ? Math.round(emp.ceoRating * 100) : null,
      // 子项评分
      cultureRating:     emp.cultureAndValuesRating      || null,
      workLifeRating:    emp.workLifeBalanceRating        || null,
      careerRating:      emp.careerOpportunitiesRating    || null,
      mgmtRating:        emp.seniorManagementRating       || null,
      benefitsRating:    emp.benefitsRating               || null,
      website:           emp.website            || '',
      squareLogo:        emp.squareLogo         || ''
    };

    _ovCache[ck] = { data: overview, time: now };
    res.json({ source: 'live', data: overview });
  } catch (err) {
    console.error('[Glassdoor overview]', err.message);
    res.json({ source: 'error', data: null, message: err.message });
  }
});

// ── GET /api/glassdoor/reviews ────────────────────────────────────────────────
router.get('/reviews', async (req, res) => {
  const company = (req.query.company || '').trim();
  const page    = parseInt(req.query.page) || 1;
  if (!company) return res.status(400).json({ error: 'company required' });

  const now = Date.now();
  const ck  = `${company.toLowerCase()}_p${page}`;
  if (_rvCache[ck] && now - _rvCache[ck].time < CACHE_RV) {
    return res.json({ source: 'cache', reviews: _rvCache[ck].data });
  }

  if (!RAPID_KEY) {
    return res.json({ source: 'no_key', reviews: [] });
  }

  try {
    // 先找 employerId
    let employerId = req.query.employerId ? parseInt(req.query.employerId) : null;
    if (!employerId) {
      const emp = await findEmployer(company);
      employerId = emp.id;
    }

    const { data } = await axios.get(`https://${HOST}/reviews`, {
      params: {
        employerId,
        country: 'US',
        page,
        pageSize: 8,
        sort: 'DATE'
      },
      headers: rapidHeaders(),
      timeout: 8000
    });

    const rawReviews = data?.data?.reviews?.employerReviews || [];
    const reviews = rawReviews.map(r => ({
      id:          r.reviewId || r.reviewIdentifier,
      title:       r.headline || r.summary || '',
      rating:      r.ratingOverall || r.overallRating || 0,
      pros:        r.pros  || '',
      cons:        r.cons  || '',
      date:        r.reviewDateTime ? r.reviewDateTime.split('T')[0] : '',
      jobTitle:    r.jobTitle?.title || r.jobTitle || '',
      isCurrentEmployee: r.employmentStatus === 'REGULAR' || !!r.isCurrentEmployee
    }));

    _rvCache[ck] = { data: reviews, time: now };
    res.json({ source: 'live', reviews, total: data?.data?.reviews?.numberOfRatings || 0 });
  } catch (err) {
    console.error('[Glassdoor reviews]', err.message);
    res.json({ source: 'error', reviews: [], message: err.message });
  }
});

module.exports = router;
