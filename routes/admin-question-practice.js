'use strict';
const express = require('express');
const db = require('../db/database');
const adminAuth = require('../middleware/adminAuth');
const { getAccount } = require('../utils/adminAccounts');
const { hasPermission } = require('../utils/adminPermissions');
const { ok } = require('../utils/response');
const { createQuestionPractice } = require('../services/questionPractice');

const router = express.Router(), service = createQuestionPractice(db);
const run = handler => (req,res,next) => Promise.resolve().then(() => handler(req,res)).catch(error => {
  if (!error.status) return next(error);
  res.status(error.status).json({code:error.code || 'QUESTION_PRACTICE_ERROR',message:error.message,data:null});
});
router.use((_req,res,next) => { res.set('Cache-Control','no-store'); next(); });
router.use(adminAuth);
router.use((req,res,next) => {
  const account = Number.isSafeInteger(req.admin.id) && req.admin.id > 0 ? getAccount(req.admin.id) : null;
  if (!account || !account.is_active || account.username !== req.admin.sub)
    return res.status(403).json({code:'ADMIN_INACTIVE',message:'ADMIN_INACTIVE',data:null});
  req.admin = {...req.admin,id:account.id,username:account.username,adminRole:account.role,permissions:account.permissions};
  if (!hasPermission(req.admin,'questionBankPublish'))
    return res.status(403).json({code:'PERMISSION_DENIED',message:'PERMISSION_DENIED',data:null});
  next();
});
router.get('/sets/:setId/publication',run((req,res) => ok(res,{publication:service.publication(req.params.setId)})));
router.put('/sets/:setId/publication',run((req,res) => ok(res,
  service.setPublication(req.params.setId,req.body,String(req.admin.id)))));
module.exports = router;
