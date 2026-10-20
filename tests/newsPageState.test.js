const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');

function createPage(getNews) {
  let definition;
  const storage = new Map();
  const wx = {
    getStorageSync: key => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, value),
    stopPullDownRefresh() {}
  };
  const filename = path.join(root, 'miniprogram/package-content/pages/news/news.js');
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    Page: value => { definition = value; },
    wx,
    setTimeout: callback => callback(),
    require: name => {
      if (name === '../../../utils/api-news.js') return { getNews };
      if (name === '../../../utils/assets.js') return { normalizeNewsImageUrl: value => value || '' };
      if (name === '../../../utils/demo-data.js') return { enabled: () => false };
      throw new Error(`Unexpected dependency: ${name}`);
    }
  }, { filename });
  return Object.assign({}, definition, {
    data: Object.assign({}, definition.data),
    setData(patch) { Object.assign(this.data, patch); }
  });
}

test('news page separates initial loading, failure and successful retry', async () => {
  const requests = [];
  const page = createPage(() => new Promise((resolve, reject) => requests.push({ resolve, reject })));
  page.onLoad();
  assert.equal(page.data.loading, true);
  assert.equal(page.data.loadError, false);
  assert.equal(page.data.displayList.length, 0);

  requests[0].reject(new Error('network failed'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.data.loading, false);
  assert.equal(page.data.loadError, true);

  page.onPullDownRefresh();
  assert.equal(page.data.refreshing, true);
  assert.equal(page.data.loadError, false);
  requests[1].resolve({ articles: [{ id: 'article-1', title: '真实快讯', type: 'news' }] });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.data.refreshing, false);
  assert.equal(page.data.loadError, false);
  assert.equal(page.data.displayList.length, 1);
  assert.equal(page.data.displayList[0].title, '真实快讯');
});

test('news template shows empty state only after loading finishes', () => {
  const wxml = fs.readFileSync(path.join(root, 'miniprogram/package-content/pages/news/news.wxml'), 'utf8');
  assert.match(wxml, /displayList\.length === 0 && !loading && !refreshing/);
  assert.match(wxml, /loadError \? '快讯暂时无法加载'/);
});
