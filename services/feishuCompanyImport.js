'use strict';

const http = require('http');
const https = require('https');

let dbInstance = null;
let companyServiceInstance = null;

function getDb() {
  if (!dbInstance) dbInstance = require('../db/database');
  return dbInstance;
}

function getCompanyService() {
  if (!companyServiceInstance) companyServiceInstance = require('./companyService');
  return companyServiceInstance;
}

const DEFAULT_API_BASE = 'https://feishu-bitable-action-api.onrender.com';
const API_BASE = process.env.FEISHU_COMPANY_IMPORT_API_BASE_URL
  || process.env.FEISHU_CONTENT_API_BASE_URL
  || process.env.FEISHU_MINIPROGRAM_API_BASE_URL
  || DEFAULT_API_BASE;

const FIELD_ALIASES = {
  display_name: [
    'name', 'title', 'company', 'displayName', 'display_name',
    '\u516c\u53f8\u540d\u79f0', '\u516c\u53f8\u540d', '\u516c\u53f8',
    '\u4f01\u4e1a\u540d\u79f0', '\u4f01\u4e1a', '\u540d\u79f0'
  ],
  name_zh: [
    'nameZh', 'name_zh', 'chineseName',
    '\u4e2d\u6587\u540d', '\u4e2d\u6587\u540d\u79f0', '\u516c\u53f8\u4e2d\u6587\u540d'
  ],
  name_en: [
    'englishName', 'nameEn', 'name_en', 'enName',
    '\u82f1\u6587\u540d', '\u82f1\u6587\u540d\u79f0', '\u516c\u53f8\u82f1\u6587\u540d'
  ],
  legal_name: ['legalName', 'legal_name', '\u6cd5\u5b9a\u540d\u79f0', '\u6ce8\u518c\u540d\u79f0'],
  official_domain: [
    'officialDomain', 'domain', 'websiteDomain', 'official_domain',
    '\u5b98\u7f51\u57df\u540d', '\u5b98\u65b9\u57df\u540d', '\u57df\u540d'
  ],
  website_url: [
    'websiteUrl', 'website', 'url', 'link', 'officialWebsite',
    '\u5b98\u7f51', '\u5b98\u65b9\u7f51\u7ad9', '\u516c\u53f8\u5b98\u7f51', '\u7f51\u5740', '\u94fe\u63a5'
  ],
  logo_url: ['logo', 'logoUrl', 'image', 'cover', 'icon', 'Logo', '\u516c\u53f8Logo', '\u56fe\u6807'],
  brand_color: ['brandColor', 'color', 'brand_color', '\u54c1\u724c\u8272', '\u54c1\u724c\u989c\u8272'],
  industry_l1: [
    'industry', 'industryL1', 'category', 'sector', 'track',
    '\u884c\u4e1a', '\u4e00\u7ea7\u884c\u4e1a', '\u884c\u4e1a\u5206\u7c7b', '\u8d5b\u9053'
  ],
  industry_l2: [
    'industryL2', 'direction', 'subIndustry', 'business',
    '\u4e8c\u7ea7\u884c\u4e1a', '\u7ec6\u5206\u884c\u4e1a', '\u65b9\u5411',
    '\u4e1a\u52a1\u65b9\u5411', '\u4e3b\u8425\u4e1a\u52a1'
  ],
  hq_country: ['hqCountry', 'country', 'region', '\u603b\u90e8\u56fd\u5bb6', '\u56fd\u5bb6', '\u5730\u533a'],
  hq_city: ['hqCity', 'city', 'headquarters', '\u603b\u90e8\u57ce\u5e02', '\u603b\u90e8', '\u57ce\u5e02', '\u6240\u5728\u5730'],
  founded_year: ['foundedYear', 'founded', 'foundingYear', '\u6210\u7acb\u5e74\u4efd', '\u6210\u7acb\u65f6\u95f4', '\u521b\u7acb\u5e74\u4efd'],
  employee_count: ['employeeCount', 'employee_count', '\u5458\u5de5\u6570', '\u5458\u5de5\u4eba\u6570'],
  employee_range: [
    'size', 'employeeRange', 'employee_range',
    '\u89c4\u6a21', '\u516c\u53f8\u89c4\u6a21', '\u4f01\u4e1a\u89c4\u6a21', '\u5458\u5de5\u89c4\u6a21'
  ],
  market: ['market', '\u5e02\u573a', '\u4e0a\u5e02\u5730'],
  ticker: ['ticker', 'symbol', 'stockCode', '\u80a1\u7968\u4ee3\u7801', '\u8bc1\u5238\u4ee3\u7801'],
  exchange_name: ['exchangeName', 'exchange', 'exchange_name', '\u4ea4\u6613\u6240', '\u4e0a\u5e02\u4ea4\u6613\u6240'],
  is_public: ['isPublic', 'public', 'listed', '\u662f\u5426\u4e0a\u5e02', '\u4e0a\u5e02\u516c\u53f8'],
  description_zh: [
    'descriptionZh', 'description', 'summary', 'desc', 'services',
    '\u4e2d\u6587\u7b80\u4ecb', '\u516c\u53f8\u7b80\u4ecb', '\u7b80\u4ecb', '\u63cf\u8ff0',
    '\u6458\u8981', '\u4ecb\u7ecd', '\u4e1a\u52a1\u4ecb\u7ecd'
  ],
  description_en: ['descriptionEn', 'description_en', 'englishDescription', '\u82f1\u6587\u7b80\u4ecb'],
  tags: ['tags', 'keywords', 'labels', '\u6807\u7b7e', '\u4eae\u70b9', '\u5173\u952e\u8bcd'],
  aliases: ['aliases', 'alias', 'otherNames', '\u522b\u540d', '\u522b\u79f0', '\u516c\u53f8\u522b\u540d'],
  data_status: ['dataStatus', 'status', 'publishStatus', '\u72b6\u6001', '\u53d1\u5e03\u72b6\u6001', '\u662f\u5426\u5c55\u793a']
};

function normalizeFieldName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_\-:：\\/()（）[\]【】<>《》]/g, '');
}

function fieldsOf(item) {
  return (item && item.fields) || {};
}

function isBlankValue(value) {
  if (value === undefined || value === null || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

function text(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(', ');
  if (typeof value === 'object') {
    const preferredKeys = [
      'text', 'name', 'value', 'title', 'label', 'displayName', 'display_name',
      'zh_name', 'en_name', 'full_name', 'link', 'url'
    ];
    if (Array.isArray(value.text_arr)) return value.text_arr.map(text).filter(Boolean).join(', ');
    if (Array.isArray(value.value_arr)) return value.value_arr.map(text).filter(Boolean).join(', ');
    if (Array.isArray(value.values)) return value.values.map(text).filter(Boolean).join(', ');
    if (Array.isArray(value.options)) return value.options.map(text).filter(Boolean).join(', ');
    for (const key of preferredKeys) {
      if (value[key] !== undefined && value[key] !== null && value[key] !== '') return text(value[key]);
    }
    const scalarValues = Object.values(value).filter(item => (
      item !== undefined &&
      item !== null &&
      item !== '' &&
      ['string', 'number', 'boolean'].includes(typeof item)
    ));
    if (scalarValues.length === 1) return text(scalarValues[0]);
    if (Object.keys(value).length === 0) return '';
  }
  return String(value).trim();
}

function read(item, aliases) {
  const fields = fieldsOf(item);
  for (const name of aliases) {
    const direct = item && item[name];
    if (!isBlankValue(direct)) return direct;
    const field = fields[name];
    if (!isBlankValue(field)) return field;
  }

  const normalizedAliases = aliases.map(normalizeFieldName).filter(Boolean);
  for (const [key, value] of Object.entries(fields)) {
    if (isBlankValue(value)) continue;
    const normalizedKey = normalizeFieldName(key);
    if (normalizedAliases.includes(normalizedKey)) return value;
  }

  for (const [key, value] of Object.entries(fields)) {
    if (isBlankValue(value)) continue;
    const normalizedKey = normalizeFieldName(key);
    if (normalizedAliases.some(alias => alias.length >= 4 && normalizedKey.includes(alias))) return value;
  }

  return '';
}

function pick(item, key) {
  return read(item, FIELD_ALIASES[key] || [key]);
}

function listValue(value) {
  if (value === undefined || value === null || value === '') return [];
  if (Array.isArray(value)) return Array.from(new Set(value.map(text).filter(Boolean)));
  return Array.from(new Set(text(value).split(/[,;，；、|/\n]/).map(item => item.trim()).filter(Boolean)));
}

function urlValue(value) {
  if (!value) return '';
  if (Array.isArray(value)) {
    for (const item of value) {
      const url = urlValue(item);
      if (url) return url;
    }
  }
  if (typeof value === 'object') {
    if (value.link) return String(value.link).trim();
    if (value.url) return String(value.url).trim();
  }
  const raw = text(value);
  const match = raw.match(/https?:\/\/[^\s,;，；)）]+/i);
  return match ? match[0] : '';
}

function domainValue(value) {
  const raw = urlValue(value) || text(value);
  if (!raw) return '';
  return raw
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split(/[/?#]/)[0]
    .trim()
    .toLowerCase();
}

function yearValue(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') {
    if (value >= 1800 && value <= 2200) return value;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.getFullYear();
  }
  const match = text(value).match(/(18|19|20|21)\d{2}/);
  return match ? Number(match[0]) : null;
}

function numberValue(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return value;
  const match = text(value).replace(/,/g, '').match(/\d+/);
  return match ? Number(match[0]) : null;
}

function boolValue(value, fallback) {
  const raw = text(value).toLowerCase();
  if (!raw) return !!fallback;
  if (/^(1|true|yes|y|public|listed|是|已上市|上市)$/.test(raw)) return true;
  if (/^(0|false|no|n|private|否|未上市|非上市)$/.test(raw)) return false;
  return !!fallback;
}

function statusValue(value) {
  if (typeof value === 'boolean') return value ? 'published' : 'archived';
  const raw = text(value).toLowerCase();
  if (/archive|inactive|hidden|disabled|下架|停用|禁用|不展示|不显示|否/.test(raw)) return 'archived';
  if (/draft|草稿/.test(raw)) return 'draft';
  return 'published';
}

function isChineseText(value) {
  return /[\u4e00-\u9fff]/.test(String(value || ''));
}

function slugify(value, fallback) {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback || `company-${Date.now()}`;
}

function normalizeCompanyItem(item, syncedAt) {
  const displayName = text(pick(item, 'display_name'));
  const nameZh = text(pick(item, 'name_zh')) || (isChineseText(displayName) ? displayName : '');
  const nameEn = text(pick(item, 'name_en')) || (!isChineseText(displayName) ? displayName : '');
  const name = displayName || nameZh || nameEn;
  if (!name) return null;

  const website = urlValue(pick(item, 'website_url'));
  const domain = domainValue(pick(item, 'official_domain')) || domainValue(website);
  const ticker = text(pick(item, 'ticker'));
  const industryL1 = text(pick(item, 'industry_l1'));
  const industryL2 = text(pick(item, 'industry_l2'));
  const recordId = text(item && (item.record_id || item.recordId || item.id));
  const slugSource = nameEn || domain.split('.')[0] || recordId || name;
  const tags = listValue(pick(item, 'tags'));
  const aliases = listValue(pick(item, 'aliases')).concat([displayName, nameZh, nameEn].filter(Boolean));

  return {
    slug: slugify(slugSource, recordId ? `feishu-${recordId}` : ''),
    display_name: name,
    name_zh: nameZh,
    name_en: nameEn,
    legal_name: text(pick(item, 'legal_name')),
    official_domain: domain,
    website_url: website || (domain ? `https://${domain}` : ''),
    logo_url: urlValue(pick(item, 'logo_url')),
    logo_source: 'feishu',
    logo_status: 'ready',
    brand_color: text(pick(item, 'brand_color')),
    industry_l1: industryL1 || industryL2 || tags[0] || '',
    industry_l2: industryL2,
    hq_country: text(pick(item, 'hq_country')),
    hq_city: text(pick(item, 'hq_city')),
    founded_year: yearValue(pick(item, 'founded_year')),
    employee_count: numberValue(pick(item, 'employee_count')),
    employee_range: text(pick(item, 'employee_range')),
    market: text(pick(item, 'market')),
    ticker,
    exchange_name: text(pick(item, 'exchange_name')),
    is_public: boolValue(pick(item, 'is_public'), !!ticker),
    description_zh: text(pick(item, 'description_zh')),
    description_en: text(pick(item, 'description_en')),
    tags,
    aliases: Array.from(new Set(aliases)),
    source_primary: 'feishu',
    data_status: statusValue(pick(item, 'data_status')),
    last_synced_at: syncedAt,
    replace_aliases: true,
    feishu_record_id: recordId,
    feishu_fields: fieldsOf(item),
    feishu_item: item
  };
}

function findExistingCompany(company) {
  const db = getDb();
  if (company.official_domain) {
    const byDomain = db.prepare('SELECT id, slug FROM companies WHERE official_domain = ?').get(company.official_domain);
    if (byDomain) return byDomain;
  }

  const names = Array.from(new Set([
    company.display_name,
    company.name_zh,
    company.name_en,
    company.legal_name,
    ...(company.aliases || [])
  ].filter(Boolean)));

  if (!names.length) return null;
  const placeholders = names.map(() => '?').join(',');
  return db.prepare(`
    SELECT c.id, c.slug
    FROM companies c
    WHERE c.display_name IN (${placeholders})
       OR c.name_zh IN (${placeholders})
       OR c.name_en IN (${placeholders})
       OR c.legal_name IN (${placeholders})
       OR EXISTS (
         SELECT 1 FROM company_aliases a
         WHERE a.company_id = c.id AND a.alias IN (${placeholders})
       )
    LIMIT 1
  `).get(...names, ...names, ...names, ...names, ...names);
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'http:' ? http : https;
    const req = client.request(parsed, { method: 'GET', timeout: 30000 }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`Feishu content API HTTP ${res.statusCode}: ${body.slice(0, 160)}`));
          return;
        }
        try {
          resolve(JSON.parse(body || '{}'));
        } catch (err) {
          reject(new Error(`Feishu content API JSON parse failed: ${err.message}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Feishu content API timeout')));
    req.end();
  });
}

async function fetchCompanyItems(options = {}) {
  const pageSize = Math.min(Math.max(Number(options.pageSize || 100), 1), 100);
  const maxRecords = Math.max(Number(options.maxRecords || process.env.FEISHU_COMPANY_IMPORT_MAX || 1000), 1);
  const all = [];
  let offset = 0;

  while (all.length < maxRecords) {
    const url = new URL('/api/miniprogram/companies', API_BASE);
    url.searchParams.set('limit', String(Math.min(pageSize, maxRecords - all.length)));
    url.searchParams.set('offset', String(offset));
    if (options.q) url.searchParams.set('q', options.q);

    const res = await fetchJson(url.toString());
    const items = Array.isArray(res.items) ? res.items : [];
    all.push(...items);

    const total = Number(res.total || 0);
    if (!items.length || (total && all.length >= total)) break;
    offset += items.length;
  }

  return all;
}

function writeSyncLog(status, message, payload) {
  const db = getDb();
  db.prepare(`
    INSERT INTO company_sync_logs (provider, sync_type, status, message, payload)
    VALUES (?, ?, ?, ?, ?)
  `).run('feishu', 'company_content_api', status, message, JSON.stringify(payload || {}));
}

async function importFeishuCompanies(options = {}) {
  const dryRun = !!options.dryRun;
  const syncedAt = new Date().toISOString();
  const rawItems = await fetchCompanyItems(options);
  const transformed = rawItems.map(item => normalizeCompanyItem(item, syncedAt)).filter(Boolean);
  const seen = new Set();
  const companies = transformed.filter(company => {
    const key = String(company.official_domain || company.display_name || company.slug).toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (dryRun) {
    return {
      dryRun: true,
      raw: rawItems.length,
      valid: transformed.length,
      imported: companies.length,
      preview: companies.slice(0, 10)
    };
  }

  let inserted = 0;
  let updated = 0;
  const db = getDb();
  const companyService = getCompanyService();
  const tx = db.transaction(() => {
    for (const company of companies) {
      const match = findExistingCompany(company);
      if (match) company.slug = match.slug;
      const existing = db.prepare('SELECT id FROM companies WHERE slug = ?').get(company.slug);
      companyService.upsertCompany(company);
      if (existing || match) updated += 1;
      else inserted += 1;
    }
  });
  tx();

  const result = {
    dryRun: false,
    raw: rawItems.length,
    valid: transformed.length,
    imported: companies.length,
    inserted,
    updated,
    total: db.prepare('SELECT COUNT(*) as c FROM companies').get().c
  };
  writeSyncLog('success', `Imported ${companies.length} companies from Feishu content API`, result);
  return result;
}

module.exports = {
  importFeishuCompanies,
  fetchCompanyItems,
  normalizeCompanyItem,
  normalizeFieldName,
  text,
  listValue
};
