'use strict';

// Explicit database injection is intentional: importing this module must never
// load db/database.js, dotenv, startup DDL, payment configuration or live data.
const crypto = require('node:crypto');
const PRICE_CENTS = 900;
const COPY_FIELDS = {
  usageInstructions:'usage_instructions', claimInstructions:'claim_instructions',
  updateInstructions:'update_instructions', afterSalesInstructions:'after_sales_instructions'
};
const PRODUCT_COLUMNS = [
  'title','cover_url','summary','description','catalog_text','sample_images',
  'season_label','price_cents','drive_name','drive_url','extraction_code',
  'source_description','claim_days','virtual_product_id'
];

function fail(code) { throw Object.assign(new Error(code), {code}); }
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function plain(value, max = 20000) {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]|<\/?[a-z][^>]*>|javascript\s*:/i.test(value)) fail('INVALID_SOURCE_TEXT');
  return value.trim();
}
function publicText(value, max = 20000) {
  const result = plain(value, max);
  if (/https?:|pan\.baidu\.com|提取码/i.test(result)) fail('PRIVATE_CONTENT_IN_PUBLIC_TEXT');
  return result;
}
function identifier(value, code) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9:_-]{1,160}$/.test(value)) fail(code);
  return value;
}
function validateProfile(profile) {
  if (!profile || !Array.isArray(profile.companies) || !profile.companies.length || profile.companies.length > 200) fail('INVALID_PROFILE');
  const sourceNamespace = identifier(profile.sourceNamespace, 'INVALID_SOURCE_NAMESPACE');
  const companies = profile.companies.map(item => {
    if (!item || item.priceCents !== PRICE_CENTS) fail('INVALID_PROFILE_PRICE');
    const companyName = publicText(item.companyName, 80);
    if (!companyName || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.companySlug)) fail('INVALID_COMPANY_PROFILE');
    const virtualProductId = identifier(item.virtualProductId, 'INVALID_PROFILE_SKU');
    const allowedCompanyNames = (item.allowedCompanyNames || [companyName]).map(name => publicText(name, 120));
    if (!allowedCompanyNames.includes(companyName)) fail('INVALID_COMPANY_PROFILE');
    let cover;
    try { cover = new URL(item.coverUrl); } catch (_) { fail('INVALID_PROFILE_COVER'); }
    if (cover.protocol !== 'https:' || cover.username || cover.password || cover.hostname === 'pan.baidu.com' || cover.search || cover.hash) fail('INVALID_PROFILE_COVER');
    return {companyName,companySlug:item.companySlug,virtualProductId,allowedCompanyNames,coverUrl:cover.toString()};
  });
  for (const key of ['companyName','companySlug','virtualProductId']) if (new Set(companies.map(c => c[key])).size !== companies.length) fail('DUPLICATE_PROFILE_COMPANY');
  return {sourceNamespace,companies};
}

function parseShare(value) {
  const share = plain(value);
  if (!share) fail('EMPTY_SHARE');
  const matches = share.match(/https?:\/\/[^\s<>"'()[\]，。；]+/gi) || [];
  if (!matches.length) fail('SHARE_LINK_REQUIRED');
  const links = new Set(), codes = new Set();
  for (const match of matches) {
    let parsed;
    try { parsed = new URL(match); } catch (_) { fail('INVALID_SHARE_URL'); }
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'pan.baidu.com' || parsed.port || parsed.username || parsed.password || parsed.hash || !/^\/s\/[a-zA-Z0-9_-]+$/.test(parsed.pathname)) fail('INVALID_SHARE_URL');
    if ([...parsed.searchParams.keys()].some(key => key !== 'pwd') || parsed.searchParams.getAll('pwd').length > 1) fail('INVALID_SHARE_QUERY');
    const code = parsed.searchParams.get('pwd');
    if (code !== null) {
      if (!/^[a-zA-Z0-9]{4}$/.test(code)) fail('INVALID_EXTRACTION_CODE');
      codes.add(code);
    }
    links.add(`https://pan.baidu.com${parsed.pathname}`);
  }
  const explicit = [...share.matchAll(/提取码\s*[：:]?\s*([a-zA-Z0-9]+)\b/g)];
  for (const match of explicit) {
    if (!/^[a-zA-Z0-9]{4}$/.test(match[1])) fail('INVALID_EXTRACTION_CODE');
    codes.add(match[1]);
  }
  if (links.size !== 1 || codes.size > 1) fail('AMBIGUOUS_SHARE');
  const fileMatch = share.match(/分享的文件\s*[：:]\s*([^\r\n]+)/);
  const fileLabel = fileMatch ? publicText(fileMatch[1], 300) : '';
  return {driveUrl:[...links][0],extractionCode:[...codes][0] || '',fileLabel};
}

function parseSource(snapshot, rawProfile) {
  const profile = validateProfile(rawProfile), data = snapshot && snapshot.data;
  if (!snapshot || snapshot.ok !== true || !data || data.has_more !== false || !Array.isArray(data.data) || !Array.isArray(data.fields) || !Array.isArray(data.field_id_list) || !Array.isArray(data.record_id_list)) fail('INCOMPLETE_SOURCE_SNAPSHOT');
  if (data.data.length > 10000 || data.data.length !== data.record_id_list.length || data.fields.length !== data.field_id_list.length || new Set(data.fields).size !== data.fields.length || new Set(data.field_id_list).size !== data.field_id_list.length) fail('INVALID_SOURCE_LAYOUT');
  const companyIndex = data.fields.indexOf('企业名称'), shareIndex = data.fields.indexOf('测评资料网盘链接'), seasonIndex = data.fields.indexOf('届别');
  if (companyIndex < 0 || shareIndex < 0) fail('SOURCE_FIELDS_REQUIRED');
  const records = [], ids = new Set(), companies = new Set();
  let skippedEmpty = 0;
  data.data.forEach((row, index) => {
    const sourceRecordId = identifier(data.record_id_list[index], 'INVALID_SOURCE_RECORD_ID');
    if (ids.has(sourceRecordId)) fail('DUPLICATE_SOURCE_RECORD');
    ids.add(sourceRecordId);
    if (!Array.isArray(row) || row.length !== data.fields.length) fail('INVALID_SOURCE_ROW');
    const rawShare = row[shareIndex];
    if (rawShare == null || (typeof rawShare === 'string' && !rawShare.trim())) { skippedEmpty += 1; return; }
    const companyName = publicText(row[companyIndex], 80);
    const item = profile.companies.find(company => company.companyName === companyName);
    if (!item) fail('UNMAPPED_COMPANY_WITH_SHARE');
    if (companies.has(companyName)) fail('DUPLICATE_COMPANY_WITH_SHARE');
    companies.add(companyName);
    const share = parseShare(rawShare);
    const rawSeason = seasonIndex < 0 ? '' : row[seasonIndex];
    const seasonLabel = rawSeason == null ? '' : publicText(Array.isArray(rawSeason) ? rawSeason.map(part => publicText(part, 80)).join('、') : rawSeason, 100);
    const values = {
      title:`${companyName}校招测评资料`, cover_url:item.coverUrl,
      summary:`${seasonLabel ? seasonLabel + ' ' : ''}${companyName}校招备考电子学习资料，网盘交付；具体文件以网盘实际目录为准。`,
      description:`本商品为${companyName}校招备考辅助学习资料。${share.fileLabel ? '\n分享记录标注的文件名称：' + share.fileLabel + '。' : ''}\n网盘内容尚未逐项核验，具体文件、年份及适用范围以实际目录为准。\n本资料并非招聘企业官方考试资料，不保证原题命中。`,
      catalog_text:'具体文件以网盘实际目录为准；目录内容待核验。',sample_images:'[]',season_label:seasonLabel,
      price_cents:PRICE_CENTS,drive_name:'百度网盘',drive_url:share.driveUrl,extraction_code:share.extractionCode,
      source_description:'用户提供的飞书企业测评资料记录；网盘内容尚未逐项核验。',claim_days:null,virtual_product_id:item.virtualProductId
    };
    if (values.summary.length > 200) fail('SOURCE_SUMMARY_TOO_LONG');
    records.push({sourceRecordId,profile:item,values,sourceFingerprint:digest({values,companySlug:item.companySlug}),contentNeedsReview:true});
  });
  return {sourceNamespace:profile.sourceNamespace,totalRows:data.data.length,skippedEmpty,records};
}

function assertSchema(db) {
  for (const table of ['assessment_products','assessment_import_sources','assessment_product_companies','assessment_shared_instructions','assessment_product_audit','orders','assessment_order_details','companies']) {
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)) fail('ASSESSMENT_IMPORT_MIGRATIONS_REQUIRED');
  }
}
function normalizeInstructions(instructions) {
  if (instructions == null) return null;
  const result = {};
  for (const [field,column] of Object.entries(COPY_FIELDS)) {
    const value = publicText(instructions[field]);
    if (!value) fail('SHARED_INSTRUCTIONS_REQUIRED');
    result[column] = value;
  }
  return result;
}
function currentManagedFingerprint(db, productId) {
  const product = db.prepare(`SELECT ${PRODUCT_COLUMNS.join(',')} FROM assessment_products WHERE id=?`).get(productId);
  if (!product) fail('IMPORT_BINDING_PRODUCT_MISSING');
  const companyIds = db.prepare('SELECT company_id FROM assessment_product_companies WHERE product_id=? ORDER BY company_id').all(productId).map(row => row.company_id);
  return digest({values:product,companyIds});
}
function planImport(db, snapshot, profile, instructions = null) {
  assertSchema(db);
  const parsed = parseSource(snapshot, profile), copy = normalizeInstructions(instructions);
  const shared = db.prepare('SELECT * FROM assessment_shared_instructions WHERE id=1').get();
  if (!shared) fail('ASSESSMENT_IMPORT_MIGRATIONS_REQUIRED');
  const copySame = copy && Object.keys(copy).every(key => copy[key] === shared[key]);
  if (copy && !copySame && (shared.version !== 0 || Object.keys(COPY_FIELDS).some(key => shared[COPY_FIELDS[key]]))) fail('SHARED_INSTRUCTIONS_CONFLICT_USE_ADMIN');
  const actions = parsed.records.map(record => {
    const {companySlug,companyName,allowedCompanyNames,virtualProductId} = record.profile;
    const bySlug = db.prepare('SELECT id,display_name FROM companies WHERE slug=?').get(companySlug);
    if (bySlug && !allowedCompanyNames.includes(bySlug.display_name)) fail('COMPANY_SLUG_IDENTITY_CONFLICT');
    const sameName = db.prepare('SELECT id,slug FROM companies WHERE display_name=?').all(companyName);
    if (!bySlug && sameName.length) fail('COMPANY_NAME_REQUIRES_EXPLICIT_SLUG_MAPPING');
    const binding = db.prepare('SELECT * FROM assessment_import_sources WHERE source_namespace=? AND source_record_id=?').get(parsed.sourceNamespace, record.sourceRecordId);
    const skuConflict = db.prepare('SELECT id FROM assessment_products WHERE virtual_product_id=? AND id<>?').get(virtualProductId,binding ? binding.product_id : -1);
    if (skuConflict) fail('SKU_ALREADY_OWNED_BY_ANOTHER_PRODUCT');
    let action = 'create', status = 'draft';
    if (binding) {
      const product = db.prepare('SELECT status FROM assessment_products WHERE id=?').get(binding.product_id);
      if (!product) fail('IMPORT_BINDING_PRODUCT_MISSING');
      status = product.status;
      if (binding.source_fingerprint === record.sourceFingerprint) action = 'unchanged';
      else {
        if (product.status !== 'draft') fail('PUBLISHED_PRODUCT_CHANGE_REQUIRES_ADMIN');
        if (currentManagedFingerprint(db,binding.product_id) !== binding.managed_fingerprint) fail('MANUAL_PRODUCT_EDIT_CONFLICT');
        action = 'update';
      }
    }
    return {...record,action,status,companyId:bySlug ? bySlug.id : null,createCompany:!bySlug,productId:binding ? binding.product_id : null};
  });
  return {...parsed,actions,instructions:copy,instructionsAction:copy && !copySame ? 'initialize' : 'unchanged'};
}
function summarize(plan, mode = 'dry-run') {
  return {
    mode,totalRows:plan.totalRows,skippedEmpty:plan.skippedEmpty,selected:plan.actions.length,
    created:plan.actions.filter(item => item.action === 'create').length,
    updated:plan.actions.filter(item => item.action === 'update').length,
    unchanged:plan.actions.filter(item => item.action === 'unchanged').length,
    instructionsAction:plan.instructionsAction,
    items:plan.actions.map(item => ({company:item.profile.companyName,action:item.action,companyAction:item.createCompany ? 'create-minimal' : 'reuse',status:item.status,priceCents:PRICE_CENTS,virtualProductId:item.profile.virtualProductId,contentNeedsReview:item.contentNeedsReview}))
  };
}
function applyImport(db, snapshot, profile, {instructions = null,actor = 'assessment-import'} = {}) {
  const actorId = identifier(actor, 'INVALID_IMPORT_ACTOR');
  // Re-plan under the write lock: a dry-run is not authority to overwrite a
  // product or shared terms modified after the preview.
  return db.transaction(() => {
    const plan = planImport(db,snapshot,profile,instructions);
    if (plan.instructionsAction === 'initialize') {
      const columns = Object.keys(plan.instructions);
      db.prepare(`UPDATE assessment_shared_instructions SET ${columns.map(key => key + '=?').join(',')},version=version+1,updated_by=?,updated_at=datetime('now') WHERE id=1`).run(...Object.values(plan.instructions),actorId);
      db.prepare("UPDATE orders SET status='cancelled' WHERE status='pending' AND order_no IN (SELECT order_no FROM assessment_order_details)").run();
      db.prepare('INSERT INTO assessment_product_audit(product_id,actor_id,action) VALUES (0,?,?)').run(actorId,'shared_instructions_initialized_by_import');
    }
    for (const item of plan.actions) {
      if (item.action === 'unchanged') continue;
      let companyId = item.companyId;
      if (item.createCompany) {
        const columns = db.prepare('PRAGMA table_info(companies)').all().map(column => column.name);
        const companyValues = {slug:item.profile.companySlug,display_name:item.profile.companyName};
        if (columns.includes('source_primary')) companyValues.source_primary = 'assessment-feishu-import';
        if (columns.includes('data_status')) companyValues.data_status = 'draft';
        companyId = Number(db.prepare(`INSERT INTO companies(${Object.keys(companyValues).join(',')}) VALUES (${Object.keys(companyValues).map(() => '?').join(',')})`).run(...Object.values(companyValues)).lastInsertRowid);
      }
      const values = {...item.values,status:'draft',updated_by:actorId};
      let productId = item.productId;
      if (item.action === 'create') productId = Number(db.prepare(`INSERT INTO assessment_products(${Object.keys(values).join(',')}) VALUES (${Object.keys(values).map(() => '?').join(',')})`).run(...Object.values(values)).lastInsertRowid);
      else db.prepare(`UPDATE assessment_products SET ${Object.keys(values).map(key => key + '=?').join(',')},updated_at=datetime('now') WHERE id=?`).run(...Object.values(values),productId);
      db.prepare('DELETE FROM assessment_product_companies WHERE product_id=?').run(productId);
      db.prepare('INSERT INTO assessment_product_companies(product_id,company_id) VALUES (?,?)').run(productId,companyId);
      db.prepare(`INSERT INTO assessment_import_sources(source_namespace,source_record_id,product_id,source_fingerprint,managed_fingerprint,content_needs_review,imported_by) VALUES (?,?,?,?,?,1,?) ON CONFLICT(source_namespace,source_record_id) DO UPDATE SET source_fingerprint=excluded.source_fingerprint,managed_fingerprint=excluded.managed_fingerprint,content_needs_review=1,imported_by=excluded.imported_by,imported_at=datetime('now')`).run(plan.sourceNamespace,item.sourceRecordId,productId,item.sourceFingerprint,currentManagedFingerprint(db,productId),actorId);
      db.prepare('INSERT INTO assessment_product_audit(product_id,actor_id,action) VALUES (?,?,?)').run(productId,actorId,`import_${item.action}_draft:content_needs_review`);
    }
    if (db.pragma('integrity_check', {simple:true}) !== 'ok' || db.pragma('foreign_key_check').length) fail('POST_IMPORT_INTEGRITY_FAILED');
    return summarize(plan,'applied-drafts');
  }).immediate();
}

module.exports = {PRICE_CENTS,parseShare,parseSource,validateProfile,planImport,applyImport,summarize};
