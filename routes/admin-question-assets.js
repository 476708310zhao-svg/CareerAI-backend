'use strict';
const express = require('express');
const multer = require('multer');
const adminAuth = require('../middleware/adminAuth');
const { getAccount } = require('../utils/adminAccounts');
const { hasPermission } = require('../utils/adminPermissions');
const { ok } = require('../utils/response');
const db = require('../db/database');
const store = require('../services/questionAssetStore');
const { createQuestionAssets } = require('../services/questionAssets');
const { createQuestionPdfUploads } = require('../services/questionPdfUploads');
const { createQuestionAssetChecks } = require('../services/questionAssetChecks');

const router = express.Router();
const service = createQuestionAssets(db, store);
const sessions = createQuestionPdfUploads(db, service, store);
const checks = createQuestionAssetChecks(db, { store });
const upload = multer({ storage: multer.diskStorage({ destination: (_req, _file, done) => {
  try { done(null, store.temporaryDirectory()); } catch (error) { done(error); }
}, filename: (_req, _file, done) => done(null, require('node:crypto').randomUUID()) }),
limits: { fileSize: store.DIRECT_MAX_PDF_BYTES, files: 1, fields: 0 } }).single('file');
const actor = req => String(req.admin.id || req.admin.username || 'admin');
const numberId = value => {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw Object.assign(new Error('INVALID_ID'), { status: 400 });
  return id;
};
const run = handler => (req, res, next) => Promise.resolve().then(() => handler(req, res)).catch(error => {
  if (!error.status) return next(error);
  res.status(error.status).json({ code: error.code || -1, message: error.message, data: null });
});

router.use(adminAuth);
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  const account = Number.isSafeInteger(req.admin.id) && req.admin.id > 0 ? getAccount(req.admin.id) : null;
  if (!account || !account.is_active || account.username !== req.admin.sub) {
    return res.status(403).json({ code: 'ADMIN_INACTIVE', message: 'ADMIN_INACTIVE', data: null });
  }
  req.admin = { ...req.admin, id: account.id, username: account.username,
    adminRole: account.role, permissions: account.permissions };
  if (!hasPermission(req.admin, 'questionAssets')) return res.status(403).json({ code: -1, message: '没有 PDF 素材管理权限', data: null });
  next();
});
router.post('/batches', run((req, res) => ok(res, { batch: service.createBatch(req.body, actor(req)) })));
router.get('/batches', run((req, res) => ok(res, service.listBatches(req.query))));
router.get('/batches/:batchId', run((req, res) => ok(res, service.list(numberId(req.params.batchId), req.query))));
router.post('/batches/:batchId/sources', run((req, res) => ok(res, { source: service.prepare(numberId(req.params.batchId), req.body, actor(req)) })));
const complete = (req, res, next) => {
  let batchId, sourceId;
  try {
    batchId = numberId(req.params.batchId);
    sourceId = numberId(req.params.sourceId);
    store.assertAvailable();
  } catch (error) { return run(() => { throw error; })(req, res, next); }
  return upload(req, res, error => {
    if (error) return run((request, response) => {
      const code = error.code === 'LIMIT_FILE_SIZE' ? 'PDF_UPLOAD_TOO_LARGE' : 'PDF_UPLOAD_REJECTED';
      service.failUpload(batchId, sourceId, code, actor(request));
      response.status(code === 'PDF_UPLOAD_TOO_LARGE' ? 413 : 400).json({ code: -1, message: code, data: null });
    })(req, res, next);
    return run(async (request, response) => ok(response, { source: await service.complete(batchId, sourceId, request.file, actor(request)) }))(req, res, next);
  });
};
router.post('/batches/:batchId/sources/:sourceId/complete', complete);
router.post('/batches/:batchId/sources/:sourceId/retry', complete);
const ids = req => [numberId(req.params.batchId), numberId(req.params.sourceId)];
router.post('/batches/:batchId/sources/:sourceId/uploads', run((req, res) => {
  const [batchId, sourceId] = ids(req);
  return ok(res, sessions.create(batchId, sourceId, req.body || {}, actor(req)));
}));
router.get('/batches/:batchId/sources/:sourceId/uploads/:uploadId', run((req, res) => {
  const [batchId, sourceId] = ids(req);
  return ok(res, sessions.status(batchId, sourceId, req.params.uploadId));
}));
const rawChunk = express.raw({ type: 'application/octet-stream', limit: store.CHUNK_BYTES });
router.put('/batches/:batchId/sources/:sourceId/uploads/:uploadId/chunk', (req, res, next) => {
  rawChunk(req, res, error => {
    if (error) return res.status(error.type === 'entity.too.large' ? 413 : 400)
      .json({ code: -1, message: 'INVALID_UPLOAD_CHUNK', data: null });
    next();
  });
}, run((req, res) => {
  const [batchId, sourceId] = ids(req);
  return ok(res, sessions.append(batchId, sourceId, req.params.uploadId, req.query.offset, req.body));
}));
router.post('/batches/:batchId/sources/:sourceId/uploads/:uploadId/complete', run(async (req, res) => {
  const [batchId, sourceId] = ids(req);
  return ok(res, { source: await sessions.finish(batchId, sourceId, req.params.uploadId, actor(req)) });
}));
router.get('/sources/:sourceId/check', run((req, res) => ok(res, checks.status(numberId(req.params.sourceId)))));
router.post('/sources/:sourceId/check', run(async (req, res) => ok(res, { check: await checks.run(numberId(req.params.sourceId), actor(req)) })));
module.exports = router;
