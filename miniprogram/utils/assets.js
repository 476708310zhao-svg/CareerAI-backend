const config = require('./app-config.js');

const ASSET_BASE = config.ASSET_BASE_URL || config.API_BASE_URL;
const CACHE_VERSION = '20260506a';
const LOCAL_ASSET_PREFIXES = ['/images/', '../../../images/', '../../../images/'];

function isLocalAsset(url) {
  return LOCAL_ASSET_PREFIXES.some(prefix => url.indexOf(prefix) === 0);
}

function appendVersion(url, version) {
  if (!url || !version) return url;
  if (url.indexOf('wxfile://') === 0 || url.indexOf('data:') === 0 || url.indexOf('cloud://') === 0) return url;
  if (isLocalAsset(url) || url.indexOf('v=') >= 0) return url;

  const separator = url.indexOf('?') >= 0 ? '&' : '?';
  return `${url}${separator}v=${version === true ? CACHE_VERSION : version}`;
}

function normalizeAssetUrl(url, options) {
  const opts = options || {};
  const fallback = opts.fallback || '';
  let value = String(url || '').trim();
  if (!value) return fallback;

  if (value.indexOf('wxfile://') === 0 || value.indexOf('data:') === 0 || value.indexOf('cloud://') === 0) {
    return value;
  }

  if (isLocalAsset(value)) {
    return value;
  }

  if (value.indexOf('//') === 0) {
    value = `https:${value}`;
  } else if (value.indexOf('http://') === 0) {
    value = value.replace(/^http:\/\//, 'https://');
  } else if (value.indexOf('/') === 0) {
    value = `${ASSET_BASE}${value}`;
  }

  return opts.version ? appendVersion(value, opts.version) : value;
}

function normalizeLogoUrl(url, fallback) {
  return normalizeAssetUrl(url, {
    fallback: fallback || '/images/default-company.png',
    version: CACHE_VERSION
  });
}

function normalizeBannerUrl(url) {
  return normalizeAssetUrl(url, {
    fallback: '',
    version: CACHE_VERSION
  });
}

function normalizeNewsImageUrl(url) {
  return normalizeAssetUrl(url, {
    fallback: '',
    version: CACHE_VERSION
  });
}

module.exports = {
  ASSET_BASE,
  CACHE_VERSION,
  normalizeAssetUrl,
  normalizeLogoUrl,
  normalizeBannerUrl,
  normalizeNewsImageUrl
};
