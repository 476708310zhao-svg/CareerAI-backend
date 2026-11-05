'use strict';
const runtime=require('./helpers/isolatedTestRuntime.cjs');
runtime.install();
const db=runtime.prepare();
const test=require('node:test');
runtime.registerCleanup(test);
const assert=require('node:assert/strict');
const express=require('express');
const jwt=require('jsonwebtoken');
const {execFileSync}=require('node:child_process');
const service=require('../services/assessmentCommerce');
const sharedCopy={usageInstructions:'测试使用说明',claimInstructions:'测试领取说明',updateInstructions:'测试更新说明',afterSalesInstructions:'测试售后说明'};
service.saveInstructions({...sharedCopy,expectedVersion:service.getInstructions().version},'test-admin');
const commerce=require('../services/v4Commerce');
const stamp=Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const users=[],companies=[],products=[];
let server,base;
function user(){const n=Number(db.prepare('INSERT INTO users(openid,nickname) VALUES (?,?)').run('assessment_'+stamp+'_'+users.length,'Assessment test').lastInsertRowid);users.push(n);return n;}
function company(){const n=Number(db.prepare('INSERT INTO companies(slug,display_name) VALUES (?,?)').run('assessment-'+stamp+'-'+companies.length,'测评测试公司 '+companies.length).lastInsertRowid);companies.push(n);return n;}
function product(companyIds=[], extra={}) {
  const row=service.saveProduct(null,{title:'测评资料 '+stamp+' '+products.length,coverUrl:'https://example.com/cover.png',summary:'测试摘要',priceCents:900,status:'active',description:'资料介绍',catalogText:'目录说明',sampleImages:[],companyIds,
    driveName:'测试网盘',driveUrl:'https://example.com/drive/secret',extractionCode:'1234',usageInstructions:'打开网盘保存',claimInstructions:'付款后领取',updateInstructions:'仅本资料纠错',afterSalesInstructions:'联系客服',sourceDescription:'授权测试内容',...extra},'test-admin');products.push(row.id);return row;
}
function payload(row,extra={}){return {productId:row.id,expectedPriceCents:row.priceCents,expectedInstructionsVersion:service.getInstructions().version,idempotencyKey:stamp+'-'+Math.random().toString(36).slice(2),...extra};}
function reserve(row,userId,extra={}){return service.createOrder(userId,payload(row,extra),'mock');}
function token(value){return jwt.sign(value,process.env.JWT_SECRET);}
async function http(path,{userId,admin,body,method='GET',authToken}={}){
  const headers={};if(body!==undefined)headers['Content-Type']='application/json';
  const auth=authToken || (admin ? token({role:'admin',username:'test',permissions:admin}) : userId ? token({userId}) : '');
  if(auth)headers.Authorization='Bearer '+auth;
  const response=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  return {response,body:await response.json()};
}
test.before(async()=>{
  const app=express();app.use(express.json());app.use('/api/payment',require('../routes/payment'));
  const paymentPath=require.resolve('../routes/payment'),cached=require.cache[paymentPath];
  const keys=['VIRTUAL_PAY_NOTIFY_TOKEN','WXPAY_API_KEY','WXPAY_MCH_ID','WXPAY_APP_ID'];
  const previous=keys.map(key=>process.env[key]);
  Object.assign(process.env,{VIRTUAL_PAY_NOTIFY_TOKEN:'assessment-test-notify',WXPAY_API_KEY:'assessment-test-api-key',WXPAY_MCH_ID:'assessment-test-merchant',WXPAY_APP_ID:'assessment-test-app'});
  delete require.cache[paymentPath];app.use('/signed-payment',require('../routes/payment'));require.cache[paymentPath]=cached;
  keys.forEach((key,i)=>{if(previous[i]===undefined)delete process.env[key];else process.env[key]=previous[i];});
  app.use('/api/v4',require('../routes/assessment'));app.use('/admin/api/v4',require('../routes/admin-assessment'));
  app.use('/api/users',require('../routes/users'));
  app.use((error,_req,res,_next)=>res.status(error.status||500).json({code:error.code,message:error.message}));
  server=runtime.trackServer(app.listen(0,'127.0.0.1'));await require('node:events').once(server,'listening');base='http://127.0.0.1:'+server.address().port;
});
test.after(()=>{
  // All fixtures belong to the disposable runtime database, never the project database.
  server.close();
});

test('assessment shared instructions are centrally protected, validated and audited with optimistic versions',async()=>{
  const endpoint='/admin/api/v4/assessment-instructions';
  assert.equal((await http(endpoint)).response.status,401);
  assert.equal((await http(endpoint,{admin:['companies']})).response.status,403);
  for(const permission of [['memberships'],['*']]) {
    const response=await http(endpoint,{admin:permission});assert.equal(response.response.status,200);
    assert.equal(response.response.headers.get('cache-control'),'no-store');
  }
  const current=service.getInstructions();
  for(const change of [{usageInstructions:''},{claimInstructions:'<script>alert(1)</script>'},{updateInstructions:'x'.repeat(20001)},{afterSalesInstructions:{text:'object'}}]) {
    const response=await http(endpoint,{admin:['memberships'],method:'PUT',body:{...sharedCopy,expectedVersion:current.version,...change}});
    assert.equal(response.response.status,400);
  }
  const saved=await http(endpoint,{admin:['memberships'],method:'PUT',body:{...sharedCopy,expectedVersion:current.version}});
  assert.equal(saved.response.status,200);assert.equal(saved.body.data.version,current.version+1);
  assert.equal((await http(endpoint,{admin:['*'],method:'PUT',body:{...sharedCopy,expectedVersion:current.version}})).response.status,409);
  assert.match(db.prepare('SELECT action FROM assessment_product_audit WHERE product_id=0 ORDER BY id DESC LIMIT 1').pluck().get(),/^shared_instructions_updated:v\d+$/);
});

test('assessment shared terms replace single-product fields, quote versions and preserve paid snapshots',()=>{
  const first=product(),second=product(),owner=user();
  assert.equal(service.getProduct(first.id).usageInstructions,service.getProduct(second.id).usageInstructions);
  service.saveProduct(first.id,{usageInstructions:'不能单品覆盖'},'tester');
  assert.equal(service.getProduct(first.id).usageInstructions,sharedCopy.usageInstructions);
  const oldVersion=service.getInstructions().version;
  assert.throws(()=>reserve(first,user(),{expectedInstructionsVersion:undefined}),error=>error.code==='INSTRUCTIONS_CHANGED');
  const paid=reserve(first,owner).row,pending=reserve(second,user()).row;
  service.markPaid(paid,'shared-paid-'+stamp,900);
  const before=service.orderRow(paid.order_no).snapshot;
  service.saveInstructions({...sharedCopy,usageInstructions:'第二版统一使用说明',expectedVersion:oldVersion},'tester');
  assert.equal(service.orderRow(pending.order_no).status,'cancelled');
  assert.equal(service.orderRow(paid.order_no).snapshot,before);
  assert.equal(service.delivery(paid.order_no,owner).usageInstructions,sharedCopy.usageInstructions);
  assert.equal(service.getProduct(second.id).usageInstructions,'第二版统一使用说明');
  assert.throws(()=>reserve(second,user(),{expectedInstructionsVersion:oldVersion}),error=>error.code==='INSTRUCTIONS_CHANGED');
  const fresh=reserve(second,user()).row;
  assert.equal(JSON.parse(fresh.snapshot).instructionsVersion,oldVersion+1);
  assert.equal(JSON.parse(fresh.snapshot).usageInstructions,'第二版统一使用说明');
  assert.equal(service.markPaid(service.orderRow(pending.order_no),'shared-late-'+stamp,900).review,true);
  assert.throws(()=>service.saveInstructions({...sharedCopy,usageInstructions:second.driveUrl,expectedVersion:oldVersion+1},'tester'),error=>error.code==='PRIVATE_LINK_IN_PUBLIC_TEXT');
  service.saveInstructions({...sharedCopy,expectedVersion:oldVersion+1},'tester');
});

test('assessment incomplete or unmigrated shared settings close new sales without blocking historical paid delivery',()=>{
  const row=product(),owner=user(),paid=reserve(row,owner).row;
  service.markPaid(paid,'shared-legacy-'+stamp,900);
  const abort=new Error('rollback shared settings fixture');
  assert.throws(()=>db.transaction(()=>{
    db.prepare("UPDATE assessment_shared_instructions SET usage_instructions='',version=0").run();
    assert.equal(service.getInstructions().configured,false);
    assert.equal(service.getProduct(row.id).purchaseEnabled,false);
    assert.deepEqual(service.getHome(),{enabled:false,items:[]});
    assert.throws(()=>service.saveProduct(row.id,{status:'active'},'tester'),error=>error.code==='SHARED_INSTRUCTIONS_REQUIRED');
    const draft=product([],{status:'draft'});assert.equal(draft.status,'draft');
    assert.throws(()=>reserve(row,user()),error=>error.code==='SHARED_INSTRUCTIONS_REQUIRED');
    assert.equal(service.createOrder(owner,{productId:row.id,idempotencyKey:'already-paid-owner'},'mock').alreadyPurchased,true);
    assert.equal(service.delivery(paid.order_no,owner).link,row.driveUrl);
    db.exec('ALTER TABLE assessment_shared_instructions RENAME TO fixture_shared_hidden');
    assert.throws(()=>service.getInstructions(),error=>error.status===503&&error.code==='ASSESSMENT_UNAVAILABLE');
    assert.throws(()=>service.getProduct(row.id),error=>error.status===503);
    assert.throws(()=>service.listProducts(),error=>error.status===503);
    assert.deepEqual(service.getHome(),{enabled:false,items:[]});
    assert.equal(service.delivery(paid.order_no,owner).link,row.driveUrl);
    assert.equal(service.createOrder(owner,{productId:row.id,idempotencyKey:'already-paid-owner'},'mock').alreadyPurchased,true);
    throw abort;
  })(),error=>error===abort);
});

test('assessment backend rejects private share URLs in public descriptions and image fields',()=>{
  const row=product([],{driveUrl:'https://example.com/private-share-id?pwd=secret'});
  const shareBase='https://example.com/private-share-id';
  for(const key of ['title','summary','description','catalogText','sourceDescription','seasonLabel','coverUrl','sampleImages']) {
    const value=key==='sampleImages'?[shareBase]:key==='coverUrl'?shareBase:'公开内容 '+shareBase;
    assert.throws(()=>service.saveProduct(row.id,{[key]:value},'tester'),error=>error.code==='PRIVATE_LINK_IN_PUBLIC_TEXT',key);
  }
  assert.throws(()=>service.saveProduct(row.id,{description:row.driveUrl},'tester'),error=>error.code==='PRIVATE_LINK_IN_PUBLIC_TEXT');
  const current=service.getInstructions();
  assert.throws(()=>service.saveInstructions({...sharedCopy,usageInstructions:shareBase,expectedVersion:current.version},'tester'),error=>error.code==='PRIVATE_LINK_IN_PUBLIC_TEXT');
  assert.equal(service.getProduct(row.id).description,'资料介绍');
});

test('assessment product publishing rejects invalid price, company input, XSS and incomplete delivery',()=>{
  const row=product();
  for(const change of [{priceCents:0},{priceCents:19.9},{priceCents:1990},{priceCents:2990},{priceCents:'900'},{companyIds:'1'},{title:'<img src=x onerror=alert(1)>'},{driveUrl:'javascript:alert(1)'},{driveName:''}]) {
    assert.throws(()=>service.saveProduct(row.id,change,'test-admin'),error=>error.status===400);
  }
  const publicData=service.getProduct(row.id);
  assert.equal(publicData.priceCents,900);
  for(const key of ['driveUrl','driveName','extractionCode','virtualProductId'])assert.equal(publicData[key],undefined);
});

test('assessment home degrades to hidden without migration and catalog returns a controlled unavailable response',()=>{
  const abort=new Error('rollback missing-schema simulation');
  assert.throws(()=>db.transaction(()=>{
    db.exec('ALTER TABLE assessment_products RENAME TO assessment_products_fixture_hidden');
    assert.deepEqual(service.getHome(),{enabled:false,items:[]});
    assert.throws(()=>service.listProducts(),error=>error.status===503);
    throw abort;
  })(),error=>error===abort);
  assert.equal(service.ready(),true);
});

test('assessment nine-yuan catalogue defaults on create, rejects admin/API price tampering and invoices exact cents',async()=>{
  const row=product([],{priceCents:undefined}),owner=user();
  assert.equal(service.PRICE_CENTS,900);assert.equal(row.priceCents,900);
  assert.throws(()=>service.saveProduct(row.id,{priceCents:1990},'tester'),error=>error.code==='INVALID_PRICE');
  assert.equal(service.getProduct(row.id,true).priceCents,900);
  const publicDetail=await http('/api/v4/assessment-products/'+row.id);
  assert.equal(publicDetail.body.data.product.priceCents,900);
  assert.throws(()=>service.createOrder(owner,payload(row,{expectedPriceCents:1990,amount:1990}),'mock'),error=>error.status===409&&error.code==='PRICE_CHANGED');
  const ordered=await http('/api/v4/assessment-orders',{userId:owner,method:'POST',body:payload(row,{amount:1,priceCents:1})});
  assert.equal(ordered.body.data.order.amount,900);assert.equal(ordered.body.data.payment.amount,900);
  const reserved=service.orderRow(ordered.body.data.order.orderNo);
  assert.equal(JSON.parse(reserved.snapshot).priceCents,900);
  assert.equal(service.markPaid(reserved,'wrong-nine-'+stamp,1990).ok,false);
  assert.equal(service.orderRow(reserved.order_no).status,'pending');
  assert.equal(service.markPaid(reserved,'paid-nine-'+stamp,900).ok,true);
  assert.equal(service.delivery(reserved.order_no,owner).link,row.driveUrl);
});

test('assessment refuses legacy non-nine-yuan checkout before the price migration has been applied',()=>{
  const row=product(),owner=user(),rollback=new Error('rollback legacy-price fixture');
  assert.throws(()=>db.transaction(()=>{
    db.prepare('UPDATE assessment_products SET price_cents=1990 WHERE id=?').run(row.id);
    assert.throws(()=>service.getProduct(row.id),error=>error.code==='PRODUCT_UNAVAILABLE');
    assert.equal(service.listProducts().items.some(item=>item.id===row.id),false);
    assert.throws(()=>service.createOrder(owner,payload(row,{expectedPriceCents:1990}),'mock'),error=>error.code==='PRODUCT_UNAVAILABLE');
    throw rollback;
  })(),error=>error===rollback);
  assert.equal(service.getProduct(row.id).priceCents,900);
});

test('assessment legacy 19.90-yuan closed orders retain real historical amounts and quarantine late money',()=>{
  const row=product(),owner=user(),pending=reserve(row,owner).row;
  const snapshot=JSON.stringify({...JSON.parse(pending.snapshot),priceCents:1990});
  db.prepare("UPDATE orders SET amount=1990,status='cancelled' WHERE order_no=?").run(pending.order_no);
  db.prepare('UPDATE assessment_order_details SET snapshot=? WHERE order_no=?').run(snapshot,pending.order_no);
  const legacy=service.orderRow(pending.order_no);
  assert.equal(service.markPaid(legacy,'legacy-incorrect-'+stamp,900).ok,false);
  assert.equal(service.markPaid(legacy,'legacy-late-'+stamp,1990).review,true);
  const current=service.orderRow(pending.order_no);
  assert.equal(current.status,'payment_review');assert.equal(current.amount,1990);
  assert.equal(current.snapshot,snapshot);assert.equal(current.delivery_status,null);
  assert.throws(()=>service.delivery(current.order_no,owner),error=>error.code==='DELIVERY_UNAVAILABLE');
  assert.equal(db.prepare("SELECT amount_delta FROM commerce_ledger_v4 WHERE order_no=? AND event_type='payment_confirmed'").pluck().get(current.order_no),1990);
});

test('assessment home has distinct company/product rows, operator order, filtering and empty disabled state',()=>{
  const cs=[company(),company(),company()];const ps=cs.map(c=>product([c]));
  assert.throws(()=>service.saveHome({enabled:true,items:[{companyId:cs[0],productId:ps[0].id},{companyId:cs[0],productId:ps[1].id}]},'tester'),error=>error.status===400);
  assert.throws(()=>service.saveHome({enabled:true,items:[{companyId:cs[1],productId:ps[0].id}]},'tester'),error=>error.status===400);
  service.saveHome({enabled:true,items:cs.map((c,i)=>({companyId:c,productId:ps[i].id,sortOrder:2-i}))},'tester');
  assert.deepEqual(service.getHome().items.map(x=>x.productId),ps.map(p=>p.id).reverse());
  assert.ok(service.getHome().items.every(item=>item.priceCents===900));
  assert.equal(service.listProducts({companyId:cs[0]}).items[0].id,ps[0].id);
  const page=service.listProducts({page:2,pageSize:1});assert.equal(page.items.length,1);assert.ok(page.total>1);assert.equal(page.page,2);
  assert.ok(service.listProducts({keyword:'测评测试公司'}).items.length>=3);
  service.saveProduct(ps[1].id,{status:'inactive'},'tester');
  assert.equal(service.getHome().items.length,2);
  service.saveHome({enabled:false,items:[]},'tester');
  assert.deepEqual(service.getHome(),{enabled:false,items:[]});
});

test('assessment order uses server price and reuses pending keys without leaking delivery',()=>{
  const row=product(), owner=user(), key=stamp+'fixed-key';
  assert.throws(()=>reserve(row,owner,{expectedPriceCents:1}),error=>error.code==='PRICE_CHANGED');
  const first=reserve(row,owner,{idempotencyKey:key,amount:1});
  const repeat=reserve(row,owner,{idempotencyKey:key});
  const otherKey=reserve(row,owner);
  assert.equal(first.row.amount,900);assert.equal(first.row.plan_id,-1);
  assert.equal(first.row.order_no,repeat.row.order_no);assert.equal(first.row.order_no,otherKey.row.order_no);
  assert.equal(JSON.stringify(service.orderView(first.row)).includes('secret'),false);
  assert.throws(()=>service.delivery(first.row.order_no,owner),error=>error.code==='DELIVERY_UNAVAILABLE');
  assert.throws(()=>service.orderRow(first.row.order_no,user()),error=>error.status===404);
});

test('assessment HTTP denies anonymous/invalid-owner/admin permissions and completes actual Mock payment flow',async()=>{
  const row=product(), owner=user(), stranger=user();
  assert.equal((await http('/api/v4/assessment-purchases')).response.status,401);
  assert.equal((await http('/api/v4/assessment-purchases',{authToken:token({role:'admin',permissions:['*']})})).response.status,401);
  assert.equal((await http('/admin/api/v4/assessment-products',{admin:['companies']})).response.status,403);
  assert.equal((await http('/admin/api/v4/assessment-products',{admin:['memberships']})).response.status,200);
  assert.equal((await http('/admin/api/v4/assessment-companies',{admin:['*']})).response.status,200);
  const created=await http('/api/v4/assessment-orders',{userId:owner,method:'POST',body:payload(row)});
  assert.equal(created.response.status,200);assert.equal(created.body.data.payment.provider,'mock');
  const orderNo=created.body.data.order.orderNo;
  assert.equal((await http('/api/v4/assessment-orders/'+orderNo,{userId:stranger})).response.status,404);
  assert.equal((await http('/api/payment/mock-confirm',{userId:stranger,method:'POST',body:{orderNo}})).response.status,404);
  const confirmed=await http('/api/payment/mock-confirm',{userId:owner,method:'POST',body:{orderNo}});
  assert.equal(confirmed.body.data.isMember,false);assert.equal(confirmed.body.data.grantType,'assessment');
  const delivered=await http('/api/v4/assessment-orders/'+orderNo+'/delivery',{userId:owner});
  assert.equal(delivered.body.data.link,row.driveUrl);assert.equal(delivered.response.headers.get('cache-control'),'no-store');
  assert.equal((await http('/api/v4/assessment-orders/'+orderNo+'/delivery',{userId:stranger})).response.status,404);
  const boughtAgain=await http('/api/v4/assessment-orders',{userId:owner,method:'POST',body:payload(row)});
  assert.equal(boughtAgain.body.data.alreadyPurchased,true);assert.equal(boughtAgain.body.data.order.orderNo,orderNo);
  const purchases=await http('/api/v4/assessment-purchases',{userId:owner});assert.equal(purchases.body.data.items.length,1);
  const verify=await http('/api/payment/verify/'+orderNo,{userId:owner});assert.equal(verify.body.data.isMember,false);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM entitlement_grants_v4 WHERE order_no=?').get(orderNo).n,0);
  assert.equal(db.prepare('SELECT vip_level FROM users WHERE id=?').get(owner).vip_level,0);
});

test('assessment callbacks enforce exact amount, unique transaction, idempotent ledger and refund revocation',async()=>{
  const row=product(),owner=user(),other=user();
  const first=reserve(row,owner).row,second=reserve(row,other).row;
  assert.equal(service.markPaid(first,'tx-'+stamp,1).ok,false);
  assert.equal(service.markPaid(first,'tx-'+stamp,900).ok,true);
  assert.equal(service.markPaid(service.orderRow(first.order_no),'tx-'+stamp,900).already,true);
  assert.equal(service.markPaid(service.orderRow(first.order_no),'different-tx',900).ok,false);
  assert.equal(service.markPaid(second,'tx-'+stamp,900).ok,false);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM commerce_ledger_v4 WHERE event_type='payment_confirmed' AND order_no=?").get(first.order_no).n,1);
  assert.equal((await http('/admin/api/v4/assessment-orders/'+first.order_no+'/refund-completed',{admin:['memberships'],method:'POST',body:{}})).response.status,400);
  const refund=await http('/admin/api/v4/assessment-orders/'+first.order_no+'/refund-completed',{admin:['memberships'],method:'POST',body:{confirmExternalRefund:true,externalReference:'test-external-receipt'}});
  assert.equal(refund.response.status,200);assert.equal(refund.body.data.order.status,'refunded');
  assert.throws(()=>service.delivery(first.order_no,owner),error=>error.status===409);
  assert.equal(service.markPaid(service.orderRow(first.order_no),'tx-'+stamp,900).ok,false);
  assert.equal(service.orderRow(first.order_no).delivery_status,'revoked');
});

test('assessment downsale cancels pending, paid snapshots persist and link corrections reach buyers',()=>{
  const row=product(), owner=user(), secondOwner=user();
  const first=reserve(row,owner).row;service.markPaid(first,'snapshot-'+stamp,900);
  const pending=reserve(row,secondOwner).row;
  service.saveProduct(row.id,{title:'新名称',status:'inactive',driveUrl:'https://example.com/corrected'},'tester');
  assert.equal(service.orderRow(pending.order_no).status,'cancelled');
  assert.equal(service.markPaid(service.orderRow(pending.order_no),'late-payment-'+stamp,900).review,true);
  assert.equal(service.orderRow(pending.order_no).status,'payment_review');
  assert.throws(()=>service.delivery(pending.order_no,secondOwner),error=>error.status===409);
  service.saveProduct(row.id,{status:'inactive'},'tester');
  const order=service.orderView(service.orderRow(first.order_no));assert.equal(order.title,row.title);assert.equal(order.priceCents,900);
  assert.equal(service.delivery(first.order_no,owner).link,'https://example.com/corrected');
  assert.equal(service.createOrder(owner,payload(row),'mock').alreadyPurchased,true);
});

test('assessment expiry and retry do not extend snapshotted claim term',()=>{
  const row=product([],{claimDays:1}),owner=user(),first=reserve(row,owner).row;
  service.markPaid(first,'expiry-'+stamp,900);
  const expiry=service.orderRow(first.order_no).expires_at;
  service.saveProduct(row.id,{claimDays:365},'tester');
  service.markPaid(service.orderRow(first.order_no),'expiry-'+stamp,900);
  assert.equal(service.orderRow(first.order_no).expires_at,expiry);
  db.prepare("UPDATE assessment_deliveries SET expires_at='2000-01-01T00:00:00.000Z' WHERE order_no=?").run(first.order_no);
  assert.throws(()=>service.delivery(first.order_no,owner),error=>error.status===410);
  const pending=reserve(product(),owner,{idempotencyKey:stamp+'-expired-pending'}).row;
  db.prepare("UPDATE orders SET created_at=datetime('now','-1 hour') WHERE order_no=?").run(pending.order_no);
  const pendingProduct=service.getProduct(pending.assessment_product_id,true);
  assert.throws(()=>reserve(pendingProduct,owner,{idempotencyKey:pending.idempotency_key}),error=>error.code==='ORDER_STALE');
  assert.equal(service.orderRow(pending.order_no).status,'cancelled');
});

test('assessment production cannot enable Mock checkout even with ENABLE_MOCK_PAYMENT=true',()=>{
  const script=`const r=require('./tests/helpers/isolatedTestRuntime.cjs');r.install();r.prepare();process.env.NODE_ENV='production';process.env.ENABLE_MOCK_PAYMENT='true';delete require.cache[require.resolve('./routes/payment')];const p=require('./routes/payment');p.createAssessmentPayment({user:{userId:1},body:{}},{id:999}).then(()=>process.exit(2),e=>process.exit(e.status===503?0:3));`;
  assert.doesNotThrow(()=>execFileSync(process.execPath,['-e',script],{cwd:require('node:path').join(__dirname,'..'),stdio:'pipe',timeout:30000}));
});

test('assessment virtual callback verifies signature, stored provider, product, quantity and amount',async()=>{
  const row=product([],{virtualProductId:'assessment-test-sku'}),owner=user();
  const reserved=service.createOrder(owner,payload(row),'virtual').row;
  const crypto=require('node:crypto'),timestamp=String(Math.floor(Date.now()/1000)),nonce='assessment-nonce';
  const signature=crypto.createHash('sha1').update(['assessment-test-notify',timestamp,nonce].sort().join('')).digest('hex');
  const path='/signed-payment/virtual-notify?'+new URLSearchParams({signature,timestamp,nonce});
  const notification={Event:'xpay_goods_deliver_notify',OutTradeNo:reserved.order_no,
    WeChatPayInfo:{PayAmount:900,TransactionId:'virtual-'+stamp},GoodsInfo:{ProductId:'assessment-test-sku',BuyQuantity:1}};
  assert.notEqual((await http('/signed-payment/virtual-notify',{method:'POST',body:notification})).body.ErrCode,0);
  assert.notEqual((await http(path,{method:'POST',body:{...notification,GoodsInfo:{ProductId:'wrong',BuyQuantity:1}}})).body.ErrCode,0);
  assert.notEqual((await http(path,{method:'POST',body:{...notification,GoodsInfo:{ProductId:'assessment-test-sku',BuyQuantity:2}}})).body.ErrCode,0);
  assert.notEqual((await http(path,{method:'POST',body:{...notification,WeChatPayInfo:{PayAmount:1,TransactionId:'virtual-'+stamp}}})).body.ErrCode,0);
  const mock=reserve(row,user()).row;
  assert.notEqual((await http(path,{method:'POST',body:{...notification,OutTradeNo:mock.order_no}})).body.ErrCode,0);
  assert.equal((await http(path,{method:'POST',body:notification})).body.ErrCode,0);
  assert.equal((await http(path,{method:'POST',body:notification})).body.ErrCode,0);
  assert.equal(service.orderRow(reserved.order_no).status,'paid');
});

test('assessment virtual callback accepts WeChat actual-price payload and mirrors XML response',async()=>{
  const row=product([],{virtualProductId:'wechat-notify-sku'}),owner=user();
  const reserved=service.createOrder(owner,payload(row),'virtual').row;
  const crypto=require('node:crypto'),timestamp=String(Math.floor(Date.now()/1000)),nonce='wechat-notify';
  const signature=crypto.createHash('sha1').update(['assessment-test-notify',timestamp,nonce].sort().join('')).digest('hex');
  const path='/signed-payment/virtual-notify?'+new URLSearchParams({signature,timestamp,nonce});
  const info={MchOrderNo:'wechat-merchant-'+stamp,TransactionId:'wechat-transaction-'+stamp};
  const goods={ProductId:'wechat-notify-sku',Quantity:1,ActualPrice:900,OrigPrice:900};
  const notification={Event:'xpay_goods_deliver_notify',OutTradeNo:reserved.order_no,
    OpenId:db.prepare('SELECT openid FROM users WHERE id=?').get(owner).openid,WeChatPayInfo:info,GoodsInfo:goods};
  assert.notEqual((await http(path,{method:'POST',body:{...notification,GoodsInfo:{...goods,ActualPrice:800}}})).body.ErrCode,0);
  assert.equal(service.orderRow(reserved.order_no).status,'pending');
  const xml='<xml>'+Object.entries(notification).map(([key,value])=>`<${key}><![CDATA[${typeof value==='object'?JSON.stringify(value):value}]]></${key}>`).join('')+'</xml>';
  const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'text/xml'},body:xml});
  assert.equal(response.status,200);
  assert.match(response.headers.get('content-type'),/xml/);
  assert.match(await response.text(),/<ErrCode><!\[CDATA\[0\]\]><\/ErrCode>/);
  const paid=service.orderRow(reserved.order_no);
  assert.equal(paid.status,'paid');
  assert.equal(paid.transaction_id,info.TransactionId);
  assert.equal(paid.wx_order_id,info.MchOrderNo);
  const again=await fetch(base+path,{method:'POST',headers:{'Content-Type':'text/xml'},body:xml});
  assert.match(await again.text(),/<ErrCode><!\[CDATA\[0\]\]><\/ErrCode>/);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM commerce_ledger_v4 WHERE order_no=? AND event_type='payment_confirmed'").get(reserved.order_no).n,1);
});

test('assessment wxpay callback validates provider signature, merchant, amount and refund late delivery',async()=>{
  const row=product(),owner=user(),reserved=service.createOrder(owner,payload(row),'wxpay').row;
  const crypto=require('node:crypto');
  const sign=body=>crypto.createHash('md5').update(Object.keys(body).filter(k=>k!=='sign').sort().map(k=>`${k}=${body[k]}`).join('&')+'&key=assessment-test-api-key').digest('hex').toUpperCase();
  const send=async change=>{
    const body={return_code:'SUCCESS',result_code:'SUCCESS',appid:'assessment-test-app',mch_id:'assessment-test-merchant',out_trade_no:reserved.order_no,total_fee:900,transaction_id:'wx-'+stamp,...change};body.sign=sign(body);
    const response=await fetch(base+'/signed-payment/notify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return response.text();
  };
  assert.match(await send({total_fee:1}),/FAIL/);assert.match(await send({mch_id:'wrong'}),/FAIL/);
  assert.match(await send({}),/SUCCESS/);assert.match(await send({}),/SUCCESS/);
  assert.equal(service.orderRow(reserved.order_no).status,'paid');
  const refund=commerce.requestRefund(owner,{orderNo:reserved.order_no,confirmRequest:true,reason:'test refund'});
  commerce.decideRefund(refund.refundNo,{status:'approved'},'tester');commerce.decideRefund(refund.refundNo,{status:'completed',confirmExternalRefund:true,externalReference:'test-wx-refund'},'tester');
  assert.match(await send({}),/FAIL/);assert.equal(service.orderRow(reserved.order_no).status,'refunded');
});

test('assessment closed orders acknowledge signed late money once, withhold delivery and support external refund',async()=>{
  const row=product([],{virtualProductId:'late-test-sku'}),owner=user();
  const pending=service.createOrder(owner,payload(row),'virtual').row;
  service.saveProduct(row.id,{status:'inactive'},'tester');assert.equal(service.orderRow(pending.order_no).status,'cancelled');
  const crypto=require('node:crypto'),timestamp=String(Math.floor(Date.now()/1000)),nonce='late-test';
  const signature=crypto.createHash('sha1').update(['assessment-test-notify',timestamp,nonce].sort().join('')).digest('hex');
  const path='/signed-payment/virtual-notify?'+new URLSearchParams({signature,timestamp,nonce});
  const body={Event:'xpay_goods_deliver_notify',OutTradeNo:pending.order_no,WeChatPayInfo:{PayAmount:900,TransactionId:'late-signed-'+stamp},GoodsInfo:{ProductId:'late-test-sku',BuyQuantity:1}};
  assert.equal((await http(path,{method:'POST',body})).body.ErrCode,0);
  assert.equal((await http(path,{method:'POST',body})).body.ErrCode,0);
  const current=service.orderRow(pending.order_no);assert.equal(current.status,'payment_review');assert.equal(current.delivery_status,null);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM commerce_ledger_v4 WHERE order_no=? AND event_type='payment_confirmed'").get(pending.order_no).n,1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM commerce_ledger_v4 WHERE order_no=? AND event_type='assessment_payment_review'").get(pending.order_no).n,1);
  assert.equal(service.orderView(current).deliveryStatus,'review');
  assert.equal(service.createOrder(owner,payload(service.getProduct(row.id)),'virtual').alreadyPurchased,true);
  assert.equal((await http('/admin/api/v4/assessment-orders/'+pending.order_no+'/retry-delivery',{admin:['memberships'],method:'POST',body:{}})).response.status,409);
  const refunded=await http('/admin/api/v4/assessment-orders/'+pending.order_no+'/refund-completed',{admin:['memberships'],method:'POST',body:{confirmExternalRefund:true,externalReference:'late-external-receipt'}});
  assert.equal(refunded.response.status,200);assert.equal(refunded.body.data.order.status,'refunded');
  assert.notEqual((await http(path,{method:'POST',body})).body.ErrCode,0);assert.equal(service.orderRow(pending.order_no).status,'refunded');
});

test('assessment purchases apply page, product filters and current ownership without refund truncation',async()=>{
  const owner=user(),rows=[product(),product(),product()];
  for(let i=0;i<rows.length;i++){const pending=reserve(rows[i],owner).row;service.markPaid(pending,`query-${i}-${stamp}`,900);}
  const first=await http('/api/v4/assessment-purchases?page=1&pageSize=1',{userId:owner});
  const second=await http('/api/v4/assessment-purchases?page=2&pageSize=1',{userId:owner});
  assert.equal(first.body.data.total,3);assert.equal(first.body.data.items.length,1);assert.equal(second.body.data.page,2);assert.notEqual(first.body.data.items[0].orderNo,second.body.data.items[0].orderNo);
  const scoped=await http('/api/v4/assessment-purchases?productId='+rows[0].id+'&ownedOnly=1',{userId:owner});assert.equal(scoped.body.data.total,1);assert.equal(scoped.body.data.items[0].productId,rows[0].id);
  const batch=await http('/api/v4/assessment-purchases?productIds='+rows.slice(0,2).map(r=>r.id).join(',')+'&ownedOnly=1',{userId:owner});assert.equal(batch.body.data.total,2);
  assert.equal((await http('/api/v4/assessment-purchases?productId=bad',{userId:owner})).response.status,400);
  assert.equal((await http('/api/v4/assessment-purchases?productIds='+Array(201).fill(1).join(','),{userId:owner})).response.status,400);
});

test('assessment pending, paid and refunded orders survive account deletion while old tokens cannot access orders',async()=>{
  for(const status of ['pending','paid','refunded']){
    const owner=user(),row=product(),pending=reserve(row,owner).row;
    if(status!=='pending')service.markPaid(pending,'delete-'+status+'-'+stamp,900);
    if(status==='refunded'){
      const refund=commerce.requestRefund(owner,{orderNo:pending.order_no,confirmRequest:true,reason:'test'});commerce.decideRefund(refund.refundNo,{status:'approved'},'tester');commerce.decideRefund(refund.refundNo,{status:'completed',confirmExternalRefund:true,externalReference:'deleted-test-refund'},'tester');
    }
    const deleted=await http('/api/users/me',{userId:owner,method:'DELETE'});assert.equal(deleted.response.status,200);
    assert.equal(db.prepare('SELECT id FROM users WHERE id=?').get(owner),undefined);
    assert.equal(service.orderRow(pending.order_no).status,status);
    for(const suffix of ['/api/v4/assessment-orders/'+pending.order_no,'/api/v4/assessment-orders/'+pending.order_no+'/delivery','/api/v4/assessment-purchases'])assert.equal((await http(suffix,{userId:owner})).response.status,401);
    if(status==='pending'){
      assert.equal(service.markPaid(service.orderRow(pending.order_no),'deleted-late-'+stamp,900).review,true);
      const refunded=await http('/admin/api/v4/assessment-orders/'+pending.order_no+'/refund-completed',{admin:['memberships'],method:'POST',body:{confirmExternalRefund:true,externalReference:'deleted-account-manual-refund'}});assert.equal(refunded.response.status,200);assert.equal(refunded.body.data.order.status,'refunded');
    }
  }
});

test('account deletion rolls back personal rows if final account deletion fails',async()=>{
  const owner=user();db.prepare('INSERT INTO messages(user_id,title,content) VALUES (?,?,?)').run(owner,'keep message','atomic');
  db.exec(`CREATE TRIGGER assessment_delete_failure BEFORE DELETE ON users WHEN OLD.id=${owner} BEGIN SELECT RAISE(ABORT,'fixture prevents delete'); END`);
  try{const result=await http('/api/users/me',{userId:owner,method:'DELETE'});assert.equal(result.response.status,500);assert.ok(db.prepare('SELECT id FROM users WHERE id=?').get(owner));assert.equal(db.prepare('SELECT COUNT(*) AS n FROM messages WHERE user_id=?').get(owner).n,1);}finally{db.exec('DROP TRIGGER assessment_delete_failure');}
});
