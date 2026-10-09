'use strict';
const router = require('express').Router();
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const db = require('../db/database');
const {authMiddleware} = require('../middleware/auth');
const {store} = require('../services/webSessionCodes');
router.use((_req,res,next) => { res.set('Cache-Control','no-store'); next(); });
router.post('/code', authMiddleware, rateLimit({windowMs:60000,max:5}), (req,res,next) => {
  try {
    if (!db.prepare('SELECT id FROM users WHERE id=?').get(req.user.userId)) return res.status(401).json({code:-1,message:'请重新登录'});
    res.json({code:0,data:store.issue(req.user.userId)});
  } catch (err) { next(err); }
});
router.post('/redeem', rateLimit({windowMs:15*60000,max:10,message:{code:-1,message:'登录尝试过多，请稍后再试'}}), (req,res) => {
  const id = store.redeem(req.body?.code);
  const user = id ? db.prepare('SELECT id,nickname,openid FROM users WHERE id=?').get(id) : null;
  if (!user) return res.status(401).json({code:-1,message:'登录码无效或已过期，请在小程序重新生成'});
  const token = jwt.sign({userId:user.id,openid:user.openid},process.env.JWT_SECRET,{expiresIn:process.env.JWT_EXPIRES_IN || '7d'});
  return res.json({code:0,data:{token,user:{id:user.id,nickname:user.nickname}}});
});
module.exports = router;
