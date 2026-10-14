// Adzuna's jobs API covers a defined subset of countries. Other valid alpha-2
// codes remain eligible for JSearch; never silently turn them into US searches.
const ADZUNA_COUNTRIES = new Set([
  'au', 'at', 'be', 'br', 'ca', 'fr', 'de', 'in', 'it', 'mx',
  'nl', 'nz', 'pl', 'sg', 'za', 'es', 'ch', 'gb', 'us'
]);

const REGION_COUNTRIES = Object.freeze({
  '中国': 'cn', '香港': 'hk', '新加坡': 'sg', '英国': 'gb',
  '美国': 'us', '加拿大': 'ca', '澳大利亚': 'au', '德国': 'de',
  '法国': 'fr', '日本': 'jp', '印度': 'in', '阿联酋': 'ae'
});

const GLOBAL_SAMPLE_COUNTRIES = Object.freeze([
  'us', 'gb', 'sg', 'de', 'in', 'br', 'jp', 'ae', 'za', 'mx', 'ca', 'au'
]);
const ENGLISH_REGIONS = new Intl.DisplayNames(['en'], { type: 'region' });

function normalizeCountry(value, region = '') {
  const raw = String(value || '').trim().toLowerCase();
  if (raw && raw !== 'global' && raw !== 'all') {
    const code = raw === 'uk' ? 'gb' : raw;
    if (!/^[a-z]{2}$/.test(code) || ['eu', 'un', 'zz'].includes(code)) return null;
    const name = ENGLISH_REGIONS.of(code.toUpperCase());
    return name && name !== code.toUpperCase() && name !== 'Unknown Region' ? code : null;
  }
  if (raw === 'global' || raw === 'all') return REGION_COUNTRIES[String(region || '').trim()] || 'global';
  return REGION_COUNTRIES[String(region || '').trim()] || 'global';
}

function globalSampleCountries(time = Date.now()) {
  const day = Math.floor(time / 86_400_000);
  const start = (day % (GLOBAL_SAMPLE_COUNTRIES.length / 2)) * 2;
  return GLOBAL_SAMPLE_COUNTRIES.slice(start, start + 2);
}

function isRemoteJobEligible(job, country) {
  if (!country || country === 'global') return true;
  const location = String(job.location || job.job_city || '').trim().toLowerCase();
  if (!location || location === 'remote') return false;
  if (/\b(worldwide|anywhere|global|international)\b/.test(location)) return true;
  let displayName = '';
  try { displayName = ENGLISH_REGIONS.of(country.toUpperCase()) || ''; }
  catch (_) { /* Invalid country codes are rejected at the request boundary. */ }
  const includesWholeTerm = term => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|[^a-z])${escaped}(?=$|[^a-z])`, 'i').test(location);
  };
  if (displayName && displayName.toLowerCase() !== country && includesWholeTerm(displayName)) return true;
  const aliases = {
    us: ['usa', 'united states', 'u.s.'], gb: ['uk', 'united kingdom', 'britain'],
    ae: ['uae', 'united arab emirates'], cn: ['china', '中国'], hk: ['hong kong', '香港'],
    kr: ['south korea', 'korea'], za: ['south africa']
  };
  return (aliases[country] || []).some(includesWholeTerm) || location === country;
}

module.exports = { ADZUNA_COUNTRIES, normalizeCountry, globalSampleCountries, isRemoteJobEligible };
