const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dotenv = require('dotenv');
const { rotateKey } = require('../scripts/rotate-jsearch-key');

const oldKey = 'old_rapid_key_abcdefghijklmnopqrstuvwxyz';
const nextKey = 'new_rapid_key_abcdefghijklmnopqrstuvwxyz';

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsearch-key-test-'));
  const envPath = path.join(dir, '.env');
  fs.writeFileSync(envPath, `NODE_ENV=production\nRAPID_API_KEY=${oldKey}\nPORT=4400\n`);
  t.after(() => { fs.unlinkSync(envPath); fs.rmdirSync(dir); });
  return envPath;
}

test('validated JSearch key replaces only one shared env entry', async t => {
  const envPath = fixture(t);
  const result = await rotateKey({ envPath, nextKey, dotenv, axios: { get: async (url, options) => {
    assert.equal(url, 'https://jsearch.p.rapidapi.com/search-v2');
    assert.equal(options.headers['X-RapidAPI-Key'], nextKey);
    return { status: 200, data: { data: { jobs: [{ job_id: 'real' }] } } };
  } } });
  assert.deepEqual(result, { changed: true, jobCount: 1 });
  assert.deepEqual(dotenv.parse(fs.readFileSync(envPath)),
    { NODE_ENV: 'production', RAPID_API_KEY: nextKey, PORT: '4400' });
});

test('failed upstream validation leaves the shared env untouched', async t => {
  const envPath = fixture(t);
  const before = fs.readFileSync(envPath, 'utf8');
  await assert.rejects(rotateKey({ envPath, nextKey, dotenv,
    axios: { get: async () => ({ status: 200, data: { data: [] } }) } }),
  /did not return valid jobs/);
  assert.equal(fs.readFileSync(envPath, 'utf8'), before);
});
