'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const MINI = path.join(__dirname, '..', 'miniprogram');
const homeFile = path.join(MINI, 'package-content/pages/practice-home/practice-home.js');
const sessionFile = path.join(MINI, 'package-content/pages/practice-session/practice-session.js');
const apiFile = path.join(MINI, 'package-content/utils/api-question-bank.js');
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; };

function page(file, api, owner) {
  let instance, definition;
  const makeInstance = source => ({ ...source, data: { ...source.data },
    setData(changes) { Object.assign(this.data, changes); } });
  const wx = { showModal: args => args.success({ confirm: true }), stopPullDownRefresh() {} };
  const navigation = { safeNavigateTo: () => true, safeSwitchTab: () => true };
  const context = { wx, Page: source => { definition = source; instance = makeInstance(source); },
    require: name => name.includes('api-question-bank') ? api : navigation,
  console, setTimeout, clearTimeout };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  const holder = { value: owner };
  api.capture ||= () => ({ token: holder.value, revision: holder.value });
  api.current ||= snapshot => !!snapshot && snapshot.token === holder.value && snapshot.revision === holder.value;
  api.result ||= async () => { const error = new Error('尚未提交'); error.statusCode = 409; throw error; };
  return { page: instance, newPage: () => makeInstance(definition), owner: value => { holder.value = value; }, navigation };
}

test('mini API uses the private owner-scoped practice routes without a cache or local answer fallback', async () => {
  const calls = [];
  const client = {
    request: opts => { calls.push(opts); return Promise.resolve({ code: 0, data: { sets: [] } }); },
    _write: opts => { calls.push(opts); return Promise.resolve({ code: 0, data: { submission: { isCorrect: false } } }); }
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(apiFile, 'utf8'), { module,
    require: name => name.endsWith('/api-client.js') ? client : { capture: () => ({ token: 'A' }), isCurrent: () => true },
    wx: {}, console }, { filename: apiFile });
  const api = module.exports;
  await api.sets({ cursor: 0, limit: 30 });
  await api.submit(4, 2, false, 'request-stable');
  await api.report(4);
  assert.equal(calls[0].path, '/api/v4/question-practice/sets');
  assert.equal(calls[0].noCache, true);
  assert.equal(calls[1].path, '/api/v4/question-practice/sessions/4/items/2/submit');
  assert.equal(calls[1].retryOnNetworkError, true);
  assert.equal(calls[1].body.answer, false);
  assert.equal(calls[1].body.requestId, 'request-stable');
  assert.equal(calls[2].path, '/api/v4/question-practice/sessions/4/report');
  assert.equal(calls[2].noCache, true);
  assert.doesNotMatch(fs.readFileSync(apiFile, 'utf8'), /oa-practice-bank|assessment-preview|correctOptionIds/);
});

test('finished session displays its report and discards a late report after account switch', async () => {
  const oldReport = deferred();
  let identity = 'A';
  const api = {
    session: async () => ({ session: { id:3,setTitle:identity,status:'finished',total:1,answered:1,correctCount:1 },
      items:[{position:1,answered:true,favorite:false}] }),
    question: async () => ({ question:{position:1,type:'boolean',stem:'已答题干'} }),
    result: async () => ({ submission:{position:1,selectedAnswer:true,correctAnswer:true,isCorrect:true,explanation:'解析'} }),
    report: () => identity === 'A' ? oldReport.promise : Promise.resolve({ report:{accuracyPercent:50,byType:[],focusType:'判断'} })
  };
  const fixture = page(sessionFile,api,'A'); const practice = fixture.page;
  practice.onLoad({sessionId:'3'});
  const first = practice.onShow();
  for (let i=0; i<5; i++) await Promise.resolve();
  identity = 'B'; fixture.owner('B');
  await practice.onShow();
  assert.equal(practice.data.report.accuracyPercent,50);
  oldReport.resolve({report:{accuracyPercent:100,byType:[],focusType:null}});
  await first;
  assert.equal(practice.data.report.accuracyPercent,50);
  practice.onHide();
  assert.equal(practice.data.report,null);
  const view = fs.readFileSync(path.join(MINI,'package-content/pages/practice-session/practice-session.wxml'),'utf8');
  assert.match(view,/练习分析报告/);
  assert.match(view,/正确答案：/);
});

test('home shows only service-returned free sets; old account responses cannot refill the new account', async () => {
  const first = deferred();
  let activeCalls = 0;
  const api = {
    sets: () => activeCalls++ === 0 ? first.promise : Promise.resolve({ sets: [{ id: 2, title: '新账号题集', questionCount: 2 }], total: 1, nextCursor: null }),
    sessions: () => Promise.resolve({ sessions: [], total: 0, nextCursor: null })
  };
  const fixture = page(homeFile, api, 'A'); const home = fixture.page;
  home.onLoad(); const old = home.onShow();
  fixture.owner('B'); const fresh = home.onShow();
  await fresh;
  assert.equal(home.data.sets[0].title, '新账号题集');
  first.resolve({ sets: [{ id: 1, title: '旧账号题集', questionCount: 1 }], total: 1 });
  await old;
  assert.equal(home.data.loggedIn, true);
  assert.equal(home.data.sets[0].title, '新账号题集');
  assert.equal(home.data.active.length, 0);
});

test('revocation during mistakes pagination clears all previously displayed private rows', async () => {
  const api = {
    sets: async () => ({ sets: [], total: 0, nextCursor: null }),
    sessions: async () => ({ sessions: [], total: 0, nextCursor: null }),
    mistakes: async ({ cursor }) => {
      if (!cursor) return { mistakes: [{ sessionId: 4, position: 1, available: true,
        question: { stem: '已显示的私有题干' } }], total: 2, nextCursor: 1 };
      const error = new Error('授权已撤销'); error.statusCode = 403; throw error;
    }
  };
  const fixture = page(homeFile, api, 'A'); const home = fixture.page;
  home.onLoad(); await home.onShow();
  await home.changeView({ currentTarget: { dataset: { view: 'mistakes' } } });
  assert.equal(home.data.mistakes[0].question.stem, '已显示的私有题干');
  await home.loadMore();
  assert.equal(home.data.mistakes.length, 0);
  assert.equal(home.data.error, '授权已撤销');
});

test('a successful next mistakes page never retains a possibly revoked previous page', async () => {
  let revoked = false;
  const api = {
    sets: async () => ({ sets: [], total: 0, nextCursor: null }),
    sessions: async () => ({ sessions: [], total: 0, nextCursor: null }),
    mistakes: async ({ cursor }) => !cursor
      ? { mistakes: [{ sessionId: 4, position: 1, available: !revoked,
        ...(revoked ? {} : { question: { stem: '旧页已撤权题干' }, submission: { correctAnswer: ['A'] } }) }], total: 2, nextCursor: 1 }
      : { mistakes: [{ sessionId: 5, position: 1, available: false }], total: 2, nextCursor: null }
  };
  const fixture = page(homeFile, api, 'A'); const home = fixture.page;
  home.onLoad(); await home.onShow();
  await home.changeView({ currentTarget: { dataset: { view: 'mistakes' } } });
  assert.equal(home.data.mistakes[0].question.stem, '旧页已撤权题干');
  revoked = true;
  await home.loadMore();
  assert.equal(home.data.mistakes.length, 1);
  assert.equal(home.data.mistakes[0].available, false);
  assert.equal(home.data.mistakes[0].question, undefined);
  assert.equal(home.data.currentPage, 2);
  assert.equal(home.data.hasPrevious, true);
  await home.loadPrevious();
  assert.equal(home.data.currentPage, 1);
  assert.equal(home.data.hasPrevious, false);
  assert.equal(home.data.mistakes[0].available, false);
  assert.equal(home.data.mistakes[0].question, undefined);
});

test('an empty or available next favorites page still drops old private question content', async () => {
  const api = {
    sets: async () => ({ sets: [], total: 0, nextCursor: null }),
    sessions: async () => ({ sessions: [], total: 0, nextCursor: null }),
    favorites: async ({ cursor }) => !cursor
      ? { favorites: [{ sessionId: 4, position: 1, available: true,
        question: { stem: '旧收藏题干' } }], total: 2, nextCursor: 1 }
      : { favorites: [], total: 2, nextCursor: null }
  };
  const fixture = page(homeFile, api, 'A'); const home = fixture.page;
  home.onLoad(); await home.onShow();
  await home.changeView({ currentTarget: { dataset: { view: 'favorites' } } });
  await home.loadMore();
  assert.equal(home.data.favorites.length, 0);
});

test('switching accounts clears private pagination cursors before loading the new account', async () => {
  let identity = 'A';
  const api = {
    sets: async () => ({ sets: [], total: 0, nextCursor: null }),
    sessions: async () => ({ sessions: [], total: 0, nextCursor: null }),
    favorites: async ({ cursor }) => identity === 'A'
      ? { favorites: [{ sessionId: cursor ? 2 : 1, position: 1, available: true,
        question: { stem: 'A 账号题干' } }], total: 2, nextCursor: cursor ? null : 1 }
      : { favorites: [{ sessionId: 3, position: 1, available: true,
        question: { stem: 'B 账号题干' } }], total: 1, nextCursor: null }
  };
  const fixture = page(homeFile, api, 'A'); const home = fixture.page;
  home.onLoad(); await home.onShow();
  await home.changeView({ currentTarget: { dataset: { view: 'favorites' } } });
  await home.loadMore();
  assert.equal(home.data.currentPage, 2);
  identity = 'B'; fixture.owner('B');
  await home.onShow();
  assert.equal(home.data.currentPage, 1);
  assert.equal(home.data.hasPrevious, false);
  assert.equal(home.data.favorites[0].question.stem, 'B 账号题干');
});

test('late question response from the previous account cannot erase the current account question', async () => {
  const oldQuestion = deferred(), entered = deferred();
  let questions = 0;
  const api = {
    session: async () => ({ session: { id: 9, setTitle: '练习', status: 'active', total: 1, answered: 0, correctCount: 0 },
      items: [{ position: 1, answered: false, favorite: false }] }),
    question: () => {
      if (questions++ === 0) { entered.resolve(); return oldQuestion.promise; }
      return Promise.resolve({ question: { position: 1, type: 'boolean', stem: '新账号题目' } });
    }
  };
  const fixture = page(sessionFile, api, 'A'); const practice = fixture.page;
  practice.onLoad({ sessionId: '9' }); const old = practice.onShow();
  await entered.promise;
  fixture.owner('B'); const fresh = practice.onShow();
  await fresh;
  assert.equal(practice.data.question.stem, '新账号题目');
  oldQuestion.resolve({ question: { position: 1, type: 'boolean', stem: '旧账号题目' } });
  await old;
  assert.equal(practice.data.question.stem, '新账号题目');
});

test('boolean false is submitted to the server; the page shows no answer before submit', async () => {
  const submissions = [];
  const api = {
    session: async () => ({ session: { id: 9, setTitle: '基础练习', status: 'active', total: 1, answered: 0, correctCount: 0 },
      items: [{ position: 1, answered: false, favorite: false }] }),
    question: async () => ({ question: { position: 1, type: 'boolean', stem: '地球是行星。' } }),
    submit: async (_sid,_pos,answer,requestId) => {
      submissions.push({ answer, requestId });
      return { submission: { position: 1, selectedAnswer: answer, correctAnswer: false,
        isCorrect: true, explanation: '来源已审', submittedAt: '2026-10-21' } };
    }, key: () => 'stable-1'
  };
  const fixture = page(sessionFile, api, 'A'); const practice = fixture.page;
  practice.onLoad({ sessionId: '9' }); await practice.onShow();
  assert.equal(practice.data.submission, null);
  assert.equal(practice.data.question.stem, '地球是行星。');
  practice.selectChoice({ currentTarget: { dataset: { id: 'false' } } });
  await practice.submitAnswer({ currentTarget: { dataset: {} } });
  assert.equal(submissions.length, 1);
  assert.equal(submissions[0].answer, false);
  assert.equal(practice.data.submission.isCorrect, true);
  assert.equal(practice.data.resultAnswerText, '错误');
});

test('opening a mistake targets its submitted question instead of the next unanswered item', async () => {
  const asked = [];
  const api = {
    session: async () => ({ session: { id: 9, setTitle: '复盘', status: 'active', total: 3, answered: 2, correctCount: 1 },
      items: [{ position: 1, answered: true }, { position: 2, answered: true }, { position: 3, answered: false }] }),
    question: async (_sid,position) => { asked.push(position); return { question: { position, type: 'boolean', stem: '错题' } }; },
    result: async () => ({ submission: { position: 1, selectedAnswer: false, correctAnswer: true, isCorrect: false } })
  };
  const fixture = page(sessionFile, api, 'A'); const practice = fixture.page;
  practice.onLoad({ sessionId: '9', position: '1' }); await practice.onShow();
  assert.deepEqual(asked, [1]);
  assert.equal(practice.data.position, 1);
  assert.equal(practice.data.submission.isCorrect, false);
});

test('an unanswered session opens without an expected 409 result request', async () => {
  const asked = [], resultReads = [];
  const api = {
    session: async () => ({ session: { id: 8, setTitle: '进度对账', status: 'active', total: 2, answered: 0, correctCount: 0 },
      items: [{ position: 1, answered: false }, { position: 2, answered: false }] }),
    question: async (_sid,position) => { asked.push(position); return { question: { position, type: 'boolean', stem: `第 ${position} 题` } }; },
    result: async (_sid,position) => { resultReads.push(position); throw new Error('未提交不应读取结果'); }
  };
  const fixture = page(sessionFile, api, 'A'); const practice = fixture.page;
  practice.onLoad({ sessionId: '8' }); await practice.onShow();
  assert.deepEqual(asked, [1]);
  assert.deepEqual(resultReads, []);
  assert.equal(practice.data.position, 1);
  assert.equal(practice.data.submission, null);
});

test('next question keeps the current card mounted until the replacement is ready', async () => {
  const next = deferred();
  const api = {
    session: async () => ({ session: { id: 25, setTitle: '切题', status: 'active', total: 2, answered: 1, correctCount: 1 },
      items: [{ position: 1, answered: true }, { position: 2, answered: false }] }),
    question: async (_sid,position) => position === 1
      ? { question: { position, type: 'boolean', stem: '上一题' } } : next.promise,
    result: async () => ({ submission: { position: 1, selectedAnswer: true, correctAnswer: true, isCorrect: true } })
  };
  const fixture = page(sessionFile, api, 'A'); const practice = fixture.page;
  practice.onLoad({ sessionId: '25' }); await practice.onShow();
  const changing = practice.nextQuestion();
  assert.equal(practice.data.loading, true);
  assert.equal(practice.data.question.stem, '上一题');
  assert.equal(practice.data.submission.position, 1);
  practice.selectChoice({ currentTarget: { dataset: { id: 'false' } } });
  assert.equal(practice.data.booleanChoice, null);
  next.resolve({ question: { position: 2, type: 'boolean', stem: '下一题' } });
  await changing;
  assert.equal(practice.data.loading, false);
  assert.equal(practice.data.question.stem, '下一题');
  assert.equal(practice.data.submission, null);
  assert.equal(practice.data.position, 2);
});

test('multiple choice selection and formal skip send an array and null to the server', async () => {
  const answers = [];
  const api = {
    session: async () => ({ session: { id: 7, setTitle: '多选练习', status: 'active', total: 2, answered: 0, correctCount: 0 },
      items: [{ position: 1, answered: false }, { position: 2, answered: false }] }),
    question: async (_sid,position) => ({ question: { position, type: 'multiple', stem: '选择所有正确项',
      options: [{ id: 'A', text: '选项 A' }, { id: 'B', text: '选项 B' }] } }),
    submit: async (_sid,position,answer) => {
      answers.push(answer);
      return { submission: { position, selectedAnswer: answer, correctAnswer: ['A','B'], isCorrect: answer !== null } };
    }, key: () => String(answers.length + 1)
  };
  const fixture = page(sessionFile, api, 'A'); const practice = fixture.page;
  practice.onLoad({ sessionId: '7' }); await practice.onShow();
  practice.selectChoice({ currentTarget: { dataset: { id: 'A' } } });
  practice.selectChoice({ currentTarget: { dataset: { id: 'B' } } });
  await practice.submitAnswer({ currentTarget: { dataset: {} } });
  await practice.nextQuestion();
  await practice.submitAnswer({ currentTarget: { dataset: { skip: '1' } } });
  assert.deepEqual(Array.from(answers[0]), ['A','B']);
  assert.equal(answers[1], null);
  assert.equal(practice.data.resultAnswerText, 'A、B');
});

test('uncertain submission retries the same request id and answer, then clears after reconciliation', async () => {
  const calls = [];
  let attempt = 0;
  const api = {
    session: async () => ({ session: { id: 9, setTitle: '选择练习', status: 'active', total: 1, answered: 0, correctCount: 0 },
      items: [{ position: 1, answered: false, favorite: false }] }),
    question: async () => ({ question: { position: 1, type: 'single', stem: '选择 A', options: [{ id: 'A', text: 'A' }, { id: 'B', text: 'B' }] } }),
    submit: async (_sid,_pos,answer,requestId) => {
      calls.push({ answer: [...answer], requestId });
      if (attempt++ === 0) throw new Error('网络连接异常');
      return { submission: { position: 1, selectedAnswer: answer, correctAnswer: ['A'], isCorrect: true } };
    }, key: () => 'one-key'
  };
  const fixture = page(sessionFile, api, 'A'); const practice = fixture.page;
  practice.onLoad({ sessionId: '9' }); await practice.onShow();
  practice.selectChoice({ currentTarget: { dataset: { id: 'A' } } });
  await practice.submitAnswer({ currentTarget: { dataset: {} } });
  assert.equal(practice.data.pendingSubmission, true);
  practice.selectChoice({ currentTarget: { dataset: { id: 'B' } } });
  assert.deepEqual(Array.from(practice.data.selected), ['A']);
  await practice.submitAnswer({ currentTarget: { dataset: {} } });
  assert.deepEqual(calls.map(call => call.requestId), ['one-key','one-key']);
  assert.deepEqual(calls.map(call => call.answer.join(',')), ['A','A']);
  assert.equal(practice.data.pendingSubmission, false);
  assert.equal(practice.data.submission.isCorrect, true);
});

test('destroying and recreating a Page keeps the uncertain request id and answer for the same login', async () => {
  const posts = [];
  const api = {
    session: async () => ({ session: { id: 22, setTitle: '弱网续答', status: 'active', total: 1, answered: 0, correctCount: 0 },
      items: [{ position: 1, answered: false }] }),
    question: async () => ({ question: { position: 1, type: 'single', stem: '选择', options: [{ id: 'A', text: 'A' }] } }),
    submit: async (_sid,_position,answer,requestId) => {
      posts.push({ answer: [...answer], requestId });
      if (posts.length === 1) throw new Error('网络连接异常');
      return { submission: { position: 1, selectedAnswer: answer, correctAnswer: ['A'], isCorrect: true } };
    }, key: () => 'page-stable'
  };
  const fixture = page(sessionFile, api, 'A'); const first = fixture.page;
  first.onLoad({ sessionId: '22' }); await first.onShow();
  first.selectChoice({ currentTarget: { dataset: { id: 'A' } } });
  await first.submitAnswer({ currentTarget: { dataset: {} } });
  first.onUnload();
  const second = fixture.newPage();
  second.onLoad({ sessionId: '22' }); await second.onShow();
  assert.equal(second.data.pendingSubmission, true);
  await second.submitAnswer({ currentTarget: { dataset: {} } });
  assert.deepEqual(posts.map(item => item.requestId), ['page-stable','page-stable']);
  assert.deepEqual(posts.map(item => item.answer.join(',')), ['A','A']);
});

test('switching accounts erases an uncertain answer held across Page instances', async () => {
  const api = {
    session: async () => ({ session: { id: 24, setTitle: '账号隔离', status: 'active', total: 1, answered: 0, correctCount: 0 },
      items: [{ position: 1, answered: false }] }),
    question: async () => ({ question: { position: 1, type: 'boolean', stem: '本账号题目' } }),
    submit: async () => { throw new Error('网络连接异常'); }, key: () => 'old-account-key'
  };
  const fixture = page(sessionFile, api, 'A'); const first = fixture.page;
  first.onLoad({ sessionId: '24' }); await first.onShow();
  first.selectChoice({ currentTarget: { dataset: { id: 'true' } } });
  await first.submitAnswer({ currentTarget: { dataset: {} } });
  first.onUnload(); fixture.owner('B');
  const second = fixture.newPage();
  second.onLoad({ sessionId: '24' }); await second.onShow();
  assert.equal(second.data.pendingSubmission, false);
  assert.equal(second.data.booleanChoice, null);
  assert.equal(second.data.submission, null);
});

test('after lost process memory, a conflicting POST reads the newly committed server result', async () => {
  let reads = 0, posts = 0;
  const api = {
    session: async () => ({ session: { id: 23, setTitle: '竞态对账', status: 'active', total: 1, answered: 0, correctCount: 0 },
      items: [{ position: 1, answered: false }] }),
    question: async () => ({ question: { position: 1, type: 'boolean', stem: '判断' } }),
    result: async () => {
      reads++;
      return { submission: { position: 1, selectedAnswer: true, correctAnswer: true, isCorrect: true } };
    },
    submit: async () => { posts++; const error = new Error('QUESTION_ALREADY_SUBMITTED'); error.statusCode = 409; throw error; },
    key: () => 'new-process-key'
  };
  const fixture = page(sessionFile, api, 'A'); const practice = fixture.page;
  practice.onLoad({ sessionId: '23' }); await practice.onShow();
  assert.equal(practice.data.submission, null);
  assert.equal(reads, 0);
  practice.selectChoice({ currentTarget: { dataset: { id: 'true' } } });
  await practice.submitAnswer({ currentTarget: { dataset: {} } });
  assert.equal(posts, 1);
  assert.equal(reads, 1);
  assert.equal(practice.data.submission.isCorrect, true);
  assert.equal(practice.data.session.answered, 1);
});

test('reentering after an uncertain submit reads the server result before another POST', async () => {
  let answered = false, posts = 0;
  const api = {
    session: async () => ({ session: { id: 2, setTitle: '续答', status: 'active', total: 1, answered: Number(answered), correctCount: Number(answered) },
      items: [{ position: 1, answered, favorite: false }] }),
    question: async () => ({ question: { position: 1, type: 'boolean', stem: '是否正确？' } }),
    result: async () => {
      if (!answered) { const error = new Error('尚未提交'); error.statusCode = 409; throw error; }
      return { submission: { position: 1, selectedAnswer: true, correctAnswer: true, isCorrect: true } };
    },
    submit: async () => { posts++; throw new Error('网络断开'); }, key: () => 'pending-key'
  };
  const fixture = page(sessionFile, api, 'A'); const practice = fixture.page;
  practice.onLoad({ sessionId: '2' }); await practice.onShow();
  practice.selectChoice({ currentTarget: { dataset: { id: 'true' } } });
  await practice.submitAnswer({ currentTarget: { dataset: {} } });
  assert.equal(posts, 1);
  practice.onHide(); answered = true;
  await practice.onShow();
  assert.equal(practice.data.submission.isCorrect, true);
  assert.equal(practice.data.pendingSubmission, false);
  assert.equal(posts, 1);
});

test('revocation and identity switch clear question, options and server answer immediately', async () => {
  const api = {
    session: async () => ({ session: { id: 3, setTitle: '测试', status: 'active', total: 1, answered: 0, correctCount: 0 },
      items: [{ position: 1, answered: false, favorite: false }] }),
    question: async () => ({ question: { position: 1, type: 'boolean', stem: '敏感题干' } }),
    favorite: async () => { const error = new Error('已撤权'); error.statusCode = 403; throw error; }
  };
  const fixture = page(sessionFile, api, 'A'); const practice = fixture.page;
  practice.onLoad({ sessionId: '3' }); await practice.onShow();
  assert.equal(practice.data.question.stem, '敏感题干');
  await practice.toggleFavorite();
  assert.equal(practice.data.question, null);
  assert.equal(practice.data.unavailable, true);
  fixture.owner('B'); practice.onHide();
  assert.equal(practice.data.submission, null);
  assert.equal(practice.data.choices.length, 0);
});

test('resource centre keeps OA simulation and purchased assessment materials separate from online practice', () => {
  const resources = fs.readFileSync(path.join(MINI, 'pages/resources/resources.wxml'), 'utf8');
  const source = fs.readFileSync(path.join(MINI, 'pages/resources/resources.js'), 'utf8');
  const config = JSON.parse(fs.readFileSync(path.join(MINI, 'app.json'), 'utf8'));
  const content = config.subPackages.find(item => item.root === 'package-content').pages;
  assert.match(resources, /在线刷题/);
  assert.match(resources, /OA 笔试题库保留原有模拟练习/);
  assert.match(source, /assessment-products/);
  assert.match(source, /oa-bank\/oa-bank/);
  assert.ok(content.includes('pages/practice-home/practice-home'));
  assert.ok(content.includes('pages/practice-session/practice-session'));
});
