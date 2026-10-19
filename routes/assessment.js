'use strict';
const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { paymentLimiter } = require('../middleware/rateLimit');
const { ok } = require('../utils/response');
const service = require('../services/assessmentCommerce');
const payment = require('./payment');
const db = require('../db/database');
const router = express.Router();
const userAuth = [authMiddleware,(req,res,next)=>{
  res.set('Cache-Control','no-store');
  const userId=Number(req.user && req.user.userId);
  if(!Number.isSafeInteger(userId)||userId<1||!db.prepare('SELECT id FROM users WHERE id=?').get(userId)) return res.status(401).json({code:-1,message:'请重新登录',data:null});
  req.user.userId=userId; next();
}];
const run = fn => (req,res,next) => Promise.resolve().then(()=>fn(req,res)).catch(error => {
  if (!error.status) return next(error);
  return res.status(error.status).json({code:error.code || -1,message:error.message,data:null});
});
router.get('/assessment-products/home',run((_req,res)=>ok(res,service.getHome(false,payment.getAssessmentPaymentAvailability))));
router.get('/assessment-products',run((req,res)=>ok(res,service.listProducts(req.query,false,payment.getAssessmentPaymentAvailability))));
router.get('/assessment-products/:id',run((req,res)=>ok(res,{product:service.getProduct(req.params.id,false,payment.getAssessmentPaymentAvailability)})));
router.post('/assessment-orders',userAuth,paymentLimiter,run(async(req,res)=> {
  const product = service.getProduct(req.body.productId,true);
  return ok(res,await payment.createAssessmentPayment(req,product));
}));
router.get('/assessment-purchases',userAuth,run((req,res)=>ok(res,service.listOrders(req.query,req.user.userId))));
router.get('/assessment-orders/:orderNo/delivery',userAuth,run((req,res)=>ok(res,service.delivery(req.params.orderNo,req.user.userId))));
router.get('/assessment-orders/:orderNo',userAuth,run((req,res)=>ok(res,{order:service.orderView(service.orderRow(req.params.orderNo,req.user.userId))})));
module.exports=router;
