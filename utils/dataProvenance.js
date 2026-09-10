const DAY_MS = 24 * 60 * 60 * 1000;

const SOURCE_CATALOG = Object.freeze({
  jsearch: { label: 'JSearch', type: 'aggregator' },
  adzuna: { label: 'Adzuna', type: 'aggregator' },
  remoteok: { label: 'RemoteOK', type: 'job_board' },
  themuse: { label: 'The Muse', type: 'job_board' },
  linkedin: { label: 'LinkedIn', type: 'job_board' },
  indeed: { label: 'Indeed', type: 'job_board' },
  greenhouse: { label: 'Greenhouse 官网', type: 'official_board' },
  lever: { label: 'Lever 官网', type: 'official_board' },
  feishu: { label: '飞书人工精选', type: 'curated' },
  campus_feishu: { label: '飞书校招日历', type: 'curated' },
  public_campus: { label: '综合公开信息', type: 'curated' },
  local: { label: '历史职位库', type: 'curated_archive' },
  cache: { label: '本地缓存', type: 'cache' },
  unknown: { label: '来源待核实', type: 'unknown' }
});

const SOURCE_ALIASES = Object.freeze({
  '飞书校招日历': 'campus_feishu',
  '综合公开信息': 'public_campus',
  'local_fallback': 'local',
  'live_with_local_fallback': 'local',
  'aggregate': 'unknown',
  'external': 'unknown'
});

const FRESHNESS_LABELS = Object.freeze({
  fresh: '近期更新',
  aging: '建议复核',
  stale: '可能过期',
  expired: '已截止',
  unknown: '更新时间待核实'
});

function clean(value) {
  return String(value === undefined || value === null ? '' : value).trim();
}

function normalizeSourceCode(value) {
  const raw = clean(value);
  if (!raw) return 'unknown';
  const lower = raw.toLowerCase();
  if (SOURCE_ALIASES[raw]) return SOURCE_ALIASES[raw];
  if (SOURCE_ALIASES[lower]) return SOURCE_ALIASES[lower];
  return SOURCE_CATALOG[lower] ? lower : 'unknown';
}

function sourceMeta(source, options = {}) {
  const raw = clean(source);
  const code = normalizeSourceCode(raw);
  const catalog = SOURCE_CATALOG[code] || SOURCE_CATALOG.unknown;
  const inferredFallback = /fallback|cache/i.test(raw) || options.local === true;
  return {
    sourceCode: code,
    sourceLabel: options.sourceLabel || catalog.label,
    sourceType: catalog.type,
    isFallback: options.isFallback === true || inferredFallback
  };
}

function parseTimestamp(value) {
  const raw = clean(value);
  if (!raw) return null;
  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const sqliteLocal = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.\d+)?$/);
  const normalized = dateOnly
    ? `${raw}T00:00:00+08:00`
    : (sqliteLocal ? `${sqliteLocal[1]}T${sqliteLocal[2]}+08:00` : raw);
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function isoOrEmpty(value) {
  const timestamp = parseTimestamp(value);
  return timestamp === null ? '' : new Date(timestamp).toISOString();
}

function thresholds(domain) {
  return domain === 'campus'
    ? { freshDays: 7, staleDays: 30 }
    : { freshDays: 30, staleDays: 90 };
}

function freshnessMeta(options = {}) {
  const nowMs = parseTimestamp(options.now) ?? Date.now();
  const limits = thresholds(options.domain);
  const publishedAt = isoOrEmpty(options.publishedAt);
  const updatedAt = isoOrEmpty(options.updatedAt);
  const fetchedAt = isoOrEmpty(options.fetchedAt) || new Date(nowMs).toISOString();
  const referenceAt = updatedAt || publishedAt;
  const referenceMs = parseTimestamp(referenceAt);
  const ageDays = referenceMs === null ? null : Math.max(0, Math.floor((nowMs - referenceMs) / DAY_MS));

  let status = 'unknown';
  if (options.isExpired === true) status = 'expired';
  else if (ageDays !== null && ageDays <= limits.freshDays) status = 'fresh';
  else if (ageDays !== null && ageDays <= limits.staleDays) status = 'aging';
  else if (ageDays !== null) status = 'stale';

  const reasons = {
    fresh: `最近 ${limits.freshDays} 天内更新`,
    aging: `距上次更新 ${ageDays} 天，投递前建议打开官网复核`,
    stale: `距上次更新 ${ageDays} 天，职位状态可能已变化`,
    expired: '已超过明确截止日期',
    unknown: '缺少可验证的发布或更新时间'
  };

  return {
    freshness: status,
    freshnessLabel: FRESHNESS_LABELS[status],
    freshnessReason: reasons[status],
    publishedAt,
    updatedAt,
    fetchedAt,
    referenceAt,
    ageDays,
    freshDays: limits.freshDays,
    staleDays: limits.staleDays,
    isExpired: status === 'expired'
  };
}

function buildDataMeta(options = {}) {
  return {
    ...sourceMeta(options.source, options),
    ...freshnessMeta(options),
    fallbackReason: options.isFallback || /fallback|cache/i.test(clean(options.source))
      ? clean(options.fallbackReason) || '主数据源暂不可用'
      : ''
  };
}

function summarizeDataMeta(items, options = {}) {
  const list = Array.isArray(items) ? items : [];
  const counts = { fresh: 0, aging: 0, stale: 0, expired: 0, unknown: 0 };
  const sourceCodes = new Set();
  let fallbackCount = 0;
  list.forEach(item => {
    const meta = item && item.dataMeta;
    if (!meta) return;
    if (counts[meta.freshness] !== undefined) counts[meta.freshness] += 1;
    if (meta.sourceCode) sourceCodes.add(meta.sourceCode);
    if (meta.isFallback) fallbackCount += 1;
  });
  return {
    generatedAt: isoOrEmpty(options.generatedAt) || new Date().toISOString(),
    sourceCodes: [...sourceCodes],
    freshnessCounts: counts,
    fallbackCount,
    degraded: options.degraded === true || fallbackCount > 0,
    fallbackReason: clean(options.fallbackReason)
  };
}

module.exports = {
  SOURCE_CATALOG,
  FRESHNESS_LABELS,
  normalizeSourceCode,
  sourceMeta,
  parseTimestamp,
  freshnessMeta,
  buildDataMeta,
  summarizeDataMeta
};
