'use strict';

// A grant is tied to one provenance source. A second source with the same PDF
// hash cannot inherit the first source's license.
const RIGHT_KEYS = Object.freeze([
  'internalStorage', 'machineProcessing', 'thirdPartyProcessing',
  'stemDisplay', 'imageDisplay', 'answerDisplay', 'commercialUse', 'adaptation'
]);
const DISPLAY_RIGHTS = new Set(['stemDisplay', 'imageDisplay', 'answerDisplay', 'commercialUse']);
const problem = (code, status = 400) => Object.assign(new Error(code), { code, status });
const blankRights = () => Object.fromEntries(RIGHT_KEYS.map(key => [key, false]));
const shanghaiDate = now => new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);

function isoDate(value, code = 'INVALID_RIGHTS_DATE') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ||
      new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) throw problem(code);
  return value;
}

function normalizeRights(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw problem('INVALID_RIGHTS');
  if (Object.keys(value).some(key => !RIGHT_KEYS.includes(key))) throw problem('INVALID_RIGHTS');
  const normalized = blankRights();
  for (const key of RIGHT_KEYS) {
    if (value[key] !== undefined && typeof value[key] !== 'boolean') throw problem('INVALID_RIGHTS');
    normalized[key] = value[key] === true;
  }
  if (!Object.values(normalized).some(Boolean)) throw problem('EMPTY_RIGHTS');
  return normalized;
}

function normalizeTerritories(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) throw problem('INVALID_TERRITORIES');
  if (value.some(item => typeof item !== 'string' || (item !== '*' && !/^[A-Z]{2}$/.test(item)))) throw problem('INVALID_TERRITORIES');
  const normalized = [...new Set(value)];
  if (normalized.includes('*') && normalized.length !== 1) throw problem('INVALID_TERRITORIES');
  return normalized;
}

function contextOf(context = {}) {
  const territory = context.territory;
  if (typeof territory !== 'string' || !/^[A-Z]{2}$/.test(territory)) throw problem('TERRITORY_REQUIRED');
  if (context.commercial !== undefined && typeof context.commercial !== 'boolean') throw problem('INVALID_COMMERCIAL_CONTEXT');
  return { territory, commercial: context.commercial === true,
    at: context.at === undefined ? shanghaiDate(new Date()) : isoDate(context.at) };
}

function activeClaims(db, sourceId, context) {
  const { territory, at } = contextOf(context);
  return db.prepare("SELECT rights_json,territories_json FROM question_asset_right_claims WHERE source_id=? AND status='approved' AND valid_from<=? AND valid_until>=?")
    .all(sourceId, at, at)
    .map(row => ({ rights: JSON.parse(row.rights_json), territories: JSON.parse(row.territories_json) }))
    .filter(claim => claim.territories.includes('*') || claim.territories.includes(territory));
}

function hasSourceRight(db, sourceId, operation, context) {
  if (!RIGHT_KEYS.includes(operation)) return false;
  if (operation !== 'internalStorage' && (!context || typeof context.commercial !== 'boolean')) return false;
  const checked = contextOf(context);
  return activeClaims(db, sourceId, checked).some(claim =>
    claim.rights[operation] === true &&
    (!checked.commercial || claim.rights.commercialUse === true) &&
    (operation !== 'thirdPartyProcessing' || claim.rights.machineProcessing === true));
}

function currentContentReview(db, sourceId) {
  return db.prepare('SELECT decision FROM question_asset_content_reviews WHERE source_id=? ORDER BY id DESC LIMIT 1')
    .pluck().get(sourceId) || 'pending';
}

function sourceState(db, sourceId) {
  return db.prepare(`SELECT source.id,source.status,source.asset_id,
    asset.validation_status,asset.scan_status,asset.publish_status,
    asset.processing_right,asset.display_right
    FROM question_asset_sources source
    LEFT JOIN question_pdf_assets asset ON asset.id=source.asset_id
    WHERE source.id=?`).get(sourceId);
}

function canUseSource(db, sourceId, operation, context) {
  if (!RIGHT_KEYS.includes(operation)) return false;
  if (operation !== 'internalStorage' && (!context || typeof context.commercial !== 'boolean')) return false;
  const state = sourceState(db, sourceId);
  if (!state || state.status !== 'quarantined' || !state.asset_id) return false;
  if (!hasSourceRight(db, sourceId, operation, context)) return false;
  if (operation === 'internalStorage') return true;
  if (state.validation_status !== 'valid' || state.scan_status !== 'clean') return false;
  if (operation === 'machineProcessing' || operation === 'thirdPartyProcessing') return true;
  if (operation === 'adaptation') return currentContentReview(db, sourceId) === 'approved';
  if (DISPLAY_RIGHTS.has(operation)) {
    return operation !== 'commercialUse' && state.publish_status === 'published' &&
      currentContentReview(db, sourceId) === 'approved';
  }
  return false;
}

function assertSourceUse(db, sourceId, operation, context) {
  if (!canUseSource(db, sourceId, operation, context)) throw problem('SOURCE_USE_DENIED', 403);
  return true;
}

function canPublishSource(db, sourceId, context) {
  if (!context || typeof context.commercial !== 'boolean') return false;
  const state = sourceState(db, sourceId);
  if (!state || state.status !== 'quarantined' || !state.asset_id) return false;
  return state.validation_status === 'valid' && state.scan_status === 'clean' &&
    currentContentReview(db, sourceId) === 'approved' &&
    hasSourceRight(db, sourceId, 'stemDisplay', context);
}

function effectiveRights(db, sourceId, context) {
  if (!context || !context.territory) return { evaluated: false, reason: 'TERRITORY_REQUIRED' };
  const checked = contextOf(context);
  const grants = activeClaims(db, sourceId, checked);
  const rights = blankRights();
  for (const grant of grants) for (const key of RIGHT_KEYS) rights[key] ||= grant.rights[key] === true;
  const usable = Object.fromEntries(RIGHT_KEYS.map(key => [key, canUseSource(db, sourceId, key, { ...checked, commercial: false })]));
  const coverage = {};
  for (const [label, operation] of [['StemDisplay', 'stemDisplay'], ['ImageDisplay', 'imageDisplay'], ['AnswerDisplay', 'answerDisplay']]) {
    coverage[`free${label}`] = hasSourceRight(db, sourceId, operation, { ...checked, commercial: false });
    coverage[`commercial${label}`] = hasSourceRight(db, sourceId, operation, { ...checked, commercial: true });
  }
  const state = sourceState(db, sourceId);
  return { evaluated: true, territory: checked.territory, rights, usable, coverage,
    contentReviewStatus: currentContentReview(db, sourceId),
    validationStatus: state && state.validation_status || null,
    scanStatus: state && state.scan_status || null,
    publishStatus: state && state.publish_status || null };
}

module.exports = { RIGHT_KEYS, blankRights, isoDate, normalizeRights, normalizeTerritories,
  contextOf, shanghaiDate, hasSourceRight, canUseSource, assertSourceUse, canPublishSource,
  currentContentReview, effectiveRights, problem };
