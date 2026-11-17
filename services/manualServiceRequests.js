'use strict';

const db = require('../db/database');

const CONSENT_VERSION = 1;
const SERVICES = Object.freeze({
  resume_optimization: {
    title: '简历优化',
    consentText: '我授权职引服务人员在本申请期限内查看我选择的简历内容，用于提供简历优化建议。授权最长 90 天，可随时撤销；不包含账号密码、验证码或代表我提交申请。'
  },
  manual_job_screening: {
    title: '人工筛岗',
    consentText: '我授权职引服务人员在本申请期限内查看我明确勾选的求职偏好、申请信息或简历，用于人工筛岗建议。授权最长 90 天，可随时撤销；不包含账号密码、验证码或代表我提交申请。'
  },
  application_assistance: {
    title: '申请协助',
    consentText: '我授权职引服务人员在本申请期限内查看我选择的简历和该条申请信息，用于提供网申准备建议。授权最长 90 天，可随时撤销；不包含账号密码、验证码或代替我向企业提交。'
  }
});
const SCOPE_LABELS = Object.freeze({
  resume_content: '所选简历内容',
  job_preferences: '求职偏好',
  application_details: '所选申请信息'
});
const STATUS_TRANSITIONS = Object.freeze({
  requested: ['accepted', 'rejected', 'closed'],
  accepted: ['in_progress', 'rejected', 'closed'],
  in_progress: ['accepted', 'delivered', 'closed'],
  delivered: ['closed'],
  rejected: [],
  closed: [],
  revoked: [],
  expired: []
});

function problem(code, message, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}
function cleanText(value, max = 1000) {
  return String(value || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}
function parseJson(value, fallback = []) {
  try { const parsed = JSON.parse(value); return parsed; } catch (_) { return fallback; }
}
function present(row, { admin = false } = {}) {
  if (!row) return null;
  const expired = row.status === 'expired' || Date.parse(`${String(row.expires_at).replace(' ', 'T')}Z`) <= Date.now();
  const revoked = row.status === 'revoked' || Boolean(row.revoked_at) || expired;
  const base = {
    id: row.id, serviceType: row.service_type, serviceTitle: SERVICES[row.service_type]?.title || '人工服务',
    applicationId: revoked ? null : row.application_id, resumeId: revoked ? null : row.resume_id,
    status: expired && row.status !== 'revoked' ? 'expired' : row.status, version: row.version,
    consentVersion: row.consent_version, consentedAt: row.consented_at, expiresAt: row.expires_at,
    revokedAt: row.revoked_at || null, createdAt: row.created_at, updatedAt: row.updated_at,
    revoked, orderNo: admin ? row.order_no || null : undefined,
    summary: revoked ? '' : row.request_summary,
    scopes: revoked ? [] : parseJson(row.scope_json),
    consentText: SERVICES[row.service_type]?.consentText || ''
  };
  if (!admin) delete base.orderNo;
  return base;
}

function expireRequests() {
  const tx = db.transaction(() => {
    const expired = db.prepare(`SELECT id,user_id,status,version FROM manual_service_requests_v4
      WHERE status NOT IN ('revoked','expired') AND expires_at<=datetime('now')`).all();
    for (const row of expired) {
      db.prepare(`UPDATE manual_service_requests_v4 SET status='expired',version=version+1,revoked_at=datetime('now'),
        request_summary='',scope_json='[]',resume_id=NULL,application_id=NULL,updated_at=datetime('now') WHERE id=? AND user_id=? AND version=?`)
        .run(row.id, row.user_id, row.version);
      db.prepare("UPDATE manual_service_deliveries_v4 SET summary='授权已结束，交付内容已隐藏',artifact_refs_json='[]' WHERE request_id=? AND user_id=?")
        .run(row.id,row.user_id);
      db.prepare(`INSERT INTO manual_service_request_events_v4
        (request_id,user_id,actor_type,actor_id,event_type,from_status,to_status,version,note)
        VALUES (?,?,'system','', 'consent_expired',?,'expired',?,'授权期限已结束，服务资料已清理')`)
        .run(row.id, row.user_id, row.status, row.version + 1);
    }
    return expired.length;
  });
  return tx.immediate();
}

function ownerApplication(userId, applicationId) {
  if (applicationId == null || applicationId === '') return null;
  const id = Number(applicationId);
  if (!Number.isSafeInteger(id) || id <= 0) throw problem('APPLICATION_INVALID', '申请记录无效');
  const row = db.prepare('SELECT id,user_id,v4_status FROM applications WHERE id=? AND user_id=?').get(id, userId);
  if (!row) throw problem('APPLICATION_NOT_FOUND', '申请记录不存在', 404);
  if (row.v4_status === 'withdrawn') throw problem('APPLICATION_ARCHIVED', '已归档申请不可授权服务', 409);
  return row;
}

function ownerResume(userId, resumeId) {
  if (resumeId == null || resumeId === '') return null;
  const id = Number(resumeId);
  if (!Number.isSafeInteger(id) || id <= 0) throw problem('RESUME_INVALID', '简历记录无效');
  const row = db.prepare('SELECT id,user_id FROM resumes WHERE id=? AND user_id=?').get(id, userId);
  if (!row) throw problem('RESUME_NOT_FOUND', '简历记录不存在', 404);
  return row;
}

function validateScopes(serviceType, scopes, resume, application) {
  if (!Array.isArray(scopes) || !scopes.length) throw problem('CONSENT_SCOPE_REQUIRED', '请先选择授权查看的资料范围');
  const unique = [...new Set(scopes)];
  if (unique.some(scope => !Object.hasOwn(SCOPE_LABELS, scope))) throw problem('CONSENT_SCOPE_INVALID', '授权范围无效');
  if (unique.includes('resume_content') && !resume) throw problem('RESUME_REQUIRED', '请先选择本人简历');
  if (unique.includes('application_details') && !application) throw problem('APPLICATION_REQUIRED', '请先选择本人申请');
  if (serviceType === 'resume_optimization' && (!resume || unique.length !== 1 || unique[0] !== 'resume_content')) {
    throw problem('CONSENT_SCOPE_INVALID', '简历优化仅能授权所选简历内容');
  }
  if (serviceType === 'application_assistance' && (!resume || !application
      || unique.length !== 2 || !unique.includes('resume_content') || !unique.includes('application_details'))) {
    throw problem('CONSENT_SCOPE_INVALID', '申请协助需同时选择本人简历和申请信息');
  }
  return unique.sort();
}

function create(userId, input = {}) {
  const serviceType = String(input.serviceType || '');
  if (!Object.hasOwn(SERVICES, serviceType)) throw problem('SERVICE_TYPE_INVALID', '服务类型无效');
  if (Number(input.consentVersion) !== CONSENT_VERSION || input.consentAccepted !== true) {
    throw problem('CONSENT_REQUIRED', '请阅读并确认当前版本的授权说明');
  }
  const clientKey=String(input.clientRequestKey||'');
  if(!/^[A-Za-z0-9_-]{8,80}$/.test(clientKey)) throw problem('CLIENT_KEY_INVALID','请求键无效');
  // A retry after revocation/expiry must only return the redacted tombstone.
  // Never recreate consent from a previously consumed key.
  const retired=db.prepare("SELECT * FROM manual_service_requests_v4 WHERE user_id=? AND client_request_key=? AND status IN ('revoked','expired')").get(userId,clientKey);
  if(retired) return { ...present(retired), idempotent:true };
  const days = input.durationDays === undefined ? 30 : Number(input.durationDays);
  if (!Number.isSafeInteger(days) || days < 1 || days > 90) throw problem('CONSENT_DURATION_INVALID', '授权期限需为 1 至 90 天');
  const resume = ownerResume(userId, input.resumeId);
  const application = ownerApplication(userId, input.applicationId);
  const scopes = validateScopes(serviceType, input.scopes, resume, application);
  const summary = cleanText(input.summary, 1000);
  const tx = db.transaction(() => {
    const existing=db.prepare('SELECT * FROM manual_service_requests_v4 WHERE user_id=? AND client_request_key=?').get(userId,clientKey);
    if(existing){
      const same=existing.service_type===serviceType&&existing.application_id===(application?.id||null)
        &&existing.resume_id===(resume?.id||null)&&existing.scope_json===JSON.stringify(scopes)
        &&existing.request_summary===summary&&existing.consent_version===CONSENT_VERSION;
      if(!same) throw problem('CLIENT_KEY_REUSED','该请求键已用于不同授权内容',409);
      return { ...present(existing), idempotent:true };
    }
    const result = db.prepare(`INSERT INTO manual_service_requests_v4
      (user_id,client_request_key,service_type,application_id,resume_id,request_summary,scope_json,consent_version,expires_at)
      VALUES (?,?,?,?,?,?,?,?,datetime('now', ?))`)
      .run(userId,clientKey, serviceType, application?.id || null, resume?.id || null, summary,
        JSON.stringify(scopes), CONSENT_VERSION, `+${days} days`);
    const row = db.prepare('SELECT * FROM manual_service_requests_v4 WHERE id=? AND user_id=?').get(result.lastInsertRowid, userId);
    db.prepare(`INSERT INTO manual_service_request_events_v4
      (request_id,user_id,actor_type,actor_id,event_type,from_status,to_status,version,note)
      VALUES (?,?,'user',?,'created','',?,1,'用户确认授权并创建工单')`).run(row.id, userId, String(userId), row.status);
    return { ...present(row), idempotent:false };
  });
  return tx.immediate();
}

function listMine(userId) {
  expireRequests();
  return db.prepare('SELECT * FROM manual_service_requests_v4 WHERE user_id=? ORDER BY id DESC LIMIT 100')
    .all(userId).map(row => present(row));
}
function getMine(userId, id) {
  expireRequests();
  const row = db.prepare('SELECT * FROM manual_service_requests_v4 WHERE id=? AND user_id=?').get(Number(id), userId);
  if (!row) throw problem('REQUEST_NOT_FOUND', '服务工单不存在', 404);
  const events = db.prepare(`SELECT event_type AS eventType,from_status AS fromStatus,to_status AS toStatus,
    version,note,created_at AS createdAt FROM manual_service_request_events_v4
    WHERE request_id=? AND user_id=? ORDER BY id`).all(row.id, userId);
  const deliveries = row.status === 'revoked' || row.status === 'expired' ? [] : db.prepare(`SELECT id,summary,artifact_refs_json AS refs,created_at AS createdAt
    FROM manual_service_deliveries_v4 WHERE request_id=? AND user_id=? ORDER BY id`).all(row.id,userId)
    .map(item => ({ id:item.id, summary:item.summary, artifactRefs:parseJson(item.refs), createdAt:item.createdAt }));
  return { request: present(row), events, deliveries };
}
function revoke(userId, id, expectedVersion) {
  const version = Number(expectedVersion);
  if (!Number.isSafeInteger(version) || version < 1) throw problem('VERSION_REQUIRED', '缺少工单版本', 428);
  expireRequests();
  const tx = db.transaction(() => {
    const row = db.prepare('SELECT * FROM manual_service_requests_v4 WHERE id=? AND user_id=?').get(Number(id),userId);
    if (!row) throw problem('REQUEST_NOT_FOUND', '服务工单不存在',404);
    if (row.version !== version) throw problem('VERSION_CONFLICT', '工单已更新，请刷新后重试',409);
    if (row.status === 'revoked' || row.status === 'expired') return present(row);
    db.prepare(`UPDATE manual_service_requests_v4 SET status='revoked',version=version+1,revoked_at=datetime('now'),
      request_summary='',scope_json='[]',resume_id=NULL,application_id=NULL,updated_at=datetime('now')
      WHERE id=? AND user_id=? AND version=?`).run(row.id,userId,version);
    db.prepare(`INSERT INTO manual_service_request_events_v4
      (request_id,user_id,actor_type,actor_id,event_type,from_status,to_status,version,note)
      VALUES (?,?,'user',?,'consent_revoked',?,'revoked',?,'用户撤销授权，服务资料已清理')`)
      .run(row.id,userId,String(userId),row.status,version+1);
    db.prepare("UPDATE manual_service_deliveries_v4 SET summary='授权已撤销，交付内容已隐藏',artifact_refs_json='[]' WHERE request_id=? AND user_id=?")
      .run(row.id,userId);
    return present(db.prepare('SELECT * FROM manual_service_requests_v4 WHERE id=?').get(row.id));
  });
  return tx.immediate();
}

function assertAdminVisible(row) {
  if (!row) throw problem('REQUEST_NOT_FOUND', '服务工单不存在',404);
  if (row.status === 'revoked' || row.status === 'expired' || Date.parse(`${String(row.expires_at).replace(' ', 'T')}Z`) <= Date.now()) {
    throw problem('CONSENT_INACTIVE', '授权已撤销或到期，资料不可继续访问',409);
  }
}
function listAdmin({ status = '', serviceType = '', limit = 50 } = {}) {
  expireRequests();
  const safeLimit = Math.min(100,Math.max(1,Number(limit)||50));
  const clauses = ["status NOT IN ('revoked','expired')", "expires_at>datetime('now')"];
  const args=[];
  if (status && STATUS_TRANSITIONS[status]) { clauses.push('status=?'); args.push(status); }
  if (serviceType && Object.hasOwn(SERVICES,serviceType)) { clauses.push('service_type=?'); args.push(serviceType); }
  return db.prepare(`SELECT * FROM manual_service_requests_v4 WHERE ${clauses.join(' AND ')} ORDER BY id DESC LIMIT ?`)
    .all(...args,safeLimit).map(row=>present(row,{admin:true}));
}
function getAdmin(id) {
  expireRequests();
  const row=db.prepare('SELECT * FROM manual_service_requests_v4 WHERE id=?').get(Number(id));
  assertAdminVisible(row);
  const events=db.prepare(`SELECT actor_type AS actorType,actor_id AS actorId,event_type AS eventType,
    from_status AS fromStatus,to_status AS toStatus,version,note,created_at AS createdAt
    FROM manual_service_request_events_v4 WHERE request_id=? ORDER BY id`).all(row.id);
  const deliveries=db.prepare(`SELECT id,summary,artifact_refs_json AS refs,created_at AS createdAt
    FROM manual_service_deliveries_v4 WHERE request_id=? ORDER BY id`).all(row.id)
    .map(item=>({id:item.id,summary:item.summary,artifactRefs:parseJson(item.refs),createdAt:item.createdAt}));
  return { request:present(row,{admin:true}),events,deliveries };
}
function adminTransition(id, payload, actorId) {
  const expected=Number(payload.expectedVersion);
  if(!Number.isSafeInteger(expected)||expected<1) throw problem('VERSION_REQUIRED','缺少工单版本',428);
  const to=String(payload.status||'');
  const note=cleanText(payload.note,500);
  const tx=db.transaction(()=>{
    const row=db.prepare('SELECT * FROM manual_service_requests_v4 WHERE id=?').get(Number(id));
    assertAdminVisible(row);
    if(row.version!==expected) throw problem('VERSION_CONFLICT','工单已更新，请刷新后重试',409);
    if(!(STATUS_TRANSITIONS[row.status]||[]).includes(to)) throw problem('INVALID_TRANSITION','工单状态不能这样变更',409);
    db.prepare(`UPDATE manual_service_requests_v4 SET status=?,version=version+1,updated_at=datetime('now')
      WHERE id=? AND version=?`).run(to,row.id,expected);
    db.prepare(`INSERT INTO manual_service_request_events_v4
      (request_id,user_id,actor_type,actor_id,event_type,from_status,to_status,version,note)
      VALUES (?,?,'admin',?,'status_changed',?,?,?,?)`).run(row.id,row.user_id,cleanText(actorId,120),row.status,to,expected+1,note);
    return present(db.prepare('SELECT * FROM manual_service_requests_v4 WHERE id=?').get(row.id),{admin:true});
  });
  return tx.immediate();
}
function addDelivery(id, payload, actorId) {
  const expected=Number(payload.expectedVersion);
  if(!Number.isSafeInteger(expected)||expected<1) throw problem('VERSION_REQUIRED','缺少工单版本',428);
  const summary=cleanText(payload.summary,2000);
  if(!summary) throw problem('DELIVERY_SUMMARY_REQUIRED','请填写交付摘要');
  const refs=Array.isArray(payload.artifactRefs)?[...new Set(payload.artifactRefs.map(value=>Number(value)).filter(value=>Number.isSafeInteger(value)&&value>0))].slice(0,10):[];
  const tx=db.transaction(()=>{
    const row=db.prepare('SELECT * FROM manual_service_requests_v4 WHERE id=?').get(Number(id));
    assertAdminVisible(row);
    if(row.version!==expected) throw problem('VERSION_CONFLICT','工单已更新，请刷新后重试',409);
    if(!['accepted','in_progress'].includes(row.status)) throw problem('INVALID_DELIVERY_STATE','当前工单不能交付',409);
    if(refs.length&&!parseJson(row.scope_json).includes('resume_content'))
      throw problem('DELIVERY_SCOPE_DENIED','当前授权未包含简历文件引用',403);
    // Artifact references must be existing files owned by the request user; no files are copied.
    for(const ref of refs){
      const owned=db.prepare('SELECT id FROM resume_pdfs WHERE id=? AND user_id=?').get(ref,row.user_id);
      if(!owned) throw problem('ARTIFACT_NOT_OWNED','交付附件引用不属于用户',404);
    }
    db.prepare(`INSERT INTO manual_service_deliveries_v4(request_id,user_id,admin_id,summary,artifact_refs_json)
      VALUES (?,?,?,?,?)`).run(row.id,row.user_id,cleanText(actorId,120),summary,JSON.stringify(refs));
    db.prepare(`UPDATE manual_service_requests_v4 SET status='delivered',version=version+1,updated_at=datetime('now')
      WHERE id=? AND version=?`).run(row.id,expected);
    db.prepare(`INSERT INTO manual_service_request_events_v4
      (request_id,user_id,actor_type,actor_id,event_type,from_status,to_status,version,note)
      VALUES (?,?,'admin',?,'delivery_added',?,'delivered',?,'服务交付已登记')`)
      .run(row.id,row.user_id,cleanText(actorId,120),row.status,expected+1);
    return present(db.prepare('SELECT * FROM manual_service_requests_v4 WHERE id=?').get(row.id),{admin:true});
  });
  return tx.immediate();
}

module.exports={CONSENT_VERSION,SERVICES,SCOPE_LABELS,STATUS_TRANSITIONS,create,listMine,getMine,revoke,listAdmin,getAdmin,adminTransition,addDelivery,expireRequests,problem};
