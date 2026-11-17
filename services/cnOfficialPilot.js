const axios = require('axios');
const { createHash } = require('node:crypto');

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
  { id: 'alibaba', name: '阿里巴巴', url: 'https://campus-talent.alibaba.com/' },
  { id: 'bytedance', name: '字节跳动', url: 'https://jobs.bytedance.com/campus' },
  { id: 'tencent', name: '腾讯', url: 'https://join.qq.com/' },
  { id: 'huawei', name: '华为', url: 'https://career.huawei.com/cn/campus-recruitment' },
  { id: 'meituan', name: '美团', url: 'https://zhaopin.meituan.com/web/campus' },
  { id: 'baidu', name: '百度', url: 'https://talent.baidu.com/jobs/' },
  { id: 'jd', name: '京东', url: 'https://zhaopin.jd.com/home' },
  { id: 'pdd', name: '拼多多', url: 'https://careers.pddglobalhr.com/' },
  { id: 'xiaomi', name: '小米', url: 'https://hr.xiaomi.com/website/campus.html' },
  { id: 'china-mobile', name: '中国移动', url: 'https://job.10086.cn/' }
]);

const LIVE_BOARDS = BOARDS.filter(board => board.adapter);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const CN_LOCATION = /中国|北京|上海|深圳|广州|杭州|成都|苏州|南京|武汉|西安|天津|重庆|厦门|宁波|合肥|长沙|郑州|青岛|无锡|珠海|东莞|\bchina\b|\bbeijing\b|\bshanghai\b|\bshenzhen\b|\bguangzhou\b|\bhangzhou\b|\bchengdu\b|\bsuzhou\b|\bnanjing\b|\bwuhan\b|\bxian\b/i;
const MAINLAND_CITY = /北京|上海|深圳|广州|杭州|成都|苏州|南京|武汉|西安|天津|重庆|厦门|宁波|合肥|长沙|郑州|青岛|无锡|珠海|东莞|\bbeijing\b|\bshanghai\b|\bshenzhen\b|\bguangzhou\b|\bhangzhou\b|\bchengdu\b|\bsuzhou\b|\bnanjing\b|\bwuhan\b|\bxian\b/i;
const MARKET_LOCATION = {
  gb: /\b(?:united kingdom|great britain|england|scotland|wales|northern ireland|uk)\b/i,
  us: /\b(?:united states(?: of america)?|usa|u\.s\.a\.|us)\b/i
};
const EARLY_CAREER = /实习|校招|应届|管培|毕业生|暑期|\bintern(?:ship)?\b|\bgraduate\b|\bnew grad\b|\bstudent\b|\bcampus\b|\btrainee\b/i;
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
  if (board.adapter === 'greenhouse') return `https://boards-api.greenhouse.io/v1/boards/${board.token}/jobs?content=true`;
  if (board.adapter === 'ashby') return `https://api.ashbyhq.com/posting-api/job-board/${board.token}`;
  return `https://api${board.region === 'eu' ? '.eu' : ''}.lever.co/v0/postings/${board.token}?mode=json&skip=${page * 100}&limit=100`;
}

function directory() {
  return BOARDS.map(board => ({ id: board.id, name: board.name,
    mode: board.adapter ? 'auto_sync' : 'official_link',
    modeLabel: board.adapter ? '官网职位同步' : '仅官网入口',
    url: boardUrl(board) }));
}

function plainText(value) {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&#39;/gi, "'").replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ').trim().slice(0, 12000);
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
  if (country === 'cn') return locations.filter(Boolean).find(candidate =>
    CN_LOCATION.test(candidate) &&
    (!/香港|澳门|台湾|hong kong|hongkong|macau|macao|taiwan/i.test(candidate) || MAINLAND_CITY.test(candidate)));
  if (!MARKET_LOCATION[country]) return null;
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
  const department = isGreenhouse ? row.departments?.map(x => x.name).join(' ') :
    isLever ? row.categories?.team : row.department;
  if (!title || !selectedLocation ||
      !EARLY_CAREER.test([title, department, row.employmentType, row.categories?.commitment].filter(Boolean).join(' '))) return null;
  const publicUrl = safeUrl(isGreenhouse ? row.absolute_url : isLever ? row.hostedUrl : row.jobUrl);
  const ashbyId = !isGreenhouse && !isLever && publicUrl
    ? `url_${createHash('sha256').update(new URL(publicUrl).origin + new URL(publicUrl).pathname).digest('hex').slice(0, 20)}` : '';
  const sourceId = String(ashbyId || row.id || row.shortcode || '').trim();
  if (!/^[\w-]{1,100}$/.test(sourceId)) return null;
  const officialUrl = publicUrl;
  if (!officialUrl || !isExpectedOfficialUrl(board, officialUrl)) return null;
  const applyUrl = safeUrl(isGreenhouse ? row.absolute_url : isLever ? row.applyUrl : row.applyUrl, officialUrl);
  const description = plainText(isGreenhouse ? row.content : isLever ? row.descriptionPlain || row.description : row.descriptionPlain || row.descriptionHtml);
  // Lever createdAt and Greenhouse updated_at are not publication timestamps.
  const published = isGreenhouse || isLever ? '' : row.publishedAt;
  const date = published && Number.isFinite(Date.parse(published)) ? new Date(published).toISOString() : '';
  return {
    job_id: `official_${board.id}_${sourceId}`, job_title: title,
    employer_name: board.name, job_city: String(selectedLocation).trim(),
    job_country: String(board.countryCode || 'cn').toUpperCase(),
    job_description: description, job_employment_type: EARLY_CAREER.test(title) && /实习|\bintern/i.test(title) ? 'INTERN' : String(row.employmentType || row.categories?.commitment || ''),
    job_posted_at_datetime_utc: date, job_apply_link: applyUrl,
    job_updated_at_datetime_utc: isGreenhouse && Number.isFinite(Date.parse(row.updated_at || ''))
      ? new Date(row.updated_at).toISOString() : '',
    job_source_url: officialUrl, job_source_reference: `${board.adapter}:${board.token}:${sourceId}`,
    _requestedCountry: board.countryCode || 'cn', _source: board.countryCode && board.countryCode !== 'cn' ? 'official_board' : 'cn_official'
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
  if (/实习|\bintern(?:ship)?\b/.test(raw) && !/实习|\bintern(?:ship)?\b/.test(title)) return false;
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
  const text = `${title} ${job.employer_name} ${job.job_city}`.toLowerCase();
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
    for (let page = 0; page < (board.adapter === 'lever' ? 20 : 1); page++) {
      let rows;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await httpGet(feedUrl(board, page), { timeout: 10000, maxContentLength: 4 * 1024 * 1024 });
          rows = rowsFromFeed(board, response.data);
          break;
        } catch (error) {
          if (attempt > 0 || ![502, 503, 504].includes(Number(error.response?.status))) throw error;
          await wait(350);
        }
      }
      allRows.push(...rows);
      if (board.adapter !== 'lever' || rows.length < 100) break;
      if (page === 19) throw new Error('lever_pagination_limit');
    }
    return { rawCount: allRows.length, jobs: allRows.map(row => normalizeRow(board, row)).filter(Boolean) };
  };
  return options.gateway ? options.gateway.request(`cn_board_${board.id}`, 'openings', fetcher,
    { ttlMs: 60 * 60_000, minIntervalMs: 1_000 }) : fetcher();
}

async function fetchBoard(board, options = {}) {
  return (await fetchBoardSnapshot(board, options)).jobs;
}

async function search(query, options = {}) {
  const results = await Promise.allSettled(LIVE_BOARDS.map((board, index) => fetchBoard(board, {
    ...options, requestDelayMs: options.gateway ? index * 120 : 0
  })));
  const jobs = [];
  const boardStatus = [];
  for (let index = 0; index < results.length; index++) {
    const board = LIVE_BOARDS[index];
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
  if (!board) return null;
  return (await fetchBoard(board, options)).find(job => job.job_id === id) || null;
}

module.exports = { BOARDS, LIVE_BOARDS, directory, boardUrl, feedUrl, normalizeRow, fetchBoardSnapshot, fetchBoard, search, findById, matchesQuery };
