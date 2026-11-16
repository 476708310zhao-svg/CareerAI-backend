'use strict';
const express = require('express');
const adminAuth = require('../middleware/adminAuth');
const { hasPermission } = require('../utils/adminPermissions');
const { ok } = require('../utils/response');
const db = require('../db/database');
const { getAccount } = require('../utils/adminAccounts');
const { createQuestionAssetGovernance } = require('../services/questionAssetGovernance');

const router = express.Router();
const service = createQuestionAssetGovernance(db);
const actor = req => String(req.admin.id || req.admin.username || 'admin');
const anyGovernancePermission = admin => ['questionAssets', 'questionRightsReview', 'questionContentReview']
  .some(permission => hasPermission(admin, permission));
const requirePermission = permission => (req, res, next) => {
  if (!hasPermission(req.admin, permission)) return res.status(403).json({ code: -1, message: '没有该审核权限', data: null });
  next();
};
const run = handler => (req, res, next) => Promise.resolve().then(() => handler(req, res)).catch(error => {
  if (!error.status) return next(error);
  return res.status(error.status).json({ code: error.code || -1, message: error.message, data: null });
});

router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
router.use(adminAuth);
router.use((req, res, next) => {
  const account = Number.isSafeInteger(req.admin.id) && req.admin.id > 0
    ? getAccount(req.admin.id) : null;
  if (!account || !account.is_active || account.username !== req.admin.sub) {
    return res.status(403).json({ code: -1, message: '管理员账号已停用或无效', data: null });
  }
  // JWT grants are a login snapshot. Use the current account row for every
  // governance read and write, including super administrators.
  req.admin = { ...req.admin, id: account.id, username: account.username,
    adminRole: account.role, permissions: account.permissions };
  next();
});
// adminAuth has no single permission for this multi-role prefix. Require one
// governance role here, then each write route checks its own distinct role.
router.use((req, res, next) => {
  if (!anyGovernancePermission(req.admin)) return res.status(403).json({ code: -1, message: '没有素材治理权限', data: null });
  next();
});
router.get('/sources', run((req, res) => ok(res, service.listSources(req.query))));
router.get('/sources/:sourceId', run((req, res) => ok(res, service.detail(req.params.sourceId, req.query))));
router.get('/sources/:sourceId/claims', run((req, res) => ok(res, service.claimHistory(req.params.sourceId, req.query))));
router.get('/sources/:sourceId/content-reviews', run((req, res) => ok(res, service.contentReviewHistory(req.params.sourceId, req.query))));
router.post('/sources/:sourceId/claims', requirePermission('questionAssets'),
  run((req, res) => ok(res, { claim: service.submitClaim(req.params.sourceId, req.body, actor(req)) })));
router.post('/claims/:claimId/decision', requirePermission('questionRightsReview'),
  run((req, res) => ok(res, { claim: service.decideClaim(req.params.claimId, req.body, actor(req)) })));
router.post('/claims/:claimId/revoke', requirePermission('questionRightsReview'),
  run((req, res) => ok(res, { claim: service.revokeClaim(req.params.claimId, req.body, actor(req)) })));
router.post('/sources/:sourceId/content-reviews', requirePermission('questionContentReview'),
  run((req, res) => ok(res, { contentReview: service.reviewContent(req.params.sourceId, req.body, actor(req)) })));
module.exports = router;
