'use strict';
const runtime = require('./helpers/isolatedTestRuntime.cjs');
runtime.install();
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const db = runtime.prepare();
const { app } = require('../server');
const { createQuestionAssetGovernance } = require('../services/questionAssetGovernance');
const rights = require('../services/questionAssetRights');
const service = createQuestionAssetGovernance(db);
runtime.registerCleanup(test);
let server, base, serial = 0;

test.before(async () => {
  server = runtime.trackServer(app.listen(0, '127.0.0.1'));
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

const token = (id, permissions) => {
  const username = `governance-${id}`;
  db.prepare(`INSERT INTO admin_accounts(id,username,password_hash,role,permissions,is_active)
    VALUES (?,?,'test-only','operator',?,1)
    ON CONFLICT(id) DO UPDATE SET permissions=excluded.permissions,is_active=1`).run(id, username, JSON.stringify(permissions));
  return jwt.sign({ role: 'admin', id, sub: username, permissions }, process.env.JWT_SECRET);
};
const url = suffix => `${base}/admin/api/v4/question-asset-governance${suffix}`;
const get = (suffix, id, permissions) => fetch(url(suffix), { headers: { Authorization: `Bearer ${token(id, permissions)}` } });
const post = (suffix, body, id, permissions) => fetch(url(suffix), { method: 'POST',
  headers: { Authorization: `Bearer ${token(id, permissions)}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body) });
const data = async response => (await response.json()).data;
const claimInput = (overrides = {}) => ({ clientKey: crypto.randomUUID(), evidenceReference: '采购清单仅作为待核验证据',
  rights: { internalStorage: true }, territories: ['CN'], validFrom: '2020-01-01', validUntil: '2099-12-31', ...overrides });
const fixture = (assetId = null) => {
  serial++;
  const batchId = db.prepare('INSERT INTO question_asset_batches(label,client_key,created_by) VALUES (?,?,?)')
    .run(`governance-${serial}`, crypto.randomUUID(), '100').lastInsertRowid;
  if (!assetId) {
    const sha = crypto.createHash('sha256').update(`governance-${serial}`).digest('hex');
    assetId = db.prepare('INSERT INTO question_pdf_assets(sha256,byte_size,storage_key) VALUES (?,?,?)')
      .run(sha, 100, `${sha.slice(0, 2)}/${sha}.pdf`).lastInsertRowid;
  }
  const sourceId = db.prepare(`INSERT INTO question_asset_sources
    (batch_id,client_key,source_type,source_reference,original_filename,asset_id,status,created_by)
    VALUES (?,?,?,?,?,?,'quarantined','100')`).run(batchId, crypto.randomUUID(), 'internal', '采购记录待核验', 'paper.pdf', assetId).lastInsertRowid;
  return { batchId, sourceId, assetId };
};
const approve = (sourceId, input, submitter = '101', reviewer = '102') => {
  const claim = service.submitClaim(sourceId, input, submitter);
  return service.decideClaim(claim.id, { decision: 'approved', reason: '已核对授权证据' }, reviewer);
};
const reviewInput = (sourceId, decision, reason, overrides = {}) => ({
  clientKey: crypto.randomUUID(),
  expectedLatestReviewId: db.prepare('SELECT id FROM question_asset_content_reviews WHERE source_id=? ORDER BY id DESC LIMIT 1')
    .pluck().get(sourceId) || null,
  decision, reason, ...overrides
});

test('governance routes require JWT and distinct write permissions, and never expose private storage keys', async () => {
  const source = fixture();
  assert.equal((await fetch(url('/sources'))).status, 401);
  assert.equal((await get('/sources', 11, ['questions'])).status, 403);
  const listed = await get(`/sources?limit=100&cursor=${source.sourceId - 1}`, 11, ['questionContentReview']);
  assert.equal(listed.status, 200);
  assert.equal(listed.headers.get('cache-control'), 'no-store');
  const rows = (await data(listed)).sources;
  assert.ok(rows.some(item => item.id === source.sourceId));
  assert.ok(!JSON.stringify(rows).includes('storage_key'));
  const detail = await get(`/sources/${source.sourceId}`, 11, ['questionRightsReview']);
  assert.equal(detail.status, 200);
  assert.equal((await data(detail)).effectiveRights.reason, 'TERRITORY_REQUIRED');
  assert.equal((await post(`/sources/${source.sourceId}/claims`, claimInput(), 11, ['questionRightsReview'])).status, 403);
  assert.equal((await post(`/sources/${source.sourceId}/content-reviews`, { decision: 'rejected', reason: '不合格' }, 11, ['questionAssets'])).status, 403);
  assert.equal((await get(`/sources/${source.sourceId}`, 11, ['questionAssets'])).status, 200);
  assert.equal((await fetch(`${base}/api/v4/question-asset-governance/sources/${source.sourceId}`)).status, 404);
});

test('disabled accounts and revoked governance permissions invalidate existing tokens immediately', async () => {
  const source = fixture();
  const rightsToken = token(121, ['questionRightsReview']);
  const endpoint = url(`/sources/${source.sourceId}`);
  const headers = { Authorization: `Bearer ${rightsToken}` };
  assert.equal((await fetch(endpoint, { headers })).status, 200);
  db.prepare('UPDATE admin_accounts SET permissions=? WHERE id=?').run(JSON.stringify(['questions']), 121);
  assert.equal((await fetch(endpoint, { headers })).status, 403);
  db.prepare('UPDATE admin_accounts SET permissions=? WHERE id=?').run(JSON.stringify(['questionRightsReview']), 121);
  db.prepare('UPDATE admin_accounts SET is_active=0 WHERE id=?').run(121);
  assert.equal((await fetch(endpoint, { headers })).status, 403);
  const claim = service.submitClaim(source.sourceId, claimInput(), '101');
  assert.equal((await fetch(url(`/claims/${claim.id}/decision`), { method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision: 'approved', reason: '无效旧令牌' }) })).status, 403);
});

test('purchase provenance creates no grant; reviewer separation and quarantine/scan gates hold', async () => {
  const source = fixture();
  const input = claimInput({ rights: { internalStorage: true, machineProcessing: true, stemDisplay: true } });
  const submitted = await post(`/sources/${source.sourceId}/claims`, input, 101, ['questionAssets']);
  assert.equal(submitted.status, 200);
  const claim = (await data(submitted)).claim;
  assert.equal(claim.status, 'pending');
  assert.equal(rights.hasSourceRight(db, source.sourceId, 'internalStorage', { territory: 'CN' }), false);
  assert.equal(rights.canUseSource(db, source.sourceId, 'machineProcessing', { territory: 'CN' }), false);
  assert.equal((await post(`/claims/${claim.id}/decision`, { decision: 'approved', reason: '自审' }, 101, ['questionRightsReview'])).status, 403);
  assert.equal((await post(`/claims/${claim.id}/decision`, { decision: 'approved', reason: '来源上传人自审' }, 100, ['questionRightsReview'])).status, 403);
  const approved = await post(`/claims/${claim.id}/decision`, { decision: 'approved', reason: '授权证据已核验' }, 102, ['questionRightsReview']);
  assert.equal(approved.status, 200);
  assert.equal((await data(approved)).claim.status, 'approved');
  assert.equal((await post(`/claims/${claim.id}/decision`, { decision: 'approved', reason: '授权证据已核验' }, 102, ['questionRightsReview'])).status, 200);
  assert.equal(rights.canUseSource(db, source.sourceId, 'internalStorage', { territory: 'CN' }), true);
  assert.equal(rights.canUseSource(db, source.sourceId, 'machineProcessing', { territory: 'CN' }), false);
  assert.equal((await post(`/sources/${source.sourceId}/content-reviews`, reviewInput(source.sourceId, 'approved', '内容核对'), 103, ['questionContentReview'])).status, 409);
  assert.equal(rights.canPublishSource(db, source.sourceId, { territory: 'CN' }), false);
  assert.throws(() => db.prepare("UPDATE question_pdf_assets SET publish_status='published' WHERE id=?").run(source.assetId), /CHECK constraint/);
});

test('local single review grants only machine processing after a clean scan and never in production', () => {
  const names = ['NODE_ENV', 'QUESTION_PDF_LOCAL_IMPORT_ENABLED', 'QUESTION_PDF_LOCAL_SINGLE_REVIEW_ENABLED'];
  const old = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    process.env.NODE_ENV = 'test';
    process.env.QUESTION_PDF_LOCAL_IMPORT_ENABLED = '1';
    delete process.env.QUESTION_PDF_LOCAL_SINGLE_REVIEW_ENABLED;
    const source = fixture();
    db.prepare("UPDATE question_pdf_assets SET validation_status='valid',scan_status='clean' WHERE id=?").run(source.assetId);
    const onlyProcessing = service.submitClaim(source.sourceId, claimInput({ rights: { machineProcessing: true } }), '100');
    assert.throws(() => service.decideClaim(onlyProcessing.id, { decision: 'approved', reason: 'local evidence' }, '100'), /SELF_REVIEW_DENIED/);
    process.env.QUESTION_PDF_LOCAL_SINGLE_REVIEW_ENABLED = '1';
    assert.equal(service.detail(source.sourceId, { territory: 'CN' }).localSingleReviewEnabled, true);
    const approved = service.decideClaim(onlyProcessing.id, { decision: 'approved', reason: '本地识题证据已核对' }, '100');
    assert.equal(approved.status, 'approved');
    assert.equal(rights.canUseSource(db, source.sourceId, 'machineProcessing', { territory: 'CN', commercial: false }), true);
    assert.equal(rights.hasSourceRight(db, source.sourceId, 'stemDisplay', { territory: 'CN', commercial: false }), false);
    const audit = db.prepare("SELECT detail FROM question_asset_audit WHERE source_id=? AND action='rights_claim_approved' ORDER BY id DESC LIMIT 1").get(source.sourceId);
    assert.equal(JSON.parse(audit.detail).localSingleReview, true);
    const mixed = service.submitClaim(source.sourceId, claimInput({ rights: { machineProcessing: true, stemDisplay: true } }), '100');
    assert.throws(() => service.decideClaim(mixed.id, { decision: 'approved', reason: '不允许同时展示' }, '100'), /SELF_REVIEW_DENIED/);
    const unsafe = fixture();
    const pending = service.submitClaim(unsafe.sourceId, claimInput({ rights: { machineProcessing: true } }), '100');
    assert.throws(() => service.decideClaim(pending.id, { decision: 'approved', reason: '未扫描' }, '100'), /SELF_REVIEW_DENIED/);
    process.env.NODE_ENV = 'production';
    assert.equal(service.detail(source.sourceId, { territory: 'CN' }).localSingleReviewEnabled, false);
    assert.throws(() => service.decideClaim(mixed.id, { decision: 'approved', reason: '生产不可自审' }, '100'), /SELF_REVIEW_DENIED/);
  } finally {
    for (const name of names) { if (old[name] === undefined) delete process.env[name]; else process.env[name] = old[name]; }
  }
});

test('rights stay bound to one source, one claim, one territory and an inclusive Shanghai date', async () => {
  const source = fixture();
  const sibling = fixture(source.assetId);
  approve(source.sourceId, claimInput({ rights: { machineProcessing: true, stemDisplay: true }, validFrom: '2026-10-21', validUntil: '2026-10-22' }));
  approve(source.sourceId, claimInput({ rights: { commercialUse: true }, validFrom: '2026-10-21', validUntil: '2026-10-22' }), '104', '105');
  assert.equal(rights.hasSourceRight(db, source.sourceId, 'stemDisplay', { territory: 'CN', commercial: true, at: '2026-10-22' }), false);
  assert.equal(rights.hasSourceRight(db, source.sourceId, 'stemDisplay', { territory: 'US', commercial: false, at: '2026-10-22' }), false);
  assert.equal(rights.hasSourceRight(db, source.sourceId, 'stemDisplay', { territory: 'CN', commercial: false, at: '2026-10-22' }), true);
  assert.equal(rights.hasSourceRight(db, source.sourceId, 'stemDisplay', { territory: 'CN', commercial: false, at: '2026-10-23' }), false);
  assert.equal(rights.hasSourceRight(db, sibling.sourceId, 'stemDisplay', { territory: 'CN', commercial: false, at: '2026-10-22' }), false);
  assert.equal(rights.hasSourceRight(db, source.sourceId, 'stemDisplay', { territory: 'CN', at: '2026-10-22' }), false);
  const effective = rights.effectiveRights(db, source.sourceId, { territory: 'CN', at: '2026-10-22' });
  assert.equal(effective.rights.stemDisplay, true);
  assert.equal(effective.rights.commercialUse, true);
  assert.equal(effective.coverage.freeStemDisplay, true);
  assert.equal(effective.coverage.commercialStemDisplay, false);
  assert.equal(rights.shanghaiDate(new Date('2026-10-21T15:59:59Z')), '2026-10-21');
  assert.equal(rights.shanghaiDate(new Date('2026-10-21T16:00:00Z')), '2026-10-22');
  assert.throws(() => rights.isoDate('2026-02-30'), /INVALID_RIGHTS_DATE/);
  assert.throws(() => rights.hasSourceRight(db, source.sourceId, 'stemDisplay', { territory: '', commercial: false }), /TERRITORY_REQUIRED/);
});

test('approved reviewed content still needs clean validation; image and commercial uses are separate', async () => {
  const source = fixture();
  const claim = approve(source.sourceId, claimInput({ rights: { machineProcessing: true, stemDisplay: true } }));
  db.prepare("UPDATE question_pdf_assets SET validation_status='valid',scan_status='clean' WHERE id=?").run(source.assetId);
  assert.equal((await post(`/sources/${source.sourceId}/content-reviews`, reviewInput(source.sourceId, 'approved', '上传人自审'), 100, ['questionContentReview'])).status, 403);
  assert.equal((await post(`/sources/${source.sourceId}/content-reviews`, reviewInput(source.sourceId, 'approved', '声明人自审'), 101, ['questionContentReview'])).status, 403);
  const approvedInput = reviewInput(source.sourceId, 'approved', '已逐页核验原件');
  const reviewed = await post(`/sources/${source.sourceId}/content-reviews`, approvedInput, 103, ['questionContentReview']);
  assert.equal(reviewed.status, 200);
  assert.equal((await post(`/sources/${source.sourceId}/content-reviews`, approvedInput, 103, ['questionContentReview'])).status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) FROM question_asset_content_reviews WHERE source_id=?').pluck().get(source.sourceId), 1);
  assert.equal(rights.canPublishSource(db, source.sourceId, { territory: 'CN' }), false);
  assert.equal(rights.canPublishSource(db, source.sourceId, { territory: 'CN', commercial: false }), true);
  assert.equal(rights.canPublishSource(db, source.sourceId, { territory: 'CN', commercial: true }), false);
  db.prepare("UPDATE question_pdf_assets SET publish_status='published' WHERE id=?").run(source.assetId);
  assert.equal(rights.canUseSource(db, source.sourceId, 'stemDisplay', { territory: 'CN' }), false);
  assert.equal(rights.canUseSource(db, source.sourceId, 'stemDisplay', { territory: 'CN', commercial: false }), true);
  assert.equal(rights.canUseSource(db, source.sourceId, 'imageDisplay', { territory: 'CN', commercial: false }), false);
  assert.equal(rights.canUseSource(db, source.sourceId, 'stemDisplay', { territory: 'CN', commercial: true }), false);
  assert.equal(rights.canUseSource(db, source.sourceId, 'stemDisplay', { territory: 'CN', commercial: false, at: '2100-01-01' }), false);
  const revoked = await post(`/claims/${claim.id}/revoke`, { reason: '投诉撤回授权' }, 102, ['questionRightsReview']);
  assert.equal(revoked.status, 200);
  assert.equal((await post(`/claims/${claim.id}/revoke`, { reason: '投诉撤回授权' }, 102, ['questionRightsReview'])).status, 200);
  assert.equal(rights.canUseSource(db, source.sourceId, 'stemDisplay', { territory: 'CN', commercial: false }), false);
  assert.equal(db.prepare('SELECT publish_status FROM question_pdf_assets WHERE id=?').pluck().get(source.assetId), 'blocked');
});

test('future effective grants use live source rights; non-storage actions require explicit commercial context', () => {
  const source = fixture();
  const today = rights.shanghaiDate(new Date());
  const tomorrow = new Date(`${today}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const firstDay = tomorrow.toISOString().slice(0, 10);
  approve(source.sourceId, claimInput({ validFrom: firstDay,
    rights: { machineProcessing: true, thirdPartyProcessing: true, stemDisplay: true, adaptation: true } }));
  db.prepare("UPDATE question_pdf_assets SET validation_status='valid',scan_status='clean' WHERE id=?").run(source.assetId);
  service.reviewContent(source.sourceId, reviewInput(source.sourceId, 'approved', '元数据与原件已完成复核'), '103');
  assert.equal(rights.canPublishSource(db, source.sourceId, { territory: 'CN', commercial: false, at: today }), false);
  assert.equal(rights.canPublishSource(db, source.sourceId, { territory: 'CN', commercial: false, at: firstDay }), true);
  db.prepare("UPDATE question_pdf_assets SET processing_right=0,display_right=0 WHERE id=?").run(source.assetId);
  assert.equal(rights.canUseSource(db, source.sourceId, 'machineProcessing', { territory: 'CN', commercial: false, at: firstDay }), true);
  for (const operation of ['machineProcessing', 'thirdPartyProcessing', 'stemDisplay', 'adaptation']) {
    assert.equal(rights.hasSourceRight(db, source.sourceId, operation, { territory: 'CN', at: firstDay }), false);
    assert.equal(rights.canUseSource(db, source.sourceId, operation, { territory: 'CN', at: firstDay }), false);
  }
  assert.equal(rights.canUseSource(db, source.sourceId, 'internalStorage', { territory: 'CN', at: firstDay }), false);
});

test('latest content rejection blocks a previously approved source immediately', () => {
  const source = fixture();
  approve(source.sourceId, claimInput({ rights: { machineProcessing: true, stemDisplay: true } }));
  db.prepare("UPDATE question_pdf_assets SET validation_status='valid',scan_status='clean' WHERE id=?").run(source.assetId);
  service.reviewContent(source.sourceId, reviewInput(source.sourceId, 'approved', '复核通过'), '103');
  db.prepare("UPDATE question_pdf_assets SET publish_status='published' WHERE id=?").run(source.assetId);
  service.reviewContent(source.sourceId, reviewInput(source.sourceId, 'rejected', '发现答案错误'), '103');
  assert.equal(rights.canUseSource(db, source.sourceId, 'stemDisplay', { territory: 'CN', commercial: false }), false);
  assert.equal(db.prepare('SELECT publish_status FROM question_pdf_assets WHERE id=?').pluck().get(source.assetId), 'blocked');
  assert.deepEqual(db.prepare("SELECT action FROM question_asset_audit WHERE source_id=? AND action LIKE 'content_%' ORDER BY id").all(source.sourceId).map(row => row.action),
    ['content_approved', 'content_rejected']);
});

test('lost content approval response cannot overwrite a later rejection on retry', async () => {
  const source = fixture();
  approve(source.sourceId, claimInput({ rights: { stemDisplay: true } }));
  db.prepare("UPDATE question_pdf_assets SET validation_status='valid',scan_status='clean' WHERE id=?").run(source.assetId);
  const approval = reviewInput(source.sourceId, 'approved', '首次审核通过');
  const first = await data(await post(`/sources/${source.sourceId}/content-reviews`, approval, 103, ['questionContentReview']));
  const stalePage = reviewInput(source.sourceId, 'approved', '旧页面再次提交', { expectedLatestReviewId: null });
  const rejection = reviewInput(source.sourceId, 'rejected', '发现内容错误');
  const second = await data(await post(`/sources/${source.sourceId}/content-reviews`, rejection, 104, ['questionContentReview']));
  assert.ok(second.contentReview.id > first.contentReview.id);
  const retry = await data(await post(`/sources/${source.sourceId}/content-reviews`, approval, 103, ['questionContentReview']));
  assert.equal(retry.contentReview.id, first.contentReview.id);
  assert.equal(rights.currentContentReview(db, source.sourceId), 'rejected');
  assert.equal(db.prepare('SELECT COUNT(*) FROM question_asset_content_reviews WHERE source_id=?').pluck().get(source.sourceId), 2);
  const stale = await post(`/sources/${source.sourceId}/content-reviews`, stalePage, 103, ['questionContentReview']);
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).code, 'CONTENT_REVIEW_STALE');
  const reusedKey = await post(`/sources/${source.sourceId}/content-reviews`, { ...approval, decision: 'rejected' }, 103, ['questionContentReview']);
  assert.equal(reusedKey.status, 409);
  assert.equal((await reusedKey.json()).code, 'CLIENT_KEY_CONFLICT');
});

test('governance audit histories remain pageable past the detail preview', async () => {
  const source = fixture();
  const claimInsert = db.prepare(`INSERT INTO question_asset_right_claims
    (source_id,client_key,evidence_reference,rights_json,territories_json,valid_from,valid_until,submitted_by)
    VALUES (?,?,?,?,?,?,?,?)`);
  const reviewInsert = db.prepare('INSERT INTO question_asset_content_reviews(source_id,client_key,decision,reason,reviewer) VALUES (?,?,?,?,?)');
  db.transaction(() => {
    for (let i = 0; i < 105; i++) {
      claimInsert.run(source.sourceId, `history-${i}`, `evidence-${i}`, JSON.stringify({ internalStorage: true }), '["CN"]', '2020-01-01', '2099-12-31', '101');
      reviewInsert.run(source.sourceId, `review-history-${i}`, 'rejected', `reason-${i}`, '103');
    }
  })();
  const firstClaims = await data(await get(`/sources/${source.sourceId}/claims?limit=60`, 102, ['questionRightsReview']));
  const secondClaims = await data(await get(`/sources/${source.sourceId}/claims?limit=60&cursor=${firstClaims.nextCursor}`, 102, ['questionRightsReview']));
  assert.deepEqual([firstClaims.items.length, secondClaims.items.length, firstClaims.total, secondClaims.nextCursor], [60, 45, 105, null]);
  const firstReviews = await data(await get(`/sources/${source.sourceId}/content-reviews?limit=60`, 103, ['questionContentReview']));
  const secondReviews = await data(await get(`/sources/${source.sourceId}/content-reviews?limit=60&cursor=${firstReviews.nextCursor}`, 103, ['questionContentReview']));
  assert.deepEqual([firstReviews.items.length, secondReviews.items.length, firstReviews.total, secondReviews.nextCursor], [60, 45, 105, null]);
  const preview = await data(await get(`/sources/${source.sourceId}`, 102, ['questionRightsReview']));
  assert.equal(preview.claims.length, 100);
  assert.equal(preview.claimsTotal, 105);
  assert.equal((await get(`/sources/${source.sourceId}/claims?cursor=0`, 102, ['questionRightsReview'])).status, 400);
});
