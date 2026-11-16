'use strict';

const express=require('express');
const adminAuth=require('../middleware/adminAuth');
const service=require('../services/manualServiceRequests');
const router=express.Router();
router.use(adminAuth);
router.use((req,res,next)=>{ if(req.method==='GET')res.set('Cache-Control','no-store'); next(); });
function sendError(res,error){const status=Number(error.status)||500;return res.status(status).json({code:error.code||-1,message:status>=500?'工单服务暂时不可用':error.message,data:error.data});}
function id(value){const n=Number(value);return Number.isSafeInteger(n)&&n>0?n:null;}

router.get('/',(req,res)=>{try{return res.json({code:0,data:{list:service.listAdmin({status:req.query.status,serviceType:req.query.serviceType,limit:req.query.limit})}});}catch(error){return sendError(res,error);}});
router.get('/:id',(req,res)=>{const key=id(req.params.id);if(!key)return res.status(400).json({code:-1,message:'工单 ID 无效'});try{return res.json({code:0,data:service.getAdmin(key)});}catch(error){return sendError(res,error);}});
router.patch('/:id/status',(req,res)=>{const key=id(req.params.id);if(!key)return res.status(400).json({code:-1,message:'工单 ID 无效'});try{return res.json({code:0,data:service.adminTransition(key,req.body||{},req.admin&&req.admin.sub)});}catch(error){return sendError(res,error);}});
router.post('/:id/deliveries',(req,res)=>{const key=id(req.params.id);if(!key)return res.status(400).json({code:-1,message:'工单 ID 无效'});try{return res.status(201).json({code:0,data:service.addDelivery(key,req.body||{},req.admin&&req.admin.sub)});}catch(error){return sendError(res,error);}});
module.exports=router;
