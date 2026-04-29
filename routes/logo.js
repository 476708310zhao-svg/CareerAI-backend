// routes/logo.js
// GET /api/logo?domain=google.com&name=Google
// Real logo cache -> Clearbit -> Google favicon -> DuckDuckGo -> site favicon -> SVG initials.

const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const router = express.Router();

const CACHE_DIR = path.join(__dirname, '../uploads/logos');
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

const NAME_TO_DOMAIN = {
  google: 'google.com',
  alphabet: 'abc.xyz',
  microsoft: 'microsoft.com',
  apple: 'apple.com',
  amazon: 'amazon.com',
  meta: 'meta.com',
  facebook: 'meta.com',
  nvidia: 'nvidia.com',
  tesla: 'tesla.com',
  openai: 'openai.com',
  bytedance: 'bytedance.com',
  tiktok: 'tiktok.com',
  tencent: 'tencent.com',
  alibaba: 'alibaba.com',
  huawei: 'huawei.com',
  accenture: 'accenture.com',
  deloitte: 'deloitte.com',
  mckinsey: 'mckinsey.com',
  bcg: 'bcg.com',
  'goldman sachs': 'goldmansachs.com',
  jpmorgan: 'jpmorgan.com',
  'jpmorgan chase': 'jpmorganchase.com',
  siemens: 'siemens.com',
  samsung: 'samsung.com',
  toyota: 'toyota.com',
  netflix: 'netflix.com',
  salesforce: 'salesforce.com',
  adobe: 'adobe.com',
  uber: 'uber.com',
  airbnb: 'airbnb.com',
  'amazon web services': 'aws.amazon.com',
  aws: 'aws.amazon.com',
  stripe: 'stripe.com',
  spotify: 'spotify.com',
  tiktok: 'tiktok.com',
  crowdstrike: 'crowdstrike.com',
  oracle: 'oracle.com',
  ibm: 'ibm.com',
  linkedin: 'linkedin.com',
  citadel: 'citadel.com',
  barclays: 'barclays.com',
  'morgan stanley': 'morganstanley.com',
  kpmg: 'kpmg.com'
};

const SIMPLE_ICON_SLUGS = {
  'accenture.com': 'accenture',
  'alibaba.com': 'alibabadotcom',
  'apple.com': 'apple',
  'aws.amazon.com': 'amazonaws',
  'google.com': 'google',
  'huawei.com': 'huawei',
  'linkedin.com': 'linkedin',
  'nvidia.com': 'nvidia',
  'salesforce.com': 'salesforce',
  'tesla.com': 'tesla',
  'meta.com': 'meta',
  'samsung.com': 'samsung',
  'spotify.com': 'spotify',
  'stripe.com': 'stripe',
  'tiktok.com': 'tiktok',
  'toyota.com': 'toyota',
  'siemens.com': 'siemens',
  accenture: 'accenture',
  alibaba: 'alibabadotcom',
  apple: 'apple',
  aws: 'amazonaws',
  google: 'google',
  huawei: 'huawei',
  linkedin: 'linkedin',
  nvidia: 'nvidia',
  salesforce: 'salesforce',
  spotify: 'spotify',
  stripe: 'stripe',
  tiktok: 'tiktok',
  tesla: 'tesla',
  meta: 'meta',
  samsung: 'samsung',
  toyota: 'toyota',
  siemens: 'siemens'
};

const GRADIENTS = [
  ['#667eea', '#764ba2'],
  ['#f093fb', '#f5576c'],
  ['#4facfe', '#00f2fe'],
  ['#43e97b', '#38f9d7'],
  ['#fa709a', '#fee140'],
  ['#a18cd1', '#fbc2eb'],
  ['#fccb90', '#d57eeb'],
  ['#e0c3fc', '#8ec5fc'],
  ['#f6d365', '#fda085'],
  ['#96fbc4', '#f9f586'],
  ['#89f7fe', '#66a6ff'],
  ['#fddb92', '#d1fdff']
];

function sanitizeDomain(domain) {
  return String(domain || '')
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split('/')[0]
    .trim()
    .toLowerCase();
}

function pickGradient(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
  }
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length];
}

function getInitials(name) {
  if (!name) return '?';
  const english = String(name).match(/[A-Za-z]+/g);
  if (english && english.length >= 2) {
    return (english[0][0] + english[1][0]).toUpperCase();
  }
  if (english && english[0]) {
    return english[0].slice(0, 2).toUpperCase();
  }
  return String(name).slice(0, 2).toUpperCase();
}

function makeSvg(name, size) {
  const s = parseInt(size, 10) || 128;
  const radius = Math.round(s * 0.22);
  const [c1, c2] = pickGradient(name);
  const initials = getInitials(name);
  const fontSize = initials.length === 1 ? Math.round(s * 0.42) : Math.round(s * 0.34);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${c1}"/>
      <stop offset="100%" stop-color="${c2}"/>
    </linearGradient>
  </defs>
  <rect width="${s}" height="${s}" rx="${radius}" ry="${radius}" fill="url(#g)"/>
  <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle"
    fill="white" font-size="${fontSize}" font-weight="700"
    font-family="SF Pro Display, Helvetica Neue, Arial, sans-serif">${initials}</text>
</svg>`;
}

function domainFromName(name) {
  const key = String(name || '').toLowerCase().trim();
  return NAME_TO_DOMAIN[key] || null;
}

function cacheFile(domain) {
  return path.join(CACHE_DIR, `${domain.replace(/[^a-z0-9.-]/gi, '_')}.bin`);
}

function cacheMetaFile(domain) {
  return `${cacheFile(domain)}.json`;
}

function normalizeContentType(value) {
  const contentType = String(value || '').split(';')[0].trim().toLowerCase();
  return contentType && contentType.startsWith('image/') ? contentType : 'image/png';
}

function sendLogo(res, buf, contentType, maxAge = 2592000) {
  res.setHeader('Content-Type', normalizeContentType(contentType));
  res.setHeader('Cache-Control', `public, max-age=${maxAge}`);
  return res.send(buf);
}

function sendCachedLogo(res, domain) {
  let meta = {};
  const metaFile = cacheMetaFile(domain);
  if (fs.existsSync(metaFile)) {
    try {
      meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    } catch (_) {
      meta = {};
    }
  }
  return sendLogo(res, fs.readFileSync(cacheFile(domain)), meta.contentType || 'image/png');
}

function saveCachedLogo(domain, buf, contentType, source) {
  fs.writeFileSync(cacheFile(domain), buf);
  fs.writeFileSync(cacheMetaFile(domain), JSON.stringify({
    contentType: normalizeContentType(contentType),
    source,
    updatedAt: new Date().toISOString()
  }, null, 2));
}

function simpleIconSlug(domain, name) {
  const cleanDomain = sanitizeDomain(domain);
  const nameKey = String(name || '').toLowerCase().trim();
  const domainKey = cleanDomain.replace(/\.(com|cn|net|org|io|co|ai)$/i, '');
  return SIMPLE_ICON_SLUGS[cleanDomain] || SIMPLE_ICON_SLUGS[nameKey] || SIMPLE_ICON_SLUGS[domainKey] || '';
}

function logoSources(domain, size, name) {
  const cleanDomain = sanitizeDomain(domain);
  const encodedDomain = encodeURIComponent(cleanDomain);
  const sources = [];
  const iconSlug = simpleIconSlug(cleanDomain, name);
  if (iconSlug) {
    sources.push(['simple-icons', `https://cdn.simpleicons.org/${iconSlug}`]);
  }
  sources.push(
    ['clearbit', `https://logo.clearbit.com/${encodedDomain}?size=${size}`],
    ['google-favicon-url', `https://www.google.com/s2/favicons?sz=${size}&domain_url=${encodedDomain}`],
    ['google-favicon', `https://www.google.com/s2/favicons?domain=${encodedDomain}&sz=${size}`],
    ['duckduckgo', `https://icons.duckduckgo.com/ip3/${encodedDomain}.ico`],
    ['site-favicon', `https://${cleanDomain}/favicon.ico`]
  );
  if (!String(domain || '').toLowerCase().startsWith('www.')) {
    sources.push(['site-www-favicon', `https://www.${cleanDomain}/favicon.ico`]);
  }
  return sources.map(([name, url]) => ({ name, url }));
}

async function fetchRemoteLogo(domain, size, name) {
  for (const source of logoSources(domain, size, name)) {
    try {
      const response = await axios.get(source.url, {
        responseType: 'arraybuffer',
        timeout: 6000,
        maxRedirects: 3,
        validateStatus: status => status >= 200 && status < 300,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      const buf = Buffer.from(response.data);
      const contentType = normalizeContentType(response.headers['content-type']);
      if (buf.length > 80 && contentType.startsWith('image/')) {
        return { buf, contentType, source: source.name };
      }
    } catch (_) {
      // Try the next provider.
    }
  }
  return null;
}

router.get('/', async (req, res) => {
  let { domain, name, size = 128 } = req.query;
  const displayName = name || domain || '?';

  if (!domain && name) domain = domainFromName(name);
  domain = sanitizeDomain(domain);

  if (domain) {
    if (fs.existsSync(cacheFile(domain))) {
      return sendCachedLogo(res, domain);
    }

    const remoteLogo = await fetchRemoteLogo(domain, size, displayName);
    if (remoteLogo) {
      saveCachedLogo(domain, remoteLogo.buf, remoteLogo.contentType, remoteLogo.source);
      return sendLogo(res, remoteLogo.buf, remoteLogo.contentType);
    }
  }

  const svg = makeSvg(displayName, size);
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  return res.send(svg);
});

module.exports = router;
