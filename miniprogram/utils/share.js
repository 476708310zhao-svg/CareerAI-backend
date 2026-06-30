const config = require('./app-config.js');
const localShareConfig = require('./shareConfig.js');

const APP_NAME = '\u804c\u5f15';
const DEFAULT_TITLE = localShareConfig.DEFAULT_SHARE.title;
const DEFAULT_IMAGE = localShareConfig.DEFAULT_SHARE.imageUrl;
const SHARE_CACHE_KEY = 'share_config_cache';
const SHARE_CACHE_TTL = 30 * 60 * 1000;
const API_BASE = config.API_BASE_URL;
const ASSET_BASE = config.ASSET_BASE_URL || API_BASE;

let shareConfigCache = {
  default: { title: DEFAULT_TITLE, imageUrl: DEFAULT_IMAGE },
  routes: localShareConfig.ROUTE_SHARES || {}
};
let shareConfigLoadedFromStorage = false;
let shareConfigLoading = false;

const ROUTE_TITLES = {
  'pages/index/index': DEFAULT_TITLE,
  'pages/jobs/jobs': '\u9ad8\u85aa\u5c97\u4f4d\u4e0e\u6821\u62db\u673a\u4f1a | \u804c\u5f15',
  'package-user/pages/job-detail/job-detail': '\u804c\u4f4d\u8be6\u60c5 | \u804c\u5f15',
  'pages/experiences/experiences': '\u9762\u8bd5\u9898\u5e93\u4e0e\u771f\u5b9e\u9762\u7ecf | \u804c\u5f15',
  'package-content/pages/experience-detail/experience-detail': '\u9762\u7ecf\u8be6\u60c5 | \u804c\u5f15',
  'package-content/pages/question-detail/question-detail': '\u9762\u8bd5\u9898\u76ee\u8be6\u89e3 | \u804c\u5f15',
  'package-content/pages/star-library/star-library': 'STAR\u9762\u8bd5\u7b54\u9898\u6a21\u677f | \u804c\u5f15',
  'pages/campus/campus': '\u6821\u62db\u65e5\u5386 | \u804c\u5f15',
  'package-content/pages/campus-detail/campus-detail': '\u6821\u62db\u673a\u4f1a\u8be6\u60c5 | \u804c\u5f15',
  'pages/agencies/agencies': '\u6c42\u804c\u673a\u6784\u6d4b\u8bc4 | \u804c\u5f15',
  'package-agency/pages/agency-detail/agency-detail': '\u6c42\u804c\u673a\u6784\u8be6\u60c5 | \u804c\u5f15',
  'package-agency/pages/agency-compare/agency-compare': '\u6c42\u804c\u673a\u6784\u5bf9\u6bd4 | \u804c\u5f15',
  'package-content/pages/news/news': '\u6c42\u804c\u5feb\u8baf | \u804c\u5f15',
  'package-content/pages/news-detail/news-detail': '\u6c42\u804c\u5feb\u8baf | \u804c\u5f15',
  'package-content/pages/bigtech-jobs/bigtech-jobs': '\u5927\u5382\u76f4\u62db\u5165\u53e3 | \u804c\u5f15',
  'package-user/pages/companies/companies': '\u70ed\u95e8\u4f01\u4e1a\u5e93 | \u804c\u5f15',
  'package-user/pages/company-detail/company-detail': '\u516c\u53f8\u8be6\u60c5 | \u804c\u5f15',
  'package-user/pages/search/search': '\u5168\u7ad9\u641c\u7d22 | \u804c\u5f15',
  'package-user/pages/job-progress/job-progress': '\u6211\u7684\u6c42\u804c\u8fdb\u5ea6 | \u804c\u5f15',
  'package-ai/pages/daily-brief/daily-brief': '\u6bcf\u65e5\u6c42\u804c\u7b80\u62a5 | \u804c\u5f15',
  'package-career/pages/salary/salary': '\u67e5\u85aa\u8d44 | \u804c\u5f15',
  'package-career/pages/skill-pathways/skill-pathways': '\u6280\u80fd\u6210\u957f\u8def\u5f84 | \u804c\u5f15',
  'package-career/pages/job-insights/job-insights': '\u6c42\u804c\u8d8b\u52bf\u6d1e\u5bdf | \u804c\u5f15',
  'package-career/pages/oa-bank/oa-bank': 'OA\u9898\u5e93 | \u804c\u5f15'
};

const TIMELINE_EXCLUDED_ROUTES = [
  'pages/profile/profile',
  'pages/privacy/privacy',
  'pages/about/about',
  'package-user/pages/applications/applications',
  'package-user/pages/apply-form/apply-form',
  'package-user/pages/profile-edit/profile-edit',
  'package-user/pages/favorites/favorites',
  'package-user/pages/job-progress/job-progress',
  'package-user/pages/messages/messages',
  'package-user/pages/my-experiences/my-experiences',
  'package-user/pages/settings/settings',
  'package-user/pages/feedback/feedback',
  'package-user/pages/about/about',
  'package-user/pages/vip/vip',
  'package-career/pages/resume/resume',
  'package-career/pages/career-planner/career-planner',
  'package-career/pages/project-builder/project-builder',
  'package-career/pages/offer-compare/offer-compare',
  'package-career/pages/ats-optimize/ats-optimize',
  'package-career/pages/networking/networking',
  'package-ai/pages/ai-assistant/ai-assistant',
  'package-ai/pages/ai-history/ai-history',
  'package-ai/pages/ai-report/ai-report',
  'package-ai/pages/interview-setup/interview-setup',
  'package-ai/pages/interview-dialog/interview-dialog',
  'package-ai/pages/audio-review/audio-review',
  'package-ai/pages/project-review/project-review',
  'package-ai/pages/daily-brief/daily-brief',
  'package-content/pages/webview/webview'
];

const excludedRouteMap = TIMELINE_EXCLUDED_ROUTES.reduce(function(map, route) {
  map[route] = true;
  return map;
}, {});

function normalizeRoute(route) {
  return String(route || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
}

function normalizeShareConfig(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const defaultConfig = source.default && typeof source.default === 'object' ? source.default : {};
  const routes = source.routes && typeof source.routes === 'object' ? source.routes : {};
  const normalizedRoutes = {};
  Object.keys(routes).forEach(function(route) {
    const key = normalizeRoute(route);
    const item = routes[route] || {};
    if (!key) return;
    normalizedRoutes[key] = {
      title: cleanTitle(item.title),
      imageUrl: cleanImageUrl(item.imageUrl)
    };
  });
  return {
    default: {
      title: cleanTitle(defaultConfig.title) || DEFAULT_TITLE,
      imageUrl: cleanImageUrl(defaultConfig.imageUrl) || DEFAULT_IMAGE
    },
    routes: normalizedRoutes
  };
}

function ensureShareConfigFromStorage() {
  if (shareConfigLoadedFromStorage || typeof wx === 'undefined') return;
  shareConfigLoadedFromStorage = true;
  try {
    const cached = wx.getStorageSync(SHARE_CACHE_KEY);
    if (cached && cached.data && (Date.now() - cached.t) < SHARE_CACHE_TTL) {
      shareConfigCache = normalizeShareConfig(cached.data);
    }
  } catch (e) {}
}

function saveShareConfigToStorage(data) {
  if (typeof wx === 'undefined') return;
  try {
    wx.setStorageSync(SHARE_CACHE_KEY, { t: Date.now(), data });
  } catch (e) {}
}

function loadShareConfig(force) {
  if (typeof wx === 'undefined') return;
  ensureShareConfigFromStorage();
  if (shareConfigLoading && !force) return;
  shareConfigLoading = true;
  wx.request({
    url: API_BASE + '/api/share/configs',
    method: 'GET',
    success(res) {
      const body = res && res.data;
      if (res.statusCode === 200 && body && body.code === 0 && body.data) {
        shareConfigCache = normalizeShareConfig(body.data);
        saveShareConfigToStorage(body.data);
      }
    },
    complete() {
      shareConfigLoading = false;
    }
  });
}

function isTimelineShareAllowed(route) {
  return !excludedRouteMap[normalizeRoute(route)];
}

function encodeValue(value) {
  return encodeURIComponent(String(value == null ? '' : value));
}

function stringifyQuery(query) {
  if (!query || typeof query !== 'object') return '';
  return Object.keys(query)
    .filter(function(key) {
      return query[key] !== undefined && query[key] !== null && query[key] !== '';
    })
    .map(function(key) {
      return encodeValue(key) + '=' + encodeValue(query[key]);
    })
    .join('&');
}

function parsePathQuery(path) {
  const text = String(path || '');
  const questionIndex = text.indexOf('?');
  return questionIndex >= 0 ? text.slice(questionIndex + 1) : '';
}

function cleanTitle(title) {
  return String(title || '').replace(/\s+/g, ' ').trim();
}

function cleanImageUrl(imageUrl) {
  return String(imageUrl || '').trim();
}

function resolveImageUrl(imageUrl) {
  const url = cleanImageUrl(imageUrl);
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  if (url.indexOf('/uploads/') === 0 || url.indexOf('/api/') === 0) {
    return ASSET_BASE.replace(/\/+$/, '') + url;
  }
  return url;
}

function getConfiguredShare(route) {
  ensureShareConfigFromStorage();
  const normalizedRoute = normalizeRoute(route);
  const routeConfig = shareConfigCache.routes[normalizedRoute] || {};
  return {
    title: cleanTitle(routeConfig.title),
    imageUrl: resolveImageUrl(routeConfig.imageUrl),
    defaultTitle: cleanTitle(shareConfigCache.default && shareConfigCache.default.title) || DEFAULT_TITLE,
    defaultImageUrl: resolveImageUrl(shareConfigCache.default && shareConfigCache.default.imageUrl) || DEFAULT_IMAGE
  };
}

function getNestedValue(source, keys) {
  let current = source;
  for (let i = 0; i < keys.length; i += 1) {
    if (!current) return '';
    current = current[keys[i]];
  }
  return current;
}

function resolveDataTitle(page) {
  const data = page && page.data ? page.data : {};
  const jobTitle = cleanTitle(getNestedValue(data, ['job', 'title']));
  const jobCompany = cleanTitle(getNestedValue(data, ['job', 'company']));
  if (jobTitle && jobCompany) return '\u62db\u8058\uff1a' + jobTitle + ' - ' + jobCompany;
  if (jobTitle) return jobTitle + ' | ' + APP_NAME;

  const companyName = cleanTitle(getNestedValue(data, ['company', 'name']));
  if (companyName) return companyName + ' - ' + APP_NAME;

  const experienceTitle = cleanTitle(getNestedValue(data, ['experience', 'title']));
  if (experienceTitle) return experienceTitle;

  const questionTitle = cleanTitle(getNestedValue(data, ['question', 'title']));
  if (questionTitle) return questionTitle + ' | ' + APP_NAME;

  const newsTitle = cleanTitle(getNestedValue(data, ['news', 'title']));
  if (newsTitle) return newsTitle;

  const agencyName = cleanTitle(getNestedValue(data, ['agency', 'name']));
  if (agencyName) return agencyName + ' - ' + APP_NAME;

  const campusTitle = cleanTitle(getNestedValue(data, ['campus', 'title'])) ||
    cleanTitle(getNestedValue(data, ['detail', 'title']));
  if (campusTitle) return campusTitle + ' | ' + APP_NAME;

  return '';
}

function resolveRouteTitle(page) {
  const route = normalizeRoute(page && page.route);
  return ROUTE_TITLES[route] || DEFAULT_TITLE;
}

function safeCallShareAppMessage(page, handler) {
  if (typeof handler !== 'function') return null;
  try {
    return handler.call(page, { from: 'menu', target: null }) || null;
  } catch (e) {
    return null;
  }
}

function rememberPageQuery(page, options) {
  if (!page) return;
  page.__shareQuery = stringifyQuery(options || {});
}

function buildDefaultShareAppMessage(page) {
  const route = normalizeRoute(page && page.route) || 'pages/index/index';
  const query = page && page.__shareQuery ? page.__shareQuery : '';
  const configured = getConfiguredShare(route);
  return {
    title: configured.title || resolveDataTitle(page) || resolveRouteTitle(page) || configured.defaultTitle,
    path: '/' + route + (query ? '?' + query : ''),
    imageUrl: configured.imageUrl || configured.defaultImageUrl
  };
}

function applyShareConfig(page, share) {
  const route = normalizeRoute(page && page.route) || 'pages/index/index';
  const query = page && page.__shareQuery ? page.__shareQuery : '';
  const base = share && typeof share === 'object' ? share : {};
  const configured = getConfiguredShare(route);
  return {
    ...base,
    title: configured.title || cleanTitle(base.title) || resolveDataTitle(page) || resolveRouteTitle(page) || configured.defaultTitle,
    path: base.path || ('/' + route + (query ? '?' + query : '')),
    imageUrl: configured.imageUrl || resolveImageUrl(base.imageUrl) || configured.defaultImageUrl
  };
}

function buildTimelineShare(page, originalShareAppMessage) {
  const appShare = safeCallShareAppMessage(page, originalShareAppMessage);
  const route = normalizeRoute(page && page.route) || 'pages/index/index';
  const configured = getConfiguredShare(route);
  const title = configured.title || cleanTitle(appShare && appShare.title) || resolveDataTitle(page) || resolveRouteTitle(page) || configured.defaultTitle;
  const storedQuery = page && page.__shareQuery ? page.__shareQuery : '';
  const appShareQuery = appShare && appShare.path ? parsePathQuery(appShare.path) : '';
  const imageUrl = configured.imageUrl || resolveImageUrl(appShare && appShare.imageUrl) || configured.defaultImageUrl;

  return {
    title,
    query: storedQuery || appShareQuery,
    imageUrl
  };
}

function configureShareMenu(page) {
  if (!page || typeof wx === 'undefined') return;
  loadShareConfig(false);
  const route = normalizeRoute(page.route);
  const allowTimeline = isTimelineShareAllowed(route);

  if (typeof wx.showShareMenu === 'function') {
    try {
      wx.showShareMenu({
        withShareTicket: true,
        menus: allowTimeline ? ['shareAppMessage', 'shareTimeline'] : ['shareAppMessage']
      });
    } catch (e) {}
  }

  if (!allowTimeline && typeof wx.hideShareMenu === 'function') {
    try {
      wx.hideShareMenu({ menus: ['shareTimeline'] });
    } catch (e) {}
  }
}

function wrapLifecycle(options, name, before) {
  const original = options[name];
  options[name] = function() {
    before(this, arguments);
    if (typeof original === 'function') {
      return original.apply(this, arguments);
    }
    return undefined;
  };
}

function installPageShare() {
  if (typeof Page !== 'function' || Page.__careerShareInstalled) return;

  const originalPage = Page;
  const patchedPage = function(options) {
    options = options || {};
    const originalShareAppMessage = options.onShareAppMessage;
    const originalShareTimeline = options.onShareTimeline;

    wrapLifecycle(options, 'onLoad', function(page, args) {
      rememberPageQuery(page, args && args[0]);
      configureShareMenu(page);
    });

    wrapLifecycle(options, 'onShow', function(page) {
      configureShareMenu(page);
    });

    options.onShareAppMessage = function(event) {
      const base = typeof originalShareAppMessage === 'function'
        ? originalShareAppMessage.call(this, event)
        : buildDefaultShareAppMessage(this);
      return applyShareConfig(this, base);
    };

    options.onShareTimeline = function() {
      if (typeof originalShareTimeline === 'function') {
        const base = originalShareTimeline.call(this) || {};
        const route = normalizeRoute(this && this.route) || 'pages/index/index';
        const configured = getConfiguredShare(route);
        return {
          ...base,
          title: configured.title || cleanTitle(base.title) || resolveDataTitle(this) || resolveRouteTitle(this) || configured.defaultTitle,
          imageUrl: configured.imageUrl || resolveImageUrl(base.imageUrl) || configured.defaultImageUrl
        };
      }
      return buildTimelineShare(this, originalShareAppMessage);
    };

    return originalPage(options);
  };

  patchedPage.__careerShareInstalled = true;
  Page = patchedPage;
}

module.exports = {
  installPageShare,
  loadShareConfig,
  buildDefaultShareAppMessage,
  buildTimelineShare,
  applyShareConfig,
  isTimelineShareAllowed,
  stringifyQuery
};
