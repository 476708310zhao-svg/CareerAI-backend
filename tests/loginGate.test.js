const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'miniprogram');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

const GATED_PAGES = [
  'pages/applications/applications',
  'pages/ai-career/ai-career',
  'pages/jobs/jobs',
  'package-agency/pages/agency-detail/agency-detail',
  'package-content/pages/experience-detail/experience-detail',
  'package-career/pages/salary/salary',
  'package-career/pages/resume/resume',
  'package-user/pages/settings/settings',
  'package-user/pages/vip/vip',
  'package-ai/pages/interview-dialog/interview-dialog'
];

test('login-required actions use the shared in-page login gate', () => {
  const behavior = read('behaviors/login-gate.js');
  assert.match(behavior, /ensureAuthenticated\(subtitle, onSuccess\)/);
  assert.match(behavior, /_pendingAuthenticatedAction/);
  assert.match(behavior, /authPromptVisible:\s*true/);

  GATED_PAGES.forEach(page => {
    const js = read(page + '.js');
    const wxml = read(page + '.wxml');
    assert.match(js, /login-gate\.js/, page + ' must load the shared login gate');
    assert.match(js, /ensureAuthenticated\(/, page + ' must gate its protected actions');
    assert.match(wxml, /<c-login-popup/, page + ' must render the login popup');
    assert.match(wxml, /show="\{\{authPromptVisible\}\}"/, page + ' must bind popup visibility');
    assert.match(wxml, /bindsuccess="onAuthPromptSuccess"/, page + ' must resume after login');
  });
});

test('progress and AI expert login cards no longer redirect to Profile', () => {
  const progressJs = read('pages/applications/applications.js');
  const progressWxml = read('pages/applications/applications.wxml');
  const careerJs = read('pages/ai-career/ai-career.js');
  const careerWxml = read('pages/ai-career/ai-career.wxml');

  assert.doesNotMatch(progressJs, /safeSwitchTab\(['"]\/pages\/profile\/profile/);
  assert.doesNotMatch(careerJs, /safeSwitchTab\(['"]\/pages\/profile\/profile/);
  assert.match(progressWxml, /bindtap="promptLogin">立即登录/);
  assert.match(careerWxml, /bindtap="promptLogin">立即登录/);
});

test('login popup uses the optimized Zhiyin brand logo', () => {
  const app = JSON.parse(read('app.json'));
  const popup = read('components/c-login-popup/c-login-popup.wxml');
  const logoPath = path.join(ROOT, 'images', 'zhiyin-logo.png');
  const logo = fs.readFileSync(logoPath);

  assert.equal(app.usingComponents['c-login-popup'], '/components/c-login-popup/c-login-popup');
  assert.match(popup, /src="\/images\/zhiyin-logo\.png"/);
  assert.ok(logo.length > 0 && logo.length < 100 * 1024, 'brand logo should be optimized below 100 KB');
  assert.equal(logo.readUInt32BE(16), 256);
  assert.equal(logo.readUInt32BE(20), 256);
});
