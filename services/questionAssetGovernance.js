'use strict';
const rights = require('./questionAssetRights');

const problem = rights.problem;
const localSingleReviewEnabled = () => ['development', 'test'].includes(process.env.NODE_ENV) &&
  process.env.QUESTION_PDF_LOCAL_IMPORT_ENABLED === '1' && process.env.QUESTION_PDF_LOCAL_SINGLE_REVIEW_ENABLED === '1';
const text = (value, max, code) => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized || normalized.length > max) throw problem(code);
  return normalized;
};
const idOf = value => {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw problem('INVALID_ID');
  return id;
};
const claimView = row => ({
  id: row.id, sourceId: row.source_id, clientKey: row.client_key,
  evidenceReference: row.evidence_reference, rights: JSON.parse(row.rights_json),
  territories: JSON.parse(row.territories_json), validFrom: row.valid_from,
  validUntil: row.valid_until, status: row.status, submittedBy: row.submitted_by,
  decidedBy: row.decided_by, decisionReason: row.decision_reason,
  decidedAt: row.decided_at, revokedBy: row.revoked_by,
  revocationReason: row.revocation_reason, revokedAt: row.revoked_at,
  createdAt: row.created_at
});
const contentReviewView = row => ({ id: row.id, sourceId: row.source_id,
  clientKey: row.client_key, expectedLatestReviewId: row.expected_latest_review_id,
  decision: row.decision, reason: row.reason, reviewer: row.reviewer,
  createdAt: row.created_at });
const historyPage = options => {
  const cursor = options.cursor === undefined ? Number.MAX_SAFE_INTEGER : Number(options.cursor);
  const limit = options.limit === undefined ? 30 : Number(options.limit);
  if (!Number.isSafeInteger(cursor) || cursor <= 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw problem('INVALID_PAGINATION');
  return { cursor, limit };
};

function createQuestionAssetGovernance(db) {
  const source = id => {
    const row = db.prepare('SELECT * FROM question_asset_sources WHERE id=?').get(idOf(id));
    if (!row) throw problem('SOURCE_NOT_FOUND', 404);
    return row;
  };
  const claim = id => {
    const row = db.prepare('SELECT * FROM question_asset_right_claims WHERE id=?').get(idOf(id));
    if (!row) throw problem('CLAIM_NOT_FOUND', 404);
    return row;
  };
  const audit = (record, action, actor, detail = {}) => db.prepare(
    'INSERT INTO question_asset_audit(batch_id,source_id,action,actor,detail) VALUES (?,?,?,?,?)'
  ).run(record.batch_id, record.id, action, actor, JSON.stringify(detail));
  const sourceView = row => {
    const asset = row.asset_id ? db.prepare('SELECT validation_status,scan_status,publish_status FROM question_pdf_assets WHERE id=?').get(row.asset_id) : null;
    return { id: row.id, batchId: row.batch_id, originalFilename: row.original_filename,
      sourceReference: row.source_reference, sourceType: row.source_type,
      status: row.status, assetId: row.asset_id, createdBy: row.created_by,
      validationStatus: asset && asset.validation_status || null,
      scanStatus: asset && asset.scan_status || null,
      publishStatus: asset && asset.publish_status || null,
      pendingClaims: db.prepare("SELECT COUNT(*) FROM question_asset_right_claims WHERE source_id=? AND status='pending'").pluck().get(row.id),
      contentReviewStatus: rights.currentContentReview(db, row.id),
      createdAt: row.created_at, updatedAt: row.updated_at };
  };
  const syncAssetFlags = assetId => {
    if (!assetId) return;
    const claims = db.prepare(`SELECT claim.rights_json FROM question_asset_right_claims claim
      JOIN question_asset_sources source ON source.id=claim.source_id
      WHERE source.asset_id=? AND claim.status='approved'`).all(assetId);
    const granted = claims.map(row => JSON.parse(row.rights_json));
    const processing = granted.some(item => item.machineProcessing === true || item.adaptation === true);
    const display = granted.some(item => item.stemDisplay === true || item.imageDisplay === true || item.answerDisplay === true);
    db.prepare('UPDATE question_pdf_assets SET processing_right=?,display_right=? WHERE id=?')
      .run(Number(processing), Number(display), assetId);
  };
  return {
    listSources(options = {}) {
      const cursor = options.cursor === undefined ? 0 : Number(options.cursor);
      const limit = options.limit === undefined ? 30 : Number(options.limit);
      if (!Number.isSafeInteger(cursor) || cursor < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw problem('INVALID_PAGINATION');
      const rows = db.prepare('SELECT * FROM question_asset_sources WHERE id>? ORDER BY id LIMIT ?').all(cursor, limit + 1);
      const hasMore = rows.length > limit;
      const sources = rows.slice(0, limit).map(sourceView);
      return { sources, total: db.prepare('SELECT COUNT(*) FROM question_asset_sources').pluck().get(),
        nextCursor: hasMore ? sources.at(-1).id : null };
    },
    detail(sourceId, options = {}) {
      const record = source(sourceId);
      const claims = db.prepare('SELECT * FROM question_asset_right_claims WHERE source_id=? ORDER BY id DESC LIMIT 100').all(record.id).map(claimView);
      const contentReviews = db.prepare('SELECT * FROM question_asset_content_reviews WHERE source_id=? ORDER BY id DESC LIMIT 100').all(record.id).map(contentReviewView);
      return { source: sourceView(record), claims, contentReviews,
        localSingleReviewEnabled: localSingleReviewEnabled(),
        claimsTotal: db.prepare('SELECT COUNT(*) FROM question_asset_right_claims WHERE source_id=?').pluck().get(record.id),
        contentReviewsTotal: db.prepare('SELECT COUNT(*) FROM question_asset_content_reviews WHERE source_id=?').pluck().get(record.id),
        effectiveRights: rights.effectiveRights(db, record.id, options) };
    },
    claimHistory(sourceId, options = {}) {
      const record = source(sourceId), { cursor, limit } = historyPage(options);
      const rows = db.prepare('SELECT * FROM question_asset_right_claims WHERE source_id=? AND id<? ORDER BY id DESC LIMIT ?')
        .all(record.id, cursor, limit + 1);
      const hasMore = rows.length > limit, items = rows.slice(0, limit).map(claimView);
      return { items, total: db.prepare('SELECT COUNT(*) FROM question_asset_right_claims WHERE source_id=?').pluck().get(record.id),
        nextCursor: hasMore ? items.at(-1).id : null };
    },
    contentReviewHistory(sourceId, options = {}) {
      const record = source(sourceId), { cursor, limit } = historyPage(options);
      const rows = db.prepare('SELECT * FROM question_asset_content_reviews WHERE source_id=? AND id<? ORDER BY id DESC LIMIT ?')
        .all(record.id, cursor, limit + 1);
      const hasMore = rows.length > limit, items = rows.slice(0, limit).map(contentReviewView);
      return { items, total: db.prepare('SELECT COUNT(*) FROM question_asset_content_reviews WHERE source_id=?').pluck().get(record.id),
        nextCursor: hasMore ? items.at(-1).id : null };
    },
    submitClaim(sourceId, input, actor) {
      input = input || {};
      const record = source(sourceId);
      if (record.status !== 'quarantined' || !record.asset_id) throw problem('SOURCE_NOT_QUARANTINED', 409);
      const clientKey = text(input && input.clientKey, 100, 'INVALID_CLIENT_KEY');
      const evidenceReference = text(input && input.evidenceReference, 500, 'INVALID_EVIDENCE_REFERENCE');
      const allowed = rights.normalizeRights(input.rights);
      const territories = rights.normalizeTerritories(input.territories);
      const validFrom = rights.isoDate(input.validFrom), validUntil = rights.isoDate(input.validUntil);
      if (validFrom > validUntil) throw problem('INVALID_RIGHTS_PERIOD');
      const rightsJson = JSON.stringify(allowed), territoriesJson = JSON.stringify(territories);
      return db.transaction(() => {
        const existing = db.prepare('SELECT * FROM question_asset_right_claims WHERE source_id=? AND client_key=?').get(record.id, clientKey);
        if (existing) {
          if (existing.evidence_reference !== evidenceReference || existing.rights_json !== rightsJson ||
              existing.territories_json !== territoriesJson || existing.valid_from !== validFrom || existing.valid_until !== validUntil) throw problem('CLIENT_KEY_CONFLICT', 409);
          return claimView(existing);
        }
        const result = db.prepare(`INSERT INTO question_asset_right_claims
          (source_id,client_key,evidence_reference,rights_json,territories_json,valid_from,valid_until,submitted_by)
          VALUES (?,?,?,?,?,?,?,?)`).run(record.id, clientKey, evidenceReference, rightsJson, territoriesJson, validFrom, validUntil, actor);
        audit(record, 'rights_claim_submitted', actor, { claimId: result.lastInsertRowid });
        return claimView(claim(result.lastInsertRowid));
      })();
    },
    decideClaim(claimId, input, actor) {
      const decision = input && input.decision;
      if (!['approved', 'rejected'].includes(decision)) throw problem('INVALID_DECISION');
      const reason = text(input.reason, 500, 'REVIEW_REASON_REQUIRED');
      return db.transaction(() => {
        const current = claim(claimId), record = source(current.source_id);
        if (current.status !== 'pending') {
          if (current.status === decision && current.decided_by === actor && current.decision_reason === reason) return claimView(current);
          throw problem('CLAIM_ALREADY_DECIDED', 409);
        }
        if (record.status !== 'quarantined') throw problem('SOURCE_NOT_QUARANTINED', 409);
        const selfReview = actor === current.submitted_by || actor === record.created_by;
        let localSingleReview = false;
        if (selfReview) {
          const granted = JSON.parse(current.rights_json);
          const selected = Object.keys(granted).filter(key => granted[key] === true);
          const asset = db.prepare('SELECT validation_status,scan_status FROM question_pdf_assets WHERE id=?').get(record.asset_id);
          localSingleReview = localSingleReviewEnabled() && decision === 'approved' &&
            selected.length === 1 && selected[0] === 'machineProcessing' &&
            asset?.validation_status === 'valid' && asset?.scan_status === 'clean';
          if (!localSingleReview) throw problem('SELF_REVIEW_DENIED', 403);
        }
        db.prepare("UPDATE question_asset_right_claims SET status=?,decided_by=?,decision_reason=?,decided_at=datetime('now') WHERE id=? AND status='pending'")
          .run(decision, actor, reason, current.id);
        syncAssetFlags(record.asset_id);
        audit(record, `rights_claim_${decision}`, actor, { claimId: current.id, reason, localSingleReview });
        return claimView(claim(current.id));
      })();
    },
    revokeClaim(claimId, input, actor) {
      const reason = text(input && input.reason, 500, 'REVIEW_REASON_REQUIRED');
      return db.transaction(() => {
        const current = claim(claimId), record = source(current.source_id);
        if (current.status !== 'approved') {
          if (current.status === 'revoked' && current.revoked_by === actor && current.revocation_reason === reason) return claimView(current);
          throw problem('CLAIM_NOT_APPROVED', 409);
        }
        db.prepare("UPDATE question_asset_right_claims SET status='revoked',revoked_by=?,revocation_reason=?,revoked_at=datetime('now') WHERE id=? AND status='approved'")
          .run(actor, reason, current.id);
        db.prepare("UPDATE question_pdf_assets SET publish_status='blocked' WHERE id=?").run(record.asset_id);
        syncAssetFlags(record.asset_id);
        audit(record, 'rights_claim_revoked', actor, { claimId: current.id, reason });
        return claimView(claim(current.id));
      })();
    },
    reviewContent(sourceId, input, actor) {
      const decision = input && input.decision;
      if (!['approved', 'rejected'].includes(decision)) throw problem('INVALID_DECISION');
      const reason = text(input.reason, 500, 'REVIEW_REASON_REQUIRED');
      const clientKey = text(input.clientKey, 100, 'INVALID_CLIENT_KEY');
      if (!Object.prototype.hasOwnProperty.call(input, 'expectedLatestReviewId')) throw problem('CONTENT_REVIEW_VERSION_REQUIRED');
      const expectedLatestReviewId = input.expectedLatestReviewId;
      if (expectedLatestReviewId !== null && (!Number.isSafeInteger(expectedLatestReviewId) || expectedLatestReviewId <= 0)) {
        throw problem('INVALID_CONTENT_REVIEW_VERSION');
      }
      return db.transaction(() => {
        const record = source(sourceId);
        if (record.status !== 'quarantined' || !record.asset_id) throw problem('SOURCE_NOT_QUARANTINED', 409);
        const existing = db.prepare('SELECT * FROM question_asset_content_reviews WHERE source_id=? AND client_key=?')
          .get(record.id, clientKey);
        if (existing) {
          if (existing.decision !== decision || existing.reason !== reason || existing.reviewer !== actor ||
              existing.expected_latest_review_id !== expectedLatestReviewId) throw problem('CLIENT_KEY_CONFLICT', 409);
          return contentReviewView(existing);
        }
        if (decision === 'approved') {
          const asset = db.prepare('SELECT validation_status,scan_status FROM question_pdf_assets WHERE id=?').get(record.asset_id);
          if (!asset || asset.validation_status !== 'valid' || asset.scan_status !== 'clean') throw problem('ASSET_NOT_VALIDATED', 409);
        }
        if (actor === record.created_by || db.prepare('SELECT 1 FROM question_asset_right_claims WHERE source_id=? AND submitted_by=? LIMIT 1').get(record.id, actor)) {
          throw problem('SELF_REVIEW_DENIED', 403);
        }
        const latest = db.prepare('SELECT * FROM question_asset_content_reviews WHERE source_id=? ORDER BY id DESC LIMIT 1').get(record.id);
        if ((latest ? latest.id : null) !== expectedLatestReviewId) throw problem('CONTENT_REVIEW_STALE', 409);
        if (decision === 'rejected') db.prepare("UPDATE question_pdf_assets SET publish_status='blocked' WHERE id=?").run(record.asset_id);
        const result = db.prepare(`INSERT INTO question_asset_content_reviews
          (source_id,client_key,expected_latest_review_id,decision,reason,reviewer) VALUES (?,?,?,?,?,?)`)
          .run(record.id, clientKey, expectedLatestReviewId, decision, reason, actor);
        audit(record, `content_${decision}`, actor, { reviewId: result.lastInsertRowid, reason });
        return contentReviewView(db.prepare('SELECT * FROM question_asset_content_reviews WHERE id=?').get(result.lastInsertRowid));
      })();
    }
  };
}

module.exports = { createQuestionAssetGovernance, problem };
