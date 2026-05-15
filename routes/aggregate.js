// routes/aggregate.js
// GET  /api/aggregate/jobs       — 查询已聚合职位
// POST /api/aggregate/refresh    — 手动触发抓取（需 X-Cron-Secret 或管理员）
// GET  /api/aggregate/stats      — 统计数据
// GET  /api/aggregate/cron-logs  — 定时任务运行记录

const express = require('express');
const axios   = require('axios');
const router  = express.Router();
const db      = require('../db/database');

// ── 建表 ──────────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS aggregated_jobs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    source       TEXT NOT NULL,
    company      TEXT NOT NULL,
    company_slug TEXT NOT NULL,
    title        TEXT NOT NULL,
    location     TEXT DEFAULT '',
    department   TEXT DEFAULT '',
    description  TEXT DEFAULT '',
    apply_url    TEXT NOT NULL,
    posted_at    TEXT DEFAULT '',
    sponsorship  TEXT DEFAULT 'unknown',
    is_remote    INTEGER DEFAULT 0,
    job_type     TEXT DEFAULT '',
    fetched_at   TEXT DEFAULT (datetime('now')),
    UNIQUE(source, company_slug, apply_url)
  );
  CREATE INDEX IF NOT EXISTS idx_agg_company   ON aggregated_jobs(company);
  CREATE INDEX IF NOT EXISTS idx_agg_source    ON aggregated_jobs(source);
  CREATE INDEX IF NOT EXISTS idx_agg_sponsor   ON aggregated_jobs(sponsorship);
  CREATE INDEX IF NOT EXISTS idx_agg_remote    ON aggregated_jobs(is_remote);

  CREATE TABLE IF NOT EXISTS cron_logs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    triggered_by TEXT DEFAULT 'n8n',
    total_saved  INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    error_count  INTEGER DEFAULT 0,
    errors_json  TEXT DEFAULT '[]',
    results_json TEXT DEFAULT '[]',
    duration_ms  INTEGER DEFAULT 0,
    status       TEXT DEFAULT 'ok',
    ran_at       TEXT DEFAULT (datetime('now'))
  );
`);

// ── 签证赞助关键词检测 ─────────────────────────────────────────────────────────
const SPONSOR_YES = [
  /sponsor/i, /h[\-\s]?1b/i, /visa\s+support/i, /work\s+authoriz/i,
  /employment\s+authori/i, /relocation\s+assistance/i,
];
const SPONSOR_NO = [
  /no\s+(visa\s+)?sponsor/i, /not\s+able\s+to\s+sponsor/i,
  /cannot\s+sponsor/i, /must\s+(be\s+)?(authorized|eligible)\s+to\s+work/i,
  /must\s+have\s+(work\s+)?authorization/i,
  /us\s+citizen(ship)?\s+(or|and)\s+(permanent\s+resident|green\s+card)/i,
  /permanent\s+resident\s+or\s+citizen/i,
  /without\s+sponsorship/i,
  /no\s+h[\-\s]?1b/i,
];

function detectSponsorship(text) {
  if (!text) return 'unknown';
  if (SPONSOR_NO.some(r => r.test(text))) return 'no';
  if (SPONSOR_YES.some(r => r.test(text))) return 'yes';
  return 'unknown';
}

function isRemote(title, location, desc) {
  const hay = `${title} ${location} ${desc}`.toLowerCase();
  return /remote|anywhere|work from home|wfh/.test(hay) ? 1 : 0;
}

// ── 公司列表 ──────────────────────────────────────────────────────────────────
// Greenhouse: boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true
const GREENHOUSE_COMPANIES = [
  { slug: 'airbnb',      name: 'Airbnb' },
  { slug: 'stripe',      name: 'Stripe' },
  { slug: 'lyft',        name: 'Lyft' },
  { slug: 'doordash',    name: 'DoorDash' },
  { slug: 'coinbase',    name: 'Coinbase' },
  { slug: 'figma',       name: 'Figma' },
  { slug: 'notion',      name: 'Notion' },
  { slug: 'discord',     name: 'Discord' },
  { slug: 'ramp',        name: 'Ramp' },
  { slug: 'brex',        name: 'Brex' },
  { slug: 'scaleai',     name: 'Scale AI' },
  { slug: 'duolingo',    name: 'Duolingo' },
  { slug: 'chime',       name: 'Chime' },
  { slug: 'databricks',  name: 'Databricks' },
  { slug: 'airtable',    name: 'Airtable' },
  { slug: 'robinhood',   name: 'Robinhood' },
  { slug: 'flexport',    name: 'Flexport' },
  { slug: 'checkr',      name: 'Checkr' },
  { slug: 'benchling',   name: 'Benchling' },
];

// Lever: api.lever.co/v0/postings/{slug}?mode=json
const LEVER_COMPANIES = [
  { slug: 'netflix',     name: 'Netflix' },
  { slug: 'plaid',       name: 'Plaid' },
  { slug: 'rippling',    name: 'Rippling' },
  { slug: 'retool',      name: 'Retool' },
  { slug: 'linear',      name: 'Linear' },
  { slug: 'vercel',      name: 'Vercel' },
  { slug: 'huggingface', name: 'Hugging Face' },
  { slug: 'openai',      name: 'OpenAI' },
  { slug: 'anthropic',   name: 'Anthropic' },
];

// ── Greenhouse 抓取 ──────────────────────────────────────────────────────────
async function fetchGreenhouse(co) {
  const url = `https://boards-api.greenhouse.io/v1/boards/${co.slug}/jobs?content=true`;
  const res  = await axios.get(url, { timeout: 15000 });
  const jobs = res.data.jobs || [];
  return jobs.map(j => {
    const loc  = (j.location && j.location.name) || '';
    const dept = (j.departments && j.departments[0] && j.departments[0].name) || '';
    const desc = j.content || '';
    return {
      source:       'greenhouse',
      company:      co.name,
      company_slug: co.slug,
      title:        j.title || '',
      location:     loc,
      department:   dept,
      description:  desc.slice(0, 4000),
      apply_url:    j.absolute_url || '',
      posted_at:    j.updated_at   || '',
      sponsorship:  detectSponsorship(desc),
      is_remote:    isRemote(j.title, loc, desc),
      job_type:     '',
    };
  });
}

// ── Lever 抓取 ───────────────────────────────────────────────────────────────
async function fetchLever(co) {
  const url = `https://api.lever.co/v0/postings/${co.slug}?mode=json`;
  const res  = await axios.get(url, { timeout: 15000 });
  const jobs = Array.isArray(res.data) ? res.data : [];
  return jobs.map(j => {
    const loc  = (j.categories && j.categories.location) || '';
    const dept = (j.categories && j.categories.team)     || '';
    const desc = [
      j.descriptionPlain || '',
      (j.lists || []).map(l => l.content).join(' '),
    ].join(' ');
    return {
      source:       'lever',
      company:      co.name,
      company_slug: co.slug,
      title:        j.text || '',
      location:     loc,
      department:   dept,
      description:  desc.slice(0, 4000),
      apply_url:    j.hostedUrl || j.applyUrl || '',
      posted_at:    j.createdAt ? new Date(j.createdAt).toISOString() : '',
      sponsorship:  detectSponsorship(desc),
      is_remote:    isRemote(j.text, loc, desc),
      job_type:     (j.categories && j.categories.commitment) || '',
    };
  });
}

// ── Upsert 写库 ──────────────────────────────────────────────────────────────
const upsert = db.prepare(`
  INSERT INTO aggregated_jobs
    (source, company, company_slug, title, location, department, description,
     apply_url, posted_at, sponsorship, is_remote, job_type, fetched_at)
  VALUES
    (@source, @company, @company_slug, @title, @location, @department, @description,
     @apply_url, @posted_at, @sponsorship, @is_remote, @job_type, datetime('now'))
  ON CONFLICT(source, company_slug, apply_url) DO UPDATE SET
    title        = excluded.title,
    location     = excluded.location,
    department   = excluded.department,
    description  = excluded.description,
    posted_at    = excluded.posted_at,
    sponsorship  = excluded.sponsorship,
    is_remote    = excluded.is_remote,
    job_type     = excluded.job_type,
    fetched_at   = datetime('now')
`);

const insertMany = db.transaction(jobs => {
  let count = 0;
  for (const j of jobs) {
    if (!j.apply_url) continue;
    upsert.run(j);
    count++;
  }
  return count;
});

// ── CRON_SECRET 鉴权中间件 ────────────────────────────────────────────────────
function cronAuth(req, res, next) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return next(); // 未配置则跳过（开发模式）
  const provided = req.headers['x-cron-secret'] || req.query.secret;
  if (provided && provided === secret) return next();
  // 也接受管理员 token（兼容手动调用）
  const auth = require('../middleware/auth');
  auth.requireAdmin(req, res, next);
}

const insertLog = db.prepare(`
  INSERT INTO cron_logs (triggered_by, total_saved, success_count, error_count, errors_json, results_json, duration_ms, status, ran_at)
  VALUES (@triggered_by, @total_saved, @success_count, @error_count, @errors_json, @results_json, @duration_ms, @status, datetime('now'))
`);

// ── POST /api/aggregate/refresh ──────────────────────────────────────────────
router.post('/refresh', cronAuth, async (req, res) => {
  const startTime   = Date.now();
  const triggeredBy = req.headers['x-triggered-by'] || (req.headers['x-cron-secret'] ? 'n8n' : 'manual');
  const results     = [];
  const errors      = [];

  async function crawl(fetcher, companies) {
    for (const co of companies) {
      try {
        const jobs  = await fetcher(co);
        const count = insertMany(jobs);
        results.push({ company: co.name, source: fetcher === fetchGreenhouse ? 'greenhouse' : 'lever', fetched: jobs.length, saved: count });
      } catch (err) {
        errors.push({ company: co.name, error: err.message });
      }
    }
  }

  await crawl(fetchGreenhouse, GREENHOUSE_COMPANIES);
  await crawl(fetchLever,      LEVER_COMPANIES);

  const total      = results.reduce((s, r) => s + r.saved, 0);
  const durationMs = Date.now() - startTime;
  const status     = errors.length === 0 ? 'ok' : (results.length === 0 ? 'error' : 'partial');

  try {
    insertLog.run({
      triggered_by:  triggeredBy,
      total_saved:   total,
      success_count: results.length,
      error_count:   errors.length,
      errors_json:   JSON.stringify(errors),
      results_json:  JSON.stringify(results),
      duration_ms:   durationMs,
      status,
    });
  } catch (e) {
    console.error('[aggregate] cron_log insert failed:', e.message);
  }

  res.json({ ok: true, total, results, errors, duration_ms: durationMs, status });
});

// ── GET /api/aggregate/jobs ──────────────────────────────────────────────────
router.get('/jobs', (req, res) => {
  const {
    company, source, sponsorship, remote,
    keyword, department,
    page = 1, pageSize = 20,
  } = req.query;

  const pg   = Math.max(1, parseInt(page, 10) || 1);
  const size = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 20));

  const conditions = [];
  const params     = {};

  if (company)     { conditions.push("company LIKE '%' || @company || '%'");     params.company     = company; }
  if (source)      { conditions.push("source = @source");                        params.source      = source; }
  if (sponsorship) { conditions.push("sponsorship = @sponsorship");              params.sponsorship = sponsorship; }
  if (remote === '1' || remote === 'true') { conditions.push("is_remote = 1"); }
  if (keyword)     {
    conditions.push("(title LIKE '%' || @keyword || '%' OR description LIKE '%' || @keyword || '%')");
    params.keyword = keyword;
  }
  if (department)  {
    conditions.push("department LIKE '%' || @department || '%'");
    params.department = department;
  }

  const where  = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const offset = (pg - 1) * size;

  const total = db.prepare(`SELECT COUNT(*) AS n FROM aggregated_jobs ${where}`).get(params).n;
  const jobs  = db.prepare(
    `SELECT id, source, company, company_slug, title, location, department, apply_url,
            posted_at, sponsorship, is_remote, job_type, fetched_at
     FROM aggregated_jobs ${where}
     ORDER BY fetched_at DESC, posted_at DESC
     LIMIT ${size} OFFSET ${offset}`
  ).all(params);

  res.json({ ok: true, total, page: pg, pageSize: size, jobs });
});

// ── GET /api/aggregate/jobs/:id ──────────────────────────────────────────────
router.get('/jobs/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id || id < 1) return res.status(400).json({ ok: false, error: 'invalid id' });
  const job = db.prepare('SELECT * FROM aggregated_jobs WHERE id = ?').get(id);
  if (!job) return res.status(404).json({ ok: false, error: 'not found' });
  res.json({ ok: true, job });
});

// ── GET /api/aggregate/stats ─────────────────────────────────────────────────
router.get('/stats', (_req, res) => {
  const total      = db.prepare('SELECT COUNT(*) AS n FROM aggregated_jobs').get().n;
  const bySource   = db.prepare('SELECT source, COUNT(*) AS n FROM aggregated_jobs GROUP BY source').all();
  const byCompany  = db.prepare('SELECT company, COUNT(*) AS n FROM aggregated_jobs GROUP BY company ORDER BY n DESC LIMIT 20').all();
  const bySponsor  = db.prepare('SELECT sponsorship, COUNT(*) AS n FROM aggregated_jobs GROUP BY sponsorship').all();
  const lastFetch  = db.prepare('SELECT MAX(fetched_at) AS t FROM aggregated_jobs').get().t;
  res.json({ ok: true, total, bySource, byCompany, bySponsor, lastFetch });
});

// ── GET /api/aggregate/cron-logs ─────────────────────────────────────────────
router.get('/cron-logs', (_req, res) => {
  const logs = db.prepare(
    `SELECT id, triggered_by, total_saved, success_count, error_count,
            errors_json, duration_ms, status, ran_at
     FROM cron_logs ORDER BY ran_at DESC LIMIT 30`
  ).all();

  const parsed = logs.map(l => ({
    ...l,
    errors: (() => { try { return JSON.parse(l.errors_json); } catch { return []; } })(),
    errors_json: undefined,
  }));

  const lastRun  = logs[0] || null;
  const totalRuns = db.prepare('SELECT COUNT(*) AS n FROM cron_logs').get().n;

  res.json({ ok: true, totalRuns, lastRun, logs: parsed });
});

module.exports = router;
