const dns = require('node:dns').promises;
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');

const DEFAULT_TIMEOUT_MS = 4000;
const MAX_REDIRECTS = 3;
const deniedV4 = new net.BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24],
  ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4]
]) deniedV4.addSubnet(address, prefix, 'ipv4');
const globalV6 = new net.BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');
const deniedV6 = new net.BlockList();
for (const [address, prefix] of [
  ['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20]
]) deniedV6.addSubnet(address, prefix, 'ipv6');

function isPublicAddress(address) {
  const family = net.isIP(address);
  if (family === 4) return !deniedV4.check(address, 'ipv4');
  if (family === 6) {
    // Deny IPv4-mapped, transition and documentation ranges as well as private IPv6.
    return globalV6.check(address, 'ipv6') && !deniedV6.check(address, 'ipv6');
  }
  return false;
}

function safeUrl(raw) {
  let url;
  try { url = new URL(raw); } catch (_) { return null; }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) return null;
  if (url.port && url.port !== (url.protocol === 'https:' ? '443' : '80')) return null;
  const host = url.hostname.replace(/\.$/, '').toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
      host.endsWith('.internal') || host.endsWith('.test') || host.endsWith('.invalid')) return null;
  return url;
}

async function defaultResolve(host) {
  return dns.lookup(host, { all: true, verbatim: true });
}

function defaultRequest({ url, address, family, method, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const req = transport.request(url, {
      method, agent: false, autoSelectFamily: false, signal: controller.signal, maxHeaderSize: 8192,
      headers: { 'User-Agent': 'ZhiyinJobLinkCheck/1.0', Accept: '*/*' },
      lookup(host, options, callback) {
        if (typeof options === 'function') { callback = options; options = {}; }
        if (host.replace(/\.$/, '').toLowerCase() !== url.hostname.replace(/\.$/, '').toLowerCase()) {
          return callback(new Error('unexpected_lookup_host'));
        }
        if (options && options.all) return callback(null, [{ address, family }]);
        callback(null, address, family);
      }
    }, response => {
      clearTimeout(timer);
      const result = { statusCode: response.statusCode,
        location: Array.isArray(response.headers.location) ? response.headers.location[0] : response.headers.location };
      // This job only needs headers. Never download a response body.
      response.destroy();
      resolve(result);
    });
    req.on('error', error => { clearTimeout(timer); reject(error); });
    req.end();
  });
}

function bounded(promise, timeoutMs) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('probe_timeout')), timeoutMs); })
  ]).finally(() => clearTimeout(timer));
}

function classifiedHttp(statusCode, redirects, method) {
  const evidence = { statusCode, redirects, method };
  if (statusCode >= 200 && statusCode < 300) return { ...evidence, outcome: 'reachable', reason: 'http_success' };
  if (statusCode === 404 || statusCode === 410) return { ...evidence, outcome: 'needs_review', reason: 'http_missing' };
  if (statusCode === 403 || statusCode === 429) return { ...evidence, outcome: 'inconclusive', reason: 'access_or_rate_limit' };
  return { ...evidence, outcome: 'inconclusive', reason: 'http_other' };
}

async function probeApplyUrl(raw, options = {}) {
  const resolveHost = options.resolveHost || defaultResolve;
  const requestHeaders = options.requestHeaders || defaultRequest;
  const timeoutMs = Math.min(Math.max(Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS, 100), 10000);
  const maxDurationMs = Math.min(Math.max(Number(options.maxDurationMs) || 10000, 1000), 20000);
  const deadline = Date.now() + maxDurationMs;
  const remaining = () => Math.min(timeoutMs, Math.max(0, deadline - Date.now()));
  let url = safeUrl(raw);
  if (!url) return { outcome: 'blocked', reason: 'unsafe_url', statusCode: null, redirects: 0 };
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    if (!remaining()) return { outcome: 'inconclusive', reason: 'timeout', statusCode: null, redirects };
    const host = url.hostname.replace(/^\[|\]$/g, '');
    let addresses;
    try {
      addresses = net.isIP(host) ? [{ address: host, family: net.isIP(host) }]
        : await bounded(Promise.resolve().then(() => resolveHost(host)), remaining());
    } catch (error) {
      return { outcome: 'inconclusive', reason: error.message === 'probe_timeout' ? 'timeout' : 'dns_error',
        statusCode: null, redirects };
    }
    if (!Array.isArray(addresses) || !addresses.length || addresses.length > 16 ||
        addresses.some(item => !item || !isPublicAddress(item.address) || item.family !== net.isIP(item.address))) {
      return { outcome: 'blocked', reason: 'unsafe_address', statusCode: null, redirects };
    }
    if (!remaining()) return { outcome: 'inconclusive', reason: 'timeout', statusCode: null, redirects };
    const selected = addresses[0];
    let response;
    let method = 'HEAD';
    try {
      response = await bounded(Promise.resolve().then(() => requestHeaders({ url,
        address: selected.address, family: selected.family, method, timeoutMs: remaining() })), remaining());
      if (response.statusCode === 405 || response.statusCode === 501) {
        method = 'GET';
        if (!remaining()) return { outcome: 'inconclusive', reason: 'timeout', statusCode: null, redirects };
        response = await bounded(Promise.resolve().then(() => requestHeaders({ url,
          address: selected.address, family: selected.family, method, timeoutMs: remaining() })), remaining());
      }
    } catch (error) {
      return { outcome: 'inconclusive', reason: error.name === 'AbortError' || error.message === 'probe_timeout'
        ? 'timeout' : 'network_error', statusCode: null, redirects };
    }
    const code = Number(response.statusCode);
    if (!Number.isInteger(code) || code < 100 || code > 599) {
      return { outcome: 'inconclusive', reason: 'invalid_response', statusCode: null, redirects };
    }
    if (code >= 300 && code < 400) {
      if (!response.location) return { outcome: 'inconclusive', reason: 'redirect_missing', statusCode: code, redirects };
      if (redirects === MAX_REDIRECTS) return { outcome: 'inconclusive', reason: 'redirect_limit', statusCode: code, redirects };
      let next;
      try { next = new URL(response.location, url); } catch (_) { next = null; }
      url = next && safeUrl(next.href);
      if (!url) return { outcome: 'blocked', reason: 'unsafe_redirect', statusCode: code, redirects: redirects + 1 };
      continue;
    }
    return classifiedHttp(code, redirects, method);
  }
  return { outcome: 'inconclusive', reason: 'redirect_limit', statusCode: null, redirects: MAX_REDIRECTS };
}

async function runLinkCheckBatch(options = {}) {
  const store = options.store || require('../utils/adminJobsStore');
  const limit = Math.min(Math.max(Number(options.limit) || 10, 1), 20);
  const deadline = Date.now() + 60000;
  const candidates = store.listLinkCheckCandidates(limit, { minAgeMs: options.minAgeMs, nowMs: options.nowMs });
  const summary = { selected: candidates.length, attempted: 0, deferred: 0, recorded: 0, stale: 0, reachable: 0,
    needs_review: 0, inconclusive: 0, blocked: 0 };
  for (const candidate of candidates) {
    if (Date.now() >= deadline) break;
    summary.attempted += 1;
    const checkedAt = new Date().toISOString();
    const observation = { ...await probeApplyUrl(candidate.url, options.probeOptions), checkedAt };
    const result = store.recordLinkCheck(candidate.id, candidate.url, observation);
    if (result) {
      summary.recorded += 1;
      summary[observation.outcome] += 1;
    } else summary.stale += 1;
  }
  summary.deferred = summary.selected - summary.attempted;
  return summary;
}

module.exports = { probeApplyUrl, runLinkCheckBatch, isPublicAddress, safeUrl, defaultRequest };
