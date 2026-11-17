'use strict';

const express = require('express');
const { authMiddleware } = require('../../middleware/auth');
const service = require('../../services/manualServiceRequests');

const router = express.Router();
router.use(authMiddleware);
router.use((req, res, next) => { if (req.method === 'GET') res.set('Cache-Control', 'no-store'); next(); });

function sendError(res, error) {
  const status = Number(error.status) || 500;
  return res.status(status).json({ code: error.code || -1,
    message: status >= 500 ? '人工服务暂时不可用' : error.message, data: error.data });
}
function requestId(value) { const id=Number(value); return Number.isSafeInteger(id)&&id>0?id:null; }

router.get('/consent', (_req,res) => res.json({ code:0, data:{ version:service.CONSENT_VERSION,
  services:Object.entries(service.SERVICES).map(([type,item])=>({type,title:item.title,consentText:item.consentText,
    allowedScopes:Object.entries(service.SCOPE_LABELS).map(([value,label])=>({value,label})) })),
  defaultDurationDays:30,maxDurationDays:90 } }));
router.get('/', (req,res) => {
  try { return res.json({code:0,data:{list:service.listMine(req.user.userId)}}); }
  catch(error){ return sendError(res,error); }
});
router.post('/', (req,res) => {
  try { return res.status(201).json({code:0,data:service.create(req.user.userId,req.body||{})}); }
  catch(error){ return sendError(res,error); }
});
router.get('/:id', (req,res) => {
  const id=requestId(req.params.id); if(!id)return res.status(400).json({code:-1,message:'工单 ID 无效'});
  try { return res.json({code:0,data:service.getMine(req.user.userId,id)}); }
  catch(error){ return sendError(res,error); }
});
router.post('/:id/revoke', (req,res) => {
  const id=requestId(req.params.id); if(!id)return res.status(400).json({code:-1,message:'工单 ID 无效'});
  try { return res.json({code:0,data:service.revoke(req.user.userId,id,req.body&&req.body.expectedVersion)}); }
  catch(error){ return sendError(res,error); }
});

module.exports=router;
