'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const bank = require('../miniprogram/package-career/pages/oa-bank/oa-practice-bank.js');

const root = path.join(__dirname, '..', 'miniprogram');

function loadPracticePage() {
  let page;
  let dashboardCalls = 0;
  const filename = path.join(root, 'package-career/pages/oa-bank/oa-bank.js');
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    Page(value) { page = value; },
    require(name) {
      if (name === './oa-practice-bank.js') return bank;
      if (name === '../../../utils/api-v4.js') return { getOaDashboard() { dashboardCalls++; return Promise.resolve({ code: 0, data: {} }); } };
      return {};
    },
    wx: { showToast() {} },
    console: { warn() {} },
    Date, Promise, setInterval, clearInterval
  }, { filename });
  page.data = JSON.parse(JSON.stringify(page.data));
  page.setData = function setData(patch) { Object.assign(this.data, patch); };
  page.dashboardCalls = () => dashboardCalls;
  return page;
}

test('OA practice bank has 21 complete, clearly categorized simulation questions', () => {
  assert.equal(bank.QUESTIONS.length, 21);
  assert.equal(new Set(bank.QUESTIONS.map(question => question.id)).size, 21);
  for (const type of bank.TYPES.filter(item => item.value !== 'all')) assert.equal(bank.forType(type.value).length, 3);
  for (const question of bank.QUESTIONS) {
    assert.ok(question.stem && question.explanation, question.id);
    assert.equal(question.choices.length, 4, question.id);
    assert.ok(question.answerIndex >= 0 && question.answerIndex < 4, question.id);
    assert.equal(bank.isCorrect(question, question.answerIndex), true, question.id);
    assert.equal(bank.isCorrect(question, (question.answerIndex + 1) % 4), false, question.id);
  }
});

test('OA opens ready to answer without login and shows explanation before advancing', () => {
  const page = loadPracticePage();
  page.onLoad();
  assert.equal(page.data.activeTab, 'practice');
  assert.equal(page.dashboardCalls(), 0);
  assert.equal(page.data.practiceCurrent.id, 'num-1');
  page.selectPracticeOption({ currentTarget: { dataset: { index: 1 } } });
  page.submitPracticeAnswer();
  assert.equal(page.data.practiceRevealed, true);
  assert.equal(page.data.practiceResultCorrect, true);
  assert.equal(page.data.practiceAnswered, 1);
  assert.equal(page.data.practiceCorrect, 1);
  page.nextPracticeQuestion();
  assert.equal(page.data.practiceCurrent.id, 'num-2');
  page.selectPracticeOption({ currentTarget: { dataset: { index: 0 } } });
  page.submitPracticeAnswer();
  assert.equal(page.data.practiceResultCorrect, false);
  assert.equal(page.data.practiceCorrect, 1);
  page.selectPracticeType({ currentTarget: { dataset: { type: 'numerical' } } });
  assert.equal(page.data.practiceCurrent.id, 'num-3');
  assert.equal(page.data.practiceQuestions.length, 3);
  page.restartPractice();
  assert.equal(page.data.practiceAnswered, 0);
  assert.equal(page.data.practiceCurrent.id, 'num-1');
  for (const question of bank.forType('numerical')) {
    page.selectPracticeOption({ currentTarget: { dataset: { index: question.answerIndex } } });
    page.submitPracticeAnswer();
    page.nextPracticeQuestion();
  }
  assert.equal(page.data.practiceFinished, true);
  assert.equal(page.data.practiceAnswered, 3);
  assert.equal(page.data.practiceCorrect, 3);
});

test('OA entry labels the exercises as simulations and keeps personal records separate', () => {
  const wxml = fs.readFileSync(path.join(root, 'package-career/pages/oa-bank/oa-bank.wxml'), 'utf8');
  const wxss = fs.readFileSync(path.join(root, 'package-career/pages/oa-bank/oa-bank.wxss'), 'utf8');
  assert.match(wxml, /通用模拟题/);
  assert.match(wxml, /不是企业真题/);
  assert.match(wxml, /bindtap="selectPracticeOption"/);
  assert.match(wxml, /bindtap="submitPracticeAnswer"/);
  assert.match(wxml, /practiceCurrent\.explanation/);
  assert.match(wxml, /bindtap="openRecordTab"/);
  assert.match(wxss, /\.practice-choice\s*\{[^}]*min-height:\s*96rpx/);
  assert.match(wxss, /\.practice-action\s*\{[^}]*min-height:\s*88rpx/);
});
