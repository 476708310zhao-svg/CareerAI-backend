'use strict';

const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const os=require('node:os');
const root=path.resolve(process.env.MANUAL_SERVICE_FIXTURE_ROOT||'');
assert.ok(process.env.MANUAL_SERVICE_FIXTURE_ROOT);
assert.equal(path.dirname(root),path.resolve(os.tmpdir()));
assert.match(path.basename(root),/^jobapp-manual-service-[A-Za-z0-9_-]+$/);
Object.assign(process.env,{WEB_TEST_ISOLATED:'1',DB_PATH:path.join(root,'db','manual.db'),DATA_DIR:path.join(root,'data'),UPLOAD_DIR:path.join(root,'uploads'),JWT_SECRET:'manual_service_fixture_only',ANALYTICS_DATA_CLASS:'test'});

const express=require('express');
const jwt=require('jsonwebtoken');
const db=require('../../db/database');
const {applyPendingMigrations}=require('../../db/migrate');
require('../../routes/payment');
require('../../routes/aggregate');
require('../../routes/oa');
require('../../db/v4Schema').ensureV4Schema();
applyPendingMigrations(db);
const owner=Number(db.prepare("INSERT INTO users(openid,nickname) VALUES ('manual_owner','Owner')").run().lastInsertRowid);
const other=Number(db.prepare("INSERT INTO users(openid,nickname) VALUES ('manual_other','Other')").run().lastInsertRowid);
const userToken=id=>jwt.sign({userId:id},process.env.JWT_SECRET);
const adminToken=permissions=>jwt.sign({role:'admin',sub:'fixture-admin',permissions},process.env.JWT_SECRET);
function resume(userId){return Number(db.prepare('INSERT INTO resumes(user_id,name,data) VALUES (?,?,?)').run(userId,'Resume','{}').lastInsertRowid);}
const ownResume=resume(owner);const foreignResume=resume(other);
function application(userId){return Number(db.prepare(`INSERT INTO applications(user_id,job_id,job_snapshot,status,status_text,v4_status,progress_status)
 VALUES (?,'manual-job','{}','pending','准备中','preparing','online_apply')`).run(userId).lastInsertRowid);}
const ownApplication=application(owner);const foreignApplication=application(other);

const app=express();app.use(express.json());app.use('/api/v4/manual-services',require('../../routes/v4/manual-services'));
app.use('/admin/api/v4/manual-services',require('../../routes/admin-manual-services'));
let server,base;
before(async()=>{server=await new Promise(resolve=>{const value=app.listen(0,'127.0.0.1',()=>resolve(value));});base=`http://127.0.0.1:${server.address().port}`;});
after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));if(db.open)db.close();});
async function call(route,method='GET',body,token=userToken(owner)){
 const response=await fetch(`${base}${route}`,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 return {status:response.status,body:await response.json()};
}
const user='/api/v4/manual-services';const admin='/admin/api/v4/manual-services';
function createBody(overrides={}){return {serviceType:'resume_optimization',resumeId:ownResume,scopes:['resume_content'],consentVersion:1,consentAccepted:true,durationDays:30,clientRequestKey:'manual-key-0001',summary:'帮助检查简历结构',...overrides};}

test('consent text is versioned and explicit; create is bounded, owner checked and idempotent',async()=>{
 const consent=await call(`${user}/consent`);assert.equal(consent.status,200);assert.equal(consent.body.data.version,1);assert.equal(consent.body.data.defaultDurationDays,30);assert.equal(consent.body.data.maxDurationDays,90);
 assert.equal((await call(user,'POST',createBody({consentAccepted:false}))).status,400);
 assert.equal((await call(user,'POST',createBody({consentVersion:0}))).status,400);
 assert.equal((await call(user,'POST',createBody({durationDays:91,clientRequestKey:'manual-key-0002'}))).status,400);
 assert.equal((await call(user,'POST',createBody({resumeId:foreignResume,clientRequestKey:'manual-key-0003'}))).status,404);
 assert.equal((await call(user,'POST',createBody({applicationId:foreignApplication,serviceType:'application_assistance',scopes:['resume_content','application_details'],clientRequestKey:'manual-key-0004'}))).status,404);
 const created=await call(user,'POST',createBody());assert.equal(created.status,201,JSON.stringify(created.body));
 assert.equal(created.body.data.durationDays,undefined);assert.equal(created.body.data.scopes[0],'resume_content');assert.equal(created.body.data.idempotent,false);
 assert.match(created.body.data.expiresAt,/\d{4}-\d\d-\d\d/);
 const retry=await call(user,'POST',createBody());assert.equal(retry.status,201);assert.equal(retry.body.data.id,created.body.data.id);assert.equal(retry.body.data.idempotent,true);
 assert.equal((await call(user,'POST',createBody({summary:'different',clientRequestKey:'manual-key-0001'}))).status,409);
 assert.equal((await call(user,'GET',undefined,userToken(other))).body.data.list.length,0);
});

test('admin permission and state CAS protect service work; delivery is auditable and user revocation redacts it',async()=>{
 const form=createBody({serviceType:'manual_job_screening',resumeId:null,scopes:['job_preferences'],clientRequestKey:'manual-key-0005'});
 const created=await call(user,'POST',form);assert.equal(created.status,201,JSON.stringify(created.body));const id=created.body.data.id;
 assert.equal((await call(admin)).status,401);
 assert.equal((await call(admin,'GET',undefined,adminToken(['dashboard']))).status,403);
 const list=await call(admin,'GET',undefined,adminToken(['manualServices']));assert.equal(list.status,200);assert.ok(list.body.data.list.some(item=>item.id===id));
 const accepted=await call(`${admin}/${id}/status`,'PATCH',{status:'accepted',expectedVersion:1,note:'已受理'},adminToken(['manualServices']));assert.equal(accepted.status,200,JSON.stringify(accepted.body));
 assert.equal((await call(`${admin}/${id}/status`,'PATCH',{status:'in_progress',expectedVersion:1},adminToken(['manualServices']))).status,409);
 const started=await call(`${admin}/${id}/status`,'PATCH',{status:'in_progress',expectedVersion:2},adminToken(['manualServices']));assert.equal(started.status,200);
 const delivered=await call(`${admin}/${id}/deliveries`,'POST',{expectedVersion:3,summary:'筛岗建议已整理',artifactRefs:[]},adminToken(['manualServices']));assert.equal(delivered.status,201,JSON.stringify(delivered.body));
 const detail=await call(`${user}/${id}`);assert.equal(detail.status,200);assert.equal(detail.body.data.deliveries[0].summary,'筛岗建议已整理');assert.equal(detail.body.data.events.length,4);
 const revoked=await call(`${user}/${id}/revoke`,'POST',{expectedVersion:4});assert.equal(revoked.status,200);assert.equal(revoked.body.data.status,'revoked');assert.equal(revoked.body.data.summary,'');assert.deepEqual(revoked.body.data.scopes,[]);
 const retiredRetry=await call(user,'POST',form);assert.equal(retiredRetry.status,201);assert.equal(retiredRetry.body.data.id,id);assert.equal(retiredRetry.body.data.status,'revoked');assert.equal(retiredRetry.body.data.idempotent,true);assert.equal(retiredRetry.body.data.summary,'');
 const redacted=await call(`${user}/${id}`);assert.equal(redacted.body.data.deliveries.length,0);assert.equal(redacted.body.data.request.applicationId,null);
 const adminRead=await call(`${admin}/${id}`,'GET',undefined,adminToken(['manualServices']));assert.equal(adminRead.status,409);
 assert.equal(db.prepare('SELECT summary,artifact_refs_json FROM manual_service_deliveries_v4 WHERE request_id=?').get(id).summary,'授权已撤销，交付内容已隐藏');
 assert.equal(db.prepare('SELECT COUNT(*) AS count FROM manual_service_request_events_v4 WHERE request_id=?').get(id).count,5);
});

test('application-assistance consent requires both owned resume and application; revocation/expiry blocks later admin work',async()=>{
 const missing=await call(user,'POST',createBody({serviceType:'application_assistance',scopes:['resume_content','application_details'],clientRequestKey:'manual-key-0006'}));assert.equal(missing.status,400);
 const created=await call(user,'POST',createBody({serviceType:'application_assistance',applicationId:ownApplication,scopes:['resume_content','application_details'],clientRequestKey:'manual-key-0007'}));assert.equal(created.status,201,JSON.stringify(created.body));
 const id=created.body.data.id;
 db.prepare("UPDATE manual_service_requests_v4 SET expires_at=datetime('now','-1 day') WHERE id=?").run(id);
 const detail=await call(`${user}/${id}`);assert.equal(detail.status,200,JSON.stringify(detail.body));assert.equal(detail.body.data.request.status,'expired');assert.equal(detail.body.data.request.resumeId,null);
 assert.equal((await call(`${admin}/${id}/status`,'PATCH',{status:'accepted',expectedVersion:2},adminToken(['manualServices']))).status,409);
 const badScopes=await call(user,'POST',createBody({serviceType:'application_assistance',applicationId:ownApplication,scopes:['resume_content','application_details','job_preferences'],clientRequestKey:'manual-key-0008'}));assert.equal(badScopes.status,400);
});

test('failed audit insert rolls back service request creation',async()=>{
 db.exec(`CREATE TRIGGER reject_manual_event BEFORE INSERT ON manual_service_request_events_v4 BEGIN SELECT RAISE(ABORT,'no audit'); END;`);
 const response=await call(user,'POST',createBody({clientRequestKey:'manual-key-0009'}));assert.equal(response.status,500);
 assert.equal(db.prepare("SELECT COUNT(*) AS count FROM manual_service_requests_v4 WHERE client_request_key='manual-key-0009'").get().count,0);
 db.exec('DROP TRIGGER reject_manual_event');
});
