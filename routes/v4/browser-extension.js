'use strict';

const express = require('express');
const { authMiddleware } = require('../../middleware/auth');
const { ok, fail } = require('../../utils/response');
const grants = require('../../services/browserExtensionGrant');

const router = express.Router();
router.post('/applications/:id/extension-grants', authMiddleware, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return fail(res, '申请记录不存在', 404);
  try { return ok(res, grants.create(req.user.userId, id, req.body || {}), '一次性授权已创建'); }
  catch (error) { return fail(res, error.message || '授权创建失败', error.status || 500); }
});

router.delete('/applications/:id/extension-grants/:grantId', authMiddleware, (req, res) => {
  const applicationId = Number(req.params.id);
  const grantId = Number(req.params.grantId);
  if (![applicationId, grantId].every(id => Number.isSafeInteger(id) && id > 0)) return fail(res, '授权不存在', 404);
  try { return ok(res, grants.revoke(req.user.userId, applicationId, grantId), '授权已撤销'); }
  catch (error) { return fail(res, error.message || '撤销失败', error.status || 500); }
});

router.post('/browser-extension/consume', (req, res) => {
  const token = String(req.body?.token || req.get('Authorization')?.replace(/^Bearer\s+/i, '') || '');
  if (token.length < 40 || token.length > 100) return fail(res, '授权无效', 401);
  try { return ok(res, grants.consume(token, req.body?.boardHost), '授权已消费'); }
  catch (error) { return fail(res, error.message || '授权消费失败', error.status || 500); }
});

module.exports = router;
