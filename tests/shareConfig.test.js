const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('home share no longer depends on the removed remote banner', () => {
  const home = read('miniprogram/pages/index/index.js');
  const localConfig = read('miniprogram/utils/shareConfig.js');
  const serverConfig = read('utils/shareConfig.js');

  assert.doesNotMatch(home, /banner_1782446347190_ovbr4\.png/);
  assert.match(home, /imageUrl:\s*['"]\/images\/banner1\.jpg['"]/);
  assert.match(localConfig, /imageUrl:\s*['"]\/images\/banner1\.jpg['"]/);
  assert.match(serverConfig, /DEFAULT_IMAGE\s*=\s*['"]\/images\/banner1\.jpg['"]/);
});

test('admin default image overrides a page hardcoded image', () => {
  const modulePath = require.resolve('../miniprogram/utils/share.js');
  const previousWx = global.wx;
  global.wx = {
    getStorageSync(key) {
      if (key !== 'share_config_cache_v2') return null;
      return {
        t: Date.now(),
        data: {
          default: { title: '后台全局标题', imageUrl: '/uploads/banners/admin-share.jpg' },
          routes: {}
        }
      };
    },
    setStorageSync() {}
  };
  delete require.cache[modulePath];

  try {
    const share = require(modulePath);
    const result = share.applyShareConfig(
      { route: 'pages/index/index', data: {} },
      { title: '页面旧标题', path: '/pages/index/index', imageUrl: 'https://example.com/dead.jpg' }
    );

    assert.equal(result.title, '页面旧标题');
    assert.equal(result.imageUrl, 'https://api.zhiyincareer.com/uploads/banners/admin-share.jpg');
  } finally {
    delete require.cache[modulePath];
    if (previousWx === undefined) delete global.wx;
    else global.wx = previousWx;
  }
});

test('share config endpoint and client cache avoid stale responses', () => {
  const client = read('miniprogram/utils/share.js');
  const route = read('routes/share.js');

  assert.match(client, /SHARE_CACHE_KEY\s*=\s*['"]share_config_cache_v2['"]/);
  assert.match(route, /Cache-Control['"],\s*['"]no-store, max-age=0['"]/);
});
