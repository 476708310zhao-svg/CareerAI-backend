// routes/logo.js
// GET /api/logo?domain=google.com&name=Google
// Real logo cache -> Clearbit -> Google favicon -> DuckDuckGo -> site favicon -> SVG initials.

const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { UPLOAD_DIR, ensureDir } = require('../utils/paths');

const router = express.Router();

const CACHE_DIR = ensureDir(path.join(UPLOAD_DIR, 'logos'));

const NAME_TO_DOMAIN = {
  // ── 科技巨头 ──
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
  anthropic: 'anthropic.com',
  bytedance: 'bytedance.com',
  tiktok: 'tiktok.com',
  tencent: 'tencent.com',
  alibaba: 'alibaba.com',
  huawei: 'huawei.com',
  intel: 'intel.com',
  amd: 'amd.com',
  qualcomm: 'qualcomm.com',
  cisco: 'cisco.com',
  vmware: 'vmware.com',
  broadcom: 'broadcom.com',
  'amazon web services': 'aws.amazon.com',
  aws: 'aws.amazon.com',
  // ── 软件/云/SaaS ──
  salesforce: 'salesforce.com',
  adobe: 'adobe.com',
  oracle: 'oracle.com',
  ibm: 'ibm.com',
  sap: 'sap.com',
  servicenow: 'servicenow.com',
  workday: 'workday.com',
  zendesk: 'zendesk.com',
  hubspot: 'hubspot.com',
  atlassian: 'atlassian.com',
  slack: 'slack.com',
  zoom: 'zoom.us',
  twilio: 'twilio.com',
  snowflake: 'snowflake.com',
  databricks: 'databricks.com',
  palantir: 'palantir.com',
  crowdstrike: 'crowdstrike.com',
  okta: 'okta.com',
  datadog: 'datadog.com',
  splunk: 'splunk.com',
  pagerduty: 'pagerduty.com',
  elastic: 'elastic.co',
  hashicorp: 'hashicorp.com',
  gitlab: 'gitlab.com',
  github: 'github.com',
  // ── 互联网/平台 ──
  netflix: 'netflix.com',
  spotify: 'spotify.com',
  uber: 'uber.com',
  lyft: 'lyft.com',
  airbnb: 'airbnb.com',
  doordash: 'doordash.com',
  instacart: 'instacart.com',
  coinbase: 'coinbase.com',
  stripe: 'stripe.com',
  square: 'squareup.com',
  block: 'block.xyz',
  paypal: 'paypal.com',
  shopify: 'shopify.com',
  pinterest: 'pinterest.com',
  snap: 'snap.com',
  snapchat: 'snap.com',
  twitter: 'x.com',
  x: 'x.com',
  reddit: 'reddit.com',
  discord: 'discord.com',
  roblox: 'roblox.com',
  twitch: 'twitch.tv',
  epic: 'epicgames.com',
  'epic games': 'epicgames.com',
  // ── 咨询 ──
  accenture: 'accenture.com',
  deloitte: 'deloitte.com',
  mckinsey: 'mckinsey.com',
  bcg: 'bcg.com',
  'boston consulting group': 'bcg.com',
  bain: 'bain.com',
  'bain & company': 'bain.com',
  pwc: 'pwc.com',
  'pricewaterhousecoopers': 'pwc.com',
  ey: 'ey.com',
  'ernst & young': 'ey.com',
  kpmg: 'kpmg.com',
  capgemini: 'capgemini.com',
  cognizant: 'cognizant.com',
  infosys: 'infosys.com',
  wipro: 'wipro.com',
  tcs: 'tcs.com',
  'tata consultancy': 'tcs.com',
  'tata consultancy services': 'tcs.com',
  // ── 金融 ──
  'goldman sachs': 'goldmansachs.com',
  jpmorgan: 'jpmorgan.com',
  'jpmorgan chase': 'jpmorganchase.com',
  'j.p. morgan': 'jpmorgan.com',
  'morgan stanley': 'morganstanley.com',
  'bank of america': 'bankofamerica.com',
  'wells fargo': 'wellsfargo.com',
  citibank: 'citi.com',
  citi: 'citi.com',
  barclays: 'barclays.com',
  'credit suisse': 'credit-suisse.com',
  ubs: 'ubs.com',
  'deutsche bank': 'db.com',
  hsbc: 'hsbc.com',
  blackrock: 'blackrock.com',
  vanguard: 'vanguard.com',
  fidelity: 'fidelity.com',
  citadel: 'citadel.com',
  'two sigma': 'twosigma.com',
  'jane street': 'janestreet.com',
  'point72': 'point72.com',
  'de shaw': 'deshaw.com',
  'd.e. shaw': 'deshaw.com',
  // ── 半导体/硬件 ──
  siemens: 'siemens.com',
  samsung: 'samsung.com',
  tsmc: 'tsmc.com',
  asml: 'asml.com',
  'texas instruments': 'ti.com',
  micron: 'micron.com',
  'western digital': 'westerndigital.com',
  seagate: 'seagate.com',
  // ── 汽车/出行 ──
  toyota: 'toyota.com',
  volkswagen: 'volkswagen.com',
  bmw: 'bmw.com',
  mercedes: 'mercedes-benz.com',
  'mercedes-benz': 'mercedes-benz.com',
  ford: 'ford.com',
  gm: 'gm.com',
  'general motors': 'gm.com',
  rivian: 'rivian.com',
  lucid: 'lucidmotors.com',
  waymo: 'waymo.com',
  // ── 医疗/健康科技 ──
  unitedhealth: 'unitedhealthgroup.com',
  'united health': 'unitedhealthgroup.com',
  johnson: 'jnj.com',
  'johnson & johnson': 'jnj.com',
  pfizer: 'pfizer.com',
  abbvie: 'abbvie.com',
  amgen: 'amgen.com',
  gilead: 'gilead.com',
  moderna: 'modernatx.com',
  cvs: 'cvshealth.com',
  'cvs health': 'cvshealth.com',
  // ── 其他知名雇主 ──
  linkedin: 'linkedin.com',
  'general electric': 'ge.com',
  ge: 'ge.com',
  boeing: 'boeing.com',
  lockheed: 'lockheedmartin.com',
  'lockheed martin': 'lockheedmartin.com',
  raytheon: 'rtx.com',
  'northrop grumman': 'northropgrumman.com',
  walmart: 'walmart.com',
  target: 'target.com',
  costco: 'costco.com',
  nike: 'nike.com',
  'procter & gamble': 'pg.com',
  pg: 'pg.com',
  unilever: 'unilever.com',
};

const SIMPLE_ICON_SLUGS = {
  // domain → slug
  'accenture.com': 'accenture',
  'adobe.com': 'adobe',
  'airbnb.com': 'airbnb',
  'alibaba.com': 'alibabadotcom',
  'amazon.com': 'amazon',
  'amd.com': 'amd',
  'anthropic.com': 'anthropic',
  'apple.com': 'apple',
  'atlassian.com': 'atlassian',
  'aws.amazon.com': 'amazonaws',
  'barclays.com': 'barclays',
  'cisco.com': 'cisco',
  'coinbase.com': 'coinbase',
  'crowdstrike.com': 'crowdstrike',
  'databricks.com': 'databricks',
  'datadog.com': 'datadog',
  'discord.com': 'discord',
  'doordash.com': 'doordash',
  'elastic.co': 'elastic',
  'figma.com': 'figma',
  'github.com': 'github',
  'gitlab.com': 'gitlab',
  'google.com': 'google',
  'hashicorp.com': 'hashicorp',
  'hubspot.com': 'hubspot',
  'huawei.com': 'huawei',
  'ibm.com': 'ibm',
  'infosys.com': 'infosys',
  'intel.com': 'intel',
  'linkedin.com': 'linkedin',
  'lyft.com': 'lyft',
  'meta.com': 'meta',
  'microsoft.com': 'microsoft',
  'netflix.com': 'netflix',
  'nvidia.com': 'nvidia',
  'okta.com': 'okta',
  'openai.com': 'openai',
  'oracle.com': 'oracle',
  'palantir.com': 'palantir',
  'paypal.com': 'paypal',
  'pinterest.com': 'pinterest',
  'qualcomm.com': 'qualcomm',
  'reddit.com': 'reddit',
  'roblox.com': 'roblox',
  'salesforce.com': 'salesforce',
  'samsung.com': 'samsung',
  'sap.com': 'sap',
  'servicenow.com': 'servicenow',
  'shopify.com': 'shopify',
  'siemens.com': 'siemens',
  'slack.com': 'slack',
  'snap.com': 'snapchat',
  'snowflake.com': 'snowflake',
  'spotify.com': 'spotify',
  'squareup.com': 'square',
  'stripe.com': 'stripe',
  'tesla.com': 'tesla',
  'tiktok.com': 'tiktok',
  'toyota.com': 'toyota',
  'twilio.com': 'twilio',
  'twitch.tv': 'twitch',
  'uber.com': 'uber',
  'vmware.com': 'vmware',
  'walmart.com': 'walmart',
  'wipro.com': 'wipro',
  'workday.com': 'workday',
  'x.com': 'x',
  'zoom.us': 'zoom',
  // name → slug (fallback when domain not provided)
  accenture: 'accenture',
  adobe: 'adobe',
  airbnb: 'airbnb',
  alibaba: 'alibabadotcom',
  amazon: 'amazon',
  amd: 'amd',
  anthropic: 'anthropic',
  apple: 'apple',
  atlassian: 'atlassian',
  aws: 'amazonaws',
  cisco: 'cisco',
  coinbase: 'coinbase',
  crowdstrike: 'crowdstrike',
  databricks: 'databricks',
  datadog: 'datadog',
  discord: 'discord',
  doordash: 'doordash',
  figma: 'figma',
  github: 'github',
  gitlab: 'gitlab',
  google: 'google',
  hubspot: 'hubspot',
  huawei: 'huawei',
  ibm: 'ibm',
  infosys: 'infosys',
  intel: 'intel',
  linkedin: 'linkedin',
  lyft: 'lyft',
  meta: 'meta',
  microsoft: 'microsoft',
  netflix: 'netflix',
  nvidia: 'nvidia',
  okta: 'okta',
  openai: 'openai',
  oracle: 'oracle',
  palantir: 'palantir',
  paypal: 'paypal',
  pinterest: 'pinterest',
  reddit: 'reddit',
  salesforce: 'salesforce',
  samsung: 'samsung',
  sap: 'sap',
  shopify: 'shopify',
  siemens: 'siemens',
  slack: 'slack',
  snowflake: 'snowflake',
  spotify: 'spotify',
  stripe: 'stripe',
  tiktok: 'tiktok',
  tesla: 'tesla',
  meta: 'meta',
  samsung: 'samsung',
  toyota: 'toyota',
  twilio: 'twilio',
  twitch: 'twitch',
  uber: 'uber',
  walmart: 'walmart',
  workday: 'workday',
  zoom: 'zoom',
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
