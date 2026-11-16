'use strict';
const express = require('express');
const adminAuth = require('../middleware/adminAuth');
const { hasPermission } = require('../utils/adminPermissions');
const { getAccount } = require('../utils/adminAccounts');
const { ok } = require('../utils/response');
const db = require('../db/database');
const { createQuestionParseJobs } = require('../services/questionParseJobs');

const router = express.Router();
const service = createQuestionParseJobs(db);
const actor = req => String(req.admin.id);
const denied = res => res.status(403).json({ code: 'PERMISSION_DENIED', message: 'PERMISSION_DENIED', data: null });
const permit = (...permissions) => (req, res, next) => permissions.some(item => hasPermission(req.admin, item)) ? next() : denied(res);
const permitAll = (...permissions) => (req, res, next) => permissions.every(item => hasPermission(req.admin, item)) ? next() : denied(res);
const run = handler => (req, res, next) => Promise.resolve().then(() => handler(req, res)).catch(error => {
  if (!error.status) return next(error);
  res.status(error.status).json({ code: error.code || 'QUESTION_PARSE_ERROR', message: error.message, data: null });
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
  if (!['questionAssets','questionBankEdit'].some(permission => hasPermission(req.admin, permission))) return denied(res);
  next();
});

router.post('/jobs', permit('questionAssets'), run((req, res) => ok(res, { job: service.createJob(req.body, actor(req)) })));
router.get('/jobs', permit('questionAssets'), run((req, res) => ok(res, service.listJobs(req.query))));
router.get('/jobs/:jobId', permit('questionAssets'), run((req, res) => ok(res, service.jobDetail(req.params.jobId))));
router.post('/jobs/:jobId/retry', permit('questionAssets'), run((req, res) => ok(res, { job: service.retryJob(req.params.jobId) })));
router.get('/jobs/:jobId/drafts', permit('questionAssets'), run((req, res) => ok(res, service.listDrafts(req.params.jobId, req.query))));
router.post('/jobs/:jobId/drafts/reviews', permitAll('questionAssets','questionBankEdit'),
  run((req, res) => ok(res, service.reviewDrafts(req.params.jobId, req.body, actor(req)))));
router.post('/jobs/:jobId/drafts/promotions', permitAll('questionAssets','questionBankEdit'),
  run((req, res) => ok(res, service.promoteDrafts(req.params.jobId, req.body, actor(req)))));
router.get('/jobs/:jobId/pages/:pageNumber', permit('questionAssets'), run((req, res) => ok(res, service.pageEvidence(req.params.jobId, req.params.pageNumber))));
router.get('/drafts/:draftId', permit('questionAssets'), run((req, res) => ok(res, service.draftDetail(req.params.draftId))));
router.post('/drafts/:draftId/reviews', permitAll('questionAssets','questionBankEdit'),
  run((req, res) => ok(res, { review: service.reviewDraft(req.params.draftId, req.body, actor(req)) })));
router.patch('/drafts/:draftId', permitAll('questionAssets','questionBankEdit'), run((req, res) => ok(res, { draft: service.editDraft(req.params.draftId, req.body, actor(req)) })));
router.get('/sources/:sourceId/pages/:pageNumber/preview', permit('questionAssets'), run(async (req, res) => {
  const png = await service.previewAsset(req.params.sourceId, req.params.pageNumber, req.query.jobId);
  res.set('Content-Type', 'image/png');
  res.set('Content-Disposition', 'inline; filename="private-page.png"');
  res.send(png);
}));

module.exports = router;
