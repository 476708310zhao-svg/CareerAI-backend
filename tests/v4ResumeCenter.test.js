const test = require('node:test');
const assert = require('node:assert/strict');

const { defaultSuggestions, validateSuggestions } = require('../services/v4ResumeCenter');

test('resume fallback removes personal data and never returns unchanged suggestions', () => {
  const original = '赵鑫；9；年工作经验|本科统招；31；岁男；联系电话：18368323750';
  const suggestions = defaultSuggestions({ summary: original }, '本科及以上学历');

  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].before, original);
  assert.notEqual(suggestions[0].after, original);
  assert.equal(suggestions[0].after, '9年工作经验｜本科统招');
  assert.doesNotMatch(suggestions[0].after, /赵鑫|31|18368323750/);
  assert.match(suggestions[0].reason, /隐私信息/);
});

test('resume fallback ignores timestamps and unchanged content', () => {
  const suggestions = defaultSuggestions({
    importedAt: '2026-05-20T09:11:03.429Z',
    summary: 'Built pipeline improving latency by 20%'
  });

  assert.deepEqual(suggestions, []);
});

test('resume suggestion validation rejects content identical to the source', () => {
  assert.throws(
    () => validateSuggestions(1, { summary: '负责用户增长项目并完成数据分析' }, [{
      id: 'same',
      path: 'summary',
      before: '负责用户增长项目并完成数据分析',
      after: '负责用户增长项目并完成数据分析',
      reason: '压缩表达'
    }]),
    error => error && error.code === 'AI_SUGGESTION_UNCHANGED'
  );
});
