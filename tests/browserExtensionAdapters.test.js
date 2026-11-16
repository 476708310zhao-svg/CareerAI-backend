'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const extensionRoot = path.join(__dirname, '..', 'extensions', 'career-form-assistant');
const metrics = require(path.join(extensionRoot, 'compatibilityMetrics.js'));

function runSyntheticPage(host, fixtureName) {
  const fixture = require(path.join(__dirname, 'fixtures', 'extensions', fixtureName));
  const nodes = fixture.map(attributes => ({
    ...attributes,
    disabled: false,
    readOnly: false,
    isConnected: true,
    labels: [{ innerText: attributes.label }],
    getAttribute(name) { return attributes[name] || ''; },
    matches(selector) {
      if (selector.startsWith('input') && attributes.tag !== 'input') return false;
      if (selector === 'textarea') return attributes.tag === 'textarea';
      if (selector === 'select') return attributes.tag === 'select';
      if (selector.includes('type="email"')) return attributes.type === 'email';
      if (selector.includes('type="tel"')) return attributes.type === 'tel';
      if (selector.includes('email')) return /email/i.test(`${attributes.name} ${attributes.id} ${attributes['data-qa'] || ''}`);
      if (selector.includes('phone')) return /phone/i.test(`${attributes.name} ${attributes.id} ${attributes['data-qa'] || ''}`);
      if (selector.includes('school') || selector.includes('university')) return /school|university/i.test(`${attributes.name} ${attributes.id} ${attributes['data-qa'] || ''}`);
      if (selector.includes('skill')) return /skill/i.test(`${attributes.name} ${attributes.id} ${attributes['data-qa'] || ''}`);
      if (selector.includes('graduat')) return /graduat/i.test(`${attributes.name} ${attributes.id} ${attributes['data-qa'] || ''}`);
      if (selector.includes('degree')) return /degree/i.test(`${attributes.name} ${attributes.id} ${attributes['data-qa'] || ''}`);
      if (selector.includes('major') || selector.includes('field_of_study')) return /major|field_of_study/i.test(`${attributes.name} ${attributes.id}`);
      if (selector.includes('city')) return /city/i.test(`${attributes.name} ${attributes.id}`);
      if (selector.startsWith('input')) return attributes.tag === 'input';
      return false;
    }
  }));
  let listener;
  const context = {
    location: { hostname: host, protocol: 'https:' },
    document: { querySelectorAll: () => nodes },
    chrome: { runtime: { id: 'a'.repeat(32), onMessage: { addListener(value) { listener = value; } } } },
    Number, URL, Set, Map, String, Array, Object, Event: class Event {},
    HTMLInputElement: class HTMLInputElement {}, HTMLTextAreaElement: class HTMLTextAreaElement {},
    HTMLSelectElement: class HTMLSelectElement {}
  };
  vm.runInNewContext(fs.readFileSync(path.join(extensionRoot, 'content.js'), 'utf8'), context);
  return { listener, nodes, extensionId: context.chrome.runtime.id };
}

test('Greenhouse, Lever, and Ashby synthetic forms expose compatible fields without password/file/hidden controls', () => {
  for (const [host, fixtureName, adapter] of [
    ['boards.greenhouse.io', 'greenhouse-form.cjs', 'greenhouse'],
    ['jobs.lever.co', 'lever-form.cjs', 'lever'],
    ['jobs.ashbyhq.com', 'ashby-form.cjs', 'ashby']
  ]) {
    const page = runSyntheticPage(host, fixtureName);
    let response;
    page.listener({ type: 'zhiyin:inspect' }, {
      id: page.extensionId, tab: { id: 7, url: `https://${host}/application` }, url: `https://${host}/application`
    }, value => { response = value; });
    assert.equal(response.ok, true);
    assert.equal(response.adapter, adapter);
    assert.equal(response.compatibility, 'candidate_fields_found');
    assert.ok(response.fields.some(field => field.key === 'email'));
    assert.ok(response.fields.some(field => field.key === 'phone'));
    assert.ok(response.fields.some(field => field.key === 'school'));
    assert.equal(response.fields.some(field => ['password', 'file', 'csrf'].includes(field.key)), false);
    assert.equal(JSON.stringify(response).includes('application'), false);
  }
});

test('compatibility metrics aggregate only allowlisted local counts and alert after a seven-day sample threshold', () => {
  const now = new Date('2026-11-02T10:00:00.000Z');
  let log = [];
  log = metrics.update(log, 'jobs.ashbyhq.com', 'unsupported', 'no_compatible_fields', now);
  const early = metrics.summarize(log, now)[0];
  assert.equal(early.samples, 1);
  assert.equal(early.alert, false);
  for (let i = 0; i < 4; i++) log = metrics.update(log, 'jobs.ashbyhq.com', 'unsupported', 'no_compatible_fields', now);
  const alert = metrics.summarize(log, now)[0];
  assert.equal(alert.samples, 5);
  assert.equal(alert.failureRate, 1);
  assert.equal(alert.alert, true);
  const serialized = JSON.stringify(log);
  for (const forbidden of ['applicationId', 'url', 'label', 'value', 'DOM', 'userId']) assert.equal(serialized.includes(forbidden), false);
  const invalid = metrics.summarize(log, new Date('2026-11-10T10:00:00.000Z'));
  assert.equal(invalid.length, 0);
  assert.deepEqual(metrics.update(log, 'evil.example', 'unsupported', 'no_compatible_fields', now), log);
});

test('content script rejects spoofed sender origins and changed host before filling', () => {
  const page = runSyntheticPage('boards.greenhouse.io', 'greenhouse-form.cjs');
  let response;
  const sender = { id: page.extensionId, tab: { id: 7, url: 'https://evil.example/form' }, url: 'https://evil.example/form' };
  assert.equal(page.listener({ type: 'zhiyin:inspect' }, sender, value => { response = value; }), false);
  assert.equal(response, undefined);
  page.listener({ type: 'zhiyin:inspect' }, {
    id: page.extensionId, tab: { id: 7, url: 'https://boards.greenhouse.io/form' }, url: 'https://boards.greenhouse.io/form'
  }, value => { response = value; });
  assert.equal(response.ok, true);
  let fillResult;
  page.listener({ type: 'zhiyin:fill', host: 'jobs.lever.co', items: [] }, {
    id: page.extensionId, tab: { id: 7, url: 'https://boards.greenhouse.io/form' }, url: 'https://boards.greenhouse.io/form'
  }, value => { fillResult = value; });
  assert.equal(fillResult.ok, false);
  assert.equal(fillResult.error, '当前招聘网站与预览不一致，请重新识别。');
});

test('popup only offers a return link to the application confirmation workflow', () => {
  const popup = fs.readFileSync(path.join(extensionRoot, 'popup.js'), 'utf8');
  const html = fs.readFileSync(path.join(extensionRoot, 'popup.html'), 'utf8');
  assert.match(popup, /new URL\('\/applications', webOrigin\)/);
  assert.match(popup, /searchParams\.set\('open', String\(applicationId\)\)/);
  assert.doesNotMatch(popup, /submission-confirmation|submitApplication/i);
  assert.match(html, /插件不会判断你是否已提交/);
  assert.match(html, /再次确认“我已提交”/);
  assert.match(html, /本机兼容统计（只存匿名计数）/);
  assert.match(popup, /metrics\.update\(result\.compatibilityLog, host, state, reason\)/);
  assert.match(popup, /metrics\.summarize\(items\)/);
  assert.doesNotMatch(popup, /compatibilityLog[^\n]*(?:url|label|fields|value|applicationId)/i);
});
