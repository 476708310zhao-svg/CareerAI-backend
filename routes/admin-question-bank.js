'use strict';
const express = require('express');
const adminAuth = require('../middleware/adminAuth');
const { hasPermission } = require('../utils/adminPermissions');
const { getAccount } = require('../utils/adminAccounts');
const { ok } = require('../utils/response');
const db = require('../db/database');
const { createQuestionBank } = require('../services/questionBank');

const router = express.Router();
const service = createQuestionBank(db);
const actor = req => String(req.admin.id);
const permissions = ['questionBankEdit', 'questionBankPublish', 'questionContentReview', 'questionRightsReview'];
const permit = permission => (req, res, next) => hasPermission(req.admin, permission)
  ? next() : res.status(403).json({ code: 'PERMISSION_DENIED', message: 'PERMISSION_DENIED', data: null });
const run = handler => (req, res, next) => Promise.resolve().then(() => handler(req, res)).catch(error => {
  if (!error.status) return next(error);
  return res.status(error.status).json({ code: error.code || 'QUESTION_BANK_ERROR', message: error.message, data: null });
});

router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
router.use(adminAuth);
router.use((req, res, next) => {
  const account = Number.isSafeInteger(req.admin.id) && req.admin.id > 0 ? getAccount(req.admin.id) : null;
  if (!account || !account.is_active || account.username !== req.admin.sub) {
    return res.status(403).json({ code: 'ADMIN_INACTIVE', message: 'ADMIN_INACTIVE', data: null });
  }
  req.admin = { ...req.admin, id: account.id, username: account.username,
    adminRole: account.role, permissions: account.permissions };
  if (!permissions.some(permission => hasPermission(req.admin, permission))) {
    return res.status(403).json({ code: 'PERMISSION_DENIED', message: 'PERMISSION_DENIED', data: null });
  }
  next();
});

router.get('/questions', run((req, res) => ok(res, service.listQuestions(req.query))));
router.get('/questions/:questionId', run((req, res) => ok(res, service.questionDetail(req.params.questionId))));
router.post('/questions', permit('questionBankEdit'), run((req, res) => ok(res, service.createQuestion(req.body, actor(req)))));
router.post('/questions/:questionId/revisions', permit('questionBankEdit'),
  run((req, res) => ok(res, service.createRevision(req.params.questionId, req.body, actor(req)))));
router.post('/revisions/:revisionId/content-reviews', permit('questionContentReview'),
  run((req, res) => ok(res, { contentReview: service.reviewContent(req.params.revisionId, req.body, actor(req)) })));
router.post('/revisions/:revisionId/rights-claims', permit('questionBankEdit'),
  run((req, res) => ok(res, { claim: service.submitClaim(req.params.revisionId, req.body, actor(req)) })));
router.post('/rights-claims/:claimId/decision', permit('questionRightsReview'),
  run((req, res) => ok(res, { claim: service.decideClaim(req.params.claimId, req.body, actor(req)) })));
router.post('/rights-claims/:claimId/revoke', permit('questionRightsReview'),
  run((req, res) => ok(res, { claim: service.revokeClaim(req.params.claimId, req.body, actor(req)) })));
router.get('/sets', run((req, res) => ok(res, service.listSets(req.query))));
router.get('/sets/:setId', run((req, res) => ok(res, service.setDetail(req.params.setId))));
router.post('/sets', permit('questionBankEdit'), run((req, res) => ok(res, { set: service.createSet(req.body, actor(req)) })));
router.put('/sets/:setId/items', permit('questionBankEdit'),
  run((req, res) => ok(res, service.replaceSetItems(req.params.setId, req.body))));
router.post('/sets/:setId/publish', permit('questionBankPublish'),
  run((req, res) => ok(res, service.publishSet(req.params.setId, req.body, actor(req)))));
module.exports = router;
