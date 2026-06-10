const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const warnings = [];
const errors = [];

const JSON_FILES = [
  'data/jobs.json',
  'data/companies.seed.json',
  'data/experiences.json',
  'data/salaries.json',
  'data/users.json',
];

const TEXT_SCAN_GLOBS = [
  'routes',
  'utils',
  'middleware',
  'miniprogram/pages',
  'miniprogram/package-ai/pages',
  'miniprogram/package-career/pages',
  'miniprogram/package-content/pages',
  'miniprogram/package-user/pages',
  'miniprogram/utils',
];

const BAD_TEXT_PATTERNS = [
  { re: /\bTODO\b|\bFIXME\b/i, label: 'unfinished marker' },
  { re: /localhost|127\.0\.0\.1/i, label: 'local endpoint' },
  { re: /lorem ipsum|占位内容|待完善|敬请期待|coming soon/i, label: 'placeholder content' },
  { re: /admin123|password123|123456/i, label: 'weak demo credential' },
  { re: /test_openid|example\.com|测试数据|假数据|演示数据|模拟支付|仅供测试/, label: 'test/demo wording' },
];

const MOJIBAKE_PATTERN = /鈹|鑾|鍒嗘瀽|澶辫触|鎶撳彇|绛涢|鍏ㄩ儴|鏈煡|缃戠粶|璇风|濉啓|缁撴灉|杈撳叆|绠€/;

const COMMON_MOJIBAKE_PATTERN = /鏈嶅姟|閿欒|鏁版嵁|妯℃嫙|鐣欏|绋嬪|鍚庣|鏃犳硶|鑾峰彇|璇烽|涓嶈兘|鏀粯|瀹夎|閮ㄧ讲|鍙傛暟|杩斿洖|鍒涘缓|澶辫触|鎴愬姛|鍒濆|鍔犺浇|鐢ㄦ埛|鎺ュ彛/;

function readJson(relPath) {
  const abs = path.join(root, relPath);
  try {
    return JSON.parse(fs.readFileSync(abs, 'utf8'));
  } catch (err) {
    errors.push(`${relPath}: invalid JSON (${err.message})`);
    return null;
  }
}

function asArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.jobs)) return payload.jobs;
  if (Array.isArray(payload.companies)) return payload.companies;
  if (Array.isArray(payload.experiences)) return payload.experiences;
  if (Array.isArray(payload.salaries)) return payload.salaries;
  if (Array.isArray(payload.users)) return payload.users;
  if (Array.isArray(payload.items)) return payload.items;
  const firstArray = Object.values(payload).find(Array.isArray);
  if (firstArray) return firstArray;
  return [];
}

function assertPresent(item, fields, label) {
  fields.forEach((field) => {
    const value = item[field];
    if (value === undefined || value === null || String(value).trim() === '') {
      errors.push(`${label}: missing ${field}`);
    }
  });
}

function hasBadText(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value || '');
  return BAD_TEXT_PATTERNS.find((item) => item.re.test(text));
}

function checkUnique(list, keyFn, label) {
  const seen = new Map();
  list.forEach((item, index) => {
    const key = keyFn(item);
    if (!key) return;
    if (seen.has(key)) {
      warnings.push(`${label}: duplicate "${key}" at rows ${seen.get(key) + 1} and ${index + 1}`);
      return;
    }
    seen.set(key, index);
  });
}

function checkDate(value, label, options = {}) {
  if (!value) return;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) {
    errors.push(`${label}: invalid date "${value}"`);
    return;
  }
  const now = Date.now();
  if (time > now + 24 * 60 * 60 * 1000) {
    warnings.push(`${label}: future date "${value}"`);
  }
  if (options.maxAgeDays) {
    const ageDays = (now - time) / (24 * 60 * 60 * 1000);
    if (ageDays > options.maxAgeDays) {
      warnings.push(`${label}: older than ${options.maxAgeDays} days (${value})`);
    }
  }
}

function checkUrl(value, label) {
  if (!value) return;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) {
      errors.push(`${label}: unsupported URL protocol "${value}"`);
    }
  } catch {
    errors.push(`${label}: invalid URL "${value}"`);
  }
}

function walkFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(abs, out);
    } else if (/\.(js|json|wxml|wxss)$/.test(entry.name)) {
      out.push(abs);
    }
  }
  return out;
}

function stripCommentsForScan(text, relPath) {
  if (relPath.endsWith('.js')) {
    return text
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
  }
  if (relPath.endsWith('.wxml') || relPath.endsWith('.wxss')) {
    return text.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  }
  return text;
}

function checkJsonFiles() {
  JSON_FILES.forEach((file) => readJson(file));
}

function checkJobs() {
  const payload = readJson('data/jobs.json');
  const jobs = asArray(payload);
  if (jobs.length < 80) {
    warnings.push(`data/jobs.json: only ${jobs.length} jobs, recommend at least 80 for launch fallback data`);
  }
  checkUnique(jobs, (job) => String(job.id || '').trim(), 'jobs.id');
  checkUnique(
    jobs,
    (job) => `${job.title || ''}::${job.company || ''}::${job.location || ''}`.toLowerCase(),
    'jobs title/company/location'
  );

  jobs.forEach((job, index) => {
    const label = `data/jobs.json row ${index + 1}`;
    assertPresent(job, ['id', 'title', 'company', 'location', 'region', 'description', 'postedAt'], label);
    checkDate(job.postedAt, `${label}.postedAt`, { maxAgeDays: 180 });
    checkUrl(job.applyUrl, `${label}.applyUrl`);
    checkUrl(job.companyLogo, `${label}.companyLogo`);
    const bad = hasBadText(job);
    if (bad) errors.push(`${label}: contains ${bad.label}`);
  });
}

function checkCompanies() {
  const companies = asArray(readJson('data/companies.seed.json'));
  if (companies.length < 20) {
    warnings.push(`data/companies.seed.json: only ${companies.length} companies`);
  }
  checkUnique(companies, (item) => item.slug, 'companies.slug');
  checkUnique(companies, (item) => item.official_domain, 'companies.official_domain');

  companies.forEach((company, index) => {
    const label = `data/companies.seed.json row ${index + 1}`;
    assertPresent(company, ['slug', 'display_name', 'industry_l1', 'hq_country', 'description_zh'], label);
    if (company.official_domain && /\s|https?:\/\//i.test(company.official_domain)) {
      errors.push(`${label}.official_domain: should be a plain domain`);
    }
    const bad = hasBadText(company);
    if (bad) errors.push(`${label}: contains ${bad.label}`);
  });
}

function checkGenericContent(file, minCount, requiredFields) {
  const list = asArray(readJson(file));
  if (list.length < minCount) warnings.push(`${file}: only ${list.length} records`);
  list.forEach((item, index) => {
    const label = `${file} row ${index + 1}`;
    assertPresent(item, requiredFields, label);
    const bad = hasBadText(item);
    if (bad) errors.push(`${label}: contains ${bad.label}`);
  });
}

function checkTextFiles() {
  const files = TEXT_SCAN_GLOBS.flatMap((rel) => walkFiles(path.join(root, rel)));
  files.forEach((abs) => {
    const rel = path.relative(root, abs).replace(/\\/g, '/');
    const text = fs.readFileSync(abs, 'utf8');
    const visibleText = stripCommentsForScan(text, rel);
    BAD_TEXT_PATTERNS.forEach((pattern) => {
      if (pattern.re.test(text)) {
        warnings.push(`${rel}: contains ${pattern.label}`);
      }
    });
    if (MOJIBAKE_PATTERN.test(visibleText) || COMMON_MOJIBAKE_PATTERN.test(visibleText)) {
      errors.push(`${rel}: contains likely UTF-8 mojibake in user-visible text`);
    }
  });
}

function checkSeedUsers() {
  const payload = readJson('data/users.json');
  if (!payload) return;
  const text = JSON.stringify(payload);
  if (/test_openid|example\.com|13800138000|模拟|测试/.test(text)) {
    warnings.push('data/users.json: contains demo user/profile data; do not import this file into production user tables');
  }
}

function main() {
  checkJsonFiles();
  checkJobs();
  checkCompanies();
  checkGenericContent('data/experiences.json', 5, ['id', 'title', 'company', 'content']);
  checkGenericContent('data/salaries.json', 5, ['id', 'company', 'position']);
  checkGenericContent('data/users.json', 0, ['id']);
  checkSeedUsers();
  checkTextFiles();

  console.log('Data content check complete.');
  console.log(`Errors: ${errors.length}`);
  errors.forEach((item) => console.log(`  - ${item}`));
  console.log(`Warnings: ${warnings.length}`);
  warnings.forEach((item) => console.log(`  - ${item}`));

  if (errors.length > 0) process.exit(1);
}

main();
