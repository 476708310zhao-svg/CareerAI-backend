const SOURCE_LABELS = {
  jsearch: 'JSearch',
  adzuna: 'Adzuna',
  remoteok: 'RemoteOK',
  themuse: 'The Muse',
  linkedin: 'LinkedIn',
  indeed: 'Indeed',
  greenhouse: 'Greenhouse 官网',
  lever: 'Lever 官网',
  feishu: '飞书人工精选',
  campus_feishu: '飞书校招日历',
  public_campus: '综合公开信息',
  local: '历史职位库',
  cache: '本地缓存',
  unknown: '来源待核实'
};

const FRESHNESS_LABELS = {
  fresh: '近期更新',
  aging: '建议复核',
  stale: '可能过期',
  expired: '已截止',
  unknown: '时间待核实'
};

function clean(value) {
  return String(value === undefined || value === null ? '' : value).trim();
}

function normalizeSourceCode(value) {
  const raw = clean(value).toLowerCase();
  if (raw === '飞书校招日历') return 'campus_feishu';
  if (raw === '综合公开信息') return 'public_campus';
  if (raw.indexOf('local') >= 0) return 'local';
  return SOURCE_LABELS[raw] ? raw : 'unknown';
}

function freshnessFromDate(value, domain, now) {
  const timestamp = Date.parse(value || '');
  if (!Number.isFinite(timestamp)) return 'unknown';
  const ageDays = Math.max(0, Math.floor(((now || Date.now()) - timestamp) / 86400000));
  const freshDays = domain === 'campus' ? 7 : 30;
  const staleDays = domain === 'campus' ? 30 : 90;
  if (ageDays <= freshDays) return 'fresh';
  if (ageDays <= staleDays) return 'aging';
  return 'stale';
}

function normalizeDataMeta(meta, defaults) {
  const source = (defaults && defaults.source) || '';
  const code = clean(meta && meta.sourceCode) || normalizeSourceCode(source);
  const domain = (defaults && defaults.domain) || 'job';
  const referenceAt = clean(meta && meta.referenceAt) || clean(defaults && (defaults.updatedAt || defaults.publishedAt));
  const freshness = clean(meta && meta.freshness)
    || ((defaults && defaults.isExpired) ? 'expired' : freshnessFromDate(referenceAt, domain));
  const isFallback = !!(meta && meta.isFallback) || !!(defaults && defaults.isFallback);
  return Object.assign({}, meta || {}, {
    sourceCode: code,
    sourceLabel: clean(meta && meta.sourceLabel) || SOURCE_LABELS[code] || SOURCE_LABELS.unknown,
    freshness,
    freshnessLabel: clean(meta && meta.freshnessLabel) || FRESHNESS_LABELS[freshness] || FRESHNESS_LABELS.unknown,
    referenceAt,
    isFallback,
    fallbackReason: clean(meta && meta.fallbackReason) || (isFallback ? clean(defaults && defaults.fallbackReason) : '')
  });
}

function markCachedDataMeta(meta, defaults) {
  const original = normalizeDataMeta(meta || {}, defaults || {});
  return Object.assign({}, original, {
    originSourceCode: original.sourceCode,
    originSourceLabel: original.sourceLabel,
    sourceCode: 'cache',
    sourceLabel: SOURCE_LABELS.cache,
    isFallback: true,
    fallbackReason: '当前展示的是最近一次成功加载的本地缓存'
  });
}

function freshnessTone(meta) {
  const value = normalizeDataMeta(meta || {}, {});
  if (value.isFallback) return 'fallback';
  return ['fresh', 'aging', 'stale', 'expired'].indexOf(value.freshness) >= 0 ? value.freshness : 'unknown';
}

function summaryText(meta) {
  const value = normalizeDataMeta(meta || {}, {});
  return [value.sourceLabel, value.freshnessLabel].filter(Boolean).join(' · ');
}

module.exports = { SOURCE_LABELS, FRESHNESS_LABELS, normalizeDataMeta, markCachedDataMeta, freshnessTone, summaryText };
