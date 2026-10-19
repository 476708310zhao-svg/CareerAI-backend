'use strict';
const express = require('express');
const adminAuth = require('../middleware/adminAuth');
const { ok } = require('../utils/response');
const db = require('../db/database');
const service = require('../services/assessmentCommerce');
const commerce = require('../services/v4Commerce');
const router = express.Router();
const run = fn => (req,res,next) => Promise.resolve().then(()=>fn(req,res)).catch(error=>{
  if (!error.status) return next(error);
  return res.status(error.status).json({code:error.code || -1,message:error.message,data:null});
});
const actor = req => String(req.admin.id || req.admin.username || 'admin');
router.use(adminAuth);
router.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});
router.get('/assessment-instructions',run((_req,res)=>ok(res,service.getInstructions())));
router.put('/assessment-instructions',run((req,res)=>ok(res,service.saveInstructions(req.body,actor(req)))));
router.get('/assessment-companies',run((_req,res)=>ok(res,{items:db.prepare('SELECT id,display_name AS name,logo_url AS logo FROM companies ORDER BY display_name LIMIT 2000').all()})));
router.get('/assessment-products',run((req,res)=>ok(res,service.listProducts(req.query,true))));
router.post('/assessment-products',run((req,res)=>ok(res,{product:service.saveProduct(null,req.body,actor(req))})));
router.get('/assessment-products/:id',run((req,res)=>ok(res,{product:service.getProduct(req.params.id,true)})));
router.patch('/assessment-products/:id',run((req,res)=>ok(res,{product:service.saveProduct(req.params.id,req.body,actor(req))})));
router.get('/assessment-home',run((_req,res)=>ok(res,service.getHome(true))));
router.put('/assessment-home',run((req,res)=>ok(res,service.saveHome(req.body,actor(req)))));
router.get('/assessment-orders',run((req,res)=>ok(res,service.listOrders(req.query))));
router.post('/assessment-orders/:orderNo/retry-delivery',run((req,res)=>{
  const row=service.orderRow(req.params.orderNo);
  if(row.status!=='paid') throw service.problem('ORDER_NOT_PAID','只能重试已支付订单',409);
  const result=service.markPaid(row,row.transaction_id,row.amount,{});
  if(!result.ok) throw service.problem('DELIVERY_RETRY_FAILED',result.message,result.status);
  return ok(res,{order:service.orderView(service.orderRow(row.order_no))});
}));
router.post('/assessment-orders/:orderNo/refund-completed',run((req,res)=>{
  const row=service.orderRow(req.params.orderNo);
  if(req.body.confirmExternalRefund!==true || !String(req.body.externalReference||'').trim()) throw service.problem('EXTERNAL_REFUND_EVIDENCE_REQUIRED','请确认外部退款已完成并填写凭据');
  if(row.status==='refunded') return ok(res,{already:true,order:service.orderView(row)});
  if(!['paid','payment_review'].includes(row.status)) throw service.problem('ORDER_NOT_PAID','仅已收款订单可记录退款',409);
  const result=db.transaction(()=>{
    if(!db.prepare('SELECT id FROM users WHERE id=?').get(row.user_id)) {
      // Historical accounting orders survive account deletion. Keep the receipt in
      // the existing ledger because legacy refund rows require a live user FK.
      const refundNo='RFAS'+Date.now().toString(36)+require('crypto').randomBytes(5).toString('hex');
      db.prepare("UPDATE orders SET status='refunded' WHERE order_no=? AND status IN ('paid','payment_review')").run(row.order_no);
      service.revokeDelivery(row.order_no);
      commerce.recordLedger({idempotencyKey:`refund-completed:${refundNo}`,eventType:'refund_completed',orderNo:row.order_no,refundNo,
        planCode:`assessment:${row.assessment_product_id}`,amountDelta:-row.amount,actorType:'admin',actorId:actor(req),
        metadata:{externalReference:String(req.body.externalReference).trim().slice(0,160),note:String(req.body.note||'').slice(0,500),accountDeleted:true}});
      return {already:false,refund:{refundNo,orderNo:row.order_no,amount:row.amount,status:'completed'}};
    }
    let refund=db.prepare("SELECT refund_no,status FROM payment_refunds_v4 WHERE order_no=? AND status!='rejected' ORDER BY id DESC LIMIT 1").get(row.order_no);
    if(!refund) {const created=commerce.requestRefund(row.user_id,{orderNo:row.order_no,reason:String(req.body.note||'后台记录人工退款'),confirmRequest:true});refund={refund_no:created.refundNo,status:'requested'};}
    if(refund.status==='requested') commerce.decideRefund(refund.refund_no,{status:'approved',note:req.body.note},actor(req));
    return commerce.decideRefund(refund.refund_no,{status:'completed',confirmExternalRefund:true,externalReference:req.body.externalReference,note:req.body.note},actor(req));
  })();
  return ok(res,{...result,order:service.orderView(service.orderRow(row.order_no))});
}));
module.exports=router;
