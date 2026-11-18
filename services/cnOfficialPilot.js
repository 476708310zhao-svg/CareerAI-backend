const axios = require('axios');
const { createHash } = require('node:crypto');

const smartRecruitersCompanies = [
  { id: 'bosch', name: '博世', token: 'BoschGroup', countryCodes: ['cn', 'gb', 'us'],
    url: 'https://jobs.bosch.com/' },
  { id: 'continental', name: '大陆集团', token: 'Continental', countryCodes: ['cn', 'us'],
    url: 'https://jobs.continental.com/' },
  { id: 'inter-ikea', name: '宜家（Inter IKEA Group）', token: 'InterIKEAGroup', countryCodes: ['cn'],
    url: 'https://careers.smartrecruiters.com/InterIKEAGroup' }
];

// Only fixed, verified employer boards are requested. Never construct a fetch URL from user input.
const BOARDS = Object.freeze([
  { id: 'enhesa', name: 'Enhesa', adapter: 'greenhouse', token: 'enhesa' },
  { id: 'landor', name: 'Landor', adapter: 'greenhouse', token: 'landor' },
  { id: 'prophet', name: 'Prophet', adapter: 'greenhouse', token: 'prophet' },
  { id: 'artefact', name: 'Artefact', adapter: 'greenhouse', token: 'artefact' },
  { id: 'worldquant', name: 'WorldQuant', adapter: 'greenhouse', token: 'worldquant' },
  { id: 'alphagrepsecurities', name: 'AlphaGrep', adapter: 'greenhouse', token: 'alphagrepsecurities' },
  { id: 'axq', name: 'AXQ', adapter: 'greenhouse', token: 'axq' },
  { id: 'meshy', name: 'Meshy', adapter: 'ashby', token: 'meshy' },
  { id: 'scientech-research', name: 'Scientech Research', adapter: 'ashby', token: 'scientech-research' },
  { id: 'hypebeast', name: 'Hypebeast', adapter: 'lever', token: 'hypebeast' },
  { id: 'shein-us', name: 'SHEIN', adapter: 'greenhouse', token: 'shein',
    countryCode: 'us', verifiedSingleCountry: 'us', verifiedLocations: ['Los Angeles', 'San Diego'] },
  ...smartRecruitersCompanies.flatMap(company => company.countryCodes.map(countryCode => ({
    id: `${company.id}-${countryCode}`, name: company.name, token: company.token,
    adapter: 'smartrecruiters', countryCode, url: company.url
  }))),
  { id: 'alibaba', name: '阿里巴巴', url: 'https://campus-talent.alibaba.com/' },
  { id: 'bytedance', name: '字节跳动', url: 'https://jobs.bytedance.com/campus' },
  { id: 'tencent', name: '腾讯', url: 'https://join.qq.com/' },
  { id: 'huawei', name: '华为', url: 'https://career.huawei.com/cn/campus-recruitment' },
  { id: 'meituan', name: '美团', url: 'https://zhaopin.meituan.com/web/campus' },
  { id: 'baidu', name: '百度', url: 'https://talent.baidu.com/jobs/' },
  { id: 'jd', name: '京东', url: 'https://zhaopin.jd.com/home' },
  { id: 'pdd', name: '拼多多', url: 'https://careers.pddglobalhr.com/' },
  { id: 'xiaomi', name: '小米', url: 'https://hr.xiaomi.com/website/campus.html' },
  { id: 'china-mobile', name: '中国移动', url: 'https://job.10086.cn/' },
  { id: 'amazon', name: '亚马逊', countryCode: 'global', url: 'https://www.amazon.jobs/content/en/career-programs/university' },
  { id: 'microsoft', name: '微软', countryCode: 'global', url: 'https://careers.microsoft.com/v2/global/en/universityinternship' },
  { id: 'nvidia', name: '英伟达', countryCode: 'global', url: 'https://www.nvidia.com/en-us/about-nvidia/careers/university-recruiting/' },
  { id: 'tesla', name: '特斯拉', countryCode: 'global', url: 'https://www.tesla.com/careers/internships' },
  { id: 'xiaohongshu', name: '小红书', url: 'https://job.xiaohongshu.com/campus/theme' },
  { id: 'bilibili', name: '哔哩哔哩', url: 'https://jobs.bilibili.com/' },
  { id: 'catl', name: '宁德时代', url: 'https://talent.catl.com/social-recruitment/catlhr/96144/' },
  { id: 'nio', name: '蔚来', url: 'https://campus.nio.com/' },
  { id: 'mihoyo', name: '米哈游', url: 'https://jobs.mihoyo.com/' }
]);

const LIVE_BOARDS = BOARDS.filter(board => board.adapter);
const LIVE_CN_BOARDS = LIVE_BOARDS.filter(board => !board.countryCode || board.countryCode === 'cn');
const REALTIME_CN_BOARDS = LIVE_CN_BOARDS.filter(board => board.adapter !== 'smartrecruiters');
const SMART_RECRUITERS_PAGE_SIZE = 100;
const SMART_RECRUITERS_MAX_PAGES = 30;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const CN_LOCATION = /中国|北京|上海|深圳|广州|杭州|成都|苏州|南京|武汉|西安|天津|重庆|厦门|宁波|合肥|长沙|郑州|青岛|无锡|珠海|东莞|\bchina\b|\bbeijing\b|\bshanghai\b|\bshenzhen\b|\bguangzhou\b|\bhangzhou\b|\bchengdu\b|\bsuzhou\b|\bnanjing\b|\bwuhan\b|\bxian\b/i;
const MAINLAND_CITY = /北京|上海|深圳|广州|杭州|成都|苏州|南京|武汉|西安|天津|重庆|厦门|宁波|合肥|长沙|郑州|青岛|无锡|珠海|东莞|\bbeijing\b|\bshanghai\b|\bshenzhen\b|\bguangzhou\b|\bhangzhou\b|\bchengdu\b|\bsuzhou\b|\bnanjing\b|\bwuhan\b|\bxian\b/i;
const MARKET_LOCATION = {
  gb: /\b(?:united kingdom|great britain|england|scotland|wales|northern ireland|uk)\b/i,
  us: /\b(?:united states(?: of america)?|usa|u\.s\.a\.|us)\b/i
};
const EARLY_CAREER = /实习|校招|应届|管培|毕业生|暑期|\bintern(?:ship)?\b|\bgraduate\b|\bnew grad\b|\bstudent\b|\btrainee\b/i;
const INTERN_TITLE = /实习|\bintern(?:ship)?\b/i;
const EXPLICIT_FULL_TIME = /^(?:full[\s-]?time|permanent|regular)$/i;
const QUERY_SYNONYMS = [
  [/软件工程|软件开发|开发工程师/, ['software', 'engineer', 'developer']],
  [/数据分析/, ['data', 'analyst', 'analytics']],
  [/算法/, ['algorithm', 'machine learning', 'ai']],
  [/产品/, ['product']],
  [/设计/, ['design', 'designer']],
  [/市场|营销/, ['marketing']],
  [/实习/, ['intern', 'internship']],
  [/校招|应届/, ['graduate', 'campus', 'new grad']]
];

function boardUrl(board) {
  if (board.url) return board.url;
  if (board.adapter === 'greenhouse') return `https://job-boards.greenhouse.io/${board.token}`;
  if (board.adapter === 'ashby') return `https://jobs.ashbyhq.com/${board.token}`;
  return `https://jobs${board.region === 'eu' ? '.eu' : ''}.lever.co/${board.token}`;
}

function feedUrl(board, page = 0) {
  if (board.adapter === 'smartrecruiters') {
    const query = new URLSearchParams({ country: board.countryCode,
      limit: String(SMART_RECRUITERS_PAGE_SIZE), offset: String(page * SMART_RECRUITERS_PAGE_SIZE) });
    return `https://api.smartrecruiters.com/v1/companies/${board.token}/postings?${query}`;
  }
  if (board.adapter === 'greenhouse') return `https://boards-api.greenhouse.io/v1/boards/${board.token}/jobs`;
  if (board.adapter === 'ashby') return `https://api.ashbyhq.com/posting-api/job-board/${board.token}`;
  return `https://api${board.region === 'eu' ? '.eu' : ''}.lever.co/v0/postings/${board.token}?mode=json&skip=${page * 100}&limit=100`;
}

function directory(country = 'global') {
  const regularBoards = BOARDS.filter(board => board.adapter !== 'smartrecruiters').map(board => ({
    id: board.id, name: board.name, countryCode: board.countryCode || 'cn',
    mode: board.adapter ? 'auto_sync' : 'official_link',
    modeLabel: board.adapter ? '官网职位同步' : '仅官网入口',
    url: boardUrl(board) }));
  const groupedBoards = smartRecruitersCompanies.map(({ id, name, url, countryCodes }) => ({
    id, name, url, countryCodes, countryCode: countryCodes.length === 1 ? countryCodes[0] : 'global',
    mode: 'auto_sync', modeLabel: '官网职位同步'
  }));
  return [...regularBoards, ...groupedBoards].filter(board => country === 'global' ||
    (board.countryCodes ? board.countryCodes.includes(country) : [country, 'global'].includes(board.countryCode)));
}

function safeUrl(value, fallback = '') {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : fallback; }
  catch (_) { return fallback; }
}

function isExpectedOfficialUrl(board, value) {
  try {
    const url = new URL(value);
    const expected = new URL(boardUrl(board));
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    if (url.hostname === expected.hostname && url.pathname.startsWith(`${expected.pathname.replace(/\/$/, '')}/`)) return true;
    if (board.adapter === 'greenhouse' && url.hostname === 'boards.greenhouse.io'
      && url.pathname.startsWith(`/${board.token}/`)) return true;
    return Array.isArray(board.allowedHosts) && board.allowedHosts.includes(url.hostname);
  } catch (_) { return false; }
}

function rowsFromFeed(board, data) {
  const rows = board.adapter === 'lever' ? data : (data && data.jobs);
  if (!Array.isArray(rows)) throw new Error('invalid_board_feed');
  return rows;
}

function targetLocation(board, row, locations) {
  const country = board.countryCode || 'cn';
  if (country === 'cn') return [...new Set(locations.filter(Boolean).filter(candidate =>
    CN_LOCATION.test(candidate) &&
    (!/香港|澳门|台湾|hong kong|hongkong|macau|macao|taiwan/i.test(candidate) || MAINLAND_CITY.test(candidate))))].join('; ') || null;
  if (!MARKET_LOCATION[country]) return null;
  if (board.verifiedLocations && !locations.some(value =>
    board.verifiedLocations.includes(String(value || '').trim()))) return null;
  const structured = [row.country, row.address?.postalAddress?.addressCountry,
    row.location?.country, row.location?.address?.addressCountry]
    .filter(Boolean).map(value => String(value).trim().toLowerCase());
  const names = country === 'gb' ? ['gb', 'uk', 'united kingdom', 'great britain']
    : ['us', 'usa', 'united states', 'united states of america'];
  if (structured.length && !structured.some(value => names.includes(value))) return null;
  if (structured.some(value => names.includes(value)) || board.verifiedSingleCountry === country) {
    return locations.find(Boolean) || null;
  }
  return locations.filter(Boolean).find(value => MARKET_LOCATION[country].test(String(value))) || null;
}

function normalizeRow(board, row) {
  if (board.adapter === 'smartrecruiters') return normalizeSmartRecruitersRow(board, row);
  const isGreenhouse = board.adapter === 'greenhouse';
  const isLever = board.adapter === 'lever';
  if ((!isGreenhouse && !isLever && row.isListed === false) ||
      (isGreenhouse && row.internal_job_id === null)) return null;
  const title = String(row.title || row.text || '').trim();
  const location = isGreenhouse ? row.location?.name : isLever ? row.categories?.location : row.location;
  const allLocations = isGreenhouse ? [location || (row.offices || []).map(x => x.location || x.name).join(' · ')]
    : isLever ? [location, ...(row.categories?.allLocations || [])] :
      [location, ...(row.secondaryLocations || []).map(x => typeof x === 'string' ? x : x.location || x.name)];
  const selectedLocation = targetLocation(board, row, allLocations);
  const sourceEmployment = String(row.employmentType || row.categories?.commitment || '').trim();
  if (!title || !selectedLocation ||
      !EARLY_CAREER.test([title, sourceEmployment].filter(Boolean).join(' ')) ||
      (INTERN_TITLE.test(title) && EXPLICIT_FULL_TIME.test(sourceEmployment))) return null;
  const publicUrl = safeUrl(isGreenhouse ? row.absolute_url : isLever ? row.hostedUrl : row.jobUrl);
  const ashbyId = !isGreenhouse && !isLever && publicUrl
    ? `url_${createHash('sha256').update(new URL(publicUrl).origin + new URL(publicUrl).pathname).digest('hex').slice(0, 20)}` : '';
  const sourceId = String(ashbyId || row.id || row.shortcode || '').trim();
  if (!/^[\w-]{1,100}$/.test(sourceId)) return null;
  const officialUrl = publicUrl;
  if (!officialUrl || !isExpectedOfficialUrl(board, officialUrl)) return null;
  const applyUrl = safeUrl(isGreenhouse ? row.absolute_url : isLever ? row.applyUrl : row.applyUrl, officialUrl);
  // Lever createdAt and Greenhouse updated_at are not publication timestamps.
  const published = isGreenhouse || isLever ? '' : row.publishedAt;
  const date = published && Number.isFinite(Date.parse(published)) ? new Date(published).toISOString() : '';
  return {
    job_id: `official_${board.id}_${sourceId}`, job_title: title,
    employer_name: board.name, job_city: String(selectedLocation).trim(),
    job_country: String(board.countryCode || 'cn').toUpperCase(),
    job_description: '', job_employment_type: sourceEmployment || (INTERN_TITLE.test(title) ? 'INTERN' : ''),
    job_posted_at_datetime_utc: date, job_apply_link: applyUrl,
    job_updated_at_datetime_utc: isGreenhouse && Number.isFinite(Date.parse(row.updated_at || ''))
      ? new Date(row.updated_at).toISOString() : '',
    job_source_url: officialUrl, job_source_reference: `${board.adapter}:${board.token}:${sourceId}`,
    _requestedCountry: board.countryCode || 'cn', _source: board.countryCode && board.countryCode !== 'cn' ? 'official_board' : 'cn_official'
  };
}

function normalizeSmartRecruitersRow(board, row) {
  const sourceId = String(row.id || '');
  const title = String(row.name || '').trim();
  const country = String(row.location?.country || '').toLowerCase();
  const location = [row.location?.city, row.location?.region].filter(Boolean).join(', ');
  if (!/^\d{1,30}$/.test(sourceId) || !title || !location || country !== board.countryCode ||
      row.visibility !== 'PUBLIC' || row.company?.identifier !== board.token) return null;

  const employment = row.typeOfEmployment?.label || '';
  const confirmedIntern = row.typeOfEmployment?.id === 'intern' || row.experienceLevel?.id === 'internship';
  const earlyCareerTitle = /实习|校招|应届|管培|毕业生|\bintern(?:ship)?\b|\b(?:new grad(?:uate)?|graduate (?:programme|program|trainee|scheme|engineer)|undergraduate placement|management trainee|co[- ]?op)\b/i;
  if (!confirmedIntern && (!earlyCareerTitle.test(title) ||
      (INTERN_TITLE.test(title) && EXPLICIT_FULL_TIME.test(employment)))) return null;

  const officialUrl = `https://jobs.smartrecruiters.com/${board.token}/${sourceId}`;
  return {
    job_id: `official_${board.id}_${sourceId}`, job_title: title,
    employer_name: board.name, job_city: location, job_country: country.toUpperCase(),
    job_description: '', job_employment_type: confirmedIntern || INTERN_TITLE.test(title) ? '实习' : employment,
    job_posted_at_datetime_utc: Number.isFinite(Date.parse(row.releasedDate))
      ? new Date(row.releasedDate).toISOString() : '',
    job_apply_link: officialUrl, job_source_url: officialUrl,
    job_source_reference: `smartrecruiters:${board.token}:${sourceId}`,
    _requestedCountry: country, _source: country === 'cn' ? 'cn_official' : 'official_board'
  };
}

function queryTerms(query) {
  const normalized = String(query || '').toLowerCase();
  const terms = normalized.match(/[a-z][a-z0-9+#.-]{1,}|[\u4e00-\u9fff]{2,}/g) || [];
  for (const [pattern, expansion] of QUERY_SYNONYMS) if (pattern.test(normalized)) terms.push(...expansion);
  return [...new Set(terms.filter(term => !['jobs', 'job', '岗位', '职位', '工作', '中国'].includes(term)))];
}

function matchesQuery(job, query) {
  const raw = String(query || '').toLowerCase();
  const title = job.job_title.toLowerCase();
  const location = job.job_city.toLowerCase();
  const cities = [
    ['上海', 'shanghai'], ['北京', 'beijing'], ['深圳', 'shenzhen'],
    ['广州', 'guangzhou'], ['杭州', 'hangzhou'], ['成都', 'chengdu'],
    ['南京', 'nanjing'], ['武汉', 'wuhan']
  ];
  for (const aliases of cities) {
    if (aliases.some(alias => raw.includes(alias)) && !aliases.some(alias => location.includes(alias))) return false;
  }
  const employment = String(job.job_employment_type || '').toLowerCase();
  if (INTERN_TITLE.test(raw) && !INTERN_TITLE.test(`${title} ${employment}`)) return false;
  const roleGroups = [
    [/数据分析|\bdata (?:analyst|analytics)\b/, ['data', 'analyst', 'analytics']],
    [/软件工程|软件开发|\bsoftware (?:engineer|developer)\b/, ['software', 'engineer', 'developer']],
    [/算法|\bmachine learning\b/, ['algorithm', 'machine learning', 'quantitative', 'ai']],
    [/产品|\bproduct\b/, ['product']],
    [/设计|\bdesign\b/, ['design', 'designer']]
  ];
  for (const [pattern, alternatives] of roleGroups) {
    if (pattern.test(raw) && !alternatives.some(term => title.includes(term))) return false;
  }
  const terms = queryTerms(query);
  if (!terms.length) return true;
  const text = `${title} ${job.employer_name} ${job.job_city} ${employment}`.toLowerCase();
  return terms.some(term => text.includes(term));
}

function score(job, query) {
  const title = job.job_title.toLowerCase();
  const location = job.job_city.toLowerCase();
  return queryTerms(query).reduce((sum, term) => sum + (title.includes(term) ? 5 : location.includes(term) ? 2 : 0), 0);
}

async function fetchBoardSnapshot(board, options = {}) {
  const httpGet = options.httpGet || axios.get;
  const fetcher = async () => {
    if (options.requestDelayMs) await wait(options.requestDelayMs);
    const allRows = [];
    const smartRecruiters = board.adapter === 'smartrecruiters';
    const maxPages = smartRecruiters ? SMART_RECRUITERS_MAX_PAGES : board.adapter === 'lever' ? 20 : 1;
    const seenSmartIds = new Set();
    let smartTotal;
    for (let page = 0; page < maxPages; page++) {
      let rows;
      let data;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const requestOptions = { timeout: 10000, maxContentLength: 4 * 1024 * 1024 };
          if (smartRecruiters) requestOptions.maxRedirects = 0;
          const response = await httpGet(feedUrl(board, page), requestOptions);
          data = response.data;
          rows = smartRecruiters ? data?.content : rowsFromFeed(board, data);
          break;
        } catch (error) {
          const transient = [502, 503, 504].includes(Number(error.response?.status)) ||
            ['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED'].includes(error.code);
          if (attempt >= 2 || !transient) throw error;
          await wait(350 * (attempt + 1));
        }
      }
      if (smartRecruiters) {
        smartTotal ??= data?.totalFound;
        validateSmartRecruitersPage(board, data, smartTotal, allRows.length, seenSmartIds);
      }
      allRows.push(...rows);
      if (smartRecruiters) {
        if (allRows.length === smartTotal) break;
        continue;
      }
      if (board.adapter !== 'lever' || rows.length < 100) break;
      if (page === 19) throw new Error('lever_pagination_limit');
    }
    return { rawCount: allRows.length, jobs: allRows.map(row => normalizeRow(board, row)).filter(Boolean) };
  };
  return options.gateway ? options.gateway.request(`cn_board_${board.id}`, 'openings', fetcher,
    { ttlMs: 60 * 60_000, minIntervalMs: 1_000 }) : fetcher();
}

function validateSmartRecruitersPage(board, data, total, offset, seenIds) {
  if (!Number.isSafeInteger(total) || total < 0 ||
      total > SMART_RECRUITERS_PAGE_SIZE * SMART_RECRUITERS_MAX_PAGES ||
      data?.totalFound !== total || data.offset !== offset || data.limit !== SMART_RECRUITERS_PAGE_SIZE ||
      !Array.isArray(data.content) ||
      data.content.length !== Math.min(SMART_RECRUITERS_PAGE_SIZE, total - offset)) {
    throw new Error('incomplete_smartrecruiters_snapshot');
  }
  for (const row of data.content) {
    const id = String(row?.id || '');
    if (!/^\d{1,30}$/.test(id) || seenIds.has(id) || row.company?.identifier !== board.token ||
        String(row.location?.country || '').toLowerCase() !== board.countryCode) {
      throw new Error('invalid_smartrecruiters_posting');
    }
    seenIds.add(id);
  }
}

async function fetchBoard(board, options = {}) {
  return (await fetchBoardSnapshot(board, options)).jobs;
}

async function search(query, options = {}) {
  const results = await Promise.allSettled(REALTIME_CN_BOARDS.map((board, index) => fetchBoard(board, {
    ...options, requestDelayMs: options.gateway ? index * 120 : 0
  })));
  const jobs = [];
  const boardStatus = [];
  for (let index = 0; index < results.length; index++) {
    const board = REALTIME_CN_BOARDS[index];
    const result = results[index];
    if (result.status === 'rejected') {
      boardStatus.push({ id: board.id, name: board.name, status: 'unavailable', count: 0,
        reason: result.reason?.reason || 'upstream_error' });
      continue;
    }
    const matched = result.value.filter(job => matchesQuery(job, query));
    jobs.push(...matched);
    boardStatus.push({ id: board.id, name: board.name, status: matched.length ? 'ok' : 'empty', count: matched.length });
  }
  jobs.sort((a, b) => score(b, query) - score(a, query) ||
    (Date.parse(b.job_posted_at_datetime_utc) || 0) - (Date.parse(a.job_posted_at_datetime_utc) || 0));
  return { jobs, boardStatus };
}

async function findById(id, options = {}) {
  const match = /^official_([\w-]+)_([\w-]+)$/.exec(String(id || ''));
  if (!match) return null;
  const board = LIVE_BOARDS.find(item => item.id === match[1]);
  if (!board || board.adapter === 'smartrecruiters') return null;
  return (await fetchBoard(board, options)).find(job => job.job_id === id) || null;
}

module.exports = { BOARDS, LIVE_BOARDS, LIVE_CN_BOARDS, REALTIME_CN_BOARDS, directory, boardUrl, feedUrl, normalizeRow, fetchBoardSnapshot, fetchBoard, search, findById, matchesQuery };
