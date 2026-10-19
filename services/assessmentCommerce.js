'use strict';
const crypto = require('crypto');
const db = require('../db/database');
const commerce = require('./v4Commerce');
const analytics = require('./v4Analytics');
const PRICE_CENTS = 900;
const instructionFields = { usageInstructions:'usage_instructions', claimInstructions:'claim_instructions',
  updateInstructions:'update_instructions', afterSalesInstructions:'after_sales_instructions' };

function problem(code, message, status = 400) { return Object.assign(new Error(message), { code, status }); }
function ready() { return !!db.prepare("SELECT 1 FROM sqlite_master WHERE name='assessment_products'").get(); }
function requireReady() { if (!ready()) throw problem('ASSESSMENT_UNAVAILABLE', '测评资料正在准备中', 503); }
function json(value, fallback) { try { return JSON.parse(value); } catch (_) { return fallback; } }
function text(value, max = 10000) {
  const result = String(value == null ? '' : value).trim();
  if (result.length > max || /<\/?[a-z][^>]*>|javascript\s*:/i.test(result)) throw problem('INVALID_TEXT', '内容格式不正确');
  return result;
}
function getInstructions() {
  requireReady();
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE name='assessment_shared_instructions'").get()) throw problem('ASSESSMENT_UNAVAILABLE','测评资料正在更新，请稍后再试',503);
  const row = db.prepare('SELECT * FROM assessment_shared_instructions WHERE id=1').get();
  if (!row) throw problem('ASSESSMENT_UNAVAILABLE','测评资料正在更新，请稍后再试',503);
  const result = { version:row.version, updatedAt:row.updated_at };
  Object.entries(instructionFields).forEach(([key,column])=>{result[key]=row[column];});
  result.configured = row.version > 0 && Object.keys(instructionFields).every(key=>!!result[key]);
  return result;
}
function requireInstructions() {
  const instructions=getInstructions();
  if (!instructions.configured) throw problem('SHARED_INSTRUCTIONS_REQUIRED','统一购买说明尚未配置完整，暂不可上架或购买',503);
  return instructions;
}
function containsPrivateLink(values,driveUrl) {
  if(!driveUrl)return false;
  const references=[driveUrl];
  try {const share=new URL(driveUrl);share.searchParams.delete('pwd');share.hash='';references.push(share.toString());}catch(_){/* URL validation is performed before product save. */}
  return values.some(value=>references.some(reference=>String(value).includes(reference)));
}
function saveInstructions(payload,actor) {
  return db.transaction(()=>{
    const previous=getInstructions();
    if (!Number.isSafeInteger(payload.expectedVersion) || payload.expectedVersion!==previous.version) throw problem('INSTRUCTIONS_CHANGED','统一说明已更新，请重新加载后确认',409);
    if(Object.keys(instructionFields).some(key=>typeof payload[key]!=='string')) throw problem('INVALID_TEXT','统一说明必须填写纯文本');
    const values=Object.keys(instructionFields).map(key=>text(payload[key],20000));
    if (values.some(value=>!value)) throw problem('REQUIRED_FIELDS','请一次填写使用、领取、更新和售后四项统一说明');
    const privateLinks=db.prepare("SELECT drive_url FROM assessment_products WHERE drive_url<>''").all();
    if (privateLinks.some(row=>containsPrivateLink(values,row.drive_url))) throw problem('PRIVATE_LINK_IN_PUBLIC_TEXT','统一说明不可包含私有网盘链接');
    db.prepare(`UPDATE assessment_shared_instructions SET usage_instructions=?,claim_instructions=?,update_instructions=?,after_sales_instructions=?,version=version+1,updated_by=?,updated_at=datetime('now') WHERE id=1`).run(...values,String(actor||'admin'));
    db.prepare("UPDATE orders SET status='cancelled' WHERE status='pending' AND order_no IN (SELECT order_no FROM assessment_order_details)").run();
    db.prepare('INSERT INTO assessment_product_audit(product_id,actor_id,action) VALUES (0,?,?)').run(String(actor||'admin'),`shared_instructions_updated:v${previous.version+1}`);
    return getInstructions();
  }).immediate();
}
function url(value, optional = false) {
  const result = text(value, 2000);
  if (!result && optional) return '';
  if (result.startsWith('/uploads/') && !result.includes('..')) return result;
  try { const parsed = new URL(result); if (parsed.protocol === 'https:' && !parsed.username && !parsed.password) return result; } catch (_) { /* invalid URL */ }
  throw problem('INVALID_URL', '请填写有效的 HTTPS 链接');
}
function id(value) { const n = Number(value); if (!Number.isSafeInteger(n) || n < 1) throw problem('INVALID_ID', '无效编号'); return n; }
function pagination(query) {
  const p=Number(query.page),s=Number(query.pageSize);
  return {page:Number.isFinite(p)?Math.min(1000000,Math.max(1,Math.floor(p))):1,pageSize:Number.isFinite(s)&&s>0?Math.min(200,Math.max(1,Math.floor(s))):200};
}
function companyRows(productId) {
  return db.prepare(`SELECT c.id,c.display_name AS name,c.logo_url AS logo FROM companies c JOIN assessment_product_companies pc ON pc.company_id=c.id WHERE pc.product_id=? ORDER BY c.id`).all(productId);
}
function purchaseEnabled(row, instructions, paymentAvailability) {
  // The public router injects the checkout's actual capability; service-only callers fail closed.
  return instructions.configured && row.status === 'active' && row.price_cents === PRICE_CENTS
    && typeof paymentAvailability === 'function'
    && paymentAvailability({ virtualProductId: row.virtual_product_id }).available === true;
}
function productView(row, admin = false, paymentAvailability) {
  const companies = companyRows(row.id);
  const result = { id: row.id, productId: row.id, title: row.title, coverUrl: row.cover_url,
    summary: row.summary, description: row.description, catalogText: row.catalog_text,
    sampleImages: json(row.sample_images, []), seasonLabel: row.season_label, priceCents: row.price_cents,
    status: row.status, sortOrder: row.sort_order, companies, companyIds: companies.map(c => c.id),
    sourceDescription: row.source_description, claimDays: row.claim_days,
    deliveryMethod: '网盘链接交付', updatedAt: row.updated_at };
  if (admin) Object.assign(result, { driveName: row.drive_name, driveUrl: row.drive_url,
    extractionCode: row.extraction_code, virtualProductId: row.virtual_product_id });
  if (!admin) {
    const instructions=getInstructions();
    Object.keys(instructionFields).forEach(key=>{result[key]=instructions[key];});
    result.instructionsVersion=instructions.version;
    result.purchaseEnabled=purchaseEnabled(row,instructions,paymentAvailability);
  }
  return result;
}
function listProducts(query = {}, admin = false, paymentAvailability) {
  requireReady();
  if (!admin) getInstructions();
  const conditions = admin ? ['1=1'] : ["p.status='active'", `p.price_cents=${PRICE_CENTS}`];
  const args = [];
  if (query.keyword) {
    conditions.push('(p.title LIKE ? OR EXISTS (SELECT 1 FROM assessment_product_companies pc JOIN companies c ON c.id=pc.company_id WHERE pc.product_id=p.id AND c.display_name LIKE ?))');
    const term = `%${text(query.keyword, 100).replace(/[\\%_]/g, '')}%`; args.push(term, term);
  }
  if (query.companyId) { conditions.push('EXISTS (SELECT 1 FROM assessment_product_companies pc WHERE pc.product_id=p.id AND pc.company_id=?)'); args.push(id(query.companyId)); }
  if (admin && query.status) { conditions.push('p.status=?'); args.push(text(query.status, 20)); }
  const {page,pageSize}=pagination(query);
  const total=db.prepare(`SELECT COUNT(*) AS total FROM assessment_products p WHERE ${conditions.join(' AND ')}`).get(...args).total;
  const rows = db.prepare(`SELECT p.* FROM assessment_products p WHERE ${conditions.join(' AND ')} ORDER BY p.sort_order,p.id DESC LIMIT ? OFFSET ?`).all(...args,pageSize,(page-1)*pageSize);
  return { items: rows.map(row => productView(row, admin, paymentAvailability)), total,page,pageSize };
}
function getProduct(productId, admin = false, paymentAvailability) {
  requireReady();
  const row = db.prepare('SELECT * FROM assessment_products WHERE id=?').get(id(productId));
  if (!row || (!admin && row.status === 'draft')) throw problem('PRODUCT_NOT_FOUND', '资料不存在', 404);
  if (!admin && row.price_cents !== PRICE_CENTS) throw problem('PRODUCT_UNAVAILABLE', '资料正在更新，请稍后再试', 503);
  return productView(row, admin, paymentAvailability);
}
const mappings = { title:'title', coverUrl:'cover_url', summary:'summary', description:'description',
  catalogText:'catalog_text', seasonLabel:'season_label', sourceDescription:'source_description',
  driveName:'drive_name', driveUrl:'drive_url', extractionCode:'extraction_code', virtualProductId:'virtual_product_id' };
function saveProduct(productId, payload, actor) {
  requireReady();
  const sharedInstructions=getInstructions();
  const old = productId ? getProduct(productId, true) : {};
  const merged = { ...old, ...payload };
  const values = {};
  Object.entries(mappings).forEach(([key, column]) => { values[column] = text(merged[key], ['title','summary'].includes(key) ? 200 : 20000); });
  values.cover_url = url(merged.coverUrl);
  values.drive_url = url(merged.driveUrl, true);
  if(containsPrivateLink(Object.keys(instructionFields).map(key=>sharedInstructions[key]),values.drive_url)) throw problem('PRIVATE_LINK_IN_PUBLIC_TEXT','统一说明不可包含私有网盘链接');
  if (values.drive_url.startsWith('/')) throw problem('INVALID_URL', '网盘地址必须使用 HTTPS');
  if (payload.priceCents !== undefined && payload.priceCents !== PRICE_CENTS) throw problem('INVALID_PRICE', '测评资料统一售价为 9 元（900 分）');
  values.price_cents = PRICE_CENTS;
  values.status = merged.status || 'draft';
  if (!['draft','active','inactive'].includes(values.status)) throw problem('INVALID_STATUS', '商品状态无效');
  values.sort_order = Number(merged.sortOrder || 0);
  if (!Number.isSafeInteger(values.sort_order)) throw problem('INVALID_SORT', '排序必须为整数');
  values.claim_days = merged.claimDays == null || merged.claimDays === '' ? null : Number(merged.claimDays);
  if (values.claim_days !== null && (!Number.isSafeInteger(values.claim_days) || values.claim_days < 1 || values.claim_days > 36500)) throw problem('INVALID_CLAIM_DAYS', '领取天数无效');
  if (!Array.isArray(merged.sampleImages || [])) throw problem('INVALID_IMAGES', '示例图必须为数组');
  values.sample_images = JSON.stringify((merged.sampleImages || []).slice(0, 12).map(v => url(v)));
  const publicValues=['title','summary','description','catalog_text','season_label','source_description','cover_url'].map(key=>values[key]);
  publicValues.push(...json(values.sample_images,[]));
  if(containsPrivateLink(publicValues,values.drive_url)) throw problem('PRIVATE_LINK_IN_PUBLIC_TEXT','公开介绍、封面和示例图不可包含私有网盘链接，请移至网盘交付配置');
  if (!Array.isArray(merged.companyIds || [])) throw problem('INVALID_COMPANIES','关联公司必须为数组');
  const companyIds = [...new Set((merged.companyIds || []).map(id))];
  companyIds.forEach(companyId => { if (!db.prepare('SELECT id FROM companies WHERE id=?').get(companyId)) throw problem('COMPANY_NOT_FOUND', '关联公司不存在'); });
  if (!values.title || !values.summary) throw problem('REQUIRED_FIELDS', '名称和简介必填');
  if (values.status === 'active') {
    requireInstructions();
    if (['description','catalog_text','drive_name','drive_url','source_description'].some(k => !values[k])) throw problem('PUBLISH_FIELDS_REQUIRED', '上架前请补齐资料、网盘与来源说明');
  }
  values.updated_by = String(actor || 'admin');
  const savedId = db.transaction(() => {
    let target = productId && id(productId);
    const columns = Object.keys(values);
    if (target) db.prepare(`UPDATE assessment_products SET ${columns.map(c => `${c}=?`).join(',')},updated_at=datetime('now') WHERE id=?`).run(...Object.values(values), target);
    else target = Number(db.prepare(`INSERT INTO assessment_products (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`).run(...Object.values(values)).lastInsertRowid);
    db.prepare('DELETE FROM assessment_product_companies WHERE product_id=?').run(target);
    companyIds.forEach(companyId => db.prepare('INSERT INTO assessment_product_companies(product_id,company_id) VALUES (?,?)').run(target, companyId));
    if (productId && (old.priceCents !== values.price_cents || old.virtualProductId !== values.virtual_product_id || values.status !== 'active')) db.prepare(`UPDATE orders SET status='cancelled' WHERE status='pending' AND order_no IN (SELECT order_no FROM assessment_order_details WHERE product_id=?)`).run(target);
    db.prepare('INSERT INTO assessment_product_audit(product_id,actor_id,action) VALUES (?,?,?)').run(target, values.updated_by, productId ? 'updated' : 'created');
    return target;
  })();
  return getProduct(savedId, true);
}
function getHome(admin = false, paymentAvailability) {
  if (!ready()) return { enabled: false, items: [] };
  if (!admin) { try { if(!getInstructions().configured) return {enabled:false,items:[]}; } catch(error) { if(error.code==='ASSESSMENT_UNAVAILABLE') return {enabled:false,items:[]}; throw error; } }
  const config = db.prepare('SELECT * FROM assessment_home_config WHERE id=1').get();
  if (!config) return { enabled: false, items: [] };
  if (admin) return { enabled: !!config.enabled, items: json(config.items, []) };
  if (!config.enabled) return { enabled: false, items: [] };
  const companies = new Set(), products = new Set(), items = [];
  for (const entry of json(config.items, []).sort((a,b) => a.sortOrder-b.sortOrder)) {
    const row = db.prepare(`SELECT p.*,c.display_name AS company_name,c.logo_url AS company_logo FROM assessment_products p JOIN assessment_product_companies pc ON pc.product_id=p.id JOIN companies c ON c.id=pc.company_id WHERE p.id=? AND c.id=? AND p.status='active' AND p.price_cents=?`).get(entry.productId, entry.companyId, PRICE_CENTS);
    if (!row || companies.has(entry.companyId) || products.has(row.id)) continue;
    companies.add(entry.companyId); products.add(row.id);
    items.push({ productId: row.id, companyId: entry.companyId, companyName: row.company_name,
      companyLogo: row.company_logo, title: row.title, summary: row.summary, seasonLabel: row.season_label,
      priceCents: row.price_cents, position: items.length + 1,
      purchaseEnabled: purchaseEnabled(row,getInstructions(),paymentAvailability) });
    if (items.length === 3) break;
  }
  return { enabled: true, items };
}
function saveHome(payload, actor) {
  requireReady();
  if (typeof payload.enabled !== 'boolean' || !Array.isArray(payload.items) || payload.items.length > 3) throw problem('INVALID_HOME_CONFIG', '最多配置三家公司资料');
  const cs = new Set(), ps = new Set();
  const items = payload.items.map((entry, index) => {
    const companyId = id(entry.companyId), productId = id(entry.productId);
    if (cs.has(companyId) || ps.has(productId)) throw problem('DUPLICATE_HOME_ITEM', '公司和资料不可重复');
    const product = getProduct(productId);
    if (product.status !== 'active' || !product.companyIds.includes(companyId)) throw problem('INVALID_HOME_PRODUCT', '主推资料必须在售且关联所选公司');
    cs.add(companyId); ps.add(productId);
    return { companyId, productId, sortOrder: Number.isFinite(Number(entry.sortOrder)) ? Number(entry.sortOrder) : index };
  });
  db.prepare(`INSERT INTO assessment_home_config(id,enabled,items,updated_by) VALUES (1,?,?,?) ON CONFLICT(id) DO UPDATE SET enabled=excluded.enabled,items=excluded.items,updated_by=excluded.updated_by,updated_at=datetime('now')`).run(payload.enabled ? 1 : 0, JSON.stringify(items), String(actor || 'admin'));
  return getHome(true);
}
function orderRow(orderNo, userId) {
  requireReady();
  const row = db.prepare(`SELECT o.*,a.product_id AS assessment_product_id,a.snapshot,a.idempotency_key,d.status AS delivery_status,d.expires_at FROM orders o JOIN assessment_order_details a ON a.order_no=o.order_no LEFT JOIN assessment_deliveries d ON d.order_no=o.order_no WHERE o.order_no=?${userId ? ' AND o.user_id=?' : ''}`).get(...(userId ? [orderNo,userId] : [orderNo]));
  if (!row) throw problem('ORDER_NOT_FOUND', '订单不存在', 404);
  return row;
}
function orderView(row,admin=false) {
  const snapshot = json(row.snapshot, {});
  return { ...(admin?{userId:row.user_id}:{}),orderNo: row.order_no, productId: row.assessment_product_id, title: snapshot.title || row.plan_name,
    coverUrl: snapshot.coverUrl || '', amount: row.amount, priceCents: row.amount,
    status: row.status, provider: row.provider, createdAt: row.created_at, paidAt: row.paid_at,
    deliveryStatus: row.status === 'refunded' ? 'revoked' : row.status === 'payment_review' ? 'review' : row.delivery_status || 'pending', expiresAt: row.expires_at || null };
}
function createOrder(userId, payload, provider) {
  requireReady();
  const productId = id(payload.productId), key = text(payload.idempotencyKey, 100);
  if (key.length < 8) throw problem('IDEMPOTENCY_KEY_REQUIRED', '请提供有效的防重复键');
  const result = db.transaction(() => {
    const purchased = db.prepare(`SELECT o.order_no FROM orders o JOIN assessment_order_details a ON a.order_no=o.order_no WHERE a.user_id=? AND a.product_id=? AND o.status IN ('paid','payment_review') ORDER BY o.id DESC LIMIT 1`).get(userId, productId);
    if (purchased) return { row: orderRow(purchased.order_no,userId), alreadyPurchased: true };
    const product = getProduct(productId, true);
    const instructions=requireInstructions();
    if (product.status !== 'active') throw problem('PRODUCT_UNAVAILABLE', '资料已下架，暂不可购买', 409);
    if (product.priceCents !== PRICE_CENTS) throw problem('PRODUCT_UNAVAILABLE', '资料正在更新，请稍后再试', 503);
    if (Number(payload.expectedPriceCents) !== product.priceCents) throw problem('PRICE_CHANGED', '价格已更新，请刷新后确认', 409);
    if (!Number.isSafeInteger(payload.expectedInstructionsVersion) || payload.expectedInstructionsVersion!==instructions.version) throw problem('INSTRUCTIONS_CHANGED','购买说明已更新，请刷新详情确认后再购买',409);
    const keyed = db.prepare('SELECT order_no,product_id FROM assessment_order_details WHERE user_id=? AND idempotency_key=?').get(userId, key);
    if (keyed && keyed.product_id !== productId) throw problem('IDEMPOTENCY_CONFLICT', '防重复键已用于其他商品', 409);
    let pending = keyed && orderRow(keyed.order_no, userId);
    if (pending && pending.status !== 'pending') throw problem('ORDER_STALE', '订单已失效，请刷新后重试', 409);
    if (!pending) {
      const existing = db.prepare(`SELECT o.order_no FROM orders o JOIN assessment_order_details a ON a.order_no=o.order_no WHERE a.user_id=? AND a.product_id=? AND o.status='pending' AND o.amount=? AND o.provider=? AND o.created_at>datetime('now','-30 minutes') ORDER BY o.id DESC LIMIT 1`).get(userId, productId, product.priceCents, provider);
      if (existing) pending = orderRow(existing.order_no,userId);
    }
    if (pending && Date.now()-Date.parse(pending.created_at+'Z') < 30*60000 && pending.amount === product.priceCents && pending.provider === provider) return { row: pending, reused: true };
    if (pending) { db.prepare("UPDATE orders SET status='cancelled' WHERE order_no=? AND status='pending'").run(pending.order_no); return {stale:true}; }
    const companyId = payload.companyId ? id(payload.companyId) : null;
    if (companyId && !product.companyIds.includes(companyId)) throw problem('INVALID_SOURCE_COMPANY', '来源公司未关联该商品');
    db.prepare(`UPDATE orders SET status='cancelled' WHERE status='pending' AND order_no IN (SELECT order_no FROM assessment_order_details WHERE user_id=? AND product_id=?)`).run(userId,productId);
    const orderNo = `AS${userId.toString(36)}${Date.now().toString(36)}${crypto.randomBytes(5).toString('hex')}`.slice(0,32);
    const snapshot = { title:product.title,coverUrl:product.coverUrl,priceCents:product.priceCents,claimDays:product.claimDays,
      claimInstructions:instructions.claimInstructions,usageInstructions:instructions.usageInstructions,updateInstructions:instructions.updateInstructions,
      afterSalesInstructions:instructions.afterSalesInstructions,instructionsVersion:instructions.version,virtualProductId:product.virtualProductId };
    db.prepare('INSERT INTO orders(order_no,user_id,plan_id,plan_name,amount,provider) VALUES (?,?,-1,?,?,?)').run(orderNo,userId,product.title,product.priceCents,provider);
    db.prepare('INSERT INTO assessment_order_details(order_no,product_id,user_id,snapshot,idempotency_key,source,source_company_id) VALUES (?,?,?,?,?,?,?)').run(orderNo,productId,userId,JSON.stringify(snapshot),key,text(payload.source,80),companyId);
    commerce.recordLedger({idempotencyKey:`order-created:${orderNo}`,eventType:'order_created',userId,orderNo,planCode:`assessment:${productId}`,metadata:{productId,provider}});
    analytics.track(userId,'assessment_order_created',{orderNo,productId,amount:product.priceCents,provider,source:text(payload.source,80),companyId},'/api/v4/assessment-orders');
    return {row:orderRow(orderNo,userId),reused:false};
  }).immediate();
  if (result.stale) throw problem('ORDER_STALE','订单已失效，请刷新后重试',409);
  return result;
}
function isAssessmentOrder(order) { return order && Number(order.plan_id) === -1; }
function markPaid(order, transactionId, paidAmount, extra = {}) {
  if (!Number.isSafeInteger(paidAmount) || paidAmount !== order.amount) return {ok:false,status:400,message:'金额不匹配'};
  if (!['pending','paid','cancelled','payment_review'].includes(order.status)) return {ok:false,status:409,message:'订单已退款或状态无效'};
  return db.transaction(() => {
    const row = orderRow(order.order_no), snapshot = json(row.snapshot,{});
    if (!['pending','paid','cancelled','payment_review'].includes(row.status)) return {ok:false,status:409,message:'订单已退款或状态无效'};
    if (!transactionId || (row.transaction_id && row.transaction_id !== transactionId) || db.prepare('SELECT order_no FROM orders WHERE transaction_id=? AND provider=? AND order_no<>?').get(transactionId,row.provider,row.order_no)) return {ok:false,status:409,message:'支付交易号无效或重复'};
    const ledgerUserId=db.prepare('SELECT id FROM users WHERE id=?').get(row.user_id) ? row.user_id : null;
    const review=['cancelled','payment_review'].includes(row.status)||(!ledgerUserId&&row.status==='pending');
    const already = ['paid','payment_review'].includes(row.status);
    if (!already) db.prepare("UPDATE orders SET status=?,transaction_id=?,paid_at=datetime('now'),wx_order_id=?,raw_notify=? WHERE order_no=? AND status IN ('pending','cancelled')").run(review?'payment_review':'paid',transactionId || '',extra.wxOrderId || '',extra.rawNotify || '',order.order_no);
    commerce.recordLedger({idempotencyKey:`payment-confirmed:${order.order_no}`,eventType:'payment_confirmed',userId:ledgerUserId,orderNo:order.order_no,planCode:`assessment:${row.assessment_product_id}`,amountDelta:order.amount,metadata:{provider:order.provider,productId:row.assessment_product_id,requiresReview:review}});
    if(review) {
      const recorded=commerce.recordLedger({idempotencyKey:`assessment-payment-review:${order.order_no}`,eventType:'assessment_payment_review',userId:ledgerUserId,orderNo:order.order_no,planCode:`assessment:${row.assessment_product_id}`,metadata:{reason:ledgerUserId?'received_after_order_closed':'account_deleted',transactionId,previousStatus:row.status}});
      if(recorded.created) analytics.track(ledgerUserId,'assessment_payment_review',{orderNo:order.order_no,productId:row.assessment_product_id,amount:order.amount,provider:order.provider},'/api/payment/notify');
      return {ok:true,already,review:true,orderStatus:'payment_review',isMember:false,grantType:'assessment',planCode:`assessment:${row.assessment_product_id}`};
    }
    const paid = db.prepare('SELECT paid_at FROM orders WHERE order_no=?').get(order.order_no);
    const expiry = snapshot.claimDays ? new Date(Date.parse(paid.paid_at+'Z')+snapshot.claimDays*86400000).toISOString() : null;
    const delivered=db.prepare("INSERT OR IGNORE INTO assessment_deliveries(order_no,status,expires_at) VALUES (?,'ready',?)").run(order.order_no,expiry);
    commerce.recordLedger({idempotencyKey:`assessment-delivered:${order.order_no}`,eventType:'assessment_delivered',userId:ledgerUserId,orderNo:order.order_no,planCode:`assessment:${row.assessment_product_id}`});
    if(!already) analytics.track(ledgerUserId,'assessment_payment_confirmed',{orderNo:order.order_no,productId:row.assessment_product_id,amount:order.amount,provider:order.provider},'/api/payment/notify');
    if(delivered.changes) analytics.track(ledgerUserId,'assessment_delivery_ready',{orderNo:order.order_no,productId:row.assessment_product_id},'/api/payment/notify');
    return {ok:true,already,isMember:false,grantType:'assessment',planCode:`assessment:${row.assessment_product_id}`};
  }).immediate();
}
function delivery(orderNo, userId) {
  const row = orderRow(orderNo,userId);
  if (row.status !== 'paid' || row.delivery_status !== 'ready') throw problem('DELIVERY_UNAVAILABLE','该订单暂不可领取',409);
  if (row.expires_at && Date.parse(row.expires_at) <= Date.now()) throw problem('DELIVERY_EXPIRED','领取期限已结束',410);
  const product = getProduct(row.assessment_product_id,true), snapshot = json(row.snapshot,{});
  if (!product.driveUrl) throw problem('DELIVERY_CONFIG_MISSING','已付款，资料领取暂不可用，请联系客服',503);
  return {orderNo,title:snapshot.title,driveName:product.driveName,link:product.driveUrl,extractionCode:product.extractionCode,
    usageInstructions:snapshot.usageInstructions,expiresAt:row.expires_at || null};
}
function listOrders(query = {}, userId) {
  requireReady();
  const where = [], args = [];
  if (userId) { where.push('o.user_id=?',String(query.ownedOnly)==='1'?"o.status IN ('paid','payment_review')":"o.status IN ('paid','payment_review','refunded')"); args.push(userId); }
  else {
    if (query.keyword) { where.push('(o.order_no LIKE ? OR o.plan_name LIKE ? OR CAST(o.user_id AS TEXT)=?)'); const term=text(query.keyword,100); args.push('%'+term+'%','%'+term+'%',term); }
    if (query.status) {where.push('o.status=?');args.push(text(query.status,20));}
    if (query.userId) {where.push('o.user_id=?');args.push(id(query.userId));}
  }
  if (query.productId) {where.push('a.product_id=?');args.push(id(query.productId));}
  if(query.productIds!==undefined) {
    const selected=Array.isArray(query.productIds)?query.productIds:String(query.productIds).split(',');
    if(!selected.length||selected.length>200) throw problem('INVALID_PRODUCT_FILTER','每次最多查询200个资料商品');
    const productIds=[...new Set(selected.map(id))];where.push(`a.product_id IN (${productIds.map(()=>'?').join(',')})`);args.push(...productIds);
  }
  const {page,pageSize}=pagination(query);
  const filter=where.length?'WHERE '+where.join(' AND '):'';
  const total=db.prepare(`SELECT COUNT(*) AS total FROM orders o JOIN assessment_order_details a ON a.order_no=o.order_no ${filter}`).get(...args).total;
  const rows=db.prepare(`SELECT o.order_no FROM orders o JOIN assessment_order_details a ON a.order_no=o.order_no ${filter} ORDER BY o.id DESC LIMIT ? OFFSET ?`).all(...args,pageSize,(page-1)*pageSize);
  return {items:rows.map(r=>orderView(orderRow(r.order_no,userId),!userId)),total,page,pageSize};
}
function revokeDelivery(orderNo) { if (ready()) db.prepare("UPDATE assessment_deliveries SET status='revoked',updated_at=datetime('now') WHERE order_no=?").run(orderNo); }
module.exports = {PRICE_CENTS,ready,problem,getInstructions,saveInstructions,getProduct,listProducts,saveProduct,getHome,saveHome,orderRow,orderView,createOrder,isAssessmentOrder,markPaid,delivery,listOrders,revokeDelivery};
