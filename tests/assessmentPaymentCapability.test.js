'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

// A fresh isolated process keeps frozen payment configuration out of other suites.
const probe = String.raw`
const runtime=require('./tests/helpers/isolatedTestRuntime.cjs');
runtime.install();
const db=runtime.prepare();
const assert=require('node:assert/strict');
const express=require('express');
const service=require('./services/assessmentCommerce');
const shared={usageInstructions:'测试使用',claimInstructions:'测试领取',updateInstructions:'测试更新',afterSalesInstructions:'测试售后'};
service.saveInstructions({...shared,expectedVersion:service.getInstructions().version},'test');
const owner=Number(db.prepare('INSERT INTO users(openid,nickname) VALUES (?,?)').run('capability-owner','Test').lastInsertRowid);
const companyId=Number(db.prepare('INSERT INTO companies(slug,display_name) VALUES (?,?)').run('capability-company','测试公司').lastInsertRowid);
const product=service.saveProduct(null,{title:'能力测试资料',coverUrl:'https://example.com/cover.png',summary:'测试摘要',description:'测试介绍',catalogText:'测试目录',sampleImages:[],companyIds:[companyId],priceCents:900,status:'active',driveName:'测试网盘',driveUrl:'https://example.com/private-capability-drive',extractionCode:'1234',sourceDescription:'测试来源',virtualProductId:'assessment_test'},'test');
service.saveHome({enabled:true,items:[{companyId,productId:product.id}]},'test');
assert.equal(service.getProduct(product.id).purchaseEnabled,false);
assert.equal(service.listProducts().items.find(item=>item.id===product.id).purchaseEnabled,false);
assert.equal(service.getHome().items[0].purchaseEnabled,false);
assert.equal(Object.hasOwn(service.getProduct(product.id,true),'purchaseEnabled'),false);

const baseline={NODE_ENV:'production',PAYMENT_ENABLED:'true',REAL_PAYMENT_LAUNCH_APPROVED:'true',PAYMENT_PROVIDER:'virtual',ENABLE_MOCK_PAYMENT:'false',VIRTUAL_PAY_ENV:'0',VIRTUAL_PAY_OFFER_ID:'test-offer',VIRTUAL_PAY_APP_KEY:'test-key',VIRTUAL_PAY_SANDBOX_APP_KEY:'',VIRTUAL_PAY_NOTIFY_TOKEN:'test-notify',VIRTUAL_PAY_MONTH_PRODUCT_ID:'test-month',VIRTUAL_PAY_QUARTER_PRODUCT_ID:'test-quarter',VIRTUAL_PAY_YEAR_PRODUCT_ID:'test-year',WXPAY_MCH_ID:'test-merchant',WXPAY_API_KEY:'test-api-key',WXPAY_APP_ID:'test-app',WXPAY_NOTIFY_URL:'https://example.com/notify'};
baseline.MEMBERSHIP_PAYMENT_ENABLED='true';
// The full suite also exercises optional membership/scenario SKUs. Do not inherit its fixtures.
Object.assign(baseline,{VIRTUAL_PAY_TRIAL_PRODUCT_ID:'',VIRTUAL_PAY_RESUME_PACK_PRODUCT_ID:'',VIRTUAL_PAY_INTERVIEW_PACK_PRODUCT_ID:'',VIRTUAL_PAY_AUTUMN_PACK_PRODUCT_ID:''});
const scenarios=[
 {name:'master switch closed',env:{PAYMENT_ENABLED:'false'},enabled:false,code:'PAYMENT_UNAVAILABLE'},
 {name:'real launch approval missing',env:{REAL_PAYMENT_LAUNCH_APPROVED:'false'},enabled:false,code:'PAYMENT_UNAVAILABLE'},
 {name:'virtual provider incomplete',env:{VIRTUAL_PAY_APP_KEY:''},enabled:false,code:'PAYMENT_UNAVAILABLE'},
 {name:'assessment does not require a membership SKU',env:{VIRTUAL_PAY_MONTH_PRODUCT_ID:''},enabled:true},
 {name:'assessment works without any required membership SKUs',env:{VIRTUAL_PAY_MONTH_PRODUCT_ID:'',VIRTUAL_PAY_QUARTER_PRODUCT_ID:'',VIRTUAL_PAY_YEAR_PRODUCT_ID:''},enabled:true},
 {name:'membership sales switch does not close assessment checkout',env:{MEMBERSHIP_PAYMENT_ENABLED:'false'},enabled:true},
 {name:'virtual notification token missing',env:{VIRTUAL_PAY_NOTIFY_TOKEN:''},enabled:false,code:'PAYMENT_NOTIFICATION_UNCONFIGURED'},
 {name:'own assessment SKU missing',env:{},sku:'',enabled:false,code:'PRODUCT_PAYMENT_UNCONFIGURED'},
 {name:'real virtual missing SKU cannot fall back to permitted development mock',env:{NODE_ENV:'test',ENABLE_MOCK_PAYMENT:'true',VIRTUAL_PAY_MONTH_PRODUCT_ID:''},sku:'',enabled:false,code:'PRODUCT_PAYMENT_UNCONFIGURED'},
 {name:'real virtual missing notification token cannot fall back to permitted development mock',env:{NODE_ENV:'test',ENABLE_MOCK_PAYMENT:'true',VIRTUAL_PAY_MONTH_PRODUCT_ID:'',VIRTUAL_PAY_NOTIFY_TOKEN:''},enabled:false,code:'PAYMENT_NOTIFICATION_UNCONFIGURED'},
 {name:'configured real virtual provider',env:{},enabled:true},
 {name:'configured ordinary wxpay does not require virtual SKU',env:{PAYMENT_PROVIDER:'wxpay'},sku:'',enabled:true},
 {name:'ordinary wxpay incomplete',env:{PAYMENT_PROVIDER:'wxpay',WXPAY_API_KEY:''},enabled:false,code:'PAYMENT_UNAVAILABLE'},
 {name:'production cannot use mock fallback',env:{REAL_PAYMENT_LAUNCH_APPROVED:'false',ENABLE_MOCK_PAYMENT:'true'},enabled:false,code:'PAYMENT_UNAVAILABLE'},
 {name:'development mock requires explicit permission',env:{NODE_ENV:'test',REAL_PAYMENT_LAUNCH_APPROVED:'false'},enabled:false,code:'PAYMENT_UNAVAILABLE'},
 {name:'explicit nonproduction mock remains allowed',env:{NODE_ENV:'test',REAL_PAYMENT_LAUNCH_APPROVED:'false',ENABLE_MOCK_PAYMENT:'true'},sku:'',enabled:true}
];
(async()=>{
 const results=[];
 for(const scenario of scenarios){
  Object.assign(process.env,baseline,scenario.env);
  db.prepare('UPDATE assessment_products SET virtual_product_id=? WHERE id=?').run(scenario.sku===undefined?'assessment_test':scenario.sku,product.id);
  delete require.cache[require.resolve('./routes/payment')];
  delete require.cache[require.resolve('./routes/assessment')];
  const payment=require('./routes/payment');
  const actualProduct=service.getProduct(product.id,true);
  const capability=payment.getAssessmentPaymentAvailability(actualProduct);
  assert.equal(capability.available,scenario.enabled,scenario.name);
  if(!scenario.enabled) assert.equal(capability.code,scenario.code);
  const app=express();app.use(express.json());app.use('/api/v4',require('./routes/assessment'));
  const server=runtime.trackServer(app.listen(0,'127.0.0.1'));
  await require('node:events').once(server,'listening');
  const base='http://127.0.0.1:'+server.address().port;
  try{
   for(const endpoint of ['/assessment-products','/assessment-products/'+product.id,'/assessment-products/home']){
    const response=await fetch(base+'/api/v4'+endpoint);
    assert.equal(response.status,200);
    const value=await response.json();
    const projected=value.data.product||value.data.items.find(item=>Number(item.id||item.productId)===product.id);
    assert.equal(projected.purchaseEnabled,scenario.enabled,scenario.name+' '+endpoint);
    const encoded=JSON.stringify(value);
    for(const privateValue of [actualProduct.driveUrl,'extractionCode','virtualProductId','assessment_test']) assert.equal(encoded.includes(privateValue),false,privateValue);
   }
   if(!scenario.enabled){
    const before=db.prepare('SELECT COUNT(*) AS n FROM orders').get().n;
    await assert.rejects(payment.createAssessmentPayment({user:{userId:owner},body:{productId:product.id,expectedPriceCents:900,expectedInstructionsVersion:service.getInstructions().version,idempotencyKey:'capability-'+results.length}},actualProduct),error=>error.status===503&&error.code===scenario.code,scenario.name);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM orders').get().n,before);
   }
   results.push({name:scenario.name,passed:true});
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 }
 // Membership remains unconfigured/IS_MOCK while assessment checkout uses real virtual pay.
 Object.assign(process.env,baseline,{NODE_ENV:'test',ENABLE_MOCK_PAYMENT:'true',VIRTUAL_PAY_MONTH_PRODUCT_ID:'',VIRTUAL_PAY_QUARTER_PRODUCT_ID:'',VIRTUAL_PAY_YEAR_PRODUCT_ID:''});
 db.prepare('UPDATE assessment_products SET virtual_product_id=? WHERE id=?').run('assessment_test',product.id);
 db.prepare('UPDATE users SET wechat_session_key=? WHERE id=?').run('capability-test-session',owner);
 delete require.cache[require.resolve('./routes/payment')];
 delete require.cache[require.resolve('./routes/assessment')];
 const realPayment=require('./routes/payment');
 const app=express();app.use(express.json());app.use('/api/payment',realPayment);app.use('/api/v4',require('./routes/assessment'));
 const server=runtime.trackServer(app.listen(0,'127.0.0.1'));
 await require('node:events').once(server,'listening');
 const base='http://127.0.0.1:'+server.address().port;
 const authorization='Bearer '+require('jsonwebtoken').sign({userId:owner},process.env.JWT_SECRET);
 async function request(endpoint,body){
  const response=await fetch(base+endpoint,{method:body===undefined?'GET':'POST',headers:{Authorization:authorization,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:response.status,body:await response.json()};
 }
 try{
  const membershipConfig=(await request('/api/payment/config')).body.data;
  assert.equal(membershipConfig.available,false);
  assert.equal(membershipConfig.virtualConfigured,false);
  assert.deepEqual(membershipConfig.availablePlanIds,[]);
  assert.equal((await request('/api/payment/create-order',{planId:0})).status,503);
  const result=await request('/api/v4/assessment-orders',{productId:product.id,expectedPriceCents:900,expectedInstructionsVersion:service.getInstructions().version,idempotencyKey:'real-assessment-no-member-skus'});
  assert.equal(result.status,200);
  const {order,payment}=result.body.data;
  assert.equal(order.provider,'virtual');assert.equal(order.amount,900);
  assert.equal(payment.provider,'virtual');assert.equal(payment.mock,false);assert.equal(payment.amount,900);
  const signData=JSON.parse(payment.signData);
  assert.equal(signData.productId,'assessment_test');assert.equal(signData.goodsPrice,900);assert.equal(signData.buyQuantity,1);
  const crypto=require('node:crypto');
  assert.equal(payment.paySig,crypto.createHmac('sha256','test-key').update('requestVirtualPayment&'+payment.signData).digest('hex'));
  assert.equal(payment.signature,crypto.createHmac('sha256','capability-test-session').update(payment.signData).digest('hex'));
  const ledgerBefore=db.prepare('SELECT COUNT(*) AS n FROM commerce_ledger_v4').get().n;
  const orderBefore=JSON.stringify(service.orderRow(order.orderNo));
  assert.equal((await request('/api/payment/mock-confirm',{orderNo:order.orderNo})).status,400);
  assert.equal(JSON.stringify(service.orderRow(order.orderNo)),orderBefore);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM commerce_ledger_v4').get().n,ledgerBefore);
  const deliveryPath='/api/v4/assessment-orders/'+order.orderNo+'/delivery';
  assert.equal((await request(deliveryPath)).status,409);
  const timestamp=String(Math.floor(Date.now()/1000)),nonce='capability-real-virtual';
  const signature=crypto.createHash('sha1').update(['test-notify',timestamp,nonce].sort().join('')).digest('hex');
  const notifyPath='/api/payment/virtual-notify?'+new URLSearchParams({signature,timestamp,nonce});
  const notification={Event:'xpay_goods_deliver_notify',OutTradeNo:order.orderNo,OpenId:'capability-owner',WeChatPayInfo:{PayAmount:900,TransactionId:'capability-real-tx'},GoodsInfo:{ProductId:'assessment_test',BuyQuantity:1}};
  for(const [endpoint,body] of [
   ['/api/payment/virtual-notify',notification],
   [notifyPath,{...notification,GoodsInfo:{ProductId:'wrong',BuyQuantity:1}}],
   [notifyPath,{...notification,GoodsInfo:{ProductId:'assessment_test',BuyQuantity:2}}],
   [notifyPath,{...notification,WeChatPayInfo:{PayAmount:1,TransactionId:'capability-real-tx'}}]
  ]){
   assert.notEqual((await request(endpoint,body)).body.ErrCode,0);
   assert.equal(service.orderRow(order.orderNo).status,'pending');
   assert.equal((await request(deliveryPath)).status,409);
  }
  assert.equal((await request(notifyPath,notification)).body.ErrCode,0);
  assert.equal(service.orderRow(order.orderNo).status,'paid');
  assert.equal((await request(deliveryPath)).body.data.link,product.driveUrl);
  const paidLedger=db.prepare('SELECT COUNT(*) AS n FROM commerce_ledger_v4').get().n;
  assert.equal((await request(notifyPath,notification)).body.ErrCode,0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM commerce_ledger_v4').get().n,paidLedger);
  assert.equal(db.prepare('SELECT vip_level FROM users WHERE id=?').get(owner).vip_level,0);
  // Closing new sales does not revoke an already paid purchase.
  service.saveProduct(product.id,{status:'inactive'},'test');
  Object.assign(process.env,baseline,{PAYMENT_ENABLED:'false'});
  delete require.cache[require.resolve('./routes/payment')];
  const closed=require('./routes/payment');
  assert.equal(closed.getAssessmentPaymentAvailability(service.getProduct(product.id,true)).available,false);
  assert.equal((await closed.createAssessmentPayment({user:{userId:owner},body:{productId:product.id}},service.getProduct(product.id,true))).alreadyPurchased,true);
  assert.equal((await request(deliveryPath)).body.data.link,product.driveUrl);
  const commerce=require('./services/v4Commerce');
  const refund=commerce.requestRefund(owner,{orderNo:order.orderNo,confirmRequest:true,reason:'隔离退款验证'});
  commerce.decideRefund(refund.refundNo,{status:'approved'},'test');
  commerce.decideRefund(refund.refundNo,{status:'completed',confirmExternalRefund:true,externalReference:'capability-external-refund'},'test');
  assert.equal(service.orderRow(order.orderNo).status,'refunded');
  assert.equal((await request(deliveryPath)).status,409);
  assert.notEqual((await request(notifyPath,notification)).body.ErrCode,0);
  assert.equal(service.orderRow(order.orderNo).status,'refunded');
  results.push({name:'real assessment checkout callbacks delivery and refund work independently of member readiness',passed:true});
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 service.saveProduct(product.id,{status:'active'},'test');
 // Even with all member/scenario SKUs configured, assessment-only operation must not sell them.
 Object.assign(process.env,baseline,{MEMBERSHIP_PAYMENT_ENABLED:'false',VIRTUAL_PAY_TRIAL_PRODUCT_ID:'test-trial',VIRTUAL_PAY_RESUME_PACK_PRODUCT_ID:'test-resume',VIRTUAL_PAY_INTERVIEW_PACK_PRODUCT_ID:'test-interview',VIRTUAL_PAY_AUTUMN_PACK_PRODUCT_ID:'test-autumn'});
 delete require.cache[require.resolve('./routes/payment')];
 const assessmentOnlyPayment=require('./routes/payment');
 const assessmentOnlyApp=express();assessmentOnlyApp.use(express.json());assessmentOnlyApp.use('/api/payment',assessmentOnlyPayment);
 const assessmentOnlyServer=runtime.trackServer(assessmentOnlyApp.listen(0,'127.0.0.1'));
 await require('node:events').once(assessmentOnlyServer,'listening');
 const assessmentOnlyBase='http://127.0.0.1:'+assessmentOnlyServer.address().port;
 async function assessmentOnlyRequest(endpoint,body){
  const response=await fetch(assessmentOnlyBase+endpoint,{method:body===undefined?'GET':'POST',headers:{Authorization:authorization,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:response.status,body:await response.json()};
 }
 try{
  const memberConfig=(await assessmentOnlyRequest('/api/payment/config')).body.data;
  for(const key of ['enabled','available','configured','mock','virtualConfigured']) assert.equal(memberConfig[key],false,key);
  assert.deepEqual(memberConfig.availablePlanIds,[]);assert.match(memberConfig.reason,/已关闭/);
  const orderCount=db.prepare('SELECT COUNT(*) AS n FROM orders').get().n;
  const ledgerCount=db.prepare('SELECT COUNT(*) AS n FROM commerce_ledger_v4').get().n;
  for(const planId of [0,1,2,3,4,5,6]){
   // Each assertion isolates sales gating from the shared three-request/IP anti-abuse budget.
   await require('./middleware/rateLimit').paymentLimiter.resetKey('127.0.0.1');
   assert.equal((await assessmentOnlyRequest('/api/payment/create-order',{planId})).status,503);
  }
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM orders').get().n,orderCount);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM commerce_ledger_v4').get().n,ledgerCount);
  const only=await assessmentOnlyPayment.createAssessmentPayment({user:{userId:owner},body:{productId:product.id,expectedPriceCents:900,expectedInstructionsVersion:service.getInstructions().version,idempotencyKey:'assessment-only-with-all-member-skus'}},service.getProduct(product.id,true));
  assert.equal(only.payment.provider,'virtual');assert.equal(only.payment.mock,false);assert.equal(only.payment.amount,900);
  // Default/unset retains existing membership availability for configured providers.
  // trackServer reasserts safe test environment defaults; restore only this module's synthetic configuration.
  Object.assign(process.env,baseline,{VIRTUAL_PAY_TRIAL_PRODUCT_ID:'test-trial',VIRTUAL_PAY_RESUME_PACK_PRODUCT_ID:'test-resume',VIRTUAL_PAY_INTERVIEW_PACK_PRODUCT_ID:'test-interview',VIRTUAL_PAY_AUTUMN_PACK_PRODUCT_ID:'test-autumn'});
  delete process.env.MEMBERSHIP_PAYMENT_ENABLED;
  delete require.cache[require.resolve('./routes/payment')];
  const defaultApp=express();defaultApp.use('/api/payment',require('./routes/payment'));
  const defaultServer=runtime.trackServer(defaultApp.listen(0,'127.0.0.1'));await require('node:events').once(defaultServer,'listening');
  try{
   const config=(await (await fetch('http://127.0.0.1:'+defaultServer.address().port+'/api/payment/config')).json()).data;
   assert.equal(config.enabled,true);assert.equal(config.available,true);assert.deepEqual(config.availablePlanIds,[0,1,2,3,4,5,6]);
  }finally{defaultServer.closeAllConnections();await new Promise(resolve=>defaultServer.close(resolve));}
  results.push({name:'membership switch denies all new member and scenario orders without blocking assessment and preserves default compatibility',passed:true});
 }finally{assessmentOnlyServer.closeAllConnections();await new Promise(resolve=>assessmentOnlyServer.close(resolve));}
 // Gating new sales must not block historical owned-order lookup or delivery.
 Object.assign(process.env,baseline,{PAYMENT_ENABLED:'false'});
 delete require.cache[require.resolve('./routes/payment')];
 const closedPayment=require('./routes/payment');
 const historical=service.createOrder(owner,{productId:product.id,expectedPriceCents:900,expectedInstructionsVersion:service.getInstructions().version,idempotencyKey:'capability-history'},'mock').row;
 service.markPaid(historical,'capability-history-paid',900);
 const owned=await closedPayment.createAssessmentPayment({user:{userId:owner},body:{productId:product.id}},service.getProduct(product.id,true));
 assert.equal(owned.alreadyPurchased,true);
 assert.equal(owned.payment,null);
 assert.equal(service.delivery(historical.order_no,owner).link,product.driveUrl);
 console.log('CAPABILITY_RESULTS='+JSON.stringify(results));
 await runtime.cleanup();
})().catch(error=>{console.error(error);process.exitCode=1;});
`;

test('assessment public purchase capability matches checkout gates without opening payment', async t => {
  const child = spawnSync(process.execPath, ['-e', probe], {
    cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 60000, maxBuffer: 2 * 1024 * 1024,
  });
  assert.equal(child.error, undefined);
  assert.equal(child.status, 0, child.stderr + '\n' + child.stdout);
  const line = child.stdout.split(/\r?\n/).find(value => value.startsWith('CAPABILITY_RESULTS='));
  assert.ok(line, 'isolated capability verification completed');
  const results = JSON.parse(line.slice('CAPABILITY_RESULTS='.length));
 assert.equal(results.length, 18);
  for (const result of results) await t.test(result.name, () => assert.equal(result.passed, true));
});
