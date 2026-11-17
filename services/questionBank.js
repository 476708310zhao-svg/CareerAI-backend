'use strict';
const assetRights = require('./questionAssetRights');
const bankRights = require('./questionBankRights');
const problem = assetRights.problem;
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const keys = (value, expected, code) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key => !expected.includes(key))) throw problem(code);
};
const requiredText = (value, max, code) => {
  const result = typeof value === 'string' ? value.trim() : '';
  if (!result || result.length > max) throw problem(code);
  return result;
};
const idOf = value => {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw problem('INVALID_ID');
  return id;
};
const expectedId = (value, code) => value === null ? null :
  (Number.isSafeInteger(value) && value > 0 ? value : (() => { throw problem(code); })());
const pageOf = value => {
  const cursor = value.cursor === undefined ? 0 : Number(value.cursor);
  const limit = value.limit === undefined ? 30 : Number(value.limit);
  if (!Number.isSafeInteger(cursor) || cursor < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw problem('INVALID_PAGINATION');
  return { cursor, limit };
};

function normalizeContent(value) {
  keys(value, ['type', 'stem', 'options', 'answer', 'explanation'], 'INVALID_CONTENT');
  const type = value.type;
  if (!['single', 'multiple', 'boolean'].includes(type)) throw problem('INVALID_QUESTION_TYPE');
  const stem = requiredText(value.stem, 5000, 'INVALID_STEM');
  const explanation = requiredText(value.explanation, 5000, 'INVALID_EXPLANATION');
  if (type === 'boolean') {
    if (own(value, 'options') || typeof value.answer !== 'boolean') throw problem('INVALID_BOOLEAN_ANSWER');
    return { type, stem, answer: value.answer, explanation };
  }
  if (!Array.isArray(value.options) || value.options.length < 2 || value.options.length > 8) throw problem('INVALID_OPTIONS');
  const options = value.options.map(option => {
    keys(option, ['id', 'text'], 'INVALID_OPTION');
    if (typeof option.id !== 'string' || !/^[A-H]$/.test(option.id)) throw problem('INVALID_OPTION_ID');
    return { id: option.id, text: requiredText(option.text, 2000, 'INVALID_OPTION_TEXT') };
  });
  const ids = options.map(option => option.id);
  if (new Set(ids).size !== ids.length) throw problem('DUPLICATE_OPTION_ID');
  if (!Array.isArray(value.answer) || value.answer.length !== new Set(value.answer).size ||
      value.answer.some(answer => typeof answer !== 'string' || !ids.includes(answer)) ||
      value.answer.length < (type === 'multiple' ? 2 : 1) ||
      (type === 'single' && value.answer.length !== 1)) throw problem('INVALID_ANSWER');
  return { type, stem, options, answer: [...value.answer].sort(), explanation };
}

function normalizeProvenance(value, db) {
  keys(value, ['kind', 'authorName', 'ownershipEvidence', 'sourceId', 'evidenceReference'], 'INVALID_PROVENANCE');
  if (value.kind === 'original') {
    if (own(value, 'sourceId') || own(value, 'evidenceReference')) throw problem('INVALID_PROVENANCE');
    return { kind: 'original', authorName: requiredText(value.authorName, 200, 'AUTHOR_REQUIRED'),
      ownershipEvidence: requiredText(value.ownershipEvidence, 500, 'OWNERSHIP_EVIDENCE_REQUIRED') };
  }
  if (value.kind === 'pdf') {
    if (own(value, 'authorName') || own(value, 'ownershipEvidence')) throw problem('INVALID_PROVENANCE');
    const sourceId = idOf(value.sourceId);
    if (!db.prepare('SELECT 1 FROM question_asset_sources WHERE id=?').get(sourceId)) throw problem('SOURCE_NOT_FOUND', 404);
    return { kind: 'pdf', sourceId, evidenceReference: requiredText(value.evidenceReference, 500, 'SOURCE_EVIDENCE_REQUIRED') };
  }
  throw problem('INVALID_PROVENANCE');
}

function normalizeMedia(value, db) {
  if (!Array.isArray(value) || value.length > 10) throw problem('INVALID_MEDIA');
  return value.map(item => {
    keys(item, ['kind', 'sourceId', 'pageNumber', 'locator'], 'INVALID_MEDIA');
    if (item.kind !== 'image' || !Number.isSafeInteger(item.pageNumber) || item.pageNumber < 1) throw problem('INVALID_MEDIA');
    const sourceId = idOf(item.sourceId);
    if (!db.prepare('SELECT 1 FROM question_asset_sources WHERE id=?').get(sourceId)) throw problem('SOURCE_NOT_FOUND', 404);
    return { kind: 'image', sourceId, pageNumber: item.pageNumber,
      locator: requiredText(item.locator, 500, 'INVALID_MEDIA_LOCATOR') };
  });
}

const questionView = row => ({ id: row.id, latestRevisionId: row.latest_revision_id || null,
  revisionCount: row.revision_count || 0, createdBy: row.created_by, createdAt: row.created_at });
const claimView = row => ({ id: row.id, revisionId: row.revision_id, clientKey: row.client_key,
  evidenceReference: row.evidence_reference, rights: JSON.parse(row.rights_json),
  territories: JSON.parse(row.territories_json), validFrom: row.valid_from, validUntil: row.valid_until,
  status: row.status, submittedBy: row.submitted_by, decidedBy: row.decided_by,
  decisionReason: row.decision_reason, decidedAt: row.decided_at, revokedBy: row.revoked_by,
  revocationReason: row.revocation_reason, revokedAt: row.revoked_at, createdAt: row.created_at });
const reviewView = row => ({ id: row.id, revisionId: row.revision_id, clientKey: row.client_key,
  expectedLatestReviewId: row.expected_latest_review_id, decision: row.decision, reason: row.reason,
  reviewer: row.reviewer, createdAt: row.created_at });
const setView = row => ({ id: row.id, title: row.title, status: row.status, version: row.version,
  publishTerritory: row.publish_territory, publishCommercial: row.publish_commercial === null ? null : Boolean(row.publish_commercial),
  publishedBy: row.published_by, publishedAt: row.published_at, createdBy: row.created_by, createdAt: row.created_at });

function createQuestionBank(db) {
  const question = id => {
    const row = db.prepare('SELECT * FROM qb_questions WHERE id=?').get(idOf(id));
    if (!row) throw problem('QUESTION_NOT_FOUND', 404);
    return row;
  };
  const revision = id => {
    const row = db.prepare('SELECT * FROM qb_revisions WHERE id=?').get(idOf(id));
    if (!row) throw problem('REVISION_NOT_FOUND', 404);
    return row;
  };
  const claim = id => {
    const row = db.prepare('SELECT * FROM qb_right_claims WHERE id=?').get(idOf(id));
    if (!row) throw problem('CLAIM_NOT_FOUND', 404);
    return row;
  };
  const setRow = id => {
    const row = db.prepare('SELECT * FROM qb_sets WHERE id=?').get(idOf(id));
    if (!row) throw problem('SET_NOT_FOUND', 404);
    return row;
  };
  const latestRevision = questionId => db.prepare('SELECT * FROM qb_revisions WHERE question_id=? ORDER BY revision_no DESC LIMIT 1').get(questionId);
  const revisionView = (row, history = false) => {
    const contentReviews = db.prepare('SELECT * FROM qb_content_reviews WHERE revision_id=? ORDER BY id DESC').all(row.id).map(reviewView);
    const rightsClaims = db.prepare('SELECT * FROM qb_right_claims WHERE revision_id=? ORDER BY id DESC').all(row.id).map(claimView);
    const result = { id: row.id, questionId: row.question_id, revisionNo: row.revision_no,
      content: JSON.parse(row.content_json), provenance: JSON.parse(row.provenance_json), media: JSON.parse(row.media_json),
      createdBy: row.created_by, createdAt: row.created_at,
      contentReviewStatus: contentReviews[0]?.decision || 'pending',
      rightsStatus: rightsClaims.some(item => item.status === 'approved') ? 'approved' :
        rightsClaims.some(item => item.status === 'pending') ? 'pending' : 'unapproved' };
    if (history) Object.assign(result, { contentReviews, rightsClaims });
    return result;
  };
  const setItems = setId => db.prepare(`SELECT item.position,item.revision_id,revision.question_id,revision.revision_no,revision.content_json
    FROM qb_set_items item JOIN qb_revisions revision ON revision.id=item.revision_id
    WHERE item.set_id=? ORDER BY item.position`).all(setId).map(row => {
    const content = JSON.parse(row.content_json);
    return { position: row.position, revisionId: row.revision_id, questionId: row.question_id,
      revisionNo: row.revision_no, type: content.type, stem: content.stem };
  });
  const setDetail = id => ({ set: setView(setRow(id)), items: setItems(idOf(id)) });
  const saveRevision = (questionId, revisionNo, parentId, clientKey, content, provenance, media, actor) => {
    const result = db.prepare(`INSERT INTO qb_revisions(question_id,revision_no,expected_revision_id,client_key,content_json,provenance_json,media_json,created_by)
      VALUES (?,?,?,?,?,?,?,?)`).run(questionId, revisionNo, parentId, clientKey, JSON.stringify(content), JSON.stringify(provenance), JSON.stringify(media), actor);
    return revision(result.lastInsertRowid);
  };
  const normalizedRevision = input => {
    const content = normalizeContent(input.content), provenance = normalizeProvenance(input.provenance, db);
    const media = normalizeMedia(input.media, db);
    return { content, provenance, media };
  };
  const sameRevision = (row, normalized) => row.content_json === JSON.stringify(normalized.content) &&
    row.provenance_json === JSON.stringify(normalized.provenance) && row.media_json === JSON.stringify(normalized.media);
  const involvedSubmitters = item => {
    const actors = new Set([item.created_by]);
    const owner = question(item.question_id);
    actors.add(owner.created_by);
    for (const row of db.prepare('SELECT submitted_by FROM qb_right_claims WHERE revision_id=?').all(item.id)) actors.add(row.submitted_by);
    const provenance = JSON.parse(item.provenance_json), media = JSON.parse(item.media_json);
    const sourceIds = [...new Set([...(provenance.kind === 'pdf' ? [provenance.sourceId] : []), ...media.map(part => part.sourceId)])];
    for (const sourceId of sourceIds) {
      const source = db.prepare('SELECT created_by FROM question_asset_sources WHERE id=?').get(sourceId);
      if (source) actors.add(source.created_by);
      for (const row of db.prepare('SELECT submitted_by FROM question_asset_right_claims WHERE source_id=?').all(sourceId)) actors.add(row.submitted_by);
    }
    return actors;
  };
  return {
    listQuestions(options = {}) {
      const { cursor, limit } = pageOf(options);
      const rows = db.prepare(`SELECT q.*, (SELECT id FROM qb_revisions WHERE question_id=q.id ORDER BY revision_no DESC LIMIT 1) latest_revision_id,
        (SELECT COUNT(*) FROM qb_revisions WHERE question_id=q.id) revision_count FROM qb_questions q WHERE q.id>? ORDER BY q.id LIMIT ?`).all(cursor, limit + 1);
      const questions = rows.slice(0, limit).map(questionView);
      return { questions, total: db.prepare('SELECT COUNT(*) FROM qb_questions').pluck().get(),
        nextCursor: rows.length > limit ? questions.at(-1).id : null };
    },
    questionDetail(questionId) {
      const row = question(questionId), revisions = db.prepare('SELECT * FROM qb_revisions WHERE question_id=? ORDER BY revision_no DESC').all(row.id);
      return { question: questionView({ ...row, latest_revision_id: revisions[0]?.id, revision_count: revisions.length }),
        revisions: revisions.map(item => revisionView(item, true)) };
    },
    createQuestion(input, actor) {
      keys(input, ['clientKey','content','provenance','media'], 'INVALID_QUESTION_REQUEST');
      const clientKey = requiredText(input.clientKey, 100, 'INVALID_CLIENT_KEY');
      if (!own(input, 'media')) throw problem('INVALID_MEDIA');
      const normalized = normalizedRevision(input);
      return db.transaction(() => {
        const existing = db.prepare('SELECT * FROM qb_questions WHERE created_by=? AND client_key=?').get(actor, clientKey);
        if (existing) {
          const old = db.prepare('SELECT * FROM qb_revisions WHERE question_id=? AND revision_no=1').get(existing.id);
          if (!old || !sameRevision(old, normalized)) throw problem('CLIENT_KEY_CONFLICT', 409);
          return { question: this.questionDetail(existing.id).question, revision: revisionView(old, true) };
        }
        const id = db.prepare('INSERT INTO qb_questions(client_key,created_by) VALUES (?,?)').run(clientKey, actor).lastInsertRowid;
        const saved = saveRevision(id, 1, null, clientKey, normalized.content, normalized.provenance, normalized.media, actor);
        return { question: questionView({ ...question(id), latest_revision_id: saved.id, revision_count: 1 }), revision: revisionView(saved, true) };
      })();
    },
    createRevision(questionId, input, actor) {
      keys(input, ['clientKey','expectedRevisionId','content','provenance','media'], 'INVALID_REVISION_REQUEST');
      const clientKey = requiredText(input.clientKey, 100, 'INVALID_CLIENT_KEY');
      const expectedRevisionId = idOf(input.expectedRevisionId);
      const normalized = normalizedRevision(input);
      return db.transaction(() => {
        const record = question(questionId);
        const existing = db.prepare('SELECT * FROM qb_revisions WHERE question_id=? AND client_key=?').get(record.id, clientKey);
        if (existing) {
          if (!sameRevision(existing, normalized) || existing.created_by !== actor ||
              existing.expected_revision_id !== expectedRevisionId) throw problem('CLIENT_KEY_CONFLICT', 409);
          return { question: this.questionDetail(record.id).question, revision: revisionView(existing, true) };
        }
        const latest = latestRevision(record.id);
        if (!latest || latest.id !== expectedRevisionId) throw problem('REVISION_VERSION_CONFLICT', 409);
        const saved = saveRevision(record.id, latest.revision_no + 1, latest.id, clientKey, normalized.content, normalized.provenance, normalized.media, actor);
        return { question: this.questionDetail(record.id).question, revision: revisionView(saved, true) };
      })();
    },
    reviewContent(revisionId, input, actor) {
      keys(input, ['clientKey','expectedLatestReviewId','decision','reason'], 'INVALID_CONTENT_REVIEW_REQUEST');
      const clientKey = requiredText(input.clientKey, 100, 'INVALID_CLIENT_KEY');
      const expectedLatestReviewId = expectedId(input.expectedLatestReviewId, 'INVALID_CONTENT_REVIEW_VERSION');
      if (!own(input, 'expectedLatestReviewId')) throw problem('CONTENT_REVIEW_VERSION_REQUIRED');
      if (!['approved','rejected'].includes(input.decision)) throw problem('INVALID_DECISION');
      const reason = requiredText(input.reason, 500, 'REVIEW_REASON_REQUIRED');
      return db.transaction(() => {
        const item = revision(revisionId);
        const existing = db.prepare('SELECT * FROM qb_content_reviews WHERE revision_id=? AND client_key=?').get(item.id, clientKey);
        if (existing) {
          if (existing.expected_latest_review_id !== expectedLatestReviewId || existing.decision !== input.decision ||
              existing.reason !== reason || existing.reviewer !== actor) throw problem('CLIENT_KEY_CONFLICT', 409);
          return reviewView(existing);
        }
        const latest = bankRights.currentContentReview(db, item.id);
        if ((latest?.id || null) !== expectedLatestReviewId) throw problem('CONTENT_REVIEW_VERSION_CONFLICT', 409);
        if (involvedSubmitters(item).has(actor)) throw problem('SELF_REVIEW_DENIED', 403);
        const provenance = JSON.parse(item.provenance_json);
        if (input.decision === 'approved' && provenance.kind === 'pdf') {
          const source = db.prepare(`SELECT source.created_by,source.status,asset.validation_status,asset.scan_status
            FROM question_asset_sources source LEFT JOIN question_pdf_assets asset ON asset.id=source.asset_id WHERE source.id=?`).get(provenance.sourceId);
          if (!source || source.status !== 'quarantined' || source.validation_status !== 'valid' || source.scan_status !== 'clean')
            throw problem('SOURCE_NOT_VALIDATED', 409);
        }
        const id = db.prepare(`INSERT INTO qb_content_reviews(revision_id,client_key,expected_latest_review_id,decision,reason,reviewer)
          VALUES (?,?,?,?,?,?)`).run(item.id, clientKey, expectedLatestReviewId, input.decision, reason, actor).lastInsertRowid;
        return reviewView(db.prepare('SELECT * FROM qb_content_reviews WHERE id=?').get(id));
      })();
    },
    submitClaim(revisionId, input, actor) {
      keys(input, ['clientKey','evidenceReference','rights','territories','validFrom','validUntil'], 'INVALID_CLAIM_REQUEST');
      const clientKey = requiredText(input.clientKey, 100, 'INVALID_CLIENT_KEY');
      const evidenceReference = requiredText(input.evidenceReference, 500, 'INVALID_EVIDENCE_REFERENCE');
      keys(input.rights, bankRights.QUESTION_RIGHT_KEYS, 'INVALID_RIGHTS');
      const rights = Object.fromEntries(bankRights.QUESTION_RIGHT_KEYS.map(key => [key, input.rights[key] === true]));
      if (Object.entries(input.rights).some(([,value]) => typeof value !== 'boolean') || !Object.values(rights).some(Boolean)) throw problem('INVALID_RIGHTS');
      const territories = assetRights.normalizeTerritories(input.territories);
      const validFrom = assetRights.isoDate(input.validFrom), validUntil = assetRights.isoDate(input.validUntil);
      if (validFrom > validUntil) throw problem('INVALID_RIGHTS_PERIOD');
      const rightsJson = JSON.stringify(rights), territoriesJson = JSON.stringify(territories);
      return db.transaction(() => {
        const item = revision(revisionId);
        const existing = db.prepare('SELECT * FROM qb_right_claims WHERE revision_id=? AND client_key=?').get(item.id, clientKey);
        if (existing) {
          if (existing.evidence_reference !== evidenceReference || existing.rights_json !== rightsJson ||
              existing.territories_json !== territoriesJson || existing.valid_from !== validFrom || existing.valid_until !== validUntil ||
              existing.submitted_by !== actor) throw problem('CLIENT_KEY_CONFLICT', 409);
          return claimView(existing);
        }
        const currentReview = bankRights.currentContentReview(db, item.id);
        if (currentReview?.decision === 'approved' && currentReview.reviewer === actor) throw problem('SELF_REVIEW_DENIED', 403);
        const id = db.prepare(`INSERT INTO qb_right_claims
          (revision_id,client_key,evidence_reference,rights_json,territories_json,valid_from,valid_until,submitted_by)
          VALUES (?,?,?,?,?,?,?,?)`).run(item.id, clientKey, evidenceReference, rightsJson, territoriesJson, validFrom, validUntil, actor).lastInsertRowid;
        return claimView(claim(id));
      })();
    },
    decideClaim(claimId, input, actor) {
      keys(input, ['decision','reason'], 'INVALID_RIGHTS_DECISION_REQUEST');
      if (!['approved','rejected'].includes(input.decision)) throw problem('INVALID_DECISION');
      const reason = requiredText(input.reason, 500, 'REVIEW_REASON_REQUIRED');
      return db.transaction(() => {
        const current = claim(claimId), item = revision(current.revision_id);
        if (current.status !== 'pending') {
          if (current.status === input.decision && current.decided_by === actor && current.decision_reason === reason) return claimView(current);
          throw problem('CLAIM_ALREADY_DECIDED', 409);
        }
        if (involvedSubmitters(item).has(actor)) throw problem('SELF_REVIEW_DENIED', 403);
        const result = db.prepare(`UPDATE qb_right_claims SET status=?,decided_by=?,decision_reason=?,decided_at=datetime('now')
          WHERE id=? AND status='pending'`).run(input.decision, actor, reason, current.id);
        if (result.changes !== 1) throw problem('CLAIM_ALREADY_DECIDED', 409);
        return claimView(claim(current.id));
      })();
    },
    revokeClaim(claimId, input, actor) {
      keys(input, ['reason'], 'INVALID_RIGHTS_REVOKE_REQUEST');
      const reason = requiredText(input.reason, 500, 'REVIEW_REASON_REQUIRED');
      return db.transaction(() => {
        const current = claim(claimId);
        if (current.status !== 'approved') {
          if (current.status === 'revoked' && current.revoked_by === actor && current.revocation_reason === reason) return claimView(current);
          throw problem('CLAIM_NOT_APPROVED', 409);
        }
        db.prepare(`UPDATE qb_right_claims SET status='revoked',revoked_by=?,revocation_reason=?,revoked_at=datetime('now')
          WHERE id=? AND status='approved'`).run(actor, reason, current.id);
        return claimView(claim(current.id));
      })();
    },
    listSets(options = {}) {
      const { cursor, limit } = pageOf(options);
      const rows = db.prepare('SELECT * FROM qb_sets WHERE id>? ORDER BY id LIMIT ?').all(cursor, limit + 1);
      const sets = rows.slice(0, limit).map(setView);
      return { sets, total: db.prepare('SELECT COUNT(*) FROM qb_sets').pluck().get(),
        nextCursor: rows.length > limit ? sets.at(-1).id : null };
    },
    setDetail,
    createSet(input, actor) {
      keys(input, ['clientKey','title'], 'INVALID_SET_REQUEST');
      const clientKey = requiredText(input.clientKey, 100, 'INVALID_CLIENT_KEY');
      const title = requiredText(input.title, 200, 'INVALID_SET_TITLE');
      return db.transaction(() => {
        const existing = db.prepare('SELECT * FROM qb_sets WHERE created_by=? AND client_key=?').get(actor, clientKey);
        if (existing) {
          if (existing.title !== title) throw problem('CLIENT_KEY_CONFLICT', 409);
          return setView(existing);
        }
        const id = db.prepare('INSERT INTO qb_sets(client_key,title,created_by) VALUES (?,?,?)').run(clientKey, title, actor).lastInsertRowid;
        return setView(setRow(id));
      })();
    },
    replaceSetItems(setId, input) {
      keys(input, ['expectedVersion','revisionIds'], 'INVALID_SET_ITEMS_REQUEST');
      if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1 ||
          !Array.isArray(input.revisionIds) || input.revisionIds.length > 500) throw problem('INVALID_SET_ITEMS');
      const ids = input.revisionIds.map(idOf);
      if (new Set(ids).size !== ids.length) throw problem('DUPLICATE_SET_REVISION');
      return db.transaction(() => {
        const current = setRow(setId);
        if (current.status !== 'draft') throw problem('SET_ALREADY_READY', 409);
        if (current.version !== input.expectedVersion) throw problem('SET_VERSION_CONFLICT', 409);
        const questions = ids.map(id => revision(id).question_id);
        if (new Set(questions).size !== questions.length) throw problem('DUPLICATE_LOGICAL_QUESTION');
        db.prepare('DELETE FROM qb_set_items WHERE set_id=?').run(current.id);
        const insert = db.prepare('INSERT INTO qb_set_items(set_id,position,revision_id) VALUES (?,?,?)');
        ids.forEach((id, index) => insert.run(current.id, index + 1, id));
        db.prepare('UPDATE qb_sets SET version=version+1 WHERE id=? AND version=? AND status=\'draft\'').run(current.id, current.version);
        return setDetail(current.id);
      })();
    },
    publishSet(setId, input, actor) {
      keys(input, ['clientKey','expectedVersion','territory','commercial'], 'INVALID_SET_PUBLISH_REQUEST');
      const clientKey = requiredText(input.clientKey, 100, 'INVALID_CLIENT_KEY');
      if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) throw problem('INVALID_SET_VERSION');
      const context = assetRights.contextOf({ territory: input.territory, commercial: input.commercial });
      if (typeof input.commercial !== 'boolean') throw problem('INVALID_COMMERCIAL_CONTEXT');
      return db.transaction(() => {
        const current = setRow(setId);
        if (current.status === 'ready') {
          if (current.publish_key === clientKey && current.version === input.expectedVersion + 1 &&
              current.publish_territory === context.territory && current.publish_commercial === Number(context.commercial) &&
              current.published_by === actor) return setDetail(current.id);
          throw problem('SET_ALREADY_READY', 409);
        }
        if (current.version !== input.expectedVersion) throw problem('SET_VERSION_CONFLICT', 409);
        const items = setItems(current.id);
        if (!items.length) throw problem('EMPTY_SET', 409);
        for (const item of items) {
          const state = bankRights.revisionReadiness(db, item.revisionId, context, 'publish');
          if (!state.ready) throw problem(state.reason, 409);
        }
        // Legacy asset flags are global to the deduplicated blob. Synchronize
        // them from currently active grants before changing publish_status.
        // Source-specific rights remain mandatory for every subsequent use.
        const sourceIds = [...new Set(items.map(item => JSON.parse(revision(item.revisionId).provenance_json))
          .filter(value => value.kind === 'pdf').map(value => value.sourceId))];
        for (const sourceId of sourceIds) {
          const asset = db.prepare('SELECT asset_id FROM question_asset_sources WHERE id=?').get(sourceId);
          const active = db.prepare(`SELECT rights_json FROM question_asset_right_claims claim
            JOIN question_asset_sources source ON source.id=claim.source_id
            WHERE source.asset_id=? AND claim.status='approved' AND claim.valid_from<=? AND claim.valid_until>=?`).all(asset.asset_id, context.at, context.at);
          const grants = active.map(row => JSON.parse(row.rights_json));
          const processing = Number(grants.some(row => row.machineProcessing || row.adaptation));
          const display = Number(grants.some(row => row.stemDisplay || row.answerDisplay || row.imageDisplay));
          db.prepare('UPDATE question_pdf_assets SET processing_right=?,display_right=? WHERE id=?').run(processing, display, asset.asset_id);
          if (!processing || !display) throw problem('SOURCE_USE_DENIED', 409);
          db.prepare("UPDATE question_pdf_assets SET publish_status='published' WHERE id=?").run(asset.asset_id);
        }
        db.prepare(`INSERT INTO qb_set_publication_checks(set_id,expected_version,territory,commercial)
          VALUES (?,?,?,?)`).run(current.id, current.version, context.territory, Number(context.commercial));
        const changed = db.prepare(`UPDATE qb_sets SET status='ready',version=version+1,publish_key=?,publish_territory=?,
          publish_commercial=?,published_by=?,published_at=datetime('now') WHERE id=? AND version=? AND status='draft'`)
          .run(clientKey, context.territory, Number(context.commercial), actor, current.id, current.version);
        if (changed.changes !== 1) throw problem('SET_VERSION_CONFLICT', 409);
        db.prepare('DELETE FROM qb_set_publication_checks WHERE set_id=?').run(current.id);
        if (!bankRights.canUseSet(db, current.id, context)) throw problem('SET_USE_DENIED', 409);
        return setDetail(current.id);
      })();
    }
  };
}

module.exports = { createQuestionBank, normalizeContent, normalizeProvenance, normalizeMedia };
