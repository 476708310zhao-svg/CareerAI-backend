'use strict';

function isAllowedBrowserExtensionOrigin(origin, configuredOrigin) {
  const configured = String(configuredOrigin || '').trim().toLowerCase();
  const candidate = String(origin || '').trim().toLowerCase();
  return /^chrome-extension:\/\/[a-p]{32}$/.test(configured) && candidate === configured;
}

module.exports = { isAllowedBrowserExtensionOrigin };
