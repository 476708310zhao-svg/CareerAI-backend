'use strict';

const express = require('express');
const { authMiddleware } = require('../../middleware/auth');
const networking = require('../../services/v4Networking');
const analytics = require('../../services/v4Analytics');

const router = express.Router();
router.use(authMiddleware);

function sendError(res, problem) {
  return res.status(problem.status || 400).json({
    code: problem.code || 'NETWORKING_ERROR',
    message: problem.message || 'Networking 操作失败',
    data: null
  });
}

function run(res, action) {
  try { return action(); } catch (problem) { return sendError(res, problem); }
}

router.get('/dashboard', (req, res) => run(res, () => {
  return res.json({ code: 0, data: networking.dashboard(req.user.userId) });
}));

router.get('/contacts', (req, res) => run(res, () => {
  return res.json({ code: 0, data: networking.listContacts(req.user.userId, req.query.status) });
}));

router.post('/contacts', (req, res) => run(res, () => {
  const data = networking.createContact(req.user.userId, req.body);
  analytics.track(req.user.userId, 'networking_contact_created', {
    networkingContactId: data.id, applicationId: data.applicationId, channel: data.channel
  }, '/api/v4/networking/contacts');
  return res.status(201).json({ code: 0, data, message: '联系人已创建' });
}));

router.patch('/contacts/:id', (req, res) => run(res, () => {
  const data = networking.updateContact(req.user.userId, req.params.id, req.body);
  return res.json({ code: 0, data, message: '联系人已更新' });
}));

router.post('/contacts/:id/stage', (req, res) => run(res, () => {
  const data = networking.updateStage(req.user.userId, req.params.id, req.body && req.body.stage, req.body && req.body.note);
  analytics.track(req.user.userId, 'networking_stage_updated', {
    networkingContactId: data.id, stage: data.status, applicationId: data.applicationId
  }, '/api/v4/networking/contacts/:id/stage');
  return res.json({ code: 0, data, message: `联系人阶段已更新为${data.statusLabel}` });
}));

router.get('/drafts', (req, res) => run(res, () => {
  return res.json({
    code: 0,
    data: networking.listDrafts(req.user.userId, req.query.contactId, req.query.limit)
  });
}));

router.post('/contacts/:id/drafts', (req, res) => run(res, () => {
  const data = networking.createDraft(req.user.userId, req.params.id, req.body);
  analytics.track(req.user.userId, 'networking_draft_created', {
    networkingContactId: data.contactId, networkingDraftId: data.id, draftType: data.type,
    externalAiRequest: false
  }, '/api/v4/networking/contacts/:id/drafts');
  return res.status(201).json({
    code: 0,
    data,
    message: '可编辑草稿已生成；系统不会自动发送'
  });
}));

router.patch('/drafts/:id', (req, res) => run(res, () => {
  const data = networking.updateDraft(req.user.userId, req.params.id, req.body);
  return res.json({ code: 0, data, message: '草稿已保存' });
}));

router.post('/drafts/:id/mark-sent', (req, res) => run(res, () => {
  const data = networking.markDraftSent(req.user.userId, req.params.id, req.body);
  analytics.track(req.user.userId, 'networking_user_reported_sent', {
    networkingContactId: data.contact.id, networkingDraftId: data.draft.id,
    draftType: data.draft.type, sentBySystem: false
  }, '/api/v4/networking/drafts/:id/mark-sent');
  return res.json({
    code: 0,
    data,
    message: '已记录为你本人外部发送；系统未执行发送'
  });
}));

router.post('/contacts/:id/referral', (req, res) => run(res, () => {
  const data = networking.recordReferral(req.user.userId, req.params.id, req.body);
  analytics.track(req.user.userId, 'networking_referral_updated', {
    networkingContactId: data.id, referralOutcome: data.referralOutcome,
    applicationId: data.applicationId, resumeId: data.resumeId, jobId: data.jobId
  }, '/api/v4/networking/contacts/:id/referral');
  return res.json({ code: 0, data, message: 'Referral 结果已记录' });
}));

module.exports = router;
