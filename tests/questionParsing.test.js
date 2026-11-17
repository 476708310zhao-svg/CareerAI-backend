'use strict';
const runtime = require('./helpers/isolatedTestRuntime.cjs');
runtime.install();
process.env.QUESTION_PDF_LOCAL_IMPORT_ENABLED = '1';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const jwt = require('jsonwebtoken');
const db = runtime.prepare();
const store = require('../services/questionAssetStore');
const { parseDigitalPages } = require('../services/questionPdfParser');
const { layoutFromItems, runIsolated } = require('../services/questionPdfLayout');
const { createQuestionParseJobs } = require('../services/questionParseJobs');
const { app } = require('../server');
runtime.registerCleanup(test);

const cases = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'question-parse-cases.json'), 'utf8')).cases;
const uuid = () => crypto.randomUUID();
const simulated = (pages, failAt = 0, onPage) => ({
  PARSER_VERSION: 'digital-pdf-v1',
  async openVerifiedPdf() { return { document: {}, pageCount: pages.length, close() {} }; },
  async extractPage(_doc, number, _timeoutMs, options) {
    if (failAt === number) throw Object.assign(new Error('TEST_INTERRUPTION'), { code: 'TEST_INTERRUPTION' });
    if (onPage) onPage(number, options);
    const page = pages[number - 1];
    return { page: number, text: page.text, blocks: [], status: page.status || (page.text ? 'digital' : 'scanned'), flags: page.flags || [] };
  }
});

test('answer appendix switches later OCR pages to the answer profile', async () => {
  const source = assetFixture(); approveProcessing(source.sourceId); clean(source.assetId);
  const seen = [];
  const pages = [
    { text: '一、单选题\n1. 示例？ A. 甲 B. 乙' },
    { text: '参考答案及解析\n1.【答案】A。解析：示例。' },
    { text: '2.【答案】B。解析：后续答案。' }
  ];
  const service = createQuestionParseJobs(db, simulated(pages, 0,
    (number, options) => seen.push([number, options.answerAppendix])));
  const job = service.createJob(request(source.sourceId), 'operator');
  await service.processJob(job.id);
  assert.deepEqual(seen, [[1, false], [2, false], [3, true]]);
});

test('answer profile survives a page checkpoint retry', async () => {
  const source = assetFixture(); approveProcessing(source.sourceId); clean(source.assetId);
  const pages = [
    { text: '一、单选题\n1. 示例？ A. 甲 B. 乙' },
    { text: '参考答案及解析\n1.【答案】A。解析：示例。' },
    { text: '2.【答案】B。解析：后续答案。' }
  ];
  const first = createQuestionParseJobs(db, simulated(pages, 3));
  const job = first.createJob(request(source.sourceId), 'operator');
  assert.equal((await first.processJob(job.id)).checkpointPage, 2);
  const seen = [];
  const resumed = createQuestionParseJobs(db, simulated(pages, 0,
    (number, options) => seen.push([number, options.answerAppendix])));
  resumed.retryJob(job.id);
  await resumed.processJob(job.id);
  assert.deepEqual(seen, [[3, true]]);
});

test('OCR question number is inferred only between matching neighbors and stays unverified', () => {
  const parsed = parseDigitalPages([
    { page: 1, status: 'complex_layout', flags: ['OCR_UNVERIFIED'], text: [
      '一、单项选择题',
      '40. 第一题题干？ A. 甲 B. 乙',
      'Al. 第二题题干需要复核？ A. 甲 B. 乙',
      '42. 第三题题干？ A. 甲 B. 乙',
      '答案表',
      '41.【答案】A。解析：示例。'
    ].join('\n') }
  ], 'ocr-number-test');
  assert.deepEqual(parsed.drafts.map(item => item.questionNumber), ['40', '41', '42']);
  assert.ok(parsed.drafts[1].flags.includes('OCR_QUESTION_NUMBER_INFERRED'));
  assert.deepEqual(parsed.drafts[1].answerOptionIds, []);
  assert.equal(parsed.drafts[1].answerStatus, 'UNVERIFIED');
  const unrelated = parseDigitalPages([{ page: 1, status: 'complex_layout', flags: ['OCR_UNVERIFIED'],
    text: '一、单项选择题\n40. 第一题？ A. 甲 B. 乙\nAl. 普通段落文字内容。\n43. 第三题？ A. 甲 B. 乙' }], 'ocr-number-test');
  assert.equal(unrelated.drafts.length, 2);
});
const assetFixture = (sharedSha = null) => {
  const batch = db.prepare('INSERT INTO question_asset_batches(label,client_key,created_by) VALUES (?,?,?)')
    .run('解析合成批次', uuid(), 'fixture').lastInsertRowid;
  const sha = sharedSha || crypto.createHash('sha256').update(uuid()).digest('hex');
  let asset = db.prepare('SELECT id FROM question_pdf_assets WHERE sha256=?').get(sha);
  if (!asset) asset = { id: db.prepare(`INSERT INTO question_pdf_assets(sha256,byte_size,storage_key)
    VALUES (?,?,?)`).run(sha, 128, `${sha.slice(0,2)}/${sha}.pdf`).lastInsertRowid };
  const sourceId = db.prepare(`INSERT INTO question_asset_sources
    (batch_id,client_key,source_type,source_reference,original_filename,asset_id,status,created_by)
    VALUES (?,?,?,?,?,?,'quarantined','fixture')`).run(batch, uuid(), 'synthetic', 'original synthetic text', 'synthetic.pdf', asset.id).lastInsertRowid;
  return { sourceId, assetId: asset.id, sha };
};
const approveProcessing = sourceId => {
  const claimId = db.prepare(`INSERT INTO question_asset_right_claims
    (source_id,client_key,evidence_reference,rights_json,territories_json,valid_from,valid_until,status,submitted_by,decided_by,decision_reason)
    VALUES (?,?,?,?,?,'2020-01-01','2099-12-31','approved','fixture','rights-review','synthetic grant')`)
    .run(sourceId, uuid(), 'synthetic provenance', JSON.stringify({ machineProcessing: true }), '["CN"]').lastInsertRowid;
  return claimId;
};
const clean = assetId => db.prepare("UPDATE question_pdf_assets SET validation_status='valid',scan_status='clean' WHERE id=?").run(assetId);
const request = sourceId => ({ sourceId, paperVersion: '2026-合成卷-A', territory: 'CN', commercial: false, clientKey: uuid() });

test('original six synthetic cases associate inline and end answers by section without guessing', () => {
  for (const item of cases) {
    const result = parseDigitalPages(item.pages, '2026-合成卷-A');
    assert.equal(result.drafts.length, item.expected.questionCount || 1, item.id);
    assert.ok(result.drafts.every(draft => ['pending_review','needs_repair'].includes(draft.status)), item.id);
    if (item.id === 'CASE01_INLINE_ANSWER') {
      assert.deepEqual(result.drafts[0].answerOptionIds, ['B']);
      assert.equal(result.drafts[0].answerEvidence.pageNumber, 1);
    }
    if (item.id === 'CASE02_END_ANSWER_KEY') {
      assert.deepEqual(result.drafts.map(draft => draft.answerOptionIds), [['C'],['C']]);
      assert.ok(result.drafts.every(draft => draft.answerEvidence.pageNumber === 8));
    }
    if (item.id === 'CASE03_DUPLICATED_NUMBER_SECTIONS') {
      assert.deepEqual(result.drafts.map(draft => [draft.sectionKey,draft.answerOptionIds]),
        [['第一部分',['B']],['第二部分',['A']]]);
    }
    if (item.id === 'CASE04_MISSING_ANSWER') {
      assert.equal(result.drafts[0].answerStatus, 'UNVERIFIED');
      assert.equal(result.drafts[0].answerEvidence, null);
    }
    if (item.id === 'CASE05_CONFLICT_ANSWER') {
      assert.equal(result.drafts[0].answerStatus, 'ANSWER_UNCERTAIN');
      assert.deepEqual(result.drafts[0].answerOptionIds, []);
      assert.equal(result.drafts[0].answerEvidence, null);
      assert.deepEqual(result.drafts[0].answerEvidenceCandidates.map(item => [item.pageNumber, item.choices.join('')]), [[1, 'C'],[3, 'B']]);
    }
  }
});

test('cross-page stem keeps both page numbers; ambiguous unsectioned end key never crosses sections', () => {
  const pages = [
    { page: 1, text: '第一部分 单选\n1. 这是跨页题干的前半句' },
    { page: 2, text: '这是跨页题干的后半句\nA. 对 B. 错\n第二部分 单选\n1. 第二节的题目？ A. 甲 B. 乙' },
    { page: 3, text: '答案表\n1.B' }
  ];
  const parsed = parseDigitalPages(pages, 'v1');
  assert.deepEqual(parsed.drafts[0].sourcePages, [1,2]);
  assert.match(parsed.drafts[0].stem, /后半句/);
  assert.equal(parsed.drafts[0].answerStatus, 'UNVERIFIED');
  assert.equal(parsed.drafts[1].answerStatus, 'UNVERIFIED');
});

test('answer table later on the same page does not erase questions and duplicate numbers stay uncertain', () => {
  const samePage = parseDigitalPages([{ page: 1, text: '一、单选题\n1. 题目？ A. 是 B. 否\n答案表\n1.A' }], 'v1');
  assert.equal(samePage.drafts.length, 1);
  assert.deepEqual(samePage.drafts[0].answerOptionIds, ['A']);
  const duplicated = parseDigitalPages([{ page: 1, text: '一、单选题\n1. 第一题？ A. 是 B. 否\n1. 重号题？ A. 是 B. 否\n答案表\n1.A' }], 'v1');
  assert.equal(duplicated.drafts.length, 2);
  assert.ok(duplicated.drafts.every(item => item.answerStatus === 'ANSWER_UNCERTAIN' && item.flags.includes('DUPLICATE_QUESTION_NUMBER')));
});

test('layout keeps exact item positions and flags likely two-column reading order', () => {
  const items = [];
  for (let y = 700; y > 600; y -= 20) {
    items.push({ str: `左${y}`, transform: [1,0,0,1,30,y], width: 40, height: 12 });
    items.push({ str: `右${y}`, transform: [1,0,0,1,350,y], width: 40, height: 12 });
  }
  const layout = layoutFromItems(1, items, { width: 600, height: 800 }, { graphicsUnverified: true });
  assert.equal(layout.status, 'complex_layout');
  assert.ok(layout.flags.includes('POSSIBLE_TWO_COLUMNS'));
  assert.equal(layout.blocks[0].x, 30);
  assert.ok(layout.flags.includes('GRAPHIC_CONTENT_UNVERIFIED'));
});

test('OCR text auto-fills an unambiguous answer for review but never certifies it', async () => {
  const page = { text: '一、单选题\n1. 示例题目？ A. 甲 B. 乙\n答案：B', status: 'complex_layout', flags: ['OCR_UNVERIFIED'] };
  const parsed = parseDigitalPages([{ page: 1, ...page, blocks: [] }], 'ocr-v1');
  assert.equal(parsed.drafts.length, 1);
  assert.equal(parsed.drafts[0].answerStatus, 'UNVERIFIED');
  assert.deepEqual(parsed.drafts[0].answerOptionIds, ['B']);
  assert.equal(parsed.drafts[0].answerEvidence, null);
  assert.ok(parsed.drafts[0].flags.includes('AUTO_MATCHED_ANSWER'));
  assert.equal(parsed.drafts[0].status, 'needs_repair');
  const source = assetFixture(); approveProcessing(source.sourceId); clean(source.assetId);
  const service = createQuestionParseJobs(db, simulated([page]));
  const created = service.createJob(request(source.sourceId), 'operator');
  const finished = await service.processJob(created.id);
  assert.equal(finished.status, 'WAIT_REVIEW');
  assert.equal(service.listDrafts(created.id).drafts[0].answerStatus, 'UNVERIFIED');
});

test('OCR answer key may auto-fill but cannot certify a question extracted from digital text', () => {
  const parsed = parseDigitalPages([
    { page: 1, text: '一、单选题\n1. 示例题目？ A. 甲 B. 乙', status: 'digital', flags: [], blocks: [] },
    { page: 2, text: '答案表\n1.B', status: 'complex_layout', flags: ['OCR_UNVERIFIED'], blocks: [] }
  ], 'mixed-v1');
  assert.equal(parsed.drafts.length, 1);
  assert.equal(parsed.drafts[0].answerStatus, 'UNVERIFIED');
  assert.deepEqual(parsed.drafts[0].answerOptionIds, ['B']);
  assert.ok(parsed.drafts[0].flags.includes('OCR_UNVERIFIED'));
  assert.equal(parsed.drafts[0].answerEvidenceCandidates[0].pageNumber, 2);
});

test('answer appendix heading mid-page keeps earlier answers in their original section', () => {
  const parsed = parseDigitalPages([
    { page: 1, text: '第一部分 甲\n1. 甲题？ A. 甲 B. 乙\n第二部分 乙\n1. 乙题？ A. 甲 B. 乙', status: 'complex_layout', flags: ['OCR_UNVERIFIED'] },
    { page: 2, text: '参考答案\n第一部分 甲\n1.【答案]A。解析:甲题\n第二部分 乙\n1.【答案]B。解析:乙题', status: 'complex_layout', flags: ['OCR_UNVERIFIED'] }
  ], 'ocr-heading');
  assert.deepEqual(parsed.drafts.map(item => item.answerOptionIds), [['A'], ['B']]);
  assert.ok(parsed.drafts.every(item => item.answerStatus === 'UNVERIFIED'));
});

test('OCR heading without punctuation still switches a later question to multiple choice', () => {
  const parsed = parseDigitalPages([
    { page: 1, text: '第三部分 综合知识\n一单项选择题\n44. 前一题？ A. 甲 B. 乙\n二多项选择题\n45. 后一题？ A. 甲 B. 乙 C. 丙', status: 'complex_layout', flags: ['OCR_UNVERIFIED'] },
    { page: 2, text: '参考答案\n第三部分 综合知识\n44.【答案]A。解析:前一题\n45.【答案]AC。解析:后一题', status: 'complex_layout', flags: ['OCR_UNVERIFIED'] }
  ], 'ocr-heading-punctuation');
  assert.deepEqual(parsed.drafts.map(item => item.type), ['single', 'multiple']);
  assert.deepEqual(parsed.drafts.map(item => item.answerOptionIds), [['A'], ['A', 'C']]);
  assert.ok(parsed.drafts.every(item => item.answerStatus === 'UNVERIFIED'));
});

test('OCR conflict, missing option, and truncated content are never auto-filled', () => {
  const parsed = parseDigitalPages([
    { page: 1, text: `一、单选题\n1. 冲突题？ A. 甲 B. 乙\n2. 缺选项？ A. 甲 B. 乙\n3. 截断题？ A. ${'甲'.repeat(2100)} B. 乙`, status: 'complex_layout', flags: ['OCR_UNVERIFIED'] },
    { page: 2, text: '答案表\n1.A 1.B 2.C 3.A', status: 'complex_layout', flags: ['OCR_UNVERIFIED'] }
  ], 'ocr-uncertain');
  assert.deepEqual(parsed.drafts.map(item => item.answerOptionIds), [[], [], []]);
  assert.ok(parsed.drafts[0].flags.includes('CONFLICTING_ANSWER'));
  assert.ok(parsed.drafts[1].flags.includes('ANSWER_NOT_IN_OPTIONS'));
  assert.ok(parsed.drafts[2].flags.includes('PARSER_TEXT_TRUNCATED'));
});

test('OCR answer is checked against its own explanation conclusion and prose option references are ignored', () => {
  const parsed = parseDigitalPages([
    { page: 1, text: '一、单选题\n1. 题甲？ A. 甲 B. 乙\n2. 题乙？ A. 甲 B. 乙', status: 'complex_layout', flags: ['OCR_UNVERIFIED'] },
    { page: 2, text: '参考答案\n1.【答案]A。解析:过程\n故本题选B。\n2.【答案]B。解析:过程\nB4、B5 都不成立。\n故本题选B。', status: 'complex_layout', flags: ['OCR_UNVERIFIED'] }
  ], 'ocr-explanation');
  assert.deepEqual(parsed.drafts.map(item => item.answerOptionIds), [[], ['B']]);
  assert.ok(parsed.drafts[0].flags.includes('ANSWER_EXPLANATION_CONFLICT'));
  assert.ok(parsed.drafts[1].flags.includes('ANSWER_EXPLANATION_AGREES'));
  assert.equal(parsed.drafts[1].answerEvidenceCandidates.length, 1);
});

test('oversized OCR option becomes a bounded repair draft without discarding the whole paper', () => {
  const pages = [
    { page:1,text:`一、单选题\n1. OCR 拼接题？ A. ${'误识别'.repeat(900)} B. 乙`,status:'complex_layout',flags:['OCR_UNVERIFIED'],blocks:[] },
    { page:2,text:'2. 后续正常题？ A. 甲 B. 乙',status:'complex_layout',flags:['OCR_UNVERIFIED'],blocks:[] }
  ];
  const parsed = parseDigitalPages(pages,'ocr-long-option');
  assert.equal(parsed.drafts.length,2);
  assert.ok(parsed.drafts[0].flags.includes('PARSER_TEXT_TRUNCATED'));
  assert.equal(parsed.drafts[0].status,'needs_repair');
  assert.equal(parsed.drafts[0].answerStatus,'UNVERIFIED');
  assert.equal(parsed.drafts[0].options[0].text.length,2000);
  assert.deepEqual(parsed.drafts[0].sourcePages,[1]);
  assert.ok(!parsed.drafts[1].flags.includes('PARSER_TEXT_TRUNCATED'));
});

test('answer and explanation appendix is evidence, not new questions, across pages and subsections', () => {
  const pages = [
    { page:1,text:'第一部分 综合能力\n1. 第一题？ A. 甲 B. 乙\n一、数字推理\n2. 第二题？ A. 甲 B. 乙',status:'digital',flags:[],blocks:[] },
    { page:2,text:'参考答案及解析\n第一部分 综合能力\n1.【答案]B。解析:说明\n2 【答案]A。解析:说明',status:'digital',flags:[],blocks:[] },
    { page:3,text:'3.【答案]C。解析:续页',status:'digital',flags:[],blocks:[] }
  ];
  const parsed = parseDigitalPages(pages,'appendix-v1');
  assert.equal(parsed.drafts.length,2);
  assert.deepEqual(parsed.drafts.map(item => item.sectionKey),['第一部分','第一部分']);
  assert.deepEqual(parsed.drafts.map(item => item.answerOptionIds),[['B'],['A']]);
  assert.deepEqual(parsed.drafts.map(item => item.answerEvidence.pageNumber),[2,2]);
});

test('missing OCR models pause the job without creating or publishing questions', async () => {
  const source = assetFixture(); approveProcessing(source.sourceId); clean(source.assetId);
  const adapter = simulated([{ text: '' }]);
  adapter.extractPage = async () => { throw Object.assign(new Error('OCR_MODELS_UNAVAILABLE'), { code: 'OCR_MODELS_UNAVAILABLE' }); };
  const service = createQuestionParseJobs(db, adapter);
  const created = service.createJob(request(source.sourceId), 'operator');
  const result = await service.processJob(created.id);
  assert.equal(result.status, 'WAIT_OCR');
  assert.equal(result.reasonCode, 'OCR_MODELS_UNAVAILABLE');
  assert.equal(result.checkpointPage, 0);
  assert.equal(db.prepare('SELECT COUNT(*) FROM qp_drafts WHERE job_id=?').pluck().get(created.id), 0);
});

test('enabling OCR creates a separate parser version and never reuses a digital checkpoint', () => {
  const source = assetFixture();
  const service = createQuestionParseJobs(db);
  const prior = process.env.QUESTION_PDF_OCR_ENABLED;
  try {
    process.env.QUESTION_PDF_OCR_ENABLED = '0';
    const digitalRequest = request(source.sourceId);
    const digital = service.createJob(digitalRequest, 'operator');
    assert.equal(digital.parserVersion, 'digital-pdf-v1');
    process.env.QUESTION_PDF_OCR_ENABLED = '1';
    assert.throws(() => service.createJob(digitalRequest, 'operator'), /CLIENT_KEY_CONFLICT/);
    const hybrid = service.createJob(request(source.sourceId), 'operator');
    assert.equal(hybrid.parserVersion, 'hybrid-pdf-ocr-v5');
    assert.notEqual(hybrid.id, digital.id);
    assert.throws(() => service.retryJob(digital.id), /PARSER_VERSION_MISMATCH/);
  } finally {
    if (prior === undefined) delete process.env.QUESTION_PDF_OCR_ENABLED;
    else process.env.QUESTION_PDF_OCR_ENABLED = prior;
  }
});

test('isolated PDF extractor kills a stalled child and caps child output', async () => {
  const workerScript = path.join(__dirname, 'fixtures', 'question-worker-probe.js');
  await assert.rejects(runIsolated('page', 'unused', 1, { workerScript, timeoutMs: 150 }), /PDF_PAGE_TIMEOUT/);
  await assert.rejects(runIsolated('page', 'flood', 1, { workerScript, timeoutMs: 3000, maxOutputBytes: 1024 }), /PDF_PAGE_OUTPUT_LIMIT/);
});

test('missing rights and pending asset validation are distinct stop states, including same SHA different sources', () => {
  const priorQuestions = db.prepare('SELECT COUNT(*) FROM qb_questions').pluck().get();
  const first = assetFixture(), second = assetFixture(first.sha);
  const service = createQuestionParseJobs(db, simulated(cases[0].pages));
  const pendingRights = service.createJob(request(first.sourceId), 'operator');
  assert.equal(pendingRights.status, 'WAIT_RIGHTS');
  approveProcessing(first.sourceId);
  assert.equal(service.retryJob(pendingRights.id).status, 'WAIT_ASSET_CHECK');
  clean(first.assetId);
  assert.equal(service.retryJob(pendingRights.id).status, 'QUEUED');
  assert.equal(service.createJob(request(first.sourceId), 'operator').id, pendingRights.id);
  const other = service.createJob(request(second.sourceId), 'operator');
  assert.equal(other.status, 'WAIT_RIGHTS');
  assert.notEqual(other.id, pendingRights.id);
  assert.equal(db.prepare('SELECT COUNT(*) FROM qb_questions').pluck().get(), priorQuestions);
});

test('page checkpoint survives interruption and same job retry does not duplicate drafts', async () => {
  const priorQuestions = db.prepare('SELECT COUNT(*) FROM qb_questions').pluck().get();
  const source = assetFixture(); approveProcessing(source.sourceId); clean(source.assetId);
  const pages = [
    { text: '一、单选题\n1. 一天有多少小时？ A.12 B.18 C.24 D.48' },
    { text: '2. 一周有多少天？ A.5 B.6 C.7 D.8' },
    { text: '一、单选题 答案汇总\n1.C 2.C' }
  ];
  const failed = createQuestionParseJobs(db, simulated(pages, 2));
  const created = failed.createJob(request(source.sourceId), 'operator');
  assert.equal((await failed.processJob(created.id)).status, 'FAILED');
  assert.equal(failed.jobDetail(created.id).job.checkpointPage, 1);
  const resumed = createQuestionParseJobs(db, simulated(pages));
  assert.equal(resumed.retryJob(created.id).status, 'QUEUED');
  assert.equal((await resumed.processJob(created.id)).status, 'WAIT_REVIEW');
  const drafts = resumed.listDrafts(created.id).drafts;
  assert.equal(drafts.length, 2);
  assert.deepEqual(drafts.map(item => item.answerOptionIds), [['C'],['C']]);
  assert.equal(resumed.createJob(request(source.sourceId), 'other-operator').id, created.id);
  assert.equal(db.prepare('SELECT COUNT(*) FROM qp_drafts WHERE job_id=?').pluck().get(created.id), 2);
  assert.equal(db.prepare('SELECT COUNT(*) FROM qb_questions').pluck().get(), priorQuestions);
});

test('expired running lease resumes from the next page after a killed worker', async () => {
  const source = assetFixture(); approveProcessing(source.sourceId); clean(source.assetId);
  const pages = [{ text: '一、单选题\n1. 题目？ A. 正确 B. 错误' }, { text: '一、单选题 答案汇总\n1.A' }];
  const visited = [];
  const service = createQuestionParseJobs(db, simulated(pages, 0, number => visited.push(number)));
  const created = service.createJob(request(source.sourceId), 'operator');
  db.prepare(`INSERT INTO qp_pages(job_id,page_number,text_content,layout_json,status)
    VALUES (?,1,?,'{"blocks":[],"flags":[]}','digital')`).run(created.id, pages[0].text);
  db.prepare("UPDATE qp_jobs SET status='RUNNING',lease_owner='dead-worker',lease_until_ms=1,checkpoint_page=1,page_count=2 WHERE id=?")
    .run(created.id);
  assert.equal((await service.processJob(created.id)).status, 'WAIT_REVIEW');
  assert.deepEqual(visited, [2]);
  assert.equal(service.listDrafts(created.id).drafts.length, 1);
});

test('revocation between pages pauses worker and draft edits keep immutable audit with CAS', async () => {
  const source = assetFixture(); const claimId = approveProcessing(source.sourceId); clean(source.assetId);
  const pages = cases[1].pages.map(page => ({ text: page.text }));
  const stopped = createQuestionParseJobs(db, simulated(pages, 0, number => {
    if (number === 1) db.prepare("UPDATE question_asset_right_claims SET status='revoked',revoked_by='rights-review',revocation_reason='撤权',revoked_at=datetime('now') WHERE id=?").run(claimId);
  }));
  const created = stopped.createJob(request(source.sourceId), 'operator');
  assert.equal((await stopped.processJob(created.id)).status, 'WAIT_RIGHTS');
  assert.equal(stopped.jobDetail(created.id).job.checkpointPage, 1);
  const newClaim = approveProcessing(source.sourceId);
  const ready = createQuestionParseJobs(db, simulated(pages));
  ready.retryJob(created.id);
  assert.equal((await ready.processJob(created.id)).status, 'WAIT_REVIEW');
  const item = ready.listDrafts(created.id).drafts[0];
  const changed = ready.editDraft(item.id, { expectedVersion: item.version, stem: `${item.stem}（人工核对）`,
    options: item.options, answerOptionIds: item.answerOptionIds, explanation: '原文未提供解析', reviewNote: '核对原页后修改题干' }, 'editor');
  assert.equal(changed.version, 2);
  assert.equal(changed.status, 'needs_repair');
  assert.equal(changed.answerStatus, 'UNVERIFIED');
  assert.equal(changed.answerEvidence, null);
  assert.ok(changed.answerEvidenceCandidates.length > 0);
  assert.ok(changed.flags.includes('MANUAL_CONTENT_EDIT'));
  assert.throws(() => ready.editDraft(item.id, { expectedVersion: item.version, stem: item.stem,
    options: item.options, answerOptionIds: item.answerOptionIds, explanation: '', reviewNote: '旧版覆盖' }, 'editor'), /DRAFT_VERSION_CONFLICT/);
  assert.equal(ready.draftDetail(item.id).edits.length, 1);
  assert.throws(() => db.prepare("UPDATE qp_draft_edits SET review_note='x' WHERE draft_id=?").run(item.id), /DRAFT_AUDIT_IMMUTABLE/);
  db.prepare("UPDATE question_asset_right_claims SET status='revoked',revoked_by='rights-review',revocation_reason='再次撤权',revoked_at=datetime('now') WHERE id=?").run(newClaim);
  assert.throws(() => ready.listDrafts(created.id), /SOURCE_USE_DENIED/);
  assert.throws(() => ready.editDraft(item.id, { expectedVersion: changed.version, stem: changed.stem,
    options: changed.options, answerOptionIds: changed.answerOptionIds, explanation: changed.explanation,
    reviewNote: '撤权后不得编辑' }, 'editor'), /SOURCE_USE_DENIED/);
  assert.throws(() => ready.previewAsset(source.sourceId, 1, created.id), /SOURCE_USE_DENIED/);
});

test('page and whole-job byte caps stop before committing oversized evidence', async () => {
  const source = assetFixture(); approveProcessing(source.sourceId); clean(source.assetId);
  const large = createQuestionParseJobs(db, simulated([{ text: '字'.repeat(200000) }]));
  const created = large.createJob(request(source.sourceId), 'operator');
  const stopped = await large.processJob(created.id);
  assert.equal(stopped.status, 'NEEDS_MANUAL');
  assert.equal(stopped.reasonCode, 'PAGE_LAYOUT_BUDGET_EXCEEDED');
  assert.equal(stopped.checkpointPage, 0);
  assert.equal(db.prepare('SELECT COUNT(*) FROM qp_pages WHERE job_id=?').pluck().get(created.id), 0);

  const source2 = assetFixture(); approveProcessing(source2.sourceId); clean(source2.assetId);
  const limited = createQuestionParseJobs(db, simulated([{ text: '一、单选题\n1. 题目？ A. 是 B. 否' }]));
  const created2 = limited.createJob(request(source2.sourceId), 'operator');
  db.prepare('UPDATE qp_jobs SET layout_bytes=? WHERE id=?').run(20 * 1024 * 1024 - 1, created2.id);
  const stopped2 = await limited.processJob(created2.id);
  assert.equal(stopped2.status, 'NEEDS_MANUAL');
  assert.equal(stopped2.reasonCode, 'JOB_LAYOUT_BUDGET_EXCEEDED');
  assert.equal(db.prepare('SELECT COUNT(*) FROM qp_pages WHERE job_id=?').pluck().get(created2.id), 0);
});

test('time budget expiring after rule parsing keeps page checkpoint but commits no drafts', async () => {
  const source = assetFixture(); approveProcessing(source.sourceId); clean(source.assetId);
  const pages = [{ text: '一、单选题\n1. 题目？ A. 是 B. 否\n答案：A' }];
  let budgetReads = 0;
  const stalled = createQuestionParseJobs(db, simulated(pages), {
    budgetNow: () => ++budgetReads >= 7 ? 120_000 : 0
  });
  const created = stalled.createJob(request(source.sourceId), 'operator');
  const stopped = await stalled.processJob(created.id);
  assert.equal(stopped.status, 'WAIT_BUDGET');
  assert.equal(stopped.reasonCode, 'TIME_LIMIT_EXCEEDED');
  assert.equal(stopped.checkpointPage, 1);
  assert.equal(db.prepare('SELECT COUNT(*) FROM qp_drafts WHERE job_id=?').pluck().get(created.id), 0);
  const resumed = createQuestionParseJobs(db, simulated(pages));
  assert.equal(resumed.retryJob(created.id).status, 'QUEUED');
  assert.equal((await resumed.processJob(created.id)).status, 'WAIT_REVIEW');
  assert.equal(resumed.listDrafts(created.id).drafts.length, 1);
});

test('scanned page waits for OCR and hard page budget stops before extraction', async () => {
  const source = assetFixture(); approveProcessing(source.sourceId); clean(source.assetId);
  const scanned = createQuestionParseJobs(db, simulated([{ text: '' }]));
  const job = scanned.createJob(request(source.sourceId), 'operator');
  assert.equal((await scanned.processJob(job.id)).status, 'WAIT_OCR');
  assert.equal(scanned.listDrafts(job.id).drafts.length, 0);
  const source2 = assetFixture(); approveProcessing(source2.sourceId); clean(source2.assetId);
  const over = createQuestionParseJobs(db, simulated(Array.from({ length: 101 }, () => ({ text: 'unreached' }))));
  const tooLong = over.createJob(request(source2.sourceId), 'operator');
  assert.equal((await over.processJob(tooLong.id)).status, 'WAIT_BUDGET');
  assert.equal(over.jobDetail(tooLong.id).job.checkpointPage, 0);
});

test('real bundled digital PDF extracts verified private bytes and preview stays behind job context', async () => {
  const pdf = fs.readFileSync(path.join(__dirname, 'fixtures', 'question-valid.pdf'));
  const sha = crypto.createHash('sha256').update(pdf).digest('hex');
  const tmp = path.join(store.temporaryDirectory(), uuid());
  fs.writeFileSync(tmp, pdf);
  const retained = store.retain(tmp, sha, pdf.length);
  if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  const batchId = db.prepare('INSERT INTO question_asset_batches(label,client_key,created_by) VALUES (?,?,?)')
    .run('真实合成 PDF', uuid(), 'fixture').lastInsertRowid;
  db.prepare(`INSERT INTO question_pdf_assets(sha256,byte_size,storage_key,validation_status,scan_status)
    VALUES (?,?,?,'valid','clean') ON CONFLICT(sha256) DO NOTHING`).run(sha, pdf.length, retained.key);
  const assetId = db.prepare('SELECT id FROM question_pdf_assets WHERE sha256=?').pluck().get(sha);
  clean(assetId);
  const sourceId = db.prepare(`INSERT INTO question_asset_sources
    (batch_id,client_key,source_type,source_reference,original_filename,asset_id,status,created_by)
    VALUES (?,?,?,?,?,?,'quarantined','fixture')`).run(batchId, uuid(), 'synthetic', 'bundled original PDF', 'question-valid.pdf', assetId).lastInsertRowid;
  approveProcessing(sourceId);
  const service = createQuestionParseJobs(db);
  const created = service.createJob(request(sourceId), 'operator');
  assert.equal((await service.processJob(created.id)).status, 'NEEDS_MANUAL');
  const page = service.pageEvidence(created.id, 1).page;
  assert.match(page.text, /Test PDF/);
  assert.ok(page.blocks.length > 0);
  assert.ok(page.flags.includes('GRAPHIC_CONTENT_UNVERIFIED'));
  assert.throws(() => service.previewAsset(sourceId, 1), /INVALID_ID/);
  const check = spawnSync('pdftoppm', ['-v'], { shell: false, windowsHide: true });
  if (check.error?.code === 'ENOENT') {
    await assert.rejects(service.previewAsset(sourceId, 1, created.id), /PREVIEW_UNAVAILABLE/);
  } else {
    const png = await service.previewAsset(sourceId, 1, created.id);
    assert.ok(png.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])));
  }
});

test('admin parsing API checks live account permissions and never exposes private drafts publicly', async () => {
  const source = assetFixture(); approveProcessing(source.sourceId); clean(source.assetId);
  const service = createQuestionParseJobs(db, simulated(cases[0].pages));
  const created = service.createJob(request(source.sourceId), 'operator');
  assert.equal((await service.processJob(created.id)).status, 'WAIT_REVIEW');
  const draft = service.listDrafts(created.id).drafts[0];
  const server = runtime.trackServer(app.listen(0, '127.0.0.1'));
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const url = suffix => `${base}/admin/api/v4/question-parsing${suffix}`;
  const account = (id, permissions) => {
    const username = `parse-${id}`;
    db.prepare(`INSERT INTO admin_accounts(id,username,password_hash,role,permissions,is_active)
      VALUES (?,?,'test-only','operator',?,1)`).run(id, username, JSON.stringify(permissions));
    return { Authorization: `Bearer ${jwt.sign({ role: 'admin', id, sub: username, permissions }, process.env.JWT_SECRET)}`,
      'Content-Type': 'application/json' };
  };
  const assets = account(92001, ['questionAssets']);
  const editor = account(92002, ['questionBankEdit']);
  const unrelated = account(92003, ['questions']);
  const editorWithAssets = account(92004, ['questionAssets','questionBankEdit']);
  assert.equal((await fetch(url('/jobs'))).status, 401);
  assert.equal((await fetch(url('/jobs'), { headers: unrelated })).status, 403);
  assert.equal((await fetch(url('/jobs'), { headers: editor })).status, 403);
  const jobs = await fetch(url('/jobs'), { headers: assets });
  assert.equal(jobs.status, 200);
  assert.equal(jobs.headers.get('cache-control'), 'no-store');
  assert.ok(!JSON.stringify(await jobs.json()).includes('storage_key'));
  assert.equal((await fetch(url(`/drafts/${draft.id}`), { headers: assets })).status, 200);
  assert.equal((await fetch(url(`/drafts/${draft.id}`), { headers: editor })).status, 403);
  assert.equal((await fetch(url(`/jobs/${created.id}/drafts`), { headers: editor })).status, 403);
  assert.equal((await fetch(url(`/jobs/${created.id}/pages/1`), { headers: editor })).status, 403);
  assert.equal((await fetch(url(`/drafts/${draft.id}`), { headers: editorWithAssets })).status, 200);
  const edit = { expectedVersion: draft.version, stem: draft.stem, options: draft.options,
    answerOptionIds: draft.answerOptionIds, explanation: draft.explanation, reviewNote: '管理员审题修改' };
  assert.equal((await fetch(url(`/drafts/${draft.id}`), { method: 'PATCH', headers: assets, body: JSON.stringify(edit) })).status, 403);
  assert.equal((await fetch(url(`/drafts/${draft.id}`), { method: 'PATCH', headers: editor, body: JSON.stringify(edit) })).status, 403);
  assert.equal((await fetch(url(`/drafts/${draft.id}`), { method: 'PATCH', headers: editorWithAssets, body: JSON.stringify(edit) })).status, 200);
  assert.equal((await fetch(url(`/sources/${source.sourceId}/pages/1/preview?jobId=${created.id}`), { headers: editor })).status, 403);
  assert.equal((await fetch(`${base}/api/v4/question-parsing/drafts/${draft.id}`)).status, 404);
  db.prepare('UPDATE admin_accounts SET permissions=? WHERE id=?').run('[]', 92001);
  assert.equal((await fetch(url(`/jobs/${created.id}`), { headers: assets })).status, 403);
  db.prepare('UPDATE admin_accounts SET is_active=0 WHERE id=?').run(92004);
  assert.equal((await fetch(url(`/drafts/${draft.id}`), { headers: editorWithAssets })).status, 403);
});
