'use strict';

require('dotenv').config();

const https = require('https');
const db = require('../db/database');
const companyService = require('../services/companyService');

const APP_ID = process.env.FEISHU_COMPANY_APP_ID || process.env.FEISHU_APP_ID || process.env.FEISHU_CAMPUS_APP_ID;
const APP_SECRET = process.env.FEISHU_COMPANY_APP_SECRET || process.env.FEISHU_APP_SECRET || process.env.FEISHU_CAMPUS_APP_SECRET;
const WIKI_TOKEN = process.env.FEISHU_COMPANY_WIKI_TOKEN;
const BASE_TOKEN_ENV = process.env.FEISHU_COMPANY_BASE_TOKEN || '';
const TABLE_ID_ENV = process.env.FEISHU_COMPANY_TABLE_ID || '';
const TABLE_NAME = process.env.FEISHU_COMPANY_TABLE_NAME || '';
const DRY_RUN = process.argv.includes('--dry-run');

const FIELD_CANDIDATES = {
  display_name: ['展示名称', '公司名称', '公司名', '公司', '企业名称', '企业', '名称', 'display_name', 'displayName', 'company', 'company name', 'name'],
  slug: ['slug', '唯一标识', '路径', '短链标识'],
  name_zh: ['中文名', '中文名称', '公司中文名', '企业中文名', 'name_zh', 'zh name', 'chinese name', '中文'],
  name_en: ['英文名', '英文名称', '公司英文名', '企业英文名', 'name_en', 'en name', 'english name', '英文'],
  legal_name: ['法定名称', '主体名称', '注册名称', 'legal_name', 'legal name'],
  official_domain: ['官网域名', '官方域名', '域名', 'domain', 'official_domain', 'official domain'],
  website_url: ['官网', '官方网站', '网站', '公司官网', 'website', 'website_url', 'official website', 'url'],
  logo_url: ['logo', 'logo url', 'logo_url', '公司logo', '企业logo', '图标'],
  logo_source: ['logo来源', 'logo_source'],
  logo_status: ['logo状态', 'logo_status'],
  brand_color: ['品牌色', '品牌颜色', 'brand_color', 'brand color'],
  industry_l1: ['一级行业', '行业', '行业类型', '公司行业', '企业行业', 'industry', 'industry_l1', 'primary industry'],
  industry_l2: ['二级行业', '细分行业', '业务方向', '主营业务', 'industry_l2', 'sub industry'],
  hq_country: ['总部国家', '国家', '地区', '总部地区', 'country', 'hq_country'],
  hq_city: ['总部城市', '总部', '城市', 'city', 'hq_city', 'headquarters'],
  founded_year: ['成立年份', '成立时间', '创立年份', '创立时间', 'founded_year', 'founded', 'founded year'],
  employee_count: ['员工数', '员工人数', 'employee_count', 'employee count'],
  employee_range: ['员工规模', '公司规模', '企业规模', '规模', 'size', 'employee_range', 'employee range'],
  market: ['市场', '上市地', '交易市场', 'market'],
  ticker: ['股票代码', '证券代码', 'ticker', 'stock code', 'symbol'],
  exchange_name: ['交易所', '上市交易所', 'exchange', 'exchange_name'],
  is_public: ['是否上市', '上市公司', '上市状态', 'is_public', 'public'],
  description_zh: ['中文简介', '公司简介', '企业简介', '简介', '介绍', 'description_zh', 'description cn', '介绍中文'],
  description_en: ['英文简介', 'description_en', 'description en', 'english description'],
  tags: ['标签', '关键词', 'tags', 'keywords'],
  aliases: ['公司别名', '企业别名', '别名', '别称', '曾用名', 'aliases', 'alias'],
  data_status: ['是否小程序展示', '是否官网展示', '状态', '发布状态', '数据状态', 'data_status', 'status']
};

function assertConfig() {
  const missing = [];
  if (!APP_ID) missing.push('FEISHU_COMPANY_APP_ID or FEISHU_APP_ID or FEISHU_CAMPUS_APP_ID');
  if (!APP_SECRET) missing.push('FEISHU_COMPANY_APP_SECRET or FEISHU_APP_SECRET or FEISHU_CAMPUS_APP_SECRET');
  if (!BASE_TOKEN_ENV && !WIKI_TOKEN) missing.push('FEISHU_COMPANY_BASE_TOKEN or FEISHU_COMPANY_WIKI_TOKEN');
  if (missing.length) {
    throw new Error(`Missing Feishu company sync config: ${missing.join(', ')}`);
  }
}

function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data || '{}');
          if (parsed.code && parsed.code !== 0) {
            reject(new Error(`${parsed.msg || 'Feishu API error'} (${parsed.code})`));
            return;
          }
          resolve(parsed);
        } catch {
          reject(new Error(`JSON parse error: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('request timeout')));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function getAccessToken() {
  const res = await request({
    hostname: 'open.feishu.cn',
    path: '/open-apis/auth/v3/tenant_access_token/internal',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { app_id: APP_ID, app_secret: APP_SECRET });

  if (!res.tenant_access_token) throw new Error('Feishu tenant access token is empty');
  return res.tenant_access_token;
}

function apiGet(token, path) {
  return request({
    hostname: 'open.feishu.cn',
    path,
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` }
  });
}

async function resolveBaseToken(token) {
  if (BASE_TOKEN_ENV) return BASE_TOKEN_ENV;
  const qs = new URLSearchParams({ token: WIKI_TOKEN }).toString();
  const res = await apiGet(token, `/open-apis/wiki/v2/spaces/get_node?${qs}`);
  const node = res.data && res.data.node;
  if (!node) throw new Error('Feishu wiki node not found');
  if (node.obj_type !== 'bitable') {
    throw new Error(`Feishu wiki node is ${node.obj_type}, expected bitable`);
  }
  if (!node.obj_token) throw new Error('Feishu wiki node has no obj_token');
  console.log(`   Base: ${node.title || node.obj_token}`);
  return node.obj_token;
}

async function listTables(token, baseToken) {
  const res = await apiGet(token, `/open-apis/bitable/v1/apps/${baseToken}/tables?page_size=100`);
  return (res.data && res.data.items || []).map(item => ({
    id: item.table_id,
    name: item.name || item.table_name || ''
  }));
}

async function resolveTableId(token, baseToken) {
  if (TABLE_ID_ENV) return TABLE_ID_ENV;
  const tables = await listTables(token, baseToken);
  if (!tables.length) throw new Error('No tables found in Feishu Base');

  if (TABLE_NAME) {
    const exact = tables.find(table => table.name === TABLE_NAME);
    if (exact) return exact.id;
    throw new Error(`Configured FEISHU_COMPANY_TABLE_NAME not found: ${TABLE_NAME}`);
  }

  const matched = tables.filter(table => /公司|企业|company/i.test(table.name));
  if (matched.length === 1) return matched[0].id;
  if (tables.length === 1) return tables[0].id;

  const names = tables.map(table => `${table.name || '(未命名)'}=${table.id}`).join(', ');
  throw new Error(`Multiple tables found; set FEISHU_COMPANY_TABLE_ID. Tables: ${names}`);
}

async function fetchAllRecords(token, baseToken, tableId) {
  const all = [];
  let pageToken = '';
  let page = 1;

  while (true) {
    console.log(`   拉取公司表第 ${page} 页...`);
    const qs = new URLSearchParams({ page_size: '500' });
    if (pageToken) qs.set('page_token', pageToken);
    const res = await apiGet(token, `/open-apis/bitable/v1/apps/${baseToken}/tables/${tableId}/records?${qs.toString()}`);
    const items = res.data && res.data.items || [];
    all.push(...items);
    console.log(`   本页 ${items.length} 条，累计 ${all.length} 条`);
    if (!res.data || !res.data.has_more) break;
    pageToken = res.data.page_token;
    page += 1;
  }

  return all;
}

function normalizeFieldName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_\-:：/\\（）()【】[\]<>《》]/g, '');
}

function pickField(fields, candidates) {
  const entries = Object.entries(fields || {});
  for (const name of candidates) {
    if (Object.prototype.hasOwnProperty.call(fields, name)) return fields[name];
  }

  const normalizedCandidates = candidates.map(normalizeFieldName).filter(Boolean);
  for (const [key, value] of entries) {
    const normalizedKey = normalizeFieldName(key);
    if (normalizedCandidates.includes(normalizedKey)) return value;
  }

  for (const [key, value] of entries) {
    const normalizedKey = normalizeFieldName(key);
    if (normalizedCandidates.some(name => (
      normalizedKey.length >= 4 &&
      name.length >= 4 &&
      (normalizedKey.includes(name) || name.includes(normalizedKey))
    ))) {
      return value;
    }
  }

  return '';
}

function pick(fields, key) {
  return pickField(fields, FIELD_CANDIDATES[key] || [key]);
}

function text(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(', ');
  if (typeof value === 'object') {
    if (Array.isArray(value.text_arr)) return value.text_arr.map(text).filter(Boolean).join(', ');
    if (Array.isArray(value.text)) return text(value.text);
    if (value.text !== undefined) return text(value.text);
    if (value.name !== undefined) return text(value.name);
    if (value.value !== undefined) return text(value.value);
    if (value.title !== undefined) return text(value.title);
    if (value.link !== undefined) return text(value.link);
    if (value.url !== undefined) return text(value.url);
  }
  return String(value).trim();
}

function listValue(value) {
  if (value === undefined || value === null || value === '') return [];
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map(text).filter(Boolean)));
  }
  return Array.from(new Set(text(value).split(/[,\n，、;；|/]/).map(item => item.trim()).filter(Boolean)));
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
    if (value.text && /^https?:\/\//i.test(text(value.text))) return text(value.text);
  }
  const raw = text(value);
  const match = raw.match(/https?:\/\/[^\s，,;；)）]+/i);
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
  if (!value) return null;
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
  const raw = text(value).replace(/,/g, '');
  const match = raw.match(/\d+/);
  return match ? Number(match[0]) : null;
}

function boolValue(value, fallback = false) {
  const raw = text(value).toLowerCase();
  if (!raw) return fallback;
  if (/^(1|true|yes|y|是|已上市|上市|public)$/.test(raw)) return true;
  if (/^(0|false|no|n|否|未上市|private|非上市)$/.test(raw)) return false;
  return fallback;
}

function statusValue(value) {
  if (typeof value === 'boolean') return value ? 'published' : 'archived';
  const raw = text(value).toLowerCase();
  if (/下架|停用|禁用|archive|inactive|hidden/.test(raw)) return 'archived';
  if (/否|不展示|不显示|false|no|disabled/.test(raw)) return 'archived';
  if (/草稿|draft/.test(raw)) return 'draft';
  return 'published';
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '') || `company-${Date.now()}`;
}

function transformRecord(item, syncedAt) {
  const fields = item.fields || {};
  const displayName = text(pick(fields, 'display_name'));
  const nameZh = text(pick(fields, 'name_zh'));
  const nameEn = text(pick(fields, 'name_en'));
  const name = displayName || nameEn || nameZh;
  if (!name) return null;

  const website = urlValue(pick(fields, 'website_url'));
  const domain = domainValue(pick(fields, 'official_domain')) || domainValue(website);
  const ticker = text(pick(fields, 'ticker'));
  const logoUrl = urlValue(pick(fields, 'logo_url'));
  const aliases = listValue(pick(fields, 'aliases'));

  return {
    slug: text(pick(fields, 'slug')) || slugify(nameEn || displayName || nameZh),
    display_name: displayName || nameEn || nameZh,
    name_zh: nameZh,
    name_en: nameEn,
    legal_name: text(pick(fields, 'legal_name')),
    official_domain: domain,
    website_url: website || (domain ? `https://${domain}` : ''),
    logo_url: logoUrl,
    logo_source: text(pick(fields, 'logo_source')) || (logoUrl ? 'feishu' : 'backend-logo'),
    logo_status: text(pick(fields, 'logo_status')) || 'ready',
    brand_color: text(pick(fields, 'brand_color')),
    industry_l1: text(pick(fields, 'industry_l1')) || text(pick(fields, 'industry_l2')),
    industry_l2: text(pick(fields, 'industry_l2')),
    hq_country: text(pick(fields, 'hq_country')),
    hq_city: text(pick(fields, 'hq_city')),
    founded_year: yearValue(pick(fields, 'founded_year')),
    employee_count: numberValue(pick(fields, 'employee_count')),
    employee_range: text(pick(fields, 'employee_range')),
    market: text(pick(fields, 'market')),
    ticker,
    exchange_name: text(pick(fields, 'exchange_name')),
    is_public: boolValue(pick(fields, 'is_public'), !!ticker),
    description_zh: text(pick(fields, 'description_zh')),
    description_en: text(pick(fields, 'description_en')),
    tags: listValue(pick(fields, 'tags')),
    aliases,
    source_primary: 'feishu',
    data_status: statusValue(pick(fields, 'data_status')),
    last_synced_at: syncedAt,
    replace_aliases: true,
    feishu_record_id: item.record_id,
    feishu_fields: fields
  };
}

function writeSyncLog(status, message, payload) {
  db.prepare(`
    INSERT INTO company_sync_logs (provider, sync_type, status, message, payload)
    VALUES (?, ?, ?, ?, ?)
  `).run('feishu', 'company_base', status, message, JSON.stringify(payload || {}));
}

function findExistingCompany(company) {
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

async function main() {
  console.log('=== 飞书公司详情库同步 ===');
  console.log(new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }));
  assertConfig();

  console.log('\n1. 获取飞书访问令牌...');
  const token = await getAccessToken();
  console.log('   令牌获取成功');

  console.log('\n2. 定位公司详情 Base 和数据表...');
  const baseToken = await resolveBaseToken(token);
  const tableId = await resolveTableId(token, baseToken);
  console.log(`   Base token: ${baseToken}`);
  console.log(`   Table id:   ${tableId}`);

  console.log('\n3. 拉取公司记录...');
  const items = await fetchAllRecords(token, baseToken, tableId);
  const syncedAt = new Date().toISOString();
  const transformed = items.map(item => transformRecord(item, syncedAt)).filter(Boolean);

  const seen = new Set();
  const companies = transformed.filter(company => {
    if (seen.has(company.slug)) return false;
    seen.add(company.slug);
    return true;
  });

  console.log(`   原始记录: ${items.length} 条`);
  console.log(`   有效公司: ${transformed.length} 条`);
  console.log(`   去重后:   ${companies.length} 条`);

  if (DRY_RUN) {
    console.log('\n4. Dry run 预览，不写入数据库');
    companies.slice(0, 10).forEach(company => {
      console.log(`   - ${company.display_name} | ${company.industry_l1 || '-'} | ${company.official_domain || '-'}`);
    });
    return;
  }

  console.log('\n4. 写入公司详情库...');
  let inserted = 0;
  let updated = 0;
  const tx = db.transaction(() => {
    for (const company of companies) {
      const match = findExistingCompany(company);
      if (match) company.slug = match.slug;
      const existing = db.prepare('SELECT id FROM companies WHERE slug = ?').get(company.slug);
      companyService.upsertCompany(company);
      if (existing) updated += 1;
      else inserted += 1;
    }
  });
  tx();

  writeSyncLog('success', `Synced ${companies.length} companies from Feishu`, {
    baseToken,
    tableId,
    raw: items.length,
    valid: transformed.length,
    inserted,
    updated
  });

  const total = db.prepare('SELECT COUNT(*) as c FROM companies').get().c;
  console.log('\n同步完成');
  console.log(`   新增:       ${inserted} 家`);
  console.log(`   更新:       ${updated} 家`);
  console.log(`   当前总计:   ${total} 家`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('同步失败:', err.message);
    try {
      writeSyncLog('failed', err.message, {});
    } catch (e) {}
    process.exit(1);
  });
}

module.exports = {
  transformRecord,
  normalizeFieldName,
  text,
  listValue
};
