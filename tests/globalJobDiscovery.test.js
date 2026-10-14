const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('job discovery defaults to global scope and labels regional work authorization explicitly', () => {
  const page = read('miniprogram/pages/jobs/jobs.js');
  const view = read('miniprogram/pages/jobs/jobs.wxml');
  const api = read('miniprogram/utils/api-jobs.js');
  const route = read('routes/jobs.js');

  assert.match(page, /filterCountry:\s*'global'/);
  assert.match(page, /filterCountry:\s*this\.data\.filterCountry === val \? 'global' : val/);
  assert.match(api, /country:\s*data\.country\s*\|\|\s*'global'/);
  assert.match(route, /country = 'global'/);
  assert.match(route, /country !== 'global'/);

  assert.match(view, />全球<\/view>/);
  assert.match(view, />工作资格（因地区而异）<\/text>/);
  assert.match(view, />国际生友好<\/view>/);
  assert.match(view, />美国 H-1B<\/view>/);
  assert.doesNotMatch(view, />STEM OPT<\/view>|>OPT 友好<\/view>/);
});
