const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..', 'miniprogram');

for (const relative of ['utils/ai-resume-versions.js', 'package-ai/utils/resume-versions.js']) {
  test(`${relative} rejects unowned legacy resume when the API fails and preserves owned local resume`, async () => {
    const storage = new Map([
      ['token', 'token-B'],
      ['onlineResume', { basicInfo: { name: 'A Private' }, summary: 'A confidential resume with extensive skills' }],
      ['onlineResume:A', { basicInfo: { name: 'A Owned' }, summary: 'A owned resume with extensive skills' }]
    ]);
    let owner = 'B';
    const ownerStorage = { get: (key, suffix, fallback) => storage.get(`${key}:${owner}`) || fallback };
    const api = { getResumes: () => Promise.reject(new Error('offline')), getResume: () => Promise.reject(new Error('offline')) };
    const filename = path.join(root, relative);
    const context = {
      module: { exports: {} },
      wx: { getStorageSync: key => storage.get(key) },
      require: name => name.endsWith('api-resumes.js') ? api : name.endsWith('owner-storage.js') ? ownerStorage : {}
    };
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename });
    const versions = context.module.exports;
    const b = await versions.fetchResumeVersions();
    assert.equal(b.hasResume, false);
    assert.notEqual(b.currentResume.basicInfo && b.currentResume.basicInfo.name, 'A Private');

    storage.set('onlineResume:B', { basicInfo: { name: 'B Owned' }, summary: 'B owned resume with extensive skills' });
    const bOwned = await versions.fetchResumeVersions();
    assert.equal(bOwned.currentResume.basicInfo.name, 'B Owned');
    assert.equal(bOwned.hasResume, true);
    owner = 'A';
    const a = await versions.fetchResumeVersions();
    assert.equal(a.currentResume.basicInfo.name, 'A Owned');
    assert.equal(a.hasResume, true);
  });
}

test('all active local resume consumers avoid the unowned onlineResume key', () => {
  const paths = [
    'pages/ai-career/ai-career.js',
    'package-ai/pages/ai-assistant/ai-assistant.js',
    'package-ai/pages/jd-match/jd-match.js',
    'package-content/pages/question-detail/question-detail.js',
    'package-user/pages/job-detail/job-detail.js',
    'package-user/pages/profile-edit/profile-edit.js'
  ];
  for (const relative of paths) {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    assert.doesNotMatch(source, /getStorageSync\(['"]onlineResume['"]\)/, relative);
    assert.doesNotMatch(source, /readStorage\(['"]onlineResume['"]/, relative);
  }
});

test('question AI training cache is isolated across owners and ignores legacy global entries', () => {
  const storage = new Map([
    ['questionAiTrainingResults', { q1: { result: 'A legacy answer' } }],
    ['questionAiTrainingResults:A', { q1: { result: 'A owned answer' } }]
  ]);
  let owner = 'B';
  let page;
  const filename = path.join(root, 'package-content/pages/question-detail/question-detail.js');
  const ownerStorage = {
    get: (key, suffix, fallback) => storage.get(`${key}:${owner}`) || fallback,
    set: (key, suffix, value) => storage.set(`${key}:${owner}`, value)
  };
  const context = {
    module: { exports: {} }, wx: { getStorageSync: key => storage.get(key) },
    require: name => name.endsWith('owner-storage.js') ? ownerStorage : name.endsWith('question-bank.js') ? { QUESTIONS: [] } : {},
    Page: value => { page = value; }
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  assert.equal(page.readCachedAiTraining('q1').result, '');
  owner = 'A';
  assert.equal(page.readCachedAiTraining('q1').result, 'A owned answer');
  owner = 'B';
  storage.set('questionAiTrainingResults:B', { q1: { result: 'B own answer' } });
  assert.equal(page.readCachedAiTraining('q1').result, 'B own answer');
  const source = fs.readFileSync(filename, 'utf8');
  assert.match(source, /ownerStorage\.set\(AI_CACHE_KEY/);
  assert.doesNotMatch(source, /getStorageSync\(AI_CACHE_KEY\)|setStorageSync\(AI_CACHE_KEY/);
});

test('late question AI answer cannot be saved into the next account cache', async () => {
  const storage = new Map();
  let owner = 'A';
  let resolveAi;
  const ai = new Promise(resolve => { resolveAi = resolve; });
  let page;
  const filename = path.join(root, 'package-content/pages/question-detail/question-detail.js');
  const ownerStorage = {
    capture: () => owner,
    get: (key, suffix, fallback) => storage.get(`${key}:${owner}`) || fallback,
    set: (key, suffix, value) => storage.set(`${key}:${owner}`, value)
  };
  const context = {
    module: { exports: {} }, wx: { showToast() {} },
    require: name => name.endsWith('owner-storage.js') ? ownerStorage
      : name.endsWith('question-bank.js') ? { QUESTIONS: [] }
        : name.endsWith('interview-notebook.js') ? { getItem: () => null, getDailyPractice: () => [] }
          : name.endsWith('api.js') ? { sendChatToDeepSeek: () => ai } : {},
    Page: value => { page = value; }
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  page.data = Object.assign({}, page.data, { q: { id: 'q1', title: 'Question?' }, tips: [] });
  page.setData = patch => Object.assign(page.data, patch);
  page.generateAiTraining({ currentTarget: { dataset: { mode: 'answer' } } });
  owner = 'B';
  resolveAi({ choices: [{ message: { content: 'A private answer' } }] });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(storage.has('questionAiTrainingResults:B'), false);
  assert.equal(page.data.aiTraining.result, '');
  assert.equal(page.data.aiTraining.loading, false);
});

test('pending contextual AI route payload is owner-scoped at both ends', () => {
  const navigation = fs.readFileSync(path.join(root, 'utils/navigation.js'), 'utf8');
  const page = fs.readFileSync(path.join(root, 'pages/ai-career/ai-career.js'), 'utf8');
  assert.match(navigation, /ownerStorage\.set\(AI_TAB_CONTEXT_KEY/);
  assert.match(page, /ownerStorage\.get\(PENDING_TAB_CONTEXT_KEY/);
  assert.match(page, /ownerStorage\.remove\(PENDING_TAB_CONTEXT_KEY/);
});
