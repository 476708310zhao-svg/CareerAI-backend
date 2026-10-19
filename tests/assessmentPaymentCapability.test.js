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
const scenarios=[
 {name:'master switch closed',env:{PAYMENT_ENABLED:'false'},enabled:false,code:'PAYMENT_UNAVAILABLE'},
 {name:'real launch approval missing',env:{REAL_PAYMENT_LAUNCH_APPROVED:'false'},enabled:false,code:'PAYMENT_UNAVAILABLE'},
 {name:'virtual provider incomplete',env:{VIRTUAL_PAY_APP_KEY:''},enabled:false,code:'PAYMENT_UNAVAILABLE'},
 {name:'existing required member SKU gate preserved',env:{VIRTUAL_PAY_MONTH_PRODUCT_ID:''},enabled:false,code:'PAYMENT_UNAVAILABLE'},
 {name:'virtual notification token missing',env:{VIRTUAL_PAY_NOTIFY_TOKEN:''},enabled:false,code:'PAYMENT_NOTIFICATION_UNCONFIGURED'},
 {name:'own assessment SKU missing',env:{},sku:'',enabled:false,code:'PRODUCT_PAYMENT_UNCONFIGURED'},
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
  assert.equal(results.length, 12);
  for (const result of results) await t.test(result.name, () => assert.equal(result.passed, true));
});
