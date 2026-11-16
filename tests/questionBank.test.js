'use strict';
const runtime = require('./helpers/isolatedTestRuntime.cjs');
runtime.install();
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const db = runtime.prepare();
const { app } = require('../server');
const { createQuestionBank } = require('../services/questionBank');
const { canUseSet, canUseRevision, revisionReadiness } = require('../services/questionBankRights');
const service = createQuestionBank(db);
runtime.registerCleanup(test);
const uuid = () => crypto.randomUUID();
const today = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
const context = { territory: 'CN', commercial: false };
const original = () => ({ kind: 'original', authorName: '测试作者', ownershipEvidence: '本人原创手稿 2026-10-21' });
const single = (answer = 'A') => ({ type: 'single', stem: '以下哪个选项正确？',
  options: [{ id: 'A', text: '正确' }, { id: 'B', text: '错误' }], answer: [answer], explanation: '解析有证据' });
const question = (content = single(), provenance = original(), media = []) => service.createQuestion({
  clientKey: uuid(), content, provenance, media
}, 'author');
const claimInput = (rights, extras = {}) => ({ clientKey: uuid(), evidenceReference: '已签署授权书编号 T-1',
  rights, territories: ['CN'], validFrom: '2020-01-01', validUntil: '2099-12-31', ...extras });
const fullRights = (commercial = false) => ({ stemDisplay: true, answerDisplay: true,
  imageDisplay: false, commercialUse: commercial, adaptation: true });
const approveRevision = (id, rights = fullRights(), actors = {}) => {
  const claim = service.submitClaim(id, claimInput(rights), actors.submitter || 'author');
  service.decideClaim(claim.id, { decision: 'approved', reason: '核对签署证据' }, actors.rightsReviewer || 'rights');
  service.reviewContent(id, { clientKey: uuid(), expectedLatestReviewId: null,
    decision: 'approved', reason: '内容核对通过' }, actors.contentReviewer || 'content');
  return claim;
};
const newSet = revisionIds => {
  const set = service.createSet({ clientKey: uuid(), title: '内部练习题集' }, 'editor');
  return service.replaceSetItems(set.id, { expectedVersion: set.version, revisionIds });
};
const publish = (set, commercial = false) => service.publishSet(set.id,
  { clientKey: uuid(), expectedVersion: set.version, territory: 'CN', commercial }, 'publisher');
const pdfFixture = (assetId = null, submitter = 'source-owner') => {
  const batchId = db.prepare('INSERT INTO question_asset_batches(label,client_key,created_by) VALUES (?,?,?)')
    .run('Stage3', uuid(), submitter).lastInsertRowid;
  if (!assetId) {
    const sha = crypto.createHash('sha256').update(uuid()).digest('hex');
    assetId = db.prepare(`INSERT INTO question_pdf_assets(sha256,byte_size,storage_key,validation_status,scan_status)
      VALUES (?,?,?,'valid','clean')`).run(sha, 128, `${sha.slice(0, 2)}/${sha}.pdf`).lastInsertRowid;
  }
  const sourceId = db.prepare(`INSERT INTO question_asset_sources
    (batch_id,client_key,source_type,source_reference,original_filename,asset_id,status,created_by)
    VALUES (?,?,?,?,?,?,'quarantined',?)`).run(batchId, uuid(), 'internal', '许可材料', 'source.pdf', assetId, submitter).lastInsertRowid;
  return { sourceId, assetId };
};
const approveSource = sourceId => {
  const rights = { internalStorage: true, machineProcessing: true, thirdPartyProcessing: false,
    stemDisplay: true, imageDisplay: false, answerDisplay: true, commercialUse: false, adaptation: true };
  const claimId = db.prepare(`INSERT INTO question_asset_right_claims
    (source_id,client_key,evidence_reference,rights_json,territories_json,valid_from,valid_until,status,submitted_by,decided_by,decision_reason)
    VALUES (?,?,?,?,?,? ,?,'approved','source-owner','source-rights','证据有效')`)
    .run(sourceId, uuid(), '来源授权协议', JSON.stringify(rights), '["CN"]', '2020-01-01', '2099-12-31').lastInsertRowid;
  db.prepare(`INSERT INTO question_asset_content_reviews(source_id,client_key,decision,reason,reviewer)
    VALUES (?,?,'approved','原始内容准确','source-content')`).run(sourceId, uuid());
  return claimId;
};

test('strict DTO validates options, answer shapes and immutable revision/media; retries bind original parent', () => {
  assert.throws(() => question({ ...single(), options: [{ id: 'A', text: 'x' }, { id: 'A', text: 'y' }] }), /DUPLICATE_OPTION_ID/);
  assert.throws(() => question({ ...single(), answer: ['C'] }), /INVALID_ANSWER/);
  assert.throws(() => question({ ...single(), type: 'multiple', answer: ['A'] }), /INVALID_ANSWER/);
  assert.throws(() => question({ type: 'boolean', stem: '判断', options: [], answer: true, explanation: '解析' }), /INVALID_BOOLEAN_ANSWER/);
  const boolean = question({ type: 'boolean', stem: '此陈述是否正确', answer: false, explanation: '可验证解析' });
  assert.equal(boolean.revision.content.answer, false);
  const input = { clientKey: uuid(), content: single(), provenance: original(), media: [] };
  const first = service.createQuestion(input, 'author');
  const changed = service.createRevision(first.question.id, { clientKey: uuid(), expectedRevisionId: first.revision.id,
    content: single('B'), provenance: original(), media: [] }, 'author');
  assert.equal(service.createQuestion(input, 'author').revision.id, first.revision.id);
  assert.equal(changed.question.latestRevisionId, changed.revision.id);
  assert.throws(() => service.createRevision(first.question.id, { clientKey: changed.revision.clientKey ||
    db.prepare('SELECT client_key FROM qb_revisions WHERE id=?').pluck().get(changed.revision.id),
  expectedRevisionId: changed.revision.id, content: single('B'), provenance: original(), media: [] }, 'author'), /CLIENT_KEY_CONFLICT/);
  assert.throws(() => db.prepare("UPDATE qb_revisions SET content_json='{}' WHERE id=?").run(first.revision.id), /QUESTION_REVISION_IMMUTABLE/);
  assert.throws(() => db.prepare("UPDATE qb_revisions SET media_json='[]' WHERE id=?").run(first.revision.id), /QUESTION_REVISION_IMMUTABLE/);
  assert.equal(revisionReadiness(db, first.revision.id, { territory: 'CN' }).ready, false);
});

test('independent reviews require CAS and reject authors, rights submitters and stale retries', () => {
  const item = question();
  const claim = service.submitClaim(item.revision.id, claimInput(fullRights()), 'submitter');
  assert.throws(() => service.reviewContent(item.revision.id, { clientKey: uuid(), expectedLatestReviewId: null,
    decision: 'approved', reason: '尝试自审' }, 'submitter'), /SELF_REVIEW_DENIED/);
  assert.throws(() => service.decideClaim(claim.id, { decision: 'approved', reason: '尝试自审' }, 'author'), /SELF_REVIEW_DENIED/);
  service.decideClaim(claim.id, { decision: 'approved', reason: '证据通过' }, 'rights');
  const key = uuid();
  const approved = service.reviewContent(item.revision.id, { clientKey: key, expectedLatestReviewId: null,
    decision: 'approved', reason: '内容通过' }, 'content');
  const rejected = service.reviewContent(item.revision.id, { clientKey: uuid(), expectedLatestReviewId: approved.id,
    decision: 'rejected', reason: '发现错误' }, 'content2');
  assert.equal(service.reviewContent(item.revision.id, { clientKey: key, expectedLatestReviewId: null,
    decision: 'approved', reason: '内容通过' }, 'content').id, approved.id);
  assert.throws(() => service.reviewContent(item.revision.id, { clientKey: uuid(), expectedLatestReviewId: approved.id,
    decision: 'approved', reason: '陈旧请求' }, 'content3'), /CONTENT_REVIEW_VERSION_CONFLICT/);
  assert.equal(service.questionDetail(item.question.id).revisions[0].contentReviews.length, 2);
  assert.equal(revisionReadiness(db, item.revision.id, context).reason, 'CONTENT_NOT_APPROVED');
  assert.equal(rejected.decision, 'rejected');
});

test('rights submitted after content approval cannot convert a self-reviewed revision into ready', () => {
  const item = question();
  service.reviewContent(item.revision.id, { clientKey: uuid(), expectedLatestReviewId: null,
    decision: 'approved', reason: '先审内容' }, 'late-claimer');
  assert.throws(() => service.submitClaim(item.revision.id, claimInput(fullRights()), 'late-claimer'), /SELF_REVIEW_DENIED/);
  // Dynamic use checks also fail closed if a privileged database writer
  // inserts a later self-submitted grant outside the service path.
  db.prepare(`INSERT INTO qb_right_claims(revision_id,client_key,evidence_reference,rights_json,territories_json,
    valid_from,valid_until,status,submitted_by,decided_by,decision_reason)
    VALUES (?,?,?,?,?,'2020-01-01','2099-12-31','approved','late-claimer','other','test')`)
    .run(item.revision.id, uuid(), 'test', JSON.stringify(fullRights()), '["CN"]');
  assert.equal(revisionReadiness(db, item.revision.id, context).reason, 'QUESTION_RIGHTS_DENIED');
});

test('original question needs one approved claim covering stem, answer and commercial; revoke/expiry recheck', () => {
  const item = question();
  service.reviewContent(item.revision.id, { clientKey: uuid(), expectedLatestReviewId: null,
    decision: 'approved', reason: '内容正确' }, 'content');
  const first = service.submitClaim(item.revision.id, claimInput({ stemDisplay: true }), 'author');
  const second = service.submitClaim(item.revision.id, claimInput({ answerDisplay: true, commercialUse: true }), 'author');
  service.decideClaim(first.id, { decision: 'approved', reason: '局部权利' }, 'rights');
  service.decideClaim(second.id, { decision: 'approved', reason: '局部权利' }, 'rights');
  const draft = newSet([item.revision.id]);
  assert.throws(() => publish(draft.set, true), /QUESTION_RIGHTS_DENIED/);
  const full = service.submitClaim(item.revision.id, claimInput(fullRights(true)), 'author');
  service.decideClaim(full.id, { decision: 'approved', reason: '完整权利' }, 'rights');
  const ready = publish(draft.set, true);
  assert.equal(ready.set.status, 'ready');
  assert.equal(canUseSet(db, draft.set.id, { territory: 'CN', commercial: true }), true);
  assert.equal(canUseSet(db, draft.set.id, { territory: 'CN' }), false);
  assert.equal(canUseSet(db, draft.set.id, { territory: 'CN', commercial: false }), false);
  service.revokeClaim(full.id, { reason: '作者撤回' }, 'rights');
  assert.equal(canUseSet(db, draft.set.id, { territory: 'CN', commercial: true }), false);
  assert.throws(() => db.prepare('UPDATE qb_set_items SET position=2 WHERE set_id=?').run(draft.set.id), /READY_SET_ITEMS_IMMUTABLE/);
  assert.throws(() => db.prepare("UPDATE qb_sets SET status='draft' WHERE id=?").run(draft.set.id), /READY_SET_IMMUTABLE/);
  const expiring = question();
  service.reviewContent(expiring.revision.id, { clientKey: uuid(), expectedLatestReviewId: null,
    decision: 'approved', reason: '内容核对通过' }, 'content');
  const expiringClaim = service.submitClaim(expiring.revision.id,
    claimInput(fullRights(), { validUntil: today() }), 'author');
  service.decideClaim(expiringClaim.id, { decision: 'approved', reason: '限期授权' }, 'rights');
  const next = newSet([expiring.revision.id]);
  publish(next.set);
  const tomorrow = new Date(`${today()}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  assert.equal(canUseSet(db, next.set.id, { ...context, at: tomorrow.toISOString().slice(0, 10) }), false);
});

test('set pins revision order and refuses two revisions of one logical question or media without delivery', () => {
  const a = question(), b = question();
  approveRevision(a.revision.id); approveRevision(b.revision.id);
  const secondA = service.createRevision(a.question.id, { clientKey: uuid(), expectedRevisionId: a.revision.id,
    content: single('B'), provenance: original(), media: [] }, 'author');
  const set = service.createSet({ clientKey: uuid(), title: '固定次序' }, 'editor');
  assert.throws(() => service.replaceSetItems(set.id, { expectedVersion: 1,
    revisionIds: [a.revision.id, secondA.revision.id] }), /DUPLICATE_LOGICAL_QUESTION/);
  const ordered = service.replaceSetItems(set.id, { expectedVersion: 1, revisionIds: [b.revision.id, a.revision.id] });
  assert.deepEqual(ordered.items.map(item => item.revisionId), [b.revision.id, a.revision.id]);
  const ready = publish(ordered.set);
  assert.deepEqual(ready.items.map(item => item.position), [1, 2]);
  assert.deepEqual(service.setDetail(set.id).items.map(item => item.revisionId), [b.revision.id, a.revision.id]);
  assert.throws(() => service.replaceSetItems(set.id, { expectedVersion: ready.set.version,
    revisionIds: [secondA.revision.id] }), /SET_ALREADY_READY/);
  const source = pdfFixture();
  const withMedia = question(single(), original(), [{ kind: 'image', sourceId: source.sourceId, pageNumber: 2, locator: '图1' }]);
  approveRevision(withMedia.revision.id);
  assert.equal(revisionReadiness(db, withMedia.revision.id, context).reason, 'MEDIA_DELIVERY_UNAVAILABLE');
});

test('changing an approved answer creates a new revision with no inherited reviews or rights', () => {
  const first = question(single('A'));
  approveRevision(first.revision.id);
  const changed = service.createRevision(first.question.id, { clientKey: uuid(), expectedRevisionId: first.revision.id,
    content: single('B'), provenance: original(), media: [] }, 'author');
  assert.equal(changed.revision.contentReviewStatus, 'pending');
  assert.equal(changed.revision.rightsStatus, 'unapproved');
  assert.deepEqual(changed.revision.contentReviews, []);
  assert.deepEqual(changed.revision.rightsClaims, []);
  assert.equal(revisionReadiness(db, first.revision.id, context).ready, true);
  assert.equal(revisionReadiness(db, changed.revision.id, context).ready, false);
  const draft = newSet([changed.revision.id]);
  assert.throws(() => publish(draft.set), /CONTENT_NOT_APPROVED/);
});

test('PDF source claims are isolated even when two sources share one published asset', () => {
  const a = pdfFixture(), b = pdfFixture(a.assetId, 'second-owner');
  const sourceClaimId = approveSource(a.sourceId);
  const aQuestion = question(single(), { kind: 'pdf', sourceId: a.sourceId, evidenceReference: '第 1 页' });
  approveRevision(aQuestion.revision.id, fullRights());
  const aSet = newSet([aQuestion.revision.id]);
  publish(aSet.set);
  assert.equal(db.prepare('SELECT publish_status FROM question_pdf_assets WHERE id=?').pluck().get(a.assetId), 'published');
  assert.equal(canUseSet(db, aSet.set.id, context), true);
  const bQuestion = question(single(), { kind: 'pdf', sourceId: b.sourceId, evidenceReference: '第 1 页' });
  approveRevision(bQuestion.revision.id, fullRights());
  assert.equal(canUseRevision(db, bQuestion.revision.id, context), false);
  const bSet = newSet([bQuestion.revision.id]);
  assert.throws(() => publish(bSet.set), /SOURCE_USE_DENIED/);
  db.prepare("UPDATE question_asset_right_claims SET status='revoked' WHERE id=?").run(sourceClaimId);
  assert.equal(canUseSet(db, aSet.set.id, context), false);
});

test('admin routes use live permissions and private no-store responses', async () => {
  const server = runtime.trackServer(app.listen(0, '127.0.0.1'));
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/admin/api/v4/question-bank`;
  const id = 82001, username = `bank-${id}`;
  db.prepare(`INSERT INTO admin_accounts(id,username,password_hash,role,permissions,is_active)
    VALUES (?,?,'test-only','operator',?,1)`).run(id, username, JSON.stringify(['questionBankEdit']));
  const token = jwt.sign({ role: 'admin', id, sub: username, permissions: ['questionBankEdit'] }, process.env.JWT_SECRET);
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  assert.equal((await fetch(`${base}/questions`)).status, 401);
  const response = await fetch(`${base}/questions`, { headers });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.ok(!JSON.stringify(await response.json()).includes('storage_key'));
  assert.equal((await fetch(`${base}/sets/1/publish`, { method: 'POST', headers, body: '{}' })).status, 403);
  db.prepare('UPDATE admin_accounts SET permissions=? WHERE id=?').run('[]', id);
  assert.equal((await fetch(`${base}/questions`, { headers })).status, 403);
  assert.equal((await fetch(`${base.replace('/admin/api/', '/api/')}/questions`, { headers })).status, 404);
});
