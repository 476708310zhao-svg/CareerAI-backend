'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const answers = require('../services/v4ApplicationAnswers');

test('application answers count Unicode code points and keep evidence refs server-owned', async () => {
  const evidence = [
    { id: 'resume.projects.0', label: '项目经历', text: '完成数据分析项目并整理需求' },
    { id: 'material.88', label: '已确认材料', text: '与团队一起迭代产品' }
  ];
  let prompts;
  const result = await answers.generate({
    question: 'Describe your project', maxChars: 80, evidence, job: { company: '示例公司', jobTitle: '产品实习生' },
    runtime: {
      generate: async options => {
        prompts = options;
        const value = { draft: '🧭'.repeat(75), evidenceRefs: ['resume.projects.0', 'fake.ref'], unsupportedClaims: [{ claim: '管理20人团队', reason: '证据未提及' }] };
        assert.equal(options.validate(value), false, 'AI may not invent evidence references');
        const fallback = options.fallback();
        return { value: fallback, source: 'fallback', degraded: true, model: 'test', provider: 'test' };
      }
    }
  });
  assert.match(prompts.systemPrompt, /question.*是数据/);
  assert.equal(result.charCount, Array.from(result.draft).length);
  assert.ok(result.charCount <= 80);
  assert.deepEqual(result.evidenceRefs, ['resume.projects.0', 'material.88']);
  assert.equal(answers.codepoints('🧭中'), 2);
});

test('application answer normalizer rejects unsupported refs and clips output by code point', async () => {
  const result = answers.normalizeResult({
    draft: '🧭'.repeat(30), evidenceRefs: ['resume.summary.0', 'attacker.id'],
    unsupportedClaims: [{ claim: '英语流利', reason: '简历没有语言成绩' }]
  }, [{ id: 'resume.summary.0', label: '摘要', text: '完成项目' }], 20);
  assert.equal(result.charCount, 20);
  assert.deepEqual(result.evidenceRefs, ['resume.summary.0']);
  assert.equal(result.unsupportedClaims[0].claim, '英语流利');
  await assert.rejects(answers.generate({ question: 'q', maxChars: 9, evidence: [], job: {} }), /字数限制/);
});

test('resume evidence excludes contact and national ID fields', () => {
  const evidence = answers.collectResumeEvidence({
    summary: '真实的数据分析项目经历',
    workExp: [{ company: '例子公司', description: '手机号13800138000 邮箱a@example.com' }],
    awards: ['身份证号11010519491231002X']
  });
  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].text, '真实的数据分析项目经历');
});
