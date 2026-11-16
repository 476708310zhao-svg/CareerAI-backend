'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const WEB = path.join(__dirname, '..', 'public', 'web');
const PREFIX = '/api/v4/question-practice';

class FakeElement {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase(); this.children = []; this._text = '';
    this.className = ''; this.dataset = {}; this.events = {}; this.attributes = {};
    this.disabled = false; this.checked = false; this.value = '';
  }
  set textContent(value) { this.children = []; this._text = String(value); }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  set innerHTML(_value) { throw new Error('Unsafe HTML rendering in practice view'); }
  append(...children) { this.children.push(...children); }
  prepend(child) { this.children.unshift(child); }
  replaceChildren(...children) { this.children = [...children]; this._text = ''; }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  addEventListener(type, callback) { (this.events[type] ||= []).push(callback); }
  async click() { await Promise.all((this.events.click || []).map(callback => callback({ target: this }))); }
  async change() { await Promise.all((this.events.change || []).map(callback => callback({ target: this }))); }
  querySelector(selector) {
    if (selector === '[data-practice-entry]') return descendants(this).find(item => item.dataset.practiceEntry) || null;
    return null;
  }
}
function descendants(root) { return [root, ...root.children.flatMap(descendants)]; }
function control(root, label) {
  const found = descendants(root).find(item => item.tagName === 'BUTTON' && item.textContent === label);
  assert.ok(found, `Missing button: ${label}`);
  return found;
}
function fixture(request, initialIdentity = 'token-A') {
  const root = new FakeElement('section');
  let owner = initialIdentity, key = 0;
  const document = {
    createElement: tag => new FakeElement(tag),
    getElementById: id => id === 'practice-view' ? root : null,
    querySelector: () => null
  };
  const window = {};
  const crypto = { randomUUID: () => `stable-key-${++key}` };
  vm.runInNewContext(fs.readFileSync(path.join(WEB, 'practice.js'), 'utf8'), { document, window, crypto, console });
  const practice = window.createQuestionPractice({ request, getIdentity: () => owner, toast: () => {} });
  return { root, practice, owner: value => { owner = value; } };
}

const set = { id: 3, title: '原创基础题', questionCount: 1 };
const active = { id: 11, setId: 3, setTitle: set.title, status: 'active', total: 1, answered: 0, correctCount: 0 };
const item = { position: 1, revisionId: 22, answered: false, isCorrect: null, favorite: false };

test('practice HTML has an authenticated view and resource copy distinguishes existing mini-program tools', () => {
  const html = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(WEB, 'app.js'), 'utf8');
  const resources = fs.readFileSync(path.join(WEB, 'p0-workspace.js'), 'utf8');
  assert.match(html, /id="practice-view"/);
  assert.match(html, /src="\/web\/practice.js"/);
  assert.match(html, /data-view="practice"/);
  assert.match(app, /practice\.reset\(\)/);
  assert.match(app, /code:payload\.code/);
  assert.match(resources, /原有面试题库/);
  assert.match(resources, /另行审核、明确开放的免费题集/);
});

test('public question omits answer until server submission and false differs from unanswered null', async () => {
  const calls = [];
  const request = async (route, options = {}) => {
    calls.push({ route, options });
    if (route === `${PREFIX}/sets?cursor=0&limit=30`) return { sets: [set], nextCursor: null };
    if (route === `${PREFIX}/sessions?cursor=0&limit=30&status=active`) return { sessions: [], nextCursor: null };
    if (route === `${PREFIX}/sets/3/sessions`) return { session: active };
    if (route === `${PREFIX}/sessions/11`) return { session: { ...active }, items: [{ ...item }] };
    if (route === `${PREFIX}/sessions/11/items/1`) return { question: { position: 1, revisionId: 22, type: 'boolean', stem: '<img src=x onerror=alert(1)>' } };
    if (route === `${PREFIX}/sessions/11/items/1/submit`) return { submission: { position: 1, selectedAnswer: false, isCorrect: true, correctAnswer: false, explanation: '判断依据 <script>不执行</script>', submittedAt: '2026-10-21' } };
    throw new Error(`Unexpected route ${route}`);
  };
  const { root, practice } = fixture(request);
  await practice.open();
  await control(root, '开始练习').click();
  assert.match(root.textContent, /<img src=x/);
  assert.doesNotMatch(root.textContent, /判断依据|正确答案/);
  assert.equal(descendants(root).some(node => node.tagName === 'IMG'), false);
  const falseInput = descendants(root).find(node => node.tagName === 'INPUT' && node.value === 'false');
  assert.ok(falseInput); falseInput.checked = true; await falseInput.change();
  await control(root, '正式提交答案').click();
  const submitted = calls.find(call => call.route.endsWith('/submit'));
  assert.equal(JSON.parse(submitted.options.body).answer, false);
  assert.match(root.textContent, /正确答案：错误/);
  assert.match(root.textContent, /判断依据 <script>不执行<\/script>/);
  assert.equal(descendants(root).some(node => node.tagName === 'SCRIPT'), false);
});

test('lost submit response retries the same request id and original answer', async () => {
  const submissions = [];
  const request = async (route, options = {}) => {
    if (route.endsWith('/sets?cursor=0&limit=30')) return { sets: [set] };
    if (route.endsWith('/sessions?cursor=0&limit=30&status=active')) return { sessions: [] };
    if (route.endsWith('/sets/3/sessions')) return { session: active };
    if (route.endsWith('/sessions/11')) return { session: { ...active }, items: [{ ...item }] };
    if (route.endsWith('/sessions/11/items/1')) return { question: { position: 1, revisionId: 22, type: 'single', stem: '选择 A', options: [{ id: 'A', text: '甲' }, { id: 'B', text: '乙' }] } };
    if (route.endsWith('/submit')) {
      submissions.push(JSON.parse(options.body));
      if (submissions.length === 1) throw new Error('连接中断');
      return { submission: { position: 1, selectedAnswer: ['A'], isCorrect: true, correctAnswer: ['A'], explanation: '甲是正确答案' } };
    }
    throw new Error(route);
  };
  const { root, practice } = fixture(request);
  await practice.open(); await control(root, '开始练习').click();
  const input = descendants(root).find(node => node.tagName === 'INPUT' && node.value === 'A');
  input.checked = true; await input.change();
  await control(root, '正式提交答案').click();
  assert.match(root.textContent, /连接中断/);
  await control(root, '重试同一提交').click();
  assert.deepEqual(submissions[0], submissions[1]);
  assert.match(root.textContent, /甲是正确答案/);
});

test('lost start response retries one client key and keeps the public catalog available', async () => {
  const starts = [];
  const request = async (route, options = {}) => {
    if (route.endsWith('/sets?cursor=0&limit=30')) return { sets: [set] };
    if (route.endsWith('/sessions?cursor=0&limit=30&status=active')) return { sessions: [] };
    if (route.endsWith('/sets/3/sessions')) {
      starts.push(JSON.parse(options.body));
      if (starts.length === 1) throw new Error('网络中断');
      return { session: active };
    }
    if (route.endsWith('/sessions/11')) return { session: { ...active }, items: [{ ...item }] };
    if (route.endsWith('/sessions/11/items/1')) return { question: { position: 1, revisionId: 22, type: 'boolean', stem: '继续练习' } };
    throw new Error(route);
  };
  const { root, practice } = fixture(request);
  await practice.open();
  await control(root, '开始练习').click();
  assert.match(root.textContent, /网络中断/);
  await control(root, '重试开始').click();
  assert.deepEqual(starts[0], starts[1]);
  assert.match(root.textContent, /继续练习/);
});

test('409 after a lost response reads the server result and reloaded session resumes from server', async () => {
  let answered = false, resultReads = 0;
  const request = async route => {
    if (route.endsWith('/sets?cursor=0&limit=30')) return { sets: [set] };
    if (route.endsWith('/sessions?cursor=0&limit=30&status=active')) return { sessions: [{ ...active, answered: answered ? 1 : 0 }] };
    if (route.endsWith('/sessions/11')) return { session: { ...active, answered: answered ? 1 : 0 }, items: [{ ...item, answered }] };
    if (route.endsWith('/sessions/11/items/1')) return { question: { position: 1, revisionId: 22, type: 'boolean', stem: '已作答题' } };
    if (route.endsWith('/submit')) { answered = true; throw Object.assign(new Error('已提交'), { status: 409 }); }
    if (route.endsWith('/result')) { resultReads++; return { submission: { position: 1, selectedAnswer: null, isCorrect: false, correctAnswer: true, explanation: '服务器保存的结果' } }; }
    throw new Error(route);
  };
  const { root, practice } = fixture(request);
  await practice.open(); await control(root, '继续练习').click();
  await control(root, '未答并继续').click();
  assert.equal(resultReads, 1);
  assert.match(root.textContent, /你的作答：未答/);
  practice.reset(); await practice.open(); await control(root, '继续练习').click();
  await control(root, '查看结果').click();
  assert.equal(resultReads, 2);
  assert.match(root.textContent, /服务器保存的结果/);
});

test('switching identity discards an older catalog response and leaves no private practice DOM', async () => {
  let release;
  const old = new Promise(resolve => { release = resolve; });
  let first = true;
  const request = async route => {
    if (route.endsWith('/sets?cursor=0&limit=30')) {
      if (first) { first = false; return old; }
      return { sets: [] };
    }
    if (route.endsWith('/sessions?cursor=0&limit=30&status=active')) return { sessions: [] };
    throw new Error(route);
  };
  const { root, practice, owner } = fixture(request);
  const stale = practice.open();
  owner('token-B'); practice.reset();
  await practice.open();
  release({ sets: [{ id: 9, title: '旧账号私有题集', questionCount: 1 }] });
  await stale;
  assert.doesNotMatch(root.textContent, /旧账号私有题集/);
  assert.match(root.textContent, /暂无已开放且已授权的公开题集/);
});

test('a 409 from ending the session elsewhere hides the question and opens history guidance', async () => {
  const request = async route => {
    if (route.endsWith('/sets?cursor=0&limit=30')) return { sets: [set] };
    if (route.endsWith('/sessions?cursor=0&limit=30&status=active')) return { sessions: [active] };
    if (route.endsWith('/sessions/11')) return { session: { ...active }, items: [{ ...item }] };
    if (route.endsWith('/sessions/11/items/1')) return { question: { position: 1, revisionId: 22, type: 'boolean', stem: '仅当前会话可见的题干' } };
    if (route.endsWith('/submit')) throw Object.assign(new Error('会话已结束'), { status: 409, code: 'SESSION_FINISHED' });
    if (route.endsWith('/result')) throw Object.assign(new Error('尚未提交'), { status: 409, code: 'QUESTION_NOT_SUBMITTED' });
    throw new Error(route);
  };
  const { root, practice } = fixture(request);
  await practice.open(); await control(root, '继续练习').click();
  assert.match(root.textContent, /仅当前会话可见的题干/);
  await control(root, '未答并继续').click();
  assert.match(root.textContent, /这次练习已在其他页面结束/);
  assert.doesNotMatch(root.textContent, /仅当前会话可见的题干/);
  control(root, '查看练习记录');
});

test('revoked favorite deletion clears cached question and answer before refreshing safe progress', async () => {
  let detailReads = 0, releaseDetail, detailRequested;
  const refreshedDetail = new Promise(resolve => { releaseDetail = resolve; });
  const detailStarted = new Promise(resolve => { detailRequested = resolve; });
  const submittedItem = { ...item, answered: true, isCorrect: true, favorite: true };
  const request = async (route, options = {}) => {
    if (route.endsWith('/sets?cursor=0&limit=30')) return { sets: [set] };
    if (route.endsWith('/sessions?cursor=0&limit=30&status=active')) return { sessions: [{ ...active, answered: 1 }] };
    if (route.endsWith('/sessions/11')) {
      detailReads++;
      if (detailReads === 1) return { session: { ...active, answered: 1 }, items: [submittedItem] };
      detailRequested(); return refreshedDetail;
    }
    if (route.endsWith('/sessions/11/items/1')) return { question: { position: 1, revisionId: 22, type: 'boolean', stem: '撤权后必须隐藏的题干' } };
    if (route.endsWith('/result')) return { submission: { position: 1, selectedAnswer: false, isCorrect: true, correctAnswer: false, explanation: '撤权后必须隐藏的解析' } };
    if (route.endsWith('/favorite') && options.method === 'DELETE') return { favorite: false, available: false };
    throw new Error(route);
  };
  const { root, practice } = fixture(request);
  await practice.open(); await control(root, '继续练习').click(); await control(root, '查看结果').click();
  assert.match(root.textContent, /撤权后必须隐藏的题干/);
  assert.match(root.textContent, /撤权后必须隐藏的解析/);
  const deleting = control(root, '取消收藏').click();
  await detailStarted;
  assert.match(root.textContent, /当前题目不可用/);
  assert.doesNotMatch(root.textContent, /撤权后必须隐藏的题干|撤权后必须隐藏的解析/);
  releaseDetail({ session: { ...active, answered: 1 }, items: [{ ...submittedItem, favorite: false }] });
  await deleting;
  assert.equal(detailReads, 2);
  assert.match(root.textContent, /已答 1 \/ 1 题/);
  assert.doesNotMatch(root.textContent, /撤权后必须隐藏的题干|撤权后必须隐藏的解析/);
});

test('an older favorite response cannot restore cached content after authorization is revoked', async () => {
  let releaseOlder, favoriteCalls = 0;
  const olderResponse = new Promise(resolve => { releaseOlder = resolve; });
  const answeredItem = { ...item, answered: true, isCorrect: true, favorite: true };
  const request = async (route, options = {}) => {
    if (route.endsWith('/sets?cursor=0&limit=30')) return { sets: [set] };
    if (route.endsWith('/sessions?cursor=0&limit=30&status=active')) return { sessions: [{ ...active, answered: 1 }] };
    if (route.endsWith('/sessions/11')) return { session: { ...active, answered: 1 }, items: [{ ...answeredItem }] };
    if (route.endsWith('/sessions/11/items/1')) return { question: { position: 1, revisionId: 22, type: 'boolean', stem: '旧题干' } };
    if (route.endsWith('/result')) return { submission: { position: 1, selectedAnswer: true, isCorrect: true, correctAnswer: true, explanation: '旧解析' } };
    if (route.endsWith('/favorite') && options.method === 'DELETE') {
      favoriteCalls++;
      return favoriteCalls === 1 ? olderResponse : { favorite: false, available: false };
    }
    throw new Error(route);
  };
  const { root, practice } = fixture(request);
  await practice.open(); await control(root, '继续练习').click(); await control(root, '查看结果').click();
  const favoriteButton = control(root, '取消收藏');
  const olderClick = favoriteButton.click();
  await favoriteButton.click();
  assert.match(root.textContent, /当前题目不可用/);
  releaseOlder({ favorite: false, available: true });
  await olderClick;
  assert.doesNotMatch(root.textContent, /旧题干|旧解析/);
  assert.match(root.textContent, /当前题目不可用/);
});
