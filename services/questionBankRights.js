'use strict';
const sourceRights = require('./questionAssetRights');

const QUESTION_RIGHT_KEYS = Object.freeze(['stemDisplay', 'answerDisplay', 'imageDisplay', 'commercialUse', 'adaptation']);
const contextOf = sourceRights.contextOf;
const json = value => { try { return JSON.parse(value); } catch (_) { return null; } };

function currentContentReview(db, revisionId) {
  return db.prepare('SELECT decision,reviewer,id FROM qb_content_reviews WHERE revision_id=? ORDER BY id DESC LIMIT 1').get(revisionId) || null;
}

function oneClaimCovers(db, table, key, id, needed, context, excludedSubmitters = []) {
  const checked = contextOf(context);
  return db.prepare(`SELECT rights_json,territories_json,submitted_by FROM ${table} WHERE ${key}=? AND status='approved' AND valid_from<=? AND valid_until>=?`)
    .all(id, checked.at, checked.at).some(row => {
      const rights = json(row.rights_json), territories = json(row.territories_json);
      return !excludedSubmitters.includes(row.submitted_by) && rights && Array.isArray(territories) &&
        (territories.includes('*') || territories.includes(checked.territory)) &&
        needed.every(operation => rights[operation] === true);
    });
}

function sourceReady(db, sourceId, context, mode, questionReviewer) {
  const needed = ['stemDisplay', 'answerDisplay', 'adaptation'];
  if (context.commercial) needed.push('commercialUse');
  const sourceReview = db.prepare('SELECT reviewer FROM question_asset_content_reviews WHERE source_id=? ORDER BY id DESC LIMIT 1').get(sourceId);
  if (!sourceReview || !oneClaimCovers(db, 'question_asset_right_claims', 'source_id', sourceId,
    needed, context, [sourceReview.reviewer, questionReviewer])) return false;
  if (!sourceRights.canPublishSource(db, sourceId, context)) return false;
  if (mode === 'use') {
    return sourceRights.canUseSource(db, sourceId, 'stemDisplay', context) &&
      sourceRights.canUseSource(db, sourceId, 'answerDisplay', context) &&
      sourceRights.canUseSource(db, sourceId, 'adaptation', context);
  }
  return true;
}

function revisionReadiness(db, revisionId, context, mode = 'publish') {
  if (!context || typeof context.commercial !== 'boolean') return { ready: false, reason: 'INVALID_CONTEXT' };
  let checked;
  try { checked = contextOf(context); } catch (_) { return { ready: false, reason: 'INVALID_CONTEXT' }; }
  const revision = db.prepare('SELECT * FROM qb_revisions WHERE id=?').get(revisionId);
  if (!revision) return { ready: false, reason: 'REVISION_NOT_FOUND' };
  const review = currentContentReview(db, revisionId);
  if (!review || review.decision !== 'approved') return { ready: false, reason: 'CONTENT_NOT_APPROVED' };
  const provenance = json(revision.provenance_json), media = json(revision.media_json);
  if (!provenance || !Array.isArray(media)) return { ready: false, reason: 'INVALID_REVISION_DATA' };
  // No stage-3 protected image delivery adapter exists. A media-bearing item
  // stays private even if a claim says imageDisplay=true.
  if (media.length) return { ready: false, reason: 'MEDIA_DELIVERY_UNAVAILABLE' };
  const needed = ['stemDisplay', 'answerDisplay'];
  if (checked.commercial) needed.push('commercialUse');
  if (provenance.kind === 'pdf') needed.push('adaptation');
  if (!oneClaimCovers(db, 'qb_right_claims', 'revision_id', revisionId, needed, checked, [review.reviewer])) {
    return { ready: false, reason: 'QUESTION_RIGHTS_DENIED' };
  }
  if (provenance.kind === 'pdf' && !sourceReady(db, provenance.sourceId, checked, mode, review.reviewer)) {
    return { ready: false, reason: 'SOURCE_USE_DENIED' };
  }
  if (provenance.kind !== 'pdf' && provenance.kind !== 'original') {
    return { ready: false, reason: 'INVALID_PROVENANCE' };
  }
  return { ready: true, reason: null };
}

function canUseRevision(db, revisionId, context) {
  return revisionReadiness(db, revisionId, context, 'use').ready;
}

function canUseSet(db, setId, context) {
  if (!context || typeof context.commercial !== 'boolean') return false;
  const set = db.prepare('SELECT * FROM qb_sets WHERE id=?').get(setId);
  if (!set || set.status !== 'ready' || !set.publish_territory || set.publish_commercial === null) return false;
  let checked;
  try { checked = contextOf(context); } catch (_) { return false; }
  if (checked.territory !== set.publish_territory || Number(checked.commercial) !== set.publish_commercial) return false;
  const items = db.prepare('SELECT revision_id FROM qb_set_items WHERE set_id=? ORDER BY position').all(setId);
  return items.length > 0 && items.every(item => canUseRevision(db, item.revision_id, checked));
}

module.exports = { QUESTION_RIGHT_KEYS, currentContentReview, revisionReadiness, canUseRevision, canUseSet, oneClaimCovers };
