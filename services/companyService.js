const path = require('path');
const db = require('../db/database');
const { ja } = require('../db/utils');

const seedCompanies = require(path.join(__dirname, '../data/companies.seed.json'));

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || `company-${Date.now()}`;
}

function logoPath(row) {
  if (row.logo_url) return row.logo_url;
  const params = new URLSearchParams();
  if (row.official_domain) params.set('domain', row.official_domain);
  params.set('name', row.display_name || row.name_en || row.name_zh || 'Company');
  return `/api/logo?${params.toString()}`;
}

function mapCompany(row, counts) {
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.display_name,
    displayName: row.display_name,
    nameZh: row.name_zh,
    nameEn: row.name_en,
    legalName: row.legal_name,
    officialDomain: row.official_domain,
    websiteUrl: row.website_url || (row.official_domain ? `https://${row.official_domain}` : ''),
    logo: logoPath(row),
    logoUrl: logoPath(row),
    logoSource: row.logo_source,
    logoStatus: row.logo_status,
    brandColor: row.brand_color,
    industry: row.industry_l1,
    industryL1: row.industry_l1,
    industryL2: row.industry_l2,
    hqCountry: row.hq_country,
    hqCity: row.hq_city,
    headquarters: [row.hq_city, row.hq_country].filter(Boolean).join(', '),
    founded: row.founded_year ? String(row.founded_year) : '',
    foundedYear: row.founded_year,
    employeeRange: row.employee_range,
    size: row.employee_range,
    market: row.market,
    ticker: row.ticker,
    exchangeName: row.exchange_name,
    isPublic: !!row.is_public,
    description: row.description_zh || row.description_en || '',
    descriptionZh: row.description_zh,
    descriptionEn: row.description_en,
    tags: ja(row.tags),
    dataStatus: row.data_status,
    lastSyncedAt: row.last_synced_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    jobCount: counts?.jobCount || 0,
    experienceCount: counts?.experienceCount || 0,
    salaryCount: counts?.salaryCount || 0
  };
}

function matchNames(row) {
  const aliases = db.prepare('SELECT alias FROM company_aliases WHERE company_id = ?').all(row.id).map(a => a.alias);
  return Array.from(new Set([
    row.display_name,
    row.name_zh,
    row.name_en,
    row.legal_name,
    ...aliases
  ].filter(Boolean)));
}

function countByNames(table, names) {
  if (!names.length) return 0;
  const placeholders = names.map(() => '?').join(',');
  return db.prepare(`SELECT COUNT(*) as c FROM ${table} WHERE company IN (${placeholders})`).get(...names).c;
}

function getCounts(row) {
  const names = matchNames(row);
  return {
    jobCount: countByNames('jobs', names),
    experienceCount: countByNames('experiences', names),
    salaryCount: countByNames('salaries', names)
  };
}

function upsertAliases(companyId, aliases) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO company_aliases (company_id, alias, alias_type, lang, is_primary)
    VALUES (?, ?, ?, ?, ?)
  `);
  aliases.filter(Boolean).forEach((alias, index) => {
    stmt.run(companyId, alias, 'name', 'auto', index === 0 ? 1 : 0);
  });
}

function upsertCompany(item) {
  const slug = item.slug || slugify(item.name_en || item.display_name || item.name_zh);
  const row = db.prepare('SELECT id FROM companies WHERE slug = ?').get(slug);
  const payload = [
    slug,
    item.display_name || item.name_en || item.name_zh,
    item.name_zh || '',
    item.name_en || '',
    item.legal_name || '',
    item.official_domain || '',
    item.website_url || (item.official_domain ? `https://${item.official_domain}` : ''),
    item.logo_url || '',
    item.logo_source || (item.logo_url ? 'seed' : 'backend-logo'),
    item.logo_status || 'ready',
    item.brand_color || '',
    item.industry_l1 || '',
    item.industry_l2 || '',
    item.hq_country || '',
    item.hq_city || '',
    item.founded_year || null,
    item.employee_count || null,
    item.employee_range || '',
    item.market || '',
    item.ticker || '',
    item.exchange_name || '',
    item.is_public ? 1 : 0,
    item.description_zh || '',
    item.description_en || '',
    JSON.stringify(item.tags || []),
    item.source_primary || 'seed',
    JSON.stringify(item),
    item.data_status || 'published'
  ];

  let companyId;
  if (row) {
    db.prepare(`
      UPDATE companies SET
        slug=?, display_name=?, name_zh=?, name_en=?, legal_name=?, official_domain=?,
        website_url=?, logo_url=?, logo_source=?, logo_status=?, brand_color=?,
        industry_l1=?, industry_l2=?, hq_country=?, hq_city=?, founded_year=?,
        employee_count=?, employee_range=?, market=?, ticker=?, exchange_name=?,
        is_public=?, description_zh=?, description_en=?, tags=?, source_primary=?,
        source_payload=?, data_status=?, updated_at=datetime('now')
      WHERE id=?
    `).run(...payload, row.id);
    companyId = row.id;
  } else {
    const result = db.prepare(`
      INSERT INTO companies (
        slug, display_name, name_zh, name_en, legal_name, official_domain,
        website_url, logo_url, logo_source, logo_status, brand_color,
        industry_l1, industry_l2, hq_country, hq_city, founded_year,
        employee_count, employee_range, market, ticker, exchange_name,
        is_public, description_zh, description_en, tags, source_primary,
        source_payload, data_status
      ) VALUES (${payload.map(() => '?').join(',')})
    `).run(...payload);
    companyId = result.lastInsertRowid;
  }

  upsertAliases(companyId, [
    item.display_name,
    item.name_zh,
    item.name_en,
    item.legal_name,
    ...(item.aliases || [])
  ]);
  return companyId;
}

function importSeedCompanies() {
  const before = db.prepare('SELECT COUNT(*) as c FROM companies').get().c;
  const tx = db.transaction(() => {
    seedCompanies.forEach(upsertCompany);
  });
  tx();
  const after = db.prepare('SELECT COUNT(*) as c FROM companies').get().c;
  return { imported: seedCompanies.length, before, after };
}

function ensureSeedCompanies() {
  const count = db.prepare('SELECT COUNT(*) as c FROM companies').get().c;
  if (count === 0) importSeedCompanies();
}

function listCompanies(options = {}) {
  ensureSeedCompanies();
  const page = Math.max(parseInt(options.page || 1, 10), 1);
  const pageSize = Math.min(Math.max(parseInt(options.pageSize || 20, 10), 1), 100);
  const offset = (page - 1) * pageSize;
  const where = [];
  const params = [];

  if (options.keyword) {
    const kw = `%${options.keyword}%`;
    where.push(`(
      c.display_name LIKE ? OR c.name_zh LIKE ? OR c.name_en LIKE ? OR
      c.legal_name LIKE ? OR c.official_domain LIKE ? OR
      EXISTS (SELECT 1 FROM company_aliases a WHERE a.company_id = c.id AND a.alias LIKE ?)
    )`);
    params.push(kw, kw, kw, kw, kw, kw);
  }
  if (options.industry) {
    where.push('c.industry_l1 = ?');
    params.push(options.industry);
  }
  if (options.country) {
    where.push('c.hq_country = ?');
    params.push(options.country);
  }

  const sqlWhere = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) as c FROM companies c ${sqlWhere}`).get(...params).c;
  const rows = db.prepare(`
    SELECT c.* FROM companies c
    ${sqlWhere}
    ORDER BY c.data_status DESC, c.display_name ASC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset);

  return {
    list: rows.map(row => mapCompany(row, getCounts(row))),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize)
  };
}

function getCompanyById(id) {
  ensureSeedCompanies();
  const row = db.prepare('SELECT * FROM companies WHERE id = ?').get(id);
  if (!row) return null;
  const names = matchNames(row);
  const placeholders = names.map(() => '?').join(',');
  const jobs = names.length
    ? db.prepare(`SELECT id, title, company, salary, location, job_type, company_logo FROM jobs WHERE company IN (${placeholders}) ORDER BY posted_at DESC LIMIT 12`).all(...names)
    : [];
  const experiences = names.length
    ? db.prepare(`SELECT id, title, company, position, type, round, likes_count, created_at FROM experiences WHERE company IN (${placeholders}) ORDER BY created_at DESC LIMIT 12`).all(...names)
    : [];
  const salaries = names.length
    ? db.prepare(`SELECT position, AVG(total_compensation) as avgTotal, MIN(total_compensation) as minTotal, MAX(total_compensation) as maxTotal, currency, COUNT(*) as samples FROM salaries WHERE company IN (${placeholders}) GROUP BY position, currency LIMIT 12`).all(...names)
    : [];
  return {
    ...mapCompany(row, getCounts(row)),
    aliases: matchNames(row),
    jobs,
    experiences: experiences.map(exp => ({
      id: exp.id,
      title: exp.title,
      company: exp.company,
      position: exp.position,
      type: exp.type,
      round: exp.round,
      likesCount: exp.likes_count,
      createdAt: exp.created_at
    })),
    salaries: salaries.map(s => ({
      position: s.position,
      avgSalary: Math.round(s.avgTotal || 0),
      range: `${Math.round(s.minTotal || 0)}-${Math.round(s.maxTotal || 0)} ${s.currency || ''}`.trim(),
      samples: s.samples,
      currency: s.currency
    }))
  };
}

function createCompany(body) {
  const id = upsertCompany({
    slug: body.slug || slugify(body.display_name || body.name || body.name_en || body.name_zh),
    display_name: body.display_name || body.name || body.name_en || body.name_zh,
    name_zh: body.name_zh || '',
    name_en: body.name_en || '',
    legal_name: body.legal_name || '',
    official_domain: body.official_domain || '',
    website_url: body.website_url || '',
    logo_url: body.logo_url || '',
    brand_color: body.brand_color || '',
    industry_l1: body.industry_l1 || body.industry || '',
    industry_l2: body.industry_l2 || '',
    hq_country: body.hq_country || '',
    hq_city: body.hq_city || '',
    founded_year: body.founded_year || null,
    employee_range: body.employee_range || body.size || '',
    market: body.market || '',
    ticker: body.ticker || '',
    exchange_name: body.exchange_name || '',
    is_public: body.is_public ? 1 : 0,
    description_zh: body.description_zh || body.description || '',
    description_en: body.description_en || '',
    tags: Array.isArray(body.tags) ? body.tags : String(body.tags || '').split(',').map(s => s.trim()).filter(Boolean),
    aliases: Array.isArray(body.aliases) ? body.aliases : String(body.aliases || '').split(',').map(s => s.trim()).filter(Boolean),
    source_primary: 'admin',
    data_status: body.data_status || 'published'
  });
  return getCompanyById(id);
}

function updateCompany(id, body) {
  const existing = db.prepare('SELECT * FROM companies WHERE id = ?').get(id);
  if (!existing) return null;
  const updated = Object.assign({}, existing, {
    slug: body.slug || existing.slug,
    display_name: body.display_name || body.name || existing.display_name,
    name_zh: body.name_zh ?? existing.name_zh,
    name_en: body.name_en ?? existing.name_en,
    legal_name: body.legal_name ?? existing.legal_name,
    official_domain: body.official_domain ?? existing.official_domain,
    website_url: body.website_url ?? existing.website_url,
    logo_url: body.logo_url ?? existing.logo_url,
    brand_color: body.brand_color ?? existing.brand_color,
    industry_l1: body.industry_l1 || body.industry || existing.industry_l1,
    industry_l2: body.industry_l2 ?? existing.industry_l2,
    hq_country: body.hq_country ?? existing.hq_country,
    hq_city: body.hq_city ?? existing.hq_city,
    founded_year: body.founded_year ?? existing.founded_year,
    employee_range: body.employee_range || body.size || existing.employee_range,
    market: body.market ?? existing.market,
    ticker: body.ticker ?? existing.ticker,
    exchange_name: body.exchange_name ?? existing.exchange_name,
    is_public: body.is_public ? 1 : 0,
    description_zh: body.description_zh || body.description || existing.description_zh,
    description_en: body.description_en ?? existing.description_en,
    tags: Array.isArray(body.tags) ? body.tags : String(body.tags || ja(existing.tags).join(',')).split(',').map(s => s.trim()).filter(Boolean),
    aliases: Array.isArray(body.aliases) ? body.aliases : String(body.aliases || '').split(',').map(s => s.trim()).filter(Boolean),
    source_primary: 'admin',
    data_status: body.data_status || existing.data_status
  });
  upsertCompany(updated);
  if (body.aliases !== undefined) {
    db.prepare('DELETE FROM company_aliases WHERE company_id = ?').run(id);
    upsertAliases(id, [
      updated.display_name,
      updated.name_zh,
      updated.name_en,
      updated.legal_name,
      ...(updated.aliases || [])
    ]);
  }
  return getCompanyById(id);
}

function deleteCompany(id) {
  return db.prepare('DELETE FROM companies WHERE id = ?').run(id).changes;
}

module.exports = {
  ensureSeedCompanies,
  importSeedCompanies,
  listCompanies,
  getCompanyById,
  createCompany,
  updateCompany,
  deleteCompany
};
