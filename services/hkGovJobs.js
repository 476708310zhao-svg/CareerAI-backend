// Hong Kong Civil Service Bureau open data. This feed includes duties and
// entry requirements, but most records have no direct application URL.
const FEED_URL = 'https://www.csb.gov.hk/datagovhk/gov-vacancies/gov-job-vacancies-en.json';
const LIST_URL = 'https://csboa2.csb.gov.hk/csboa/jve/JVE_001_text.action';

function text(value) {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function httpsUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
  } catch (_) { return ''; }
}

function vacanciesFromFeed(payload) {
  let data = payload;
  if (typeof data === 'string') data = JSON.parse(data.replace(/^\uFEFF/, '').trim());
  const group = Array.isArray(data?.common)
    ? data.common.find(item => Array.isArray(item?.vacancies)) : null;
  if (!group) throw new Error('HK CSB vacancy feed format changed');
  return group.vacancies;
}

function normalizeVacancy(item) {
  const id = String(item?.jobid || '').trim();
  const title = text(item?.jobname);
  if (!id || !title) return null;
  const expiresAt = Date.parse(String(item.enddate || ''));
  if (Number.isFinite(expiresAt) && expiresAt < Date.now()) return null;
  const deadline = /^2099-/.test(String(item.enddate || '')) ? '' : String(item.enddate || '');
  const description = [
    item.duties && `Duties: ${text(item.duties)}`,
    item.entreq && `Entry requirements: ${text(item.entreq)}`,
    item.appnotes && `Application notes: ${text(item.appnotes)}`
  ].filter(Boolean).join('\n');
  const pay = text(item.entrypay);
  return {
    job_id: `hkcsb_${id}`,
    job_title: title,
    employer_name: text(item.deptnamejve) || 'Hong Kong Government',
    job_city: 'Hong Kong', job_country: 'HK',
    job_description: description,
    job_employment_type: text(item.jobnature),
    job_salary_string: /(?:HK\$|HKD)\s*[\d,]+/i.test(pay) ? pay : '',
    job_posted_at_datetime_utc: String(item.pubdate || ''),
    job_offer_expiration_datetime_utc: deadline,
    job_apply_link: httpsUrl(item.onlineformurl),
    job_source_url: LIST_URL,
    job_source_reference: id,
    _source: 'hk_csb', _requestedCountry: 'hk'
  };
}

function searchVacancies(payload, query) {
  const tokens = String(query || '').toLowerCase()
    .replace(/\b(jobs?|roles?|positions?|openings?|hiring|in|at|near)\b/g, ' ')
    .split(/[^a-z0-9\u4e00-\u9fa5]+/).filter(token => token.length > 1);
  return vacanciesFromFeed(payload).map(normalizeVacancy).filter(Boolean)
    .filter(job => !tokens.length || tokens.every(token =>
      [job.job_title, job.employer_name, job.job_description,
        job.job_employment_type, job.job_city].join(' ').toLowerCase().includes(token)));
}

module.exports = { FEED_URL, LIST_URL, vacanciesFromFeed, normalizeVacancy, searchVacancies };
