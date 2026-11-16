'use strict';
const express = require('express');
const db = require('../db/database');
const { authMiddleware } = require('../middleware/auth');
const { ok } = require('../utils/response');
const { createQuestionPractice } = require('../services/questionPractice');

const router = express.Router();
const service = createQuestionPractice(db);
const userId = req => req.user.userId;
const run = handler => (req,res,next) => Promise.resolve().then(() => handler(req,res)).catch(error => {
  if (!error.status) return next(error);
  res.status(error.status).json({ code:error.code || 'QUESTION_PRACTICE_ERROR',message:error.message,data:null });
});
router.use((_req,res,next) => { res.set('Cache-Control','no-store'); next(); });
router.use(authMiddleware);
router.use((req,res,next) => {
  const id = Number(req.user.userId);
  const user = Number.isSafeInteger(id) && id > 0 ? db.prepare('SELECT openid FROM users WHERE id=?').get(id) : null;
  if (!user || (req.user.openid && user.openid && req.user.openid !== user.openid))
    return res.status(401).json({ code:'USER_NOT_FOUND',message:'USER_NOT_FOUND',data:null });
  req.user.userId = id;
  next();
});

router.get('/sets',run((req,res) => ok(res,service.listSets(req.query,userId(req)))));
router.post('/sets/:setId/sessions',run((req,res) => ok(res,service.start(req.params.setId,req.body,userId(req)))));
router.get('/sessions',run((req,res) => ok(res,service.listSessions(req.query,userId(req)))));
router.get('/sessions/:sessionId',run((req,res) => ok(res,service.sessionDetail(req.params.sessionId,userId(req)))));
router.get('/sessions/:sessionId/report',run((req,res) => ok(res,service.report(req.params.sessionId,userId(req)))));
router.post('/sessions/:sessionId/finish',run((req,res) => ok(res,service.finish(req.params.sessionId,userId(req)))));
router.get('/sessions/:sessionId/items/:position',run((req,res) => ok(res,service.question(req.params.sessionId,req.params.position,userId(req)))));
router.post('/sessions/:sessionId/items/:position/submit',run((req,res) => ok(res,service.submit(req.params.sessionId,req.params.position,req.body,userId(req)))));
router.get('/sessions/:sessionId/items/:position/result',run((req,res) => ok(res,service.result(req.params.sessionId,req.params.position,userId(req)))));
router.put('/sessions/:sessionId/items/:position/favorite',run((req,res) => ok(res,service.setFavorite(req.params.sessionId,req.params.position,userId(req),true))));
router.delete('/sessions/:sessionId/items/:position/favorite',run((req,res) => ok(res,service.setFavorite(req.params.sessionId,req.params.position,userId(req),false))));
router.get('/mistakes',run((req,res) => ok(res,service.mistakes(req.query,userId(req)))));
router.get('/favorites',run((req,res) => ok(res,service.favorites(req.query,userId(req)))));

module.exports = router;
